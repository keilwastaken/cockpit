import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import type { ConductorConfig, ConductorTier, ExecutionGuard, ExecutionIsolation, ExecutionTopology, RiskDomain } from "./types.js";

const PROFILE_TIERS: ConductorTier[] = ["instant", "fast", "careful"];
const TOPOLOGIES: ExecutionTopology[] = ["linear", "orchestrated"];
const SCOUT_LEVELS: ExecutionGuard[] = ["none", "optional", "recommended", "required"];
const VERIFICATION_LEVELS: Array<Exclude<ExecutionGuard, "none">> = ["optional", "recommended", "required"];
const ISOLATION_LEVELS: ExecutionIsolation[] = ["same-tree", "worktree-recommended", "worktree-required"];

export const DEFAULT_CONFIG: ConductorConfig = {
	strictMode: true,
	agents: {
		instant: ["delegate"],
		fast: ["delegate"],
		careful: "worker",
	},
	models: {
		instant: "",
		fast: "",
		careful: "",
	},
	profiles: {
		instant: { topology: "linear", scout: "none", verification: "optional", review: false, maxWorkerVisits: 1, isolation: "same-tree" },
		fast: { topology: "linear", scout: "optional", verification: "recommended", review: false, maxWorkerVisits: 1, isolation: "worktree-recommended" },
		careful: { topology: "orchestrated", scout: "required", verification: "required", review: true, maxWorkerVisits: 3, isolation: "worktree-required" },
	},
	routing: {
		instant: {
			maxFiles: 1,
			maxEstimatedLines: 30,
			disallowDomains: ["auth", "security", "persistence", "deployment", "architecture"],
		},
		fast: {
			maxFiles: 3,
			maxEstimatedLines: 150,
			disallowDomains: ["auth", "security", "persistence", "deployment", "architecture"],
		},
		careful: {
			maxFiles: 8,
			maxEstimatedLines: 500,
			requirePlan: true,
		},
	},
	safety: {
		forbiddenCommands: ["commit", "push", "deploy", "publish", "reset", "clean"],
	},
};

export const globalConfigPath = () => join(homedir(), CONFIG_DIR_NAME, "conductor", "config.json");
export const projectConfigPath = (cwd: string) => join(cwd, CONFIG_DIR_NAME, "conductor", "config.json");

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const stringArray = (value: unknown, fallback: string[]): string[] => {
	if (!Array.isArray(value)) return fallback;
	const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
	return strings.length > 0 ? strings : fallback;
};

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const str = (value: unknown, fallback: string): string => (typeof value === "string" && value.trim() ? value : fallback);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
	typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const mergeAgents = (raw: Record<string, unknown>, base: ConductorConfig["agents"]): ConductorConfig["agents"] => ({
	instant: stringArray(raw.instant, base.instant),
	fast: stringArray(raw.fast, base.fast),
	careful: str(raw.careful, base.careful),
});

const mergeModels = (raw: Record<string, unknown>, base: ConductorConfig["models"]): ConductorConfig["models"] => ({
	instant: str(raw.instant, base.instant),
	fast: str(raw.fast, base.fast),
	careful: str(raw.careful, base.careful),
});

const mergeRouting = (raw: Record<string, unknown>, base: ConductorConfig["routing"]): ConductorConfig["routing"] => {
	const instant = asRecord(raw.instant);
	const fast = asRecord(raw.fast);
	const careful = asRecord(raw.careful);

	return {
		instant: {
			maxFiles: num(instant.maxFiles, base.instant.maxFiles),
			maxEstimatedLines: num(instant.maxEstimatedLines, base.instant.maxEstimatedLines),
			disallowDomains: stringArray(instant.disallowDomains, base.instant.disallowDomains) as RiskDomain[],
		},
		fast: {
			maxFiles: num(fast.maxFiles, base.fast.maxFiles),
			maxEstimatedLines: num(fast.maxEstimatedLines, base.fast.maxEstimatedLines),
			disallowDomains: stringArray(fast.disallowDomains, base.fast.disallowDomains) as RiskDomain[],
		},
		careful: {
			maxFiles: num(careful.maxFiles, base.careful.maxFiles),
			maxEstimatedLines: num(careful.maxEstimatedLines, base.careful.maxEstimatedLines),
			requirePlan: bool(careful.requirePlan, base.careful.requirePlan),
		},
	};
};

const mergeProfiles = (raw: Record<string, unknown>, base: ConductorConfig["profiles"]): ConductorConfig["profiles"] => {
	const merged = structuredClone(base);

	for (const tier of PROFILE_TIERS) {
		const profile = asRecord(raw[tier]);
		merged[tier] = {
			topology: oneOf(profile.topology, TOPOLOGIES, base[tier].topology),
			scout: oneOf(profile.scout, SCOUT_LEVELS, base[tier].scout),
			verification: oneOf(profile.verification, VERIFICATION_LEVELS, base[tier].verification),
			review: bool(profile.review, base[tier].review),
			maxWorkerVisits: num(profile.maxWorkerVisits, base[tier].maxWorkerVisits),
			isolation: oneOf(profile.isolation, ISOLATION_LEVELS, base[tier].isolation),
		};
	}

	return merged;
};

const mergeSafety = (raw: Record<string, unknown>, base: ConductorConfig["safety"]): ConductorConfig["safety"] => ({
	forbiddenCommands: stringArray(raw.forbiddenCommands, base.forbiddenCommands),
});

export function mergeConfig(raw: unknown, base: ConductorConfig = DEFAULT_CONFIG): ConductorConfig {
	if (!isRecord(raw)) return structuredClone(base);

	return {
		strictMode: bool(raw.strictMode, base.strictMode),
		agents: mergeAgents(asRecord(raw.agents), base.agents),
		models: mergeModels(asRecord(raw.models), base.models),
		profiles: mergeProfiles(asRecord(raw.profiles), base.profiles),
		routing: mergeRouting(asRecord(raw.routing), base.routing),
		safety: mergeSafety(asRecord(raw.safety), base.safety),
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
