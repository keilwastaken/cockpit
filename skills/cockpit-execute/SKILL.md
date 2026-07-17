---
name: cockpit-execute
description: Use when an approved concrete plan is ready for implementation and work must remain within explicit files, behavior, validation, and stop conditions. Do not use for exploration, planning, or design decisions.
---

# Executing Bounded Plans

Implement the approved plan. Execution is not a second design phase.

## When to use

- An approved concrete plan is ready for implementation.
- The plan names exact files, behavior, and validation.
- Work must remain within explicit scope, files, and stop conditions.

## Do not use

- For exploration, planning, or design decisions.
- When the task direction is ambiguous or unapproved.
- When requirements or validation criteria are unclear.

## Rules

- Read the complete plan before editing.
- Confirm the named files and assumptions exist.
- Follow project conventions and prefer the smallest correct diff.
- Modify only files required by the plan.
- Run the plan's validation and report actual outcomes.
- Keep discovery narrow and implementation-focused.
- Do not install dependencies, commit, push, deploy, migrate data, or perform destructive actions unless explicitly approved.

## Procedure

1. Establish a clean understanding of current status and relevant files.
2. Implement steps in plan order unless a dependency requires a documented adjustment.
3. Validate at the checkpoints specified by the plan.
4. For a local failure, make one focused correction and rerun the relevant validation.
5. Run final validation using fresh evidence.
6. Produce a compact review handoff.

## Stop conditions

Stop and report rather than improvising when:

- a required file, API, or pattern is absent;
- actual scope materially exceeds the plan;
- an assumption is false;
- requested behavior conflicts with tests or contracts;
- a new product, architecture, security, auth, persistence, migration, or deployment decision appears;
- focused corrections repeatedly fail.

Use `cockpit-plan` for structural replanning or ask the human for consequential decisions.

## Output

```markdown
# Execution Result
## Summary
## Files Changed
## Validation Run
- <command>: <outcome>
## Deviations
## Remaining Risks
## Review Tour
```

Never claim a command passed unless it was run and its result was observed.
