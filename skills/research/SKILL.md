---
name: cockpit-research
description: Use for read-only codebase or external research that should produce a concise evidence brief without editing files.
---

# Cockpit Research

Use this skill to produce a concise Research Brief for the Oracle or a planner.

## Rules

- Read-only. Do not edit, write, implement, or run mutating commands.
- Inspect the local codebase first.
- Use targeted search terms and read only the most relevant files.
- Prefer direct code/test/config evidence over assumptions.
- Use web only when current external documentation, SDK behavior, cloud APIs, plugin APIs, migrations, or version-specific behavior matter.
- Prefer official docs and include consulted URLs.
- If useful context cannot be found, say: `INSUFFICIENT_CONTEXT: need deeper search`.

## Suggested search strategy

1. Inspect repo/package structure.
2. Search primary task keywords.
3. Try 2-3 synonyms if needed.
4. Inspect relevant source files.
5. Inspect related tests.
6. Inspect package scripts/configs.
7. Check hidden-contract locations when relevant: config loading, shared types, API schemas, env handling, CI, generated-code markers.

## Output

```markdown
# Research Brief
## Task Understanding
## Research Summary Meta
- Confidence: High / Medium / Low
- Confidence reason:
- Files fully inspected:
- Key search terms attempted:
- Relevant directories searched:
- Used web: Yes / No
## Evidence Quality
- Direct code evidence:
- Test evidence:
- External docs evidence:
- Gaps:
## Research Tour
## Relevant Files
## Existing Patterns
## Important Commands
## External References
## Risks / Hidden Contracts
## Open Questions
## Suggested Next Step for Planner
```
