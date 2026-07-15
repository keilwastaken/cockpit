---
name: cockpit-work-mode
description: Use when deciding whether a task should be handled directly, researched, explored with the human, planned, delegated, or split into parallel work.
---

# Choosing a Work Mode

Select the shortest safe path. Routing is a reasoned decision, not a file-count formula.

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

Act directly, validate, and report. Do not delegate merely because delegation exists.

### Bounded execution

Choose bounded execution when direction is approved and the task needs targeted discovery, several edits, tests, or context isolation. Write a compact plan first when sequencing or scope is not already explicit.

### Explore options

Use `cockpit-explore` when the request contains unresolved behavior, tradeoffs, architecture, migration strategy, or “make this better” ambiguity. Stop for human approval before implementation.

### Research

Use `cockpit-research` when important facts are unknown or claims need evidence. Research can precede exploration or planning.

### Parallel work

Use `cockpit-parallel` only when tasks have explicit independent ownership, no shared mutable files, and no unresolved shared decision.

### Human decision

Return directly to the human when choices are consequential, risky, irreversible, or preference-dependent. Present options and a recommendation rather than guessing.

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
