<img src="./icon.png" width="150" align="right" alt="Cockpit Logo">

# Cockpit

Cockpit is a portable, skills-first methodology for context-efficient and evidence-driven software development with coding agents.

It helps an agent choose the smallest safe workflow, resolve ambiguity before coding, research unknowns, write bounded plans, execute without silent scope expansion, route review feedback, and verify before claiming completion.

## Core workflow

```text
choose mode -> explore if unclear -> human approval -> research if needed
            -> plan -> execute -> review -> respond -> verify
```

Tiny deterministic changes skip directly to action and verification. Nontrivial work uses compact evidence handoffs instead of carrying raw searches, logs, and failed attempts through the primary conversation.

## Principles

- Context is a budget.
- Use the smallest sufficient workflow.
- Recommendation is not human approval.
- Evidence precedes commitment.
- Plans are bounded contracts.
- Executors stop rather than silently redesign.
- Review routes local, structural, and human decisions differently.
- Fresh verification precedes completion claims.

Read [`docs/methodology.md`](docs/methodology.md) and [`docs/handoff-contracts.md`](docs/handoff-contracts.md).

## Skills

Canonical behavior lives in namespaced Markdown skills under [`skills/`](skills/). The entry skill is `using-cockpit`; workflow skills use the `cockpit-*` namespace so Cockpit can coexist with other skill packages.

## OpenCode

The thin OpenCode adapter registers the skills and bootstrap. It adds two commands:

```text
/cockpit-setup   # choose reasoning and hands models using scrollable lists
/cockpit-doctor  # diagnose skills, models, agents, and config read-only
```

See [`docs/README.opencode.md`](docs/README.opencode.md).

## Pi and other harnesses

`package.json` exposes the same canonical skills through Pi's native package metadata. Other harnesses should register `skills/` and inject `using-cockpit`; adapters must not reimplement workflow policy.

## Behavioral evaluations

Cockpit includes eight disposable behavioral scenarios for comparing strong, cheap, and local models:

```bash
npm run eval
npm run eval -- --model openai/gpt-5.6-luna --scenario tiny-direct
```

See [`evals/README.md`](evals/README.md). Model calls run only when `--model` is supplied.

## Development

```bash
npm test
npm run check
npm pack --dry-run
```

The core has no runtime dependencies or build step.

## License

[MIT](LICENSE)
