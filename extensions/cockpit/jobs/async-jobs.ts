import { runCodeflow, runCodeflowPreplan } from "../codeflow.js";
import type { CockpitConfig } from "../config.js";
import type { DelegateRunResult } from "../delegates/protocol.js";
import { runRole } from "../delegates/runner.js";
import { flowConfigKeyForRole, isRoleName, type RoleInputName } from "../delegates/roles.js";
import { appendJobEvent, artifactDirFor, initJobArtifacts, writeJobSnapshot, writeResumePrompt } from "./artifacts.js";

export type JobFlowName = RoleInputName | "codeflow" | "codeflow-preplan";
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
	artifactsDir: string;
	startedAt: number;
	finishedAt?: number;
	timeoutMs: number;
	maxTurns?: number;
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
const timeoutMsForFlow = (flow: CanonicalJobFlowName, config: CockpitConfig): number => {
	if (flow === "codeflow") return 900000;
	if (flow === "codeflow-preplan") return 420000;
	return config.delegateFlows[flowConfigKeyForRole(flow)].timeoutMs;
};
const maxTurnsForFlow = (flow: CanonicalJobFlowName, config: CockpitConfig): number | undefined => {
	if (flow === "codeflow" || flow === "codeflow-preplan") return undefined;
	return config.delegateFlows[flowConfigKeyForRole(flow)].maxTurns;
};
const age = (job: AsyncJob): number => (job.finishedAt ?? Date.now()) - job.startedAt;
const progress = (job: AsyncJob): number => {
	if (job.status === "done") return 1;
	if (job.result?.turnCount && job.maxTurns) return Math.min(0.95, job.result.turnCount / job.maxTurns);
	if (job.status === "failed" || job.status === "cancelled") return Math.min(1, age(job) / job.timeoutMs);
	return Math.min(0.95, age(job) / job.timeoutMs);
};

export function formatProgressBar(job: AsyncJob, width = 16): string {
	const ratio = progress(job);
	const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
	const turnText = job.result?.turnCount && job.maxTurns ? ` turn ${job.result.turnCount}/${job.maxTurns}` : "";
	return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]${turnText}`;
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
	return value === "codeflow" || value === "codeflow-preplan" || value === "taskWriter" || isRoleName(value);
}

export function startAsyncJob(options: StartJobOptions): AsyncJob {
	const id = makeId();
	const controller = new AbortController();
	const flow = canonicalFlowName(options.flow);
	const timeoutMs = timeoutMsForFlow(flow, options.config);
	const maxTurns = maxTurnsForFlow(flow, options.config);
	const job: AsyncJob = {
		id,
		flow,
		plan: options.plan.trim(),
		status: "running",
		output: "",
		stderr: "",
		artifactsDir: artifactDirFor(options.cwd, id),
		startedAt: Date.now(),
		timeoutMs,
		maxTurns,
		controller,
	};
	jobs.set(id, job);
	void initJobArtifacts(options.cwd, job).catch((error: unknown) => {
		job.stderr = [job.stderr, `Cockpit artifact init failed: ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join("\n");
	});

	const context = {
		cwd: options.cwd,
		projectTrusted: options.projectTrusted,
		signal: controller.signal,
		onUpdate: (partial: { content: Array<{ text?: string }>; details: DelegateRunResult & { stderr: string } }) => {
			const text = partial.content.map((item) => item.text).filter(Boolean).join("\n").trim();
			if (text) job.output = text;
			job.stderr = partial.details.stderr;
			job.result = partial.details;
			void appendJobEvent(job, "cockpit.job.update", { message: text.slice(0, 500) }).catch(() => undefined);
			void writeJobSnapshot(job).catch(() => undefined);
		},
	};

	const delegateInput = {
		plan: job.plan,
		file: options.file,
		line: options.line,
		outputFile: options.outputFile,
	};

	const runner = flow === "codeflow"
		? runCodeflow({ plan: job.plan, outputFile: options.outputFile }, options.config, context)
		: flow === "codeflow-preplan"
			? runCodeflowPreplan({ plan: job.plan, outputFile: options.outputFile }, options.config, context)
			: runRole(flow, delegateInput, options.config, context);

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
		.finally(async () => {
			job.finishedAt = Date.now();
			await appendJobEvent(job, "cockpit.job.finished", { status: job.status, blockedReason: job.blockedReason, error: job.error }).catch(() => undefined);
			await writeJobSnapshot(job).catch(() => undefined);
			if (job.status === "failed" || job.status === "cancelled") await writeResumePrompt(job).catch(() => undefined);
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
	const turnText = job.result?.turnCount && job.maxTurns ? `turn ${job.result.turnCount}/${job.maxTurns}, ` : "";
	const suffix = job.status === "running" ? `running ${turnText}${elapsed}` : `${job.status} in ${turnText}${elapsed}`;
	return `${job.id}  ${job.flow.padEnd(11)}  ${formatProgressBar(job)}  ${suffix}  ${job.plan.slice(0, 80)}`;
}

export function formatJobDetail(job: AsyncJob): string {
	return [
		`# Cockpit Job ${job.id}`,
		`Flow: ${job.flow}`,
		`Status: ${job.status}`,
		`Elapsed: ${Math.round(age(job) / 1000)}s`,
		job.result?.turnCount && job.maxTurns ? `Turns: ${job.result.turnCount}/${job.maxTurns}` : undefined,
		`Progress: ${formatProgressBar(job, 24)}`,
		job.blockedReason ? `Blocked: ${job.blockedReason}` : undefined,
		job.error ? `Error: ${job.error}` : undefined,
		`Artifacts: ${job.artifactsDir}`,
		(job.status === "failed" || job.status === "cancelled") ? `Resume prompt: ${job.artifactsDir}/resume.md` : undefined,
		"",
		"## Plan",
		job.plan,
		"",
		"## Output",
		job.output || "(no output yet)",
		job.stderr ? `\n## Stderr\n${job.stderr}` : undefined,
	].filter((line): line is string => line !== undefined).join("\n");
}
