import type { CockpitConfig } from "./config.js";
import { routeTask } from "./routing.js";

export type WorkSlice = {
	title: string;
	prompt: string;
};

const ACTION_RE = /\b(add|implement|fix|update|wire|repair|strengthen|switch|create|remove|rewrite|migrate|refactor|test|validate)\b/gi;
const ACTION_TEST_RE = /\b(add|implement|fix|update|wire|repair|strengthen|switch|create|remove|rewrite|migrate|refactor|test|validate)\b/i;
const CONNECTOR_RE = /\b(?:and then|then|also|plus|as well as)\b/gi;

const clean = (value: string): string => value.replace(/^[-*\d.)\s]+/, "").trim();
const sentence = (value: string): string => value.endsWith(".") ? value : `${value}.`;

export function isBroadWork(task: string, config: CockpitConfig): boolean {
	const text = task.trim();
	if (!text) return false;
	const delegatedPlan = /Approved Implementation Plan|Approved plan:|Fix attempt|Reviewer Feedback|Coder Instructions/i.test(text);
	if (delegatedPlan) return false;

	const decision = routeTask(text, config);
	const nonEmptyLines = text.split("\n").map((line) => line.trim()).filter(Boolean);
	const actionCount = Array.from(text.matchAll(ACTION_RE)).length;
	const connectorCount = Array.from(text.matchAll(CONNECTOR_RE)).length;
	const commaList = (text.match(/,/g) ?? []).length >= 3;
	const manyFiles = decision.signals.mentionedFiles.length > config.delegateFlows.normal.maxFiles;
	const noFilesManyActions = decision.signals.mentionedFiles.length === 0 && actionCount >= 4;

	return manyFiles || noFilesManyActions || connectorCount >= 2 || commaList || nonEmptyLines.length >= 5;
}

export function sliceWork(task: string): WorkSlice[] {
	const text = task.trim();
	const bulletLines = text
		.split("\n")
		.map(clean)
		.filter((line) => line.length > 0 && ACTION_TEST_RE.test(line));

	const rawParts = bulletLines.length >= 2
		? bulletLines
		: text
			.split(/(?:\n+|;|\band then\b|\bthen\b|\balso\b|\bplus\b)/i)
			.map(clean)
			.filter((part) => part.length > 0);

	const parts = rawParts.length >= 2 ? rawParts : [text];
	return parts.slice(0, 6).map((part, index) => ({
		title: `Slice ${index + 1}: ${part.slice(0, 80)}`,
		prompt: [
			`Slice ${index + 1} of ${parts.length}.`,
			"Overall task:",
			text,
			"",
			"This slice only:",
			sentence(part),
			"",
			"Keep changes minimal and focused on this slice. Do not start later slices. Run only validation relevant to this slice.",
		].join("\n"),
	}));
}

export function formatSlices(slices: WorkSlice[]): string {
	return slices.map((slice, index) => `${index + 1}. ${slice.title.replace(/^Slice \d+:\s*/, "")}`).join("\n");
}
