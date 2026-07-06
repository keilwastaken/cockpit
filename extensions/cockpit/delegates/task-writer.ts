import type { CockpitConfig } from "../config.js";
import { runChildPi } from "./child-pi.js";
import { fileArgsForPlan } from "./context.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

function buildTaskWriterPrompt(task: string, outputFile: string | undefined, config: CockpitConfig): string {
	const flow = config.delegateFlows.taskWriter;
	return [
		"Task writer delegate. You are a lightweight PM writing clear markdown task plans for later Cockpit agents to execute.",
		`Input: ${task.trim()}`,
		outputFile ? `Primary task file to write/update: ${outputFile}` : undefined,
		`Tools: ${flow.tools.join(", ")}. Use local discovery only when it helps make the task concrete.`,
		`Thinking: ${flow.thinking}. Be quick, practical, and specific; do not over-plan.`,
		`Discovery budget: read at most ${flow.maxFiles} files fully; prefer filenames, grep snippets, and existing docs for context.`,
		"Use the style of a durable migration/task plan: status metadata, rationale, scope boundaries, phased work tables, acceptance criteria, risks, open questions, and implementation order.",
		"Do not implement code. Do not refactor. Do not run mutating commands. Do not make product decisions silently; record decisions needed.",
		outputFile ? "If writing a file, only create/update the primary task file. Do not edit source files." : "Return the task plan in your final answer; do not write files unless a primary task file is provided.",
		"Write tasks that future delegates can execute without rereading this conversation.",
		"Return this markdown shape:",
		"# <Task / Migration / Feature Plan Title>",
		"> **Status**: Draft / Planning / Ready",
		"> **Date**: YYYY-MM-DD",
		"> **Scope**: one-sentence boundary",
		"## 1. Overview",
		"## 2. Rationale",
		"Use a table when helpful: Problem | Solution.",
		"## 3. Scope & Boundaries",
		"### In Scope",
		"### Out of Scope",
		"## 4. Current State / Context",
		"## 5. Target State / Desired Outcome",
		"## 6. Phased Task Plan",
		"Use phase subsections with task tables: Task | Status | Notes.",
		"## 7. Suggested Cockpit Routing",
		"Recommended delegate(s): instant / fast / normal / planner / research / reviewer / human",
		"## 8. Acceptance Criteria",
		"Use checkboxes.",
		"## 9. Validation Plan",
		"## 10. Risks & Open Questions",
		"Use a table when helpful: Risk / Question | Impact | Mitigation / Notes.",
		"## 11. Implementation Order",
		"## 12. Ready-To-Run Agent Prompts",
		"Include compact prompts for the next Cockpit agents."
	].filter((line): line is string => typeof line === "string").join("\n");
}

function baseResult(input: DelegateRunInput, config: CockpitConfig): DelegateRunResult {
	return {
		flow: "task-writer",
		plan: input.plan.trim(),
		allowedFiles: input.outputFile ? [input.outputFile] : [],
		outputFile: input.outputFile,
		tools: config.delegateFlows.taskWriter.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

function validateTaskWriter(input: DelegateRunInput): string | undefined {
	if (!input.plan.trim()) return "Task writer needs a task, idea, or backlog item to turn into a task packet.";
	return undefined;
}

export const taskWriterDelegate: DelegateFlow<CockpitConfig> = {
	name: "task-writer",
	async run(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.taskWriter;
		const result = baseResult(input, config);
		const blockedReason = validateTaskWriter(input);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		const fileArgs = fileArgsForPlan(input.plan, config, context.cwd);

		context.onUpdate?.({ content: [{ type: "text", text: "Task writer delegate running..." }], details: result });

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
			buildTaskWriterPrompt(input.plan, input.outputFile, config),
			...fileArgs,
		];

		const child = await runChildPi({
			cwd: context.cwd,
			args,
			timeoutMs: flow.timeoutMs,
			signal: context.signal,
			onUpdate: ({ finalOutput, stderr }) => {
				context.onUpdate?.({
					content: [{ type: "text", text: finalOutput || "Task writer delegate running..." }],
					details: { ...result, finalOutput, stderr },
				});
			},
		});

		const finalResult = { ...result, exitCode: child.exitCode, finalOutput: child.finalOutput, stderr: child.stderr };
		if (child.timedOut) return { ...finalResult, exitCode: 1, blockedReason: `Task writer timed out after ${flow.timeoutMs}ms.` };
		if (child.aborted) return { ...finalResult, exitCode: 1, blockedReason: "Task writer delegate was aborted." };
		return finalResult;
	},
};
