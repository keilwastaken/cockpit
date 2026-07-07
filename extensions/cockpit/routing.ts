import type { CockpitConfig } from "./config.js";

const FILE_PATTERN = /(?:^|\s)([\w@./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|dart|py|rb|go|rs|java|kt|swift|md|json|yaml|yml|toml|css|scss|html|sh|sql))(?:\s|$|[,:;.])/g;
const README_PATTERN = /\bREADME(?:\.md)?\b/i;
const REPO_SCOPE_PATTERN = /\b(?:extensions\/|src\/|package\.json|README(?:\.md)?|cockpit|this extension|this repo|this project|codebase)\b/i;

const DOMAIN_KEYWORDS: Array<[string, RegExp]> = [
	["auth", /\b(auth|login|logout|oauth|session|token|permission|user role)\b/i],
	["security", /\b(secret|credential|encrypt|decrypt|xss|csrf|injection|iam)\b/i],
	["persistence", /\b(database|schema|migration|storage|persist|save|delete data)\b/i],
	["deployment", /\b(deploy|publish|release|ci|terraform|infra|cloud)\b/i],
	["architecture", /\b(architecture|refactor|redesign|rewrite|framework|pattern|abstraction)\b/i],
];

const CODING_KEYWORDS = /\b(add|implement|fix|change|update|rename|remove|test|write|edit|create|debug|build|generate|document|map)\b/i;
const QUESTION_ONLY = /^(what|why|how|should\b|tell me\b|can you explain\b)/i;
const AMBIGUOUS = /\b(maybe|somehow|figure out|whatever|something|make it better|clean up everything|fix it|doesn't work)\b/i;
const MECHANICAL_EDIT = /\b(rename|typo|copy|text|comment|format|one-line|small edit|mechanical)\b/i;

const hasRepoScope = (text: string): boolean => REPO_SCOPE_PATTERN.test(text);

type CockpitRoute = "instant" | "fast" | "normal" | "cockpit-only" | "need-decision";

function analyzeTask(task: string) {
	const mentionedFiles = Array.from(task.matchAll(FILE_PATTERN), (match) => match[1]).filter(Boolean);
	if (README_PATTERN.test(task)) mentionedFiles.push("README");
	const uniqueFiles = Array.from(new Set(mentionedFiles));
	const riskDomains = DOMAIN_KEYWORDS.filter(([, regex]) => regex.test(task)).map(([domain]) => domain);
	const tasksLooksLikeCoding = CODING_KEYWORDS.test(task);
	const isQuestionOnly = QUESTION_ONLY.test(task.trim());
	const mechanicalEdit = MECHANICAL_EDIT.test(task) && riskDomains.length === 0;
	const estimatedFiles = uniqueFiles.length > 0 ? uniqueFiles.length : mechanicalEdit ? 1 : tasksLooksLikeCoding ? 2 : 0;
	const estimatedLines = mechanicalEdit ? 25 : estimatedFiles <= 1 ? 30 : estimatedFiles * 80;

	return {
		text: task,
		mentionedFiles: uniqueFiles,
		riskDomains,
		isQuestionOnly,
		tasksLooksLikeCoding,
		estimatedFiles,
		estimatedLines,
		isAmbiguous: AMBIGUOUS.test(task) || task.trim().length < 8,
	};
}

type TaskSignal = ReturnType<typeof analyzeTask>;

function missingContextQuestions(signals: TaskSignal): string[] {
	const questions: string[] = [];
	if (signals.isAmbiguous) questions.push("What exact outcome should the Oracle produce?");
	if (signals.tasksLooksLikeCoding && signals.mentionedFiles.length === 0 && !hasRepoScope(signals.text)) questions.push("Which file or area should the Oracle inspect first?");
	if (signals.riskDomains.length > 0 && signals.mentionedFiles.length === 0) questions.push("This touches a risk domain; which exact files/paths should be inspected or edited?");
	return questions;
}

function confidenceFor(route: CockpitRoute, signals: TaskSignal, forced: boolean): number {
	let confidence = route === "instant" ? 0.9 : route === "fast" ? 0.8 : route === "normal" ? 0.7 : route === "cockpit-only" ? 0.75 : 0.45;
	if (forced) confidence = Math.min(confidence, 0.65);
	if (signals.isAmbiguous) confidence -= 0.25;
	if (signals.mentionedFiles.length === 0 && signals.tasksLooksLikeCoding) confidence -= 0.1;
	if (signals.riskDomains.length > 0) confidence -= 0.05;
	return Math.max(0.1, Math.min(0.95, Number(confidence.toFixed(2))));
}

function suggestedRefinement(task: string, signals: TaskSignal): string | undefined {
	if (!signals.isAmbiguous && (signals.mentionedFiles.length > 0 || hasRepoScope(signals.text))) return undefined;
	return `Please ${task.trim()} in <one specific file>; keep the diff minimal; run the narrowest obvious validation; stop if broader decisions are needed.`;
}

function fitsInstant(signals: TaskSignal, config: CockpitConfig): boolean {
	const flow = config.delegateFlows.instant;
	const disallowedDomain = signals.riskDomains.find((domain) => config.disallowDomains.includes(domain));
	return !signals.isAmbiguous && !disallowedDomain && signals.estimatedFiles <= flow.maxFiles && signals.estimatedLines <= flow.maxEstimatedLines;
}

function fitsFast(signals: TaskSignal, config: CockpitConfig): boolean {
	const flow = config.delegateFlows.fast;
	const disallowedDomain = signals.riskDomains.find((domain) => domain !== "architecture" && config.disallowDomains.includes(domain));
	return !signals.isAmbiguous && !disallowedDomain && signals.estimatedFiles <= flow.maxFiles && signals.estimatedLines <= flow.maxEstimatedLines;
}

function fitsNormal(signals: TaskSignal, config: CockpitConfig): boolean {
	const flow = config.delegateFlows.normal;
	const disallowedDomain = signals.riskDomains.find((domain) => config.disallowDomains.includes(domain));
	return !signals.isAmbiguous && !disallowedDomain && signals.estimatedFiles <= flow.maxFiles && signals.estimatedLines <= flow.maxEstimatedLines;
}

function makeDecision(route: CockpitRoute, config: CockpitConfig, signals: TaskSignal, forced = false, reasons: string[] = [], risks: string[] = []) {
	const tier = route === "instant" || route === "fast" || route === "normal" ? route : undefined;
	const delegateValue = route === "instant" ? "low" : route === "fast" ? "medium" : route === "normal" ? "medium" : route === "need-decision" ? "unknown" : "low";
	const directIsFine = route === "instant" || route === "cockpit-only" || (route === "fast" && signals.estimatedFiles <= 2 && signals.riskDomains.length === 0);
	return {
		route,
		tier,
		suggestedAgent: tier ? config.delegateFlows[tier].agent : undefined,
		requiresApproval: route === "normal",
		directIsFine,
		delegateValue,
		confidence: confidenceFor(route, signals, forced),
		missingContextQuestions: missingContextQuestions(signals),
		suggestedRefinement: suggestedRefinement(signals.text, signals),
		reasons,
		risks,
		signals,
	};
}

export function routeTask(task: string, config: CockpitConfig, forcedInstant = false) {
	const signals = analyzeTask(task);
	const risks = signals.riskDomains.map((domain) => `Risk domain detected: ${domain}`);
	if (signals.isQuestionOnly) risks.push("Task is question-oriented; delegation may add overhead.");
	if (!signals.tasksLooksLikeCoding) risks.push("Task does not clearly request code changes.");
	if (signals.isAmbiguous) risks.push("Task is ambiguous and may need clarification.");

	if (forcedInstant) return makeDecision("instant", config, signals, true, ["Instant profile forced by user."], risks);

	if (signals.isQuestionOnly || !signals.tasksLooksLikeCoding) {
		return makeDecision("cockpit-only", config, signals, false, ["Keep conversational or non-coding work in the main chat."], risks);
	}

	if (fitsInstant(signals, config)) {
		return makeDecision("instant", config, signals, false, ["Task is exact, unambiguous, and fits instant thresholds."], risks);
	}

	if (fitsFast(signals, config)) {
		return makeDecision("fast", config, signals, false, ["Task is small, semantic, and fits fast delegate thresholds."], risks);
	}

	if (fitsNormal(signals, config)) {
		return makeDecision("normal", config, signals, false, ["Task is bounded, multi-file, and fits normal delegate thresholds."], risks);
	}

	return makeDecision("need-decision", config, signals, false, ["Clarify, use a heavier flow later, or handle this in the main chat."], risks);
}

export function formatDecision(decision: ReturnType<typeof routeTask>): string {
	const recommendedPath = decision.route === "instant"
		? "direct edit using instant discipline; delegate only if isolation is useful"
		: decision.route === "fast"
			? "direct if interactive, otherwise fast delegate for noisy local discovery"
			: decision.route === "normal"
				? "normal delegate or codeflow if the user wants background implementation/review"
				: decision.route === "cockpit-only"
					? "keep in the main Oracle chat"
					: "ask for direction, ideate/research, or preplan before implementation";
	const lines = [
		`Recommendation: ${recommendedPath}`,
		`Legacy route/profile: ${decision.route}`,
		decision.suggestedAgent ? `Suggested delegate if delegating: ${decision.suggestedAgent}` : undefined,
		`Direct is fine: ${decision.directIsFine ? "yes" : "not recommended yet"}`,
		`Delegate value: ${decision.delegateValue}`,
		`Route confidence: ${Math.round(decision.confidence * 100)}%`,
		`Requires approval before writer execution: ${decision.requiresApproval ? "yes" : "no"}`,
		`Estimated scope: ${decision.signals.estimatedFiles} file(s), ~${decision.signals.estimatedLines} line(s)`,
		decision.signals.mentionedFiles.length > 0 ? `Mentioned files: ${decision.signals.mentionedFiles.join(", ")}` : undefined,
		decision.reasons.length > 0 ? `Reasons:\n${decision.reasons.map((reason) => `- ${reason}`).join("\n")}` : undefined,
		decision.risks.length > 0 ? `Risks:\n${decision.risks.map((risk) => `- ${risk}`).join("\n")}` : undefined,
		decision.missingContextQuestions.length > 0 ? `Missing context questions:\n${decision.missingContextQuestions.map((question) => `- ${question}`).join("\n")}` : undefined,
		decision.suggestedRefinement ? `Suggested refinement: ${decision.suggestedRefinement}` : undefined,
	];
	return lines.filter(Boolean).join("\n");
}
