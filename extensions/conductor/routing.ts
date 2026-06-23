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
		if (tier === "micro") return config.agents.micro[0];
		if (tier === "small") return config.agents.small[0];
		if (tier === "medium") return config.agents.medium;
		return config.agents.fullAuto;
	};
	const chooseModel = (tier: ConductorTier) => {
		if (tier === "micro") return config.models.micro || undefined;
		if (tier === "small") return config.models.small || undefined;
		if (tier === "medium") return config.models.medium || undefined;
		return undefined;
	};

	if (forcedTier) {
		reasons.push(`Tier forced by user: ${forcedTier}.`);
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

	const disallowedMicroDomain = signals.riskDomains.find((domain) => config.routing.micro.disallowDomains.includes(domain));
	const fitsMicro =
		!signals.isAmbiguous &&
		!disallowedMicroDomain &&
		signals.estimatedFiles <= config.routing.micro.maxFiles &&
		signals.estimatedLines <= config.routing.micro.maxEstimatedLines;

	if (fitsMicro) {
		reasons.push("Task is very small, unambiguous, and fits the micro-executor thresholds.");
		return {
			route: "micro",
			tier: "micro",
			suggestedAgent: chooseAgent("micro"),
			suggestedModel: chooseModel("micro"),
			requiresApproval: true,
			reasons,
			risks,
			signals,
		};
	}

	const disallowedSmallDomain = signals.riskDomains.find((domain) => config.routing.small.disallowDomains.includes(domain));
	const fitsSmall =
		!signals.isAmbiguous &&
		!disallowedSmallDomain &&
		signals.estimatedFiles <= config.routing.small.maxFiles &&
		signals.estimatedLines <= config.routing.small.maxEstimatedLines;

	if (fitsSmall) {
		reasons.push("Task is narrow, low-risk, and fits the small-executor thresholds.");
		return {
			route: "small",
			tier: "small",
			suggestedAgent: chooseAgent("small"),
			suggestedModel: chooseModel("small"),
			requiresApproval: true,
			reasons,
			risks,
			signals,
		};
	}

	const fitsMedium =
		!signals.isAmbiguous &&
		signals.estimatedFiles <= config.routing.medium.maxFiles &&
		signals.estimatedLines <= config.routing.medium.maxEstimatedLines &&
		!signals.riskDomains.includes("security") &&
		!signals.riskDomains.includes("deployment");

	if (fitsMedium) {
		reasons.push("Task is bounded but too large or risky for a small executor.");
		if (config.routing.medium.requirePlan) reasons.push("Medium route requires a parent-owned plan before launch.");
		return {
			route: "medium",
			tier: "medium",
			suggestedAgent: chooseAgent("medium"),
			suggestedModel: chooseModel("medium"),
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

	reasons.push("Task is broad, high-risk, or likely needs plan/implement/review orchestration.");
	return {
		route: "full-auto",
		tier: "full-auto",
		suggestedAgent: chooseAgent("full-auto"),
		suggestedModel: chooseModel("full-auto"),
		requiresApproval: true,
		reasons,
		risks,
		signals,
	};
}

export function formatDecision(decision: RouteDecision): string {
	const lines = [
		`Route: ${decision.route}`,
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
