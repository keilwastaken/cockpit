import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { cancelAsyncJob, formatJobDetail, formatJobSummary, getAsyncJob, isJobFlowName, listAsyncJobs } from "../jobs/async-jobs.js";
import type { JobFlowName } from "../jobs/async-jobs.js";
import { createJobService, startedManyMessage, startedMessage } from "../jobs/service.js";
import { makeJobUi, sendJobResult } from "../jobs/ui.js";
import { createCockpitRuntime } from "../runtime.js";
import { normalizeOwnedFile, withFileOwnershipGuard } from "../shared/files.js";

export function registerCockpitTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "cockpit_job",
		label: "Cockpit Async Job",
		description: "Manage Cockpit background jobs. Cockpit is context-budget autopilot: keep Oracle context small by delegating noisy detail work to cheaper/faster/specialized workers; use direct tools only for tiny maneuvers where spawn overhead would be wasteful.",
		promptSnippet: "Manage a Cockpit async job",
		promptGuidelines: [
			"Delegate by default when work needs search, multiple files, tests/logs, uncertainty, review, or a cheaper/specialized model.",
			"For codeflow UX, prefer flow=codeflow-preplan before any writer execution unless the user explicitly approved a concrete initial plan/slice.",
			"If action=start uses flow=codeflow without approved=true, Cockpit will run codeflow-preplan instead of writer execution.",
			"Use action=startMany for parallel independent jobs; this does not group or synthesize results.",
			"Use list/read/cancel to inspect or stop jobs. Use resume to continue a failed/cancelled job from its generated resume prompt.",
			"Use direct tools only for tiny/interactive maneuvers; prefer read-only flows like ideate/research/reviewer for context-heavy exploration and normal for scoped coding work that benefits from isolation.",
		],
		parameters: Type.Object({
			action: Type.String({ description: "start, startMany, list, read, resume, or cancel" }),
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
				const { config } = await createCockpitRuntime(pi, ctx);
				createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).refreshProgress();
				return { content: [{ type: "text" as const, text: job ? `Cockpit job ${job.id} status: ${job.status}` : `No unique cockpit job found for: ${params.id ?? ""}` }], details: { id: job?.id, status: job?.status }, isError: !job };
			}
			if (action === "resume") {
				const id = params.id?.trim() ?? "";
				if (!id) return { content: [{ type: "text" as const, text: "Usage: action=resume requires id." }], details: {}, isError: true };
				const prior = getAsyncJob(id);
				const resumePath = prior?.artifactsDir ? join(prior.artifactsDir, "resume.md") : join(ctx.cwd, ".pi", "cockpit", "jobs", id, "resume.md");
				let resumePrompt = "";
				try {
					resumePrompt = await readFile(resumePath, "utf8");
				} catch (error) {
					return { content: [{ type: "text" as const, text: `Could not read resume prompt at ${resumePath}: ${(error as Error).message}` }], details: { resumePath }, isError: true };
				}
				const { config } = await createCockpitRuntime(pi, ctx);
				const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "normal", plan: resumePrompt, notify: false });
				return { content: [{ type: "text" as const, text: `Started cockpit resume job ${job.id} from ${id}. Check with /cockpit job ${job.id}.` }], details: { id: job.id, flow: job.flow, status: job.status, resumePath } };
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
				const { config } = await createCockpitRuntime(pi, ctx);
				const jobs = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).startMany(
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
				return { content: [{ type: "text" as const, text: "Usage: action must be start, startMany, list, read, resume, or cancel." }], details: {}, isError: true };
			}

			const flow = params.flow?.trim() ?? "";
			const plan = params.plan?.trim() ?? "";
			if (!isJobFlowName(flow) || !plan) {
				return { content: [{ type: "text" as const, text: "Usage: action=start requires flow and plan." }], details: {}, isError: true };
			}
			const { config } = await createCockpitRuntime(pi, ctx);
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow, plan, approved: params.approved === true, notify: false });
			return {
				content: [{ type: "text" as const, text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_codeflow",
		label: "Cockpit Codeflow",
		description: "Start Cockpit's larger-work autopilot. Use for multi-step or risky work that deserves read-only preplanning, explicit approval, writer execution, review loop, and feedback-weight routing; skip it only for tiny direct maneuvers.",
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
			const { config } = await createCockpitRuntime(pi, ctx);
			const approved = params.approved === true;
			if (approved) {
				const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "codeflow", plan: params.plan, approved: true, notify: false });
				return {
					content: [{ type: "text", text: startedMessage(job) }],
					details: { id: job.id, flow: job.flow, status: job.status, approved: true },
				};
			}

			const jobService = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) });
			const job = jobService.start({
				flow: "codeflow-preplan",
				plan: params.plan,
				notify: false,
				onFinish: async (finished) => {
					if (finished.status === "done" || finished.status === "failed") {
						sendJobResult(pi, finished);
					}
					if (finished.status === "done") {
						const ok = await ctx.ui.confirm("Cockpit Codeflow", "Approve this preplan and start execution?");
						if (ok) {
							jobService.start({ flow: "codeflow", plan: `${params.plan}\n\nApproved plan:\n${finished.output}`, approved: true });
						} else {
							ctx.ui.notify("Codeflow preplan rejected.", "warning");
						}
					} else {
						const level = finished.status === "failed" ? "error" : "warning";
						ctx.ui.notify(`Codeflow preplan ${finished.status}.`, level);
					}
				}
			});

			const text = [
				"Started read-only cockpit codeflow preplan job.",
				`Job: ${job.id}`,
				"An approval dialog will automatically appear for the user when the plan is ready. You do not need to call codeflow again.",
			].join("\n");
			return {
				content: [{ type: "text", text }],
				details: { id: job.id, flow: job.flow, status: job.status, approved: false },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_delegate",
		label: "Instant Cockpit Delegate",
		description: "Run the instant delegate for a tiny, exact one-file edit when isolation is useful. The Oracle may instead edit directly with instant discipline when spawn overhead would exceed context savings.",
		promptSnippet: "Run an instant delegate flow",
		promptGuidelines: [
			"Use cockpit_delegate when the Oracle already has a concrete one-file plan and isolation is worth the spawn overhead; otherwise direct edit with instant discipline is acceptable.",
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
			const { config } = await createCockpitRuntime(pi, ctx);
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "instant", plan: params.plan, file: params.file, line: params.line, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_fast",
		label: "Fast Cockpit Delegate",
		description: "Run the fast delegate for small bounded work whose local discovery would clutter Oracle context. Prefer this over direct work once search, multiple reads, or validation output is likely.",
		promptSnippet: "Run a fast delegate flow",
		promptGuidelines: [
			"Use cockpit_fast when a compact background worker should do targeted local discovery or a small semantic task, such as building a codemap.",
			"Use direct patching only if the Oracle can finish with tiny context growth. Keep the cockpit prompt compact; do not pre-scan the project in the main chat.",
			"Do not use cockpit_fast for risky security, persistence, deployment, or broad refactor decisions.",
		],
		parameters: Type.Object({
			flow: Type.Optional(Type.Literal("fast", { description: "Only fast is supported" })),
			plan: Type.String({ description: "Small semantic task for the fast delegate" }),
			outputFile: Type.Optional(Type.String({ description: "Primary output file; defaults to CODEMAP.md" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { config } = await createCockpitRuntime(pi, ctx);
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "fast", plan: params.plan, outputFile: params.outputFile, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_research",
		label: "Research Cockpit Delegate",
		description: "Run a read-only research delegate when codebase search/output would pollute the main Oracle context or should happen in the background; returns a concise evidence brief.",
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
			const { config } = await createCockpitRuntime(pi, ctx);
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "research", plan: params.plan, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_ideate",
		label: "Ideate Cockpit Delegate",
		description: "Run read-only divergent ideation when the user's desired direction is unclear or tradeoff-heavy. This is for option space, not implementation.",
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
			const { config } = await createCockpitRuntime(pi, ctx);
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "ideate", plan: params.plan, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_normal",
		label: "Normal Cockpit Delegate",
		description: "Run a bounded background coding delegate from a concrete plan when implementation benefits from context isolation, cheaper hands models, or keeping validation/debug output out of the Oracle context.",
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
			const { config } = await createCockpitRuntime(pi, ctx);
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "normal", plan: params.plan, notify: false });
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
			const { config } = await createCockpitRuntime(pi, ctx);
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "task-writer", plan: params.plan, outputFile: params.outputFile, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "cockpit_review",
		label: "Reviewer Cockpit Delegate",
		description: "Run a read-only reviewer over nontrivial changes or a git range, returning issue severities and feedback weight for Cockpit's next maneuver.",
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
			const { config } = await createCockpitRuntime(pi, ctx);
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "reviewer", plan: params.plan, notify: false });
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
			const { config } = await createCockpitRuntime(pi, ctx);
			const job = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) }).start({ flow: "planner", plan: params.plan, notify: false });
			return {
				content: [{ type: "text", text: startedMessage(job) }],
				details: { id: job.id, flow: job.flow, status: job.status },
			};
		},
	});
}
