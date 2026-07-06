import type { CockpitConfig } from "../config.js";
import { routeTask } from "../routing.js";
import { runChildPi } from "./child-pi.js";
import { contextFilesForPlan } from "./context.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

const uniqueStrings = (values: readonly string[] | undefined): string[] =>
	Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).map((file) =>
		file === "README" ? "README.md" : file,
	);

function buildInstantPrompt(plan: string, allowedFiles: readonly string[], line: number | undefined, config: CockpitConfig): string {
	const flow = config.delegateFlows.instant;
	const bashEnabled = flow.tools.includes("bash");
	return [
		"Instant delegate. Do exactly one tiny code edit from the cockpit plan.",
		`Plan: ${plan.trim()}`,
		`Allowed file(s): ${allowedFiles.join(", ")}`,
		line ? `Target line: ${line}` : undefined,
		`Tools: ${flow.tools.join(", ")}. Scope: <=${flow.maxFiles} file(s), ~${flow.maxEstimatedLines} changed lines.`,
		"Rules: no scouting, no redesign, no unrelated reads/edits, preserve behavior outside the plan.",
		"Stop without editing if this needs a product/API/security/persistence/deployment/architecture decision or broader context.",
		bashEnabled ? "Run only an obvious narrow validation command." : "No shell validation is available; do not claim commands/tests ran.",
		"Return compactly: Summary / Files Changed / Validation / Risks.",
	].filter((line): line is string => typeof line === "string").join("\n");
}

function baseResult(input: DelegateRunInput, config: CockpitConfig, allowedFiles: string[]): DelegateRunResult {
	return {
		flow: "instant",
		plan: input.plan.trim(),
		allowedFiles,
		line: input.line,
		tools: config.delegateFlows.instant.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

function validateInstant(input: DelegateRunInput, config: CockpitConfig, allowedFiles: string[]): string | undefined {
	const plan = input.plan.trim();
	const flow = config.delegateFlows.instant;
	const decision = routeTask(plan, config, true);
	const disallowedDomain = decision.signals.riskDomains.find((domain) => config.disallowDomains.includes(domain));

	if (!plan) return "Instant delegate needs a cockpit plan.";
	if (allowedFiles.length === 0) return "Instant delegate needs exactly one file. Pass file or mention the file in the plan.";
	if (allowedFiles.length > flow.maxFiles) return `Instant delegate can edit at most ${flow.maxFiles} file(s); got ${allowedFiles.length}.`;
	if (disallowedDomain) return `Instant delegate refused risky domain: ${disallowedDomain}. Keep this in the cockpit or use a heavier flow.`;
	return undefined;
}

export const instantDelegate: DelegateFlow<CockpitConfig> = {
	name: "instant",
	async run(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.instant;
		const allowedFiles = uniqueStrings(input.file ? [input.file] : []);
		const result = baseResult(input, config, allowedFiles);
		const blockedReason = validateInstant(input, config, allowedFiles);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		context.onUpdate?.({ content: [{ type: "text", text: "Instant delegate running..." }], details: result });

		const fileArgs = contextFilesForPlan(allowedFiles.join(" "), config).map((file) => `@${file}`);

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
			buildInstantPrompt(input.plan, allowedFiles, input.line, config),
			...fileArgs,
		];

		const child = await runChildPi({
			cwd: context.cwd,
			args,
			timeoutMs: flow.timeoutMs,
			signal: context.signal,
			onUpdate: ({ finalOutput, stderr }) => {
				context.onUpdate?.({
					content: [{ type: "text", text: finalOutput || "Instant delegate running..." }],
					details: { ...result, finalOutput, stderr },
				});
			},
		});

		const finalResult = { ...result, exitCode: child.exitCode, finalOutput: child.finalOutput, stderr: child.stderr };
		if (child.timedOut) return { ...finalResult, exitCode: 1, blockedReason: `Instant delegate timed out after ${flow.timeoutMs}ms.` };
		if (child.aborted) return { ...finalResult, exitCode: 1, blockedReason: "Instant delegate was aborted." };
		return finalResult;
	},
};
