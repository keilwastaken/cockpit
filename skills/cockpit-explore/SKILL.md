---
name: cockpit-explore
description: Use before planning or coding when feature behavior, refactor direction, architecture, migration strategy, or important tradeoffs remain unresolved.
---

# Exploring Options

Clarify what should be built before deciding how to build it.

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

Do not turn the exploration into a detailed implementation plan. If factual uncertainty prevents comparison, invoke `cockpit-research` first.

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
