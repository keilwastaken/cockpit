export type ConductorTier = "instant" | "fast" | "careful";

export type ExecutionTopology = "linear" | "orchestrated";
export type ExecutionGuard = "none" | "optional" | "recommended" | "required";

export type ExecutionIsolation = "same-tree" | "worktree-recommended" | "worktree-required";

export type ExecutionProfile = {
	topology: ExecutionTopology;
	scout: ExecutionGuard;
	verification: Exclude<ExecutionGuard, "none">;
	review: boolean;
	maxWorkerVisits: number;
	isolation: ExecutionIsolation;
};

export type ConductorRoute = ConductorTier | "cockpit-only" | "need-decision";

export type ConductorRunState =
	| "drafted"
	| "approved"
	| "running"
	| "blocked"
	| "needs decision"
	| "reviewing"
	| "repairing"
	| "validating"
	| "done"
	| "failed";

export type RiskDomain = "auth" | "security" | "persistence" | "deployment" | "architecture" | "unknown";

export type ConductorConfig = {
	strictMode: boolean;
	agents: {
		instant: string[];
		fast: string[];
		careful: string;
	};
	models: {
		instant: string;
		fast: string;
		careful: string;
	};
	profiles: Record<ConductorTier, ExecutionProfile>;
	routing: {
		instant: {
			maxFiles: number;
			maxEstimatedLines: number;
			disallowDomains: RiskDomain[];
		};
		fast: {
			maxFiles: number;
			maxEstimatedLines: number;
			disallowDomains: RiskDomain[];
		};
		careful: {
			maxFiles: number;
			maxEstimatedLines: number;
			requirePlan: boolean;
		};

	};
	safety: {
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

export type HandoffQualityCheck = {
	id: "outcome" | "scope" | "constraints" | "validation" | "escalation" | "evidence";
	label: string;
	passed: boolean;
};

export type HandoffQuality = {
	score: number;
	maxScore: number;
	checks: HandoffQualityCheck[];
	missing: string[];
	summary: string;
};

export type RouteDecision = {
	route: ConductorRoute;
	suggestedAgent?: string;
	suggestedModel?: string;
	tier?: ConductorTier;
	requiresApproval: boolean;
	confidence: number;
	handoffQuality: HandoffQuality;
	missingContextQuestions: string[];
	suggestedRefinement?: string;
	reasons: string[];
	risks: string[];
	signals: TaskSignal;
};

export type DelegationHandoff = {
	decision: RouteDecision;
	prompt: string;
};

export type ConductorRunStatus = {
	id: string;
	state: ConductorRunState;
	createdAt: string;
	updatedAt: string;
	approvedAt?: string;
	task: string;
	route: ConductorRoute;
	tier?: ConductorTier;
	suggestedAgent?: string;
	suggestedModel?: string;
	handoffPath: string;
	statusPath: string;
	notesPath: string;
	evidencePath: string;
	reviewPath: string;
	decisionsPath?: string;
};
