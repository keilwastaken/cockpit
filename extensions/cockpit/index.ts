import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.js";
import { modelLabel } from "./runtime.js";
import { registerCockpitCommands } from "./commands/cockpit.js";
import { registerCockpitTools } from "./tools/register.js";
import { registerMessageRenderers } from "./ui/messages.js";
import { disposeWarmDelegates } from "./delegates/warm-pi.js";

export default function cockpitExtension(pi: ExtensionAPI) {
	registerMessageRenderers(pi);

	pi.on("session_start", async (_event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		ctx.ui.setStatus("cockpit", `context-budget · hands: ${modelLabel(config.delegateFlows.normal.model)} · reasoning: ${modelLabel(config.delegateFlows.planner.model)}`);
	});

	pi.on("session_shutdown", () => {
		disposeWarmDelegates();
	});

	registerCockpitCommands(pi);
	registerCockpitTools(pi);
}
