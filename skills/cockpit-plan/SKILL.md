---
name: cockpit-plan
description: Use after direction is approved when nontrivial work needs an executable implementation plan with exact scope, validation, risks, and stop conditions.
---

# Writing Bounded Plans

Convert an approved direction and available evidence into a plan another coding agent can execute without redesigning the task.

## Preconditions

- The intended behavior or direction is approved.
- Consequential open decisions have answers.
- Relevant evidence exists, or assumptions are explicitly identified.

If these are false, return to `cockpit-explore`, `cockpit-research`, or the human.

## Boundaries

- Remain read-only.
- Verify critical assumptions with narrow inspection.
- Do not broaden the approved outcome.
- Prefer existing project patterns and minimal diffs.
- Make uncertainty and stop conditions explicit.

## Procedure

1. State the outcome and approved direction.
2. Identify exact files likely to change and files that must remain untouched.
3. Order implementation steps so each has a clear purpose and verification point.
4. Include tests with the behavior they establish, not merely “add tests.”
5. Define observable acceptance criteria.
6. List commands that provide completion evidence.
7. Identify risks, assumptions, and conditions that invalidate the plan.
8. End with a compact execution handoff.

Use code snippets only where an interface or subtle algorithm must be unambiguous. Do not bury decisions in pseudo-code.

## Output

```markdown
# Implementation Plan
## Goal
## Approved Direction
## Confidence and Assumptions
## Scope
### Files to Change
### Files to Avoid
## Implementation Steps
## Review Checkpoints
## Acceptance Criteria
## Validation
## Risks
## Stop Conditions
## Execution Handoff
```

If no safe plan can be produced:

```markdown
NEEDS_RESEARCH_OR_DECISION:
- <missing evidence or decision>
```
