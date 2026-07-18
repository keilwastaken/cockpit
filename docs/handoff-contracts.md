# Cockpit Handoff Contracts

Handoffs carry decisions and evidence between workflow stages without carrying the entire working context. Include only applicable sections and keep each section concise.

## Worker Request (Statement of Work)

```markdown
# Worker Request
## Goal
## Scope
## Required Evidence or Edits
## Validation
## Stop Conditions
```

- **Use only applicable sections.** Do not emit empty boilerplate.
- Do not copy the full user prompt, bootstrap, methodology, plan, or known context.
- Distinguish observed evidence from inference.
- When Cockpit controls prompt composition, the SOW is the final variable payload: stable role instructions precede it, and the task-specific content comes last.
- JSON Schema should be used only when the host actually enforces structured output. No current Cockpit worker-return path does, so no JSON schema is added.
- **Optional XML:** If a large or untrusted payload must be embedded, wrap only that payload in a descriptive XML tag such as `<untrusted_context>`. XML does **not** sanitize content, prevent prompt injection, authenticate data, or authorize actions — it is not a security boundary.
- Do not pad prompts to reach cache thresholds.

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
## Gaps and Uncertainty
## Planning Implications
```

Optional inline sections: Relevant Files, Tests and Commands, External References. Include them only when they add information not already present in cited findings. A finding must distinguish direct evidence from inference. Research does not choose unapproved product direction.

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

Steps should be ordered, concrete, and independently verifiable where practical. Omit irrelevant prose. The Execution Handoff must be compact — a summary with file list, commands, and known risks.

## Execution Result

```markdown
# Execution Result
## Summary
## Files Changed
## Validation Run
- <command>: <outcome>
## Deviations
## Remaining Risks
## Review Tour
```

Omit Deviations and Remaining Risks when none exist rather than emitting empty sections. Report command outcomes honestly. A command that was not run is a validation gap, not a pass.

## Review Result

```markdown
# Review Result
## Verdict
## Feedback Weight
## Findings
## Plan Alignment
## Validation Assessment
## Route
## Final Recommendation
```

Include a Fix or Replan Packet section only when changes are requested. Omit it for approval verdicts.

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
