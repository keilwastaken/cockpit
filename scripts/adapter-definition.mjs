export const bootstrapMarker = "COCKPIT_BOOTSTRAP_V2";

export const skills = [
  "cockpit-capture",
  "cockpit-execute",
  "cockpit-parallel",
  "cockpit-plan",
  "cockpit-research",
  "cockpit-review",
  "cockpit-review-response",
  "cockpit-strategy",
  "cockpit-verify",
  "cockpit-work-mode",
  "using-cockpit",
];

export const roles = [
  {
    name: "cockpit-strategist",
    skill: "cockpit-strategy",
    description: "Reasoning-sensitive strategy for unresolved product and architecture decisions. Use when direction is consequential and ambiguous; do not use for implementation, factual research, or approved direction.",
    readOnly: true,
  },
  {
    name: "cockpit-planner",
    skill: "cockpit-plan",
    description: "Reasoning-sensitive planning that turns approved direction into a bounded implementation plan. Do not use for exploration, research, or implementation.",
    readOnly: true,
  },
  {
    name: "cockpit-reviewer",
    skill: "cockpit-review",
    description: "Reasoning-sensitive review of completed changes against requirements, risks, and tests. Use after implementation; do not use to fix defects directly.",
    readOnly: true,
  },
];

export const actionMappings = {
  opencode: [
    "Invoke a skill: use the native skill tool.",
    "Dispatch independent work with the task tool. Broad/noisy research delegates to built-in explore. Keep small deterministic execution direct; when approved execution benefits from context isolation, delegate to built-in general and instruct it: Load the cockpit-execute skill before acting and follow it. Use cockpit-strategist for unresolved consequential direction; ordinary approved planning and review stay in the oracle unless independent isolated analysis is explicitly valuable.",
    "Inspect files: use read, grep, and glob.",
    "Change files: use apply_patch.",
    "Run commands: use bash.",
    "Fetch current documentation: use webfetch.",
  ],
};

