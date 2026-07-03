import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, saveGlobalConfig } from "./config.js";
import type { ConductorConfig } from "./config.js";
import { delegates } from "./delegates/registry.js";
import { formatDecision, routeTask } from "./routing.js";
import { shouldBlockToolCall } from "./safety.js";

const HELP_TEXT = [
	"Conductor commands:",
	"- /conductor status",
	"- /conductor setup",
	"- /conductor route <task>",
	"- /conductor instant <simple plan mentioning one file>",
	"- /conductor fast <small semantic task>",
	"- /conductor research <task>",
	"- /conductor normal <implementation plan>",
	"- /conductor plan <task + optional research brief>",
	"- /conductor strict on|off",
].join("\n");
const instantResultText = (result: { blockedReason?: string; finalOutput: string; stderr: string }): string =>
	result.blockedReason ?? (result.finalOutput || result.stderr || "Instant delegate finished without output.");

const modelId = (model: { provider: string; id: string }) => `${model.provider}/${model.id}`;
const fileFromPlan = (plan: string, config: ConductorConfig): string => routeTask(plan, config, true).signals.mentionedFiles[0] ?? "";

async function chooseDelegateModel(ctx: { modelRegistry: { getAvailable(): Array<{ provider: string; id: string; name?: string }> }; ui: { select(title: string, options: string[]): Promise<string | undefined>; notify(message: string, level?: "info" | "warning" | "error" | "success"): void } }, config: ConductorConfig) {
	const models = ctx.modelRegistry.getAvailable();
	if (models.length === 0) {
		ctx.ui.notify("No configured Pi models found. Use /login or configure models first, then run /conductor setup.", "warning");
		return undefined;
	}

	const inherit = "Inherit current Pi default";
	const choices = [inherit, ...models.map((model) => `${modelId(model)}${model.name ? ` — ${model.name}` : ""}`)];
	const selected = await ctx.ui.select("Choose the base delegate model (fast/research/normal inherit it)", choices);
	if (!selected) return undefined;

	const model = selected === inherit ? "" : selected.split(" — ")[0];
	return {
		...config,
		delegateFlows: {
			...config.delegateFlows,
			instant: { ...config.delegateFlows.instant, model, thinking: "off" },
			fast: { ...config.delegateFlows.fast, model: "", thinking: "low" },
			research: { ...config.delegateFlows.research, model: "", thinking: "minimal" },
			normal: { ...config.delegateFlows.normal, model: "", thinking: "medium" },
			planner: { ...config.delegateFlows.planner, thinking: config.delegateFlows.planner.thinking },
		},
	};
}

