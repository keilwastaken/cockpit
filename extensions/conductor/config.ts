import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import type { ConductorConfig } from "./types.js";

export const DEFAULT_CONFIG: ConductorConfig = {
	strictMode: true,
	defaultDryRun: true,
	agents: {
		micro: ["qwen-executor", "qwen35b-executor", "gpt54-mini-executor"],
		small: ["qwen-executor", "qwen35b-executor", "gpt54-mini-executor"],
		medium: "worker",
		reviewer: "reviewer",
		fullAuto: "review-loop",
	},
	models: {
		micro: "",
		small: "",
		medium: "",
		fullAuto: "",
	},
	routing: {
		micro: {
			maxFiles: 1,
			maxEstimatedLines: 30,
			disallowDomains: ["auth", "security", "persistence", "deployment", "architecture"],
		},
		small: {
			maxFiles: 3,
			maxEstimatedLines: 150,
			disallowDomains: ["auth", "security", "persistence", "deployment", "architecture"],
		},
		medium: {
			maxFiles: 8,
			maxEstimatedLines: 500,
			requirePlan: true,
		},
		fullAuto: {
			requireExplicitApproval: true,
			maxReviewRounds: 3,
		},
	},
	safety: {
		oneWriterAtATime: true,
		requireCleanOrAcknowledgedWorktree: true,
		forbiddenCommands: ["commit", "push", "deploy", "publish", "reset", "clean"],
	},
};

export const globalConfigPath = () => join(homedir(), CONFIG_DIR_NAME, "conductor", "config.json");
export const projectConfigPath = (cwd: string) => join(cwd, CONFIG_DIR_NAME, "conductor", "config.json");

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

const stringArray = (value: unknown, fallback: string[]): string[] => {
	if (!Array.isArray(value)) return fallback;
	const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
	return strings.length > 0 ? strings : fallback;
};

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const str = (value: unknown, fallback: string): string => (typeof value === "string" && value.trim() ? value : fallback);

export function mergeConfig(raw: unknown, base: ConductorConfig = DEFAULT_CONFIG): ConductorConfig {
	if (!isRecord(raw)) return structuredClone(base);
	const agents = isRecord(raw.agents) ? raw.agents : {};
	const models = isRecord(raw.models) ? raw.models : {};
	const routing = isRecord(raw.routing) ? raw.routing : {};
	const micro = isRecord(routing.micro) ? routing.micro : {};
	const small = isRecord(routing.small) ? routing.small : {};
	const medium = isRecord(routing.medium) ? routing.medium : {};
	const fullAuto = isRecord(routing.fullAuto) ? routing.fullAuto : {};
	const safety = isRecord(raw.safety) ? raw.safety : {};
	const mergedSmallAgents = stringArray(agents.small, base.agents.small);
	const mergedSmallModel = str(models.small, base.models.small);

	return {
		strictMode: bool(raw.strictMode, base.strictMode),
		defaultDryRun: bool(raw.defaultDryRun, base.defaultDryRun),
		agents: {
			micro: stringArray(agents.micro, mergedSmallAgents),
			small: mergedSmallAgents,
			medium: str(agents.medium, base.agents.medium),
			reviewer: str(agents.reviewer, base.agents.reviewer),
			fullAuto: str(agents.fullAuto, base.agents.fullAuto),
		},
		models: {
			micro: str(models.micro, mergedSmallModel),
			small: mergedSmallModel,
			medium: str(models.medium, base.models.medium),
			fullAuto: str(models.fullAuto, base.models.fullAuto),
		},
		routing: {
			micro: {
				maxFiles: num(micro.maxFiles, base.routing.micro.maxFiles),
				maxEstimatedLines: num(micro.maxEstimatedLines, base.routing.micro.maxEstimatedLines),
				disallowDomains: stringArray(micro.disallowDomains, base.routing.micro.disallowDomains) as ConductorConfig["routing"]["micro"]["disallowDomains"],
			},
			small: {
				maxFiles: num(small.maxFiles, base.routing.small.maxFiles),
				maxEstimatedLines: num(small.maxEstimatedLines, base.routing.small.maxEstimatedLines),
				disallowDomains: stringArray(small.disallowDomains, base.routing.small.disallowDomains) as ConductorConfig["routing"]["small"]["disallowDomains"],
			},
			medium: {
				maxFiles: num(medium.maxFiles, base.routing.medium.maxFiles),
				maxEstimatedLines: num(medium.maxEstimatedLines, base.routing.medium.maxEstimatedLines),
				requirePlan: bool(medium.requirePlan, base.routing.medium.requirePlan),
			},
			fullAuto: {
				requireExplicitApproval: bool(fullAuto.requireExplicitApproval, base.routing.fullAuto.requireExplicitApproval),
				maxReviewRounds: num(fullAuto.maxReviewRounds, base.routing.fullAuto.maxReviewRounds),
			},
		},
		safety: {
			oneWriterAtATime: bool(safety.oneWriterAtATime, base.safety.oneWriterAtATime),
			requireCleanOrAcknowledgedWorktree: bool(
				safety.requireCleanOrAcknowledgedWorktree,
				base.safety.requireCleanOrAcknowledgedWorktree,
			),
			forbiddenCommands: stringArray(safety.forbiddenCommands, base.safety.forbiddenCommands),
		},
	};
}

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
	const globalRaw = await readJson(globalConfigPath());
	if (globalRaw) {
		config = mergeConfig(globalRaw, config);
		paths.push(globalConfigPath());
	}
	if (projectTrusted) {
		const projectPath = projectConfigPath(cwd);
		const projectRaw = await readJson(projectPath);
		if (projectRaw) {
			config = mergeConfig(projectRaw, config);
			paths.push(projectPath);
		}
	}
	return { config, paths };
}

export async function saveGlobalConfig(config: ConductorConfig): Promise<string> {
	const path = globalConfigPath();
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
	return path;
}
