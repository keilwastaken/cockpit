import type { CockpitConfig } from "../config.js";
import { runChildPi } from "./child-pi.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

const unique = (values: string[]): string[] => {
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = value || "__default__";
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const perspectives = [
	{
		name: "Pragmatic path",
		focus: "Find the smallest useful version. Prefer boring implementation, existing project patterns, limited scope, and fast validation.",
	},
	{
		name: "Ambitious path",
		focus: "Explore the higher-leverage version. Consider UX, architecture seams, future extensibility, and what the feature/refactor could become if done well.",
	},
	{
		name: "Risk and maintenance path",
		focus: "Stress-test the idea. Identify hidden complexity, migration hazards, regressions, edge cases, and cheaper alternatives.",
	},
];

function buildIdeationPrompt(task: string, config: CockpitConfig, perspective: { name: string; focus: string }): string {
	const flow = config.delegateFlows.ideate;
	return [
		"Ideate delegate. You are one member of a divergent design council for an unclear feature, refactor, or implementation direction.",
		`Input: ${task.trim()}`,
		`Perspective: ${perspective.name}`,
		`Focus: ${perspective.focus}`,
		`Tools: ${flow.tools.join(", ") || "none"}. Stay read-only. Use local code evidence first; use web only for relevant external contracts/current docs.`,
		`Thinking: ${flow.thinking}. Do not implement. Do not edit files. Do not write files. Do not run mutating commands.`,
		`Read budget: at most ${flow.maxFiles} files fully; use grep/find snippets for the rest.`,
		"The user may not know what they want yet. Your job is to make the option space clearer, not to force a single implementation plan.",
		"Prefer concrete tradeoffs over vague brainstorming. Ground claims in observed project structure when possible.",
		"Return this markdown shape:",
		`# Ideation Variant: ${perspective.name}`,
		"## Core Idea",
		"## When This Is The Right Choice",
		"## Sketch Of The UX / Developer Experience",
		"## Implementation Shape",
		"## Files / Areas To Inspect Or Change",
		"## Tradeoffs",
		"## Risks / Unknowns",
		"## Validation / Success Signals",
		"## One-Sentence Recommendation",
	].join("\n");
}

function buildSynthesisPrompt(task: string, variants: Array<{ name: string; model: string; output: string }>, config: CockpitConfig): string {
	const flow = config.delegateFlows.ideate;
	return [
		"Ideate synthesis delegate. Compare divergent ideation variants and produce a decision brief for the Cockpit Oracle.",
		`Original input: ${task.trim()}`,
		`Thinking: ${flow.thinking}. Stay read-only and do not implement.`,
		"Variants:",
		...variants.map((variant, index) => [
			`## Variant ${index + 1}: ${variant.name}`,
			`Model: ${variant.model || "current Pi default"}`,
			variant.output || "No output.",
		].join("\n")),
		"Return this markdown shape:",
		"# Ideation Result",
		"## Recommended Direction",
		"Recommend one direction for the human to choose, or say if the choice is genuinely unclear. Do not claim the direction is approved.",
		"## Why",
		"## Option Matrix",
		"Compare options by user value, implementation cost, risk, reversibility, and validation clarity.",
		"## Human Decision Needed",
		"The exact choice or confirmation the Oracle should ask the human for before planning or codeflow.",
		"## Recommended Next Step After Human Approval",
		"A concrete next prompt for `/cockpit plan` or `/cockpit codeflow`, or questions to ask the human first.",
		"## Keep / Drop / Defer",
		"## Risks To Watch",
		"## Raw Variant Summaries",
	].join("\n\n");
}

function baseResult(input: DelegateRunInput, config: CockpitConfig): DelegateRunResult {
	return {
		flow: "ideate",
		plan: input.plan.trim(),
		allowedFiles: [],
		tools: config.delegateFlows.ideate.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

function validateIdeate(input: DelegateRunInput): string | undefined {
	if (!input.plan.trim()) return "Ideate delegate needs a feature, refactor, product direction, or unclear implementation idea.";
	return undefined;
}

function ideationModels(config: CockpitConfig): string[] {
	const reasoning = config.delegateFlows.ideate.model || config.delegateFlows.planner.model || config.delegateFlows.reviewer.model;
	const hands = config.delegateFlows.normal.model || config.delegateFlows.fast.model || config.delegateFlows.instant.model;
	const models = unique([reasoning, hands]);
	return models.length > 0 ? models : [""];
}

export const ideateDelegate: DelegateFlow<CockpitConfig> = {
	name: "ideate",
	async run(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.ideate;
		const result = baseResult(input, config);
		const blockedReason = validateIdeate(input);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		context.onUpdate?.({ content: [{ type: "text", text: "Ideate delegate running divergent passes..." }], details: result });

		const models = ideationModels(config);
		const variantJobs = perspectives.map((perspective, index) => {
			const model = models[index % models.length] ?? "";
			const args = [
				"--mode",
				"json",
				"-p",
				"--no-session",
				...(model ? ["--model", model] : []),
				"--thinking",
				flow.thinking,
				"--no-skills",
				"--no-prompt-templates",
				"--no-context-files",
				context.projectTrusted ? "--approve" : "--no-approve",
				"--tools",
				flow.tools.join(","),
				buildIdeationPrompt(input.plan, config, perspective),
			];
			return runChildPi({
				cwd: context.cwd,
				args,
				timeoutMs: flow.timeoutMs,
				signal: context.signal,
				onUpdate: ({ finalOutput, stderr }) => {
					context.onUpdate?.({
						content: [{ type: "text", text: finalOutput || `Ideate ${perspective.name} running...` }],
						details: { ...result, stderr },
					});
				},
			}).then((child) => ({ perspective, model, child }));
		});

		const variants = await Promise.all(variantJobs);
		const variantOutputs = variants.map(({ perspective, model, child }) => ({ name: perspective.name, model, output: child.finalOutput }));
		const variantText = variantOutputs.map((variant, index) => [`## Variant ${index + 1}: ${variant.name}`, `Model: ${variant.model || "current Pi default"}`, variant.output || "No output."].join("\n")).join("\n\n");
		const stderr = variants.map(({ child }) => child.stderr).filter(Boolean).join("\n");
		const failed = variants.filter(({ child }) => child.exitCode !== 0 || child.timedOut || child.aborted);

		const synthesisArgs = [
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
			buildSynthesisPrompt(input.plan, variantOutputs, config),
		];
		const synthesis = await runChildPi({ cwd: context.cwd, args: synthesisArgs, timeoutMs: flow.timeoutMs, signal: context.signal });
		const finalOutput = synthesis.finalOutput || [`# Ideation Result`, "Synthesis did not return output. Raw variants:", variantText].join("\n\n");
		const finalResult = {
			...result,
			exitCode: failed.length === variants.length ? 1 : 0,
			finalOutput: `${finalOutput}\n\n---\n\n# Divergent Passes\n\n${variantText}`,
			stderr: [stderr, synthesis.stderr].filter(Boolean).join("\n"),
		};
		if (synthesis.timedOut) return { ...finalResult, blockedReason: `Ideate synthesis timed out after ${flow.timeoutMs}ms.` };
		if (synthesis.aborted) return { ...finalResult, blockedReason: "Ideate delegate was aborted." };
		return finalResult;
	},
};
