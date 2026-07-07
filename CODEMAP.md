# CODEMAP

## Project purpose

`cockpit` is a small TypeScript Pi package that adds a Cockpit extension for routing tiny or small local coding/documentation tasks into child Pi delegate processes. It currently supports eight delegate flows:

- `instant` — tightly scoped one-file edits from a cockpit-supplied plan.
- `fast` — small semantic tasks with limited local discovery, intended for work like codemaps.
- `research` — read-only local-first codebase research briefs for planner handoff, with optional web context when available.
- `ideate` — read-only divergent ideation council for unclear features, refactors, and implementation/product direction.
- `normal` — medium-thinking bounded coding execution from an implementation plan.
- `planner` — high-reasoning read-only implementation plans for coding-agent handoff.
- `task-writer` — low-thinking PM-style task packets for later Cockpit agents.
- `reviewer` — read-only diff review with severity buckets and feedback weight for cockpit routing.

## Repository layout

```text
.
├── extensions/
│   └── cockpit/
│       ├── index.ts                 # Pi extension entrypoint: events, commands, tools
│       ├── config.ts                # defaults, config loading/merging/saving
│       ├── codeflow.ts              # cockpit/oracle orchestration flow
│       ├── routing.ts               # task signal analysis and route decisions
│       ├── safety.ts                # flight-safety guards for dangerous shell mutation patterns
│       ├── jobs/
│       │   ├── async-jobs.ts        # delegate/codeflow job registry, progress formatting, cancel/read/list helpers
│       │   ├── artifacts.ts         # .pi/cockpit/jobs/<id>/ lifecycle artifacts and resume prompts
│       │   └── service.ts           # UI-bound job service for starting jobs and refreshing status/widget progress
│       └── delegates/
│           ├── protocol.ts          # shared delegate types
│           ├── registry.ts          # delegate registry/export surface
│           ├── child-pi.ts          # legacy child Pi process runner and JSON output capture
│           ├── warm-pi.ts           # warm in-process Pi SDK delegate sessions with amnesiac per-task resets
│           ├── instant.ts           # instant delegate validation + prompt + run flow
│           ├── fast.ts              # fast delegate validation + prompt + run flow
│           ├── research.ts          # read-only research brief validation + prompt + run flow
│           ├── ideate.ts            # divergent ideation council validation + prompt + run flow
│           ├── normal.ts            # bounded coding executor validation + prompt + run flow
│           ├── planner.ts           # high-reasoning implementation plan validation + prompt + run flow
│           ├── task-writer.ts       # low-thinking PM-style task packet validation + prompt + run flow
│           └── reviewer.ts          # read-only diff reviewer validation + prompt + run flow
├── skills/                          # portable markdown role skills extracted from Cockpit
├── package.json                     # package metadata, Pi extension registration, scripts
├── tsconfig.json                    # strict NodeNext TypeScript config
├── README.md                        # user-facing summary and command list
└── CODEMAP.md                       # this file
```

Ignored/generated paths include `node_modules/`, `dist/`, `.pi/`, logs, `.DS_Store`, and `package-lock.json`.

## Entrypoints and registration

### Package entry

`package.json` declares this as an ESM package and registers Pi extensions through:

```json
"pi": { "extensions": ["./extensions"] }
```

The TypeScript compiler includes `extensions/**/*.ts`; there is no separate `src/` directory or build output checked in. Portable role skills live under `skills/` and are packaged alongside the extension.

### Extension entrypoint

`extensions/cockpit/index.ts` exports the default Pi extension function. It wires up:

- `session_start` event: loads config and sets a context-budget-autopilot status item with selected hands/reasoning models.
- `tool_call` event: applies flight-safety checks for dangerous shell mutation patterns while allowing direct `edit`/`write`.
- `/cockpit` command: user command with subcommands for setup, status, context-budget routing diagnostics, background delegate/codeflow jobs, and job inspection/resume/cancel.
- `cockpit_job` tool: tool-facing start/list/read/cancel API for Cockpit jobs.
- `cockpit_codeflow` tool: starts a background cockpit/oracle codeflow job.
- `cockpit_delegate` tool: starts a background instant delegate job.
- `cockpit_fast` tool: starts a background fast delegate job.
- `cockpit_research` tool: starts a background read-only research delegate job.
- `cockpit_ideate` tool: starts a background divergent ideation delegate job.
- `cockpit_normal` tool: starts a background normal coding delegate job.
- `cockpit_plan` tool: starts a background read-only planner delegate job.
- `cockpit_task_writer` tool: starts a background task packet writer delegate job.
- `cockpit_review` tool: starts a background read-only reviewer delegate job.

