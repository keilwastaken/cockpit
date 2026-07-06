import { formatDecision, routeTask } from "../routing.js";
import { formatSlices, isBroadWork, sliceWork } from "../work.js";
import type { CockpitRuntime } from "../runtime.js";

export async function handleWorkIntake(runtime: CockpitRuntime, task: string) {
	const { config, ctx, jobs } = runtime;
	if (/^review\b/i.test(task)) {
		jobs.start({ flow: "reviewer", plan: task });
		return;
	}

	if (isBroadWork(task, config)) {
		const slices = sliceWork(task);
		const ok = await ctx.ui.confirm("Cockpit will slice this task", [`This looks too broad for one delegate. I split it into ${slices.length} slice(s):`, "", formatSlices(slices), "", "Start slice 1 now?"].join("\n"));
		if (!ok) {
			ctx.ui.notify("Cockpit did not start work. Refine the task or run a smaller slice when ready.", "warning");
			return;
		}
		jobs.start({ flow: "normal", plan: slices[0]?.prompt ?? task });
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
