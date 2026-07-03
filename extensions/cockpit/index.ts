import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { runCodeflow } from "./codeflow.js";
import { loadConfig, saveGlobalConfig } from "./config.js";
import type { CockpitConfig } from "./config.js";
import { delegates } from "./delegates/registry.js";
import { formatDecision, routeTask } from "./routing.js";
import { shouldBlockToolCall } from "./safety.js";

const HELP_TEXT = [
	"Cockpit commands:",
	"- /cockpit status",
	"- /cockpit setup",
	"- /cockpit route <task>",
	"- /cockpit codeflow <task>",
	"- /cockpit instant <simple plan mentioning one file>",
	"- /cockpit fast <small semantic task>",
	"- /cockpit research <task>",
	"- /cockpit ideate <unclear feature/refactor/product direction>",
	"- /cockpit normal <implementation plan>",
	"- /cockpit plan <task + optional research brief>",
	"- /cockpit review <task + plan + change summary>",
	"- /cockpit strict on|off",
].join("\n");
const instantResultText = (result: { blockedReason?: string; finalOutput: string; stderr: string }): string =>
	result.blockedReason ?? (result.finalOutput || result.stderr || "Instant delegate finished without output.");

const modelId = (model: { provider: string; id: string }) => `${model.provider}/${model.id}`;
const fileFromPlan = (plan: string, config: CockpitConfig): string => routeTask(plan, config, true).signals.mentionedFiles[0] ?? "";

type AvailableModel = { provider: string; id: string; name?: string };
type SetupContext = {
	modelRegistry: { getAvailable(): AvailableModel[] };
	ui: {
		select(title: string, options: string[]): Promise<string | undefined>;
		confirm(title: string, message?: string): Promise<boolean>;
		notify(message: string, level?: "info" | "warning" | "error" | "success"): void;
	};
};

const INHERIT_MODEL = "Inherit current Pi default";

const localProviderPattern = /^(local|ollama|lmstudio|llama|llamacpp|llama\.cpp|kobold|vllm|mlx|jan|text-generation-webui)$/i;
const cloudProviderPattern = /^(openai|anthropic|google|gemini|mistral|cohere|groq|xai|openrouter|azure|bedrock|vertex)$/i;
const modelChoice = (model: AvailableModel) => `${modelId(model)}${model.name ? ` — ${model.name}` : ""}`;
const selectedModelId = (selected: string): string => (selected === INHERIT_MODEL ? "" : selected.split(" — ")[0] ?? "");
const modelLabel = (model: string): string => model || "inherit current Pi default";
const isLocalModel = (model: AvailableModel): boolean => localProviderPattern.test(model.provider);
const isCloudModel = (model: AvailableModel): boolean => cloudProviderPattern.test(model.provider) && !isLocalModel(model);
const uniqueModels = (models: AvailableModel[]): AvailableModel[] => {
	const seen = new Set<string>();
	return models.filter((model) => {
		const id = modelId(model);
		if (seen.has(id)) return false;
		seen.add(id);
		return true;
	});
};

async function chooseModel(ctx: SetupContext, title: string, models: AvailableModel[], allowInherit = true): Promise<string | undefined> {
	const choices = [...(allowInherit ? [INHERIT_MODEL] : []), ...models.map(modelChoice)];
	const selected = await ctx.ui.select(title, choices);
	return selected ? selectedModelId(selected) : undefined;
}

function applySetup(config: CockpitConfig, options: { handsModel: string; reasoningModel: string; strictMode: boolean }): CockpitConfig {
	const { handsModel, reasoningModel, strictMode } = options;
	return {
		...config,
		strictMode,
		delegateFlows: {
			...config.delegateFlows,
			instant: { ...config.delegateFlows.instant, model: handsModel, thinking: "off" },
			fast: { ...config.delegateFlows.fast, model: handsModel, thinking: "low" },
			normal: { ...config.delegateFlows.normal, model: handsModel, thinking: "medium" },
			ideate: { ...config.delegateFlows.ideate, model: reasoningModel, thinking: config.delegateFlows.ideate.thinking },
			research: { ...config.delegateFlows.research, model: reasoningModel, thinking: "minimal" },
			planner: { ...config.delegateFlows.planner, model: reasoningModel, thinking: config.delegateFlows.planner.thinking },
			reviewer: { ...config.delegateFlows.reviewer, model: reasoningModel, thinking: config.delegateFlows.reviewer.thinking },
		},
	};
}

