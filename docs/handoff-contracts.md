# Cockpit Handoff Contracts

Handoffs carry decisions and evidence between workflow stages without carrying the entire working context. Include only relevant sections and keep each section concise.

## Worker Request

```markdown
# Worker Request
## Goal
## Scope
## Required Evidence Or Edits
## Validation
## Stop Conditions
```

Send only applicable fields. Do not copy the full user prompt, bootstrap, plan, or raw logs into a handoff. Distinguish observed evidence from inference.

## Worker Evidence Packet

```markdown
# Worker Evidence Packet
## Status
## Findings
- finding — file, line, command, or URL evidence
## Commands And Outcomes
## Scope Deviations
## Gaps And Uncertainty
## Stop Reason
```

A worker packet is not approval, a final review verdict, or completion certification. The oracle may trust low-risk mechanical evidence when provenance is adequate, but must target-check consequential, contradictory, or incomplete claims.

Omit irrelevant sections rather than emitting empty boilerplate. Research Brief, Execution Result, and Review Result remain valid specialized forms.

## Research Brief

```markdown
# Research Brief
## Question
## Findings
- finding — evidence location
## Relevant Files
## Tests and Commands
## External References
## Gaps and Uncertainty
## Planning Implications
```

A finding must distinguish direct evidence from inference. Research does not choose unapproved product direction.

## Options Brief

```markdown
# Options Brief
## Decision
## Recommended Option
## Alternatives and Tradeoffs
## Risks
## Human Decision Needed
## Approved Next-Step Prompt
```

The final field is a proposed prompt, not evidence of approval.

## Implementation Plan

```markdown
# Implementation Plan
## Goal
## Approved Direction
## Assumptions
## Scope
### Files to Change
### Files to Avoid
## Steps
## Acceptance Criteria
## Validation
## Risks
## Stop Conditions
## Execution Handoff
```

Steps should be ordered, concrete, and independently verifiable where practical.

## Execution Result

```markdown
# Execution Result
## Summary
## Files Changed
## Validation Run
## Deviations
## Remaining Risks
## Review Tour
```

Report command outcomes honestly. A command that was not run is a validation gap, not a pass.

## Review Result

```markdown
# Review Result
## Verdict
## Feedback Weight
## Findings
## Plan Alignment
## Validation Assessment
## Route
## Fix or Replan Packet
```

Feedback weights:

- `none`: approve;
- `light`: one or two local corrections;
- `medium`: several local corrections while the plan remains valid;
- `heavy`: assumptions or structure require replanning;
- `blocker`: human decision or high-risk intervention required.

## Future-Work Packet

```markdown
# <Title>
## Outcome
## Why
## Scope
## Current Evidence
## Acceptance Criteria
## Validation
## Risks and Decisions
## Suggested Workflow
## Ready-to-Run Prompt
```
