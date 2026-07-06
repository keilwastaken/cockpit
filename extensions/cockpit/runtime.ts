import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.js";
import type { CockpitConfig } from "./config.js";
import { createJobService } from "./jobs/service.js";
import { makeJobUi } from "./jobs/ui.js";
import { routeTask } from "./routing.js";

export const modelId = (model: { provider: string; id: string }) => `${model.provider}/${model.id}`;
export const modelLabel = (model: string): string => model || "inherit current Pi default";
export const fileFromPlan = (plan: string, config: CockpitConfig): string => routeTask(plan, config, true).signals.mentionedFiles[0] ?? "";

export type CockpitRuntime = Awaited<ReturnType<typeof createCockpitRuntime>>;

export async function createCockpitRuntime(pi: ExtensionAPI, ctx: ExtensionContext) {
	const { config, paths } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
	const jobs = createJobService(config, { cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), ui: makeJobUi(ctx, pi) });
	return {
		pi,
		ctx,
		config,
		paths,
		jobs,
		fileFromPlan: (plan: string) => fileFromPlan(plan, config),
	};
}
