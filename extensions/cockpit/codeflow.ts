import type { CockpitConfig } from "./config.js";
import { extractFilePaths } from "./delegates/context.js";
import type { DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./delegates/protocol.js";
import { runRole } from "./delegates/runner.js";
import { routeTask } from "./routing.js";

type CodeflowRoute = "approved" | "coder_fix" | "planner_revision" | "human_decision" | "preplan_ready" | "stopped";
type ExecutorName = "instant" | "fast" | "normal";
type FeedbackWeight = "none" | "light" | "medium" | "heavy" | "blocker" | "unknown";

type CodeflowStep = {
	name: string;
	exitCode: number;
	blockedReason?: string;
	finalOutput: string;
};

export type CodeflowRunResult = DelegateRunResult & {
	steps: CodeflowStep[];
	researchUsed: boolean;
	executor?: ExecutorName;
	feedbackWeight?: FeedbackWeight;
	route?: CodeflowRoute;
	fixAttempts: number;
	plannerRevisions: number;
};

const MAX_CODER_FIX_ATTEMPTS = 2;
const MAX_PLANNER_REVISIONS = 1;

const outputSnippet = (text: string, maxLength = 4000): string =>
	text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`;

const hasMarker = (text: string, marker: string): boolean => text.toLowerCase().includes(marker.toLowerCase());

function baseResult(input: DelegateRunInput, config: CockpitConfig): CodeflowRunResult {
	return {
		flow: "codeflow",
		plan: input.plan.trim(),
		allowedFiles: [],
		tools: Array.from(new Set(Object.values(config.delegateFlows).flatMap((flow) => flow.tools))),
		exitCode: 0,
		finalOutput: "",
		stderr: "",
		steps: [],
		researchUsed: false,
		fixAttempts: 0,
		plannerRevisions: 0,
	};
}

function codeflowBudgetConfig(config: CockpitConfig): CockpitConfig {
	const clone = structuredClone(config);
	for (const name of ["research", "planner", "reviewer", "normal", "taskWriter", "ideate"] as const) {
		clone.delegateFlows[name].maxTurns = 0;
	}
	return clone;
}

function shouldRunResearch(task: string, config: CockpitConfig): boolean {
	const decision = routeTask(task, config);
	const signals = decision.signals;
	const externalKnowledge = /\b(api|sdk|framework|library|cloud|provider|plugin|webhook|oauth|stripe|aws|gcp|azure|error|deprecat|migration|version)\b/i.test(task);
	return (
		decision.route === "normal" ||
		decision.route === "need-decision" ||
		signals.mentionedFiles.length === 0 ||
		signals.riskDomains.length > 0 ||
		externalKnowledge
	);
}

function needsMoreResearch(plannerOutput: string): boolean {
	return hasMarker(plannerOutput, "NEEDS_DEEPER_RESEARCH") || hasMarker(plannerOutput, "NEEDS_RESEARCH");
}

function plannerInput(task: string, researchOutput?: string, priorReview?: string): string {
	return [
		"Original user task:",
		task,
		researchOutput ? `\nResearch Brief:\n${researchOutput}` : "",
		priorReview ? `\nPrior review requiring planner revision:\n${priorReview}` : "",
	].filter(Boolean).join("\n");
}

function parseExecutor(plannerOutput: string): ExecutorName | undefined {
	const match = plannerOutput.match(/recommended\s+(?:delegate|executor|route|flow)\s*:\s*(instant|fast|small|normal)/i);
	if (!match) return undefined;
	const value = match[1].toLowerCase();
	return value === "small" ? "fast" : (value as ExecutorName);
}

function fallbackExecutor(task: string, plan: string, config: CockpitConfig): ExecutorName {
	const decision = routeTask(`${task}\n${plan}`, config);
	if (decision.route === "instant" || decision.route === "fast" || decision.route === "normal") return decision.route;
	return "normal";
}

function fileFromText(text: string, config: CockpitConfig): string {
	return routeTask(text, config, true).signals.mentionedFiles[0] ?? "";
}

function parseFeedbackWeight(reviewOutput: string): FeedbackWeight {
	const match = reviewOutput.match(/(?:Weight|Feedback weight)\s*:\s*(none|light|medium|heavy|blocker)/i);
	return match ? (match[1].toLowerCase() as FeedbackWeight) : "unknown";
}

function routeForWeight(weight: FeedbackWeight, fixAttempts: number): CodeflowRoute {
	if (weight === "none") return "approved";
	if (weight === "light") return "coder_fix";
	if (weight === "medium") return fixAttempts < MAX_CODER_FIX_ATTEMPTS ? "coder_fix" : "planner_revision";
	if (weight === "heavy") return "planner_revision";
	if (weight === "blocker") return "human_decision";
	return "stopped";
}

function buildExecutionPlan(task: string, plannerOutput: string, researchOutput?: string): string {
	return [
		"Original user task:",
		task,
		researchOutput ? `\nResearch Brief:\n${researchOutput}` : "",
		"\nApproved Implementation Plan:",
		plannerOutput,
	].filter(Boolean).join("\n");
}

function buildReviewInput(task: string, researchOutput: string | undefined, plannerOutput: string, coderOutput: string): string {
	const filesChangedSection = coderOutput.match(/Files Changed[\s\S]*?(?=\n(?:#|\*|- )?\s*(?:Validation|Deviations|Reviewer|Risks))/i);
	let specificFiles = "";
	if (filesChangedSection) {
		const files = extractFilePaths(filesChangedSection[0]);
		if (files.length > 0) {
			specificFiles = `\n\nThe executor reported modifying these specific files. Focus your review and diffs ONLY on these files:\n${files.map(f => `- ${f}`).join("\n")}`;
		}
	}

	return [
		"Original user task:",
		task,
		researchOutput ? `\nResearch Brief:\n${researchOutput}` : "",
		"\nImplementation Plan:",
		plannerOutput,
		"\nCoder Result / Reviewer Handoff:",
		coderOutput,
		specificFiles || "\nReview the current working-tree diff unless an explicit git range is present above.",
	].filter(Boolean).join("\n");
}

function buildFixPlan(task: string, plannerOutput: string, coderOutput: string, reviewOutput: string, attempt: number): string {
	return [
		`Fix attempt ${attempt} of ${MAX_CODER_FIX_ATTEMPTS}.`,
		"Original user task:",
		task,
		"\nOriginal Implementation Plan:",
		plannerOutput,
		"\nPrevious Coder Result:",
		coderOutput,
		"\nReviewer Feedback:",
		reviewOutput,
		"\nApply only the Fix Packet for Coder and Critical/Important issues that are localized. Do not broaden scope. If the reviewer feedback indicates heavy/blocker or needs replanning, stop and report.",
	].join("\n");
}

async function runStep(
	name: string,
	result: CodeflowRunResult,
	context: DelegateRunContext,
	fn: () => Promise<DelegateRunResult>,
): Promise<DelegateRunResult> {
	context.onUpdate?.({ content: [{ type: "text", text: `Codeflow: ${name}...` }], details: result });
	const stepResult = await fn();
	result.steps.push({
		name,
		exitCode: stepResult.exitCode,
		blockedReason: stepResult.blockedReason,
		finalOutput: outputSnippet(stepResult.finalOutput || stepResult.stderr || stepResult.blockedReason || ""),
	});
	context.onUpdate?.({ content: [{ type: "text", text: `Codeflow: ${name} finished.` }], details: result });
	return stepResult;
}

const isExecutorName = (value: unknown): value is ExecutorName => value === "instant" || value === "fast" || value === "normal";

async function runOneExecutor(
	executor: ExecutorName,
	plan: string,
	config: CockpitConfig,
	context: DelegateRunContext,
): Promise<DelegateRunResult> {
	if (executor === "instant") {
		const file = fileFromText(plan, config);
		if (!file) return runRole("normal", { plan }, config, context);
		return runRole("instant", { plan, file }, config, context);
	}
	if (executor === "fast") return runRole("fast", { plan }, config, context);
	return runRole("normal", { plan }, config, context);
}

async function runExecutor(
	executor: ExecutorName,
	task: string,
	plannerOutput: string,
	researchOutput: string | undefined,
	config: CockpitConfig,
	context: DelegateRunContext,
): Promise<DelegateRunResult> {
	let currentExecutor = executor;
	let plan = buildExecutionPlan(task, plannerOutput, researchOutput);
	const visited = new Set<ExecutorName>();

	while (true) {
		visited.add(currentExecutor);
		const result = await runOneExecutor(currentExecutor, plan, config, context);
		if (result.exitCode === 0 || !isExecutorName(result.escalateTo) || visited.has(result.escalateTo)) return result;

		const nextExecutor = result.escalateTo;
		context.onUpdate?.({
			content: [{ type: "text", text: `Codeflow: ${currentExecutor} escalated to ${nextExecutor}.` }],
			details: { ...result, finalOutput: result.finalOutput || result.blockedReason || "" },
		});
		plan = [
			plan,
			"",
			"Escalated within codeflow:",
			`- Previous executor: ${currentExecutor}`,
			result.blockedReason ? `- Reason: ${result.blockedReason}` : undefined,
			result.finalOutput ? `\nPrevious findings/output:\n${result.finalOutput}` : undefined,
		].filter((line): line is string => line !== undefined).join("\n");
		currentExecutor = nextExecutor;
	}
}

export async function runCodeflowPreplan(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<CodeflowRunResult> {
	config = codeflowBudgetConfig(config);
	const task = input.plan.trim();
	const result = baseResult(input, config);
	if (!task) return { ...result, exitCode: 1, blockedReason: "Codeflow preplan needs a task." };

	let researchOutput: string | undefined;
	let plannerOutput = "";

	if (shouldRunResearch(task, config)) {
		const research = await runStep("research", result, context, () => runRole("research", { plan: task }, config, context));
		result.researchUsed = true;
		researchOutput = research.finalOutput;
		if (research.exitCode !== 0 || research.blockedReason) {
			return { ...result, exitCode: 1, blockedReason: research.blockedReason ?? "Research step failed.", finalOutput: research.finalOutput || research.stderr };
		}
	}

	let planner = await runStep("planner", result, context, () => runRole("planner", { plan: plannerInput(task, researchOutput) }, config, context));
	plannerOutput = planner.finalOutput;
	if (planner.exitCode !== 0 || planner.blockedReason) {
		return { ...result, exitCode: 1, blockedReason: planner.blockedReason ?? "Planner step failed.", finalOutput: planner.finalOutput || planner.stderr };
	}

	if (needsMoreResearch(plannerOutput) && !researchOutput) {
		const research = await runStep("research-after-planner-request", result, context, () => runRole("research", { plan: task }, config, context));
		result.researchUsed = true;
		researchOutput = research.finalOutput;
		if (research.exitCode !== 0 || research.blockedReason) {
			return { ...result, exitCode: 1, blockedReason: research.blockedReason ?? "Research step failed after planner request.", finalOutput: research.finalOutput || research.stderr };
		}
		planner = await runStep("planner-after-research", result, context, () => runRole("planner", { plan: plannerInput(task, researchOutput) }, config, context));
		plannerOutput = planner.finalOutput;
	}

	if (needsMoreResearch(plannerOutput)) {
		return {
			...result,
			exitCode: 1,
			blockedReason: "Planner requested deeper research; cockpit should ask for human direction or a deeper research pass.",
			finalOutput: plannerOutput,
			route: "human_decision",
		};
	}

	const executor = parseExecutor(plannerOutput) ?? fallbackExecutor(task, plannerOutput, config);
	result.executor = executor;
	result.route = "preplan_ready";
	result.finalOutput = [
		"# Codeflow Preplan",
		"This is a read-only preplan. No executor has run and no files should have been changed by this job.",
		`- Recommended executor: ${executor}`,
		`- Research used: ${result.researchUsed ? "yes" : "no"}`,
		"",
		"## Approval Required",
		"Show this plan to the user and wait for explicit approval before starting the writer/codeflow job.",
		"",
		"## Planner Output",
		plannerOutput || "No planner output.",
	].join("\n");
	return result;
}

export async function runCodeflow(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<CodeflowRunResult> {
	config = codeflowBudgetConfig(config);
	const task = input.plan.trim();
	const result = baseResult(input, config);
	if (!task) return { ...result, exitCode: 1, blockedReason: "Codeflow needs a task." };

	let researchOutput: string | undefined;
	let plannerOutput = "";
	let coderOutput = "";
	let reviewOutput = "";

	if (shouldRunResearch(task, config)) {
		const research = await runStep("research", result, context, () => runRole("research", { plan: task }, config, context));
		result.researchUsed = true;
		researchOutput = research.finalOutput;
		if (research.exitCode !== 0 || research.blockedReason) {
			return { ...result, exitCode: 1, blockedReason: research.blockedReason ?? "Research step failed.", finalOutput: research.finalOutput || research.stderr };
		}
	}

	let planner = await runStep("planner", result, context, () => runRole("planner", { plan: plannerInput(task, researchOutput) }, config, context));
	plannerOutput = planner.finalOutput;
	if (planner.exitCode !== 0 || planner.blockedReason) {
		return { ...result, exitCode: 1, blockedReason: planner.blockedReason ?? "Planner step failed.", finalOutput: planner.finalOutput || planner.stderr };
	}

	if (needsMoreResearch(plannerOutput) && !researchOutput) {
		const research = await runStep("research-after-planner-request", result, context, () => runRole("research", { plan: task }, config, context));
		result.researchUsed = true;
		researchOutput = research.finalOutput;
		if (research.exitCode !== 0 || research.blockedReason) {
			return { ...result, exitCode: 1, blockedReason: research.blockedReason ?? "Research step failed after planner request.", finalOutput: research.finalOutput || research.stderr };
		}
		planner = await runStep("planner-after-research", result, context, () => runRole("planner", { plan: plannerInput(task, researchOutput) }, config, context));
		plannerOutput = planner.finalOutput;
	}

	if (needsMoreResearch(plannerOutput)) {
		return {
			...result,
			exitCode: 1,
			blockedReason: "Planner requested deeper research; cockpit should ask for human direction or a deeper research pass.",
			finalOutput: plannerOutput,
			route: "human_decision",
		};
	}

	const executor = parseExecutor(plannerOutput) ?? fallbackExecutor(task, plannerOutput, config);
	result.executor = executor;
	let coder = await runStep(`executor-${executor}`, result, context, () => runExecutor(executor, task, plannerOutput, researchOutput, config, context));
	if (isExecutorName(coder.flow)) result.executor = coder.flow;
	coderOutput = coder.finalOutput;
	if (coder.exitCode !== 0 || coder.blockedReason) {
		return { ...result, exitCode: 1, blockedReason: coder.blockedReason ?? `${executor} executor failed.`, finalOutput: coder.finalOutput || coder.stderr };
	}

	let review = await runStep("reviewer", result, context, () => runRole("reviewer", { plan: buildReviewInput(task, researchOutput, plannerOutput, coderOutput) }, config, context));
	reviewOutput = review.finalOutput;
	if (review.exitCode !== 0 || review.blockedReason) {
		return { ...result, exitCode: 1, blockedReason: review.blockedReason ?? "Reviewer step failed.", finalOutput: review.finalOutput || review.stderr };
	}

	let weight = parseFeedbackWeight(reviewOutput);
	let route = routeForWeight(weight, result.fixAttempts);

	while (route === "coder_fix" && result.fixAttempts < MAX_CODER_FIX_ATTEMPTS) {
		result.fixAttempts += 1;
		coder = await runStep(`coder-fix-${result.fixAttempts}`, result, context, () =>
			runRole("normal", { plan: buildFixPlan(task, plannerOutput, coderOutput, reviewOutput, result.fixAttempts) }, config, context),
		);
		coderOutput = coder.finalOutput;
		if (coder.exitCode !== 0 || coder.blockedReason) {
			return { ...result, exitCode: 1, blockedReason: coder.blockedReason ?? "Coder fix step failed.", finalOutput: coder.finalOutput || coder.stderr };
		}
		review = await runStep(`reviewer-after-fix-${result.fixAttempts}`, result, context, () =>
			runRole("reviewer", { plan: buildReviewInput(task, researchOutput, plannerOutput, coderOutput) }, config, context),
		);
		reviewOutput = review.finalOutput;
		weight = parseFeedbackWeight(reviewOutput);
		route = routeForWeight(weight, result.fixAttempts);
	}

	if (route === "planner_revision" && result.plannerRevisions < MAX_PLANNER_REVISIONS) {
		result.plannerRevisions += 1;
		const revisedPlanner = await runStep("planner-revision", result, context, () =>
			runRole("planner", { plan: plannerInput(task, researchOutput, reviewOutput) }, config, context),
		);
		plannerOutput = revisedPlanner.finalOutput;
		if (revisedPlanner.exitCode !== 0 || revisedPlanner.blockedReason || needsMoreResearch(plannerOutput)) {
			return {
				...result,
				exitCode: 1,
				blockedReason: revisedPlanner.blockedReason ?? "Planner revision could not produce an executable plan.",
				finalOutput: plannerOutput || revisedPlanner.stderr,
				route: "human_decision",
			};
		}
		const revisedExecutor = parseExecutor(plannerOutput) ?? "normal";
		result.executor = revisedExecutor;
		coder = await runStep(`executor-after-replan-${revisedExecutor}`, result, context, () => runExecutor(revisedExecutor, task, plannerOutput, researchOutput, config, context));
		if (isExecutorName(coder.flow)) result.executor = coder.flow;
		coderOutput = coder.finalOutput;
		if (coder.exitCode !== 0 || coder.blockedReason) {
			return { ...result, exitCode: 1, blockedReason: coder.blockedReason ?? "Executor after replan failed.", finalOutput: coder.finalOutput || coder.stderr };
		}
		review = await runStep("reviewer-after-replan", result, context, () =>
			runRole("reviewer", { plan: buildReviewInput(task, researchOutput, plannerOutput, coderOutput) }, config, context),
		);
		reviewOutput = review.finalOutput;
		weight = parseFeedbackWeight(reviewOutput);
		route = routeForWeight(weight, result.fixAttempts);
	}

	result.feedbackWeight = weight;
	result.route = route;
	result.finalOutput = [
		"# Codeflow Result",
		`- Route: ${route}`,
		`- Executor: ${result.executor ?? "unknown"}`,
		`- Feedback weight: ${weight}`,
		`- Research used: ${result.researchUsed ? "yes" : "no"}`,
		`- Coder fix attempts: ${result.fixAttempts}`,
		`- Planner revisions: ${result.plannerRevisions}`,
		"\n## Final Review",
		reviewOutput || "No reviewer output.",
	].join("\n");

	if (route === "approved") return result;
	if (route === "human_decision") return { ...result, exitCode: 1, blockedReason: "Reviewer requested human/cockpit decision." };
	if (route === "planner_revision") return { ...result, exitCode: 1, blockedReason: "Reviewer feedback still requires planner revision." };
	return { ...result, exitCode: 1, blockedReason: "Codeflow stopped before approval; inspect review output for next route." };
}
