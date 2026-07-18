<img src="./icon.png" width="150" align="right" alt="Cockpit Logo">

# Cockpit

Cockpit is an OpenCode-native library of on-demand engineering skills and explicit execution contracts.

OpenCode's native `build` agent is the strong parent. A `cockpit-worker` subagent executes mechanical contracts on a configured hands model and returns untrusted results to the parent, which verifies actual state and owns the completion claim.

## Core workflow

```text
normal request -> native build agent

explicit contract -> build dispatches via Task tool
                      └── cockpit-worker (subagent) executes
                      └── parent awaits, inspects, verifies
                      └── parent certifies or escalates
```

Cockpit does not inject a workflow into ordinary conversations or automatically route work. Skills load on demand, and cheap execution begins only when an explicit contract is supplied.

## Principles

- Native strong-model work is the default.
- Cheap execution requires an explicit file allowlist, acceptance checks, and stop conditions.
- Recommendation is not human approval.
- Evidence precedes commitment; distinguish facts from inference.
- Plans are bounded contracts with validation and stop conditions.
- Executors stop rather than silently redesign.
- The strong model handles ambiguity, recovery, and consequential judgment only when needed.
- Fresh verification precedes completion claims.

Read [`docs/methodology.md`](docs/methodology.md) and [`docs/handoff-contracts.md`](docs/handoff-contracts.md).

## Skills

Canonical behavior lives in namespaced Markdown skills under [`skills/`](skills/). The entry skill is `using-cockpit`; workflow skills use the `cockpit-*` namespace so Cockpit can coexist with other skill packages.

## Adapter

The OpenCode adapter registers skills, the explicit subagent worker, and commands without modifying ordinary user messages. It is generated from [`scripts/adapter-definition.mjs`](scripts/adapter-definition.mjs).

```bash
npm run generate         # regenerate the OpenCode plugin
npm run check:generated  # fail if the generated plugin is stale
```

It adds two commands:

```text
/cockpit-setup   # choose reasoning and hands models using scrollable lists
/cockpit-doctor  # diagnose skills, models, agents, and config read-only
/cockpit-contract # create a bounded contract on build
/cockpit-run      # orchestrate contract execution on cockpit-worker from build
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
