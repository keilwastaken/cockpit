import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { saveGlobalConfig } from "../config.js";
import type { CockpitConfig } from "../config.js";
import { cancelAsyncJob, formatJobDetail, formatJobSummary, getAsyncJob, isJobFlowName, listAsyncJobs } from "../jobs/async-jobs.js";
import { cleanupJobArtifacts } from "../jobs/artifacts.js";
import type { JobFlowName } from "../jobs/async-jobs.js";
import { formatDecision, routeTask } from "../routing.js";
import { sendJobResult } from "../jobs/ui.js";
import { handleWorkIntake } from "../work/intake.js";
import { createCockpitRuntime, modelId, modelLabel } from "../runtime.js";
import { normalizeOwnedFile, withFileOwnershipGuard } from "../shared/files.js";

const HELP_TEXT = [
	"Cockpit commands:",
	"- /cockpit status",
	"- /cockpit setup",
	"- /cockpit route <task>",
	"- /cockpit preplan <task>",
	"- /cockpit codeflow --approved <task>",
	"- /cockpit codeflow --dangerous <task>",
	"- /cockpit instant <simple plan mentioning one file>",
	"- /cockpit fast <small semantic task>",
	"- /cockpit research <task>",
	"- /cockpit ideate <unclear feature/refactor/product direction>",
	"- /cockpit normal <implementation plan>",
	"- /cockpit plan <task + optional research brief>",
	"- /cockpit task <idea or backlog item>",
	"- /cockpit review <task + plan + change summary>",
	"- /cockpit async <flow> <task>",
	"- /cockpit parallel <flow>:<task> | <flow>:<task>",
	"- /cockpit jobs",
	"- /cockpit job <id>",
	"- /cockpit resume <id>",
	"- /cockpit cleanup",
	"- /cockpit cancel <id>",
	"- /cleanup"
].join("\n");

type ParsedParallelJob = { flow: JobFlowName; plan: string; outputFile?: string };


function parseParallelJobs(body: string): ParsedParallelJob[] | string {
	const parts = body.split(/\s+\|\s+/).map((part) => part.trim()).filter(Boolean);
	if (parts.length === 0) return "Usage: /cockpit parallel <flow>[:<task>] or <flow>-><file>:<task> | ...";
	const jobs: ParsedParallelJob[] = [];
	const claimedFiles = new Map<string, string>();
	for (const part of parts) {
		const match = part.match(/^([A-Za-z-]+)(?:\s*->\s*([^:]+))?\s*:\s*([\s\S]+)$/);
		if (!match) return `Invalid parallel job '${part}'. Use <flow>:<task> or <flow>-><file>:<task>.`;
		const flow = match[1];
		const outputFile = match[2]?.trim();
		const planBody = match[3].trim();
		if (!isJobFlowName(flow)) return `Unknown parallel flow: ${flow}.`;
		if (!planBody) return `Missing task for parallel flow: ${flow}.`;
		if (outputFile) {
			const normalized = normalizeOwnedFile(outputFile);
			const existing = claimedFiles.get(normalized);
			if (existing) return `Parallel file ownership conflict: '${normalized}' is claimed by both '${existing}' and '${part}'.`;
			claimedFiles.set(normalized, part);
			jobs.push({ flow, plan: withFileOwnershipGuard(normalized, planBody), outputFile: normalized });
		} else {
			jobs.push({ flow, plan: planBody });
		}
	}
	return jobs;
}

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