## Commands and tools

Registered `/cockpit` subcommands:

- `/cockpit status` or `/cockpit config` — show flow settings, limits, tools, and loaded config paths.
- `/cockpit setup` — run the onboarding wizard: choose a hands model, choose a reasoning model, and save global config. Context-budget autopilot is always on.
- `/cockpit route <task>` — analyze a task and print a context-budget recommendation, direct-is-fine signal, and delegate-value signal.
- `/cockpit preplan <task>` — start a read-only codeflow preplan job: optional research plus planner only, no writer execution.
- `/cockpit codeflow --approved <task plus approved plan/constraints>` — start a background cockpit/oracle workflow job after explicit plan approval: optional research, planner, selected executor, reviewer, and feedback routing. Without `--approved`, this command is downgraded to `codeflow-preplan`.
- `/cockpit instant <plan>` — start a background instant delegate job; the file is inferred from the plan.
- `/cockpit fast <task>` — start a background fast delegate job.
- `/cockpit research <task>` — start a background read-only research delegate job.
- `/cockpit ideate <unclear feature/refactor/product direction>` — start a background read-only ideation delegate job.
- `/cockpit normal <implementation plan>` — start a background normal coding delegate job.
- `/cockpit plan <task + optional research brief>` — start a background read-only planner delegate job.
- `/cockpit task <idea or backlog item>` — start a background low-thinking task-writer delegate job.
- `/cockpit review <task + plan + change summary>` — start a background read-only reviewer delegate job.
- `/cockpit async <flow> <task>` — explicit background job starter for `codeflow`, delegate flows, and aliases such as `taskWriter`.
- `/cockpit parallel <flow>:<task> | <flow>-><file>:<task>` — convenience starter for multiple independent background jobs; optional file-owned syntax rejects duplicate target files and injects a write-only-that-file guard. No grouping or synthesis.
- `/cockpit jobs` — list in-memory jobs with estimated progress bars.
- `/cockpit job <id>` — show a job's plan, status, output, stderr, estimated progress, and artifact paths.
- `/cockpit resume <id>` — start a normal continuation job from `.pi/cockpit/jobs/<id>/resume.md` for a failed/cancelled job.
- `/cockpit cleanup` — remove Cockpit job artifact files under `.pi/cockpit/jobs`.
- `/cleanup` — shortcut for removing Cockpit job artifact files under `.pi/cockpit/jobs`.
- `/cockpit cancel <id>` — abort a running job and refresh the Cockpit jobs widget/status.

Registered tools:

- `cockpit_job` — accepts `action: start|startMany|list|read|cancel`, optional `flow`, `plan`, `jobs`, `outputFile` per parallel job, and `id`; manages background jobs.
- `cockpit_codeflow` — accepts `plan`, optional `flow: "codeflow"`, and optional `approved`; without `approved=true`, starts a read-only `codeflow-preplan` job and returns a job id; with approval, starts full writer/reviewer codeflow.
- `cockpit_delegate` — accepts `plan`, `file`, optional `line`, and optional `flow: "instant"`; starts an instant job and returns a job id.
- `cockpit_fast` — accepts `plan`, optional `outputFile`, and optional `flow: "fast"`; starts a fast job and returns a job id.
- `cockpit_research` — accepts `plan` and optional `flow: "research"`; starts a research job and returns a job id.
- `cockpit_ideate` — accepts `plan` and optional `flow: "ideate"`; starts an ideate job and returns a job id.
- `cockpit_normal` — accepts `plan` and optional `flow: "normal"`; starts a normal job and returns a job id.
- `cockpit_plan` — accepts a task, human-approved direction, and optional Research Brief as `plan`, plus optional `flow: "planner"`; starts a planner job and returns a job id.
- `cockpit_task_writer` — accepts `plan`, optional `outputFile`, and optional `flow: "task-writer"`; starts a task-writer job and returns a job id.
- `cockpit_review` — accepts `plan` and optional `flow: "reviewer"`; starts a reviewer job and returns a job id.

## Configuration flow

`extensions/cockpit/config.ts` defines `DEFAULT_CONFIG` and the config lifecycle:

