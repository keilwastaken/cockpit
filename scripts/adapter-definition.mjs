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

// Retained until the behavioral and cost harnesses move to explicit worker scenarios.
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

export const opencodeWorkerDescription = "Execute explicit, mechanical Cockpit contracts on the configured hands model. Stop on ambiguity, scope pressure, consequential decisions, or repeated validation failure.";

export const opencodeContractPrompt = `Create an execution contract for the task below. Inspect the repository only as needed to verify paths, conventions, and acceptance commands. Do not edit files. If product behavior, architecture, security, authentication, persistence, migration, deployment, or destructive action remains unresolved, ask for a decision instead of producing an executable contract.

Return all five sections. Do not omit any section:

# Execution Contract
## Goal
## Allowed Files
## Required Changes
## Acceptance Checks
## Stop Conditions

Task:
$ARGUMENTS`;

export const opencodeRunPrompt = `You are orchestrating an approved execution contract as the strong parent agent. Use OpenCode's native Task tool to dispatch work to the cockpit-worker subagent.

Rules:
- Before dispatch, confirm cockpit-worker resolves to an explicit model through agent.cockpit-worker.model or small_model. If neither is configured, stop and direct the user to /cockpit-setup; do not let the worker inherit build's strong model.
- For overlapping or ordered changes, use one worker or sequential tasks.
- For genuinely disjoint independent packets, dispatch parallel tasks.
- Await all task returns before proceeding.
- Inspect the actual combined repository state after all tasks finish.
- Run fresh validation checks yourself.
- Treat worker reports as untrusted — verify evidence, do not infer success.
- You own the final claim; do not delegate certification to the worker.
- No custom listener, router, state machine, or orchestration framework — use only native Task calls.

Contract to execute:
$ARGUMENTS`;

export const opencodeSetupPrompt = `Configure Cockpit's explicit strong and hands model surfaces through a safe conversational wizard.

1. Load OpenCode's built-in customize-opencode skill and follow it for config syntax and editing.
2. Locate the active global config. Respect OPENCODE_CONFIG_DIR when set; otherwise prefer ~/.config/opencode/opencode.jsonc when it exists, then ~/.config/opencode/opencode.json. Read it before proposing changes.
3. Run opencode models and use only exact model IDs present in its output. Note the current model, small_model, agent.cockpit-worker, and agent.explore values when configured.
4. Use OpenCode's native question tool for every setup choice so the user gets a keyboard-navigable, scrollable option list instead of having to type model IDs. Do not ask model-selection questions as plain text.
   - First ask whether to keep the current primary model used by built-in build or select a strong model.
   - When selecting a model, ask for its provider first, then show exact available model IDs for that provider.
   - Repeat provider then model selection for the hands model used by cockpit-worker and, when approved, built-in explore and OpenCode's small-model work.
   - Ask one selection question at a time. Include current values and sensible recommendations without silently choosing one.
5. Inspect every existing agent entry before constructing the final config:
   - For cockpit-worker, preserve existing model, description, explicit disablement, and unrelated safe custom fields. The plugin enforces subagent mode, canonical prompt, step ceiling, denied task/question/webfetch/skill permissions, and disables the worker when no hands model resolves.
   - For built-in explore, ask whether to assign the hands model. Preserve every existing field except model when approved.
   - Do not modify built-in general; generic delegation remains native and is not Cockpit's cheap execution path.
   - Warn about existing cockpit-executor, cockpit-explorer, cockpit-research, cockpit-strategist, cockpit-planner, and cockpit-reviewer entries. Ask whether to preserve or remove each legacy definition. Do not silently merge, delete, rename, or overwrite customized agents.
6. Collect all choices without modifying the config file.
7. Show one exact preview of all config changes: primary model, optional small_model, cockpit-worker model, optional explore override, and legacy entry preservations or removals. Then use the question tool with explicit Apply configuration and Cancel options. Do not write before the user selects Apply.
8. On confirmation, apply the exact merged config:
   - model: strong model unless the user chose to leave it unchanged;
   - small_model: hands model only when approved;
   - agent.cockpit-worker.model: hands model, preserving all other fields;
   - agent.explore.model: hands model only when approved, preserving all other fields;
   - leave built-in general unchanged;
   - preserve or remove legacy Cockpit agents exactly as approved.
9. Validate the saved file with opencode debug config. Report the selected mapping and any validation failure honestly.
10. Tell the user to quit and restart OpenCode because config is loaded at startup.

Do not modify provider credentials, provider definitions, plugins, worker permissions, Scout configuration, or unrelated agents.`;

export const opencodeDoctorPrompt = `Diagnose the Cockpit OpenCode installation without changing any files or configuration.

1. Run opencode --version, opencode debug config, and opencode debug skill.
2. Inspect the resolved plugin source, Cockpit skills path, primary model, small_model, cockpit-worker, optional built-in explore override, and Cockpit commands.
3. Verify all packaged Cockpit skills are discovered.
4. Verify cockpit-worker is an enabled subagent, has an explicit model, denies task delegation, has a bounded step count, and build can invoke it via native Task calls. A missing model or disabled worker is FAIL. Verify built-in general was not overridden by Cockpit.
5. Verify cockpit-contract and cockpit-run both use build with subtask false. Inspect their templates: cockpit-contract must require all five contract sections without editing; cockpit-run must require an explicit worker model, native Task dispatch, all-task join, actual-state inspection, and fresh parent validation. Any canonical command mismatch in agent, subtask, or required prompt behavior must be marked FAIL, not WARN.
6. Confirm the plugin has no chat-message transform and ordinary user messages receive no Cockpit bootstrap.
7. Warn if deprecated cockpit-explorer, cockpit-research, cockpit-executor, cockpit-strategist, cockpit-planner, or cockpit-reviewer entries exist.
8. Report a compact table with checks marked PASS, WARN, or FAIL, followed by exact remediation commands or config locations.
9. End by saying whether Cockpit is ready. Do not edit config, install packages, restart OpenCode, or invoke coding workflows.`;
