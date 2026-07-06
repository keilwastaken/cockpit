import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { getProjectSkeleton } from "../extensions/cockpit/delegates/skeleton.ts";

const execFileAsync = promisify(execFile);

test("project skeleton includes tracked and untracked git files", async () => {
	const dir = await mkdtemp(join(tmpdir(), "cockpit-skeleton-"));
	try {
		await execFileAsync("git", ["init"], { cwd: dir });
		await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
		await execFileAsync("git", ["config", "user.name", "Test"], { cwd: dir });
		await mkdir(join(dir, "src"));
		await writeFile(join(dir, "src", "tracked.ts"), "export const x = 1;\n");
		await execFileAsync("git", ["add", "src/tracked.ts"], { cwd: dir });
		await execFileAsync("git", ["commit", "-m", "init"], { cwd: dir });
		await writeFile(join(dir, "src", "untracked.ts"), "export const y = 2;\n");

		const skeleton = await getProjectSkeleton(dir);
		assert.match(skeleton, /src\/tracked\.ts/);
		assert.match(skeleton, /src\/untracked\.ts/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
