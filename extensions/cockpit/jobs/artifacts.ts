import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DelegateRunResult } from "../delegates/protocol.js";
import type { AsyncJob } from "./async-jobs.js";

type ArtifactJob = Omit<AsyncJob, "controller" | "result"> & { result?: DelegateRunResult };

type ArtifactEvent = {
	type: string;
	at: string;
	jobId: string;
	flow: string;
	data?: Record<string, unknown>;
};

const nowIso = (): string => new Date().toISOString();
const safeName = (name: string): string => name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "step";

export const artifactDirFor = (cwd: string, jobId: string): string => join(cwd, ".pi", "cockpit", "jobs", jobId);

function serializableJob(job: ArtifactJob) {
	return {
		id: job.id,
		flow: job.flow,
		status: job.status,
		startedAt: job.startedAt,
		finishedAt: job.finishedAt,
		timeoutMs: job.timeoutMs,
		blockedReason: job.blockedReason,
		error: job.error,
		artifactsDir: job.artifactsDir,
		planPreview: job.plan.slice(0, 500),
		outputPreview: job.output.slice(0, 1000),
		stderrPreview: job.stderr.slice(0, 1000),
		result: job.result ? {
			flow: job.result.flow,
			exitCode: job.result.exitCode,
			blockedReason: job.result.blockedReason,
			allowedFiles: job.result.allowedFiles,
			tools: job.result.tools,
		} : undefined,
	};
}

export async function initJobArtifacts(_cwd: string, job: ArtifactJob): Promise<void> {
	if (!job.artifactsDir) return;
	await mkdir(join(job.artifactsDir, "steps"), { recursive: true });
	await writeFile(join(job.artifactsDir, "plan.md"), `${job.plan}\n`, "utf8");
	await writeJobStatus(job);
	await appendJobEvent(job, "cockpit.job.started");
}

export async function appendJobEvent(job: ArtifactJob, type: string, data?: Record<string, unknown>): Promise<void> {
	if (!job.artifactsDir) return;
	const event: ArtifactEvent = { type, at: nowIso(), jobId: job.id, flow: job.flow, data };
	await appendFile(join(job.artifactsDir, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
}

export async function writeJobStatus(job: ArtifactJob): Promise<void> {
	if (!job.artifactsDir) return;
	await mkdir(job.artifactsDir, { recursive: true });
	await writeFile(join(job.artifactsDir, "status.json"), `${JSON.stringify(serializableJob(job), null, "\t")}\n`, "utf8");
}

export async function writeJobSnapshot(job: ArtifactJob): Promise<void> {
	if (!job.artifactsDir) return;
	await mkdir(join(job.artifactsDir, "steps"), { recursive: true });
	await writeJobStatus(job);
	await writeFile(join(job.artifactsDir, "output.md"), `${job.output || ""}\n`, "utf8");
	if (job.stderr) await writeFile(join(job.artifactsDir, "stderr.log"), `${job.stderr}\n`, "utf8");
	const resultWithSteps = job.result as unknown as { steps?: Array<{ name: string; exitCode: number; blockedReason?: string; finalOutput?: string }> } | undefined;
	const steps = Array.isArray(resultWithSteps?.steps) ? resultWithSteps.steps : [];
	await Promise.all(steps.map((step, index) => writeFile(
		join(job.artifactsDir!, "steps", `${String(index + 1).padStart(2, "0")}-${safeName(step.name)}.md`),
		[
			`# ${step.name}`,
			`Exit code: ${step.exitCode}`,
			step.blockedReason ? `Blocked: ${step.blockedReason}` : undefined,
			"",
			step.finalOutput || "",
		].filter((line): line is string => line !== undefined).join("\n"),
		"utf8",
	)));
}

export async function writeResumePrompt(job: ArtifactJob): Promise<void> {
	if (!job.artifactsDir) return;
	const text = [
		`# Resume Cockpit Job ${job.id}`,
		`Flow: ${job.flow}`,
		`Status: ${job.status}`,
		job.blockedReason ? `Blocked: ${job.blockedReason}` : undefined,
		job.error ? `Error: ${job.error}` : undefined,
		"",
		"## Original Plan",
		job.plan,
		"",
		"## Last Output",
		job.output || "(no output captured)",
		"",
		"## Suggested continuation prompt",
		"Continue this Cockpit job from the current working tree. First inspect `git status --short` and the current diff. Use the original plan and captured output above as context, but do not repeat completed work. If the prior run timed out, split the remaining work into a smaller focused task. Do not commit, deploy, publish, or run destructive commands.",
	].filter((line): line is string => line !== undefined).join("\n");
	await writeFile(join(job.artifactsDir, "resume.md"), `${text}\n`, "utf8");
}
