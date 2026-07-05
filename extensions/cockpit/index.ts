import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, saveGlobalConfig } from "./config.js";
import type { CockpitConfig } from "./config.js";
import { cancelAsyncJob, formatJobDetail, formatJobSummary, getAsyncJob, isJobFlowName, listAsyncJobs } from "./jobs/async-jobs.js";
import type { JobFlowName } from "./jobs/async-jobs.js";
import { createJobService, startedManyMessage, startedMessage } from "./jobs/service.js";
import { formatDecision, routeTask } from "./routing.js";
import { shouldBlockToolCall } from "./safety.js";

const HELP_TEXT = [
	"Cockpit commands:",
	"- /cockpit status",
	"- /cockpit setup",
	"- /cockpit route <task>",
	"- /cockpit preplan <task>",
	"- /cockpit codeflow --approved <task>",
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
	"- /cockpit cancel <id>",
	"- /cockpit strict on|off",
].join("\n");
const modelId = (model: { provider: string; id: string }) => `${model.provider}/${model.id}`;
const fileFromPlan = (plan: string, config: CockpitConfig): string => routeTask(plan, config, true).signals.mentionedFiles[0] ?? "";

type ParsedParallelJob = { flow: JobFlowName; plan: string; outputFile?: string };

const normalizeOwnedFile = (file: string): string => file.trim().replace(/^\.\//, "");
const withFileOwnershipGuard = (file: string, plan: string): string => [
	`Output file: ${file}`,
	`File ownership guard: write or edit only ${file}. Do not modify any other project file. If the task requires another file, stop and report that instead.`,
	"",
	plan,
].join("\n");

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
			taskWriter: { ...config.delegateFlows.taskWriter, model: reasoningModel, thinking: "low" },
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
		"2. Reasoning model — inherited by ideate, research, planner, reviewer, and task-writer. Recommended: latest cloud reasoning model.",
		`Detected models: ${models.length} total, ${localModels.length} local-looking, ${cloudModels.length} cloud-looking.`,
	].join("\n"), "info");

	const handsModel = await chooseModel(ctx, "Choose hands model for implementation workers", handsModels);
	if (handsModel === undefined) return undefined;
	const reasoningModel = await chooseModel(ctx, "Choose reasoning model for ideation, research, planning, review, and task writing", reasoningModels);
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
		"  ideate, research, planner, reviewer, task-writer inherit this model.",
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
			const jobService = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui });
			const flow = config.delegateFlows.instant;
			const fastFlow = config.delegateFlows.fast;
			const researchFlow = config.delegateFlows.research;
			const normalFlow = config.delegateFlows.normal;
			const plannerFlow = config.delegateFlows.planner;
			const reviewerFlow = config.delegateFlows.reviewer;
			const taskWriterFlow = config.delegateFlows.taskWriter;
			const ideateFlow = config.delegateFlows.ideate;

			switch (subcommand) {
				case "status":
				case "config":
					ctx.ui.notify([
						"Cockpit keeps the main chat as the Oracle / Control Room and routes work through isolated delegates.",
						"Cockpit flows: instant, fast, ideate, research, normal, planner, reviewer, task-writer.",
						`Strict mode: ${config.strictMode ? "on" : "off"}`,
						`Hands model: instant ${modelLabel(flow.model)}, fast ${modelLabel(fastFlow.model)}, normal ${modelLabel(normalFlow.model)}`,
						`Reasoning model: ideate ${modelLabel(ideateFlow.model)}, research ${modelLabel(researchFlow.model)}, planner ${modelLabel(plannerFlow.model)}, reviewer ${modelLabel(reviewerFlow.model)}, task-writer ${modelLabel(taskWriterFlow.model)}`,
						`Recommendation: local model for hands; latest cloud reasoning model for ideation, research, planning, review, and task writing.`,
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
					ctx.ui.setStatus("cockpit", `hands: ${modelLabel(updated.delegateFlows.normal.model)}; reasoning: ${modelLabel(updated.delegateFlows.reviewer.model)} ${updated.strictMode ? "strict" : ""}`.trim());
					ctx.ui.notify([
						"Cockpit configured.",
						`Config saved to: ${path}`,
						`Hands model: instant ${modelLabel(updated.delegateFlows.instant.model)}, fast ${modelLabel(updated.delegateFlows.fast.model)}, normal ${modelLabel(updated.delegateFlows.normal.model)}`,
						`Reasoning model: ideate ${modelLabel(updated.delegateFlows.ideate.model)}, research ${modelLabel(updated.delegateFlows.research.model)}, planner ${modelLabel(updated.delegateFlows.planner.model)}, reviewer ${modelLabel(updated.delegateFlows.reviewer.model)}, task-writer ${modelLabel(updated.delegateFlows.taskWriter.model)}`,
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
						ctx.ui.notify("Usage: /cockpit codeflow --approved <task> (or /cockpit preplan <task> first)", "warning");
						return;
					}
					const approvedPrefix = body.match(/^(?:--approved|approved:)\s+([\s\S]+)$/i);
					if (!approvedPrefix) {
						const job = jobService.start({ flow: "codeflow-preplan", plan: body, notify: false });
						ctx.ui.notify([
							"Started read-only codeflow preplan instead of writer execution.",
							`Job: ${job.id}`,
							"Review it with /cockpit job " + job.id + ", show the plan to the user, and wait for explicit approval.",
							"After approval, run: /cockpit codeflow --approved <same task plus approved plan/constraints>",
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
					jobService.start({ flow: "instant", plan: body, file: fileFromPlan(body, config) });
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
					jobService.start({ flow: "normal", plan: body });
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
		name: "cockpit_job",
		label: "Cockpit Async Job",
		description: "Start one or many, list, read, or cancel in-memory async Cockpit delegate/codeflow jobs without blocking the main chat.",
		promptSnippet: "Manage a Cockpit async job",
		promptGuidelines: [
			"Use action=start when the user wants one delegate to run in the background while the Oracle keeps chatting.",
			"For codeflow UX, prefer flow=codeflow-preplan before any writer execution unless the user explicitly approved a concrete initial plan/slice.",
			"If action=start uses flow=codeflow without approved=true, Cockpit will run codeflow-preplan instead of writer execution.",
			"Use action=startMany for parallel independent jobs; this does not group or synthesize results.",
			"Use list/read/cancel to inspect or stop jobs. Jobs are in-memory only and disappear when the Pi process exits.",
			"Prefer read-only flows like research/reviewer for background exploration; use normal only for scoped coding work.",
		],
		parameters: Type.Object({
			action: Type.String({ description: "start, startMany, list, read, or cancel" }),
			flow: Type.Optional(Type.String({ description: "Flow for start: codeflow-preplan, codeflow, instant, fast, ideate, research, normal, planner, reviewer, task-writer, or taskWriter" })),
			plan: Type.Optional(Type.String({ description: "Task/plan for action=start" })),
			approved: Type.Optional(Type.Boolean({ description: "For flow=codeflow only: true means the user explicitly approved the initial plan/slice. Without it, codeflow is downgraded to codeflow-preplan." })),
			jobs: Type.Optional(Type.Array(Type.Object({
				flow: Type.String({ description: "Flow for this parallel independent job" }),
				plan: Type.String({ description: "Task/plan for this parallel independent job" }),
				outputFile: Type.Optional(Type.String({ description: "Optional exclusive file this job may write/edit; duplicate output files are rejected" })),
			}))),
			id: Type.Optional(Type.String({ description: "Job id or unique prefix for read/cancel" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const action = params.action.trim().toLowerCase();
			if (action === "list") {
				const activeJobs = listAsyncJobs();
				return { content: [{ type: "text" as const, text: activeJobs.length > 0 ? activeJobs.map(formatJobSummary).join("\n") : "No cockpit jobs in memory." }], details: { jobs: activeJobs.map(({ id, flow, plan, status, startedAt, finishedAt }) => ({ id, flow, plan, status, startedAt, finishedAt })) } };
			}
			if (action === "read") {
				const job = params.id ? getAsyncJob(params.id) : undefined;
				return { content: [{ type: "text" as const, text: job ? formatJobDetail(job) : `No unique cockpit job found for: ${params.id ?? ""}` }], details: { id: job?.id, status: job?.status }, isError: !job };
			}
			if (action === "cancel") {
				const job = params.id ? cancelAsyncJob(params.id) : undefined;
				const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
				createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).refreshProgress();
				return { content: [{ type: "text" as const, text: job ? `Cockpit job ${job.id} status: ${job.status}` : `No unique cockpit job found for: ${params.id ?? ""}` }], details: { id: job?.id, status: job?.status }, isError: !job };
			}
			if (action === "startmany") {
				const requestedJobs = params.jobs ?? [];
				const invalid = requestedJobs.find((job) => !isJobFlowName(job.flow.trim()) || !job.plan.trim());
				if (requestedJobs.length === 0 || invalid) {
					return { content: [{ type: "text" as const, text: "Usage: action=startMany requires jobs: [{ flow, plan, outputFile? }, ...] with valid flows and non-empty plans." }], details: {}, isError: true };
				}
				const claimedFiles = new Map<string, string>();
				for (const job of requestedJobs) {
					if (!job.outputFile?.trim()) continue;
					const normalized = normalizeOwnedFile(job.outputFile);
					const existing = claimedFiles.get(normalized);
					if (existing) {
						return { content: [{ type: "text" as const, text: `Parallel file ownership conflict: '${normalized}' is claimed by both '${existing}' and '${job.flow}'.` }], details: {}, isError: true };
					}
					claimedFiles.set(normalized, job.flow);
				}
				const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
				const jobs = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).startMany(
					requestedJobs.map((job) => {
						const outputFile = job.outputFile?.trim() ? normalizeOwnedFile(job.outputFile) : undefined;
						const plan = outputFile ? withFileOwnershipGuard(outputFile, job.plan.trim()) : job.plan.trim();
						return { flow: job.flow.trim() as JobFlowName, plan, outputFile, notify: false };
					}),
				);
				return {
					content: [{ type: "text" as const, text: startedManyMessage(jobs) }],
					details: { jobs: jobs.map(({ id, flow, status }) => ({ id, flow, status })) },
				};
			}
			if (action !== "start") {
				return { content: [{ type: "text" as const, text: "Usage: action must be start, startMany, list, read, or cancel." }], details: {}, isError: true };
			}

			const flow = params.flow?.trim() ?? "";
			const plan = params.plan?.trim() ?? "";
			if (!isJobFlowName(flow) || !plan) {
				return { content: [{ type: "text" as const, text: "Usage: action=start requires flow and plan." }], details: {}, isError: true };
			}
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow, plan, approved: params.approved === true, notify: false });
			return {
				content: [{ type: "text" as const, text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_codeflow",
		label: "Cockpit Codeflow",
		description: "Start Cockpit codeflow. Without explicit approval this starts only a read-only preplan; with approval it starts writer execution, review loop, and feedback-weight routing.",
		promptSnippet: "Run or preplan the Cockpit codeflow",
		promptGuidelines: [
			"Use cockpit_codeflow when the user asks to run the full codeflow or wants planning, coding, and review handled by Cockpit.",
			"Initial plan approval is mandatory before writer execution. If the user has not explicitly approved a concrete plan/slice, call this with approved=false or omit approved; it will start a read-only preplan job.",
			"After the preplan job completes, read it, summarize the proposed slice/constraints/validation to the user, and wait for explicit approval before calling approved=true.",
			"When approved=true, include the approved plan/slice and constraints in plan, not just the original task.",
			"The tool starts a background job and returns a job id immediately; read results later with cockpit_job action=read or /cockpit job <id>.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("codeflow", { description: "Only codeflow is supported" })),
			plan: Type.String({ description: "Original user coding task, or approved task plus approved plan/constraints when approved=true" }),
			approved: Type.Optional(Type.Boolean({ description: "Set true only after explicit user approval of the initial plan/slice. Defaults to false and runs preplan only." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const approved = params.approved === true;
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow: approved ? "codeflow" : "codeflow-preplan", plan: params.plan, approved, notify: false });
			const text = approved
				? startedMessage(job)
				: [
					"Started read-only cockpit codeflow preplan job.",
					`Job: ${job.id}`,
					"No writer/executor will run from this job. Read the job, show the plan to the user, and wait for explicit approval before starting approved codeflow.",
				].join("\n");
			return {
				content: [{ type: "text", text }],
				details: { id: job.id, flow: job.flow, status: job.status, approved },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_delegate",
		label: "Instant Cockpit Delegate",
		description: "Run the instant delegate flow for one tiny, exact code edit from a cockpit-supplied plan.",
		promptSnippet: "Run an instant delegate flow",
		promptGuidelines: [
			"Use cockpit_delegate directly when the Oracle already has a concrete one-file plan for a tiny, low-risk edit; do not call the planner first unless a verbose handoff would materially help.",
			"Always pass the exact file, and pass line when known, so the instant delegate does not discover scope.",
			"Do not use cockpit_delegate for security, persistence, deployment, architecture, or ambiguous product decisions.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("instant", { description: "Only instant is supported" })),
			plan: Type.String({ description: "Simple cockpit plan for the instant delegate to execute" }),
			file: Type.String({ description: "The single file the instant delegate may read/edit" }),
			line: Type.Optional(Type.Number({ description: "Target line number when the cockpit knows it" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow: "instant", plan: params.plan, file: params.file, line: params.line, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_fast",
		label: "Fast Cockpit Delegate",
		description: "Run the fast delegate flow for a small semantic task with local discovery and low thinking.",
		promptSnippet: "Run a fast delegate flow",
		promptGuidelines: [
			"Use cockpit_fast directly for small semantic tasks where the delegate should discover local context itself, such as building a codemap; do not call the planner first unless the Oracle wants a more verbose plan.",
			"Keep the cockpit prompt compact; do not pre-scan the project in the main chat.",
			"Do not use cockpit_fast for risky security, persistence, deployment, or broad refactor decisions.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("fast", { description: "Only fast is supported" })),
			plan: Type.String({ description: "Small semantic task for the fast delegate" }),
			outputFile: Type.Optional(Type.String({ description: "Primary output file; defaults to CODEMAP.md" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow: "fast", plan: params.plan, outputFile: params.outputFile, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
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
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow: "research", plan: params.plan, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
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
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow: "ideate", plan: params.plan, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
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
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow: "normal", plan: params.plan, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_task_writer",
		label: "Task Writer Cockpit Delegate",
		description: "Run the low-thinking PM-style task writer delegate to create task packets for later Cockpit agents.",
		promptSnippet: "Write a Cockpit task packet",
		promptGuidelines: [
			"Use cockpit_task_writer when the user wants to capture an idea, backlog item, bug, or future work as a reusable task packet.",
			"The task writer should not implement code; it writes objective, scope, acceptance criteria, suggested route, validation, risks, and a ready-to-run prompt.",
			"Pass outputFile only when the user wants the packet saved to a markdown file; otherwise return the packet inline.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("task-writer", { description: "Only task-writer is supported" })),
			plan: Type.String({ description: "Idea, backlog item, bug, or future work to turn into a task packet" }),
			outputFile: Type.Optional(Type.String({ description: "Optional markdown file to create/update with the task packet" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow: "task-writer", plan: params.plan, outputFile: params.outputFile, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
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
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow: "reviewer", plan: params.plan, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
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
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }).start({ flow: "planner", plan: params.plan, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});
}
