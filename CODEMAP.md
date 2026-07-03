# CODEMAP

## Project purpose

`pi-conductor` is a small TypeScript Pi package that adds a Conductor extension for routing tiny or small local coding/documentation tasks into child Pi delegate processes. It currently supports three delegate flows:

- `instant` — tightly scoped one-file edits from a cockpit-supplied plan.
- `fast` — small semantic tasks with limited local discovery, intended for work like codemaps.
- `research` — read-only local-first codebase research briefs for planner handoff, with optional web context when available.

## Repository layout

```text
.
├── extensions/
│   └── conductor/
│       ├── index.ts                 # Pi extension entrypoint: events, commands, tools
│       ├── config.ts                # defaults, config loading/merging/saving
│       ├── routing.ts               # task signal analysis and route decisions
│       ├── safety.ts                # strict-mode and delegate tool-call guards
│       └── delegates/
│           ├── protocol.ts          # shared delegate types
│           ├── registry.ts          # delegate registry/export surface
│           ├── child-pi.ts          # child Pi process runner and JSON output capture
│           ├── instant.ts           # instant delegate validation + prompt + run flow
│           ├── fast.ts              # fast delegate validation + prompt + run flow
│           └── research.ts          # read-only research brief validation + prompt + run flow
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

`extensions/conductor/index.ts` exports the default Pi extension function. It wires up:

- `session_start` event: loads config and sets a status item showing the selected delegate model and strict-mode state.
- `tool_call` event: applies `shouldBlockToolCall()` to enforce instant-delegate restrictions or global strict mode.
- `/conductor` command: user command with subcommands for setup, status, routing, direct delegate runs, and strict mode.
- `conductor_delegate` tool: tool-facing instant delegate runner.
- `conductor_fast` tool: tool-facing fast delegate runner.
- `conductor_research` tool: tool-facing read-only research delegate runner.

## Commands and tools

Registered `/conductor` subcommands:

- `/conductor status` or `/conductor config` — show flow settings, limits, tools, and loaded config paths.
- `/conductor setup` — select a delegate model from Pi's model registry and save global config.
- `/conductor route <task>` — analyze a task and print the selected route/profile.
- `/conductor instant <plan>` — run the instant delegate directly; the file is inferred from the plan.
- `/conductor fast <task>` — run the fast delegate directly.
- `/conductor research <task>` — run the read-only research delegate directly.
- `/conductor strict on|off` — toggle strict-mode mutation guards in global config.

Registered tools:

- `conductor_delegate` — accepts `plan`, `file`, optional `line`, and optional `flow: "instant"`; runs `delegates.instant`.
- `conductor_fast` — accepts `plan`, optional `outputFile`, and optional `flow: "fast"`; runs `delegates.fast`.

## Configuration flow

`extensions/conductor/config.ts` defines `DEFAULT_CONFIG` and the config lifecycle:

1. Start from defaults.
2. Load global config from `~/<Pi config dir>/conductor/config.json`.
3. If the project is trusted, merge project config from `<cwd>/<Pi config dir>/conductor/config.json`.
4. Normalize flow fields, tools, limits, and model inheritance.

Important defaults:

- `strictMode: false`
- `instant` tools: `read`, `edit`; thinking `off`; max 1 file / ~30 lines / 60s.
- `fast` tools: `ls`, `find`, `grep`, `read`, `write`, `edit`; thinking `low`; max 3 files / ~300 lines / 180s.
- `research` tools: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`; thinking `low`; max 7 fully-read files / 180s.
- Disallowed domains: auth, security, persistence, deployment, architecture.
- Forbidden shell command classes include commit, push, deploy, publish, reset, clean.

`/conductor setup` saves only global config through `saveGlobalConfig()`.

## Routing model

`extensions/conductor/routing.ts` performs lightweight semantic routing:

- Extracts mentioned files from common source/docs/config extensions and README references.
- Detects risk domains using keyword regexes.
- Detects coding intent, question-only prompts, ambiguity, and mechanical edits.
- Estimates file and line scope.

Routes:

