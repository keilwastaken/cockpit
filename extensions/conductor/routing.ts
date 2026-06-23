import type { ConductorConfig, ConductorTier, RiskDomain, RouteDecision, TaskSignal } from "./types.js";

const FILE_PATTERN = /(?:^|\s)([\w@./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|dart|py|rb|go|rs|java|kt|swift|md|json|yaml|yml|toml|css|scss|html|sh|sql))(?:\s|$|[,:;.])/g;

const DOMAIN_KEYWORDS: Array<[RiskDomain, RegExp]> = [
	["auth", /\b(auth|login|logout|oauth|cognito|session|token|permission|user role)\b/i],
	["security", /\b(secret|credential|encrypt|decrypt|xss|csrf|injection|permission|policy|iam|firewall)\b/i],
	["persistence", /\b(database|firestore|schema|migration|repository|storage|persist|save|delete data)\b/i],
	["deployment", /\b(deploy|publish|release|ci|github action|terraform|infra|lambda|cloud)\b/i],
	["architecture", /\b(architecture|refactor|redesign|rewrite|framework|pattern|boundary|abstraction)\b/i],
];

const CODING_KEYWORDS = /\b(add|implement|fix|change|update|refactor|rename|remove|test|write|edit|create|scaffold|wire|integrate|debug)\b/i;
const QUESTION_ONLY = /^(what|why|how|should|can you explain|tell me|thoughts\??)/i;
const AMBIGUOUS = /\b(maybe|somehow|figure out|whatever|something|make it better|clean up everything|fix it|doesn't work)\b/i;
const PLAN_WORDS = /\b(feature|flow|architecture|multi-file|refactor|redesign|review loop|auto flow|broad|large)\b/i;
const MECHANICAL_EDIT = /\b(rename|typo|copy|text|comment|format|lint|one-line|small edit|mechanical)\b/i;

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

export function routeTask(task: string, config: ConductorConfig, forcedTier?: ConductorTier): RouteDecision {
	const signals = analyzeTask(task);
	const reasons: string[] = [];
	const risks: string[] = [];

	if (signals.isQuestionOnly || !signals.tasksLooksLikeCoding) {
		reasons.push("Task looks conversational or planning-only; keep it in cockpit chat.");
		return { route: "cockpit-only", requiresApproval: false, reasons, risks, signals };
	}

	for (const domain of signals.riskDomains) {
		risks.push(`Risk domain detected: ${domain}`);
	}
	if (signals.isAmbiguous) risks.push("Task is ambiguous and may need parent clarification.");

	const chooseAgent = (tier: ConductorTier) => {
		if (tier === "instant") return config.agents.instant[0];
		if (tier === "rapid") return config.agents.rapid[0];
		return config.agents.verified;
	};
	const chooseModel = (tier: ConductorTier) => {
		if (tier === "instant") return config.models.instant || undefined;
		if (tier === "rapid") return config.models.rapid || undefined;
		return config.models.verified || undefined;
	};

	if (forcedTier) {
		reasons.push(`Execution profile forced by user: ${forcedTier}.`);
		return {
			route: forcedTier,
			tier: forcedTier,
			suggestedAgent: chooseAgent(forcedTier),
			suggestedModel: chooseModel(forcedTier),
			requiresApproval: true,
			reasons,
			risks,
			signals,
		};
	}

	const disallowedInstantDomain = signals.riskDomains.find((domain) => config.routing.instant.disallowDomains.includes(domain));
	const fitsInstant =
		!signals.isAmbiguous &&
		!disallowedInstantDomain &&
		signals.estimatedFiles <= config.routing.instant.maxFiles &&
		signals.estimatedLines <= config.routing.instant.maxEstimatedLines;

	if (fitsInstant) {
		reasons.push("Task is exact, unambiguous, and fits the instant profile thresholds.");
		return {
			route: "instant",
			tier: "instant",
			suggestedAgent: chooseAgent("instant"),
			suggestedModel: chooseModel("instant"),
			requiresApproval: true,
			reasons,
			risks,
			signals,
		};
	}

	const disallowedRapidDomain = signals.riskDomains.find((domain) => config.routing.rapid.disallowDomains.includes(domain));
	const fitsRapid =
		!signals.isAmbiguous &&
		!disallowedRapidDomain &&
		signals.estimatedFiles <= config.routing.rapid.maxFiles &&
		signals.estimatedLines <= config.routing.rapid.maxEstimatedLines;

	if (fitsRapid) {
		reasons.push("Task is narrow, low-risk, and fits the rapid profile thresholds.");
		return {
			route: "rapid",
			tier: "rapid",
			suggestedAgent: chooseAgent("rapid"),
			suggestedModel: chooseModel("rapid"),
			requiresApproval: true,
			reasons,
			risks,
			signals,
		};
	}

	const fitsVerified =
		!signals.isAmbiguous &&
		signals.estimatedFiles <= config.routing.verified.maxFiles &&
		signals.estimatedLines <= config.routing.verified.maxEstimatedLines &&
		!signals.riskDomains.includes("security") &&
		!signals.riskDomains.includes("deployment");

	if (fitsVerified) {
		reasons.push("Task is bounded but too large or risky for a linear profile.");
		if (config.routing.verified.requirePlan) reasons.push("Verified profile recommends a parent-owned plan before launch.");
		return {
			route: "verified",
			tier: "verified",
			suggestedAgent: chooseAgent("verified"),
			suggestedModel: chooseModel("verified"),
			requiresApproval: true,
			reasons,
			risks,
			signals,
		};
	}

	if (signals.isAmbiguous) {
		reasons.push("Task needs clarification before delegation.");
		return { route: "need-decision", requiresApproval: false, reasons, risks, signals };
	}

	reasons.push("Task is broad, high-risk, or likely needs the fully orchestrated verified profile.");
	return {
		route: "verified",
		tier: "verified",
		suggestedAgent: chooseAgent("verified"),
		suggestedModel: chooseModel("verified"),
		requiresApproval: true,
		reasons,
		risks,
		signals,
	};
}

export function formatDecision(decision: RouteDecision): string {
	const lines = [
		`Route/profile: ${decision.route}`,
		decision.suggestedAgent ? `Suggested agent: ${decision.suggestedAgent}` : undefined,
		decision.suggestedModel ? `Preferred model: ${decision.suggestedModel}` : undefined,
		`Requires approval: ${decision.requiresApproval ? "yes" : "no"}`,
		`Estimated scope: ${decision.signals.estimatedFiles} file(s), ~${decision.signals.estimatedLines} line(s)`,
		decision.signals.mentionedFiles.length > 0 ? `Mentioned files: ${decision.signals.mentionedFiles.join(", ")}` : undefined,
		decision.reasons.length > 0 ? `Reasons:\n${decision.reasons.map((reason) => `- ${reason}`).join("\n")}` : undefined,
		decision.risks.length > 0 ? `Risks:\n${decision.risks.map((risk) => `- ${risk}`).join("\n")}` : undefined,
	];
	return lines.filter(Boolean).join("\n");
}
