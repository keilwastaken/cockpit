# CODEMAP

## Project purpose

`pi-cockpit` is a small TypeScript Pi package that adds a Cockpit extension for routing tiny or small local coding/documentation tasks into child Pi delegate processes. It currently supports six delegate flows:

- `instant` — tightly scoped one-file edits from a cockpit-supplied plan.
- `fast` — small semantic tasks with limited local discovery, intended for work like codemaps.
- `research` — read-only local-first codebase research briefs for planner handoff, with optional web context when available.
- `normal` — medium-thinking bounded coding execution from an implementation plan.
- `planner` — high-reasoning read-only implementation plans for coding-agent handoff.
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
│       ├── safety.ts                # strict-mode and delegate tool-call guards
│       └── delegates/
│           ├── protocol.ts          # shared delegate types
│           ├── registry.ts          # delegate registry/export surface
│           ├── child-pi.ts          # child Pi process runner and JSON output capture
│           ├── instant.ts           # instant delegate validation + prompt + run flow
│           ├── fast.ts              # fast delegate validation + prompt + run flow
│           ├── research.ts          # read-only research brief validation + prompt + run flow
│           ├── normal.ts            # bounded coding executor validation + prompt + run flow
│           ├── planner.ts           # high-reasoning implementation plan validation + prompt + run flow
│           └── reviewer.ts          # read-only diff reviewer validation + prompt + run flow
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

The TypeScript compiler includes `extensions/**/*.ts`; there is no separate `src/` directory or build output checked in.

### Extension entrypoint

`extensions/cockpit/index.ts` exports the default Pi extension function. It wires up:

- `session_start` event: loads config and sets a status item showing the selected delegate model and strict-mode state.
- `tool_call` event: applies `shouldBlockToolCall()` to enforce instant-delegate restrictions or global strict mode.
- `/cockpit` command: user command with subcommands for setup, status, routing, direct delegate runs, and strict mode.
- `cockpit_codeflow` tool: tool-facing cockpit/oracle codeflow runner.
- `cockpit_delegate` tool: tool-facing instant delegate runner.
- `cockpit_fast` tool: tool-facing fast delegate runner.
- `cockpit_research` tool: tool-facing read-only research delegate runner.
- `cockpit_normal` tool: tool-facing normal coding delegate runner.
- `cockpit_plan` tool: tool-facing read-only planner delegate runner.
- `cockpit_review` tool: tool-facing read-only reviewer delegate runner.

## Commands and tools

Registered `/cockpit` subcommands:

- `/cockpit status` or `/cockpit config` — show flow settings, limits, tools, and loaded config paths.
- `/cockpit setup` — run the onboarding wizard: choose a hands model, choose a reasoning model, answer the strict mode prompt, and save global config.
- `/cockpit route <task>` — analyze a task and print the selected route/profile.
- `/cockpit codeflow <task>` — run the cockpit/oracle workflow: optional research, planner, selected executor, reviewer, and feedback routing.
- `/cockpit instant <plan>` — run the instant delegate directly; the file is inferred from the plan.
- `/cockpit fast <task>` — run the fast delegate directly.
- `/cockpit research <task>` — run the read-only research delegate directly.
- `/cockpit normal <implementation plan>` — run the normal coding delegate directly.
- `/cockpit plan <task + optional research brief>` — run the read-only planner delegate directly.
- `/cockpit review <task + plan + change summary>` — run the read-only reviewer delegate directly.
- `/cockpit strict on|off` — toggle strict-mode mutation guards in global config.

Registered tools:

- `cockpit_codeflow` — accepts `plan` and optional `flow: "codeflow"`; runs the cockpit/oracle workflow.
- `cockpit_delegate` — accepts `plan`, `file`, optional `line`, and optional `flow: "instant"`; runs `delegates.instant`.
- `cockpit_fast` — accepts `plan`, optional `outputFile`, and optional `flow: "fast"`; runs `delegates.fast`.
- `cockpit_research` — accepts `plan` and optional `flow: "research"`; runs `delegates.research`.
- `cockpit_normal` — accepts `plan` and optional `flow: "normal"`; runs `delegates.normal`.
- `cockpit_plan` — accepts `plan` and optional `flow: "planner"`; runs `delegates.planner`.
- `cockpit_review` — accepts `plan` and optional `flow: "reviewer"`; runs `delegates.reviewer`.

## Configuration flow

`extensions/cockpit/config.ts` defines `DEFAULT_CONFIG` and the config lifecycle:

1. Start from defaults.
2. Load global config from `~/<Pi config dir>/cockpit/config.json`.
3. If the project is trusted, merge project config from `<cwd>/<Pi config dir>/cockpit/config.json`.
4. Normalize flow fields, tools, limits, and model inheritance.

Important defaults:

- `strictMode: false`
- `instant` tools: `read`, `edit`; thinking `off`; max 1 file / ~30 lines / 60s.
- `fast` tools: `ls`, `find`, `grep`, `read`, `write`, `edit`; thinking `low`; max 3 files / ~300 lines / 180s.
- `research` tools: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`; thinking `minimal`; max 7 fully-read files / 180s.
- `normal` tools: `ls`, `find`, `grep`, `read`, `edit`, `write`, `bash`; thinking `medium`; max 6 files / ~600 lines / 300s.
- `planner` tools: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`; thinking `xhigh`; max 3 verification files / 240s.
- `reviewer` tools: `ls`, `find`, `grep`, `read`, `bash`; thinking `high`; max 10 fully-read files / 240s.
- Disallowed domains: auth, security, persistence, deployment, architecture.
- Forbidden shell command classes include commit, push, deploy, publish, reset, clean.

