# pi-conductor

Small Pi delegation router.

## Code map

This project is a small Pi delegation router:

- `package.json` — package metadata and scripts.
- `tsconfig.json` — TypeScript compiler settings.
- `extensions/conductor/index.ts` — Pi extension entry point and command/tool registration.
- `extensions/conductor/config.ts` — conductor configuration helpers.
- `extensions/conductor/delegates/` — delegate protocol, registry, child Pi runner, and flow implementations.
- `extensions/conductor/routing.ts` — routing decisions for delegate eligibility.
- `extensions/conductor/safety.ts` — safety checks for low-risk edits.

Commands:

- `/conductor status`
- `/conductor setup`
- `/conductor route <task>`
- `/conductor instant <simple plan mentioning one file>`
- `/conductor fast <small semantic task>`
- `/conductor research <task>`
- `/conductor normal <implementation plan>`
- `/conductor plan <task + optional research brief>`
- `/conductor strict on|off`

Tiny, exact, low-risk one-file edits are routed to the `instant` delegate flow. Small semantic tasks can use the `fast` delegate flow. Planner handoffs can start with the read-only `research` delegate flow, move through the high-reasoning `planner` flow, then execute with `normal` when the change needs a bounded coding delegate.

`instant` is the first delegate flow: the cockpit sends one simple plan plus the exact file, optionally a target line, and the worker runs with only `read` + `edit` by default so it can do the one change without scouting or expanding scope.

`fast` uses the same model chosen for instant, turns thinking to `low`, and gets `ls`, `find`, `grep`, `read`, `write`, and `edit` so it can do small local discovery tasks like writing `CODEMAP.md` without bloating the cockpit.

`research` also uses the base delegate model with minimal thinking, but is read-only. It gets `ls`, `find`, `grep`, `read`, and optional web tools (`web_search`, `web_fetch`) so it can produce a concise Research Brief for a planner without editing the repo.

`planner` is read-only and high-reasoning. It takes the user task plus optional Research Brief and returns a bounded Implementation Plan for the coding agent, including files, steps, validation commands, risks, and stop conditions.

`normal` reuses the base delegate model with medium thinking and a terse coding-executor prompt. It can edit/write files and run safe validation commands from the plan.

Run `/conductor setup` to choose the base Pi model used by instant/fast/research/normal delegates. Planner inherits the current Pi default unless configured separately. Thinking is forced per flow: instant off, research minimal, fast low, normal medium, planner xhigh.