1. Start from defaults.
2. Load global config from `~/<Pi config dir>/cockpit/config.json`.
3. If the project is trusted, merge project config from `<cwd>/<Pi config dir>/cockpit/config.json`.
4. Normalize flow fields, tools, limits, and model inheritance.

Important defaults:

- `strictMode: false` — deprecated compatibility field; context-budget autopilot is always on and direct edits are allowed.
- `instant` tools: `read`, `edit`; thinking `off`; max 1 file / ~30 lines / 60s.
- `fast` tools: `ls`, `find`, `grep`, `read`, `write`, `edit`; thinking `low`; max 3 files / ~300 lines / 180s.
- `research` tools: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`; thinking `minimal`; max 7 fully-read files / 180s.
- `ideate` tools: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`; thinking `high`; max 8 fully-read files / 300s.
- `normal` tools: `ls`, `find`, `grep`, `read`, `edit`, `write`, `bash`; thinking `medium`; max 6 files / ~600 lines / 900s.
- `planner` tools: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`; thinking `xhigh`; max 3 verification files / 240s.
- `reviewer` tools: `ls`, `find`, `grep`, `read`, `bash`; thinking `high`; max 10 fully-read files / 240s.
- `task-writer` tools: `ls`, `find`, `grep`, `read`, `write`, `edit`; thinking `low`; max 6 fully-read files / 180s.
- Disallowed domains: auth, security, persistence, deployment, architecture.
- Forbidden shell command classes include commit, push, deploy, publish, reset, clean.

`/cockpit setup` saves only global config through `saveGlobalConfig()`. The setup wizard explains context-budget autopilot, detects available models, asks for two model choices, previews the delegate map, and saves on confirmation. The hands model is inherited by implementation workers (`instant`, `fast`, `normal`). The reasoning model is inherited by ideation/research/planning/review/task-writing workers (`ideate`, `research`, `planner`, `reviewer`, `task-writer`). Recommended setup: local model for hands and latest cloud reasoning model for reasoning. Context-budget autopilot is always on; direct edits are allowed for tiny maneuvers, while delegation is preferred for noisy work.

## Routing model

`extensions/cockpit/routing.ts` performs lightweight semantic routing:

- Extracts mentioned files from common source/docs/config extensions and README references.
- Detects risk domains using keyword regexes.
- Detects coding intent, question-only prompts, ambiguity, and mechanical edits.
- Estimates file and line scope.

Routes:

- `instant` — unambiguous, low-risk work within instant limits.
- `fast` — unambiguous, low-risk small semantic work within fast limits.
- `normal` — unambiguous, bounded multi-file work within normal limits.
- `cockpit-only` — questions or non-coding work.
- `need-decision` — ambiguous, too large, or requiring clarification/careful handling.

`formatDecision()` converts route details, risks, missing context questions, and suggested refinements into user-facing text.

## Delegate flow boundaries

### Codeflow orchestrator

`extensions/cockpit/codeflow.ts` is the cockpit/oracle workflow runner. It is not a child model role; it coordinates existing delegates.

Approval-gated preplan mode (`codeflow-preplan`):

1. Decide whether research is needed from routing signals, missing files, risk domains, and external-knowledge hints.
2. Run `research` when useful, then run `planner`.
3. If planner requests research and none was run yet, run research and re-run planner.
4. Return a `# Codeflow Preplan` that marks approval required. No executor runs.

Approved full codeflow:

1. Decide whether research is needed from routing signals, missing files, risk domains, and external-knowledge hints.
2. Run `research` when useful, then run `planner`.
3. If planner requests research and none was run yet, run research and re-run planner.
4. Parse planner `Execution Routing` and choose `instant`, `fast`, or `normal`, falling back to route heuristics.
5. Run selected executor.
6. Run `reviewer` over the current working-tree diff and handoff context.
7. Parse feedback weight and route: `none` approves, `light`/`medium` trigger bounded coder fixes, `heavy` triggers one planner revision, and `blocker` asks for human/cockpit decision.

Codeflow caps coder fix attempts at 2 and planner revisions at 1 for the initial loop.

### Shared protocol

`extensions/cockpit/delegates/protocol.ts` defines common names, inputs, outputs, update callbacks, and context shape. `registry.ts` exposes the current flows as `delegates.instant`, `delegates.fast`, `delegates.research`, `delegates.ideate`, `delegates.normal`, `delegates.planner`, `delegates.taskWriter`, canonical `delegates["task-writer"]`, and `delegates.reviewer`.

### Warm and legacy child runners

