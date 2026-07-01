import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";

const DEFAULT_CONFIG = {
	strictMode: false,
	agents: ["instant"],
	delegateFlows: {
		instant: {
			agent: "instant",
			description: "Tiny exact one-file edits from a cockpit-supplied plan.",
			model: "",
			tools: ["read", "edit"],
			thinking: "off",
			maxFiles: 1,
			maxEstimatedLines: 30,
			maxTurns: 2,
			timeoutMs: 60000,
		},
	},
	maxFiles: 1,
	maxEstimatedLines: 30,
	disallowDomains: ["auth", "security", "persistence", "deployment", "architecture"],
	forbiddenCommands: ["commit", "push", "deploy", "publish", "reset", "clean"],
};

export type ConductorConfig = typeof DEFAULT_CONFIG;

const globalConfigPath = () => join(homedir(), CONFIG_DIR_NAME, "conductor", "config.json");
const projectConfigPath = (cwd: string) => join(cwd, CONFIG_DIR_NAME, "conductor", "config.json");

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const stringArray = (value: unknown, fallback: string[]): string[] => {
	if (!Array.isArray(value)) return fallback;
	const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
	return strings.length > 0 ? strings : fallback;
};
const numberValue = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const stringValue = (value: unknown, fallback: string): string => (typeof value === "string" && value.trim() ? value : fallback);

const mergeConfig = (raw: unknown, base: ConductorConfig): ConductorConfig => {
	if (!isRecord(raw)) return structuredClone(base);

	const rawFlows = isRecord(raw.delegateFlows) ? raw.delegateFlows : {};
	const rawInstant = isRecord(rawFlows.instant) ? rawFlows.instant : {};
	const baseInstant = base.delegateFlows.instant;
	const instant = {
		...baseInstant,
		...rawInstant,
		agent: stringValue(rawInstant.agent, stringArray(raw.agents, [baseInstant.agent])[0] ?? baseInstant.agent),
		description: stringValue(rawInstant.description, baseInstant.description),
		model: stringValue(rawInstant.model, baseInstant.model),
		tools: stringArray(rawInstant.tools, baseInstant.tools),
		thinking: "off",
		maxFiles: numberValue(rawInstant.maxFiles, numberValue(raw.maxFiles, baseInstant.maxFiles)),
		maxEstimatedLines: numberValue(rawInstant.maxEstimatedLines, numberValue(raw.maxEstimatedLines, baseInstant.maxEstimatedLines)),
		maxTurns: numberValue(rawInstant.maxTurns, baseInstant.maxTurns),
		timeoutMs: numberValue(rawInstant.timeoutMs, baseInstant.timeoutMs),
	};

	return {
		...base,
		...(raw as Partial<ConductorConfig>),
		strictMode: typeof raw.strictMode === "boolean" ? raw.strictMode : base.strictMode,
		agents: stringArray(raw.agents, [instant.agent]),
		delegateFlows: { instant },
		maxFiles: numberValue(raw.maxFiles, instant.maxFiles),
		maxEstimatedLines: numberValue(raw.maxEstimatedLines, instant.maxEstimatedLines),
		disallowDomains: stringArray(raw.disallowDomains, base.disallowDomains),
		forbiddenCommands: stringArray(raw.forbiddenCommands, base.forbiddenCommands),
	};
};

async function readJson(path: string): Promise<unknown | undefined> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw new Error(`Could not read Conductor config at ${path}: ${(error as Error).message}`);
	}
}

export async function loadConfig(cwd: string, projectTrusted: boolean): Promise<{ config: ConductorConfig; paths: string[] }> {
	let config = structuredClone(DEFAULT_CONFIG);
	const paths: string[] = [];
	for (const path of [globalConfigPath(), projectTrusted ? projectConfigPath(cwd) : undefined]) {
		if (!path) continue;
		const raw = await readJson(path);
		if (raw === undefined) continue;
		config = mergeConfig(raw, config);
		paths.push(path);
	}
	return { config, paths };
}

export async function saveGlobalConfig(config: ConductorConfig): Promise<string> {
	const path = globalConfigPath();
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
	return path;
}
