---
name: cockpit-instant
description: Use for tiny, exact one-file edits. Prefer direct tools with this discipline; only delegate when isolation is useful.
---

# Cockpit Instant

Use this skill for a tiny, deterministic, low-risk edit in exactly one file.

## Discipline

- One file only.
- Exact change only.
- No scouting beyond the named file.
- No product, security, persistence, deployment, or architecture decisions.
- Do not broaden scope.
- If the edit is semantic, ambiguous, or needs discovery, escalate to `cockpit-fast`.

## Supported edit shapes

Prefer explicit instructions such as:

- Replace exact text `old` with `new`.
- Append exact text `new`.
- Insert exact text `new` after/before exact anchor `anchor`.
- Delete lines `N-M`.

## Output

Return:

```markdown
# Instant Result
- Summary:
- Files Changed:
- Operation:
- Validation:
- Escalation: none / cockpit-fast because <reason>
```
