export type ConductorTier = "micro" | "small" | "medium" | "full-auto";

export type ConductorRoute = ConductorTier | "cockpit-only" | "need-decision";

export type ConductorMode = "route" | "handoff" | "delegate";

export type RiskDomain = "auth" | "security" | "persistence" | "deployment" | "architecture" | "unknown";

export type ConductorConfig = {
	strictMode: boolean;
	defaultDryRun: boolean;
	agents: {
		micro: string[];
		small: string[];
		medium: string;
		reviewer: string;
		fullAuto: string;
	};
	models: {
		micro: string;
		small: string;
		medium: string;
		fullAuto: string;
	};
	routing: {
		micro: {
			maxFiles: number;
			maxEstimatedLines: number;
			disallowDomains: RiskDomain[];
		};
		small: {
			maxFiles: number;
			maxEstimatedLines: number;
			disallowDomains: RiskDomain[];
		};
		medium: {
			maxFiles: number;
			maxEstimatedLines: number;
			requirePlan: boolean;
		};
		fullAuto: {
			requireExplicitApproval: boolean;
			maxReviewRounds: number;
		};
	};
	safety: {
		oneWriterAtATime: boolean;
		requireCleanOrAcknowledgedWorktree: boolean;
		forbiddenCommands: string[];
	};
};

export type TaskSignal = {
	text: string;
	mentionedFiles: string[];
	riskDomains: RiskDomain[];
	isQuestionOnly: boolean;
	tasksLooksLikeCoding: boolean;
	estimatedFiles: number;
	estimatedLines: number;
	requiresPlan: boolean;
	isAmbiguous: boolean;
	mechanicalEdit: boolean;
};

export type RouteDecision = {
	route: ConductorRoute;
	suggestedAgent?: string;
	suggestedModel?: string;
	tier?: ConductorTier;
	requiresApproval: boolean;
	reasons: string[];
	risks: string[];
	signals: TaskSignal;
};

export type DelegationHandoff = {
	decision: RouteDecision;
	prompt: string;
};
