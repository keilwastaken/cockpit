---
name: cockpit-work-mode
description: Use when deciding whether a task should be handled directly, researched, explored with the human, planned, delegated, or split into parallel work. Do not use when the mode is self-evident from the task description.
---

# Choosing a Work Mode

Select the shortest safe path. Routing is a reasoned decision, not a file-count formula.

## When to use

- The task's work mode is not self-evident and needs reasoned selection.
- Multiple modes (direct, explore, research, plan, execute, parallel) are plausible and the shortest safe path must be determined.

## Do not use

- When the mode is obvious from the task description (handle directly).
- As ceremony when the direction, facts, and scope are already clear.

## Assess the task

Consider:

- **Clarity:** Is desired behavior unambiguous?
- **Evidence:** Are relevant files, tests, contracts, and external APIs known?
- **Scope:** How much discovery, editing, and validation is likely?
- **Risk:** Could this affect security, auth, persistence, migration, deployment, cost, or irreversible state?
- **Noise:** Will search output, logs, diffs, or failed attempts clutter the main context?
- **Independence:** Can work streams proceed without shared files or decisions?

## Select a mode

### Direct maneuver

Choose direct work when all are true:

- the outcome is explicit and low-risk;
- the relevant location is known or requires one narrow inspection;
- the change is small and deterministic;
- validation is obvious.

Do not use direct maneuver for ambiguous design, multi-file refactors, or tasks needing research.

Act directly, validate, and report. Do not delegate merely because delegation exists.

### Bounded execution

Choose bounded execution when direction is approved and the task needs targeted discovery, several edits, tests, or context isolation. Write a compact plan first when sequencing or scope is not already explicit.

When the plan is low-risk, independently executable, and a host-native worker is available, normally dispatch it to the native cockpit-executor agent. Otherwise execute it sequentially under the same boundaries.

Do not use bounded execution for exploration, open-ended research, or when the direction is not yet approved.

### Explore options

Use `cockpit-explore` when the request contains unresolved behavior, tradeoffs, architecture, migration strategy, or "make this better" ambiguity. Stop for human approval before implementation.

Do not use explore for implementation, factual research, or when the direction is already approved.

### Research

Use `cockpit-research` when important facts are unknown or claims need evidence. Research can precede exploration or planning.

When research is broad or noisy and a host-native worker is available, normally dispatch it to `cockpit-research`. Keep narrow lookups direct when the handoff would cost more than the isolation saves.

Do not use research for design decisions, implementation, or when the facts are already known.

### Parallel work

Use `cockpit-parallel` only when tasks have explicit independent ownership, no shared mutable files, and no unresolved shared decision.

Do not use parallel for tasks with ordering dependencies, shared files, or interdependent decisions.

### Human decision

Return directly to the human when choices are consequential, risky, irreversible, or preference-dependent. Present options and a recommendation rather than guessing.

Do not proceed with planning or implementation when the decision is outside the approved scope.

## Output

State the decision compactly when useful:

```markdown
## Work Mode
- Mode: direct / explore / research / plan-and-execute / parallel / human-decision
- Why:
- Next step:
- Stop condition:
```

Do not emit routing commentary when the mode is obvious and doing so would add noise.
