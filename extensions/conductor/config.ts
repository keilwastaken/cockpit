import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import type { ConductorConfig, ConductorTier } from "./types.js";

export const DEFAULT_CONFIG: ConductorConfig = {
	strictMode: true,
	defaultDryRun: true,
	agents: {
		instant: ["delegate"],
		rapid: ["delegate"],
		verified: "worker",
		reviewer: "reviewer",
		deep: "worker",
	},
	models: {
		instant: "",
		rapid: "",
		verified: "",
		deep: "",
	},
	profiles: {
		instant: { topology: "linear", scout: "none", verification: "optional", review: false, maxWorkerVisits: 1 },
		rapid: { topology: "linear", scout: "optional", verification: "recommended", review: false, maxWorkerVisits: 1 },
		verified: { topology: "orchestrated", scout: "recommended", verification: "required", review: false, maxWorkerVisits: 2 },
		deep: { topology: "orchestrated", scout: "required", verification: "required", review: true, maxWorkerVisits: 3 },
	},
	routing: {
		instant: {
			maxFiles: 1,
			maxEstimatedLines: 30,
			disallowDomains: ["auth", "security", "persistence", "deployment", "architecture"],
		},
		rapid: {
			maxFiles: 3,
			maxEstimatedLines: 150,
			disallowDomains: ["auth", "security", "persistence", "deployment", "architecture"],
		},
		verified: {
			maxFiles: 8,
			maxEstimatedLines: 500,
			requirePlan: true,
		},
		deep: {
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

const recordFor = (source: Record<string, unknown>, key: ConductorTier): Record<string, unknown> => {
	const value = source[key];
	return isRecord(value) ? value : {};
};

const valueFor = (source: Record<string, unknown>, key: ConductorTier): unknown => source[key];

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

export function mergeConfig(raw: unknown, base: ConductorConfig = DEFAULT_CONFIG): ConductorConfig {
	if (!isRecord(raw)) return structuredClone(base);
	const agents = isRecord(raw.agents) ? raw.agents : {};
	const models = isRecord(raw.models) ? raw.models : {};
	const routing = isRecord(raw.routing) ? raw.routing : {};
	const instant = recordFor(routing, "instant");
	const rapid = recordFor(routing, "rapid");
	const verified = recordFor(routing, "verified");
	const deep = recordFor(routing, "deep");
	const safety = isRecord(raw.safety) ? raw.safety : {};
	const profiles = isRecord(raw.profiles) ? raw.profiles : {};
	const instantProfile = recordFor(profiles, "instant");
	const rapidProfile = recordFor(profiles, "rapid");
	const verifiedProfile = recordFor(profiles, "verified");
	const deepProfile = recordFor(profiles, "deep");
	const mergedRapidAgents = stringArray(valueFor(agents, "rapid"), base.agents.rapid);
	const mergedRapidModel = str(valueFor(models, "rapid"), base.models.rapid);
	const mergedRouting = {
		instant: {
			maxFiles: num(instant.maxFiles, base.routing.instant.maxFiles),
			maxEstimatedLines: num(instant.maxEstimatedLines, base.routing.instant.maxEstimatedLines),
			disallowDomains: stringArray(instant.disallowDomains, base.routing.instant.disallowDomains) as ConductorConfig["routing"]["instant"]["disallowDomains"],
		},
		rapid: {
			maxFiles: num(rapid.maxFiles, base.routing.rapid.maxFiles),
			maxEstimatedLines: num(rapid.maxEstimatedLines, base.routing.rapid.maxEstimatedLines),
			disallowDomains: stringArray(rapid.disallowDomains, base.routing.rapid.disallowDomains) as ConductorConfig["routing"]["rapid"]["disallowDomains"],
		},
		verified: {
			maxFiles: num(verified.maxFiles, base.routing.verified.maxFiles),
			maxEstimatedLines: num(verified.maxEstimatedLines, base.routing.verified.maxEstimatedLines),
			requirePlan: bool(verified.requirePlan, base.routing.verified.requirePlan),
		},
		deep: {
			requireExplicitApproval: bool(deep.requireExplicitApproval, base.routing.deep.requireExplicitApproval),
			maxReviewRounds: num(deep.maxReviewRounds, base.routing.deep.maxReviewRounds),
		},
	};

	return {
		strictMode: bool(raw.strictMode, base.strictMode),
		defaultDryRun: bool(raw.defaultDryRun, base.defaultDryRun),
		agents: {
			instant: stringArray(valueFor(agents, "instant"), mergedRapidAgents),
			rapid: mergedRapidAgents,
			verified: str(valueFor(agents, "verified"), base.agents.verified),
			reviewer: str(agents.reviewer, base.agents.reviewer),
			deep: str(valueFor(agents, "deep"), base.agents.deep),
		},
		models: {
			instant: str(valueFor(models, "instant"), mergedRapidModel),
			rapid: mergedRapidModel,
			verified: str(valueFor(models, "verified"), base.models.verified),
			deep: str(valueFor(models, "deep"), base.models.deep),
		},
		routing: mergedRouting,
		profiles: {
			instant: {
				topology: oneOf(instantProfile.topology, ["linear", "orchestrated"], base.profiles.instant.topology),
				scout: oneOf(instantProfile.scout, ["none", "optional", "recommended", "required"], base.profiles.instant.scout),
				verification: oneOf(instantProfile.verification, ["optional", "recommended", "required"], base.profiles.instant.verification),
				review: bool(instantProfile.review, base.profiles.instant.review),
				maxWorkerVisits: num(instantProfile.maxWorkerVisits, base.profiles.instant.maxWorkerVisits),
			},
			rapid: {
				topology: oneOf(rapidProfile.topology, ["linear", "orchestrated"], base.profiles.rapid.topology),
				scout: oneOf(rapidProfile.scout, ["none", "optional", "recommended", "required"], base.profiles.rapid.scout),
				verification: oneOf(rapidProfile.verification, ["optional", "recommended", "required"], base.profiles.rapid.verification),
				review: bool(rapidProfile.review, base.profiles.rapid.review),
				maxWorkerVisits: num(rapidProfile.maxWorkerVisits, base.profiles.rapid.maxWorkerVisits),
			},
			verified: {
				topology: oneOf(verifiedProfile.topology, ["linear", "orchestrated"], base.profiles.verified.topology),
				scout: oneOf(verifiedProfile.scout, ["none", "optional", "recommended", "required"], base.profiles.verified.scout),
				verification: oneOf(verifiedProfile.verification, ["optional", "recommended", "required"], base.profiles.verified.verification),
				review: bool(verifiedProfile.review, base.profiles.verified.review),
				maxWorkerVisits: num(verifiedProfile.maxWorkerVisits, base.profiles.verified.maxWorkerVisits),
			},
			deep: {
				topology: oneOf(deepProfile.topology, ["linear", "orchestrated"], base.profiles.deep.topology),
				scout: oneOf(deepProfile.scout, ["none", "optional", "recommended", "required"], base.profiles.deep.scout),
				verification: oneOf(deepProfile.verification, ["optional", "recommended", "required"], base.profiles.deep.verification),
				review: bool(deepProfile.review, base.profiles.deep.review),
				maxWorkerVisits: num(deepProfile.maxWorkerVisits, mergedRouting.deep.maxReviewRounds || base.profiles.deep.maxWorkerVisits),
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
