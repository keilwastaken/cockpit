import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.js";
import { checkToolCallSafety } from "./safety.js";
import { modelLabel } from "./runtime.js";
import { registerCockpitCommands } from "./commands/cockpit.js";
import { registerCockpitTools } from "./tools/register.js";
import { registerMessageRenderers } from "./ui/messages.js";

export default function cockpitExtension(pi: ExtensionAPI) {
	registerMessageRenderers(pi);

	pi.on("session_start", async (_event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		ctx.ui.setStatus("cockpit", `context-budget · hands: ${modelLabel(config.delegateFlows.normal.model)} · reasoning: ${modelLabel(config.delegateFlows.reviewer.model)}`);
	});

	pi.on("tool_call", async (event, ctx) => {
		const { config } = await loadConfig(ctx.cwd, ctx.isProjectTrusted());
		const safety = checkToolCallSafety(event, config, ctx.cwd);
		if (safety.block) return { block: true, reason: safety.message };
		if (safety.message) ctx.ui.notify(safety.message, "warning");
	});

	registerCockpitCommands(pi);
	registerCockpitTools(pi);
}
