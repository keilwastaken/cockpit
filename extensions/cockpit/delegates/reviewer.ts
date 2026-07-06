import type { CockpitConfig } from "../config.js";
import { runChildPi } from "./child-pi.js";
import { fileArgsForPlan } from "./context.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

function buildReviewerPrompt(reviewRequest: string, config: CockpitConfig): string {
	const flow = config.delegateFlows.reviewer;
	return [
		"Reviewer delegate. You are a read-only senior code reviewer for completed agent work.",
		`Review request / context: ${reviewRequest.trim()}`,
		`Tools: ${flow.tools.join(", ")}. Use bash only for read-only inspection commands such as git status, git diff --stat, git diff, git log, and listed validation commands.`,
		`Thinking: ${flow.thinking}. Be rigorous, but keep feedback actionable and calibrated.`,
		"Core principle: review the work product against the task/plan, not the agent's thought process.",
		"Do not edit files. Do not write files. Do not mutate the working tree, index, HEAD, branches, remotes, or environment. Do not run installs, formatters, generators, commits, pushes, deploys, or destructive commands.",
		"If no explicit git range is provided, review the current working-tree diff. Start with git status --short and git diff --stat, then inspect relevant diffs.",
		"If a base/head range is provided in the request, review that range with git diff --stat BASE..HEAD and git diff BASE..HEAD.",
		`Read at most ${flow.maxFiles} files fully; prefer diff hunks, grep snippets, and targeted reads for context.`,
		"What to check:",
		"- Plan/requirement alignment: implemented what was requested, no unjustified deviations.",
		"- Correctness: bugs, edge cases, regressions, type/runtime errors.",
		"- Tests/validation: meaningful coverage, validation actually run or clearly missing.",
		"- Code quality: simple design, error handling, maintainability, no premature broad abstractions.",
		"- Risk: security, data loss, auth, persistence, deployment, compatibility, generated/secret files.",
		"Feedback weight routing:",
		"- none: no blocking issues; cockpit can approve.",
		"- light: 1-2 localized fixes; send directly to coder.",
		"- medium: several localized issues but plan remains valid; send to coder unless fix attempts are exhausted.",
		"- heavy: many issues, plan mismatch, structural problem, or strategy likely wrong; send back to planner.",
		"- blocker: human/cockpit decision needed due to ambiguity, high risk, credentials/external dependency, security/data-loss/deployment concern, or unclear product requirement.",
		"Cockpit routing policy: none -> approve; light -> coder_fix; medium -> coder_fix unless fix attempts >= 2, then planner_revision; heavy -> planner_revision; blocker -> human_decision.",
		"Calibrate severity. Do not mark nitpicks as Critical. Do not approve without inspecting the diff. Give file/line evidence for issues where possible.",
		"Return this markdown shape exactly:",
		"# Review Result",
		"## Verdict",
		"APPROVED / CHANGES_REQUESTED / NEEDS_HUMAN_DECISION",
		"## Feedback Weight",
		"- Weight: none / light / medium / heavy / blocker",
		"- Reason:",
		"- Recommended route: approve / coder_fix / planner_revision / human_decision",
		"## Cockpit Routing Signal",
		"- Feedback weight:",
		"- Critical count:",
		"- Important count:",
		"- Minor count:",
		"- Suggested next delegate: none / normal / planner / human",
		"- Escalate after coder fix attempt #: 2 for medium, immediately for heavy/blocker",
		"## Change Summary",
		"## Review Tour",
		"Recommended order to inspect changed files, with one-line reason for each.",
		"## Strengths",
		"## Issues",
		"### Critical",
		"### Important",
		"### Minor",
		"For each issue include File:line, Problem, Why it matters, Suggested fix.",
		"## Plan Alignment",
		"- Matches plan: Yes / No / Partial",
		"- Deviations:",
		"## Validation Assessment",
		"- Commands reported:",
		"- Commands reviewer verified:",
		"- Gaps:",
		"## Fix Packet for Coder",
		"Only include actionable fix steps if weight is light or medium; otherwise say N/A.",
		"## Replan Packet for Planner",
		"Only include failed assumptions/reconsiderations if weight is heavy; otherwise say N/A.",
		"## Human Decision Needed",
		"Only include decision/options/risk if weight is blocker; otherwise say N/A.",
		"## Final Recommendation",
	].join("\n");
}

function baseResult(input: DelegateRunInput, config: CockpitConfig): DelegateRunResult {
	return {
		flow: "reviewer",
		plan: input.plan.trim(),
		allowedFiles: [],
		tools: config.delegateFlows.reviewer.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

function validateReviewer(input: DelegateRunInput): string | undefined {
	if (!input.plan.trim()) return "Reviewer delegate needs review context: task/plan and what changed.";
	return undefined;
}

export const reviewerDelegate: DelegateFlow<CockpitConfig> = {
	name: "reviewer",
	async run(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.reviewer;
		const result = baseResult(input, config);
		const blockedReason = validateReviewer(input);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		const fileArgs = fileArgsForPlan(input.plan, config);

		context.onUpdate?.({ content: [{ type: "text", text: "Reviewer delegate running..." }], details: result });

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
			buildReviewerPrompt(input.plan, config),
			...fileArgs,
		];

		const child = await runChildPi({
			cwd: context.cwd,
			args,
			timeoutMs: flow.timeoutMs,
			signal: context.signal,
			onUpdate: ({ finalOutput, stderr }) => {
				context.onUpdate?.({
					content: [{ type: "text", text: finalOutput || "Reviewer delegate running..." }],
					details: { ...result, finalOutput, stderr },
				});
			},
		});

		const finalResult = { ...result, exitCode: child.exitCode, finalOutput: child.finalOutput, stderr: child.stderr };
		if (child.timedOut) return { ...finalResult, exitCode: 1, blockedReason: `Reviewer delegate timed out after ${flow.timeoutMs}ms.` };
		if (child.aborted) return { ...finalResult, exitCode: 1, blockedReason: "Reviewer delegate was aborted." };
		return finalResult;
	},
};
