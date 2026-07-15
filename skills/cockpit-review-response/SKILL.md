---
name: cockpit-review-response
description: Use when review feedback arrives and must be verified, clarified, fixed, rejected with evidence, or escalated without blindly accepting it.
---

# Responding to Review

Treat review as technical input to evaluate, not an instruction to obey performatively.

## Procedure

1. Read all findings before changing anything.
2. Restate each actionable issue in technical terms.
3. Verify the finding against the diff, code, requirements, and tests.
4. Classify it:
   - valid and local;
   - valid but structural;
   - unclear and needing clarification;
   - incorrect or out of scope.
5. For valid local issues, make the smallest correction and rerun relevant validation.
6. For structural issues, stop execution and return a replan packet.
7. For incorrect feedback, explain briefly with concrete evidence.
8. Request human input when disagreement depends on preference, risk tolerance, or an unapproved requirement.

## Boundaries

- Do not make unrelated cleanup while addressing feedback.
- Do not claim agreement before verifying the issue.
- Do not reject feedback defensively or based only on the original summary.
- Respect the plan's fix budget; repeated failures require replanning.

## Output

```markdown
# Review Response
## Assessment
- <finding>: accept / replan / clarify / reject — <evidence>
## Changes Made
## Validation Run
## Remaining Disagreement or Risk
## Next Route
approve / review-again / planning / human
```
