import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AsyncJob } from "./async-jobs.js";

type UiLike = {
	setStatus(key: string, value: string | undefined): void;
	setWidget(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	notify(message: string, level?: "info" | "warning" | "error"): void;
};

const snippet = (text: string, max = 1200): string => text.length <= max ? text : `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;

export function jobResultSummary(job: AsyncJob): string {
	const lines = [
		`Cockpit job ${job.id} ${job.status}`,
		`Flow: ${job.flow}`,
		job.blockedReason ? `Blocked: ${job.blockedReason}` : undefined,
		job.output ? `\n${snippet(job.output)}` : undefined,
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
		sendJobResult: (job) => sendJobResult(pi, job),
	};
}
