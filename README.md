<img src="./icon.png" width="150" align="right" alt="Cockpit Logo">

# Cockpit

Cockpit is a context-budget autopilot for Pi.

The main chat is the **Oracle**: it stays small, pointed, and strategic. Delegates absorb noisy detail work on cheaper/faster/specialized models, returning compact summaries instead of dumping search output, logs, diffs, and failed attempts into the Oracle context. Direct action is allowed for tiny maneuvers where delegation overhead would cost more than it saves.

## The Cockpit Philosophy

1. **Oracle context is sacred**: The Oracle should avoid noisy discovery, long test logs, broad diffs, and repeated low-level attempts.
2. **Delegate to protect context**: Prefer delegates when work needs search, multiple files, tests, logs, uncertainty, review, or a cheaper/specialized model.
3. **Direct maneuvers are allowed**: Use direct tools for tiny exact edits, a brief one-file inspection, or interactive steering where a cold delegate spawn would be wasteful.
4. **Delegates are crew, not hoops**: `instant`, `fast`, `ideate`, `research`, `planner`, `task-writer`, `normal`, and `reviewer` are specialized background workers that return compact summaries.
5. **Flight safety remains**: Direct edits are allowed, but Cockpit still blocks dangerous shell patterns such as destructive git commands, deploy/publish/apply/destroy patterns, and `rm -rf`.
6. **Codeflow is the big machine**: `/cockpit codeflow` is approval-gated. Without explicit approval it runs only read-only preplanning; after approval it can run writer/reviewer orchestration and feedback routing.

## Code map

This project is a small Pi context-budget autopilot and delegation router:

- `package.json` — package metadata and scripts.
- `tsconfig.json` — TypeScript compiler settings.
- `extensions/cockpit/index.ts` — Pi extension entry point, session status, safety hooks, command/tool registration.
- `extensions/cockpit/codeflow.ts` — cockpit/oracle workflow orchestration.
- `extensions/cockpit/config.ts` — cockpit configuration helpers.
- `extensions/cockpit/delegates/` — delegate protocol, registry, child Pi runner, prompt builders, and flow implementations.
- `extensions/cockpit/jobs/` — async job registry/service, progress UI, read/list/resume/cancel/cleanup, and `.pi/cockpit/jobs/<id>/` artifacts.
- `extensions/cockpit/routing.ts` — context-budget routing diagnostics.
- `extensions/cockpit/safety.ts` — flight-safety checks for dangerous shell mutations.
- `extensions/cockpit/tools/register.ts` — model-facing Cockpit tools and delegation guidance.
- `extensions/cockpit/commands/cockpit.ts` — `/cockpit` command implementation.
- `skills/` — portable Cockpit role skills (`instant`, `fast`, `ideate`, `research`, `planner`, `normal`, `reviewer`, `task-writer`) for use outside the Cockpit runtime.

## Commands

- `/cockpit status`
- `/cockpit setup`
- `/cockpit route <task>` — optional diagnostic/context-budget route explanation.
- `/cockpit preplan <task>`
- `/cockpit codeflow --approved <task plus approved plan/constraints>`
- `/cockpit instant <simple plan mentioning one file>`
- `/cockpit fast <small semantic task>`
- `/cockpit research <task>`
- `/cockpit ideate <unclear feature/refactor/product direction>`
- `/cockpit normal <implementation plan>`
- `/cockpit plan <task + optional research brief>`
- `/cockpit task <idea or backlog item>`
- `/cockpit review <task + plan + change summary>`
- `/cockpit async <flow> <task>`
- `/cockpit parallel <flow>:<task> | <flow>:<task>`
- `/cockpit jobs`
- `/cockpit job <id>`
- `/cockpit resume <id>`
- `/cockpit cleanup`
- `/cleanup`
- `/cockpit cancel <id>`

## Delegate guidance

`instant` is now primarily a discipline: one file, exact change, no scouting, no scope expansion. The Oracle may do these tiny edits directly because spawning a worker can cost more than it saves. The instant delegate remains available when isolation is specifically useful.

`fast` is for small bounded tasks where local discovery or output would clutter the main chat. It uses low thinking and limited tools.

`research` is read-only and produces a concise evidence brief for planner or Oracle use.

`ideate` is read-only divergent thinking for unclear features, refactors, product direction, or tradeoff-heavy implementation choices. The Oracle should surface the recommendation and ask the human to choose/approve before implementation.

`planner` is read-only and turns an approved direction plus optional research into a bounded implementation plan.

`task-writer` turns ideas, bugs, and backlog items into durable markdown task packets.

`normal` is a bounded background coding executor for concrete implementation plans that benefit from context isolation.

`reviewer` is read-only and returns calibrated issues plus a feedback weight: `none`, `light`, `medium`, `heavy`, or `blocker`.

`codeflow-preplan` runs only read-only research/planning and returns a plan marked for human approval. `/cockpit codeflow <task>` without `--approved` is downgraded to this safe preplan behavior and can show an approval dialog when complete.

`codeflow` is the full workflow after explicit approval: optional research, planner, selected executor, reviewer, and feedback routing.

## Portable skills

Cockpit roles are also available as portable markdown skills under `skills/`. Use those directly in other agents when you only want the role discipline. Use the Cockpit runtime when you want background jobs, artifacts, parallel orchestration, approval-gated codeflow, review routing, and Pi UI integration.

## Jobs and setup

All delegate/codeflow commands and tools start background jobs and immediately return control to the Oracle chat. Use `/cockpit jobs` to list, `/cockpit job <id>` to read output and artifact paths, `/cockpit resume <id>` to continue from a failed/cancelled job's generated resume prompt, `/cockpit cleanup` or `/cleanup` to remove job artifacts, and `/cockpit cancel <id>` to abort.

Run `/cockpit setup` to choose two model families:

- **Hands model** inherited by implementation workers: `instant`, `fast`, `normal`.
- **Reasoning model** inherited by ideation/research/planning/review/task-writing workers: `ideate`, `research`, `planner`, `reviewer`, `task-writer`.

Context-budget autopilot is always on. Setup does not ask whether to enable it. Direct edits remain allowed for tiny maneuvers, but delegation is preferred whenever it protects Oracle context.
