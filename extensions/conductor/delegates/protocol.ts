export type DelegateFlowName = "instant";

export type DelegateRunInput = {
	plan: string;
	file: string;
	line?: number;
};

export type DelegateRunResult = {
	flow: DelegateFlowName;
	plan: string;
	allowedFiles: string[];
	line?: number;
	tools: string[];
	exitCode: number;
	finalOutput: string;
	stderr: string;
	blockedReason?: string;
};

export type DelegateUpdate = (partial: { content: Array<{ type: "text"; text: string }>; details: DelegateRunResult }) => void;

export type DelegateRunContext = {
	cwd: string;
	projectTrusted: boolean;
	signal?: AbortSignal;
	onUpdate?: DelegateUpdate;
};

export type DelegateFlow<Config> = {
	name: DelegateFlowName;
	run(input: DelegateRunInput, config: Config, context: DelegateRunContext): Promise<DelegateRunResult>;
};
