# Cockpit Skills

Cockpit is an OpenCode-native, oracle-and-worker methodology for context-efficient and evidence-driven software work. The reading agent is the oracle; hands workers and reasoning specialists provide bounded support. Skill identifiers are namespaced so Cockpit can coexist with other skill packages.

## Workflow skills

- `using-cockpit` — oracle entry policy: selects the shortest safe workflow, retains decisions, certifies completion.
- `cockpit-work-mode` — resolve ambiguous mode choices when the bootstrap does not make the path obvious.
- `cockpit-strategy` — compare unresolved directions and stop for human approval; used by the `cockpit-strategist` agent.
- `cockpit-research` — gather compact read-only evidence (hands worker).
- `cockpit-plan` — turn an approved direction into an executable plan.
- `cockpit-execute` — implement without silently redesigning or expanding scope (hands worker).
- `cockpit-parallel` — divide genuinely independent work with explicit ownership.
- `cockpit-review` — inspect actual changes and route findings by weight.
- `cockpit-review-response` — verify and address feedback without blind compliance.
- `cockpit-verify` — require fresh evidence for completion claims.
- `cockpit-capture` — produce durable task packets without implementing them.

## Composition

The oracle integrates output from direct work, hands workers, or reasoning specialists, then routes to a human decision or certified completion.

See [`../docs/methodology.md`](../docs/methodology.md) and [`../docs/handoff-contracts.md`](../docs/handoff-contracts.md).
