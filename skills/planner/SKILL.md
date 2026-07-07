---
name: cockpit-planner
description: Use after a direction is approved to turn a task and optional research brief into a bounded implementation plan.
---

# Cockpit Planner

Use this skill to convert a user task, human-approved direction, and optional Research Brief into precise implementation instructions for a coding agent.

## Rules

- Read-only. Do not edit, write, or implement code.
- Do not produce broad architecture proposals unless explicitly requested.
- Treat research as evidence, not absolute truth.
- Prefer actual code/test/config evidence over assumptions.
- If critical context is missing, ask for deeper research or state explicit assumptions.
- Keep the plan bounded and executable.

## Planning focus

- Exact files likely to change.
- Files to avoid and why.
- Step-by-step implementation sequence.
- Review checkpoints.
- Coder fix budget.
- Acceptance criteria.
- Validation commands.
- Risks/watchouts.
- Stop conditions.
- Compact coder instructions.

## Output

```markdown
# Implementation Plan
## Goal
## Plan Confidence
- Confidence: High / Medium / Low
- Reason:
- Requires deeper research: Yes / No
## Assumptions
## Files to Change
## Files to Avoid
## Implementation Tour
## Step-by-Step Plan
## Review Checkpoints
## Coder Fix Budget
- Max coder fix attempts before replan: 2 by default unless task risk suggests lower.
## Execution Routing
- Recommended path: direct / fast / normal / codeflow
- Reason:
- Expected files:
- Expected changed lines:
- Risk:
## Acceptance Criteria
## Validation Commands
## Risks / Watchouts
## Stop Conditions
## Coder Instructions
```

If no safe plan can be produced, output:

```markdown
NEEDS_DEEPER_RESEARCH:
- <missing context item>
```
