import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";

const DEFAULT_CONFIG = {
	strictMode: false,
	agents: ["instant", "fast", "ideate", "research", "normal", "planner", "reviewer"],
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
		fast: {
			agent: "fast",
			description: "Small semantic edits with local discovery in a child context.",
			model: "",
			tools: ["ls", "find", "grep", "read", "write", "edit"],
			thinking: "low",
			maxFiles: 3,
			maxEstimatedLines: 300,
			maxTurns: 5,
			timeoutMs: 180000,
		},
		research: {
			agent: "research",
			description: "Read-only quick codebase research brief with optional web context for planner handoff.",
			model: "",
			tools: ["ls", "find", "grep", "read", "web_search", "web_fetch"],
			thinking: "minimal",
			maxFiles: 7,
			maxEstimatedLines: 0,
			maxTurns: 5,
			timeoutMs: 180000,
		},
		normal: {
			agent: "normal",
			description: "Bounded coding executor using the implementation model with medium thinking.",
			model: "",
			tools: ["ls", "find", "grep", "read", "edit", "write", "bash"],
			thinking: "medium",
			maxFiles: 6,
			maxEstimatedLines: 600,
			maxTurns: 8,
			timeoutMs: 300000,
		},
		planner: {
			agent: "planner",
			description: "High-reasoning read-only implementation planner for coding-agent handoff.",
			model: "",
			tools: ["ls", "find", "grep", "read", "web_search", "web_fetch"],
			thinking: "xhigh",
			maxFiles: 3,
			maxEstimatedLines: 0,
			maxTurns: 5,
			timeoutMs: 240000,
		},
		reviewer: {
			agent: "reviewer",
			description: "Read-only diff reviewer with feedback weight for cockpit routing.",
			model: "",
			tools: ["ls", "find", "grep", "read", "bash"],
			thinking: "high",
			maxFiles: 10,
			maxEstimatedLines: 0,
			maxTurns: 6,
			timeoutMs: 240000,
		},
		ideate: {
			agent: "ideate",
			description: "Read-only divergent ideation council for unclear features, refactors, and product/implementation direction.",
			model: "",
			tools: ["ls", "find", "grep", "read", "web_search", "web_fetch"],
			thinking: "high",
			maxFiles: 8,
			maxEstimatedLines: 0,
			maxTurns: 6,
			timeoutMs: 300000,
		},
	},
	maxFiles: 1,
	maxEstimatedLines: 30,
	disallowDomains: ["auth", "security", "persistence", "deployment", "architecture"],
	forbiddenCommands: ["commit", "push", "deploy", "publish", "reset", "clean"],
};

export type CockpitConfig = typeof DEFAULT_CONFIG;
type DelegateFlowConfig = CockpitConfig["delegateFlows"][keyof CockpitConfig["delegateFlows"]];

const globalConfigPath = () => join(homedir(), CONFIG_DIR_NAME, "cockpit", "config.json");
const projectConfigPath = (cwd: string) => join(cwd, CONFIG_DIR_NAME, "cockpit", "config.json");

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const stringArray = (value: unknown, fallback: string[]): string[] => {
	if (!Array.isArray(value)) return fallback;
	const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
	return strings.length > 0 ? strings : fallback;
};
const numberValue = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const stringValue = (value: unknown, fallback: string): string => (typeof value === "string" && value.trim() ? value : fallback);

function rawFlow(rawFlows: Record<string, unknown>, name: string): Record<string, unknown> {
	const value = rawFlows[name];
	return isRecord(value) ? value : {};
}