export const opencodeSetupPrompt = `Configure Cockpit's OpenCode model roles through a safe conversational wizard.

1. Load OpenCode's built-in customize-opencode skill and follow it for config syntax and editing.
2. Locate the active global config. Respect OPENCODE_CONFIG_DIR when set; otherwise prefer ~/.config/opencode/opencode.jsonc when it exists, then ~/.config/opencode/opencode.json. Read it before proposing changes.
3. Run \`opencode models\` and use only exact model IDs present in its output. Note the current \`model\` and \`small_model\` values when configured.
4. Use OpenCode's native \`question\` tool for every setup choice so the user gets a keyboard-navigable, scrollable option list instead of having to type model IDs. Do not ask model-selection questions as plain text.
   - First ask whether to keep the current primary model or select a reasoning model.
   - When selecting a model, ask for its provider first, then show the exact available model IDs for that provider as options. This keeps each list manageable. Include the current model and sensible recommendations near the top without silently choosing one.
    - Repeat provider then model selection for the hands model used by broad research (built-in explore), bounded execution (built-in general), and OpenCode's small-model work.
   - Use the model ID as each option label and a concise human-readable name or role as its description.
   - Ask one selection question at a time. OpenCode's question UI handles list navigation and still permits a custom answer if the desired ID is absent.
5. Before constructing the final config, inspect every existing agent entry and collect migration choices:
   - For current-name Cockpit subagents (\`cockpit-planner\`, \`cockpit-reviewer\`): preserve all existing fields (description, prompt, permission, mode, and any other customizations). Only the \`model\` value will be updated unless the user approves a full replacement. Ask whether to keep customizations or replace the entire definition.
   - If \`cockpit-executor\` exists, warn the user that Cockpit now routes execution through the built-in \`general\` agent and ask whether to remove the legacy \`cockpit-executor\` subagent or keep it. Do not silently delete customized user definitions.
   - If BOTH \`cockpit-explorer\` (legacy name) AND \`cockpit-strategist\` (current name) exist, present an explicit three-way choice:
     (a) Keep current \`cockpit-strategist\` as configured; remove legacy \`cockpit-explorer\`.
     (b) Replace current \`cockpit-strategist\` with legacy \`cockpit-explorer\`'s definition (preserving all its custom fields including description, prompt, permission, mode), then remove legacy \`cockpit-explorer\`.
     (c) Retain both as separate entries.
     Do not silently merge or delete either entry.
   - If only \`cockpit-explorer\` exists (no \`cockpit-strategist\`), warn the user and ask whether to rename it to \`cockpit-strategist\` (preserving its custom fields) or keep the old entry. Do not silently overwrite.
   - If only \`cockpit-strategist\` exists (no legacy), preserve it as described above.
   - If \`cockpit-research\` exists, warn the user and ask whether to remove it (research now uses built-in \`explore\`) or keep the old entry. Do not silently delete customized user definitions.
   - For the built-in \`explore\` and \`general\` agents: preserve all existing fields except set \`model\` to the hands model, unless the user approves a full replacement.
6. Collect all choices without modifying the config file yet.
7. Once model selections and migration choices are collected, show one exact preview of all config changes (model, small_model, explore and general overrides, subagent additions and removals, legacy entry replacements and preservations). Then use the \`question\` tool with explicit \`Apply configuration\` and \`Cancel\` options. Do not write before the user selects Apply.
8. On confirmation, apply the exact merged config:
   - \`model\`: reasoning model, unless the user chose to leave it unchanged;
   - \`small_model\`: hands model;
   - Override the built-in \`explore\` agent: preserve all existing fields except set \`model\` to the hands model per user choice. This agent handles broad/noisy research and uses the \`cockpit-research\` skill when an evidence brief is needed.
    - Override the built-in \`general\` agent: preserve all existing fields except set \`model\` to the hands model per user choice. Every execution delegation to this agent must instruct it to load and follow the \`cockpit-execute\` skill.
   - For each current-name Cockpit subagent: preserve all existing fields and update only the \`model\` (unless the user approved a full replacement).
   - Remove or keep legacy \`cockpit-executor\`, \`cockpit-explorer\`, and \`cockpit-research\` entries per user migration choices.
   - Do NOT create a \`cockpit-research\` or \`cockpit-executor\` subagent. Cockpit routes research through the built-in \`explore\` and execution through the built-in \`general\` agent instead.
    - For new subagents, configure with mode \`subagent\`, a precise description, and these exact skill prompts: \`cockpit-strategist\` loads \`cockpit-strategy\`; \`cockpit-planner\` loads \`cockpit-plan\`; \`cockpit-reviewer\` loads \`cockpit-review\`. Deny edit permission for all three subagents.
9. Validate the saved file with \`opencode debug config\`. Report the selected mapping and any validation failure honestly.
10. Tell the user to quit and restart OpenCode because config is loaded at startup.

Do not modify provider credentials, provider definitions, plugins, permissions, Scout configuration, or unrelated agents.`;

export const opencodeDoctorPrompt = `Diagnose the Cockpit OpenCode installation without changing any files or configuration.

1. Run \`opencode --version\`, \`opencode debug config\`, and \`opencode debug skill\`.
2. Inspect the resolved plugin source, Cockpit skills path, primary \`model\`, \`small_model\`, the built-in \`explore\` agent override, the built-in \`general\` agent override, and the three optional Cockpit subagents (\`cockpit-strategist\`, \`cockpit-planner\`, \`cockpit-reviewer\`).
3. Verify these skills are discovered: \`using-cockpit\`, \`cockpit-work-mode\`, \`cockpit-strategy\`, \`cockpit-research\`, \`cockpit-plan\`, \`cockpit-execute\`, \`cockpit-parallel\`, \`cockpit-review\`, \`cockpit-review-response\`, \`cockpit-verify\`, and \`cockpit-capture\`.
4. If model roles are configured, verify every assigned model appears in \`opencode models\`, read-only agents deny edits, built-in \`general\` uses the hands model, and built-in \`explore\` uses the hands model.
5. Check for deprecated entries: warn if \`cockpit-explorer\` (legacy name), \`cockpit-research\`, or \`cockpit-executor\` subagent exists in agent config. These were replaced by \`cockpit-strategist\`, built-in \`explore\`, and built-in \`general\` respectively.
6. Report a compact table with checks marked PASS, WARN, or FAIL, followed by exact remediation commands or config locations for warnings and failures.
7. End by saying whether Cockpit is ready. Do not edit config, install packages, restart OpenCode, or invoke coding workflows.`;
