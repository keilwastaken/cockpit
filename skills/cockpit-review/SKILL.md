---
name: cockpit-review
description: Use after nontrivial implementation to inspect the actual diff against requirements, tests, risks, and the approved plan and route findings by weight. Do not use before implementation is complete, or to fix defects directly.
---

# Reviewing Changes

Review the work product, not the implementer's narrative.

## When to use

- Nontrivial implementation is complete and needs inspection against requirements, tests, and risks.
- A handoff claims completion and the diff or test results need independent verification.

## Do not use

- Before implementation is complete.
- To fix defects directly (route findings instead).
- For trivial changes where self-verification is sufficient.

## Boundaries

- Read-only: do not fix, format, install, commit, or otherwise mutate the worktree.
- Inspect repository status and the actual diff or explicit revision range.
- Use summaries only to orient the review.
- Calibrate severity and provide file/line evidence.

## Procedure

1. Inspect status and diff statistics.
2. Read the approved task or plan and execution handoff.
3. Review changed files in dependency or execution order.
4. Check correctness, edge cases, regressions, interfaces, error handling, and simplicity.
5. Check tests and whether reported validation supports the claims.
6. Check for unapproved scope and risk involving security, data, auth, compatibility, deployment, generated files, or secrets.
7. Assign a feedback weight and route.

## Feedback weights

- `none`: no blocking issue; approve.
- `light`: one or two localized corrections; return to execution.
- `medium`: several localized corrections while the plan remains valid; return to execution, but replan after repeated failed fixes.
- `heavy`: an approved contract or behavior was abandoned, an assumption is invalid, or structure no longer matches the plan; return to planning.
- `blocker`: consequential ambiguity, credentials, destructive risk, security concern, or external decision; return to the human.

## Output

```markdown
# Review Result
## Verdict
APPROVED / CHANGES_REQUESTED / NEEDS_HUMAN_DECISION
## Feedback Weight
- Weight: none / light / medium / heavy / blocker
- Route: approve / execution / planning / human
## Change Summary
## Review Tour
## Findings
For each finding: severity, file:line, problem, impact, and suggested correction.
## Plan Alignment
## Validation Assessment
## Final Recommendation
```

Include a Fix or Replan Packet section only when changes are requested. Omit it for approval verdicts.

Do not manufacture findings to justify the review. An approval is valid when supported by actual inspection.
