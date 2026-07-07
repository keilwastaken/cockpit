import type { CockpitConfig } from "./config.js";

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

function blockedShellReason(command: string, config: CockpitConfig): string | undefined {
	const forbidden = new Set(config.forbiddenCommands.map((entry) => entry.toLowerCase()));
	for (const segment of shellSegments(command)) {
		const gitMatch = segment.match(GIT_FORBIDDEN);
		if (gitMatch && forbidden.has(gitMatch[1].toLowerCase())) return `Cockpit flight safety blocked forbidden git command: git ${gitMatch[1]}`;
		if ((forbidden.has("deploy") || forbidden.has("publish")) && DEPLOY_OR_PUBLISH.test(segment)) return "Cockpit flight safety blocked deploy/publish command pattern.";
		if (RM_RF.test(segment)) return "Cockpit flight safety blocked rm -rf usage.";
		if (REDIRECTING_WRITE.test(segment)) return "Cockpit flight safety blocked shell redirection that can mutate files. Use direct edit/write tools instead.";
		if (IN_PLACE_SED.test(segment)) return "Cockpit flight safety blocked in-place sed edits. Use direct edit/write tools instead.";
		if (IN_PLACE_PERL.test(segment)) return "Cockpit flight safety blocked in-place perl edits. Use direct edit/write tools instead.";
		if (PYTHON_FILE_MUTATION.test(segment)) return "Cockpit flight safety blocked inline python file mutation. Use direct edit/write tools instead.";
		if (NODE_FILE_MUTATION.test(segment)) return "Cockpit flight safety blocked inline node file mutation. Use direct edit/write tools instead.";
	}
	return undefined;
}

export function checkToolCallSafety(event: { toolName?: string; input?: unknown }, config: CockpitConfig, _cwd = process.cwd()): { block: boolean; message?: string } {
	const toolName = event.toolName;
	if (toolName === "edit" || toolName === "write") return { block: false };
	if (toolName === "bash" && isRecord(event.input)) {
		const command = typeof event.input.command === "string" ? event.input.command : "";
		const reason = blockedShellReason(command, config);
		if (reason) return { block: true, message: reason };
	}
	return { block: false };
}
