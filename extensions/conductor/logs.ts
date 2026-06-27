import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import type { ConductorRunStatus, RouteDecision } from "./types.js";

const safeRunId = () => `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;

export const conductorRunsRoot = (cwd: string) => join(cwd, CONFIG_DIR_NAME, "conductor", "runs");
export const conductorRunDir = (cwd: string, id: string) => join(conductorRunsRoot(cwd), id);
export const conductorHandoffPath = (cwd: string, id: string) => join(conductorRunDir(cwd, id), "handoff.md");
export const conductorStatusPath = (cwd: string, id: string) => join(conductorRunDir(cwd, id), "status.json");
export const conductorNotesPath = (cwd: string, id: string) => join(conductorRunDir(cwd, id), "notes.md");
export const conductorEvidencePath = (cwd: string, id: string) => join(conductorRunDir(cwd, id), "evidence.md");
export const conductorReviewPath = (cwd: string, id: string) => join(conductorRunDir(cwd, id), "review.md");
export const conductorDecisionsPath = (cwd: string, id: string) => join(conductorRunDir(cwd, id), "decisions.md");

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const stringValue = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined);

export function formatRunListLine(run: ConductorRunStatus): string {
	const route = run.tier ? `${run.route}/${run.tier}` : run.route;
	const task = run.task.replace(/\s+/g, " ").trim();
	const summary = task.length > 72 ? `${task.slice(0, 69)}…` : task;
	return `${run.id} | ${run.state} | ${route} | ${summary}`;
}

export async function createRunRegistryEntry(
	cwd: string,
	task: string,
	decision: RouteDecision,
	handoffMarkdown: string
): Promise<ConductorRunStatus> {
	const id = safeRunId();
	const runDir = conductorRunDir(cwd, id);
	const handoffPath = conductorHandoffPath(cwd, id);
	const statusPath = conductorStatusPath(cwd, id);
	const notesPath = conductorNotesPath(cwd, id);
	const evidencePath = conductorEvidencePath(cwd, id);
	const reviewPath = conductorReviewPath(cwd, id);
	const now = new Date().toISOString();
	const status: ConductorRunStatus = {
		id,
		state: "drafted",
		createdAt: now,
		updatedAt: now,
		task: task.trim(),
		route: decision.route,
		tier: decision.tier,
		suggestedAgent: decision.suggestedAgent,
		suggestedModel: decision.suggestedModel,
		handoffPath,
		statusPath,
		notesPath,
		evidencePath,
		reviewPath,
	};

	await mkdir(runDir, { recursive: true });
	await writeFile(handoffPath, `${handoffMarkdown}\n`, "utf8");
	await writeFile(notesPath, "# Notes\n\n", "utf8");
	await writeFile(evidencePath, "# Evidence\n\n", "utf8");
	await writeFile(reviewPath, "# Review\n\n", "utf8");
	await writeFile(statusPath, `${JSON.stringify(status, null, "\t")}\n`, "utf8");

	return status;
}

async function readStatusJson(path: string): Promise<ConductorRunStatus | undefined> {
	try {
		const raw = JSON.parse(await readFile(path, "utf8"));
		if (!isRecord(raw)) return undefined;
		const id = stringValue(raw.id);
		const state = stringValue(raw.state);
		const createdAt = stringValue(raw.createdAt);
		const updatedAt = stringValue(raw.updatedAt);
		const task = stringValue(raw.task);
		const route = stringValue(raw.route);
		const runDir = dirname(path);
		const handoffPath = stringValue(raw.handoffPath) ?? join(runDir, "handoff.md");
		const statusPath = stringValue(raw.statusPath) ?? join(runDir, "status.json");
		const notesPath = stringValue(raw.notesPath) ?? join(runDir, "notes.md");
		const evidencePath = stringValue(raw.evidencePath) ?? join(runDir, "evidence.md");
		const reviewPath = stringValue(raw.reviewPath) ?? join(runDir, "review.md");
		if (!id || !state || !createdAt || !updatedAt || !task || !route) return undefined;
		return {
			id,
			state: state as ConductorRunStatus["state"],
			createdAt,
			updatedAt,
			approvedAt: stringValue(raw.approvedAt),
			task,
			route: route as ConductorRunStatus["route"],
			tier: stringValue(raw.tier) as ConductorRunStatus["tier"],
			suggestedAgent: stringValue(raw.suggestedAgent),
			suggestedModel: stringValue(raw.suggestedModel),
			handoffPath,
			statusPath,
			notesPath,
			evidencePath,
			reviewPath,
			decisionsPath: stringValue(raw.decisionsPath),
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

export async function updateRunStatus(
	cwd: string,
	run: ConductorRunStatus,
	patch: Partial<Pick<ConductorRunStatus, "state" | "updatedAt" | "approvedAt">>
): Promise<ConductorRunStatus> {
	const next: ConductorRunStatus = {
		...run,
		...patch,
	};
	await writeFile(run.statusPath, `${JSON.stringify(next, null, "\t")}\n`, "utf8");
	return next;
}

export async function appendRunDecision(cwd: string, run: ConductorRunStatus, note: string): Promise<string> {
	const decisionsPath = run.decisionsPath ?? conductorDecisionsPath(cwd, run.id);
	await mkdir(conductorRunDir(cwd, run.id), { recursive: true });
	await appendFile(decisionsPath, note, "utf8");
	return decisionsPath;
}

export async function approveRun(cwd: string, run: ConductorRunStatus): Promise<ConductorRunStatus> {
	const now = new Date().toISOString();
	const decisionsPath = await appendRunDecision(
		cwd,
		run,
		`${run.decisionsPath ? "" : "# Decisions\n\n"}- ${now} Human approved launch for run ${run.id}.\n`
	);
	return updateRunStatus(cwd, { ...run, decisionsPath }, { state: "approved", updatedAt: now, approvedAt: now });
}

export async function listRuns(cwd: string): Promise<ConductorRunStatus[]> {
	const root = conductorRunsRoot(cwd);
	let entries: Array<Awaited<ReturnType<typeof readStatusJson>>> = [];

	try {
		for (const entry of await readdir(root, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			entries.push(await readStatusJson(conductorStatusPath(cwd, entry.name)));
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}

	return entries
		.filter((entry): entry is ConductorRunStatus => Boolean(entry))
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export async function inspectRun(cwd: string, runId: string): Promise<{ run: ConductorRunStatus } | { warning: string }> {
	const needle = runId.trim();
	if (!needle) return { warning: "Usage: /conductor inspect <run-id>" };

	const runs = await listRuns(cwd);
	const exact = runs.find((run) => run.id === needle);
	if (exact) return { run: exact };

	const matches = runs.filter((run) => run.id.startsWith(needle));
	if (matches.length === 1) return { run: matches[0] };
	if (matches.length === 0) return { warning: `No Conductor run found matching ${needle}.` };
	return {
		warning: `Multiple Conductor runs match ${needle}: ${matches.map((run) => run.id).join(", ")}`,
	};
}

export async function readRunStatusText(run: ConductorRunStatus): Promise<string> {
	return readFile(run.statusPath, "utf8");
}
