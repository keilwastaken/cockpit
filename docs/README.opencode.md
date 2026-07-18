# Cockpit for OpenCode

The OpenCode plugin is a committed generated artifact. Change shared metadata in `scripts/adapter-definition.mjs`, then run `npm run generate`; do not edit `.opencode/plugins/cockpit.js` directly.

Cockpit's OpenCode adapter registers the canonical skills and injects the `using-cockpit` bootstrap into conversations. Workflow policy remains in the Markdown skills.

To regenerate:

```bash
npm run generate
```

## Local development install

Point OpenCode at this checkout in `opencode.json`:

```json
{
  "plugin": ["/absolute/path/to/cockpit"]
}
```

Restart OpenCode, then use its native skill tool to list skills. `using-cockpit` is injected automatically and should not need to be loaded manually.

## Git installation

After this repository has a public Git URL, install it through a git-backed package spec:

```json
{
  "plugin": ["cockpit@git+https://github.com/OWNER/cockpit.git"]
}
```

Pin a tag by appending `#TAG` when reproducibility matters.

## Model setup

Run this slash command inside OpenCode:

```text
/cockpit-setup
```

The conversational wizard uses OpenCode's native question UI with keyboard-navigable, scrollable lists. It asks for a provider and then an exact model ID for the reasoning and hands roles, previews the change, and updates the global OpenCode config only after confirmation. It overrides the built-in `explore` agent (hands model for broad research) and the built-in `general` agent (hands model for approved bounded execution), creates three native Cockpit subagents (strategist, planner, reviewer), safely handles legacy `cockpit-executor`, `cockpit-explorer`, and `cockpit-research` entries, then validates the resulting config.

Restart OpenCode after setup so the new model assignments take effect.

## Diagnostics

Run the read-only doctor at any time:

```text
/cockpit-doctor
```

It checks the plugin source, skill discovery, model availability, agent assignments, permissions, and resolved config without changing anything.

## What the adapter does

1. Adds the repository's `skills/` directory to OpenCode's skill paths.
2. Injects the body of `skills/using-cockpit/SKILL.md` into the first user message.
3. Registers conversational `/cockpit-setup` and read-only `/cockpit-doctor` commands.
4. Supplies a small mapping from generic Cockpit actions to OpenCode tools.

It does not implement jobs, model invocation, execution loops, or hidden workflow state. Setup writes ordinary native OpenCode agent configuration that users can inspect and edit.

## Tool mapping

- invoke a skill → native `skill` tool
- dispatch independent work → `task`
- inspect files → `read`, `grep`, `glob`
- edit files → `apply_patch`
- run commands → `bash`
- fetch current documentation → `webfetch`

Cockpit still works sequentially when a particular agent or model cannot dispatch subagents.

## Native subagents (optional)

Run `/cockpit-setup` to override the built-in `explore` and `general` agents and create three native OpenCode subagents:

| Agent / Subagent | Model Role | Skill | Permissions |
|---|---|---|---|
| `explore` (built-in override) | hands | `cockpit-research` (for evidence briefs) | inherited |
| `general` (built-in override) | hands | `cockpit-execute` (for approved bounded execution) | inherited |
| `cockpit-strategist` | reasoning | `cockpit-strategy` | read-only |
| `cockpit-planner` | reasoning | `cockpit-plan` | read-only |
| `cockpit-reviewer` | reasoning | `cockpit-review` | read-only |

These are ordinary OpenCode subagent definitions in your config. You can invoke them via the `task` tool or let the workflow skills delegate to them.

## Bootstrap assembly

The plugin performs runtime bootstrap assembly: it reads the body of `skills/using-cockpit/SKILL.md` at bootstrap time and prepends it (with harness-specific action mappings) before the original user task payload. This means:

- **Identical source files produce identical bootstrap bytes.** No prerendering or intermediate cache layer is introduced.
- The original user task payload remains byte-for-byte unchanged after the prepended bootstrap part.
- Provider cache configuration is outside the plugin. Cache keys, TTLs, breakpoints, and tool serialization are host/provider responsibilities.

## Verification

Run `/cockpit-doctor`, or ask OpenCode to list available skills. Confirm that `using-cockpit`, `cockpit-work-mode`, and the other namespaced Cockpit skills appear. Then start a small coding request and confirm the bootstrap is present only once.
