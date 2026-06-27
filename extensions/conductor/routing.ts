import type { ConductorConfig, ConductorRoute, ConductorTier, HandoffQuality, RiskDomain, RouteDecision, TaskSignal } from "./types.js";

/** File extension pattern to extract mentioned files */
const FILE_PATTERN = /(?:^|\s)([\w@./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|dart|py|rb|go|rs|java|kt|swift|md|json|yaml|yml|toml|css|scss|html|sh|sql))(?:\s|$|[,:;.])/g;

/** Domain keyword mappings for risk detection */
const DOMAIN_KEYWORDS: Array<[RiskDomain, RegExp]> = [
	["auth", /\b(auth|login|logout|oauth|cognito|session|token|permission|user role)\b/i],
	["security", /\b(secret|credential|encrypt|decrypt|xss|csrf|injection|permission|policy|iam|firewall)\b/i],
	["persistence", /\b(database|firestore|schema|migration|repository|storage|persist|save|delete data)\b/i],
	["deployment", /\b(deploy|publish|release|ci|github action|terraform|infra|lambda|cloud)\b/i],
	["architecture", /\b(architecture|refactor|redesign|rewrite|framework|pattern|boundary|abstraction)\b/i],
];

/** Keywords indicating coding/edit tasks */
const CODING_KEYWORDS = /\b(add|implement|fix|change|update|refactor|rename|remove|test|write|edit|create|scaffold|wire|integrate|debug)\b/i;

/** Patterns indicating question-only (non-coding) intent */
const QUESTION_ONLY = /^(what|why|how|should|can you explain|tell me|thoughts\??)/i;

