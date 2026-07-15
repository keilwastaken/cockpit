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
3. Give each worker its goal, constraints, acceptance criteria, validation, and required handoff.
4. Tell workers not to broaden scope or resolve shared decisions independently.
5. Dispatch concurrently when the harness supports it; otherwise execute packets sequentially with the same boundaries.
6. Collect compact results rather than raw transcripts.
7. Integrate results, inspect the combined diff, run shared validation, and review interaction risks.

## Stop conditions

Stop parallel execution when workers discover shared-file edits, incompatible assumptions, overlapping interfaces, or a missing common decision. Reconcile centrally before continuing.

## Work packet

```markdown
## Parallel Work Packet
- Outcome:
- Owned files/subsystem:
- Shared read-only context:
- Must not change:
- Acceptance criteria:
- Validation:
- Stop conditions:
- Required handoff:
```
