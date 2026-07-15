---
name: cockpit-verify
description: Use immediately before claiming that work is complete, fixed, passing, or ready, especially after code changes or review corrections.
---

# Verifying Before Completion

Completion claims require fresh evidence.

## Rule

Do not say work is complete, tests pass, a bug is fixed, or behavior is correct unless you have just run or directly observed evidence that supports that exact claim.

## Procedure

1. Identify each claim you are about to make.
2. Map each claim to an observable check.
3. Run the narrow checks first, then the relevant broader suite when practical.
4. Read command exit status and meaningful output; do not infer success from silence or partial logs.
5. Inspect the final diff and repository status for accidental or unrelated changes.
6. Report failures, skipped checks, environmental blockers, and residual uncertainty explicitly.

Examples of claim-to-evidence mapping:

- “Tests pass” requires the reported test command to exit successfully.
- “Type-safe” requires the relevant type checker.
- “Bug fixed” requires reproduction or a regression test demonstrating the corrected behavior.
- “No unrelated changes” requires inspection of status and diff.
- “Ready to merge” requires project-required checks, not only a focused test.

## Output

Include a concise evidence block in the final response:

```markdown
## Verification
- <command or inspection>: passed / failed / not run — <relevant detail>
## Remaining Gaps
```

If evidence fails, the work is not complete. Route the failure to execution, planning, or the human instead of softening the claim.
