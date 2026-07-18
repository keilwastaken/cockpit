# Cockpit for OpenCode

The OpenCode plugin is a committed generated artifact. Change shared metadata in `scripts/adapter-definition.mjs` or the canonical execution skill, then run `npm run generate`; do not edit `.opencode/plugins/cockpit.js` directly.

Cockpit registers on-demand skills, an explicit bounded worker, and commands. It does not inject instructions into ordinary conversations or automatically route work.

## Install

Point OpenCode at this checkout in `opencode.json`:

```json
{
  "plugin": ["/absolute/path/to/cockpit"]
}
```

For a Git installation, use a git-backed package spec and pin a tag when reproducibility matters:

```json
{
  "plugin": ["cockpit@git+https://github.com/OWNER/cockpit.git#TAG"]
}
```

Restart OpenCode after installing or changing model assignments.

## Model Setup

Run:

```text
/cockpit-setup
```

The wizard uses OpenCode's question UI, previews every change, and writes only after confirmation. It configures:

- built-in `build` as the normal strong-model surface;
- `cockpit-worker` with the selected hands model;
- optionally built-in `explore` and `small_model` with the hands model.

Cockpit does not override built-in `general`. Existing customized agents are preserved or removed only with explicit approval.

## Explicit Workflow

### 1. Create a contract when needed

```text
/cockpit-contract <task>
```

This runs on built-in `build`, may inspect the repository, does not edit, and returns:

```markdown
# Execution Contract
## Goal
## Allowed Files
## Required Changes
## Acceptance Checks
## Stop Conditions
```

Skip this command when an equivalent explicit contract already exists.

### 2. Execute on the hands model

```text
/cockpit-run <execution contract>
```

This runs on the strong `build` agent with `subtask: false`. The strong parent uses OpenCode's native Task tool to dispatch work to `cockpit-worker`, awaits all task returns, inspects combined repository state, and runs fresh validation.

The worker may edit and run checks, but it cannot invoke subagents, broaden the allowed files, or make consequential design decisions. It makes at most one focused in-scope correction after failed validation. On failure it returns a Worker Escalation packet.

The strong parent treats worker reports as untrusted, verifies evidence, and owns the final completion claim. It may issue a corrected contract or ask the human when a stop condition is reached.

## Worker Boundary

The plugin registers `cockpit-worker` as a subagent invokable by `build` via native Task calls:

- canonical instructions generated from `skills/cockpit-execute/SKILL.md`;
- a 20-step ceiling;
- denied `task`, `question`, `webfetch`, and `skill` permissions;
- user-selected model and preserved safe restrictions.

The worker requires an explicit hands model. It uses `agent.cockpit-worker.model` when configured, otherwise `small_model`. If neither exists, the plugin disables the worker and `/cockpit-run` stops instead of allowing inheritance from the strong `build` model.

The worker inherits normal edit and bash capability unless the user further restricts it. Setup does not modify these plugin-enforced boundaries.

## On-Demand Skills

The plugin adds this repository's `skills/` directory to OpenCode's skill paths. Skills are discovered and loaded through OpenCode's native skill tool only when requested; `using-cockpit` is not loaded automatically.

## Diagnostics

Run:

```text
/cockpit-doctor
```

The doctor checks skill discovery, worker mode/model/permissions, complete command mappings and required prompt behavior, deprecated agents, and confirms the plugin has no chat-message transform. Preserved command collisions that differ from the canonical definitions are marked `FAIL`. It does not edit configuration.

## Development

```bash
npm run generate
npm run check:generated
npm test
```

The adapter implements no queue, retry loop, route engine, or hidden workflow state.
