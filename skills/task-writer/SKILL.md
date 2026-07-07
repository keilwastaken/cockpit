---
name: cockpit-task-writer
description: Use to turn ideas, bugs, backlog items, or future work into durable markdown task packets for later agents.
---

# Cockpit Task Writer

Use this skill as a lightweight PM. It creates clear task plans that future agents can execute without rereading the original conversation.

## Rules

- Do not implement code.
- Do not refactor.
- Do not run mutating commands.
- Use local discovery only when it helps make the task concrete.
- Do not silently make product decisions; record decisions needed.
- Be practical and specific; do not over-plan.
- If writing a file, only create/update the specified task markdown file. Do not edit source files.

## Good inputs

- Feature idea.
- Bug report.
- Migration concept.
- Backlog item.
- Refactor proposal.
- Work that should be captured for a future agent or team member.

## Output

```markdown
# <Task / Migration / Feature Plan Title>
> **Status**: Draft / Planning / Ready
> **Date**: YYYY-MM-DD
> **Scope**: one-sentence boundary

## 1. Overview

## 2. Rationale
Use a table when helpful: Problem | Solution.

## 3. Scope & Boundaries
### In Scope
### Out of Scope

## 4. Current State / Context

## 5. Target State / Desired Outcome

## 6. Phased Task Plan
Use phase subsections with task tables: Task | Status | Notes.

## 7. Suggested Cockpit Routing
Recommended path(s): direct / instant / fast / normal / planner / research / reviewer / human

## 8. Acceptance Criteria
Use checkboxes.

## 9. Validation Plan

## 10. Risks & Open Questions
Use a table when helpful: Risk / Question | Impact | Mitigation / Notes.

## 11. Implementation Order

## 12. Ready-To-Run Agent Prompts
Include compact prompts for future agents.
```