function normalizeDelegateFlow(
	raw: Record<string, unknown>,
	base: DelegateFlowConfig,
	options: {
		agent?: string;
		model: string;
		thinking: string;
		maxFiles?: number;
		maxEstimatedLines?: number;
	},
): DelegateFlowConfig {
	return {
		...base,
		...raw,
		agent: stringValue(raw.agent, options.agent ?? base.agent),
		description: stringValue(raw.description, base.description),
		model: stringValue(raw.model, options.model),
		tools: stringArray(raw.tools, base.tools),
		thinking: options.thinking,
		maxFiles: numberValue(raw.maxFiles, options.maxFiles ?? base.maxFiles),
		maxEstimatedLines: numberValue(raw.maxEstimatedLines, options.maxEstimatedLines ?? base.maxEstimatedLines),
		maxTurns: numberValue(raw.maxTurns, base.maxTurns),
		timeoutMs: numberValue(raw.timeoutMs, base.timeoutMs),
	};
}

const mergeConfig = (raw: unknown, base: CockpitConfig): CockpitConfig => {
	if (!isRecord(raw)) return structuredClone(base);

	const rawFlows = isRecord(raw.delegateFlows) ? raw.delegateFlows : {};
	const rawInstant = rawFlow(rawFlows, "instant");
	const rawFast = rawFlow(rawFlows, "fast");
	const rawResearch = rawFlow(rawFlows, "research");
	const rawNormal = rawFlow(rawFlows, "normal");
	const rawPlanner = rawFlow(rawFlows, "planner");
	const rawReviewer = rawFlow(rawFlows, "reviewer");
	const rawIdeate = rawFlow(rawFlows, "ideate");
	const baseInstant = base.delegateFlows.instant;
	const baseFast = base.delegateFlows.fast;
	const baseResearch = base.delegateFlows.research;
	const baseNormal = base.delegateFlows.normal;
	const basePlanner = base.delegateFlows.planner;
	const baseReviewer = base.delegateFlows.reviewer;
	const baseIdeate = base.delegateFlows.ideate;

	const instant = normalizeDelegateFlow(rawInstant, baseInstant, {
		agent: stringArray(raw.agents, [baseInstant.agent])[0] ?? baseInstant.agent,
		model: baseInstant.model,
		thinking: "off",
		maxFiles: numberValue(raw.maxFiles, baseInstant.maxFiles),
		maxEstimatedLines: numberValue(raw.maxEstimatedLines, baseInstant.maxEstimatedLines),
	});
	const fast = normalizeDelegateFlow(rawFast, baseFast, {
		model: instant.model,
		thinking: "low",
	});
	const research = normalizeDelegateFlow(rawResearch, baseResearch, {
		model: instant.model,
		thinking: "minimal",
	});
	const normal = normalizeDelegateFlow(rawNormal, baseNormal, {
		model: instant.model,
		thinking: "medium",
	});
	const planner = normalizeDelegateFlow(rawPlanner, basePlanner, {
		model: basePlanner.model,
		thinking: stringValue(rawPlanner.thinking, basePlanner.thinking),
	});
	const reviewer = normalizeDelegateFlow(rawReviewer, baseReviewer, {
		model: baseReviewer.model,
		thinking: stringValue(rawReviewer.thinking, baseReviewer.thinking),
	});
	const ideate = normalizeDelegateFlow(rawIdeate, baseIdeate, {
		model: baseIdeate.model,
		thinking: stringValue(rawIdeate.thinking, baseIdeate.thinking),
	});
	const agents = stringArray(raw.agents, []);

	return {
		...base,
		...(raw as Partial<CockpitConfig>),
		strictMode: typeof raw.strictMode === "boolean" ? raw.strictMode : base.strictMode,
		agents: Array.from(new Set([...agents, instant.agent, fast.agent, ideate.agent, research.agent, normal.agent, planner.agent, reviewer.agent])),
		delegateFlows: { instant, fast, ideate, research, normal, planner, reviewer },
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
		throw new Error(`Could not read Cockpit config at ${path}: ${(error as Error).message}`);
	}
}

export async function loadConfig(cwd: string, projectTrusted: boolean): Promise<{ config: CockpitConfig; paths: string[] }> {
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

export async function saveGlobalConfig(config: CockpitConfig): Promise<string> {
	const path = globalConfigPath();
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
	return path;
}
