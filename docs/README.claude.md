# Cockpit for Claude Code

Cockpit is a native Claude Code plugin. The repository root contains `.claude-plugin/plugin.json`, canonical `skills/`, five `agents/`, two setup commands, and a `SessionStart` hook.

## Local Use

```bash
claude plugin validate .
claude --plugin-dir .
```

Marketplace installation instructions are deferred until the public repository URL and release source are finalized.

## Setup And Doctor

- `/cockpit:cockpit-setup` verifies the plugin and explains its inherited-model behavior. It does not write Claude settings.
- `/cockpit:cockpit-doctor` checks the plugin, scoped skills, agents, bootstrap, and read-only restrictions.

Skills and agents are plugin-scoped. For example, `cockpit-plan` is available as `cockpit:cockpit-plan`, and the planner agent appears as `cockpit:cockpit-planner`.

## Agents

All five agents use `model: inherit`:

| Agent | Skill | Capability |
|---|---|---|
| `cockpit:cockpit-explorer` | `cockpit:cockpit-explore` | no Write or Edit |
| `cockpit:cockpit-planner` | `cockpit:cockpit-plan` | no Write or Edit |
| `cockpit:cockpit-reviewer` | `cockpit:cockpit-review` | no Write or Edit |
| `cockpit:cockpit-research` | `cockpit:cockpit-research` | no Write or Edit |
| `cockpit:cockpit-executor` | `cockpit:cockpit-execute` | inherited tools |

## Bootstrap And Trust

`hooks/session-start.mjs` returns the `using-cockpit` methodology through `hookSpecificOutput.additionalContext`. The cross-platform Node hook is static: it performs no network calls, model calls, or configuration writes. The bootstrap consumes context tokens and can be disabled by disabling the plugin.

## Disable Or Remove

Use Claude Code's `/plugin` interface or native `claude plugin disable` and uninstall commands. Disabling the plugin removes its skills, agents, commands, and hook without leaving generated user settings.
