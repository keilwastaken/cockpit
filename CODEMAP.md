# CODEMAP

## Purpose

Cockpit is a portable, skills-first software-development methodology. Canonical workflow behavior lives in Markdown skills. Harness adapters only register skills, inject the bootstrap, and map generic actions to native tools.

## Structure

```text
.
├── .opencode/plugins/cockpit.js # Thin OpenCode adapter and commands
├── docs/
│   ├── methodology.md           # Principles, workflow, approval, escalation
│   ├── handoff-contracts.md     # Interfaces between workflow stages
│   └── README.opencode.md       # OpenCode installation and usage
├── evals/
│   ├── fixture/                 # Disposable evaluation repository
│   ├── scenarios.json           # Eight behavioral scenarios and rubrics
│   └── README.md
├── scripts/
│   └── run-behavioral-evals.mjs # Isolated OpenCode scenario runner
├── skills/
│   ├── using-cockpit/           # Workflow entry and composition rules
│   ├── cockpit-work-mode/       # Smallest-safe-workflow decision
│   ├── cockpit-explore/         # Read-only direction exploration
│   ├── cockpit-research/        # Read-only evidence gathering
│   ├── cockpit-plan/            # Approved direction to executable plan
│   ├── cockpit-execute/         # Scope-controlled implementation
│   ├── cockpit-parallel/        # Independent ownership and integration
│   ├── cockpit-review/          # Diff review and feedback routing
│   ├── cockpit-review-response/ # Evidence-based review response
│   ├── cockpit-verify/          # Fresh completion evidence
│   └── cockpit-capture/         # Durable task packets
├── tests/skills.test.js         # Metadata, references, adapter, commands
├── LICENSE
├── README.md
└── package.json
```

## Entrypoints

### Skills

`skills/using-cockpit/SKILL.md` is the methodology entrypoint. It selects and composes namespaced workflow skills and requests a single concise routing line only when work is delegated.

### OpenCode

`package.json#main` points to `.opencode/plugins/cockpit.js`. The plugin:

1. adds `skills/` to OpenCode's skill paths;
2. injects `using-cockpit` once into the first user message;
3. registers `/cockpit-setup` for confirmed native model/agent configuration;
4. registers read-only `/cockpit-doctor` diagnostics;
5. supplies a small OpenCode action mapping.

It does not implement jobs, model invocation, routing state, or execution loops.

### Pi

`package.json#pi.skills` exposes the same canonical `skills/` directory through Pi's native skill discovery. There is no Pi-specific runtime.

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
npm run eval
```

Behavioral model runs require an explicit `--model`; listing scenarios is free.

## Change orientation

- Methodology policy: `docs/methodology.md`
- Stage behavior: corresponding `skills/*/SKILL.md`
- Handoff shape: `docs/handoff-contracts.md`
- OpenCode discovery/setup/doctor only: `.opencode/plugins/cockpit.js`
- Behavioral regressions: `evals/scenarios.json`
- Adapter and metadata regressions: `tests/skills.test.js`
