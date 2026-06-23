---
name: conductor
description: Use Conductor to classify coding tasks, generate safe delegation handoffs, and keep the main Pi chat as the cockpit/orchestrator instead of editing directly.
---

# Conductor

Use Conductor when coding work should be delegated through an execution profile/topology with explicit guardrails. Profiles are not model-size or intelligence labels; they describe workflow shape, scope, and safety constraints.

## Workflow

1. Keep the parent chat responsible for intent, clarification, planning, review, and final explanation.
2. Use `/conductor route <task>` or the `conductor_handoff` tool to classify the task.
3. Use `/conductor handoff [instant|rapid|verified|deep] <task>` to generate a clean handoff.
4. Do not broaden the delegated scope beyond the handoff.
5. Treat generated handoffs as Phase 1 recommendation-only artifacts; actual subagent launch remains manual until guarded launch support is implemented.

## Execution profiles

- `instant`: linear direct-worker profile for exact-file tasks; no scout/context pass; compact return.
- `rapid`: linear direct-worker profile for narrow low-risk tasks; optional scout only if targets are unclear; bounded edits.
- `verified`: orchestrated profile for bounded multi-file work; scout/context recommended; verification required.
- `deep`: orchestrated profile for broad work; scout, plan, execute, verify, and review/fix-loop guardrails.
- `need-decision`: clarify before delegation.
- `cockpit-only`: answer or plan in the parent chat.

## Strict mode

Conductor defaults strict mode on. If strict mode blocks direct mutation, generate a handoff instead of trying to bypass it.
