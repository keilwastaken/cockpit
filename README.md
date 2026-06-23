# Pi Conductor

Conductor is a Pi package that keeps the main chat as the cockpit and routes coding work to right-sized delegated agents.

## Status

Phase 1 scaffold: recommendation-only routing and handoff generation. It does **not** launch subagents yet.

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
/conductor handoff [micro|small|medium|full-auto] <task>
/conductor strict on|off
```

`/conductor handoff` writes a timestamped markdown log under `.pi/conductor/runs/` in the active project.

## What is a handoff?

A handoff is a clean work order for a delegated subagent. It includes:

- goal
- selected route and suggested agent
- allowed files
- non-goals
- stop rules
- validation hints
- required return format

## Defaults

- Strict mode: on
- Micro agents: `qwen-executor`, `qwen35b-executor`, `gpt54-mini-executor`
- Small agents: `qwen-executor`, `qwen35b-executor`, `gpt54-mini-executor`
- Medium agent: `worker`
- Full-auto flow: parent-orchestrated `review-loop`

Full-auto is not one model. The current parent chat model orchestrates the flow, a small/medium implementer does the write pass, and the reviewer agent handles code review. Run `/conductor setup` to customize these defaults. Setup reads Pi's available model list via the active model registry so you can select small/medium models from a menu instead of typing model IDs by hand. If no available models are found, setup falls back to manual entry.

## Tier/context policy

- Micro: no scout/context pass; read/edit exact allowed files only; run requested or narrow validation; return compactly.
- Small: optional scout only if target files are unclear.
- Medium: scout/context pass recommended before execution.
- Full-auto: parent-orchestrated scout + plan + execute + review.

## Phase 2 direction

The next phase will add guarded launch support for small delegations after explicit approval. Until then, use the generated handoff with your existing subagent workflow.
