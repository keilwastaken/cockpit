---
name: cockpit-ideate
description: Use for unclear features, refactors, product direction, or tradeoff-heavy implementation choices before planning or coding.
---

# Cockpit Ideate

Use this skill when the user does not yet know exactly what they want, or when the task needs option-space exploration before implementation.

## Rules

- Read-only. Do not edit, write, or implement code.
- Make the option space clearer; do not force premature implementation.
- Ground claims in observed project structure when possible.
- Prefer concrete tradeoffs over vague brainstorming.
- Recommend a direction, but do not claim it is approved.
- The Oracle should present the recommendation and ask the human to choose or approve before planning/coding.

## Divergent passes

Explore the idea through these lenses:

### Pragmatic path

Find the smallest useful version. Prefer boring implementation, existing project patterns, limited scope, and fast validation.

### Ambitious path

Explore the higher-leverage version. Consider UX, architecture seams, future extensibility, and what the feature/refactor could become if done well.

### Risk and maintenance path

Stress-test the idea. Identify hidden complexity, migration hazards, regressions, edge cases, maintenance cost, and cheaper alternatives.

## Output

```markdown
# Ideation Result
## Recommended Direction
Recommend one direction for the human to choose, or say if the choice is genuinely unclear. Do not claim the direction is approved.
## Why
## Option Matrix
Compare options by user value, implementation cost, risk, reversibility, and validation clarity.
## Human Decision Needed
The exact choice or confirmation the Oracle should ask the human for before planning or codeflow.
## Recommended Next Step After Human Approval
A concrete next prompt for planning/codeflow, or questions to ask the human first.
## Keep / Drop / Defer
## Risks To Watch
## Raw Variant Summaries
### Pragmatic Path
### Ambitious Path
### Risk and Maintenance Path
```
