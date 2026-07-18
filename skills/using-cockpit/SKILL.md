---
name: using-cockpit
description: Use at the start of coding, debugging, planning, or review work to select the smallest safe Cockpit workflow before taking action. Do not use as a routing engine or dispatcher.
---

# Using Cockpit

Cockpit is a skills-first methodology. The reading agent is the oracle: it selects the shortest safe workflow, retains consequential decisions, and certifies completion. Use `cockpit-work-mode` when mode selection is not immediately obvious.

## Rules

1. **Tiny deterministic work** — handle directly. Validate and report. Do not delegate merely because delegation exists.
2. **Broad/noisy research** — delegate to a hands worker when isolation likely saves more context than the handoff costs. Keep narrow lookups direct.
3. **Approved bounded execution** — delegate to an executor only when the plan is explicit, low-risk, and independently executable.
4. **Reasoning-sensitive work** — a strategist, planner, or reviewer may provide independent analysis. The oracle integrates the result and retains approval, severity, escalation, and completion judgment.
5. **Worker unavailable** — perform the same work sequentially. Never spin up a custom runtime, queue, or dispatch mechanism.

## Handoff discipline

- Send only the goal, scope, required evidence or edits, validation, and stop conditions.
- Do not repeat the full user prompt, bootstrap, methodology, or known context.
- Workers return compact cited evidence — not a transcript of their process.
- The oracle does not automatically repeat delegated broad work. It checks only gaps, contradictions, high-risk claims, and final certification.
- Before dispatching, emit one concise line such as `Cockpit: research → worker` so model use is visible. Do not announce routing for direct work.
- Omit irrelevant sections rather than emitting empty boilerplate.

## Non-negotiable boundaries

- Exploration recommends; the human approves. Stop for human input when the path involves an unapproved product, architecture, migration, security, persistence, or deployment decision.
- Research gathers evidence; it does not choose direction or implement.
- Planning specifies; it does not edit.
- Execution follows approved scope; it does not redesign.
- Review inspects actual work; it does not trust summaries.
- Verification uses fresh evidence; it does not infer success.

Cockpit is orchestration-free: no route engine, dispatch function, queue, retry loop, state machine, or automatic invocation mechanism. All routing decisions are explicit, inline, and made by the oracle.

User instructions override the default workflow. They do not justify false claims, destructive action, or silently making consequential decisions.
