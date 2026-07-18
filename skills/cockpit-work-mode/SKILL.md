---
name: cockpit-work-mode
description: Use when deciding whether a task should be handled directly, researched, explored with the human, planned, delegated, or split into parallel work. Do not use when the mode is self-evident from the task description.
---

# Choosing a Work Mode

Select the shortest safe path when the bootstrap does not make it obvious.

## When to use

- The task's work mode is not self-evident and needs reasoned selection.
- Multiple modes are plausible and the shortest safe path must be determined.

## Do not use

- When the mode is obvious from the task description.
- As ceremony when the direction, facts, and scope are already clear.

## Assess the task

Consider:

- **Clarity:** Is desired behavior unambiguous?
- **Evidence:** Are relevant files, tests, contracts, and external APIs known?
- **Scope:** How much discovery, editing, and validation is likely?
- **Risk:** Could this affect security, auth, persistence, migration, deployment, cost, or irreversible state?
- **Noise:** Will search output, logs, diffs, or failed attempts clutter the main context?
- **Independence:** Can work streams proceed without shared files or decisions?

## Context-savings test

Delegate to a hands worker only when expected isolation savings exceed the request, handoff, and reintegration overhead. Narrow lookups stay direct. Consequential severity judgment and narrow security review remain with the oracle by default.

## Mode selection

### Direct maneuver — all must be true
- Outcome explicit and low-risk; location known or one narrow inspection; change small and deterministic; validation obvious.

### Bounded execution — direction approved
- Keep small deterministic changes direct. Delegate to built-in `general` with instructions to load `cockpit-execute` only when targeted discovery, multiple noisy edits, or context isolation is likely to repay the handoff.

### Explore options — direction unresolved
- Behavior, tradeoffs, architecture, or migration strategy is ambiguous. Stop for human approval before implementation.

### Research — facts unknown
- Read-only evidence gathering. Delegate broad/noisy research to built-in `explore`; keep narrow lookups direct.

### Parallel work — genuinely independent
- Explicit ownership, no shared mutable files, no unresolved shared decisions.

### Human decision — consequential ambiguity
- Choices are risky, irreversible, or preference-dependent. Present options and a recommendation.

## Delegation boundaries

- **Hands workers:** built-in `explore` gathers evidence; built-in `general` performs approved bounded execution under `cockpit-execute`. They do not choose direction, redesign, or assign severity.
- **Reasoning specialists** (strategist, planner, reviewer): independent analysis only. The oracle integrates their output and retains approval, severity, and final-claim judgment.
- **Mechanical evidence collection** for review or verification may be delegated when noisy. The oracle decides whether the collected evidence proves the claim.

## Output

```markdown
## Work Mode
- Mode: direct / explore / research / plan-and-execute / parallel / human-decision
- Why:
- Next step:
- Stop condition:
```

Do not emit routing commentary when the mode is obvious.
