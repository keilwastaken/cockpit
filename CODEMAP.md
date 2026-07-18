# CODEMAP

## Purpose

Cockpit is an OpenCode-native, skills-first software-development methodology with explicit on-demand contracts. Canonical workflow behavior lives in Markdown skills. The OpenCode adapter registers skills, an explicit subagent worker, and commands without modifying ordinary user messages.

## Structure

```text
.
├── .opencode/plugins/cockpit.js # Generated OpenCode adapter and commands
├── docs/
│   ├── methodology.md           # Principles, workflow, approval, escalation
│   ├── handoff-contracts.md     # Interfaces between workflow stages
│   └── README.opencode.md       # OpenCode installation and usage
├── evals/
│   ├── cost/                    # Cost benchmarking scenarios and scorecards
│   ├── fixture/                 # Disposable evaluation repository
│   ├── scenarios.json           # Behavioral scenarios and rubrics
│   └── README.md
├── scripts/
│   ├── adapter-definition.mjs   # Shared adapter semantics
│   ├── generate-adapters.mjs    # Deterministic adapter generator
│   └── run-behavioral-evals.mjs # Isolated OpenCode scenario runner
├── skills/
│   ├── using-cockpit/           # Workflow entry and composition rules
│   ├── cockpit-work-mode/       # Smallest-safe-workflow decision
│   ├── cockpit-strategy/        # Read-only direction strategy
│   ├── cockpit-research/        # Read-only evidence gathering
│   ├── cockpit-plan/            # Approved direction to executable plan
│   ├── cockpit-execute/         # Scope-controlled implementation
│   ├── cockpit-parallel/        # Independent ownership and integration
│   ├── cockpit-review/          # Diff review and feedback routing
│   ├── cockpit-review-response/ # Evidence-based review response
│   ├── cockpit-verify/          # Fresh completion evidence
│   └── cockpit-capture/         # Durable task packets
├── tests/
│   ├── adapters.test.js         # OpenCode, generation, and metadata contracts
│   ├── skills.test.js           # Metadata, references, OpenCode behavior
│   └── cost-benchmark.test.js   # Cost benchmark logic
├── LICENSE
├── README.md
└── package.json
```

## Entrypoints

### Skills

`skills/using-cockpit/SKILL.md` is the methodology entrypoint. It declares the reading agent as the oracle and sets rules for direct work, hands workers, reasoning specialists, and compact handoffs.

### OpenCode

`package.json#main` points to `.opencode/plugins/cockpit.js`. The plugin:

1. adds `skills/` to OpenCode's skill paths;
2. registers `cockpit-worker` as a subagent with canonical instructions, bounded steps, and denied task/question/webfetch/skill permissions, invokable by `build` via native Task calls;
3. registers `/cockpit-setup` for confirmed native model/agent configuration;
4. registers read-only `/cockpit-doctor` diagnostics;
5. registers `/cockpit-contract` (on build) and `/cockpit-run` (on build, dispatches to cockpit-worker).

It does not implement jobs, model invocation, routing state, or execution loops. It does not inject instructions into ordinary user messages.

### Generation

`scripts/adapter-definition.mjs` owns shared inventory, role mappings, and adapter intent. `scripts/generate-adapters.mjs` renders the committed OpenCode plugin. `npm run check:generated` detects drift.

## Handoff flow

```text
Options Brief -> human approval -> Research Brief -> Implementation Plan
              -> Execution Result -> Review Result -> Review Response -> Verification
```

Stages omit unnecessary handoffs for small work. Shared contracts are documented in `docs/handoff-contracts.md`.

## Validation

```bash
npm test
npm run check
npm pack --dry-run
```

Behavioral model runs require an explicit `--model`; listing scenarios is free.

## Change orientation

- Methodology policy: `docs/methodology.md`
- Stage behavior: corresponding `skills/*/SKILL.md`
- Handoff shape: `docs/handoff-contracts.md`
- OpenCode discovery/setup/doctor only: `.opencode/plugins/cockpit.js`
- OpenCode adapter semantics: `scripts/adapter-definition.mjs`
- Adapter and metadata regressions: `tests/adapters.test.js` and `tests/skills.test.js`
