# Pi Conductor

Conductor is a Pi package for delegating coding work without derailing the main chat.

Most coding-agent workflows make one chat do everything: planning, implementation, debugging, review, terminal logs, and follow-up decisions. Over time, the context gets bloated, the agent drifts, and delegation means opening a new window and reconstructing the task by hand.

Conductor keeps the main Pi chat as the engineering cockpit. When work emerges, it helps classify the effort, package a focused handoff, define constraints and evidence expectations, and send the task to the right worker flow so the main conversation can continue.

## Status

Phase 2 scaffold: recommendation-only routing and handoff generation, with a run registry foundation for saved handoffs and worktree/isolation recommendations. It does **not** launch subagents, create git worktrees, or execute an orchestration FSM yet.

## Install locally

Clone or copy this repository to the computer where you want to use it, then run Pi with the local package path:

```bash
cd /path/to/pi-conductor
npm install
pi -e "$PWD"
```

Or install persistently from that local checkout:

```bash
cd /path/to/pi-conductor
npm install
pi install "$PWD"
```

After installing on a new computer, run `/conductor setup` once to create that machine's local Conductor config.

## Commands

```text
/conductor setup
/conductor status
/conductor runs
/conductor inspect <run-id>
/conductor route <task>
/conductor handoff [instant|fast|careful] <task>
/conductor launch --approve <run-id>
/conductor strict on|off
```

`/conductor handoff` writes a run directory under `.pi/conductor/runs/<timestamp>/` in the active project, including `handoff.md`, `status.json`, `notes.md`, `evidence.md`, and `review.md`.
`/conductor launch --approve <run-id>` marks a saved run approved, appends `decisions.md`, and does not launch a worker automatically.
`/conductor runs` lists known runs newest first, and `/conductor inspect <run-id>` shows a run's saved status and artifact paths.

## What is a handoff?

A handoff is a clean work order for a delegated subagent. It includes:

- goal
- selected route/profile and suggested agent
- allowed files
- execution profile metadata, including isolation recommendation
- non-goals
- stop rules
- validation hints
- required return format

## Defaults

Conductor chooses process, not intelligence. Models are implementation details. The public names are execution profiles/topology constraints, not model-size labels. They are designed around how much disruption, ambiguity, and proof the task requires:

- `instant`: linear direct-worker profile; exact files; no scout; compact return; max worker visits 1; isolation `same-tree`
- `fast`: linear direct-worker profile; bounded edits; optional scout if targets are unclear; max worker visits 1; isolation `worktree-recommended`
- `careful`: full orchestrated flow; scout → plan → execute → fresh-context review → repair → evidence; max worker visits 3; isolation `worktree-required`

Default agent names are generic and configurable:

- Instant agents: `delegate`
- Fast agents: `delegate`
- Careful agent: `worker`

Model and agent selection is a configurable implementation detail. By default, model preferences are blank so each agent inherits its normal default. Run `/conductor setup` to customize agents and model preferences from Pi's active model registry, or enter model IDs manually if no registry choices are available.

## Routing rules

- `instant`: exact file or obvious mechanical edit, unambiguous instructions, low blast radius.
- `fast`: small feature/fix, bounded unknowns, low-risk domain, usually no more than a few files.
- `careful`: many files, unclear design, user-visible behavior, risky refactor, or work needing strong evidence/review.

## Execution profile policy

- Instant: linear direct-worker profile; read/edit exact allowed files only; no scout; run requested or narrow validation; return compactly.
- Fast: linear direct-worker profile; bounded edits; optional scout only if target files are unclear.
- Careful: full orchestrated flow; scout → plan → execute → fresh-context review → repair → evidence. Worker self-check is allowed, but it is not sufficient for careful status. Product/design ambiguity escalates to the human.

## Positioning

Conductor is not trying to replace the engineer or become another all-in-one coding agent. It is aimed at keeping the engineer in control while making delegation low-friction:

```text
Think here.
Delegate there.
Review evidence back here.
```

Claude Code, OpenCode, Amp, and similar tools are excellent worker environments. Conductor's niche is the layer above that: deciding what kind of work this is, creating the handoff, preserving the main chat's focus, and requiring useful evidence before results come back into the cockpit.

## Phase 2 direction

The next phase will add guarded launch support for fast delegations after explicit approval and, later, actual worktree management. For now, Conductor only recommends isolation in handoffs and status output; it does not create worktrees.
