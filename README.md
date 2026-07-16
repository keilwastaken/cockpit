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

## Harness adapters

Cockpit supports OpenCode, Pi, and Claude Code through native, thin adapters generated from [`scripts/adapter-definition.mjs`](scripts/adapter-definition.mjs). The adapters share skill inventory, role mappings, and bootstrap text while respecting each harness's own model and extension semantics.

### OpenCode

The thin OpenCode adapter registers the skills and bootstrap. It adds two commands:

```text
/cockpit-setup   # choose reasoning and hands models using scrollable lists
/cockpit-doctor  # diagnose skills, models, agents, and config read-only
```

See [`docs/README.opencode.md`](docs/README.opencode.md).

### Pi

Pi discovers the skills and extension through `package.json#pi`. The extension adds:

```text
/cockpit-setup   # choose Pi's active model for this session
/cockpit-doctor  # diagnose the integration without writing config
```

Cockpit remains sequential in Pi's current agent. It does not add agents, background jobs, a second model role, or a custom orchestration runtime.

See [`docs/README.pi.md`](docs/README.pi.md).

### Claude Code

The repository is a native Claude Code plugin with automatically discovered skills, `/cockpit:cockpit-setup`, `/cockpit:cockpit-doctor`, a `SessionStart` bootstrap hook, and five scoped agents. Agents inherit the active model; explorer, planner, reviewer, and research deny `Write` and `Edit`.

See [`docs/README.claude.md`](docs/README.claude.md).

### Adapter generation

All adapters are generated from the canonical definition:

```bash
npm run generate         # regenerate committed adapters
npm run check:generated  # fail if committed adapters are stale
```

The generator produces deterministic committed output. A universal installer is intentionally deferred; installation, updates, and removal remain native to each harness.

## Behavioral evaluations

Cockpit includes eight disposable behavioral scenarios for comparing strong, cheap, and local models:

```bash
npm run eval
npm run eval -- --model openai/gpt-5.6-luna --scenario tiny-direct
```

See [`evals/README.md`](evals/README.md). Model calls run only when `--model` is supplied.

## Development

```bash
npm test              # Run all tests (including adapter freshness)
npm run check         # Test + adapter freshness check
npm run generate      # Regenerate harness adapters
npm run check:generated # Verify adapter freshness only
npm pack --dry-run    # Verify package contents
```

The package has no runtime dependencies, and consumers do not need a build step because generated adapters are committed.

## License

[MIT](LICENSE)
