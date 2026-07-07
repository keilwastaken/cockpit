import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import type { CockpitConfig } from "../config.js";
import type { DelegateFlow, DelegateRunContext, DelegateRunInput, DelegateRunResult } from "./protocol.js";

const uniqueStrings = (values: readonly string[] | undefined): string[] =>
	Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).map((file) =>
		file === "README" ? "README.md" : file,
	);

type InstantEdit = {
	kind: "replace" | "append" | "insert-after" | "insert-before" | "delete-lines";
	oldText?: string;
	newText?: string;
	anchor?: string;
	startLine?: number;
	endLine?: number;
};

function baseResult(input: DelegateRunInput, config: CockpitConfig, allowedFiles: string[]): DelegateRunResult {
	return {
		flow: "instant",
		plan: input.plan.trim(),
		allowedFiles,
		line: input.line,
		tools: config.delegateFlows.instant.tools,
		exitCode: 0,
		finalOutput: "",
		stderr: "",
		turnCount: 0,
		elapsedMs: 0,
	};
}

function validateInstant(input: DelegateRunInput, config: CockpitConfig, allowedFiles: string[]): string | undefined {
	const plan = input.plan.trim();
	const flow = config.delegateFlows.instant;
	if (!plan) return "Instant delegate needs a cockpit plan.";
	if (allowedFiles.length === 0) return "Instant delegate needs exactly one file. Pass file or mention the file in the plan.";
	if (allowedFiles.length > flow.maxFiles) return `Instant delegate can edit at most ${flow.maxFiles} file(s); got ${allowedFiles.length}.`;
	return undefined;
}

