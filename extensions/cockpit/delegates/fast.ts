import type { CockpitConfig } from "../config.js";
import { routeTask } from "../routing.js";
import { runChildDelegate } from "./child-flow.js";
import { fileArgsForPlan } from "./context.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

const DEFAULT_OUTPUT_FILE = "CODEMAP.md";

function outputFileFor(input: DelegateRunInput): string | undefined {
	const outputFile = input.outputFile?.trim();
	const inferredCodemap = /\bCODEMAP(?:\.md)?\b|\bcodemap\b/i.test(input.plan);
	const normalized = outputFile || (inferredCodemap ? DEFAULT_OUTPUT_FILE : undefined);
	return normalized === "CODEMAP" ? DEFAULT_OUTPUT_FILE : normalized;
}

function buildFastPrompt(plan: string, outputFile: string | undefined, config: CockpitConfig, fileArgs: readonly string[]): string {
	const flow = config.delegateFlows.fast;
	return [
		"Fast delegate. Do a small bounded coding/documentation task quickly.",
		`Plan: ${plan.trim()}`,
		outputFile ? `Primary output file: ${outputFile}` : undefined,
		fileArgs.length > 0 ? `Preloaded mentioned files: ${fileArgs.join(", ")}` : "No project skeleton is provided. Use only narrow discovery if needed.",
		`Budget: at most ${flow.maxTurns} turns and ${Math.round(flow.timeoutMs / 1000)} seconds. If you cannot complete confidently inside this budget, reply exactly: ESCALATE: <reason and useful findings>.`,
		`Tools: ${flow.tools.join(", ")}. Use grep/find/ls/read only for targeted discovery; grep is ripgrep-backed.`,
		`Thinking: ${flow.thinking}. Be quick and avoid broad exploration.`,
		`Scope: write/edit at most ${flow.maxFiles} file(s), ~${flow.maxEstimatedLines} changed lines total.`,
		"For codemaps: identify entrypoints, major directories, config/package files, extension/tool flows, and delegate flow boundaries.",
		"Prefer concise targeted discovery over exhaustive reading. Never build or inspect a broad project skeleton in fast mode.",
		"Do not modify source code unless the plan explicitly asks for it; for codemaps, write/update only the output file.",
		"Stop with ESCALATE if this needs product/security/persistence/deployment decisions, broad repo context, or a broad refactor.",
		"Return compactly: Summary / Files Changed / Discovery Notes / Validation / Risks.",
	].filter((line): line is string => typeof line === "string").join("\n");
}

function baseResult(input: DelegateRunInput, config: CockpitConfig, outputFile: string | undefined): DelegateRunResult {
	return {
		flow: "fast",
		plan: input.plan.trim(),
		allowedFiles: outputFile ? [outputFile] : [],
		outputFile,
		tools: config.delegateFlows.fast.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

function validateFast(input: DelegateRunInput, config: CockpitConfig): string | undefined {
	const plan = input.plan.trim();
	const decision = routeTask(plan, config, false);
	const riskyDomain = decision.signals.riskDomains.find((domain) => domain !== "architecture" && config.disallowDomains.includes(domain));

	if (!plan) return "Fast delegate needs a cockpit plan.";
	if (riskyDomain) return `Fast delegate refused risky domain: ${riskyDomain}. Keep this in the cockpit or use a heavier flow later.`;
	return undefined;
}

export const fastDelegate: DelegateFlow<CockpitConfig> = {
	name: "fast",
	async run(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.fast;
		const outputFile = outputFileFor(input);
		const result = baseResult(input, config, outputFile);
		const blockedReason = validateFast(input, config);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		const fileArgs = fileArgsForPlan(input.plan, config, context.cwd);


		const args = [
			"--mode",
			"json",
			"-p",
			"--no-session",
			...(flow.model ? ["--model", flow.model] : []),
			"--thinking",
			flow.thinking,
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-context-files",
			context.projectTrusted ? "--approve" : "--no-approve",
			"--tools",
			flow.tools.join(","),
			buildFastPrompt(input.plan, outputFile, config, fileArgs),
			...fileArgs,
		];

		return runChildDelegate({
			label: "Fast delegate",
			args,
			flow,
			result,
			context,
			escalation: { onTimeout: "normal", onMaxTurns: "normal" },
		});
	},
};