function applySetup(config: CockpitConfig, options: { handsModel: string; reasoningModel: string }): CockpitConfig {
	const { handsModel, reasoningModel } = options;
	return {
		...config,
		strictMode: false,
		delegateFlows: {
			...config.delegateFlows,
			instant: { ...config.delegateFlows.instant, model: handsModel, thinking: "off" },
			fast: { ...config.delegateFlows.fast, model: handsModel, thinking: "low" },
			normal: { ...config.delegateFlows.normal, model: handsModel, thinking: "medium" },
			ideate: { ...config.delegateFlows.ideate, model: reasoningModel, thinking: config.delegateFlows.ideate.thinking },
			research: { ...config.delegateFlows.research, model: handsModel, thinking: "minimal" },
			planner: { ...config.delegateFlows.planner, model: reasoningModel, thinking: config.delegateFlows.planner.thinking },
			reviewer: { ...config.delegateFlows.reviewer, model: handsModel, thinking: "low" },
			taskWriter: { ...config.delegateFlows.taskWriter, model: handsModel, thinking: "low" },
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
		"Cockpit context-budget autopilot is always on.",
		"The Oracle stays small and strategic; delegates absorb noisy detail work on the cheapest capable model.",
		"Direct edits remain available for tiny maneuvers where delegation overhead would be wasteful.",
		"Setup only needs two choices:",
		"1. Hands model — inherited by instant, fast, normal, research, reviewer, and task-writer. Recommended: local/cheap/fast coding model.",
		"2. Reasoning model — inherited by ideate and planner. Recommended: latest cloud reasoning model.",
		`Detected models: ${models.length} total, ${localModels.length} local-looking, ${cloudModels.length} cloud-looking.`,
	].join("\n"), "info");

	const handsModel = await chooseModel(ctx, "Choose hands model for implementation workers", handsModels);
	if (handsModel === undefined) return undefined;
	const reasoningModel = await chooseModel(ctx, "Choose reasoning model for ideation, research, planning, review, and task writing", reasoningModels);
	if (reasoningModel === undefined) return undefined;
	const updated = applySetup(config, { handsModel, reasoningModel });
	const summary = [
		"Cockpit setup summary:",
		`Hands model: ${modelLabel(handsModel)}`,
		"  instant, fast, normal, research, reviewer, task-writer inherit this model.",
		`Reasoning model: ${modelLabel(reasoningModel)}`,
		"  ideate and planner inherit this model.",
		"Context-budget autopilot: always on; direct edits are allowed for tiny maneuvers, delegation is preferred for noisy work.",
	].join("\n");
	const confirmed = await ctx.ui.confirm("Save Cockpit setup?", summary);
	return confirmed ? updated : undefined;
}


