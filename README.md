<img src="./icon.png" width="150" align="right" alt="Cockpit Logo">

# Cockpit

Small Pi delegation router where the main chat is the Oracle.

## The Cockpit Philosophy

The entire point of **Cockpit** is to keep the main chat session as a pristine **Oracle / Control Room**.

1. **The Main Chat is the Oracle**: The model running in the main chat acts as the high-level architect and decision-maker. It holds the user's ultimate goals, preferences, and context. It does not get bogged down reading thousands of lines of `rg` output or wrestling with Git diffs.
2. **Strict Mode Forces Delegation**: Running `/cockpit strict on` strips the `edit` and `write` tools from the main chat. The Oracle is *forced* to route mutation tasks through the delegates. It becomes physically impossible for the main chat to bloatedly rewrite a file directly.
3. **Absolute Context Isolation**: Every delegate (`instant`, `fast`, `ideate`, `research`, `planner`, `task-writer`, `normal`, `reviewer`) is spawned using `child-pi.ts` with `--no-session` and without loading extra context. Delegates are amnesiac, single-purpose workers. They wake up, execute their highly specific prompt using their isolated tool allowlist, return a compact markdown summary, and die. The main Oracle chat only ever sees the clean summary, saving massive amounts of context tokens.
4. **The `codeflow` Tool**: Instead of the Oracle manually calling `research`, waiting, calling `planner`, waiting, and calling `normal`, it uses the `cockpit_codeflow` tool. The first call is approval-gated: without explicit approval, Cockpit starts a read-only preplan job only. After the Oracle shows that plan to the user and receives approval, approved codeflow starts a background writer/reviewer job and the TypeScript orchestrator spins up the workers, passes context between them, handles the review loop, and manages the coder fix budget. The Oracle gets a job id immediately and can read the clean result with `/cockpit job <id>`.

---

## Code map

This project is a small Pi delegation router:

- `package.json` — package metadata and scripts.
- `tsconfig.json` — TypeScript compiler settings.
- `extensions/cockpit/index.ts` — Pi extension entry point and command/tool registration.
- `extensions/cockpit/codeflow.ts` — cockpit/oracle workflow orchestration.
- `extensions/cockpit/config.ts` — cockpit configuration helpers.
- `extensions/cockpit/delegates/` — delegate protocol, registry, child Pi runner, and flow implementations.
- `extensions/cockpit/jobs/` — async job registry/service for delegate/codeflow starts, progress display, read/list/resume/cancel/cleanup, and `.pi/cockpit/jobs/<id>/` artifacts.
- `extensions/cockpit/routing.ts` — routing decisions for delegate eligibility.
- `extensions/cockpit/safety.ts` — safety checks for low-risk edits.

Commands:

- `/cockpit status`
- `/cockpit setup`
- `/cockpit route <task>`
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
- `/cockpit strict on|off`

Tiny, exact, low-risk one-file edits are routed to the `instant` delegate flow. Small semantic tasks can use the `fast` delegate flow. When the user does not yet know what they want, the read-only `ideate` delegate runs divergent passes and returns option space plus a recommendation; the Oracle surfaces that recommendation and the human decides. Planner handoffs can start with the read-only `research` delegate flow, move through the high-reasoning `planner` flow, execute with `normal` when the change needs a bounded coding delegate, then review with `reviewer`. `/cockpit codeflow` orchestrates those steps as a cockpit-controlled workflow.

`instant` is the first delegate flow: the cockpit sends one simple plan plus the exact file, optionally a target line, and the worker runs with only `read` + `edit` by default so it can do the one change without scouting or expanding scope.

`fast` usually uses the same implementation model chosen for instant, turns thinking to `low`, and gets `ls`, `find`, `grep`, `read`, `write`, and `edit` so it can do small local discovery tasks like writing `CODEMAP.md` without bloating the cockpit.

`research` usually uses the reasoning model with minimal thinking, but is read-only. It gets `ls`, `find`, `grep`, `read`, and optional web tools (`web_search`, `web_fetch`) so it can produce a concise Research Brief for a planner without editing the repo.

