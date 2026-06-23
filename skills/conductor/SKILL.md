---
name: conductor
description: Use Conductor to classify coding tasks, generate safe delegation handoffs, and keep the main Pi chat as the cockpit/orchestrator instead of editing directly.
---

# Conductor

Use Conductor when coding work should be delegated to a right-sized subagent.

## Workflow

1. Keep the parent chat responsible for intent, clarification, planning, review, and final explanation.
2. Use `/conductor route <task>` or the `conductor_handoff` tool to classify the task.
3. Use `/conductor handoff [small|medium|full-auto] <task>` to generate a clean handoff.
4. Do not broaden the delegated scope beyond the handoff.
5. Treat generated handoffs as Phase 1 artifacts; actual subagent launch remains manual until guarded launch support is implemented.

## Route meanings

- `small`: narrow mechanical work for local/cheap executors.
- `medium`: bounded multi-file work after a parent-owned plan.
- `full-auto`: broad work needing plan/implement/review/fix-loop orchestration.
- `need-decision`: clarify before delegation.
- `cockpit-only`: answer or plan in the parent chat.

## Strict mode

Conductor defaults strict mode on. If strict mode blocks direct mutation, generate a handoff instead of trying to bypass it.
