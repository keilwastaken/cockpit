import type { ConductorConfig } from "../config.js";
import { runChildPi } from "./child-pi.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

function buildNormalPrompt(plan: string, config: ConductorConfig): string {
	const flow = config.delegateFlows.normal;
	return [
		"Normal delegate. You are a bounded coding executor for an implementation plan.",
		`Plan / instructions: ${plan.trim()}`,
		`Tools: ${flow.tools.join(", ")}. Use grep/find/ls/read for local discovery; grep is ripgrep-backed. Use edit/write for file changes.`,
		`Thinking: ${flow.thinking}. The planner owns deep reasoning; execute carefully and concisely.`,
		`Scope: edit/write at most ${flow.maxFiles} file(s), ~${flow.maxEstimatedLines} changed lines total.`,
		"Follow the planner's Coder Instructions first. Do not redesign. Do not broaden scope. Do not produce a new plan.",
		"Prefer minimal diffs and existing project style/patterns. Avoid large rewrites unless the plan explicitly asks for them.",
		"Bash rules: use bash only for safe validation commands and read-only discovery. Do not mutate files through shell redirection, sed -i, inline scripts, package installs, deletes, commits, pushes, deploys, publishes, or destructive commands.",
		"Validation: run only the validation commands listed in the plan unless a narrow obvious command is necessary. Do not claim commands/tests passed unless they were run.",
		"Repair: if validation fails, make at most one focused fix attempt, then report status.",
		"Stop and report without further edits if required files/patterns are missing, scope exceeds the plan, or security/auth/persistence/deployment/product/architecture decisions are needed.",
		"Return compactly: Summary / Files Changed / Validation / Deviations from Plan / Risks.",
	].join("\n");
}

function baseResult(input: DelegateRunInput, config: ConductorConfig): DelegateRunResult {
	return {
		flow: "normal",
		plan: input.plan.trim(),
		allowedFiles: [],
		tools: config.delegateFlows.normal.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

function validateNormal(input: DelegateRunInput): string | undefined {
	if (!input.plan.trim()) return "Normal delegate needs an implementation plan or coding instructions.";
	return undefined;
}

export const normalDelegate: DelegateFlow<ConductorConfig> = {
	name: "normal",
	async run(input: DelegateRunInput, config: ConductorConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.normal;
		const result = baseResult(input, config);
		const blockedReason = validateNormal(input);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		context.onUpdate?.({ content: [{ type: "text", text: "Normal delegate running..." }], details: result });

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
			buildNormalPrompt(input.plan, config),
		];

		const child = await runChildPi({
			cwd: context.cwd,
			args,
			timeoutMs: flow.timeoutMs,
			signal: context.signal,
			onUpdate: ({ finalOutput, stderr }) => {
				context.onUpdate?.({
					content: [{ type: "text", text: finalOutput || "Normal delegate running..." }],
					details: { ...result, finalOutput, stderr },
				});
			},
		});

		const finalResult = { ...result, exitCode: child.exitCode, finalOutput: child.finalOutput, stderr: child.stderr };
		if (child.timedOut) return { ...finalResult, exitCode: 1, blockedReason: `Normal delegate timed out after ${flow.timeoutMs}ms.` };
		if (child.aborted) return { ...finalResult, exitCode: 1, blockedReason: "Normal delegate was aborted." };
		return finalResult;
	},
};
