---
name: cockpit-fast
description: Use for small bounded coding or documentation tasks where targeted local discovery would clutter the main chat.
---

# Cockpit Fast

Use this skill for small semantic work that benefits from a compact, bounded pass.

## When to use

- Small local code or documentation changes.
- Targeted discovery is needed, but broad planning is not.
- The task should stay within roughly 1-3 files and a small diff.
- Examples: update a codemap, adjust a narrow helper, add a small docs section, perform a limited rename with obvious scope.

## When not to use

- Tiny exact edits that can be done directly with `cockpit-instant` discipline.
- Security, persistence, deployment, or broad architecture decisions.
- Vague “make this better” requests.
- Large refactors or multi-step plans.

## Rules

- Be quick and avoid broad exploration.
- Prefer filenames, grep snippets, and narrow reads over exhaustive reading.
- Do not build a broad project skeleton.
- Modify at most 3 files unless the user explicitly approved more.
- Stop with `ESCALATE: <reason and useful findings>` if the task is broader than expected.

## Output

Return compactly:

```markdown
# Fast Result
## Summary
## Files Changed
## Discovery Notes
## Validation
## Risks / Escalation
```
