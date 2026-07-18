# CODEMAP

## Purpose

Cockpit is a portable, skills-first software-development methodology. Canonical workflow behavior lives in Markdown skills. Harness adapters only register skills, inject the bootstrap, and map generic actions to native tools.

## Structure

```text
.
├── .claude-plugin/plugin.json   # Claude Code plugin manifest
├── .opencode/plugins/cockpit.js # Generated OpenCode adapter and commands
├── agents/                      # Generated Claude Code agents
├── commands/                    # Generated Claude setup and doctor skills
├── docs/
│   ├── methodology.md           # Principles, workflow, approval, escalation
│   ├── handoff-contracts.md     # Interfaces between workflow stages
│   └── README.opencode.md       # OpenCode installation and usage
├── evals/
│   ├── fixture/                 # Disposable evaluation repository
│   ├── scenarios.json           # Behavioral scenarios and rubrics
│   └── README.md
├── extensions/cockpit.js        # Generated Pi extension
├── hooks/                       # Generated Claude SessionStart hook
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
├── tests/adapters.test.js       # Pi, Claude, generation contracts
├── tests/skills.test.js         # Metadata, references, OpenCode behavior
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
2. injects `using-cockpit` once into the first user message;
3. registers `/cockpit-setup` for confirmed native model/agent configuration;
4. registers read-only `/cockpit-doctor` diagnostics;
5. supplies a small OpenCode action mapping.

It does not implement jobs, model invocation, routing state, or execution loops.

### Pi

`package.json#pi` exposes the canonical skills and `extensions/cockpit.js`. The extension injects the bootstrap and registers native setup and doctor commands. It changes only Pi's active session model after confirmation and adds no subagent runtime.

### Claude Code

`.claude-plugin/plugin.json` makes the repository a native plugin. Claude discovers root `skills/`, `commands/`, and `agents/`; `hooks/hooks.json` injects the bootstrap at `SessionStart` through `additionalContext`.

### Generation

`scripts/adapter-definition.mjs` owns shared inventory, role mappings, and adapter intent. `scripts/generate-adapters.mjs` renders committed harness artifacts. `npm run check:generated` detects drift.

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
- Shared adapter semantics: `scripts/adapter-definition.mjs`
- Pi integration: `extensions/cockpit.js`
- Claude integration: `.claude-plugin/`, `agents/`, `commands/`, and `hooks/`
- Behavioral regressions: `evals/scenarios.json`
- Adapter and metadata regressions: `tests/adapters.test.js` and `tests/skills.test.js`
