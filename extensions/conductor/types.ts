export type ConductorTier = "instant" | "rapid" | "verified" | "deep";

export type ExecutionTopology = "linear" | "orchestrated";
export type ExecutionGuard = "none" | "optional" | "recommended" | "required";

export type ExecutionProfile = {
	topology: ExecutionTopology;
	scout: ExecutionGuard;
	verification: Exclude<ExecutionGuard, "none">;
	review: boolean;
	maxWorkerVisits: number;
};

export type ConductorRoute = ConductorTier | "cockpit-only" | "need-decision";

export type ConductorMode = "route" | "handoff" | "delegate";

export type RiskDomain = "auth" | "security" | "persistence" | "deployment" | "architecture" | "unknown";

export type ConductorConfig = {
	strictMode: boolean;
	defaultDryRun: boolean;
	agents: {
		instant: string[];
		rapid: string[];
		verified: string;
		reviewer: string;
		deep: string;
	};
	models: {
		instant: string;
		rapid: string;
		verified: string;
		deep: string;
	};
	profiles: Record<ConductorTier, ExecutionProfile>;
	routing: {
		instant: {
			maxFiles: number;
			maxEstimatedLines: number;
			disallowDomains: RiskDomain[];
		};
		rapid: {
			maxFiles: number;
			maxEstimatedLines: number;
			disallowDomains: RiskDomain[];
		};
		verified: {
			maxFiles: number;
			maxEstimatedLines: number;
			requirePlan: boolean;
		};
		deep: {
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
