import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname } from "node:path";
import { Type } from "typebox";
import { loadConfig } from "./config.js";
import { buildDelegationHandoff, formatHandoff } from "./handoff.js";
import { approveRun, createRunRegistryEntry, formatRunListLine, inspectRun, listRuns, readRunStatusText } from "./logs.js";
import { formatDecision, routeTask } from "./routing.js";
import { shouldBlockToolCall } from "./safety.js";
import { runSetup } from "./setup.js";
import type { ConductorConfig, ConductorTier, RouteDecision } from "./types.js";

const Tiers: readonly ConductorTier[] = ["instant", "fast", "careful"] as const;

/** Parse a tier string, returning undefined if not valid */
function parseTier(value: string): ConductorTier | undefined {
	return Tiers.includes(value as ConductorTier) ? (value as ConductorTier) : undefined;
}

/** Parse "[tier] <task>" input format */
function parseTierAndTask(args: string): { tier?: ConductorTier; task: string } {
	const [first, ...rest] = args.trim().split(/\s+/);
	const tier = first ? parseTier(first) : undefined;
	if (tier) return { tier, task: rest.join(" ").trim() };
	return { task: args.trim() };
}

/** Format status output for config overview */
function formatStatus(config: ConductorConfig, paths: string[]): string {
	const profileLine = (tier: ConductorTier) => {
		const profile = config.profiles[tier];
		return `${tier}: ${profile.topology}, scout ${profile.scout}, verify ${profile.verification}, review ${profile.review ? "yes" : "no"}, visits ${profile.maxWorkerVisits}, isolation ${profile.isolation}`;
	};

	return [
		`Strict mode: ${config.strictMode ? "on" : "off"}`,
		"Execution profiles:",
		...Tiers.map(profileLine),
		`Instant agents: ${config.agents.instant.join(", ")}`,
		`Fast agents: ${config.agents.fast.join(", ")}`,
		`Careful agent: ${config.agents.careful}`,
		`Instant model preference: ${config.models.instant || "inherit agent default"}`,
		`Fast model preference: ${config.models.fast || "inherit agent default"}`,
		`Careful model preference: ${config.models.careful || "inherit agent default"}`,
		`Config paths: ${paths.length > 0 ? paths.join(", ") : "defaults only"}`,
	].join("\n");
}


/** Build handoff output string from a RouteDecision. */
function buildHandoffOutputString(decision: RouteDecision, task: string, config: ConductorConfig): string {
	const handoff = buildDelegationHandoff(task, decision, config);
	return [formatDecision(decision), "", "Handoff:", formatHandoff(handoff)].join("\n");
}

function formatInspectArtifacts(run: { handoffPath: string; notesPath: string; evidencePath: string; reviewPath: string; decisionsPath?: string }): string {
	return [
		`Handoff: ${run.handoffPath}`,
		`Notes: ${run.notesPath}`,
		`Evidence: ${run.evidencePath}`,
		`Review: ${run.reviewPath}`,
		...(run.decisionsPath ? [`Decisions: ${run.decisionsPath}`] : []),
	].join("\n");
}

/** Build handoff output and persist run registry artifacts. */
async function buildHandoffOutput(
	task: string,
	config: ConductorConfig,
	tier: ConductorTier | undefined,
	cwd: string
): Promise<{ output: string; run: Awaited<ReturnType<typeof createRunRegistryEntry>>; decision: RouteDecision }> {
	const decision = routeTask(task, config, tier);
	const output = buildHandoffOutputString(decision, task, config);
	const run = await createRunRegistryEntry(cwd, task, decision, output);
	return { output, run, decision };
}

const helpText = [
	"Conductor commands:",
	"- /conductor setup",
	"- /conductor status",
	"- /conductor runs",
	"- /conductor inspect <run-id>",
	"- /conductor route <task>",
	"- /conductor handoff [instant|fast|careful] <task>",
	"- /conductor launch --approve <run-id>",
	"- /conductor strict on|off (writes global config)",
].join("\n");