export function registerCockpitCommands(pi: ExtensionAPI) {
	pi.registerCommand("cockpit", {
		description: "Cockpit context-budget autopilot commands and background delegate flows",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed || trimmed === "help") {
				ctx.ui.notify(HELP_TEXT, "info");
				return;
			}

			const [subcommand, ...rest] = trimmed.split(/\s+/);
			const body = rest.join(" ").trim();
			const runtime = await createCockpitRuntime(pi, ctx);
			const { config, paths, jobs: jobService } = runtime;
			const flow = config.delegateFlows.instant;
			const fastFlow = config.delegateFlows.fast;
			const researchFlow = config.delegateFlows.research;
			const normalFlow = config.delegateFlows.normal;
			const plannerFlow = config.delegateFlows.planner;
			const reviewerFlow = config.delegateFlows.reviewer;
			const taskWriterFlow = config.delegateFlows.taskWriter;
			const ideateFlow = config.delegateFlows.ideate;

			const startSmartWork = (task: string) => handleWorkIntake(runtime, task);

			switch (subcommand) {
				case "status":
				case "config":
					ctx.ui.notify([
						"Cockpit context-budget autopilot is on: keep Oracle context small and delegate noisy detail work.",
						"Use direct tools only for tiny/interactive maneuvers; use delegates for search, multiple files, tests/logs, uncertainty, ideation, task packets, reviews, or larger codeflow work.",
						"Cockpit flows: instant, fast, ideate, research, normal, planner, reviewer, task-writer.",
						`Hands/cheap model: instant ${modelLabel(flow.model)}, fast ${modelLabel(fastFlow.model)}, normal ${modelLabel(normalFlow.model)}, research ${modelLabel(researchFlow.model)}, reviewer ${modelLabel(reviewerFlow.model)}, task-writer ${modelLabel(taskWriterFlow.model)}`,
						`Reasoning model: ideate ${modelLabel(ideateFlow.model)}, planner ${modelLabel(plannerFlow.model)}`,
						`Recommendation: local/cheap model for delegates; latest cloud reasoning model for ideation and planning.`,
						`Instant: thinking ${flow.thinking}; tools ${flow.tools.join(", ")}; limit ${flow.maxFiles} file, ~${flow.maxEstimatedLines} lines`,
						`Fast: thinking ${fastFlow.thinking}; tools ${fastFlow.tools.join(", ")}; limit ${fastFlow.maxFiles} files, ~${fastFlow.maxEstimatedLines} lines`,
						`Ideate: thinking ${ideateFlow.thinking}; tools ${ideateFlow.tools.join(", ")}; read budget ${ideateFlow.maxFiles} files`,
						`Research: thinking ${researchFlow.thinking}; tools ${researchFlow.tools.join(", ")}; read budget ${researchFlow.maxFiles} files`,
						`Normal: thinking ${normalFlow.thinking}; tools ${normalFlow.tools.join(", ")}; limit ${normalFlow.maxFiles} files, ~${normalFlow.maxEstimatedLines} lines`,
						`Planner: thinking ${plannerFlow.thinking}; tools ${plannerFlow.tools.join(", ")}; verification read budget ${plannerFlow.maxFiles} files`,
						`Reviewer: thinking ${reviewerFlow.thinking}; tools ${reviewerFlow.tools.join(", ")}; review read budget ${reviewerFlow.maxFiles} files`,
						`Task-writer: thinking ${taskWriterFlow.thinking}; tools ${taskWriterFlow.tools.join(", ")}; task context budget ${taskWriterFlow.maxFiles} files`,
						`Config paths: ${paths.length > 0 ? paths.join(", ") : "defaults only"}`,
					].join("\n"), "info");
					return;

				case "setup": {
					const updated = await runSetupWizard(ctx, config);
					if (!updated) return;
					const path = await saveGlobalConfig(updated);
					ctx.ui.setStatus("cockpit", `context-budget · hands: ${modelLabel(updated.delegateFlows.normal.model)} · reasoning: ${modelLabel(updated.delegateFlows.planner.model)}`);
					ctx.ui.notify([
						"Cockpit configured.",
						`Config saved to: ${path}`,
						`Hands/cheap model: instant ${modelLabel(updated.delegateFlows.instant.model)}, fast ${modelLabel(updated.delegateFlows.fast.model)}, normal ${modelLabel(updated.delegateFlows.normal.model)}, research ${modelLabel(updated.delegateFlows.research.model)}, reviewer ${modelLabel(updated.delegateFlows.reviewer.model)}, task-writer ${modelLabel(updated.delegateFlows.taskWriter.model)}`,
						`Reasoning model: ideate ${modelLabel(updated.delegateFlows.ideate.model)}, planner ${modelLabel(updated.delegateFlows.planner.model)}`,
						"Context-budget autopilot: always on; direct edits are allowed for tiny maneuvers, delegation is preferred for noisy work.",
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

				case "preplan":
				case "prepare": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit preplan <task>", "warning");
						return;
					}
					jobService.start({ flow: "codeflow-preplan", plan: body });
					return;
				}

				case "codeflow":
				case "code": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit codeflow --approved <task>, /cockpit codeflow --dangerous <task>, or /cockpit preplan <task> first", "warning");
						return;
					}
					const approvedPrefix = body.match(/^(?:--approved|approved:)\s+([\s\S]+)$/i);
					const dangerousPrefix = body.match(/^--dangerous\s+([\s\S]+)$/i);
					if (dangerousPrefix) {
						jobService.start({ flow: "codeflow", plan: dangerousPrefix[1].trim(), approved: true });
						return;
					}
					if (!approvedPrefix) {
						const job = jobService.start({
							flow: "codeflow-preplan",
							plan: body,
							notify: false,
							onFinish: async (finished) => {
								if (finished.status === "done" || finished.status === "failed") {
									sendJobResult(pi, finished);
								}
								if (finished.status === "done") {
									const ok = await ctx.ui.confirm("Cockpit Codeflow", "Approve this preplan and start execution?");
									if (ok) {
										jobService.start({ flow: "codeflow", plan: `${body}\n\nApproved plan:\n${finished.output}`, approved: true });
									} else {
										ctx.ui.notify("Codeflow preplan rejected.", "warning");
									}
								} else {
									const level = finished.status === "failed" ? "error" : "warning";
									ctx.ui.notify(`Codeflow preplan ${finished.status}.`, level);
								}
							}
						});
						ctx.ui.notify([
							"Started read-only codeflow preplan job.",
							`Job: ${job.id}`,
							"An approval dialog will appear when the plan is ready."
						].join("\n"), "info");
						return;
					}
					jobService.start({ flow: "codeflow", plan: approvedPrefix[1].trim(), approved: true });
					return;
				}

				case "instant": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit instant <simple plan mentioning one file>", "warning");
						return;
					}
					jobService.start({ flow: "instant", plan: body, file: runtime.fileFromPlan(body) });
					return;
				}

				case "fast": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit fast <small semantic task>", "warning");
						return;
					}
					jobService.start({ flow: "fast", plan: body });
					return;
				}

				case "research": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit research <task>", "warning");
						return;
					}
					jobService.start({ flow: "research", plan: body });
					return;
				}

				case "ideate": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit ideate <unclear feature/refactor/product direction>", "warning");
						return;
					}
					jobService.start({ flow: "ideate", plan: body });
					return;
				}

				case "normal": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit normal <implementation plan>", "warning");
						return;
					}
					await startSmartWork(body);
					return;
				}

				case "plan":
				case "planner": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit plan <task + optional research brief>", "warning");
						return;
					}
					jobService.start({ flow: "planner", plan: body });
					return;
				}

				case "task":
				case "task-writer":
				case "taskwriter": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit task <idea or backlog item>", "warning");
						return;
					}
					jobService.start({ flow: "task-writer", plan: body });
					return;
				}

				case "review":
				case "reviewer": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit review <task + plan + change summary>", "warning");
						return;
					}
					jobService.start({ flow: "reviewer", plan: body });
					return;
				}

				case "async":
				case "start": {
					const [flowArg, ...taskParts] = body.split(/\s+/);
					if (!flowArg || taskParts.length === 0) {
						ctx.ui.notify("Usage: /cockpit async <codeflow-preplan|codeflow|instant|fast|ideate|research|normal|planner|reviewer|task-writer|taskWriter> <task>", "warning");
						return;
					}
					if (!isJobFlowName(flowArg)) {
						ctx.ui.notify(`Unknown async flow: ${flowArg}. Use one of: codeflow-preplan, codeflow, instant, fast, ideate, research, normal, planner, reviewer, task-writer, taskWriter.`, "warning");
						return;
					}
					const plan = taskParts.join(" ").trim();
					jobService.start({ flow: flowArg, plan });
					return;
				}

				case "parallel": {
					const parsed = parseParallelJobs(body);
					if (typeof parsed === "string") {
						ctx.ui.notify(parsed, "warning");
						return;
					}
					jobService.startMany(parsed);
					return;
				}

				case "jobs": {
					const activeJobs = listAsyncJobs();
					ctx.ui.notify(activeJobs.length > 0 ? activeJobs.map(formatJobSummary).join("\n") : "No cockpit jobs in memory.", "info");
					return;
				}

				case "job": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit job <id>", "warning");
						return;
					}
					const job = getAsyncJob(body);
					ctx.ui.notify(job ? formatJobDetail(job) : `No unique cockpit job found for: ${body}`, job ? "info" : "warning");
					return;
				}

				case "resume": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit resume <job id>", "warning");
						return;
					}
					const job = getAsyncJob(body);
					const resumePath = job?.artifactsDir ? join(job.artifactsDir, "resume.md") : join(ctx.cwd, ".pi", "cockpit", "jobs", body, "resume.md");
					let resumePrompt = "";
					try {
						resumePrompt = await readFile(resumePath, "utf8");
					} catch (error) {
						ctx.ui.notify(`Could not read resume prompt at ${resumePath}: ${(error as Error).message}`, "warning");
						return;
					}
					const resumed = jobService.start({ flow: "normal", plan: resumePrompt });
					ctx.ui.notify([
						`Started cockpit resume job ${resumed.id} from ${body}.`,
						`Resume prompt: ${resumePath}`,
						`Check with /cockpit job ${resumed.id}`,
					].join("\n"), "info");
					return;
				}

				case "cleanup": {
					const root = await cleanupJobArtifacts(ctx.cwd);
					ctx.ui.notify(`Cockpit job artifacts removed: ${root}`, "info");
					return;
				}

				case "cancel": {
					if (!body) {
						ctx.ui.notify("Usage: /cockpit cancel <id>", "warning");
						return;
					}
					const job = cancelAsyncJob(body);
					jobService.refreshProgress();
					ctx.ui.notify(job ? `Cockpit job ${job.id} status: ${job.status}` : `No unique cockpit job found for: ${body}`, job ? "info" : "warning");
					return;
				}

				case "strict": {
					ctx.ui.notify("Strict mode has been retired. Cockpit context-budget autopilot is always on. Direct edits and shell commands are governed by the host agent/harness permissions.", "info");
					return;
				}

				default:
					await startSmartWork(trimmed);
			}
		},
	});

	pi.registerCommand("cleanup", {
		description: "Remove Cockpit job artifact files under .pi/cockpit/jobs",
		handler: async (_args, ctx) => {
			const root = await cleanupJobArtifacts(ctx.cwd);
			ctx.ui.notify(`Cockpit job artifacts removed: ${root}`, "info");
		},
	});
}