- `instant` — unambiguous, low-risk work within instant limits.
- `fast` — unambiguous, low-risk small semantic work within fast limits.
- `cockpit-only` — questions or non-coding work.
- `need-decision` — ambiguous, too large, or requiring clarification/careful handling.

`formatDecision()` converts route details, risks, missing context questions, and suggested refinements into user-facing text.

## Delegate flow boundaries

### Shared protocol

`extensions/conductor/delegates/protocol.ts` defines common names, inputs, outputs, update callbacks, and context shape. `registry.ts` exposes the current flows as `delegates.instant`, `delegates.fast`, and `delegates.research`.

### Child Pi runner

`extensions/conductor/delegates/child-pi.ts` starts a child Pi process with JSON mode, captures assistant `message_end` text as the final output, collects stderr, and enforces timeout/abort behavior. It chooses the invocation from the current executable/script when possible, otherwise falls back to `pi`.

### Instant delegate

`extensions/conductor/delegates/instant.ts`:

- Requires a non-empty plan and exactly one allowed file.
- Refuses configured disallowed domains.
- Runs child Pi with no session, no extensions/skills/templates/context files, configured model, `--thinking off`, and only configured instant tools.
- Prompt instructs the child to do exactly one tiny edit, avoid scouting/redesign, stop on broader decisions, and return a compact summary.

Instant boundary: child scope is a cockpit-supplied plan plus allowed file(s), with safety enforcement in `safety.ts` via `PI_CONDUCTOR_DELEGATE_FLOW=instant` and `PI_CONDUCTOR_ALLOWED_FILES` if those env vars are set by the runtime.

### Fast delegate

`extensions/conductor/delegates/fast.ts`:

- Requires a non-empty plan.
- Refuses risky domains except architecture is allowed through the fast validator for routing purposes.
- Defaults output file to `CODEMAP.md` (`CODEMAP` is normalized to `CODEMAP.md`).
- Runs child Pi with no session/extensions/skills/templates/context files, configured model, `--thinking low`, and fast tools.
- Prompt explicitly limits changes to at most configured file/line counts and asks codemap tasks to identify entrypoints, major directories, config/package files, extension/tool flows, and delegate boundaries.

Fast boundary: child may do targeted local discovery and write/edit the requested output, but should not modify source unless the plan asks for it.

### Research delegate

`extensions/conductor/delegates/research.ts`:

- Requires a non-empty task.
- Uses the same model chosen for instant/fast, with `--thinking low`.
- Runs child Pi with no session, no skills/templates/context files, and a read-only tool allowlist: `ls`, `find`, `grep`, `read`, `web_search`, `web_fetch`.
- Does not pass `--no-extensions` so extension-provided web tools can be available, while `--tools` keeps the child constrained to the research allowlist.
- Prompt instructs the child to inspect local code first, respect `.gitignore`, read at most 7 files fully, use web only for relevant external contracts/current docs, and return a structured Research Brief with confidence metadata.
- Returns `INSUFFICIENT_CONTEXT: need deeper search` rather than inventing files/APIs/behavior when local and optional external context is insufficient.

Research boundary: child is read-only and should produce evidence for the planner, not a solution plan or code changes.

## Safety behavior

`extensions/conductor/safety.ts` has two modes:

- Instant delegate mode (`PI_CONDUCTOR_DELEGATE_FLOW=instant`): blocks any tool outside instant tools and restricts `read`/`edit` to `PI_CONDUCTOR_ALLOWED_FILES`.
- Strict mode (`config.strictMode`): blocks direct `edit`/`write` tools and risky shell mutation patterns, including forbidden git commands, deploy/publish/apply/destroy/release commands, `rm -rf`, shell redirection writes, in-place sed/perl, and inline Python/Node file mutation.

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

- Command/tool registration usually starts in `extensions/conductor/index.ts`.
- Flow defaults and limits belong in `config.ts`.
- Routing heuristics belong in `routing.ts`.
- Process execution concerns belong in `delegates/child-pi.ts`.
- New delegate flows should extend `protocol.ts`, be implemented under `delegates/`, and be exported from `registry.ts`.
- Tool/command mutation restrictions belong in `safety.ts`.
