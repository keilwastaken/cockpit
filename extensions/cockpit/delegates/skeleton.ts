import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 30_000;
const MAX_FILES = 500;

const cache = new Map<string, { at: number; value: string }>();

export async function getProjectSkeleton(cwd: string): Promise<string> {
	const cached = cache.get(cwd);
	const now = Date.now();
	if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

	try {
		const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd, timeout: 5000 });
		const files = stdout
			.split("\n")
			.filter(Boolean)
			.filter((file) => !file.includes("node_modules/") && !file.includes("dist/") && !file.includes("build/"));

		if (files.length === 0) return "";

		const truncated = files.length > MAX_FILES ? files.slice(0, MAX_FILES).concat(`...and ${files.length - MAX_FILES} more files`) : files;
		const value = [
			"## Project Skeleton (from git ls-files)",
			"Use this to find relevant files instead of running broad `find` or `ls` commands.",
			"```text",
			...truncated,
			"```",
		].join("\n");
		cache.set(cwd, { at: now, value });
		return value;
	} catch {
		return "";
	}
}
