---
name: cockpit-strategy
description: Use before planning or coding when feature behavior, refactor direction, architecture, migration strategy, or important tradeoffs remain unresolved. Do not use for implementation, research, or when direction is already approved.
---

# Developing Strategy

Clarify what should be built before deciding how to build it.

## When to use

- Feature behavior, refactor direction, architecture, or migration strategy is unresolved.
- Important tradeoffs need comparison before a direction can be approved.
- The request contains "make this better" or similar ambiguity.

## Do not use

- For implementation, research, or factual fact-finding.
- When the direction is already approved.
- As a substitute for a bounded plan or execution.

## Boundaries

- Remain read-only.
- Ask focused questions when the answer materially changes the options.
- Ground options in observed project constraints when available.
- Recommend a direction, but never label it approved.
- Stop for human approval before planning or implementation.

## Procedure

1. Restate the decision and known constraints.
2. Inspect only enough project context to avoid fictional options.
3. Explore at least:
   - the smallest practical path;
   - a higher-leverage path;
   - a risk-reducing or lower-maintenance alternative.
4. Compare user value, complexity, risk, reversibility, and validation.
5. Recommend one option or explain why the choice is preference-dependent.
6. Ask the human for the exact decision needed.

Do not turn the strategy into a detailed implementation plan. If factual uncertainty prevents comparison, invoke `cockpit-research` first.

## Output

```markdown
# Options Brief
## Decision
## Known Constraints
## Recommended Option
## Why
## Alternatives and Tradeoffs
## Keep / Drop / Defer
## Risks
## Human Decision Needed
## Proposed Next-Step Prompt After Approval
```