`extensions/cockpit/delegates/warm-pi.ts` runs delegates through warm in-process Pi SDK sessions. Sessions are cached by cwd/model/thinking/tools, keep runtime/model/tool setup hot, reset message history before every task to preserve delegate amnesia, stream progress back to jobs, and are disposed on `session_shutdown`.

`extensions/cockpit/delegates/child-pi.ts` is the legacy fallback. It starts a child Pi process with JSON mode, captures assistant `message_end` text as the final output, collects stderr, supports delegate-specific environment variables, and enforces timeout/abort behavior. It chooses the invocation from the current executable/script when possible, otherwise falls back to `pi`. Set `COCKPIT_DISABLE_WARM_DELEGATES=1` to force this path.


### Instant delegate

`extensions/cockpit/delegates/instant.ts`:

- Requires a non-empty plan and exactly one allowed file.
- Refuses configured disallowed domains.
- Runs child Pi with no session, no extensions/skills/templates/context files, configured model, `--thinking off`, and only configured instant tools.
- Prompt instructs the child to do exactly one tiny edit, avoid scouting/redesign, stop on broader decisions, and return a compact summary.

Instant boundary: child scope is a cockpit-supplied plan plus allowed file(s).

### Fast delegate

`extensions/cockpit/delegates/fast.ts`:

- Requires a non-empty plan.
- Refuses risky domains except architecture is allowed through the fast validator for routing purposes.
- Uses an explicit `outputFile` when provided; `CODEMAP` is normalized to `CODEMAP.md`, and codemap tasks infer `CODEMAP.md`.
- Runs child Pi with no session/extensions/skills/templates/context files, configured model, `--thinking low`, and fast tools.
- Prompt explicitly limits changes to at most configured file/line counts and asks codemap tasks to identify entrypoints, major directories, config/package files, extension/tool flows, and delegate boundaries.

Fast boundary: child may do targeted local discovery and write/edit the requested output, but should not modify source unless the plan asks for it.

### Research delegate

`extensions/cockpit/delegates/research.ts`:

- Requires a non-empty task.
- Usually uses the configured reasoning model, with `--thinking minimal`.
- Runs child Pi with no session, no skills/templates/context files, and a read-only tool allowlist: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`.
- Does not pass `--no-extensions` so extension-provided web tools can be available, while `--tools` keeps the child constrained to the research allowlist.
- Prompt instructs the child to inspect local code first, respect `.gitignore`, read at most 7 files fully, use web only for relevant external contracts/current docs, and return a structured Research Brief with confidence metadata, Evidence Quality, and Research Tour.
- Returns `INSUFFICIENT_CONTEXT: need deeper search` rather than inventing files/APIs/behavior when local and optional external context is insufficient.

Research boundary: child is read-only and should produce evidence for the planner, not a solution plan or code changes.

### Ideate delegate

`extensions/cockpit/delegates/ideate.ts`:

- Requires a non-empty unclear feature, refactor, product direction, or implementation idea.
- Usually uses the reasoning model and the hands model as separate perspectives when both are configured.
- Runs three divergent read-only passes in parallel: pragmatic path, ambitious path, and risk/maintenance path.
- Each pass runs child Pi with no session, no skills/templates/context files, and a read-only tool allowlist: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`.
- A final synthesis pass compares variants into an `# Ideation Result` with recommended direction, option matrix, human decision needed, recommended next step after human approval, keep/drop/defer, and risks.

Ideate boundary: child does not plan or implement. It recommends a direction, but the Oracle must surface the recommendation to the human and get approval/choice before handing the selected direction to planner/codeflow.

### Normal delegate

`extensions/cockpit/delegates/normal.ts`:

- Requires a non-empty implementation plan or coding instruction.
- Usually uses the configured implementation model, with `--thinking medium`.
- Runs child Pi with no session/extensions/skills/templates/context files, configured model, and normal tools: `ls`, `find`, `grep`, `read`, `edit`, `write`, `bash`.
- Prompt tells the child to act as a terse coding executor, follow planner Coder Instructions, avoid redesign/scope expansion, use edit/write for file changes, and use bash only for safe validation/read-only discovery.
- Limits scope to at most configured file/line counts and asks for compact Summary / Files Changed / Validation / Deviations / Reviewer Handoff / Risks output so the reviewer gets a clean change summary and suggested review tour.

Normal boundary: child may make bounded source/test changes from a plan and run safe validation commands, but should stop if the plan is wrong, scope expands, or risky decisions are needed.

