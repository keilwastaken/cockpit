import { formatDecision, routeTask } from "../routing.js";
import { formatSlices, isBroadWork, sliceWork } from "../work.js";
import type { CockpitRuntime } from "../runtime.js";

type SliceMode = "ask" | "dangerous";

function startSliceChain(runtime: CockpitRuntime, slices: ReturnType<typeof sliceWork>, index: number, mode: SliceMode): void {
	const slice = slices[index];
	if (!slice) {
		runtime.ctx.ui.notify("Cockpit slice chain complete.", "info");
		return;
	}

	runtime.jobs.start({
		flow: "normal",
		plan: slice.prompt,
		onFinish: async (finished) => {
			const level = finished.status === "failed" ? "error" : finished.status === "cancelled" ? "warning" : "info";
			runtime.ctx.ui.notify(`Cockpit slice ${index + 1}/${slices.length} ${finished.status}.`, level);
			runtime.pi.sendMessage({ customType: "cockpit-job-result", content: `Cockpit slice ${index + 1}/${slices.length} ${finished.status}\n\n${finished.output || finished.blockedReason || ""}`, display: true, details: finished });
			if (finished.status !== "done") return;

			const nextIndex = index + 1;
			if (nextIndex >= slices.length) {
				runtime.ctx.ui.notify("Cockpit all slices complete.", "info");
				return;
			}

			if (mode === "dangerous") {
				startSliceChain(runtime, slices, nextIndex, mode);
				return;
			}

			const ok = await runtime.ctx.ui.confirm(
				"Cockpit slice checkpoint",
				[`Slice ${index + 1} complete.`, "", `Next: ${slices[nextIndex].title}`, "", "Proceed to next slice?"].join("\n"),
			);
			if (ok) {
				startSliceChain(runtime, slices, nextIndex, "ask");
				return;
			}

			const dangerous = await runtime.ctx.ui.confirm(
				"Run remaining slices dangerously?",
				"This will run the remaining slices without asking between them. Tier budgets and failure stops still apply.",
			);
			if (dangerous) startSliceChain(runtime, slices, nextIndex, "dangerous");
			else runtime.ctx.ui.notify("Cockpit stopped before the next slice.", "warning");
		},
	});
}

export async function handleWorkIntake(runtime: CockpitRuntime, task: string) {
	const { config, ctx, jobs } = runtime;
	if (/^review\b/i.test(task)) {
		jobs.start({ flow: "reviewer", plan: task });
		return;
	}

	if (isBroadWork(task, config)) {
		const slices = sliceWork(task);
		const ok = await ctx.ui.confirm("Cockpit will slice this task", [`This looks too broad for one delegate. I split it into ${slices.length} slice(s):`, "", formatSlices(slices), "", "Start slice 1 now? Cockpit will ask again after each completed slice."].join("\n"));
		if (!ok) {
			const dangerous = await ctx.ui.confirm("Run all slices dangerously?", "This runs all slices without asking between them. Tier budgets and failure stops still apply.");
			if (!dangerous) {
				ctx.ui.notify("Cockpit did not start work. Refine the task or run a smaller slice when ready.", "warning");
				return;
			}
			startSliceChain(runtime, slices, 0, "dangerous");
			return;
		}
		startSliceChain(runtime, slices, 0, "ask");
		return;
	}

	const decision = routeTask(task, config);
	if (decision.route === "instant") {
		const file = runtime.fileFromPlan(task);
		if (file) {
			jobs.start({ flow: "instant", plan: task, file });
			return;
		}
	}
	if (decision.route === "fast") {
		jobs.start({ flow: "fast", plan: task });
		return;
	}
	if (decision.route === "normal") {
		jobs.start({ flow: "normal", plan: task });
		return;
	}

	ctx.ui.notify(["Cockpit needs a bit more direction before starting.", formatDecision(decision)].join("\n\n"), "warning");
}
