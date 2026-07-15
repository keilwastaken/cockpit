import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillsDirectory = path.resolve(pluginDirectory, "../../skills");
const bootstrapMarker = "COCKPIT_BOOTSTRAP_V1";
const setupPrompt = `Configure Cockpit's OpenCode model roles through a safe conversational wizard.

1. Load OpenCode's built-in customize-opencode skill and follow it for config syntax and editing.
2. Locate the active global config. Respect OPENCODE_CONFIG_DIR when set; otherwise prefer ~/.config/opencode/opencode.jsonc when it exists, then ~/.config/opencode/opencode.json. Read it before proposing changes.
3. Run \`opencode models\` and use only exact model IDs present in its output. Note the current \`model\` and \`small_model\` values when configured.
4. Use OpenCode's native \`question\` tool for every setup choice so the user gets a keyboard-navigable, scrollable option list instead of having to type model IDs. Do not ask model-selection questions as plain text.
   - First ask whether to keep the current primary model or select a reasoning model.
   - When selecting a model, ask for its provider first, then show the exact available model IDs for that provider as options. This keeps each list manageable. Include the current model and sensible recommendations near the top without silently choosing one.
   - Repeat provider then model selection for the hands model used by research, bounded execution, and OpenCode's small-model work.
   - Use the model ID as each option label and a concise human-readable name or role as its description.
   - Ask one selection question at a time. OpenCode's question UI handles list navigation and still permits a custom answer if the desired ID is absent.
5. Preview the exact config changes, then use the \`question\` tool with explicit \`Apply configuration\` and \`Cancel\` options. Do not write before the user selects Apply.
6. On confirmation, preserve all unrelated settings and merge:
   - \`model\`: reasoning model, unless the user chose to leave it unchanged;
   - \`small_model\`: hands model;
   - native subagents named \`cockpit-explorer\`, \`cockpit-planner\`, and \`cockpit-reviewer\` using the reasoning model;
   - native subagents named \`cockpit-research\` and \`cockpit-executor\` using the hands model.
7. Configure each subagent with mode \`subagent\`, a precise description, and these exact skill prompts: \`cockpit-explorer\` loads \`cockpit-explore\`; \`cockpit-planner\` loads \`cockpit-plan\`; \`cockpit-reviewer\` loads \`cockpit-review\`; \`cockpit-research\` loads \`cockpit-research\`; \`cockpit-executor\` loads \`cockpit-execute\`. Deny edit permission for explorer, planner, research, and reviewer. Set the executor's edit permission to \`allow\` explicitly.
8. If one of these agent definitions already exists, preserve user customizations unless the user explicitly approves replacing them.
9. Validate the saved file with \`opencode debug config\`. Report the selected mapping and any validation failure honestly.
10. Tell the user to quit and restart OpenCode because config is loaded at startup.

Do not modify provider credentials, provider definitions, plugins, permissions, or unrelated agents.`;

const doctorPrompt = `Diagnose the Cockpit OpenCode installation without changing any files or configuration.

1. Run \`opencode --version\`, \`opencode debug config\`, and \`opencode debug skill\`.
2. Inspect the resolved plugin source, Cockpit skills path, primary \`model\`, \`small_model\`, and the five optional Cockpit subagents.
3. Verify these skills are discovered: \`using-cockpit\`, \`cockpit-work-mode\`, \`cockpit-explore\`, \`cockpit-research\`, \`cockpit-plan\`, \`cockpit-execute\`, \`cockpit-parallel\`, \`cockpit-review\`, \`cockpit-review-response\`, \`cockpit-verify\`, and \`cockpit-capture\`.
4. If model roles are configured, verify every assigned model appears in \`opencode models\`, read-only agents deny edits, and \`cockpit-executor\` is allowed to edit.
5. Report a compact table with checks marked PASS, WARN, or FAIL, followed by exact remediation commands or config locations for warnings and failures.
6. End by saying whether Cockpit is ready. Do not edit config, install packages, restart OpenCode, or invoke coding workflows.`;
let cachedBootstrap;

function skillBody(markdown) {
	const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
	return match ? match[1].trim() : markdown.trim();
}

function bootstrap() {
	if (cachedBootstrap !== undefined) return cachedBootstrap;
	const bootstrapPath = path.join(skillsDirectory, "using-cockpit", "SKILL.md");
	if (!fs.existsSync(bootstrapPath)) return (cachedBootstrap = null);

	const content = skillBody(fs.readFileSync(bootstrapPath, "utf8"));
	cachedBootstrap = `${bootstrapMarker}

You have Cockpit skills available. The using-cockpit skill is already loaded below; do not load it again for this conversation.

${content}

OpenCode action mapping:
- Invoke a skill: use the native skill tool.
- Dispatch independent work: use the task tool when available. If /cockpit-setup configured native Cockpit agents, prefer cockpit-explorer/planner/reviewer for reasoning work and cockpit-research/executor for hands work.
- Inspect files: use read, grep, and glob.
- Change files: use apply_patch.
- Run commands: use bash.
- Fetch current documentation: use webfetch.

Canonical Cockpit skills describe actions rather than requiring these specific tools.`;
	return cachedBootstrap;
}

export const CockpitPlugin = async () => ({
	config: async (config) => {
		config.skills ??= {};
		config.skills.paths ??= [];
		if (!config.skills.paths.includes(skillsDirectory)) {
			config.skills.paths.push(skillsDirectory);
		}

		config.command ??= {};
		config.command["cockpit-setup"] ??= {
			description: "Choose reasoning and hands models for Cockpit roles",
			template: setupPrompt,
		};
		config.command["cockpit-doctor"] ??= {
			description: "Diagnose Cockpit skills and model assignments",
			template: doctorPrompt,
		};
	},

	"experimental.chat.messages.transform": async (_input, output) => {
		const content = bootstrap();
		if (!content) return;
		const firstUserMessage = output.messages.find((message) => message.info.role === "user");
		if (!firstUserMessage) return;
		if (firstUserMessage.parts.some((part) => part.type === "text" && part.text.includes(bootstrapMarker))) return;

		const referencePart = firstUserMessage.parts[0] ?? {};
		firstUserMessage.parts.unshift({ ...referencePart, type: "text", text: content });
	},
});
