import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";

const safeTimestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

export async function writeRunLog(cwd: string, name: string, content: string): Promise<string> {
	const dir = join(cwd, CONFIG_DIR_NAME, "conductor", "runs");
	await mkdir(dir, { recursive: true });
	const path = join(dir, `${safeTimestamp()}-${name}.md`);
	await writeFile(path, content, "utf8");
	return path;
}
