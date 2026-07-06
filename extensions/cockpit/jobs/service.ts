import type { CockpitConfig } from "../config.js";
import { routeTask } from "../routing.js";
import type { AsyncJob, JobFlowName } from "./async-jobs.js";
import { formatJobSummary, listAsyncJobs, startAsyncJob } from "./async-jobs.js";

export type JobUi = {
	setStatus(key: string, value: string | undefined): void;
	setWidget(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	notify(message: string, level?: "info" | "warning" | "error"): void;
	sendJobResult(job: AsyncJob): void;
};

export type JobServiceContext = {
	cwd: string;
	projectTrusted: boolean;
	ui: JobUi;
};

export type StartDelegateJobInput = {
	flow: JobFlowName;
	plan: string;
	file?: string;
	line?: number;
	outputFile?: string;
	approved?: boolean;
	notify?: boolean;
	onFinish?: (job: AsyncJob) => void | Promise<void>;
};

const fileFromPlan = (plan: string, config: CockpitConfig): string => routeTask(plan, config, true).signals.mentionedFiles[0] ?? "";

let progressTimer: NodeJS.Timeout | undefined;
let activeRefreshProgress: (() => void) | undefined;

export function createJobService(config: CockpitConfig, context: JobServiceContext) {
	const refreshProgress = () => {
		const running = listAsyncJobs().filter((candidate) => candidate.status === "running");
		context.ui.setStatus("cockpit-jobs", running.length > 0 ? `jobs: ${running.length} running` : undefined);
		context.ui.setWidget("cockpit-jobs", running.length > 0 ? ["Cockpit jobs", ...running.map(formatJobSummary)] : undefined, { placement: "belowEditor" });
		if (running.length === 0 && progressTimer) {
			clearInterval(progressTimer);
			progressTimer = undefined;
		}
	};

	const ensureTimer = () => {
		activeRefreshProgress = refreshProgress;
		if (!progressTimer) progressTimer = setInterval(() => activeRefreshProgress?.(), 1000);
	};

	const start = (input: StartDelegateJobInput): AsyncJob => {
		const plan = input.plan.trim();
		const flow = input.flow === "codeflow" && input.approved !== true ? "codeflow-preplan" : input.flow;
		const job = startAsyncJob({
			flow,
			plan,
			config,
			cwd: context.cwd,
			projectTrusted: context.projectTrusted,
			file: input.file ?? (input.flow === "instant" ? fileFromPlan(plan, config) : undefined),
			line: input.line,
			outputFile: input.outputFile,
			onFinish: (finished) => {
				refreshProgress();
				if (input.onFinish) {
					void Promise.resolve(input.onFinish(finished)).catch((error: unknown) => {
						context.ui.notify(`Cockpit job finish handler failed: ${error instanceof Error ? error.message : String(error)}`, "error");
					});
				} else {
					const level = finished.status === "failed" ? "error" : finished.status === "cancelled" ? "warning" : "info";
					context.ui.notify(`Cockpit job ${finished.id} ${finished.status}. Read it with: /cockpit job ${finished.id}`, level);
					if (finished.status === "done" || finished.status === "failed") context.ui.sendJobResult(finished);
				}
			},
		});
		ensureTimer();
		refreshProgress();
		if (input.notify !== false) {
			context.ui.notify(startedMessage(job), "info");
		}
		return job;
	};

	const startMany = (inputs: StartDelegateJobInput[]): AsyncJob[] => {
		const jobs = inputs.map((input) => start({ ...input, notify: false }));
		if (jobs.length > 0) {
			context.ui.notify(startedManyMessage(jobs), "info");
		}
		return jobs;
	};

	return { start, startMany, refreshProgress };
}

export const startedMessage = (job: AsyncJob): string =>
	`Started cockpit ${job.flow} job ${job.id}. Keep chatting; check with /cockpit job ${job.id} or /cockpit jobs.`;

export const startedManyMessage = (jobs: AsyncJob[]): string =>
	`Started ${jobs.length} cockpit jobs:\n${jobs.map((job) => `- ${job.id} ${job.flow}: ${job.plan.slice(0, 80)}`).join("\n")}\nCheck with /cockpit jobs.`;