export default function conductorExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		const flow = config.delegateFlows.instant;
		ctx.ui.setStatus("conductor", `instant/fast/research/normal/planner: ${flow.model || "default"} ${config.strictMode ? "strict" : ""}`.trim());
	});

	pi.on("tool_call", async (event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		const reason = shouldBlockToolCall(event, config, ctx.cwd);
		if (reason) return { block: true, reason };
	});

	pi.registerCommand("conductor", {
		description: "Route coding workflow tasks through Conductor delegate flows",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed || trimmed === "help") {
				ctx.ui.notify(HELP_TEXT, "info");
				return;
			}

			const [subcommand, ...rest] = trimmed.split(/\s+/);
			const body = rest.join(" ").trim();
			const { config, paths } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const flow = config.delegateFlows.instant;
			const fastFlow = config.delegateFlows.fast;
			const researchFlow = config.delegateFlows.research;
			const normalFlow = config.delegateFlows.normal;
			const plannerFlow = config.delegateFlows.planner;

			switch (subcommand) {
				case "status":
				case "config":
					ctx.ui.notify([
						"Conductor flows: instant, fast, research, normal, planner.",
						`Strict mode: ${config.strictMode ? "on" : "off"}`,
						`Base delegate model: ${flow.model || "inherit current Pi default"}`,
						`Planner model: ${plannerFlow.model || "inherit current Pi default"}`,
						`Instant: model ${flow.model || "default"}; thinking ${flow.thinking}; tools ${flow.tools.join(", ")}; limit ${flow.maxFiles} file, ~${flow.maxEstimatedLines} lines`,
						`Fast: model ${fastFlow.model || "default"}; thinking ${fastFlow.thinking}; tools ${fastFlow.tools.join(", ")}; limit ${fastFlow.maxFiles} files, ~${fastFlow.maxEstimatedLines} lines`,
						`Research: model ${researchFlow.model || "default"}; thinking ${researchFlow.thinking}; tools ${researchFlow.tools.join(", ")}; read budget ${researchFlow.maxFiles} files`,
						`Normal: model ${normalFlow.model || "default"}; thinking ${normalFlow.thinking}; tools ${normalFlow.tools.join(", ")}; limit ${normalFlow.maxFiles} files, ~${normalFlow.maxEstimatedLines} lines`,
						`Planner: thinking ${plannerFlow.thinking}; tools ${plannerFlow.tools.join(", ")}; verification read budget ${plannerFlow.maxFiles} files`,
						`Config paths: ${paths.length > 0 ? paths.join(", ") : "defaults only"}`,
					].join("\n"), "info");
					return;

				case "setup": {
					const updated = await chooseDelegateModel(ctx, config);
					if (!updated) return;
					const path = await saveGlobalConfig(updated);
					const instant = updated.delegateFlows.instant;
					ctx.ui.setStatus("conductor", `instant/fast/research/normal/planner: ${instant.model || "default"} ${updated.strictMode ? "strict" : ""}`.trim());
					ctx.ui.notify(`Base delegate model ${instant.model || "will inherit the current Pi default"}; fast/research/normal inherit it by default with low/minimal/medium thinking. Planner inherits the current Pi default unless configured separately. Saved ${path}`, "info");
					return;
				}

				case "route": {
					if (!body) {
						ctx.ui.notify("Usage: /conductor route <task>", "warning");
						return;
					}
					ctx.ui.notify(formatDecision(routeTask(body, config)), "info");
					return;
				}

				case "instant": {
					if (!body) {
						ctx.ui.notify("Usage: /conductor instant <simple plan mentioning one file>", "warning");
						return;
					}
					const result = await delegates.instant.run({ plan: body, file: fileFromPlan(body, config) }, config, {
						cwd: ctx.cwd,
						projectTrusted: ctx.isProjectTrusted(),
						signal: ctx.signal,
					});
					ctx.ui.notify(instantResultText(result), result.exitCode === 0 && !result.blockedReason ? "info" : "warning");
					return;
				}

				case "fast": {
					if (!body) {
						ctx.ui.notify("Usage: /conductor fast <small semantic task>", "warning");
						return;
					}
					const result = await delegates.fast.run({ plan: body }, config, {
						cwd: ctx.cwd,
						projectTrusted: ctx.isProjectTrusted(),
						signal: ctx.signal,
					});
					ctx.ui.notify(instantResultText(result), result.exitCode === 0 && !result.blockedReason ? "info" : "warning");
					return;
				}

				case "research": {
					if (!body) {
						ctx.ui.notify("Usage: /conductor research <task>", "warning");
						return;
					}
					const result = await delegates.research.run({ plan: body }, config, {
						cwd: ctx.cwd,
						projectTrusted: ctx.isProjectTrusted(),
						signal: ctx.signal,
					});
					ctx.ui.notify(instantResultText(result), result.exitCode === 0 && !result.blockedReason ? "info" : "warning");
					return;
				}

				case "normal": {
					if (!body) {
						ctx.ui.notify("Usage: /conductor normal <implementation plan>", "warning");
						return;
					}
					const result = await delegates.normal.run({ plan: body }, config, {
						cwd: ctx.cwd,
						projectTrusted: ctx.isProjectTrusted(),
						signal: ctx.signal,
					});
					ctx.ui.notify(instantResultText(result), result.exitCode === 0 && !result.blockedReason ? "info" : "warning");
					return;
				}

				case "plan":
				case "planner": {
					if (!body) {
						ctx.ui.notify("Usage: /conductor plan <task + optional research brief>", "warning");
						return;
					}
					const result = await delegates.planner.run({ plan: body }, config, {
						cwd: ctx.cwd,
						projectTrusted: ctx.isProjectTrusted(),
						signal: ctx.signal,
					});
					ctx.ui.notify(instantResultText(result), result.exitCode === 0 && !result.blockedReason ? "info" : "warning");
					return;
				}

				case "strict": {
					const desired = body.toLowerCase();
					if (desired !== "on" && desired !== "off") {
						ctx.ui.notify("Usage: /conductor strict on|off", "warning");
						return;
					}
					const path = await saveGlobalConfig({ ...config, strictMode: desired === "on" });
					ctx.ui.setStatus("conductor", `instant/fast/research/normal/planner: ${flow.model || "default"} strict ${desired}`);
					ctx.ui.notify(`Conductor strict mode ${desired}; saved ${path}`, "info");
					return;
				}

				default:
					ctx.ui.notify(HELP_TEXT, "warning");
			}
		},
	});

	pi.registerTool({
		name: "conductor_delegate",
		label: "Instant Conductor Delegate",
		description: "Run the instant delegate flow for one tiny, exact code edit from a cockpit-supplied plan.",
		promptSnippet: "Run an instant delegate flow",
		promptGuidelines: [
			"Use conductor_delegate only after the cockpit has a concrete one-file plan for a tiny, low-risk edit.",
			"Always pass the exact file, and pass line when known, so the instant delegate does not discover scope.",
			"Do not use conductor_delegate for security, persistence, deployment, architecture, or ambiguous product decisions.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("instant", { description: "Only instant is supported" })),
			plan: Type.String({ description: "Simple cockpit plan for the instant delegate to execute" }),
			file: Type.String({ description: "The single file the instant delegate may read/edit" }),
			line: Type.Optional(Type.Number({ description: "Target line number when the cockpit knows it" })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const result = await delegates.instant.run({ plan: params.plan, file: params.file, line: params.line }, config, {
				cwd: ctx.cwd,
				projectTrusted: ctx.isProjectTrusted(),
				signal,
				onUpdate,
			});

			return {
				content: [{ type: "text", text: instantResultText(result) }],
				details: result,
				isError: result.exitCode !== 0 || Boolean(result.blockedReason),
			};
		},
	});

	pi.registerTool({
		name: "conductor_fast",
		label: "Fast Conductor Delegate",
		description: "Run the fast delegate flow for a small semantic task with local discovery and low thinking.",
		promptSnippet: "Run a fast delegate flow",
		promptGuidelines: [
			"Use conductor_fast for small semantic tasks where the delegate should discover local context itself, such as building a codemap.",
			"Keep the cockpit prompt compact; do not pre-scan the project in the main chat.",
			"Do not use conductor_fast for risky security, persistence, deployment, or broad refactor decisions.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("fast", { description: "Only fast is supported" })),
			plan: Type.String({ description: "Small semantic task for the fast delegate" }),
			outputFile: Type.Optional(Type.String({ description: "Primary output file; defaults to CODEMAP.md" })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const result = await delegates.fast.run({ plan: params.plan, outputFile: params.outputFile }, config, {
				cwd: ctx.cwd,
				projectTrusted: ctx.isProjectTrusted(),
				signal,
				onUpdate,
			});

			return {
				content: [{ type: "text", text: instantResultText(result) }],
				details: result,
				isError: result.exitCode !== 0 || Boolean(result.blockedReason),
			};
		},
	});

	pi.registerTool({
		name: "conductor_research",
		label: "Research Conductor Delegate",
		description: "Run the read-only research delegate to produce a concise codebase brief for planner handoff, with optional web context when available.",
		promptSnippet: "Run a research delegate flow",
		promptGuidelines: [
			"Use conductor_research as Node 1 before planning/coding when the planner needs codebase context.",
			"Pass the user task compactly; the delegate will inspect local code first and use web only for relevant external contracts.",
			"Treat the returned brief as evidence for the planner, not as absolute ground truth.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("research", { description: "Only research is supported" })),
			plan: Type.String({ description: "User task or research question for the read-only research delegate" }),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const result = await delegates.research.run({ plan: params.plan }, config, {
				cwd: ctx.cwd,
				projectTrusted: ctx.isProjectTrusted(),
				signal,
				onUpdate,
			});

			return {
				content: [{ type: "text", text: instantResultText(result) }],
				details: result,
				isError: result.exitCode !== 0 || Boolean(result.blockedReason),
			};
		},
	});

	pi.registerTool({
		name: "conductor_normal",
		label: "Normal Conductor Delegate",
		description: "Run the normal coding delegate: same base delegate model as fast, medium thinking, bounded implementation from a plan.",
		promptSnippet: "Run a normal coding delegate flow",
		promptGuidelines: [
			"Use conductor_normal after planning for bounded multi-file implementation work.",
			"Pass the planner's Coder Instructions or implementation plan; keep the prompt operational and scoped.",
			"Do not use it for unplanned broad refactors or risky product/security/deployment decisions.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("normal", { description: "Only normal is supported" })),
			plan: Type.String({ description: "Implementation plan or coding instructions for the normal delegate" }),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const result = await delegates.normal.run({ plan: params.plan }, config, {
				cwd: ctx.cwd,
				projectTrusted: ctx.isProjectTrusted(),
				signal,
				onUpdate,
			});

			return {
				content: [{ type: "text", text: instantResultText(result) }],
				details: result,
				isError: result.exitCode !== 0 || Boolean(result.blockedReason),
			};
		},
	});

	pi.registerTool({
		name: "conductor_plan",
		label: "Planner Conductor Delegate",
		description: "Run the high-reasoning read-only planner delegate to turn a task and optional Research Brief into an implementation plan for a coding agent.",
		promptSnippet: "Run a planner delegate flow",
		promptGuidelines: [
			"Use conductor_plan after research when a coding agent needs a bounded implementation plan.",
			"Include the original user task and the Research Brief when available.",
			"The result should guide coding; it should not be treated as code or final verification.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("planner", { description: "Only planner is supported" })),
			plan: Type.String({ description: "Original user task plus optional Research Brief for the planner delegate" }),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const result = await delegates.planner.run({ plan: params.plan }, config, {
				cwd: ctx.cwd,
				projectTrusted: ctx.isProjectTrusted(),
				signal,
				onUpdate,
			});

			return {
				content: [{ type: "text", text: instantResultText(result) }],
				details: result,
				isError: result.exitCode !== 0 || Boolean(result.blockedReason),
			};
		},
	});
}
