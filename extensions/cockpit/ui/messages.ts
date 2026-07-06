import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export function registerMessageRenderers(pi: ExtensionAPI) {
	pi.registerMessageRenderer("cockpit-job-result", (msg, options, theme) => {
		const prefix = theme.fg("accent", "[Cockpit Job Result] ");
		const text = typeof msg.content === "string" ? msg.content : "(Job finished)";
		if (!options.expanded) return new Text(prefix + text, 0, 0);
		const details = msg.details && typeof msg.details === "object" && "output" in msg.details
			? `\n\n${theme.fg("dim", "Full output:")}\n${String((msg.details as { output?: unknown }).output ?? "")}`
			: "";
		return new Text(prefix + text + details, 0, 0);
	});
}
