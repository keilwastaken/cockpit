---
name: cockpit-research
description: Use when implementation or planning depends on unknown codebase behavior, tests, configuration, external APIs, or version-specific facts.
---

# Researching Codebases

Produce a compact evidence brief. Research establishes facts and uncertainty; it does not implement or silently choose product direction.

## Boundaries

- Read-only: do not edit files or run mutating commands.
- Start with local code, tests, configuration, and package metadata.
- Use current official external documentation only when external behavior matters.
- Distinguish direct evidence, inference, and unresolved gaps.
- Prefer targeted searches and reads over exhaustive exploration.

## Procedure

1. Define the question the next stage needs answered.
2. Inspect repository structure and search primary terms plus useful synonyms.
3. Read the smallest set of relevant source, tests, configuration, and contracts.
4. Inspect hidden-contract locations when relevant: shared types, schemas, environment loading, CI, generated markers, migrations, and package versions.
5. Consult external documentation only for current or version-sensitive contracts.
6. Record evidence locations and contradictions.
7. Stop when additional searching is unlikely to change the planning decision.

If key evidence remains unavailable, say `INSUFFICIENT_CONTEXT` and specify what is missing. Do not fill gaps with plausible inventions.

## Output

```markdown
# Research Brief
## Question
## Findings
- <finding> — <file:line, command, test, or URL evidence>
## Relevant Files
## Existing Patterns and Contracts
## Tests and Commands
## External References
## Gaps and Uncertainty
## Planning Implications
```

Keep raw logs and long excerpts out of the handoff.
