# Pi Conductor

Conductor is a Pi package that keeps the main chat as the cockpit and recommends execution profiles for coding work.

## Status

Phase 1 scaffold: recommendation-only routing and handoff generation. It does **not** launch subagents or execute an orchestration FSM yet.

## Install locally

```bash
pi -e /Users/keilaloia/kogstudio/pi-conductor
```

Or install persistently:

```bash
pi install /Users/keilaloia/kogstudio/pi-conductor
```

## Commands

```text
/conductor setup
/conductor status
/conductor route <task>
/conductor handoff [instant|rapid|verified|deep] <task>
/conductor strict on|off
```

`/conductor handoff` writes a timestamped markdown log under `.pi/conductor/runs/` in the active project.

## What is a handoff?

A handoff is a clean work order for a delegated subagent. It includes:

- goal
- selected route/profile and suggested agent
- allowed files
- execution profile metadata
- non-goals
- stop rules
- validation hints
- required return format

## Defaults

The public names are execution profiles/topology constraints, not model-size labels:

- `instant`: linear direct-worker profile; exact files; no scout; compact return; max worker visits 1
- `rapid`: linear direct-worker profile; bounded edits; optional scout if targets are unclear; max worker visits 1
- `verified`: orchestrated bounded flow; scout/context recommended; verification required; max worker visits 2
- `deep`: orchestrated deep flow; scout + plan + execute + verify + review; max worker visits 3

Default agent names are generic and configurable:

- Instant agents: `delegate`
- Rapid agents: `delegate`
- Verified agent: `worker`
- Reviewer agent: `reviewer`
- Deep worker agent: `worker`

Model and agent selection is a configurable implementation detail. By default, model preferences are blank so each agent inherits its normal default, while deep uses the current parent chat model to recommend the flow. Run `/conductor setup` to customize agents and model preferences from Pi's active model registry, or enter model IDs manually if no registry choices are available.

## Execution profile policy

- Instant: linear direct-worker profile; read/edit exact allowed files only; no scout; run requested or narrow validation; return compactly.
- Rapid: linear direct-worker profile; bounded edits; optional scout only if target files are unclear.
- Verified: orchestrated bounded flow; scout/context pass recommended before execution; verification required.
- Deep: orchestrated deep flow; scout + plan + execute + verify + review recommended.

## Phase 2 direction

The next phase will add guarded launch support for rapid delegations after explicit approval. Until then, use the generated handoff with your existing subagent workflow.
