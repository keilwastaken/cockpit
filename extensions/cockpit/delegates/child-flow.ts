import type {
	DelegateFlowName,
	DelegateRunContext,
	DelegateRunResult,
} from "./protocol.js";
import { runChildPi } from "./child-pi.js";

// ---------------------------------------------------------------------------
// Shared child-process argument builder for single-child delegates.
// ---------------------------------------------------------------------------

export type ChildDelegateArgsOptions = {
	model?: string;
	thinking: string;
	tools: string[];
	prompt: string;
	fileArgs?: string[];
	extensionMode: "allow" | "disable";
};

/**
 * Build a standard argv array for a single-child Pi delegate.
 *
 * Arg order (must be preserved):
 *   --mode json
 *   -p
 *   --no-session
 *   --model <model>            (if model is provided)
 *   --thinking <thinking>
 *   --no-extensions            (only when extensionMode === "disable")
 *   --no-skills
 *   --no-prompt-templates
 *   --no-context-files
 *   --approve | --no-approve   (based on projectTrusted)
 *   --tools <comma-list>
 *   <prompt>
 *   <file args>              (if any)
 */
export function buildChildDelegateArgs(options: ChildDelegateArgsOptions, projectTrusted: boolean): string[] {
	const { model, thinking, tools, prompt, fileArgs, extensionMode } = options;

	const args: string[] = [
		"--mode",
		"json",
		"-p",
		"--no-session",
	];

	if (model) {
		args.push("--model", model);
	}

	args.push(
		"--thinking",
		thinking,
	);

	if (extensionMode === "disable") {
		args.push("--no-extensions");
	}

	args.push(
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		projectTrusted ? "--approve" : "--no-approve",
		"--tools",
		tools.join(","),
		prompt,
	);

	if (fileArgs?.length) {
		args.push(...fileArgs);
	}

	return args;
}

type ChildFlowConfig = {
	maxTurns: number;
	timeoutMs: number;
};

type ChildDelegateEscalation = {
	onTimeout?: DelegateFlowName;
	onMaxTurns?: DelegateFlowName;
};

export async function runChildDelegate(options: {
	label: string;
	args: string[];
	flow: ChildFlowConfig;
	result: DelegateRunResult;
	context: DelegateRunContext;
	escalation?: ChildDelegateEscalation;
}): Promise<DelegateRunResult> {
	const { label, args, flow, result, context, escalation } = options;

	context.onUpdate?.({ content: [{ type: "text", text: `${label} running...` }], details: result });

	const child = await runChildPi({
		cwd: context.cwd,
		args,
		timeoutMs: flow.timeoutMs,
		maxTurns: flow.maxTurns,
		signal: context.signal,
		onUpdate: ({ finalOutput, stderr, progressText, turnCount, elapsedMs }) => {
			context.onUpdate?.({
				content: [{ type: "text", text: finalOutput || progressText || `${label} running...` }],
				details: { ...result, finalOutput, stderr, turnCount, elapsedMs },
			});
		},
	});

	const finalResult: DelegateRunResult = {
		...result,
		exitCode: child.exitCode,
		finalOutput: child.finalOutput,
		stderr: child.stderr,
		timedOut: child.timedOut,
		aborted: child.aborted,
		maxTurnsExceeded: child.maxTurnsExceeded,
		turnCount: child.turnCount,
		elapsedMs: child.elapsedMs,
	};

	if (child.timedOut) {
		return {
			...finalResult,
			exitCode: 1,
			blockedReason: `${label} timed out after ${flow.timeoutMs}ms.`,
			escalateTo: escalation?.onTimeout,
		};
	}
	if (child.maxTurnsExceeded) {
		return {
			...finalResult,
			exitCode: 1,
			blockedReason: `${label} exceeded max turns (${child.turnCount}/${flow.maxTurns}).`,
			escalateTo: escalation?.onMaxTurns,
		};
	}
	if (child.aborted) return { ...finalResult, exitCode: 1, blockedReason: `${label} was aborted.` };
	return finalResult;
}