async function runSetupWizard(ctx: SetupContext, config: CockpitConfig): Promise<CockpitConfig | undefined> {
	const models = ctx.modelRegistry.getAvailable();
	if (models.length === 0) {
		ctx.ui.notify("No configured Pi models found. Configure at least one model first, then run /cockpit setup.", "warning");
		return undefined;
	}

	const localModels = models.filter(isLocalModel);
	const cloudModels = models.filter(isCloudModel);
	const handsModels = uniqueModels([...localModels, ...models]);
	const reasoningModels = uniqueModels([...cloudModels, ...models]);
	ctx.ui.notify([
		"Cockpit keeps the main chat as the Oracle / Control Room.",
		"Setup only needs two choices:",
		"1. Hands model — inherited by instant, fast, and normal coding workers. Recommended: local model, or a strong coding model for heavier work.",
		"2. Reasoning model — inherited by ideate, research, planner, and reviewer. Recommended: latest cloud reasoning model.",
		`Detected models: ${models.length} total, ${localModels.length} local-looking, ${cloudModels.length} cloud-looking.`,
	].join("\n"), "info");

	const handsModel = await chooseModel(ctx, "Choose hands model for implementation workers", handsModels);
	if (handsModel === undefined) return undefined;
	const reasoningModel = await chooseModel(ctx, "Choose reasoning model for ideation, research, planning, and review", reasoningModels);
	if (reasoningModel === undefined) return undefined;
	const strictMode = await ctx.ui.confirm(
		"Enable Cockpit strict mode?",
		"Recommended: yes. Strict mode prevents the main chat from directly editing files, keeping the Oracle clean and forcing code mutation through delegates.",
	);

	const updated = applySetup(config, { handsModel, reasoningModel, strictMode });
	const summary = [
		"Cockpit setup summary:",
		`Hands model: ${modelLabel(handsModel)}`,
		"  instant, fast, normal inherit this model.",
		`Reasoning model: ${modelLabel(reasoningModel)}`,
		"  ideate, research, planner, reviewer inherit this model.",
		`Strict mode: ${updated.strictMode ? "enabled" : "disabled"}`,
	].join("\n");
	const confirmed = await ctx.ui.confirm("Save Cockpit setup?", summary);
	return confirmed ? updated : undefined;
}

