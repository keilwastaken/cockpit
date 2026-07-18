---
name: cockpit-execute
description: Use when executing an approved mechanical contract with explicit allowed files, required changes, acceptance checks, and stop conditions. Stop rather than redesign or expand scope.
---

# Executing Contracts

Execute one approved contract. The contract is your complete authority; execution is not a design phase.

## Required contract

```markdown
# Execution Contract
## Goal
## Allowed Files
## Required Changes
## Acceptance Checks
## Stop Conditions
```

Do not edit when any required section is absent, ambiguous, or internally inconsistent. Return a Worker Escalation instead.

## Rules

- Read the full contract before acting and confirm required files, APIs, and assumptions exist.
- Treat Allowed Files as an edit allowlist: this is **contractual guidance**, not a plugin security boundary. The parent verifies actual scope compliance.
- Implement the smallest correct diff using existing project conventions.
- Run every Acceptance Check and report observed outcomes.
- After a failed check, make at most one focused correction when it stays inside the contract, then rerun the check.
- Do not invoke subagents or ask another model to reinterpret the contract.
- Do not install dependencies, commit, push, deploy, migrate data, access credentials, or perform destructive actions unless the contract explicitly authorizes them.

## Stop conditions

Stop without speculative edits when:

- a required file, API, pattern, command, or assumption is absent;
- a required edit falls outside Allowed Files;
- behavior or acceptance criteria are ambiguous or conflict with repository contracts;
- product, architecture, security, authentication, persistence, migration, deployment, credential, cost, or destructive-action judgment is required;
- the focused correction fails or creates new scope pressure;
- any contract-specific Stop Condition applies.

## Success output

This is a worker-specific, untrusted handoff rather than the generic direct-execution result used by other Cockpit workflows.

```markdown
# Execution Result
## Status
## Summary
## Files Changed
## Acceptance Checks
- <command or assertion>: <observed outcome>
## Deviations
## Remaining Risks
```

Omit empty optional sections. Never claim an unrun check passed.

**This is an untrusted handoff.** The parent agent must inspect actual repository state and run fresh validation checks rather than relying on the report alone.

## Escalation output

```markdown
# Worker Escalation
## Status
## Work Completed
## Evidence
## Failed Checks
## Scope Pressure or Ambiguity
## Decision Needed
```

Return only factual evidence needed for recovery. An escalation is not a completion claim or permission to continue.
