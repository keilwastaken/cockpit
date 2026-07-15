# Cockpit Skills

Cockpit is a portable, skills-first methodology for context-efficient and evidence-driven software work. Skill identifiers are namespaced so Cockpit can coexist with other skill packages.

## Workflow skills

- `using-cockpit` — select and compose the smallest safe workflow.
- `cockpit-work-mode` — choose direct work, exploration, research, bounded execution, parallel work, or a human decision.
- `cockpit-explore` — compare unresolved directions and stop for human approval.
- `cockpit-research` — gather compact read-only evidence.
- `cockpit-plan` — turn an approved direction into an executable plan.
- `cockpit-execute` — implement without silently redesigning or expanding scope.
- `cockpit-parallel` — divide genuinely independent work with explicit ownership.
- `cockpit-review` — inspect actual changes and route findings by weight.
- `cockpit-review-response` — verify and address feedback without blind compliance.
- `cockpit-verify` — require fresh evidence for completion claims.
- `cockpit-capture` — produce durable task packets without implementing them.

## Composition

A typical nontrivial flow is:

```text
choose mode -> explore if unclear -> human approval -> research if needed
            -> plan -> execute -> review -> respond -> verify
```

Tiny deterministic work can go directly from mode selection to action and verification. Harnesses without subagents can execute every stage sequentially.

See [`../docs/methodology.md`](../docs/methodology.md) and [`../docs/handoff-contracts.md`](../docs/handoff-contracts.md).