### Planner delegate

`extensions/cockpit/delegates/planner.ts`:

- Requires a non-empty task and/or Research Brief.
- Usually uses the configured reasoning model, with `--thinking xhigh`.
- Runs child Pi with no session, no skills/templates/context files, and a read-only verification tool allowlist: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`.
- Does not pass `--no-extensions` so extension-provided web tools can be available, while `--tools` keeps the child constrained to the planner allowlist.
- Prompt instructs the child to treat the human-approved direction as intended direction, treat the Research Brief as evidence, verify only critical assumptions, and return a structured Implementation Plan with Implementation Tour, Review Checkpoints, and Coder Fix Budget.
- Returns `NEEDS_DEEPER_RESEARCH` instead of forcing a brittle plan when key context is missing.

Planner boundary: child should produce a bounded plan for the coding agent, including exact files, steps, validation commands, risks, and stop conditions. It should not edit or implement.

### Task-writer delegate

`extensions/cockpit/delegates/task-writer.ts`:

- Requires a non-empty idea, bug, backlog item, or future-work description.
- Usually uses the configured reasoning model, with `--thinking low`.
- Runs child Pi with no session/extensions/skills/templates/context files and task-writing tools: `ls`, `find`, `grep`, `read`, `write`, `edit`.
- Prompt tells the child to act as a lightweight PM, avoid implementation, inspect only limited context, and produce a durable migration-plan-style task document with status/date/scope metadata, rationale, boundaries, phased task tables, acceptance criteria, suggested Cockpit route, validation plan, risks, open questions, implementation order, and ready-to-run prompts.
- If an `outputFile` is supplied through the tool, it may write/update only that markdown task file; otherwise it returns the packet inline.

Task-writer boundary: child produces backlog-ready handoff material for future agents. It should not edit source code or make product decisions silently.

### Reviewer delegate

`extensions/cockpit/delegates/reviewer.ts`:

- Requires non-empty review context: original task, plan/requirements, coder summary, validation, and optionally a base/head git range.
- Usually uses the configured reasoning model, with `--thinking high`; setup keeps reviewer on the reasoning side rather than the hands model to catch blind spots.
- Runs child Pi with no session/extensions/skills/templates/context files and read-only review tools: `ls`, `find`, `grep`, `read`, `bash`.
- Prompt restricts bash to read-only inspection commands like `git status --short`, `git diff --stat`, `git diff`, `git log`, and listed validation commands.
- Reviews the current working-tree diff by default, or a provided git range when included in the request.
- Returns a structured review with verdict, severity buckets, review tour, plan alignment, validation assessment, Cockpit Routing Signal, and feedback weight: `none`, `light`, `medium`, `heavy`, or `blocker`.

Reviewer boundary: child does not fix code. It produces issue evidence plus a recommended route (`approve`, `coder_fix`, `planner_revision`, or `human_decision`) for the cockpit/oracle to decide.

## Safety behavior

`extensions/cockpit/safety.ts` implements flight-safety checks in the cockpit session. Direct `edit`/`write` tools are allowed. Dangerous shell mutation patterns are blocked, including forbidden git commands, deploy/publish/apply/destroy commands, `rm -rf`, shell redirection writes, in-place sed/perl, and inline Python/Node file mutation.

## Development commands

Likely commands from `package.json`:

```bash
npm run typecheck
npm run check
```

Both currently run TypeScript checking (`tsc --noEmit`). No test script or dedicated lint/build script is declared.

## Tests and validation

No test files or test runner configuration were found in the tracked project structure. The primary available validation is TypeScript checking via `npm run check` / `npm run typecheck`.

## Key dependencies

- Runtime/peer: `@earendil-works/pi-coding-agent`, `typebox`.
- Dev: TypeScript, Node types, Pi coding agent package, `typebox`.

## Change orientation

When adding behavior:

- Command/tool registration usually starts in `extensions/cockpit/index.ts`.
- Background job lifecycle, artifacts, cleanup, job progress display, cancellation, and job list/read formatting belong in `extensions/cockpit/jobs/`.
- Flow defaults and limits belong in `config.ts`.
- Routing heuristics belong in `routing.ts`.
- Process execution concerns belong in `delegates/child-pi.ts`.
- New delegate flows should extend `protocol.ts`, be implemented under `delegates/`, and be exported from `registry.ts`.
- Tool/command mutation restrictions belong in `safety.ts`.
