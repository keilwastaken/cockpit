import { runCodeflow } from "../codeflow.js";
import type { CockpitConfig } from "../config.js";
import { delegates } from "../delegates/registry.js";
import type { DelegateRunResult } from "../delegates/protocol.js";

export type JobFlowName = keyof typeof delegates | "codeflow";
export type CanonicalJobFlowName = Exclude<JobFlowName, "taskWriter">;
export type JobStatus = "running" | "done" | "failed" | "cancelled";

export type AsyncJob = {
	id: string;
	flow: CanonicalJobFlowName;
	plan: string;
	status: JobStatus;
	output: string;
	stderr: string;
	blockedReason?: string;
	error?: string;
	result?: DelegateRunResult;
	startedAt: number;
	finishedAt?: number;
	timeoutMs: number;
	controller: AbortController;
};

export type StartJobOptions = {
	flow: JobFlowName;
	plan: string;
	config: CockpitConfig;
	cwd: string;
	projectTrusted: boolean;
	file?: string;
	line?: number;
	outputFile?: string;
	onFinish?: (job: AsyncJob) => void;
};

const jobs = new Map<string, AsyncJob>();
const maxCompletedJobs = 50;

const makeId = (): string => crypto.randomUUID().slice(0, 8);
const canonicalFlowName = (flow: JobFlowName): CanonicalJobFlowName => (flow === "taskWriter" ? "task-writer" : flow);
const age = (job: AsyncJob): number => (job.finishedAt ?? Date.now()) - job.startedAt;
const progress = (job: AsyncJob): number => {
	if (job.status === "done") return 1;
	if (job.status === "failed" || job.status === "cancelled") return Math.min(1, age(job) / job.timeoutMs);
	return Math.min(0.95, age(job) / job.timeoutMs);
};

export function formatProgressBar(job: AsyncJob, width = 16): string {
	const ratio = progress(job);
	const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
	return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${Math.round(ratio * 100).toString().padStart(3)}%`;
}

function trimCompletedJobs(): void {
	const completed = [...jobs.values()]
		.filter((job) => job.status !== "running")
		.sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
	for (const job of completed.slice(0, Math.max(0, completed.length - maxCompletedJobs))) {
		jobs.delete(job.id);
	}
}

export function isJobFlowName(value: string): value is JobFlowName {
	return value === "codeflow" || Object.prototype.hasOwnProperty.call(delegates, value);
}

export function startAsyncJob(options: StartJobOptions): AsyncJob {
	const id = makeId();
	const controller = new AbortController();
	const flow = canonicalFlowName(options.flow);
	const flowConfigKey = (flow === "task-writer" ? "taskWriter" : flow) as keyof CockpitConfig["delegateFlows"];
	const timeoutMs = flow === "codeflow" ? 900000 : options.config.delegateFlows[flowConfigKey].timeoutMs;
	const job: AsyncJob = {
		id,
		flow,
		plan: options.plan.trim(),
		status: "running",
		output: "",
		stderr: "",
		startedAt: Date.now(),
		timeoutMs,
		controller,
	};
	jobs.set(id, job);

	const runner = flow === "codeflow"
		? runCodeflow(
			{ plan: job.plan, outputFile: options.outputFile },
			options.config,
			{
				cwd: options.cwd,
				projectTrusted: options.projectTrusted,
				signal: controller.signal,
				onUpdate: (partial) => {
					const text = partial.content.map((item) => item.text).filter(Boolean).join("\n").trim();
					if (text) job.output = text;
					job.stderr = partial.details.stderr;
				},
			},
		)
		: delegates[flow].run(
			{
				plan: job.plan,
				file: options.file,
				line: options.line,
				outputFile: options.outputFile,
			},
			options.config,
			{
				cwd: options.cwd,
				projectTrusted: options.projectTrusted,
				signal: controller.signal,
				onUpdate: (partial) => {
					const text = partial.content.map((item) => item.text).filter(Boolean).join("\n").trim();
					if (text) job.output = text;
					job.stderr = partial.details.stderr;
				},
			},
		);

	void runner
		.then((result) => {
			job.result = result;
			job.output = result.finalOutput || job.output;
			job.stderr = result.stderr;
			job.blockedReason = result.blockedReason;
			job.status = controller.signal.aborted ? "cancelled" : result.exitCode === 0 && !result.blockedReason ? "done" : "failed";
		})
		.catch((error: unknown) => {
			job.status = controller.signal.aborted ? "cancelled" : "failed";
			job.error = error instanceof Error ? error.message : String(error);
		})
		.finally(() => {
			job.finishedAt = Date.now();
			trimCompletedJobs();
			options.onFinish?.(job);
		});

	return job;
}

export function listAsyncJobs(): AsyncJob[] {
	return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function getAsyncJob(idPrefix: string): AsyncJob | undefined {
	const exact = jobs.get(idPrefix);
	if (exact) return exact;
	const matches = [...jobs.values()].filter((job) => job.id.startsWith(idPrefix));
	return matches.length === 1 ? matches[0] : undefined;
}

export function cancelAsyncJob(idPrefix: string): AsyncJob | undefined {
	const job = getAsyncJob(idPrefix);
	if (!job || job.status !== "running") return job;
	job.controller.abort();
	job.status = "cancelled";
	job.finishedAt = Date.now();
	return job;
}

export function formatJobSummary(job: AsyncJob): string {
	const elapsed = `${Math.round(age(job) / 1000)}s`;
	const suffix = job.status === "running" ? `running ${elapsed}` : `${job.status} in ${elapsed}`;
	return `${job.id}  ${job.flow.padEnd(11)}  ${formatProgressBar(job)}  ${suffix}  ${job.plan.slice(0, 80)}`;
}

export function formatJobDetail(job: AsyncJob): string {
	return [
		`# Cockpit Job ${job.id}`,
		`Flow: ${job.flow}`,
		`Status: ${job.status}`,
		`Elapsed: ${Math.round(age(job) / 1000)}s`,
		`Progress: ${formatProgressBar(job, 24)}`,
		job.blockedReason ? `Blocked: ${job.blockedReason}` : undefined,
		job.error ? `Error: ${job.error}` : undefined,
		"",
		"## Plan",
		job.plan,
		"",
		"## Output",
		job.output || "(no output yet)",
		job.stderr ? `\n## Stderr\n${job.stderr}` : undefined,
	].filter((line): line is string => line !== undefined).join("\n");
}
