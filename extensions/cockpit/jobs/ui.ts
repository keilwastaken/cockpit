import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AsyncJob } from "./async-jobs.js";

type UiLike = {
	setStatus(key: string, value: string | undefined): void;
	setWidget(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	notify(message: string, level?: "info" | "warning" | "error"): void;
	confirm(title: string, message?: string): Promise<boolean>;
};

const snippet = (text: string, max = 1200): string => text.length <= max ? text : `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
const outputLimitFor = (job: AsyncJob): number => job.flow === "codeflow-preplan" ? 12000 : 3000;

export function jobResultSummary(job: AsyncJob): string {
	const truncated = Boolean(job.output && job.output.length > outputLimitFor(job));
	const lines = [
		`Cockpit job ${job.id} ${job.status}`,
		`Flow: ${job.flow}`,
		job.blockedReason ? `Blocked: ${job.blockedReason}` : undefined,
		`Full output: /cockpit job ${job.id}`,
		`Artifacts: ${job.artifactsDir}`,
		job.output ? `\n${snippet(job.output, outputLimitFor(job))}` : undefined,
		truncated ? `\nOutput was truncated in chat. Run /cockpit job ${job.id} for the full result.` : undefined,
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
