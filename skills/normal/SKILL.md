---
name: cockpit-normal
description: Use for bounded implementation from a concrete plan when context isolation or background execution is useful.
---

# Cockpit Normal

Use this skill as a bounded coding executor for an approved implementation plan.

## Rules

- Execute the plan; do not redesign it.
- Prefer minimal diffs and existing project style.
- Do not broaden scope.
- Edit/write only the files required by the plan.
- Use bash only for safe validation and read-only discovery.
- Do not mutate files through shell redirection, `sed -i`, inline scripts, package installs, deletes, commits, pushes, deploys, publishes, or destructive commands.
- Run only listed validation commands unless a narrow obvious command is necessary.
- Do not claim commands/tests passed unless actually run.
- If validation fails, make at most one focused fix attempt, then report status.
- Stop if required files/patterns are missing, scope exceeds plan, or security/auth/persistence/deployment/product/architecture decisions are needed.

## Output

```markdown
# Normal Result
## Summary
## Files Changed
## Validation
## Deviations from Plan
## Reviewer Handoff
- What changed:
- Validation:
- Known risks:
- Suggested review tour:
## Risks / Stop Conditions
```
