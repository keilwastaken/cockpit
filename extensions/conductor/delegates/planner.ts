import type { ConductorConfig } from "../config.js";
import { runChildPi } from "./child-pi.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

function buildPlannerPrompt(taskAndResearch: string, config: ConductorConfig): string {
	const flow = config.delegateFlows.planner;
	return [
		"Planner delegate. Convert the user task and any Research Brief into a precise implementation plan for a coding agent.",
		`Input: ${taskAndResearch.trim()}`,
		`Tools: ${flow.tools.join(", ") || "none"}. Use tools only to verify critical assumptions when the provided research is missing, low-confidence, or contradictory.`,
		`Thinking: ${flow.thinking}. This is the high-leverage reasoning step; be careful and bounded.`,
		"Do not edit files. Do not write files. Do not implement code. Do not run mutating commands.",
		"Do not produce broad architecture proposals unless the task explicitly requires them.",
		"Treat the Research Brief as discovered evidence, not absolute truth. Prefer actual code/test/config evidence over assumptions.",
		"If the research is low confidence or missing key context, either ask for deeper research or produce a constrained plan with explicit assumptions.",
		"Planning focus:",
		"- exact files likely to change",
		"- files to avoid and why",
		"- step-by-step implementation sequence",
		"- acceptance criteria",
		"- validation commands",
		"- risks/watchouts",
		"- stop conditions for the coder",
		"- compact coder instructions that can be handed directly to the coding agent",
		"Tool/search rules if verification is needed:",
		"- Stay read-only.",
		`- Read at most ${flow.maxFiles} files fully; use grep snippets for the rest.`,
		"- Use web only for external SDK/framework/cloud/API contracts when local evidence requires it.",
		"- Do not browse broadly; prefer official docs and include URLs if consulted.",
		"If a safe plan cannot be produced, output:",
		"NEEDS_DEEPER_RESEARCH:",
		"- <missing context item>",
		"Return this markdown shape:",
		"# Implementation Plan",
		"## Goal",
		"## Plan Confidence",
		"- Confidence: High / Medium / Low",
		"- Reason:",
		"- Requires deeper research: Yes / No",
		"## Assumptions",
		"## Files to Change",
		"## Files to Avoid",
		"## Step-by-Step Plan",
		"## Acceptance Criteria",
		"## Validation Commands",
		"## Risks / Watchouts",
		"## Stop Conditions",
		"## Coder Instructions",
	].join("\n");
}

function baseResult(input: DelegateRunInput, config: ConductorConfig): DelegateRunResult {
	return {
		flow: "planner",
		plan: input.plan.trim(),
		allowedFiles: [],
		tools: config.delegateFlows.planner.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

function validatePlanner(input: DelegateRunInput): string | undefined {
	if (!input.plan.trim()) return "Planner delegate needs a task and/or research brief.";
	return undefined;
}

export const plannerDelegate: DelegateFlow<ConductorConfig> = {
	name: "planner",
	async run(input: DelegateRunInput, config: ConductorConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.planner;
		const result = baseResult(input, config);
		const blockedReason = validatePlanner(input);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		context.onUpdate?.({ content: [{ type: "text", text: "Planner delegate running..." }], details: result });

		const args = [
			"--mode",
			"json",
			"-p",
			"--no-session",
			...(flow.model ? ["--model", flow.model] : []),
			"--thinking",
			flow.thinking,
			"--no-skills",
			"--no-prompt-templates",
			"--no-context-files",
			context.projectTrusted ? "--approve" : "--no-approve",
			"--tools",
			flow.tools.join(","),
			buildPlannerPrompt(input.plan, config),
		];

		const child = await runChildPi({
			cwd: context.cwd,
			args,
			timeoutMs: flow.timeoutMs,
			signal: context.signal,
			onUpdate: ({ finalOutput, stderr }) => {
				context.onUpdate?.({
					content: [{ type: "text", text: finalOutput || "Planner delegate running..." }],
					details: { ...result, finalOutput, stderr },
				});
			},
		});

		const finalResult = { ...result, exitCode: child.exitCode, finalOutput: child.finalOutput, stderr: child.stderr };
		if (child.timedOut) return { ...finalResult, exitCode: 1, blockedReason: `Planner delegate timed out after ${flow.timeoutMs}ms.` };
		if (child.aborted) return { ...finalResult, exitCode: 1, blockedReason: "Planner delegate was aborted." };
		return finalResult;
	},
};
