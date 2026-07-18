<img src="./icon.png" width="150" align="right" alt="Cockpit Logo">

# Cockpit

Cockpit is an OpenCode-native, skills-first methodology for context-efficient and evidence-driven software development with coding agents.

The reading agent is the oracle: it selects the shortest safe workflow, retains consequential decisions, and certifies completion. Hands workers and reasoning specialists provide bounded evidence or analysis without replacing oracle judgment.

## Core workflow

```text
request -> oracle decision -> direct / worker / specialist -> oracle integration
                                                          -> human decision or certified result
```

Tiny deterministic changes skip directly to action and verification. Nontrivial work uses compact evidence handoffs instead of carrying raw searches, logs, and failed attempts through the primary conversation.

## Principles

- The oracle selects the shortest safe workflow.
- Context is a budget; delegate when isolation saves more than the handoff costs.
- Recommendation is not human approval.
- Evidence precedes commitment; distinguish facts from inference.
- Plans are bounded contracts with validation and stop conditions.
- Executors stop rather than silently redesign.
- The oracle retains severity, escalation, and completion judgment.
- Fresh verification precedes completion claims.

Read [`docs/methodology.md`](docs/methodology.md) and [`docs/handoff-contracts.md`](docs/handoff-contracts.md).

## Skills

Canonical behavior lives in namespaced Markdown skills under [`skills/`](skills/). The entry skill is `using-cockpit`; workflow skills use the `cockpit-*` namespace so Cockpit can coexist with other skill packages.

## Adapter

The OpenCode adapter registers the skills and bootstrap. It is generated from [`scripts/adapter-definition.mjs`](scripts/adapter-definition.mjs).

```bash
npm run generate         # regenerate the OpenCode plugin
npm run check:generated  # fail if the generated plugin is stale
```

It adds two commands:

```text
/cockpit-setup   # choose reasoning and hands models using scrollable lists
/cockpit-doctor  # diagnose skills, models, agents, and config read-only
```

See [`docs/README.opencode.md`](docs/README.opencode.md).

## Behavioral evaluations

Cockpit includes disposable behavioral scenarios for comparing strong, cheap, and local models:

```bash
npm run eval
npm run eval -- --model openai/gpt-5.6-luna --scenario tiny-direct
```

See [`evals/README.md`](evals/README.md). Model calls run only when `--model` is supplied.

## Development

```bash
npm test              # Run all tests (including adapter freshness)
npm run check         # Test + adapter freshness check
npm run generate      # Regenerate the OpenCode adapter
npm run check:generated # Verify adapter freshness only
npm pack --dry-run    # Verify package contents
```

The package has no runtime dependencies, and consumers do not need a build step because generated adapters are committed.

## License

[MIT](LICENSE)
