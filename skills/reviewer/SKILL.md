---
name: cockpit-reviewer
description: Use for read-only review of nontrivial code changes, current diffs, or git ranges with calibrated feedback weight.
---

# Cockpit Reviewer

Use this skill to review completed agent or human work. Review the work product against the task/plan, not the agent's thought process.

## Rules

- Read-only. Do not edit, write, format, generate, install, commit, push, deploy, or mutate the working tree/index/environment.
- If no explicit git range is provided, review the current working-tree diff.
- Start with `git status --short` and `git diff --stat`, then inspect relevant diffs.
- If a base/head range is provided, review that range with `git diff --stat BASE..HEAD` and `git diff BASE..HEAD`.
- Prefer diff hunks, grep snippets, and targeted reads for context.
- Do not approve without inspecting the diff.
- Calibrate severity. Do not mark nitpicks as critical.
- Give file/line evidence where possible.

## What to check

- Plan/requirement alignment.
- Correctness, edge cases, regressions, type/runtime errors.
- Tests/validation quality and whether reported validation actually ran.
- Code quality, maintainability, error handling, and simplicity.
- Risk: security, data loss, auth, persistence, deployment, compatibility, generated/secret files.

## Feedback weight

- `none`: no blocking issues; approve.
- `light`: 1-2 localized fixes; send directly to coder.
- `medium`: several localized issues but plan remains valid; send to coder unless fix budget is exhausted.
- `heavy`: many issues, plan mismatch, structural problem, or strategy likely wrong; send back to planner.
- `blocker`: human decision needed due to ambiguity, high risk, credentials/external dependency, security/data-loss/deployment concern, or unclear product requirement.

## Routing policy

- `none` -> approve
- `light` -> coder_fix
- `medium` -> coder_fix unless fix attempts >= 2, then planner_revision
- `heavy` -> planner_revision
- `blocker` -> human_decision

## Output

```markdown
# Review Result
## Verdict
APPROVED / CHANGES_REQUESTED / NEEDS_HUMAN_DECISION
## Feedback Weight
- Weight: none / light / medium / heavy / blocker
- Reason:
- Recommended route: approve / coder_fix / planner_revision / human_decision
## Cockpit Routing Signal
- Feedback weight:
- Critical count:
- Important count:
- Minor count:
- Suggested next delegate: none / normal / planner / human
- Escalate after coder fix attempt #: 2 for medium, immediately for heavy/blocker
## Change Summary
## Review Tour
Recommended order to inspect changed files, with one-line reason for each.
## Strengths
## Issues
### Critical
### Important
### Minor
For each issue include File:line, Problem, Why it matters, Suggested fix.
## Plan Alignment
- Matches plan: Yes / No / Partial
- Deviations:
## Validation Assessment
- Commands reported:
- Commands reviewer verified:
- Gaps:
## Fix Packet for Coder
Only include actionable fix steps if weight is light or medium; otherwise say N/A.
## Replan Packet for Planner
Only include failed assumptions/reconsiderations if weight is heavy; otherwise say N/A.
## Human Decision Needed
Only include decision/options/risk if weight is blocker; otherwise say N/A.
## Final Recommendation
```
