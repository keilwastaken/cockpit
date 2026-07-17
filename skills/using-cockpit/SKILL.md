---
name: using-cockpit
description: Use at the start of coding, debugging, planning, or review work to select the smallest safe Cockpit workflow before taking action. Do not use as a routing engine or dispatcher.
---

# Using Cockpit

Cockpit is a skills-first methodology. Check for a relevant Cockpit skill before acting; do not invoke skills merely to add ceremony.

## Core rule

Use the smallest workflow that preserves correctness and keeps noisy work from consuming the primary conversation.

Before acting, determine:

1. Is the request clear enough to implement?
2. Are important facts missing?
3. Is there an unapproved product, architecture, migration, security, persistence, or deployment decision?
4. Is the work tiny and deterministic, or does it need a bounded plan?
5. What evidence will prove completion?

Use `cockpit-work-mode` when the answer is not immediately obvious.

### Routing policy

- **Tiny deterministic work:** handle directly without delegation. Validate and report.
- **Broad/noisy read-only research:** delegate to a host-native research worker (from `cockpit-research` skill) when available. Fall back to sequential same-skill work in the current agent.
- **Approved low-risk bounded implementation:** delegate to a host-native execution worker (from `cockpit-execute` skill) when available. Fall back to sequential same-skill work in the current agent.
- **Reasoning-sensitive work** (exploration, planning, review): never transfer consequential judgment to hands-only workers. Use reasoning-capable agents.
- **Worker unavailable:** perform the same work sequentially in the current agent. Never spin up a custom runtime, queue, or dispatch mechanism.

### Orchestration-free

Cockpit has no route engine, dispatch function, queue, retry loop, state machine, or automatic invocation mechanism. All routing decisions are explicit, inline, and made by the reading agent. Pi runs all workflows sequentially in the current agent. OpenCode and Claude use native agent dispatch only when explicitly invoked.

## Skill sequence

- Unclear direction: `cockpit-explore`, then wait for human approval.
- Missing codebase or external facts: `cockpit-research`.
- Approved nontrivial work: `cockpit-plan`.
- Concrete bounded plan: `cockpit-execute`.
- Independent work streams: `cockpit-parallel`.
- Nontrivial completed change: `cockpit-review`.
- Review feedback: `cockpit-review-response`.
- Any completion claim: `cockpit-verify`.
- Deferred idea or backlog work: `cockpit-capture`.

Skills compose, but not every task needs the full sequence.

## Context discipline

- Keep raw search results, long logs, broad diffs, and failed attempts out of handoffs.
- Pass compact findings with file, line, command, or URL evidence.
- Prefer a fresh worker for noisy independent work when the harness supports it.
- Before dispatching, emit one concise line such as `Cockpit: research → cockpit-research (Luna)` so model use is visible. Do not announce routing for direct work.
- If workers are unavailable, follow the same boundaries sequentially in the current agent.
- Never hide decisions or uncertainty merely to keep the handoff short.
- Never build a custom dispatch, queue, retry loop, or state machine to implement Cockpit routing.

## Non-negotiable boundaries

- Exploration recommends; the human approves.
- Research gathers evidence; it does not implement.
- Planning specifies; it does not edit.
- Execution follows the approved scope; it does not silently redesign.
- Review inspects the actual work product; it does not trust summaries.
- Verification uses fresh evidence; it does not infer success.

User instructions override the default workflow. They do not justify false claims, destructive action, or silently making consequential decisions.

## Harness distinctions

- **Pi:** No subagent or dispatch mechanism. All Cockpit work runs sequentially in the current agent using Pi's native skill and extension system. Model selection is per-session.
- **OpenCode:** Native subagents and the task tool provide dispatch. Reasoning-sensitive roles (explorer, planner, reviewer) should use the configured reasoning model. Hands roles (research, executor) should use the configured hands model. No custom routing engine.
- **Claude Code:** Native Agent tool provides dispatch. Agents inherit the current model. SessionStart hook loads `using-cockpit`. No custom routing or orchestration.
