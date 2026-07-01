import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, saveGlobalConfig } from "./config.js";
import type { ConductorConfig } from "./config.js";
import { delegates } from "./delegates/registry.js";
import { formatDecision, routeTask } from "./routing.js";
import { shouldBlockToolCall } from "./safety.js";

const HELP_TEXT = [
	"Conductor instant commands:",
	"- /conductor status",
	"- /conductor setup",
	"- /conductor route <task>",
	"- /conductor instant <simple plan mentioning one file>",
	"- /conductor strict on|off",
].join("\n");
const instantResultText = (result: { blockedReason?: string; finalOutput: string; stderr: string }): string =>
	result.blockedReason ?? (result.finalOutput || result.stderr || "Instant delegate finished without output.");

const modelId = (model: { provider: string; id: string }) => `${model.provider}/${model.id}`;
const fileFromPlan = (plan: string, config: ConductorConfig): string => routeTask(plan, config, true).signals.mentionedFiles[0] ?? "";

async function chooseInstantModel(ctx: { modelRegistry: { getAvailable(): Array<{ provider: string; id: string; name?: string }> }; ui: { select(title: string, options: string[]): Promise<string | undefined>; notify(message: string, level?: "info" | "warning" | "error" | "success"): void } }, config: ConductorConfig) {
	const models = ctx.modelRegistry.getAvailable();
	if (models.length === 0) {
		ctx.ui.notify("No configured Pi models found. Use /login or configure models first, then run /conductor setup.", "warning");
		return undefined;
	}

	const inherit = "Inherit current Pi default";
	const choices = [inherit, ...models.map((model) => `${modelId(model)}${model.name ? ` — ${model.name}` : ""}`)];
	const selected = await ctx.ui.select("Choose the model for instant delegates", choices);
	if (!selected) return undefined;

	const model = selected === inherit ? "" : selected.split(" — ")[0];
	return {
		...config,
		delegateFlows: {
			...config.delegateFlows,
			instant: { ...config.delegateFlows.instant, model, thinking: "off" },
		},
	};
}

export default function conductorExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		const flow = config.delegateFlows.instant;
		ctx.ui.setStatus("conductor", `instant: ${flow.model || "default"} [${flow.tools.join(",")}] ${config.strictMode ? "strict" : ""}`.trim());
	});

	pi.on("tool_call", async (event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		const reason = shouldBlockToolCall(event, config, ctx.cwd);
		if (reason) return { block: true, reason };
	});

	pi.registerCommand("conductor", {
		description: "Route tiny coding tasks to the instant delegate",
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

			switch (subcommand) {
				case "status":
				case "config":
					ctx.ui.notify([
						"Conductor is instant-only.",
						`Strict mode: ${config.strictMode ? "on" : "off"}`,
						`Instant model: ${flow.model || "inherit current Pi default"}`,
						`Instant thinking: ${flow.thinking}`,
						`Instant flow tools: ${flow.tools.join(", ")}`,
						`Instant limit: ${flow.maxFiles} file, ~${flow.maxEstimatedLines} lines`,
						`Config paths: ${paths.length > 0 ? paths.join(", ") : "defaults only"}`,
					].join("\n"), "info");
					return;

				case "setup": {
					const updated = await chooseInstantModel(ctx, config);
					if (!updated) return;
					const path = await saveGlobalConfig(updated);
					const instant = updated.delegateFlows.instant;
					ctx.ui.setStatus("conductor", `instant: ${instant.model || "default"} [${instant.tools.join(",")}] ${updated.strictMode ? "strict" : ""}`.trim());
					ctx.ui.notify(`Instant model ${instant.model || "will inherit the current Pi default"}; thinking is forced off. Saved ${path}`, "info");
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

				case "strict": {
					const desired = body.toLowerCase();
					if (desired !== "on" && desired !== "off") {
						ctx.ui.notify("Usage: /conductor strict on|off", "warning");
						return;
					}
					const path = await saveGlobalConfig({ ...config, strictMode: desired === "on" });
					ctx.ui.setStatus("conductor", `instant: ${flow.model || "default"} [${flow.tools.join(",")}] strict ${desired}`);
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
}
