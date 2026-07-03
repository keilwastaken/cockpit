import type { CockpitConfig } from "../config.js";
import { runChildPi } from "./child-pi.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

function buildBriefPrompt(input: string, config: CockpitConfig): string {
	const flow = config.delegateFlows.brief;
	return [
		"Brief delegate. Turn a fuzzy user goal, ideation result, or selected direction into a concise product/design brief for the Cockpit Oracle.",
		`Input: ${input.trim()}`,
		`Tools: ${flow.tools.join(", ") || "none"}. Stay read-only. Use local code evidence only when it helps clarify existing UX, concepts, files, or constraints.`,
		`Thinking: ${flow.thinking}. Do not implement. Do not edit files. Do not write files. Do not produce a step-by-step coding plan.`,
		`Read budget: at most ${flow.maxFiles} files fully; use grep/find snippets for the rest.`,
		"Purpose:",
		"- Convert exploration into a planner-ready brief.",
		"- Preserve the user's intent and unresolved choices.",
		"- Separate goals/non-goals from implementation ideas.",
		"- Make the next planning step obvious.",
		"If the user's choice is still unclear, do not pretend it is approved. Mark Ready for Planning as No and ask the smallest useful set of questions.",
		"If the direction is clear enough, mark Ready for Planning as Yes and produce a crisp handoff for `/cockpit plan` or `/cockpit codeflow`.",
		"Return this markdown shape:",
		"# Cockpit Brief",
		"## Goal",
		"One or two sentences describing what the user wants.",
		"## Context",
		"Relevant project/product context and evidence. Mention files only if inspected or clearly provided.",
		"## Proposed Direction",
		"The selected direction in product/design terms, not coding steps.",
		"## User Experience / Developer Experience",
		"What the user or developer should experience when this is done.",
		"## Non-Goals",
		"What should intentionally stay out of scope.",
		"## Acceptance Criteria",
		"Observable outcomes that would make the brief satisfied.",
		"## Constraints",
		"Compatibility, project philosophy, safety, model/runtime, cost, or UX constraints.",
		"## Open Questions",
		"Only questions that block good planning. Use 'None' if no blockers remain.",
		"## Ready for Planning",
		"- Yes / No",
		"- Reason:",
		"## Planner Handoff",
		"A compact prompt that the Oracle can pass directly to `/cockpit plan` or `/cockpit codeflow` after human approval.",
	].join("\n");
}

function baseResult(input: DelegateRunInput, config: CockpitConfig): DelegateRunResult {
	return {
		flow: "brief",
		plan: input.plan.trim(),
		allowedFiles: [],
		tools: config.delegateFlows.brief.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

function validateBrief(input: DelegateRunInput): string | undefined {
	if (!input.plan.trim()) return "Brief delegate needs a goal, ideation result, selected direction, or product/design notes.";
	return undefined;
}

export const briefDelegate: DelegateFlow<CockpitConfig> = {
	name: "brief",
	async run(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.brief;
		const result = baseResult(input, config);
		const blockedReason = validateBrief(input);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		context.onUpdate?.({ content: [{ type: "text", text: "Brief delegate running..." }], details: result });

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
			buildBriefPrompt(input.plan, config),
		];

		const child = await runChildPi({
			cwd: context.cwd,
			args,
			timeoutMs: flow.timeoutMs,
			signal: context.signal,
			onUpdate: ({ finalOutput, stderr }) => {
				context.onUpdate?.({
					content: [{ type: "text", text: finalOutput || "Brief delegate running..." }],
					details: { ...result, finalOutput, stderr },
				});
			},
		});

		const finalResult = { ...result, exitCode: child.exitCode, finalOutput: child.finalOutput, stderr: child.stderr };
		if (child.timedOut) return { ...finalResult, exitCode: 1, blockedReason: `Brief delegate timed out after ${flow.timeoutMs}ms.` };
		if (child.aborted) return { ...finalResult, exitCode: 1, blockedReason: "Brief delegate was aborted." };
		return finalResult;
	},
};