/** Ambiguous patterns suggesting need for clarification */
const AMBIGUOUS = /\b(maybe|somehow|figure out|whatever|something|make it better|clean up everything|fix it|doesn't work)\b/i;

/** Patterns suggesting multi-file/planning scope */
const PLAN_WORDS = /\b(feature|flow|architecture|multi-file|refactor|redesign|review loop|auto flow|broad|large)\b/i;

/** Patterns indicating simple mechanical edits */
const MECHANICAL_EDIT = /\b(rename|typo|copy|text|comment|format|lint|one-line|small edit|mechanical)\b/i;

/** Analyze task text and return structured signals for routing decisions */
export function analyzeTask(task: string): TaskSignal {
	const mentionedFiles = Array.from(task.matchAll(FILE_PATTERN), (match) => match[1]).filter(Boolean);
	const uniqueFiles = Array.from(new Set(mentionedFiles));
	const riskDomains = DOMAIN_KEYWORDS.filter(([, regex]) => regex.test(task)).map(([domain]) => domain);
	const asksForCode = CODING_KEYWORDS.test(task);
	const isQuestionOnly = QUESTION_ONLY.test(task.trim()) && !asksForCode;
	const requiresPlan = PLAN_WORDS.test(task) || riskDomains.includes("architecture");
	const mechanicalEdit = MECHANICAL_EDIT.test(task) && !requiresPlan && riskDomains.length === 0;
	const estimatedFiles = uniqueFiles.length > 0 ? uniqueFiles.length : requiresPlan ? 9 : mechanicalEdit ? 1 : asksForCode ? 3 : 0;
	const estimatedLines = requiresPlan ? 600 : mechanicalEdit ? 25 : estimatedFiles <= 1 ? 80 : estimatedFiles * 80;

	return {
		text: task,
		mentionedFiles: uniqueFiles,
		riskDomains: riskDomains.length > 0 ? riskDomains : [],
		isQuestionOnly,
		tasksLooksLikeCoding: asksForCode,
		estimatedFiles,
		estimatedLines,
		requiresPlan,
		isAmbiguous: AMBIGUOUS.test(task) || task.trim().length < 8,
		mechanicalEdit,
	};
}

/** Generate missing context questions based on task signals */
function missingContextQuestions(signals: TaskSignal): string[] {
	const questions: string[] = [];
	if (signals.isAmbiguous) questions.push("What exact outcome should the worker produce?");
	if (signals.tasksLooksLikeCoding && signals.mentionedFiles.length === 0) questions.push("Which files, components, or area of the repo should be in scope?");
	if (signals.riskDomains.length > 0) questions.push("Are there product, API, data, security, deployment, or compatibility constraints the worker must preserve?");
	if (signals.estimatedFiles > 3 || signals.requiresPlan) questions.push("What validation evidence is required before this can be considered done?");
	return questions;
}

function summarizeMissing(items: string[]): string {
	if (items.length === 0) return "ready";
	if (items.length === 1) return `needs ${items[0]}`;
	if (items.length === 2) return `needs ${items[0]} and ${items[1]}`;
	return `needs ${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function handoffQuality(signals: TaskSignal): HandoffQuality {
	const scopeIdentified = signals.mentionedFiles.length > 0 || /\b(?:extensions\/|test\/|src\/|package\.json|README|prompts\/|skills\/|conductor)\b/i.test(signals.text);
	const validationRepresented = /\b(?:test|tests|validate|validation|verify|verification|lint|typecheck|check)\b/i.test(signals.text) || signals.requiresPlan;
	const checks = [
		{ id: "outcome", label: "Desired outcome is present", passed: !signals.isAmbiguous && signals.text.trim().length >= 8 },
		{ id: "scope", label: "Scope/files or repo area are identified", passed: scopeIdentified },
		{ id: "constraints", label: "Constraints/non-goals are represented or inferable", passed: true },
		{ id: "validation", label: "Validation expectation is present or inferable", passed: validationRepresented },
		{ id: "escalation", label: "Escalation/stop rules are represented", passed: true },
		{ id: "evidence", label: "Evidence expectation is represented", passed: true },
	] satisfies HandoffQuality["checks"];
	const missing = checks.filter((check) => !check.passed).map((check) => check.id);
	return {
		score: checks.length - missing.length,
		maxScore: checks.length,
		checks,
		missing,
		summary: summarizeMissing(missing),
	};
}

/** Suggest task refinement for improved delegation */
function suggestedRefinement(task: string, signals: TaskSignal): string | undefined {
	if (!signals.isAmbiguous && signals.mentionedFiles.length > 0) return undefined;
	const scope = signals.mentionedFiles.length > 0 ? `in ${signals.mentionedFiles.join(", ")}` : "in <specific files or repo area>";
	return `Please ${task.trim()} ${scope}; preserve existing behavior outside this scope; run <validation command>; stop if product/design decisions are needed.`;
}

/** Compute confidence score for a routing decision */
function confidenceFor(route: ConductorRoute, signals: TaskSignal, forced: boolean): number {
	let confidence = route === "instant" ? 0.9 : route === "fast" ? 0.8 : route === "careful" ? 0.72 : route === "cockpit-only" ? 0.75 : 0.45;
	if (forced) confidence = Math.min(confidence, 0.65);
	if (signals.isAmbiguous) confidence -= 0.25;
	if (signals.mentionedFiles.length === 0 && signals.tasksLooksLikeCoding) confidence -= 0.1;
	if (signals.riskDomains.length > 0) confidence -= 0.05;
	return Math.max(0.1, Math.min(0.95, Number(confidence.toFixed(2))));
}

/** Build base decision properties common to all routes */
function decisionBase(route: ConductorRoute, signals: TaskSignal, forced = false): Omit<RouteDecision, "route" | "requiresApproval" | "suggestedAgent" | "suggestedModel"> {
	return {
		confidence: confidenceFor(route, signals, forced),
		handoffQuality: handoffQuality(signals),
		missingContextQuestions: missingContextQuestions(signals),
		suggestedRefinement: suggestedRefinement(signals.text, signals),
		reasons: [],
		risks: [],
		signals,
	};
}

/** Get the suggested agent for a tier */
function agentForTier(config: ConductorConfig, tier: ConductorTier): string {
	if (tier === "instant") return config.agents.instant[0];
	if (tier === "fast") return config.agents.fast[0];
	return config.agents.careful;
}

/** Get the suggested model for a tier */
function modelForTier(config: ConductorConfig, tier: ConductorTier): string | undefined {
	if (tier === "instant") return config.models.instant || undefined;
	if (tier === "fast") return config.models.fast || undefined;
	return config.models.careful || undefined;
}

/** Check if task fits the instant profile */
function fitsInstant(signals: TaskSignal, config: ConductorConfig): boolean {
	const disallowedDomain = signals.riskDomains.find((domain) => config.routing.instant.disallowDomains.includes(domain));
	return (
		!signals.isAmbiguous &&
		!disallowedDomain &&
		signals.estimatedFiles <= config.routing.instant.maxFiles &&
		signals.estimatedLines <= config.routing.instant.maxEstimatedLines
	);
}

/** Check if task fits the fast profile */
function fitsFast(signals: TaskSignal, config: ConductorConfig): boolean {
	const disallowedDomain = signals.riskDomains.find((domain) => config.routing.fast.disallowDomains.includes(domain));
	return (
		!signals.isAmbiguous &&
		!disallowedDomain &&
		signals.estimatedFiles <= config.routing.fast.maxFiles &&
		signals.estimatedLines <= config.routing.fast.maxEstimatedLines
	);
}

/** Check if task fits the careful profile */
function fitsCareful(signals: TaskSignal, config: ConductorConfig): boolean {
	return (
		!signals.isAmbiguous &&
		signals.estimatedFiles <= config.routing.careful.maxFiles &&
		signals.estimatedLines <= config.routing.careful.maxEstimatedLines &&
		!signals.riskDomains.includes("security") &&
		!signals.riskDomains.includes("deployment")
	);
}

/** Build a complete decision object with agent/model selections */
function makeDecision({
	route,
	tier,
	config,
	signals,
	forced = false,
	additionalReasons = [],
	additionalRisks = [],
}: {
	route: ConductorRoute;
	tier?: ConductorTier;
	config: ConductorConfig;
	signals: TaskSignal;
	forced?: boolean;
	additionalReasons?: string[];
	additionalRisks?: string[];
}): RouteDecision {
	const base = decisionBase(route, signals, forced);
	return {
		route,
		tier,
		suggestedAgent: tier ? agentForTier(config, tier) : undefined,
		suggestedModel: tier ? modelForTier(config, tier) : undefined,
		requiresApproval: route === "cockpit-only" || route === "need-decision" ? false : true,
		...base,
		reasons: [...additionalReasons, ...base.reasons],
		risks: [...additionalRisks, ...base.risks],
	};
}

/**
 * Route a task to the appropriate execution profile.
 *
 * Policy order (evaluated in sequence):
 * 1. cockpit-only: question-only or non-coding tasks stay in cockpit
 * 2. collect risks: gather all detected risk domains
 * 3. forced tier: user-specified tier takes precedence
 * 4. instant: fits thresholds, not ambiguous, no disallowed domains
 * 5. fast: fits thresholds, not ambiguous, no disallowed domains
 * 6. careful: fits thresholds, excludes security/deployment risks
 * 7. need-decision: ambiguous tasks require clarification
 * 8. default careful: broad/high-risk defaults to careful profile
 */
export function routeTask(task: string, config: ConductorConfig, forcedTier?: ConductorTier): RouteDecision {
	const signals = analyzeTask(task);

	// Stage 1: cockpit-only for question-only or non-coding tasks
	const reasonsCockpit = ["Task looks conversational or planning-only; keep it in cockpit chat."];
	if (!signals.tasksLooksLikeCoding || signals.isQuestionOnly) {
		return makeDecision({
			route: "cockpit-only",
			config,
			signals,
			additionalReasons: reasonsCockpit,
		});
	}

	// Stage 2: Collect risk domains (after cockpit-only check)
	const additionalRisks: string[] = [];
	for (const domain of signals.riskDomains) {
		additionalRisks.push(`Risk domain detected: ${domain}`);
	}
	if (signals.isAmbiguous) additionalRisks.push("Task is ambiguous and may need parent clarification.");

	// Stage 3: Forced tier (user-specified)
	if (forcedTier) {
		const forcedTierReason = [`Execution profile forced by user: ${forcedTier}.`];
		return makeDecision({
			route: forcedTier,
			tier: forcedTier,
			config,
			signals,
			forced: true,
			additionalReasons: forcedTierReason,
			additionalRisks: additionalRisks,
		});
	}

	// Stage 4: Instant profile check
	const instantReason = ["Task is exact, unambiguous, and fits the instant profile thresholds."];
	if (fitsInstant(signals, config)) {
		return makeDecision({
			route: "instant",
			tier: "instant",
			config,
			signals,
			additionalReasons: instantReason,
			additionalRisks: additionalRisks,
		});
	}

	// Stage 5: Fast profile check
	const fastReason = ["Task is narrow, low-risk, and fits the fast profile thresholds."];
	if (fitsFast(signals, config)) {
		return makeDecision({
			route: "fast",
			tier: "fast",
			config,
			signals,
			additionalReasons: fastReason,
			additionalRisks: additionalRisks,
		});
	}

	// Stage 6: Careful profile check
	const carefulReasonBase = ["Task is bounded but too large or risky for a linear profile."];
	if (fitsCareful(signals, config)) {
		const carefulReasons = [...carefulReasonBase];
		if (config.routing.careful.requirePlan) {
			carefulReasons.push("Careful profile recommends a parent-owned plan before launch.");
		}
		return makeDecision({
			route: "careful",
			tier: "careful",
			config,
			signals,
			additionalReasons: carefulReasons,
			additionalRisks: additionalRisks,
		});
	}

	// Stage 7: Need-decision for ambiguous tasks
	const needDecisionReason = ["Task needs clarification before delegation."];
	if (signals.isAmbiguous) {
		return makeDecision({
			route: "need-decision",
			config,
			signals,
			additionalReasons: needDecisionReason,
			additionalRisks: additionalRisks,
		});
	}

	// Stage 8: Default to careful for broad/high-risk tasks
	const defaultCarefulReason = ["Task is broad, high-risk, or likely needs the fully orchestrated careful profile."];
	return makeDecision({
		route: "careful",
		tier: "careful",
		config,
		signals,
		additionalReasons: defaultCarefulReason,
		additionalRisks: additionalRisks,
	});
}

/** Format a route decision for display to the user */
export function formatDecision(decision: RouteDecision): string {
	const lines = [
		`Route/profile: ${decision.route}`,
		decision.suggestedAgent ? `Suggested agent: ${decision.suggestedAgent}` : undefined,
		decision.suggestedModel ? `Preferred model: ${decision.suggestedModel}` : undefined,
		`Route confidence: ${Math.round(decision.confidence * 100)}%`,
		`Requires approval: ${decision.requiresApproval ? "yes" : "no"}`,
		`Estimated scope: ${decision.signals.estimatedFiles} file(s), ~${decision.signals.estimatedLines} line(s)`,
		`Handoff quality: ${decision.handoffQuality.score}/${decision.handoffQuality.maxScore} (${decision.handoffQuality.summary})`,
		decision.handoffQuality.missing.length > 0 ? `Missing handoff inputs:\n${decision.handoffQuality.missing.map((item) => `- ${item}`).join("\n")}` : undefined,
		decision.signals.mentionedFiles.length > 0 ? `Mentioned files: ${decision.signals.mentionedFiles.join(", ")}` : undefined,
		decision.reasons.length > 0 ? `Reasons:\n${decision.reasons.map((reason) => `- ${reason}`).join("\n")}` : undefined,
		decision.risks.length > 0 ? `Risks:\n${decision.risks.map((risk) => `- ${risk}`).join("\n")}` : undefined,
		decision.missingContextQuestions.length > 0 ? `Missing context questions:\n${decision.missingContextQuestions.map((question) => `- ${question}`).join("\n")}` : undefined,
		decision.suggestedRefinement ? `Suggested refinement: ${decision.suggestedRefinement}` : undefined,
	];
	return lines.filter(Boolean).join("\n");
}
