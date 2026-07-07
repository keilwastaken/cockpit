import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRegistry,
	SessionManager,
	SettingsManager,
	type AgentSession,
} from "@earendil-works/pi-coding-agent";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
import type { ChildPiResult, ChildPiUpdate } from "./child-pi.js";

const SYSTEM_PROMPT = [
	"You are a focused Cockpit delegate running inside a warm in-process Pi SDK session.",
	"Follow the user's delegate prompt exactly.",
	"Return only the requested concise markdown result.",
].join("\n");

const textContent = (content: unknown): string => {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) return "";
			const record = item as Record<string, unknown>;
			return record.type === "text" && typeof record.text === "string" ? record.text : "";
		})
		.filter(Boolean)
		.join("\n");
};

type WarmKey = string;

type WarmSession = {
	session: AgentSession;
	key: WarmKey;
	busy: boolean;
	cached: boolean;
};

const warmSessions = new Map<WarmKey, WarmSession>();
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

function modelFromId(modelId: string) {
	const [provider, ...rest] = modelId.split("/");
	const id = rest.join("/");
	return provider && id ? modelRegistry.find(provider, id) : undefined;
}

function thinkingLevel(value: string): ThinkingLevel {
	if (value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") return value;
	return "medium";
}

function keyFor(options: { cwd: string; model?: string; thinking: string; tools: string[] }): WarmKey {
	return JSON.stringify({ cwd: options.cwd, model: options.model ?? "", thinking: options.thinking, tools: [...options.tools].sort() });
}

async function createWarmSession(options: { cwd: string; model?: string; thinking: string; tools: string[] }, cached: boolean): Promise<WarmSession> {
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.inMemory({
		compaction: { enabled: false },
		retry: { enabled: true, maxRetries: 1 },
	});
	const resourceLoader = new DefaultResourceLoader({
		cwd: options.cwd,
		agentDir,
		settingsManager,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noContextFiles: true,
		systemPrompt: SYSTEM_PROMPT,
		appendSystemPrompt: [],
	});
	await resourceLoader.reload();

	const model = options.model ? modelFromId(options.model) : undefined;
	const { session } = await createAgentSession({
		cwd: options.cwd,
		agentDir,
		model,
		authStorage,
		modelRegistry,
		resourceLoader,
		tools: options.tools,
		thinkingLevel: thinkingLevel(options.thinking),
		sessionManager: SessionManager.inMemory(options.cwd),
		settingsManager,
	});
	return { key: keyFor(options), session, busy: false, cached };
}

async function getWarmSession(options: { cwd: string; model?: string; thinking: string; tools: string[] }): Promise<WarmSession> {
	const key = keyFor(options);
	const existing = warmSessions.get(key);
	if (existing && !existing.busy) return existing;
	if (existing?.busy) return createWarmSession(options, false);
	const created = await createWarmSession(options, true);
	warmSessions.set(key, created);
	return created;
}

export async function runWarmPi(options: {
	cwd: string;
	model?: string;
	thinking: string;
	tools: string[];
	prompt: string;
	timeoutMs: number;
	maxTurns?: number;
	signal?: AbortSignal;
	onUpdate?: ChildPiUpdate;
}): Promise<ChildPiResult> {
	let finalOutput = "";
	let stderr = "";
	let progressText = "";
	let aborted = false;
	let timedOut = false;
	let maxTurnsExceeded = false;
	let turnCount = 0;
	const startedAt = Date.now();
	let warm: WarmSession | undefined;
	let unsubscribe: (() => void) | undefined;
	let timeout: NodeJS.Timeout | undefined;
	let abortListener: (() => void) | undefined;

	const emit = () => options.onUpdate?.({ finalOutput: finalOutput || progressText, stderr, progressText, turnCount, elapsedMs: Date.now() - startedAt });

	try {
		warm = await getWarmSession(options);
		warm.busy = true;
		// Keep the warm runtime, tool registry, auth, and provider clients, but preserve delegate amnesia per task.
		warm.session.agent.state.messages = [];

		unsubscribe = warm.session.subscribe((event) => {
			const record = event as unknown as Record<string, unknown>;
			if (record.type === "turn_start") {
				turnCount += 1;
				progressText = options.maxTurns ? `Warm delegate turn ${turnCount}/${options.maxTurns}` : `Warm delegate turn ${turnCount}`;
				emit();
				if (options.maxTurns && turnCount > options.maxTurns) {
					maxTurnsExceeded = true;
					stderr = [stderr, `Max turns exceeded: ${turnCount}/${options.maxTurns}`].filter(Boolean).join("\n");
					void warm?.session.abort();
				}
				return;
			}
			if (record.type === "tool_execution_start") {
				const toolName = typeof record.toolName === "string" ? record.toolName : "tool";
				progressText = `Warm delegate tool: ${toolName}`;
				emit();
				return;
			}
			if (record.type === "message_update") {
				const assistantMessageEvent = record.assistantMessageEvent as Record<string, unknown> | undefined;
				if (assistantMessageEvent?.type === "text_delta" && typeof assistantMessageEvent.delta === "string") {
					finalOutput += assistantMessageEvent.delta;
					emit();
				}
				return;
			}
			if (record.type === "message_end") {
				const text = textContent((record.message as Record<string, unknown> | undefined)?.content).trim();
				if (text) {
					finalOutput = text;
					emit();
				}
			}
		});

		if (options.signal) {
			abortListener = () => {
				aborted = true;
				void warm?.session.abort();
			};
			if (options.signal.aborted) abortListener();
			else options.signal.addEventListener("abort", abortListener, { once: true });
		}

		timeout = setTimeout(() => {
			timedOut = true;
			void warm?.session.abort();
		}, options.timeoutMs);

		progressText = "Warm delegate starting...";
		emit();
		await warm.session.prompt(options.prompt, { expandPromptTemplates: false, source: "extension" });
	} catch (error) {
		if (!aborted && !timedOut && !maxTurnsExceeded) stderr = [stderr, error instanceof Error ? error.message : String(error)].filter(Boolean).join("\n");
	} finally {
		if (timeout) clearTimeout(timeout);
		if (unsubscribe) unsubscribe();
		if (options.signal && abortListener) options.signal.removeEventListener("abort", abortListener);
		if (warm) {
			warm.busy = false;
			if (!warm.cached) warm.session.dispose();
		}
	}

	const failed = Boolean(stderr) || aborted || timedOut || maxTurnsExceeded;
	return { exitCode: failed ? 1 : 0, finalOutput: finalOutput.trim(), stderr, timedOut, aborted, maxTurnsExceeded, turnCount, elapsedMs: Date.now() - startedAt };
}

export function disposeWarmDelegates(): void {
	for (const warm of warmSessions.values()) warm.session.dispose();
	warmSessions.clear();
}
