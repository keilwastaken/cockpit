# Cockpit Skills

Portable role skills extracted from Cockpit.

These are useful on their own in agents that support skill folders, markdown agents, or custom instructions. Cockpit Runtime provides the heavier Pi-specific context-budget layer: background jobs, artifacts, parallel work, approval-gated codeflow, review routing, model routing, and flight-safety guards.

## Skills

- `instant/` — tiny exact one-file edits; direct only when spawn overhead would be wasteful, no scouting.
- `fast/` — small bounded work with targeted local discovery.
- `ideate/` — divergent option-space exploration before planning/coding.
- `research/` — read-only codebase/external evidence brief.
- `planner/` — read-only implementation plan from an approved direction.
- `normal/` — bounded implementation executor from a concrete plan.
- `reviewer/` — read-only calibrated diff/code review with feedback weight.
- `task-writer/` — durable markdown task packet writer.

## Suggested usage model

Default to protecting the main Oracle context. Use direct agent work only for tiny/interactive maneuvers. Load or invoke these skills when the role discipline keeps search, logs, diffs, uncertainty, or implementation detail out of the main chat:

```text
Use cockpit-ideate to explore this refactor direction before we plan it.
Use cockpit-research to inspect how auth currently works, read-only.
Use cockpit-reviewer to review the current diff against the plan.
```

## Cockpit Runtime vs skills

Use skills when you want portable instructions.

Use Cockpit Runtime when you want orchestration:

- background jobs,
- parallel workers,
- persisted artifacts,
- approval-gated codeflow,
- reviewer feedback routing,
- Pi UI/status/progress integration,
- shell flight-safety guards.
