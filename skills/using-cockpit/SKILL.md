---
name: using-cockpit
description: Use at the start of coding, debugging, planning, or review work to select the smallest safe Cockpit workflow before taking action. Do not use as a routing engine or dispatcher.
---

# Using Cockpit

Cockpit is a skills-first methodology. The reading agent is the oracle: it selects the shortest safe workflow, retains consequential decisions, and certifies completion. Use `cockpit-work-mode` when mode selection is not immediately obvious.

## Goal
Select the smallest safe workflow that preserves correctness and keeps noisy work from consuming the primary conversation.

## Scope
- Decide: is the request clear enough to implement? What evidence proves completion?
- Choose direct work, research, plan-then-execute, parallel work, or human escalation.
- Delegate broad research to built-in `explore` and approved bounded execution to built-in `general`.

## Required Evidence or Edits
- One compact handoff or direct result suffices.
- Workers return specialized packets with findings, commands, deviations, and stop reasons.

## Validation
- The oracle certifies only with fresh evidence, not inference or trust.
- Run validation commands from the plan. Distinguish observed results from assumed success.

## Stop Conditions
Stop for human input on any unapproved product, architecture, migration, security, persistence, or deployment decision; also stop when assumptions fail, scope changes, or required access is absent.

## Core rules
1. **Tiny deterministic work** — handle directly, validate, report.
2. **Broad research** — delegate to built-in `explore` when isolation saves context.
3. **Approved bounded execution** — delegate to built-in `general` with a SOW that says to load and follow `cockpit-execute`.
4. **Reasoning-sensitive work** — use the strategist for unresolved consequential direction; keep ordinary approved planning and review direct unless independent isolated analysis is explicitly valuable. The oracle integrates and retains approval, severity, escalation, and completion judgment.
5. **Worker unavailable** — perform sequentially. Never build a custom runtime, queue, or state machine.

## Handoff discipline
- Send only applicable sections: Goal, Scope, Required Evidence or Edits, Validation, Stop Conditions.
- Do not repeat the full user prompt, methodology, or known context.
- Workers return compact cited packets, not a transcript. The oracle repeats broad work only for gaps, contradictions, high-risk claims, or certification.

## Non-negotiable boundaries
- Exploration recommends; the human approves.
- Research gathers evidence; it does not choose direction or implement.
- Planning specifies; it does not edit.
- Execution follows approved scope; it does not redesign.
- Review inspects actual work; it does not trust summaries.
- Verification uses fresh evidence; it does not infer success.

## Task-specific SOW
- Put the task-specific SOW last when Cockpit controls prompt composition. Stable prefix carries role and output instructions.
- If a large or untrusted payload must be embedded, wrap only that payload in a descriptive XML tag such as `<untrusted_context>`.
- XML does not sanitize content, prevent prompt injection, authenticate data, or authorize actions.
- Do not pad prompts to reach cache thresholds.

Cockpit is orchestration-free: no route engine, dispatch function, queue, retry loop, state machine, or automatic invocation mechanism.

User instructions override the default workflow. They do not justify false claims, destructive action, or silently making consequential decisions.