`ideate` usually uses the reasoning model plus the hands model as a second perspective when available. It is read-only and runs divergent passes: pragmatic path, ambitious path, and risk/maintenance path. It then synthesizes the options into a recommendation. The Oracle should not choose the direction by itself; it presents the recommendation and asks the human to approve or choose before planning/codeflow.

`planner` is read-only and high-reasoning. It takes the user task, human-approved direction, and optional Research Brief and returns a bounded Implementation Plan for the coding agent, including files, steps, validation commands, risks, and stop conditions.

`task-writer` is a low-thinking PM-style delegate. It turns ideas, bugs, and backlog items into durable markdown task plans inspired by migration-plan docs: status/date/scope metadata, rationale, boundaries, phased task tables, acceptance criteria, suggested Cockpit route, validation plan, risks, open questions, implementation order, and ready-to-run prompts for future agents. It can return the plan inline or write/update a specified markdown file.

`normal` usually uses the implementation model with medium thinking and a terse coding-executor prompt. It can edit/write files and run safe validation commands from the plan.

`reviewer` is read-only and returns calibrated issues plus a feedback weight: `none`, `light`, `medium`, `heavy`, or `blocker`. The cockpit uses that weight to approve, send a small fix back to coder, replan, or ask the human.

`codeflow-preplan` is the approval-gated front door for larger autonomous work: it runs only read-only research/planning and returns a plan marked for human approval. `/cockpit preplan <task>` uses this directly, and `/cockpit codeflow <task>` without `--approved` is downgraded to this safe preplan behavior.

`codeflow` is the full cockpit/oracle loop after explicit approval: it decides whether research is needed, runs planner, chooses `instant`/`fast`/`normal`, runs reviewer, and routes feedback through coder fixes, planner revision, or human decision. Use `/cockpit codeflow --approved <task plus approved plan/constraints>` or `cockpit_codeflow` with `approved=true` only after the user approves the initial plan/slice. For obvious `instant` or `fast` work, the Oracle can skip `codeflow` and call the direct delegate with its own compact plan, using `planner` only when a verbose handoff would help.

All direct delegate/codeflow commands and delegate tools now start background jobs and immediately return control to the Oracle chat, including `instant` and `fast`. Use `/cockpit normal <task>`, `/cockpit preplan <task>`, `/cockpit codeflow --approved <approved task/plan>`, or `/cockpit async normal <task>` to start one job; use `/cockpit parallel research:inspect auth | reviewer:review current diff` or file-owned syntax like `/cockpit parallel task-writer->tasks/dynamodb-migration.md:write DynamoDB plan | task-writer->tasks/flutter-api-client-migration.md:write Flutter API plan`; Cockpit rejects duplicate owned files and injects a write-only-that-file guard. The `cockpit_job` action `startMany` also starts independent jobs in parallel and supports optional per-job `outputFile` ownership. Use `/cockpit jobs` to list, `/cockpit job <id>` to read output and artifact paths, `/cockpit resume <id>` to continue from a failed/cancelled job's generated resume prompt, `/cockpit cleanup` or `/cleanup` to remove job artifact files, and `/cockpit cancel <id>` to abort. `/cockpit async taskWriter <task>` remains accepted as an alias, but job summaries/details display the canonical `task-writer` flow name. While jobs run, Cockpit shows a footer count plus a small progress widget below the editor; progress is estimated from elapsed time vs the flow timeout. Jobs keep in-memory state for the current Pi process and also write lightweight artifacts under `.pi/cockpit/jobs/<jobId>/` (`status.json`, `events.jsonl`, `plan.md`, `output.md`, step logs, and `resume.md` on failure).


Run `/cockpit setup` for the onboarding wizard. Setup is simplified to two model choices: the **hands model** inherited by implementation workers (`instant`, `fast`, `normal`) and the **reasoning model** inherited by ideation/research/planning/review/task-writing workers (`ideate`, `research`, `planner`, `reviewer`, `task-writer`). Recommended: local model for hands, latest cloud reasoning model for reasoning. Thinking is forced per flow: instant off, research minimal, task-writer low, ideate high, fast low, normal medium, planner xhigh, reviewer high. Strict mode is recommended so the main chat stays the Oracle and delegates perform code mutation.
