---
name: using-cockpit
description: Use at the start of coding, debugging, planning, or review work to select the smallest safe Cockpit workflow before taking action.
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
- If workers are unavailable, follow the same boundaries sequentially.
- Never hide decisions or uncertainty merely to keep the handoff short.

## Non-negotiable boundaries

- Exploration recommends; the human approves.
- Research gathers evidence; it does not implement.
- Planning specifies; it does not edit.
- Execution follows the approved scope; it does not silently redesign.
- Review inspects the actual work product; it does not trust summaries.
- Verification uses fresh evidence; it does not infer success.

User instructions override the default workflow. They do not justify false claims, destructive action, or silently making consequential decisions.
