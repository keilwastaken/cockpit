import type { CockpitConfig } from "../config.js";
import { routeTask } from "../routing.js";
import { runChildPi } from "./child-pi.js";
import { promptContextForPlan } from "./context.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

function buildNormalPrompt(plan: string, config: CockpitConfig, skeleton: string): string {
	const flow = config.delegateFlows.normal;
	return [
		"Normal delegate. You are a bounded coding executor for an implementation plan.",
		skeleton,
		`Plan / instructions: ${plan.trim()}`,
		`Tools: ${flow.tools.join(", ")}. Use grep/find/ls/read for local discovery; grep is ripgrep-backed. Use edit/write for file changes.`,
		`Thinking: ${flow.thinking}. The planner owns deep reasoning; execute carefully and concisely.`,
		`Scope: edit/write at most ${flow.maxFiles} file(s), ~${flow.maxEstimatedLines} changed lines total.`,
		"Follow the planner's Coder Instructions first. Do not redesign. Do not broaden scope. Do not produce a new plan.",
		"Prefer minimal diffs and existing project style/patterns. Avoid large rewrites unless the plan explicitly asks for them.",
		"Bash rules: use bash only for safe validation commands and read-only discovery. Do not mutate files through shell redirection, sed -i, inline scripts, package installs, deletes, commits, pushes, deploys, publishes, or destructive commands.",
		"Validation: run only the validation commands listed in the plan unless a narrow obvious command is necessary. Do not claim commands/tests passed unless they were run.",
		"Repair: if validation fails, make at most one focused fix attempt, then report status.",
		"Prepare the reviewer handoff as you work: what changed, validation, deviations, known risks, and suggested review tour/order.",
		"Stop and report without further edits if required files/patterns are missing, scope exceeds the plan, or security/auth/persistence/deployment/product/architecture decisions are needed.",
		"Return compactly: Summary / Files Changed / Validation / Deviations from Plan / Reviewer Handoff / Risks.",
	].join("\n");
}

function baseResult(input: DelegateRunInput, config: CockpitConfig): DelegateRunResult {
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

function validateNormal(input: DelegateRunInput, config: CockpitConfig): string | undefined {
	const plan = input.plan.trim();
	if (!plan) return "Normal delegate needs an implementation plan or coding instructions.";

	const delegatedPlan = /Approved Implementation Plan|Approved plan:|Fix attempt|Reviewer Feedback|Coder Instructions/i.test(plan);
	if (delegatedPlan) return undefined;

	const decision = routeTask(plan, config);
	const flow = config.delegateFlows.normal;
	if (decision.signals.estimatedFiles > flow.maxFiles || decision.signals.estimatedLines > flow.maxEstimatedLines) {
		return `Task looks too broad for one normal delegate (${decision.signals.estimatedFiles} files, ~${decision.signals.estimatedLines} lines). Split it into a smaller slice or run /cockpit plan first.`;
	}

	const nonEmptyLines = plan.split("\n").map((line) => line.trim()).filter(Boolean);
	const actionCount = Array.from(plan.matchAll(/\b(add|implement|fix|update|wire|repair|strengthen|switch|create|remove|rewrite)\b/gi)).length;
	if (decision.signals.mentionedFiles.length === 0 && (nonEmptyLines.length >= 6 || actionCount >= 5)) {
		return "Task looks like a multi-slice implementation without exact files. Start with /cockpit plan, or name the first files/slice for /cockpit normal.";
	}

	return undefined;
}

export const normalDelegate: DelegateFlow<CockpitConfig> = {
	name: "normal",
	async run(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.normal;
		const result = baseResult(input, config);
		const blockedReason = validateNormal(input, config);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		const { skeleton, fileArgs } = await promptContextForPlan(context.cwd, input.plan, config);

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
			buildNormalPrompt(input.plan, config, skeleton),
			...fileArgs,
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
