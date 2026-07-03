import type { ConductorConfig } from "./config.js";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

const SHELL_SEGMENT_SPLIT = /(?:&&|\|\||[;|\n])/;
const LEADING_SHELL_PREFIX = /^(?:(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*)?(?:sudo\s+)?/i;
const GIT_FORBIDDEN = /^git\b(?:\s+-\S+(?:=\S+)?)*\s+(commit|push|reset|clean)\b/i;
const DEPLOY_OR_PUBLISH = /^(?:npm|pnpm|yarn|bun|vercel|netlify|firebase|serverless|sls|wrangler|terraform|helm|kubectl|aws|gcloud)\b.*\b(?:deploy|publish|apply|destroy|release)\b/i;
const RM_RF = /^rm\b[^\n;&|]*(?:\s-(?:[^\s]*r[^\s]*f|[^\s]*f[^\s]*r))\b/i;
const REDIRECTING_WRITE = /^(?:cat|printf|echo)\b[\s\S]*\s>>?\s*(?:[^|;&\s]+|"[^"]+"|'[^']+')\s*$/i;
const IN_PLACE_SED = /^sed\b[^\n;&|]*(?:\s-i(?:\s|$)|\s--in-place\b)/i;
const IN_PLACE_PERL = /^perl\b[^\n;&|]*\s-i\b/i;
const PYTHON_FILE_MUTATION = /^python(?:3)?\b[\s\S]*(?:write_text|write_bytes|open\s*\([^)]*,\s*['"][wa+]+['"]|Path\s*\([^)]*\)\.(?:write_text|write_bytes|unlink|rename|replace)|os\.(?:remove|rename)|shutil\.rmtree)\b/i;
const NODE_FILE_MUTATION = /^node\b[\s\S]*(?:writeFile(?:Sync)?|appendFile(?:Sync)?|rmSync|unlinkSync|renameSync|copyFileSync|mkdirSync|rmdirSync|truncateSync)\b/i;

function shellSegments(command: string): string[] {
	return command
		.split(SHELL_SEGMENT_SPLIT)
		.map((segment) => segment.replace(LEADING_SHELL_PREFIX, "").trim())
		.filter(Boolean);
}

function blockedShellReason(command: string, config: ConductorConfig): string | undefined {
	const forbidden = new Set(config.forbiddenCommands.map((entry) => entry.toLowerCase()));
	for (const segment of shellSegments(command)) {
		const gitMatch = segment.match(GIT_FORBIDDEN);
		if (gitMatch && forbidden.has(gitMatch[1].toLowerCase())) return `Conductor strict mode blocked forbidden git command: git ${gitMatch[1]}`;
		if ((forbidden.has("deploy") || forbidden.has("publish")) && DEPLOY_OR_PUBLISH.test(segment)) return "Conductor strict mode blocked deploy/publish command pattern.";
		if (RM_RF.test(segment)) return "Conductor strict mode blocked rm -rf usage.";
		if (REDIRECTING_WRITE.test(segment)) return "Conductor strict mode blocked shell redirection that can mutate files.";
		if (IN_PLACE_SED.test(segment)) return "Conductor strict mode blocked in-place sed edits.";
		if (IN_PLACE_PERL.test(segment)) return "Conductor strict mode blocked in-place perl edits.";
		if (PYTHON_FILE_MUTATION.test(segment)) return "Conductor strict mode blocked inline python file mutation.";
		if (NODE_FILE_MUTATION.test(segment)) return "Conductor strict mode blocked inline node file mutation.";
	}
	return undefined;
}

export function shouldBlockToolCall(event: { toolName?: string; input?: unknown }, config: ConductorConfig, _cwd = process.cwd()): string | undefined {
	if (!config.strictMode) return undefined;
	const toolName = event.toolName;
	if (toolName === "edit" || toolName === "write") {
		return "Conductor strict mode is on. Code mutation should be routed through Conductor delegation instead of direct edit/write tools.";
	}
	if (toolName === "bash" && isRecord(event.input)) {
		const command = typeof event.input.command === "string" ? event.input.command : "";
		return blockedShellReason(command, config);
	}
	return undefined;
}
