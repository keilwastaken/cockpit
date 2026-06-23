import type { ConductorConfig } from "./types.js";

export type ToolCallLike = {
	toolName?: string;
	input?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function shouldBlockToolCall(event: ToolCallLike, config: ConductorConfig): string | undefined {
	if (!config.strictMode) return undefined;
	const toolName = event.toolName;
	if (toolName === "edit" || toolName === "write") {
		return "Conductor strict mode is on. Code mutation should be routed through Conductor delegation instead of direct edit/write tools.";
	}
	if (toolName === "bash" && isRecord(event.input)) {
		const command = typeof event.input.command === "string" ? event.input.command : "";
		const forbidden = config.safety.forbiddenCommands.find((word) => new RegExp(`(^|\\s|;|&&|\\|)${word}(\\s|$)`, "i").test(command));
		if (forbidden) return `Conductor strict mode blocked forbidden command token: ${forbidden}`;
	}
	return undefined;
}
