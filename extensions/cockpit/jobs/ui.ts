import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AsyncJob } from "./async-jobs.js";

type UiLike = {
	setStatus(key: string, value: string | undefined): void;
	setWidget(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	notify(message: string, level?: "info" | "warning" | "error"): void;
	confirm(title: string, message?: string): Promise<boolean>;
};

const MAX_DIGEST_LINES = 10;
const MAX_DIGEST_CHARS = 1600;

const stripMarkdown = (text: string): string => text
	.replace(/`([^`]+)`/g, "$1")
	.replace(/\*\*([^*]+)\*\*/g, "$1")
	.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
	.trim();

const truncate = (text: string, max = 180): string => {
	const clean = stripMarkdown(text).replace(/\s+/g, " ");
	return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
};

function section(output: string, heading: string): string {
	const lines = output.split("\n");
	const wanted = heading.trim().toLowerCase();
	const start = lines.findIndex((line) => line.match(/^##\s+(.+)\s*$/)?.[1]?.trim().toLowerCase() === wanted);
	if (start === -1) return "";
	const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
	return lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
}

function firstParagraph(text: string): string | undefined {
	const paragraph = text.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean);
	return paragraph ? truncate(paragraph, 260) : undefined;
}

function bullets(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.match(/^\s*-\s+(.+)$/)?.[1])
		.filter((line): line is string => Boolean(line))
		.map((line) => truncate(line, 180));
}

function addLine(lines: string[], line: string | undefined): void {
	if (!line) return;
	if (lines.includes(line)) return;
	lines.push(line);
}

function buildOutputDigest(job: AsyncJob): string | undefined {
	const output = job.output.trim();
	if (!output) return undefined;

	const lines: string[] = [];
	const task = firstParagraph(section(output, "Task Understanding"));
	addLine(lines, task ? `Task: ${task}` : undefined);

	const confidence = output.match(/^\s*-\s*Confidence:\s*(.+)$/im)?.[1];
	addLine(lines, confidence ? `Confidence: ${truncate(confidence, 120)}` : undefined);

	for (const gap of bullets(section(output, "Evidence Quality")).filter((line) => /gap|missing|unresolved|absent|no existing/i.test(line)).slice(0, 3)) {
		addLine(lines, `Gap: ${gap}`);
	}

	for (const file of bullets(section(output, "Relevant Files")).slice(0, 4)) {
		addLine(lines, `File: ${file}`);
	}

	for (const heading of ["Recommended Next Step", "Recommended Next Slice", "Next Steps", "Coder Instructions", "Implementation Plan"]) {
		const content = section(output, heading);
		if (!content) continue;
		const paragraph = firstParagraph(content);
		addLine(lines, paragraph ? `Next: ${paragraph}` : undefined);
		for (const bullet of bullets(content).slice(0, 3)) addLine(lines, `Next: ${bullet}`);
	}

	if (lines.length === 0) {
		const title = output.match(/^#\s+(.+)$/m)?.[1];
		addLine(lines, title ? truncate(title, 160) : undefined);
		for (const bullet of bullets(output).slice(0, 6)) addLine(lines, bullet);
		if (lines.length === 0) addLine(lines, firstParagraph(output));
	}

	const digest = lines.slice(0, MAX_DIGEST_LINES).map((line) => `- ${line}`).join("\n");
	return digest.length <= MAX_DIGEST_CHARS ? digest : `${digest.slice(0, MAX_DIGEST_CHARS - 1)}…`;
}

export function jobResultSummary(job: AsyncJob): string {
	const digest = buildOutputDigest(job);
	const lines = [
		`Cockpit job ${job.id} ${job.status}`,
		`Flow: ${job.flow}`,
		job.blockedReason ? `Blocked: ${job.blockedReason}` : undefined,
		digest ? `\nDigest:\n${digest}` : undefined,
		`\nFull output: /cockpit job ${job.id}`,
		`Artifacts: ${job.artifactsDir}`,
	].filter((line): line is string => Boolean(line));
	return lines.join("\n");
}

export function sendJobResult(pi: ExtensionAPI, job: AsyncJob): void {
	pi.sendMessage({
		customType: "cockpit-job-result",
		content: jobResultSummary(job),
		display: true,
		details: job,
	});
}

export function makeJobUi(ctx: { ui: UiLike }, pi: ExtensionAPI): UiLike & { sendJobResult(job: AsyncJob): void } {
	return {
		setStatus: (key, value) => ctx.ui.setStatus(key, value),
		setWidget: (key, value, options) => ctx.ui.setWidget(key, value, options),
		notify: (message, level) => ctx.ui.notify(message, level),
		confirm: (title, message) => ctx.ui.confirm(title, message),
		sendJobResult: (job) => sendJobResult(pi, job),
	};
}
