---
name: cockpit-capture
description: Use when an idea, bug, migration, refactor, or deferred concern should become a durable task packet for a future agent without implementing it now.
---

# Capturing Future Work

Create a self-contained task packet that remains useful after the original conversation is gone.

## Boundaries

- Do not implement or refactor source code.
- Use only enough read-only discovery to make the task concrete.
- Record unresolved product or technical decisions rather than silently choosing.
- If writing a file, modify only the requested planning document.
- Avoid speculative detail that has no evidence.

## Procedure

1. State the desired outcome and why it matters.
2. Capture current evidence and relevant locations.
3. Define in-scope and out-of-scope work.
4. Write observable acceptance criteria and a validation approach.
5. Record risks, dependencies, and decisions still needed.
6. Recommend the appropriate future workflow.
7. End with a prompt a future agent can execute without this conversation.

## Output

```markdown
# <Task Title>
> Status: Draft / Ready / Blocked
> Scope: <one-sentence boundary>

## Outcome
## Why
## Scope
### In Scope
### Out of Scope
## Current Evidence
## Acceptance Criteria
## Validation
## Risks, Dependencies, and Decisions
## Suggested Workflow
## Ready-to-Run Prompt
```
