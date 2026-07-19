# Cockpit Lite

Cockpit is an on-demand prompt/skill library for OpenCode. Native OpenCode owns routing and execution.

Cockpit provides curated workflow skills that load on demand. It does not install agents, mutate configuration, register commands, or inject bootstrap content into ordinary conversations.

## Principles

- Native strong-model work is the default.
- Cheap execution is optional, untrusted, and reserved for substantial mechanical low-risk work.
- Recommendation is not human approval.
- Evidence precedes commitment; distinguish facts from inference.
- Plans are bounded contracts with validation and stop conditions.
- Executors stop rather than silently redesign.
- The strong model handles ambiguity, recovery, and consequential judgment.
- Fresh verification precedes completion claims.

## Skills

Canonical behavior lives in namespaced Markdown skills under [`skills/`](skills/):

- `cockpit-capture`: package deferred work for a future agent.
- `cockpit-execute`: execute an approved bounded contract.
- `cockpit-parallel`: structure genuinely independent work streams.
- `cockpit-plan`: turn approved direction into an executable plan.
- `cockpit-research`: gather factual evidence without choosing direction.
- `cockpit-review`: inspect completed changes for defects and risk.
- `cockpit-review-response`: verify and respond to review feedback.
- `cockpit-strategy`: resolve product, architecture, and migration tradeoffs.
- `cockpit-verify`: gather fresh evidence before completion claims.

Each skill owns its trigger, procedure, boundaries, and output format. Load only the skill needed for the current task.

## Install

The OpenCode plugin at `.opencode/plugins/cockpit.js` adds the `skills/` directory to OpenCode's skill paths. It does not mutate agents, commands, models, permissions, prompts, or steps.

Point OpenCode at this checkout:

```json
{
  "plugin": ["file:///absolute/path/to/cockpit/.opencode/plugins/cockpit.js"]
}
```

After publishing or installing the npm package, use `"plugin": ["cockpit"]`. Restart OpenCode after changing configuration.

## Optional Native Agents

Model selection remains normal OpenCode configuration. A cheap model can handle cold, broad research through built-in `explore`; an optional `hands` subagent can handle large mechanical work:

```jsonc
{
  "agent": {
    "explore": { "model": "opencode/deepseek-v4-flash-free" },
    "hands": {
      "mode": "subagent",
      "model": "opencode/deepseek-v4-flash-free",
      "steps": 20,
      "permission": { "task": "deny", "question": "deny" },
      "description": "Cheap, untrusted execution agent for large, mechanical, low-risk tasks with clear scope and deterministic validation. Use only when the work is substantial enough to justify delegation. Do not use for product decisions, architecture, security, authentication, migrations, ambiguous debugging, or completion claims. Inspect its changes and validate independently."
    }
  }
}
```

Cockpit does not install, mutate, or select these entries.

The parent remains responsible for consequential decisions, actual-diff inspection, and completion claims. A skill is guidance, not a model router or security boundary.

## Historical Evidence

[Historical scorecards](https://github.com/keilwastaken/cockpit/tree/main/history) retain conclusions from the retired routing and worker experiments. Their recorded commits preserve the exact benchmark sources. They do not establish a cost-saving claim for Cockpit Lite.

## Development

```bash
npm test              # Run all tests
npm pack --dry-run    # Verify package contents
```

The package has no runtime dependencies.

## License

[MIT](LICENSE)
