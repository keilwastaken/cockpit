---
name: cockpit-research
description: Use when implementation or planning depends on unknown codebase behavior, tests, configuration, external APIs, or version-specific facts. Do not use for implementation, design decisions, or planning.
---

# Researching Codebases

Produce a compact evidence brief. Research establishes facts and uncertainty; it does not implement or silently choose product direction.

## When to use

- Planning or implementation depends on unknown codebase behavior, tests, configuration, external APIs, or version-specific facts.
- A claim or assumption needs evidence before it can inform a plan.
- Broad or noisy search is needed and isolation would save primary context.

## Do not use

- For implementation, editing, or design decisions.
- When the relevant facts are already known.
- As a substitute for exploration of ambiguous direction or tradeoffs.

## Boundaries

- Read-only: do not edit files or run mutating commands.
- Start with local code, tests, configuration, and package metadata.
- Use current official external documentation only when external behavior matters.
- Distinguish direct evidence, inference, and unresolved gaps.
- Prefer targeted searches and reads over exhaustive exploration.
- For broad or noisy research, consider delegating to built-in `explore` or a native subagent to preserve primary context.

## Procedure

1. Define the question the next stage needs answered.
2. Inspect repository structure and search primary terms plus useful synonyms.
3. Read the smallest set of relevant source, tests, configuration, and contracts.
4. Inspect hidden-contract locations when relevant: shared types, schemas, environment loading, CI, generated markers, migrations, and package versions.
5. Consult external documentation only for current or version-sensitive contracts.
6. Record evidence locations and contradictions.
7. Stop when additional searching is unlikely to change the planning decision.
8. Include Relevant Files, Tests and Commands, and External References sections only when they add information not already present in cited findings.

If key evidence remains unavailable, say `INSUFFICIENT_CONTEXT` and specify what is missing. Do not fill gaps with plausible inventions.

## Output

```markdown
# Research Brief
## Question
## Findings
- <finding> — <file:line, command, test, or URL evidence>
## Gaps and Uncertainty
## Planning Implications
```

Sections such as Relevant Files, Tests and Commands, and External References are optional — include them only when they add information not already present in cited findings. Keep raw logs and long excerpts out of the handoff.