export default function conductorExtension(pi: ExtensionAPI) {
	// Session start: set status bar indicator
	pi.on("session_start", async (_event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		ctx.ui.setStatus("conductor", `conductor: strict ${config.strictMode ? "on" : "off"}`);
	});

	// Tool call safety gate
	pi.on("tool_call", async (event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		const reason = shouldBlockToolCall(event, config);
		if (reason) return { block: true, reason };
	});

	// Command registration with dispatch pattern
	pi.registerCommand("conductor", {
		description: "Recommend execution profiles for coding work",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				ctx.ui.notify(helpText, "info");
				return;
			}
			const [subcommand, ...rest] = trimmed.split(/\s+/);
			const body = rest.join(" ").trim();
			const { config, paths } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());

			// Dispatch to subcommand handlers
			switch (subcommand) {
				case "help":
					ctx.ui.notify(helpText, "info");
					return;

				case "setup": {
					const message = await runSetup(ctx);
					ctx.ui.notify(message, "info");
					return;
				}

				case "status":
				case "config": {
					const text = formatStatus(config, paths);
					ctx.ui.notify(text, "info");
					return;
				}

				case "route": {
					if (!body) {
						ctx.ui.notify("Usage: /conductor route <task>", "warning");
						return;
					}
					const decision = routeTask(body, config);
					ctx.ui.notify(formatDecision(decision), "info");
					return;
				}

				case "runs": {
					const runs = await listRuns(ctx.cwd);
					if (runs.length === 0) {
						ctx.ui.notify("No Conductor runs yet.", "info");
						return;
					}
					ctx.ui.notify(["Conductor runs:", ...runs.map((run) => `- ${formatRunListLine(run)}`)].join("\n"), "info");
					return;
				}

				case "inspect": {
					if (!body) {
						ctx.ui.notify("Usage: /conductor inspect <run-id>", "warning");
						return;
					}
					const result = await inspectRun(ctx.cwd, body);
					if ("warning" in result) {
						ctx.ui.notify(result.warning, "warning");
						return;
					}
					const statusText = await readRunStatusText(result.run);
					ctx.ui.notify([statusText.trimEnd(), "", formatInspectArtifacts(result.run)].join("\n"), "info");
					return;
				}

				case "handoff": {
					const { tier, task } = parseTierAndTask(body);
					if (!task) {
						ctx.ui.notify("Usage: /conductor handoff [instant|fast|careful] <task>", "warning");
						return;
					}
					const { output, run } = await buildHandoffOutput(task, config, tier, ctx.cwd);
					ctx.ui.notify(`${output}\n\nSaved run: ${dirname(run.handoffPath)}\nHandoff: ${run.handoffPath}`, "info");
					return;
				}

				case "launch": {
					const [flag, ...launchRest] = body.split(/\s+/);
					const runId = launchRest.join(" ").trim();
					if (flag !== "--approve" || !runId || launchRest.some((part) => part.startsWith("--"))) {
						ctx.ui.notify("Usage: /conductor launch --approve <run-id>", "warning");
						return;
					}
					const result = await inspectRun(ctx.cwd, runId);
					if ("warning" in result) {
						ctx.ui.notify(result.warning, "warning");
						return;
					}
					const run = await approveRun(ctx.cwd, result.run);
					ctx.ui.notify(
						[
							`Run ${run.id} approved; no worker launched yet.`,
							`Next step: open ${run.handoffPath} and start the suggested agent/subagent workflow manually.`,
							`Status updated at ${run.statusPath}.`,
						].join("\n"),
						"info"
					);
					return;
				}

				case "strict": {
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

				default:
					ctx.ui.notify(helpText, "warning");
			}
		},
	});

	// Tool registration for programmatic handoff creation
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
			tier: Type.Optional(Type.Union([Type.Literal("instant"), Type.Literal("fast"), Type.Literal("careful")])),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const tier = params.tier as ConductorTier | undefined;
			const { output, run, decision } = await buildHandoffOutput(params.task, config, tier, ctx.cwd);

			return {
				content: [{ type: "text", text: `${output}\n\nSaved run: ${dirname(run.handoffPath)}\nHandoff: ${run.handoffPath}` }],
				details: { decision, logPath: run.handoffPath, runId: run.id, statusPath: run.statusPath },
			};
		},
	});
}