const quotedValues = (text: string): string[] => {
	const values: string[] = [];
	const re = /`([^`]+)`|"([^"]+)"|'([^']+)'/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text))) values.push(match[1] ?? match[2] ?? match[3] ?? "");
	return values.filter(Boolean);
};

function parseInstantEdit(plan: string, inputLine?: number): InstantEdit | undefined {
	const quotes = quotedValues(plan);

	const deleteMatch = plan.match(/\bdelete\s+lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?/i);
	if (deleteMatch) {
		const startLine = Number(deleteMatch[1]);
		const endLine = Number(deleteMatch[2] ?? deleteMatch[1]);
		if (Number.isInteger(startLine) && Number.isInteger(endLine) && startLine > 0 && endLine >= startLine) {
			return { kind: "delete-lines", startLine, endLine };
		}
	}

	if (/\b(replace|change|rename|switch)\b/i.test(plan) && quotes.length >= 2) {
		return { kind: "replace", oldText: quotes[0], newText: quotes[1] };
	}

	if (/\bappend\b|\badd to end\b/i.test(plan) && quotes.length >= 1) {
		return { kind: "append", newText: quotes[quotes.length - 1] };
	}

	if (/\binsert\b|\badd\b/i.test(plan) && /\bafter\b/i.test(plan) && quotes.length >= 2) {
		return { kind: "insert-after", newText: quotes[0], anchor: quotes[1] };
	}

	if (/\binsert\b|\badd\b/i.test(plan) && /\bbefore\b/i.test(plan) && quotes.length >= 2) {
		return { kind: "insert-before", newText: quotes[0], anchor: quotes[1] };
	}

	if (inputLine && /\b(replace|change)\s+(?:this\s+)?line\b/i.test(plan) && quotes.length >= 1) {
		return { kind: "delete-lines", startLine: inputLine, endLine: inputLine, newText: quotes[0] };
	}

	return undefined;
}

function applyInstantEdit(original: string, edit: InstantEdit): { updated: string; changedLines: number } | string {
	if (edit.kind === "replace") {
		const oldText = edit.oldText ?? "";
		const newText = edit.newText ?? "";
		if (!oldText) return "Replace operation needs old text.";
		const count = original.split(oldText).length - 1;
		if (count === 0) return "Exact text to replace was not found.";
		if (count > 1) return `Exact text to replace matched ${count} times; instant requires one unique match.`;
		return { updated: original.replace(oldText, newText), changedLines: Math.max(1, oldText.split("\n").length, newText.split("\n").length) };
	}

	if (edit.kind === "append") {
		const newText = edit.newText ?? "";
		if (!newText) return "Append operation needs text.";
		const prefix = original.endsWith("\n") || original.length === 0 ? "" : "\n";
		const suffix = newText.endsWith("\n") ? "" : "\n";
		return { updated: `${original}${prefix}${newText}${suffix}`, changedLines: Math.max(1, newText.split("\n").length) };
	}

	if (edit.kind === "insert-after" || edit.kind === "insert-before") {
		const anchor = edit.anchor ?? "";
		const newText = edit.newText ?? "";
		if (!anchor || !newText) return "Insert operation needs inserted text and anchor text.";
		const count = original.split(anchor).length - 1;
		if (count === 0) return "Anchor text was not found.";
		if (count > 1) return `Anchor text matched ${count} times; instant requires one unique match.`;
		const insert = newText.endsWith("\n") ? newText : `${newText}\n`;
		const updated = edit.kind === "insert-after"
			? original.replace(anchor, `${anchor}\n${insert}`)
			: original.replace(anchor, `${insert}${anchor}`);
		return { updated, changedLines: Math.max(1, newText.split("\n").length) };
	}

	if (edit.kind === "delete-lines") {
		const start = edit.startLine ?? 0;
		const end = edit.endLine ?? start;
		const hasTrailingNewline = original.endsWith("\n");
		const lines = original.split("\n");
		if (hasTrailingNewline) lines.pop();
		if (start < 1 || end < start || end > lines.length) return `Line range ${start}-${end} is outside file bounds 1-${lines.length}.`;
		const replacement = edit.newText === undefined ? [] : edit.newText.split("\n");
		lines.splice(start - 1, end - start + 1, ...replacement);
		return { updated: `${lines.join("\n")}${hasTrailingNewline ? "\n" : ""}`, changedLines: Math.max(1, end - start + 1, replacement.length) };
	}

	return "Unsupported instant edit.";
}

function safePath(cwd: string, file: string): string | undefined {
	const absolute = resolve(cwd, file);
	const rel = relative(cwd, absolute);
	if (rel.startsWith("..") || rel === "") return undefined;
	return absolute;
}

export const instantDelegate: DelegateFlow<CockpitConfig> = {
	name: "instant",
	async run(input: DelegateRunInput, config: CockpitConfig, context: DelegateRunContext): Promise<DelegateRunResult> {
		const startedAt = Date.now();
		const flow = config.delegateFlows.instant;
		const allowedFiles = uniqueStrings(input.file ? [input.file] : []);
		const result = baseResult(input, config, allowedFiles);
		const blockedReason = validateInstant(input, config, allowedFiles);
		if (blockedReason) return { ...result, exitCode: 1, blockedReason, escalateTo: "fast", elapsedMs: Date.now() - startedAt };

		context.onUpdate?.({ content: [{ type: "text", text: "Instant direct edit running..." }], details: result });

		const edit = parseInstantEdit(input.plan, input.line);
		if (!edit) {
			return {
				...result,
				exitCode: 1,
				blockedReason: "Instant only handles deterministic quoted replace/append/insert/delete-lines operations. Escalate to fast for semantic edits.",
				escalateTo: "fast",
				elapsedMs: Date.now() - startedAt,
			};
		}

		const file = allowedFiles[0];
		const path = safePath(context.cwd, file);
		if (!path) return { ...result, exitCode: 1, blockedReason: `Unsafe file path for instant edit: ${file}`, escalateTo: "fast", elapsedMs: Date.now() - startedAt };

		let original = "";
		try {
			original = await readFile(path, "utf8");
		} catch (error) {
			return { ...result, exitCode: 1, blockedReason: `Could not read ${file}: ${(error as Error).message}`, escalateTo: "fast", elapsedMs: Date.now() - startedAt };
		}

		const applied = applyInstantEdit(original, edit);
		if (typeof applied === "string") {
			return { ...result, exitCode: 1, blockedReason: applied, escalateTo: "fast", elapsedMs: Date.now() - startedAt };
		}
		if (applied.updated === original) {
			return { ...result, exitCode: 0, finalOutput: `# Instant Result\n- No changes needed.\n- File: ${file}`, elapsedMs: Date.now() - startedAt };
		}
		if (applied.changedLines > flow.maxEstimatedLines) {
			return { ...result, exitCode: 1, blockedReason: `Instant edit would change ~${applied.changedLines} lines; limit is ${flow.maxEstimatedLines}.`, escalateTo: "fast", elapsedMs: Date.now() - startedAt };
		}

		await writeFile(path, applied.updated, "utf8");
		return {
			...result,
			exitCode: 0,
			finalOutput: [
				"# Instant Result",
				"- Summary: applied deterministic direct edit without spawning an agent.",
				`- Files Changed: ${file}`,
				`- Operation: ${edit.kind}`,
				`- Estimated changed lines: ${applied.changedLines}`,
				"- Validation: not run for instant direct edit.",
			].join("\n"),
			elapsedMs: Date.now() - startedAt,
		};
	},
};