`/cockpit setup` saves only global config through `saveGlobalConfig()`. The setup wizard explains the Oracle/control-room model, detects available models, asks for two model choices, prompts for strict mode, previews the delegate map, and saves on confirmation. The hands model is inherited by implementation workers (`instant`, `fast`, `normal`). The reasoning model is inherited by research/planning/review workers (`research`, `planner`, `reviewer`). Recommended setup: local model for hands and latest cloud reasoning model for reasoning.

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

`extensions/cockpit/codeflow.ts` is the cockpit/oracle workflow runner. It is not a child model role; it coordinates existing delegates:

1. Decide whether research is needed from routing signals, missing files, risk domains, and external-knowledge hints.
2. Run `research` when useful, then run `planner`.
3. If planner requests research and none was run yet, run research and re-run planner.
4. Parse planner `Execution Routing` and choose `instant`, `fast`, or `normal`, falling back to route heuristics.
5. Run selected executor.
6. Run `reviewer` over the current working-tree diff and handoff context.
7. Parse feedback weight and route: `none` approves, `light`/`medium` trigger bounded coder fixes, `heavy` triggers one planner revision, and `blocker` asks for human/cockpit decision.

Codeflow caps coder fix attempts at 2 and planner revisions at 1 for the initial loop.

### Shared protocol

`extensions/cockpit/delegates/protocol.ts` defines common names, inputs, outputs, update callbacks, and context shape. `registry.ts` exposes the current flows as `delegates.instant`, `delegates.fast`, `delegates.research`, `delegates.normal`, `delegates.planner`, and `delegates.reviewer`.

### Child Pi runner

`extensions/cockpit/delegates/child-pi.ts` starts a child Pi process with JSON mode, captures assistant `message_end` text as the final output, collects stderr, supports delegate-specific environment variables, and enforces timeout/abort behavior. It chooses the invocation from the current executable/script when possible, otherwise falls back to `pi`.


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
- Usually uses the configured judgment model, with `--thinking minimal`.
- Runs child Pi with no session, no skills/templates/context files, and a read-only tool allowlist: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`.
- Does not pass `--no-extensions` so extension-provided web tools can be available, while `--tools` keeps the child constrained to the research allowlist.
- Prompt instructs the child to inspect local code first, respect `.gitignore`, read at most 7 files fully, use web only for relevant external contracts/current docs, and return a structured Research Brief with confidence metadata, Evidence Quality, and Research Tour.
- Returns `INSUFFICIENT_CONTEXT: need deeper search` rather than inventing files/APIs/behavior when local and optional external context is insufficient.

Research boundary: child is read-only and should produce evidence for the planner, not a solution plan or code changes.

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
- Defaults to inheriting the current Pi default model rather than the fast delegate model, with `--thinking xhigh`.
- Runs child Pi with no session, no skills/templates/context files, and a read-only verification tool allowlist: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`.
- Does not pass `--no-extensions` so extension-provided web tools can be available, while `--tools` keeps the child constrained to the planner allowlist.
- Prompt instructs the child to treat the Research Brief as evidence, not absolute truth, verify only critical assumptions, and return a structured Implementation Plan with Implementation Tour, Review Checkpoints, and Coder Fix Budget.
- Returns `NEEDS_DEEPER_RESEARCH` instead of forcing a brittle plan when key context is missing.

Planner boundary: child should produce a bounded plan for the coding agent, including exact files, steps, validation commands, risks, and stop conditions. It should not edit or implement.

### Reviewer delegate

`extensions/cockpit/delegates/reviewer.ts`:

- Requires non-empty review context: original task, plan/requirements, coder summary, validation, and optionally a base/head git range.
- Defaults to the current Pi model with `--thinking high`; setup recommends using a different model/provider than the coder to catch blind spots.
- Runs child Pi with no session/extensions/skills/templates/context files and read-only review tools: `ls`, `find`, `grep`, `read`, `bash`.
- Prompt restricts bash to read-only inspection commands like `git status --short`, `git diff --stat`, `git diff`, `git log`, and listed validation commands.
- Reviews the current working-tree diff by default, or a provided git range when included in the request.
- Returns a structured review with verdict, severity buckets, review tour, plan alignment, validation assessment, Cockpit Routing Signal, and feedback weight: `none`, `light`, `medium`, `heavy`, or `blocker`.

Reviewer boundary: child does not fix code. It produces issue evidence plus a recommended route (`approve`, `coder_fix`, `planner_revision`, or `human_decision`) for the cockpit/oracle to decide.

## Safety behavior

`extensions/cockpit/safety.ts` currently only enforces strict mode in the cockpit session. When strict mode is on, direct `edit`/`write` tools are blocked and risky shell mutation patterns are blocked, including forbidden git commands, deploy/publish/apply/destroy commands, `rm -rf`, shell redirection writes, in-place sed/perl, and inline Python/Node file mutation.

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
- Flow defaults and limits belong in `config.ts`.
- Routing heuristics belong in `routing.ts`.
- Process execution concerns belong in `delegates/child-pi.ts`.
- New delegate flows should extend `protocol.ts`, be implemented under `delegates/`, and be exported from `registry.ts`.
- Tool/command mutation restrictions belong in `safety.ts`.
