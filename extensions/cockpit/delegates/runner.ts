import type { CockpitConfig } from "../config.js";
import { buildChildDelegateArgs, runChildDelegate } from "./child-flow.js";
import { fileArgsForPlan, promptContextForPlan } from "./context.js";
import { getProjectSkeleton } from "./skeleton.js";
import { ideateDelegate } from "./ideate.js";
import { instantDelegate } from "./instant.js";
import { buildFastPrompt, buildNormalPrompt, buildPlannerPrompt, buildResearchPrompt, buildReviewerPrompt, buildTaskWriterPrompt } from "./prompts.js";
import type { DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";
import { flowConfigKeyForRole, normalizeRoleName, roleDefinitionFor, type RoleInputName, type RoleName } from "./roles.js";

type ChildRunnerRoleName = "fast" | "research" | "normal" | "planner" | "reviewer" | "task-writer";
type RunnerRoleName = RoleName;
type ExtensionMode = "allow" | "disable";

type PreparedRole = {
	prompt: string;
	fileArgs: string[];
	allowedFiles?: string[];
	outputFile?: string;
	escalation?: { onTimeout?: RoleName; onMaxTurns?: RoleName };
	extensionMode: ExtensionMode;
};

type RunnerRoleSpec = {
	name: ChildRunnerRoleName;
	validate(input: DelegateRunInput, config: CockpitConfig): string | undefined;
	prepare(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<PreparedRole> | PreparedRole;
};

const DEFAULT_CODEMAP_FILE = "CODEMAP.md";

function outputFileForFast(input: DelegateRunInput): string | undefined {
	const outputFile = input.outputFile?.trim();
	const inferredCodemap = /\bCODEMAP(?:\.md)?\b|\bcodemap\b/i.test(input.plan);
	const normalized = outputFile || (inferredCodemap ? DEFAULT_CODEMAP_FILE : undefined);
	return normalized === "CODEMAP" ? DEFAULT_CODEMAP_FILE : normalized;
}

function validateFast(input: DelegateRunInput, _config: CockpitConfig): string | undefined {
	const plan = input.plan.trim();
	if (!plan) return "Fast delegate needs a cockpit plan.";
	return undefined;
}

function validateNormal(input: DelegateRunInput, _config: CockpitConfig): string | undefined {
	const plan = input.plan.trim();
	if (!plan) return "Normal delegate needs an implementation plan or coding instructions.";
	return undefined;
}

const runnerRoleSpecs: Record<ChildRunnerRoleName, RunnerRoleSpec> = {
	fast: {
		name: "fast",
		validate: validateFast,
		prepare: async (input, config, context) => {
			const outputFile = outputFileForFast(input);
			const fileArgs = fileArgsForPlan(input.plan, config, context.cwd);
			const skeleton = await getProjectSkeleton(context.cwd);
			return {
				prompt: buildFastPrompt(input.plan, outputFile, config, fileArgs, skeleton),
				fileArgs,
				allowedFiles: outputFile ? [outputFile] : [],
				outputFile,
				escalation: { onTimeout: "normal", onMaxTurns: "normal" },
				extensionMode: "disable",
			};
		},
	},
	research: {
		name: "research",
		validate: (input) => input.plan.trim() ? undefined : "Research delegate needs a task.",
		prepare: async (input, config, context) => ({
			prompt: buildResearchPrompt(input.plan, config, await getProjectSkeleton(context.cwd)),
			fileArgs: fileArgsForPlan(input.plan, config, context.cwd),
			extensionMode: "allow",
		}),
	},
	normal: {
		name: "normal",
		validate: validateNormal,
		prepare: async (input, config, context) => {
			const { skeleton, fileArgs } = await promptContextForPlan(context.cwd, input.plan, config);
			return {
				prompt: buildNormalPrompt(input.plan, config, skeleton),
				fileArgs,
				extensionMode: "disable",
			};
		},
	},
	planner: {
		name: "planner",
		validate: (input) => input.plan.trim() ? undefined : "Planner delegate needs a task, human-approved direction, and/or research brief.",
		prepare: async (input, config, context) => ({
			prompt: buildPlannerPrompt(input.plan, config, await getProjectSkeleton(context.cwd)),
			fileArgs: fileArgsForPlan(input.plan, config, context.cwd),
			extensionMode: "allow",
		}),
	},
	reviewer: {
		name: "reviewer",
		validate: (input) => input.plan.trim() ? undefined : "Reviewer delegate needs review context: task/plan and what changed.",
		prepare: async (input, config, context) => ({
			prompt: buildReviewerPrompt(input.plan, config, await getProjectSkeleton(context.cwd)),
			fileArgs: fileArgsForPlan(input.plan, config, context.cwd),
			extensionMode: "disable",
		}),
	},
	"task-writer": {
		name: "task-writer",
		validate: (input) => input.plan.trim() ? undefined : "Task writer needs a task, idea, or backlog item to turn into a task packet.",
		prepare: async (input, config, context) => ({
			prompt: buildTaskWriterPrompt(input.plan, input.outputFile, config, await getProjectSkeleton(context.cwd)),
			fileArgs: fileArgsForPlan(input.plan, config, context.cwd),
			allowedFiles: input.outputFile ? [input.outputFile] : [],
			outputFile: input.outputFile,
			extensionMode: "disable",
		}),
	},
};

const isChildRunnerRoleName = (value: RoleName): value is ChildRunnerRoleName =>
	value === "fast" || value === "research" || value === "normal" || value === "planner" || value === "reviewer" || value === "task-writer";

function baseResult(input: DelegateRunInput, config: CockpitConfig, role: ChildRunnerRoleName, prepared: Pick<PreparedRole, "allowedFiles" | "outputFile">): DelegateRunResult {
	const configKey = flowConfigKeyForRole(role);
	return {
		flow: role,
		plan: input.plan.trim(),
		allowedFiles: prepared.allowedFiles ?? [],
		outputFile: prepared.outputFile,
		tools: config.delegateFlows[configKey].tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

export async function runRole(roleName: RoleInputName, input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
	const role = normalizeRoleName(roleName);
	if (!role) throw new Error(`Unknown Cockpit role: ${roleName}`);
	if (role === "instant") return instantDelegate.run(input, config, context);
	if (role === "ideate") return ideateDelegate.run(input, config, context);
	if (!isChildRunnerRoleName(role)) throw new Error(`Cockpit role is not handled by runner: ${role}`);

	const spec = runnerRoleSpecs[role];
	const definition = roleDefinitionFor(role);
	const configKey = flowConfigKeyForRole(role);
	const flow = config.delegateFlows[configKey];
	const blockedReason = spec.validate(input, config);
	const prepared = blockedReason ? { fileArgs: [], prompt: "", extensionMode: "disable" as const } : await spec.prepare(input, config, context);
	const result = baseResult(input, config, role, prepared);
	if (blockedReason) return { ...result, exitCode: 1, blockedReason };

	const args = buildChildDelegateArgs(
		{
			model: flow.model,
			thinking: flow.thinking,
			tools: flow.tools,
			prompt: prepared.prompt,
			fileArgs: prepared.fileArgs,
			extensionMode: prepared.extensionMode,
		},
		context.projectTrusted,
	);

	return runChildDelegate({
		label: definition.label,
		args,
		flow,
		result,
		context,
		escalation: prepared.escalation,
		warm: {
			model: flow.model,
			thinking: flow.thinking,
			tools: flow.tools,
			prompt: prepared.prompt,
		},
	});
}

