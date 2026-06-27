import { access, mkdtemp, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
let compiledPromise;

async function collectTsFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...await collectTsFiles(path));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
	}
	return files;
}

async function tscExists() {
	try {
		await access(join(repoRoot, "node_modules", "typescript", "bin", "tsc"));
		return true;
	} catch {
		return false;
	}
}

export async function compileExtension() {
	if (!compiledPromise) {
		compiledPromise = (async () => {
			if (!(await tscExists())) {
				throw new Error("TypeScript compiler not found in node_modules/typescript/bin/tsc");
			}

			const outRoot = await mkdtemp(join(tmpdir(), "pi-conductor-ext-"));
			const distDir = join(outRoot, "dist");
			await symlink(join(repoRoot, "node_modules"), join(outRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
			const sources = (await collectTsFiles(join(repoRoot, "extensions"))).map((file) => relative(repoRoot, file));
			const result = spawnSync(
				process.platform === "win32" ? "npm.cmd" : "npm",
				[
					"exec",
					"--",
					"tsc",
					"--outDir",
					distDir,
					"--rootDir",
					repoRoot,
					"--module",
					"NodeNext",
					"--moduleResolution",
					"NodeNext",
					"--target",
					"ES2022",
					"--skipLibCheck",
					"--esModuleInterop",
					"--strict",
					"--types",
					"node",
					...sources,
				],
				{ cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
			);

			if (result.status !== 0) {
				throw new Error(`TypeScript compilation failed:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
			}

			return {
				repoRoot,
				outRoot,
				distDir,
				importCompiled: async (relativePath) => import(pathToFileURL(join(distDir, relativePath)).href),
			};
		})();
	}

	return compiledPromise;
}
