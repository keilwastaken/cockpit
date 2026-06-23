import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "./config.js";
import { buildDelegationHandoff, formatHandoff } from "./handoff.js";
import { writeRunLog } from "./logs.js";
import { formatDecision, routeTask } from "./routing.js";
import { shouldBlockToolCall } from "./safety.js";
import { runSetup } from "./setup.js";
import type { ConductorTier } from "./types.js";

const tiers = ["micro", "small", "medium", "full-auto"] as const;
const isTier = (value: string): value is ConductorTier => (tiers as readonly string[]).includes(value);

const parseTierAndTask = (args: string): { tier?: ConductorTier; task: string } => {
	const [first, ...rest] = args.trim().split(/\s+/);
	if (first && isTier(first)) return { tier: first, task: rest.join(" ").trim() };
	return { task: args.trim() };
};

const help = [
	"Conductor commands:",
	"- /conductor setup",
	"- /conductor status",
	"- /conductor route <task>",
	"- /conductor handoff [micro|small|medium|full-auto] <task>",
	"- /conductor strict on|off (writes global config)",
].join("\n");

export default function conductorExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		ctx.ui.setStatus("conductor", `conductor: strict ${config.strictMode ? "on" : "off"}`);
	});

	pi.on("tool_call", async (event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		const reason = shouldBlockToolCall(event, config);
		if (reason) return { block: true, reason };
	});

	pi.registerCommand("conductor", {
		description: "Route coding work to right-sized delegated agents",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const [subcommand = "help", ...rest] = trimmed.split(/\s+/);
			const body = rest.join(" ").trim();
			const { config, paths } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());

			if (subcommand === "help" || !trimmed) {
				ctx.ui.notify(help, "info");
				return;
			}

			if (subcommand === "setup" || subcommand === "login") {
				const message = await runSetup(ctx);
				ctx.ui.notify(message, "info");
				return;
			}

			if (subcommand === "status" || subcommand === "config") {
				const text = [
					`Strict mode: ${config.strictMode ? "on" : "off"}`,
					`Default dry-run: ${config.defaultDryRun ? "on" : "off"}`,
					`Micro agents: ${config.agents.micro.join(", ")}`,
					`Small agents: ${config.agents.small.join(", ")}`,
					`Medium agent: ${config.agents.medium}`,
					`Reviewer agent: ${config.agents.reviewer}`,
					`Full-auto flow: parent-orchestrated ${config.agents.fullAuto}`,
					`Micro model: ${config.models.micro || "inherit agent default"}`,
					`Small model: ${config.models.small || "inherit agent default"}`,
					`Medium model: ${config.models.medium || "inherit agent default"}`,
					`Full-auto model: current parent chat model orchestrates the flow`,
					`Config paths: ${paths.length > 0 ? paths.join(", ") : "defaults only"}`,
				].join("\n");
				ctx.ui.notify(text, "info");
				return;
			}

			if (subcommand === "route") {
				if (!body) {
					ctx.ui.notify("Usage: /conductor route <task>", "warning");
					return;
				}
				const decision = routeTask(body, config);
				ctx.ui.notify(formatDecision(decision), "info");
				return;
			}

			if (subcommand === "handoff" || subcommand === "brief") {
				const { tier, task } = parseTierAndTask(body);
				if (!task) {
					ctx.ui.notify("Usage: /conductor handoff [micro|small|medium|full-auto] <task>", "warning");
					return;
				}
				const decision = routeTask(task, config, tier);
				const handoff = buildDelegationHandoff(task, decision);
				const output = [formatDecision(decision), "", "Handoff:", formatHandoff(handoff)].join("\n");
				const logPath = await writeRunLog(ctx.cwd, "handoff", output);
				ctx.ui.notify(`${output}\n\nSaved: ${logPath}`, "info");
				return;
			}

			if (subcommand === "delegate") {
				ctx.ui.notify(
					"Delegation launch is intentionally not implemented in Phase 1. Use /conductor handoff to generate a safe subagent handoff first.",
					"warning",
				);
				return;
			}

			if (subcommand === "strict") {
				const desired = body.toLowerCase();
				if (desired !== "on" && desired !== "off") {
					ctx.ui.notify("Usage: /conductor strict on|off", "warning");
					return;
				}
				const { saveGlobalConfig } = await import("./config.js");
				const path = await saveGlobalConfig({ ...config, strictMode: desired === "on" });
				ctx.ui.setStatus("conductor", `conductor: strict ${desired}`);
				ctx.ui.notify(`Conductor strict mode ${desired}; saved ${path}`, "info");
				return;
			}

			ctx.ui.notify(help, "warning");
		},
	});

	pi.registerTool({
		name: "conductor_handoff",
		label: "Conductor Handoff",
		description: "Classify a coding task and produce a safe delegation handoff for a subagent. Does not launch the subagent.",
		promptSnippet: "Create a safe Conductor delegation handoff for coding work",
		promptGuidelines: [
			"Use conductor_handoff before delegating coding edits when Conductor strict mode is active or when the user asks to route work to a subagent.",
		],
		parameters: Type.Object({
			task: Type.String({ description: "Coding task to classify and prepare for delegation" }),
			tier: Type.Optional(Type.Union([Type.Literal("micro"), Type.Literal("small"), Type.Literal("medium"), Type.Literal("full-auto")])), 
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const decision = routeTask(params.task, config, params.tier as ConductorTier | undefined);
			const handoff = buildDelegationHandoff(params.task, decision);
			const output = [formatDecision(decision), "", "Handoff:", formatHandoff(handoff)].join("\n");
			const logPath = await writeRunLog(ctx.cwd, "handoff", output);
			return {
				content: [{ type: "text", text: `${output}\n\nSaved: ${logPath}` }],
				details: { decision, logPath },
			};
		},
	});
}
