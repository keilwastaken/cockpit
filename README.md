# pi-cockpit

Small Pi delegation router.

## Code map

This project is a small Pi delegation router:

- `package.json` — package metadata and scripts.
- `tsconfig.json` — TypeScript compiler settings.
- `extensions/cockpit/index.ts` — Pi extension entry point and command/tool registration.
- `extensions/cockpit/codeflow.ts` — cockpit/oracle workflow orchestration.
- `extensions/cockpit/config.ts` — cockpit configuration helpers.
- `extensions/cockpit/delegates/` — delegate protocol, registry, child Pi runner, and flow implementations.
- `extensions/cockpit/routing.ts` — routing decisions for delegate eligibility.
- `extensions/cockpit/safety.ts` — safety checks for low-risk edits.

Commands:

- `/cockpit status`
- `/cockpit setup`
- `/cockpit route <task>`
- `/cockpit codeflow <task>`
- `/cockpit instant <simple plan mentioning one file>`
- `/cockpit fast <small semantic task>`
- `/cockpit research <task>`
- `/cockpit normal <implementation plan>`
- `/cockpit plan <task + optional research brief>`
- `/cockpit review <task + plan + change summary>`
- `/cockpit strict on|off`

Tiny, exact, low-risk one-file edits are routed to the `instant` delegate flow. Small semantic tasks can use the `fast` delegate flow. Planner handoffs can start with the read-only `research` delegate flow, move through the high-reasoning `planner` flow, execute with `normal` when the change needs a bounded coding delegate, then review with `reviewer`. `/cockpit codeflow` orchestrates those steps as a cockpit-controlled workflow.

`instant` is the first delegate flow: the cockpit sends one simple plan plus the exact file, optionally a target line, and the worker runs with only `read` + `edit` by default so it can do the one change without scouting or expanding scope.

`fast` uses the same model chosen for instant, turns thinking to `low`, and gets `ls`, `find`, `grep`, `read`, `write`, and `edit` so it can do small local discovery tasks like writing `CODEMAP.md` without bloating the cockpit.

`research` also uses the base delegate model with minimal thinking, but is read-only. It gets `ls`, `find`, `grep`, `read`, and optional web tools (`web_search`, `web_fetch`) so it can produce a concise Research Brief for a planner without editing the repo.

`planner` is read-only and high-reasoning. It takes the user task plus optional Research Brief and returns a bounded Implementation Plan for the coding agent, including files, steps, validation commands, risks, and stop conditions.

`normal` reuses the base delegate model with medium thinking and a terse coding-executor prompt. It can edit/write files and run safe validation commands from the plan.

`reviewer` is read-only and returns calibrated issues plus a feedback weight: `none`, `light`, `medium`, `heavy`, or `blocker`. The cockpit uses that weight to approve, send a small fix back to coder, replan, or ask the human.

`codeflow` is the cockpit/oracle loop: it decides whether research is needed, runs planner, chooses `instant`/`fast`/`normal`, runs reviewer, and routes feedback through coder fixes, planner revision, or human decision.


Run `/cockpit setup` to choose the base Pi model used by instant/fast/research/normal delegates. Planner and reviewer inherit the current Pi default unless configured separately. Thinking is forced per flow: instant off, research minimal, fast low, normal medium, planner xhigh, reviewer high. Recommended: use a different reviewer model/provider than the coder.
