import type { ConductorConfig } from "../config.js";
import { routeTask } from "../routing.js";
import { runChildPi } from "./child-pi.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

const DEFAULT_OUTPUT_FILE = "CODEMAP.md";

function outputFileFor(input: DelegateRunInput): string | undefined {
	const outputFile = input.outputFile?.trim();
	const inferredCodemap = /\bCODEMAP(?:\.md)?\b|\bcodemap\b/i.test(input.plan);
	const normalized = outputFile || (inferredCodemap ? DEFAULT_OUTPUT_FILE : undefined);
	return normalized === "CODEMAP" ? DEFAULT_OUTPUT_FILE : normalized;
}

function buildFastPrompt(plan: string, outputFile: string | undefined, config: ConductorConfig): string {
	const flow = config.delegateFlows.fast;
	return [
		"Fast delegate. Do a small semantic coding/documentation task in this child context.",
		`Plan: ${plan.trim()}`,
		outputFile ? `Primary output file: ${outputFile}` : undefined,
		`Tools: ${flow.tools.join(", ")}. Use grep/find/ls/read for discovery; grep is ripgrep-backed.`,
		`Thinking: ${flow.thinking}. Be quick, but reason enough to avoid shallow output.`,
		`Scope: write/edit at most ${flow.maxFiles} file(s), ~${flow.maxEstimatedLines} changed lines total.`,
		"For codemaps: identify entrypoints, major directories, config/package files, extension/tool flows, and delegate flow boundaries.",
		"Prefer concise targeted discovery over exhaustive reading. Do not pull broad context into the final answer.",
		"Do not modify source code unless the plan explicitly asks for it; for codemaps, write/update only the output file.",
		"Stop without editing if this needs product/security/persistence/deployment decisions or a broad refactor.",
		"Return compactly: Summary / Files Changed / Discovery Notes / Validation / Risks.",
	].filter((line): line is string => typeof line === "string").join("\n");
}

function baseResult(input: DelegateRunInput, config: ConductorConfig, outputFile: string | undefined): DelegateRunResult {
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

function validateFast(input: DelegateRunInput, config: ConductorConfig): string | undefined {
	const plan = input.plan.trim();
	const decision = routeTask(plan, config, false);
	const riskyDomain = decision.signals.riskDomains.find((domain) => domain !== "architecture" && config.disallowDomains.includes(domain));

	if (!plan) return "Fast delegate needs a cockpit plan.";
	if (riskyDomain) return `Fast delegate refused risky domain: ${riskyDomain}. Keep this in the cockpit or use a heavier flow later.`;
	return undefined;
}

export const fastDelegate: DelegateFlow<ConductorConfig> = {
	name: "fast",
	async run(input: DelegateRunInput, config: ConductorConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.fast;
		const outputFile = outputFileFor(input);
		const result = baseResult(input, config, outputFile);
		const blockedReason = validateFast(input, config);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		context.onUpdate?.({ content: [{ type: "text", text: "Fast delegate running..." }], details: result });

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
			buildFastPrompt(input.plan, outputFile, config),
		];

		const child = await runChildPi({
			cwd: context.cwd,
			args,
			timeoutMs: flow.timeoutMs,
			signal: context.signal,
			onUpdate: ({ finalOutput, stderr }) => {
				context.onUpdate?.({
					content: [{ type: "text", text: finalOutput || "Fast delegate running..." }],
					details: { ...result, finalOutput, stderr },
				});
			},
		});

		const finalResult = { ...result, exitCode: child.exitCode, finalOutput: child.finalOutput, stderr: child.stderr };
		if (child.timedOut) return { ...finalResult, exitCode: 1, blockedReason: `Fast delegate timed out after ${flow.timeoutMs}ms.` };
		if (child.aborted) return { ...finalResult, exitCode: 1, blockedReason: "Fast delegate was aborted." };
		return finalResult;
	},
};
