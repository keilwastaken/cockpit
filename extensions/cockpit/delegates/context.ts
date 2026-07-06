import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { CockpitConfig } from "../config.js";
import { routeTask } from "../routing.js";
import { getProjectSkeleton } from "./skeleton.js";

const FILE_PATTERN = /(?:^|\s)([\w@./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|dart|py|rb|go|rs|java|kt|swift|md|json|yaml|yml|toml|css|scss|html|sh|sql))(?:\s|$|[,:;.])/g;

export function extractFilePaths(text: string): string[] {
	return Array.from(new Set(
		Array.from(text.matchAll(FILE_PATTERN), (match) => match[1])
			.map((file) => file.replace(/^@/, ""))
			.filter(Boolean),
	));
}

export function contextFilesForPlan(plan: string, config: CockpitConfig): string[] {
	const decision = routeTask(plan, config, true);
	return Array.from(new Set(
		decision.signals.mentionedFiles
			.map((file) => file === "README" ? "README.md" : file)
			.map((file) => file.replace(/^@/, ""))
			.filter((file) => file && file !== "README.md"),
	));
}

function fileExists(cwd: string | undefined, file: string): boolean {
	if (!cwd) return true;
	const path = isAbsolute(file) ? file : join(cwd, file);
	return existsSync(path);
}

export function fileArgsForPlan(plan: string, config: CockpitConfig, cwd?: string): string[] {
	return contextFilesForPlan(plan, config)
		.filter((file) => fileExists(cwd, file))
		.map((file) => `@${file}`);
}

export async function promptContextForPlan(cwd: string, plan: string, config: CockpitConfig): Promise<{ skeleton: string; fileArgs: string[] }> {
	const [skeleton, fileArgs] = await Promise.all([
		getProjectSkeleton(cwd),
		Promise.resolve(fileArgsForPlan(plan, config, cwd)),
	]);
	return { skeleton, fileArgs };
}
