---
name: cockpit-parallel
description: Use when two or more work streams are genuinely independent and can be assigned explicit ownership without shared files, ordering dependencies, or unresolved decisions.
---

# Dispatching Parallel Work

Parallelism reduces elapsed time only when coordination costs and merge risk remain low.

## Preconditions

Parallelize only when every work stream has:

- an independent outcome;
- explicit file or subsystem ownership;
- no shared mutable files;
- no dependency on another stream's result;
- an approved common direction;
- its own validation and stop conditions.

If these conditions are false, sequence the work or split it differently.

## Procedure

1. Identify the independent work packets.
2. Assign exclusive ownership and shared read-only context.
3. Give each worker its goal, scope, required evidence or edits, validation, and stop conditions.
4. Tell workers not to broaden scope or resolve shared decisions independently.
5. Dispatch concurrently when the harness supports it; otherwise execute packets sequentially with the same boundaries.
6. Dispatch using the host's native fan-out mechanism (e.g. OpenCode's Task tool for concurrent agent calls). Do not build a custom parallelizer, queue, or state machine.
7. Join every dispatched task and await all task returns before proceeding to combined inspection; the last-launched or first-returned task is not a completion signal.
8. Collect compact results rather than raw transcripts.
9. Integrate results, inspect the combined diff, run shared validation, and review interaction risks.

## Stop conditions

Stop parallel execution when workers discover shared-file edits, incompatible assumptions, overlapping interfaces, or a missing common decision. Reconcile centrally before continuing.

## Work packet

```markdown
## Parallel Work Packet
### Goal
### Scope
### Required Evidence or Edits
### Validation
### Stop Conditions
```
