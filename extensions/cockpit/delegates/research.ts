import type { CockpitConfig } from "../config.js";
import { runChildPi } from "./child-pi.js";
import { fileArgsForPlan } from "./context.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

function buildResearchPrompt(task: string, config: CockpitConfig): string {
	const flow = config.delegateFlows.research;
	return [
		"Research delegate. Produce a concise codebase Research Brief for a planner agent.",
		`Task: ${task.trim()}`,
		`Tools: ${flow.tools.join(", ")}. Use ls/find/grep/read for local discovery; grep is ripgrep-backed and respects .gitignore by default.`,
		`Thinking: ${flow.thinking}. Use the default fast model configuration and keep reasoning lightweight.`,
		"You are read-only. Do not edit files. Do not write files. Do not implement code. Do not run mutating commands. Do not create a full solution plan. Do not decide final architecture.",
		"Local research rules:",
		"- Inspect the local codebase first.",
		"- Use search commands that respect .gitignore by default; do not bypass ignore rules unless explicitly requested.",
		`- Read at most ${flow.maxFiles} files fully.`,
		"- For other files, rely on filenames, grep snippets, imports, exports, and config metadata.",
		"- Avoid low-signal tracked files unless directly relevant: lockfiles, generated files, minified assets, large snapshots, logs, and vendored code.",
		"Search strategy:",
		"1. Inspect repo/package structure.",
		"2. Search primary task keywords.",
		"3. Search 2-3 synonyms or related domain terms if primary search is weak.",
		"4. Inspect relevant source files.",
		"5. Inspect related tests.",
		"6. Inspect package scripts/configs.",
		"7. Check hidden-contract locations when relevant: workspace config, shared types, API schemas, env/config loading, CI workflows, and generated-code markers.",
		"Web research rule:",
		"- If web_search/web_fetch tools are available, use them only when external knowledge is relevant.",
		"- Always inspect the local codebase first.",
		"- Use web search/fetch for current documentation, SDK/framework behavior, cloud APIs, plugin APIs, errors, migrations, or version-specific behavior.",
		"- Keep web research minimal: prefer 1-3 authoritative sources.",
		"- Prefer official documentation over blogs or forum posts.",
		"- Do not treat web docs as evidence of local repo behavior unless confirmed in repo files.",
		"- Include consulted URLs in the Research Brief.",
		"Insufficient context rule:",
		"- If primary keywords return no useful matches, try a small set of synonyms or related domain terms.",
		"- If no relevant implementation files, tests, or configs can be found after that, output exactly: INSUFFICIENT_CONTEXT: need deeper search",
		"- Also use INSUFFICIENT_CONTEXT if required external docs cannot be checked because web tools are unavailable.",
		"- Do not invent files, APIs, or behavior.",
		"Include a Research Tour: recommended file-reading order for the planner, with why each file matters.",
		"Include evidence quality, separating direct code evidence, test evidence, external docs evidence, and gaps.",
		"Return this markdown shape:",
		"# Research Brief",
		"## Task Understanding",
		"## Research Summary Meta",
		"- Confidence: High / Medium / Low",
		"- Confidence reason:",
		"- Files fully inspected: N",
		"- Key search terms attempted:",
		"- Relevant directories searched:",
		"- Used web: Yes / No",
		"## Evidence Quality",
		"- Direct code evidence:",
		"- Test evidence:",
		"- External docs evidence:",
		"- Gaps:",
		"## Research Tour",
		"Recommended order for planner to inspect evidence.",
		"## Relevant Files",
		"## Existing Patterns",
		"## Important Commands",
		"## External References",
		"## Risks / Hidden Contracts",
		"## Open Questions",
		"## Suggested Next Step for Planner",
	].join("\n");
}

function baseResult(input: DelegateRunInput, config: CockpitConfig): DelegateRunResult {
	return {
		flow: "research",
		plan: input.plan.trim(),
		allowedFiles: [],
		tools: config.delegateFlows.research.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
	};
}

function validateResearch(input: DelegateRunInput): string | undefined {
	if (!input.plan.trim()) return "Research delegate needs a task.";
	return undefined;
}

export const researchDelegate: DelegateFlow<CockpitConfig> = {
	name: "research",
	async run(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const flow = config.delegateFlows.research;
		const result = baseResult(input, config);
		const blockedReason = validateResearch(input);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason };

		const fileArgs = fileArgsForPlan(input.plan, config);

		context.onUpdate?.({ content: [{ type: "text", text: "Research delegate running..." }], details: result });

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
			buildResearchPrompt(input.plan, config),
			...fileArgs,
		];

		const child = await runChildPi({
			cwd: context.cwd,
			args,
			timeoutMs: flow.timeoutMs,
			signal: context.signal,
			onUpdate: ({ finalOutput, stderr }) => {
				context.onUpdate?.({
					content: [{ type: "text", text: finalOutput || "Research delegate running..." }],
					details: { ...result, finalOutput, stderr },
				});
			},
		});

		const finalResult = { ...result, exitCode: child.exitCode, finalOutput: child.finalOutput, stderr: child.stderr };
		if (child.timedOut) return { ...finalResult, exitCode: 1, blockedReason: `Research delegate timed out after ${flow.timeoutMs}ms.` };
		if (child.aborted) return { ...finalResult, exitCode: 1, blockedReason: "Research delegate was aborted." };
		return finalResult;
	},
};