export default function cockpitExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		ctx.ui.setStatus("cockpit", `hands: ${modelLabel(config.delegateFlows.normal.model)}; reasoning: ${modelLabel(config.delegateFlows.reviewer.model)} ${config.strictMode ? "strict" : ""}`.trim());
	});

	pi.on("tool_call", async (event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		const reason = shouldBlockToolCall(event, config, ctx.cwd);
		if (reason) return { block: true, reason };
	});

	pi.registerCommand("cockpit", {
		description: "Route coding workflow tasks through Cockpit delegate flows",
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
			const reviewerFlow = config.delegateFlows.reviewer;
			const ideateFlow = config.delegateFlows.ideate;

			switch (subcommand) {
				case "status":
				case "config":
					ctx.ui.notify([
						"Cockpit keeps the main chat as the Oracle / Control Room and routes work through isolated delegates.",
						"Cockpit flows: instant, fast, ideate, research, normal, planner, reviewer.",
						`Strict mode: ${config.strictMode ? "on" : "off"}`,
						`Hands model: instant ${modelLabel(flow.model)}, fast ${modelLabel(fastFlow.model)}, normal ${modelLabel(normalFlow.model)}`,
						`Reasoning model: ideate ${modelLabel(ideateFlow.model)}, research ${modelLabel(researchFlow.model)}, planner ${modelLabel(plannerFlow.model)}, reviewer ${modelLabel(reviewerFlow.model)}`,
						`Recommendation: local model for hands; latest cloud reasoning model for ideation, research, planning, and review.`,
						`Instant: thinking ${flow.thinking}; tools ${flow.tools.join(", ")}; limit ${flow.maxFiles} file, ~${flow.maxEstimatedLines} lines`,
						`Fast: thinking ${fastFlow.thinking}; tools ${fastFlow.tools.join(", ")}; limit ${fastFlow.maxFiles} files, ~${fastFlow.maxEstimatedLines} lines`,
						`Ideate: thinking ${ideateFlow.thinking}; tools ${ideateFlow.tools.join(", ")}; read budget ${ideateFlow.maxFiles} files`,
						`Research: thinking ${researchFlow.thinking}; tools ${researchFlow.tools.join(", ")}; read budget ${researchFlow.maxFiles} files`,
						`Normal: thinking ${normalFlow.thinking}; tools ${normalFlow.tools.join(", ")}; limit ${normalFlow.maxFiles} files, ~${normalFlow.maxEstimatedLines} lines`,
						`Planner: thinking ${plannerFlow.thinking}; tools ${plannerFlow.tools.join(", ")}; verification read budget ${plannerFlow.maxFiles} files`,
						`Reviewer: thinking ${reviewerFlow.thinking}; tools ${reviewerFlow.tools.join(", ")}; review read budget ${reviewerFlow.maxFiles} files`,
						`Config paths: ${paths.length > 0 ? paths.join(", ") : "defaults only"}`,
					].join("\n"), "info");
					return;

				case "setup": {
					const updated = await runSetupWizard(ctx, config);
					if (!updated) return;
					const path = await saveGlobalConfig(updated);
					ctx.ui.setStatus("cockpit", `hands: ${modelLabel(updated.delegateFlows.normal.model)}; reasoning: ${modelLabel(updated.delegateFlows.reviewer.model)} ${updated.strictMode ? "strict" : ""}`.trim());
					ctx.ui.notify([
						"Cockpit configured.",
						`Config saved to: ${path}`,
						`Hands model: instant ${modelLabel(updated.delegateFlows.instant.model)}, fast ${modelLabel(updated.delegateFlows.fast.model)}, normal ${modelLabel(updated.delegateFlows.normal.model)}`,
						`Reasoning model: ideate ${modelLabel(updated.delegateFlows.ideate.model)}, research ${modelLabel(updated.delegateFlows.research.model)}, planner ${modelLabel(updated.delegateFlows.planner.model)}, reviewer ${modelLabel(updated.delegateFlows.reviewer.model)}`,
						`Strict mode: ${updated.strictMode ? "enabled" : "disabled"}`,
						`Try: /cockpit codeflow "Add retry handling to an existing workflow"`,
					].join("\n"), "info");
					return;
				}

				case "route": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit route <task>", "warning");
						return;
					}
					ctx.ui.notify(formatDecision(routeTask(body, config)), "info");
					return;
				}

				case "codeflow":
				case "code": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit codeflow <task>", "warning");
						return;
					}
					const result = await runCodeflow({ plan: body }, config, {
						cwd: ctx.cwd,
						projectTrusted: ctx.isProjectTrusted(),
						signal: ctx.signal,
					});
					ctx.ui.notify(instantResultText(result), result.exitCode === 0 && !result.blockedReason ? "info" : "warning");
					return;
				}

				case "instant": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit instant <simple plan mentioning one file>", "warning");
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
						ctx.ui.notify("Usage: /cockpit fast <small semantic task>", "warning");
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
						ctx.ui.notify("Usage: /cockpit research <task>", "warning");
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

				case "ideate": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit ideate <unclear feature/refactor/product direction>", "warning");
						return;
					}
					const result = await delegates.ideate.run({ plan: body }, config, {
						cwd: ctx.cwd,
						projectTrusted: ctx.isProjectTrusted(),
						signal: ctx.signal,
					});
					ctx.ui.notify(instantResultText(result), result.exitCode === 0 && !result.blockedReason ? "info" : "warning");
					return;
				}

				case "normal": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit normal <implementation plan>", "warning");
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
						ctx.ui.notify("Usage: /cockpit plan <task + optional research brief>", "warning");
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

				case "review":
				case "reviewer": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit review <task + plan + change summary>", "warning");
						return;
					}
					const result = await delegates.reviewer.run({ plan: body }, config, {
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
						ctx.ui.notify("Usage: /cockpit strict on|off", "warning");
						return;
					}
					const path = await saveGlobalConfig({ ...config, strictMode: desired === "on" });
					ctx.ui.setStatus("cockpit", `hands: ${modelLabel(normalFlow.model)}; reasoning: ${modelLabel(reviewerFlow.model)} strict ${desired}`);
					ctx.ui.notify(`Cockpit strict mode ${desired}; saved ${path}`, "info");
					return;
				}

				default:
					ctx.ui.notify(HELP_TEXT, "warning");
			}
		},
	});

	pi.registerTool({
		name: "cockpit_codeflow",
		label: "Cockpit Codeflow",
		description: "Run the full cockpit-controlled codeflow: optional research, planner, selected executor, review loop, and feedback-weight routing.",
		promptSnippet: "Run the Cockpit codeflow",
		promptGuidelines: [
			"Use cockpit_codeflow when the user asks to run the full codeflow or wants planning, coding, and review handled by Cockpit.",
			"Pass the original user task. The cockpit decides whether to research, which executor to use, and how to route reviewer feedback.",
			"If the codeflow returns a human_decision or planner_revision route, stop and surface the final review output.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("codeflow", { description: "Only codeflow is supported" })),
			plan: Type.String({ description: "Original user coding task for the full codeflow" }),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const result = await runCodeflow({ plan: params.plan }, config, {
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
		name: "cockpit_delegate",
		label: "Instant Cockpit Delegate",
		description: "Run the instant delegate flow for one tiny, exact code edit from a cockpit-supplied plan.",
		promptSnippet: "Run an instant delegate flow",
		promptGuidelines: [
			"Use cockpit_delegate only after the cockpit has a concrete one-file plan for a tiny, low-risk edit.",
			"Always pass the exact file, and pass line when known, so the instant delegate does not discover scope.",
			"Do not use cockpit_delegate for security, persistence, deployment, architecture, or ambiguous product decisions.",
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
		name: "cockpit_fast",
		label: "Fast Cockpit Delegate",
		description: "Run the fast delegate flow for a small semantic task with local discovery and low thinking.",
		promptSnippet: "Run a fast delegate flow",
		promptGuidelines: [
			"Use cockpit_fast for small semantic tasks where the delegate should discover local context itself, such as building a codemap.",
			"Keep the cockpit prompt compact; do not pre-scan the project in the main chat.",
			"Do not use cockpit_fast for risky security, persistence, deployment, or broad refactor decisions.",
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
		name: "cockpit_research",
		label: "Research Cockpit Delegate",
		description: "Run the read-only research delegate to produce a concise codebase brief for planner handoff, with optional web context when available.",
		promptSnippet: "Run a research delegate flow",
		promptGuidelines: [
			"Use cockpit_research as Node 1 before planning/coding when the planner needs codebase context.",
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
		name: "cockpit_ideate",
		label: "Ideate Cockpit Delegate",
		description: "Run the read-only ideate delegate: divergent multi-pass council for unclear features, refactors, and product/implementation direction.",
		promptSnippet: "Run an ideation delegate flow",
		promptGuidelines: [
			"Use cockpit_ideate when the user wants to explore what to build before planning or implementation.",
			"Good inputs are unclear features, refactors, UX directions, or tradeoff-heavy implementation choices.",
			"The delegate returns divergent variants plus a recommendation. The Oracle should surface the recommendation and ask the human to choose/approve before calling cockpit_plan or cockpit_codeflow."
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("ideate", { description: "Only ideate is supported" })),
			plan: Type.String({ description: "Unclear feature, refactor, product direction, or implementation idea to explore" }),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const result = await delegates.ideate.run({ plan: params.plan }, config, {
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
		name: "cockpit_normal",
		label: "Normal Cockpit Delegate",
		description: "Run the normal coding delegate: implementation model, medium thinking, bounded implementation from a plan.",
		promptSnippet: "Run a normal coding delegate flow",
		promptGuidelines: [
			"Use cockpit_normal after planning for bounded multi-file implementation work.",
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
		name: "cockpit_review",
		label: "Reviewer Cockpit Delegate",
		description: "Run the read-only reviewer delegate over current changes or a git range, returning issue severities and feedback weight for cockpit routing.",
		promptSnippet: "Run a reviewer delegate flow",
		promptGuidelines: [
			"Use cockpit_review after coder work and before approval or the next task.",
			"Include the original task, implementation plan, coder summary, validation results, and base/head range if known.",
			"The reviewer returns feedback weight; the cockpit decides whether to approve, send to coder, replan, or ask the human.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("reviewer", { description: "Only reviewer is supported" })),
			plan: Type.String({ description: "Review context: task, plan, coder summary, validation, and optional git range" }),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const result = await delegates.reviewer.run({ plan: params.plan }, config, {
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
		name: "cockpit_plan",
		label: "Planner Cockpit Delegate",
		description: "Run the high-reasoning read-only planner delegate to turn a task and optional Research Brief into an implementation plan for a coding agent.",
		promptSnippet: "Run a planner delegate flow",
		promptGuidelines: [
			"Use cockpit_plan after the human has approved a direction and/or research when a coding agent needs a bounded implementation plan.",
			"Include the original user task, the human-approved direction, and the Research Brief when available.",
			"The result should guide coding; it should not be treated as code or final verification.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("planner", { description: "Only planner is supported" })),
			plan: Type.String({ description: "Original user task plus human-approved direction and optional Research Brief for the planner delegate" }),
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
