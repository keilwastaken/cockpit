<img src="./icon.png" width="150" align="right" alt="Cockpit Logo">

# Cockpit

Small Pi delegation router where the main chat is the Oracle.

## The Cockpit Philosophy

The entire point of **Cockpit** is to keep the main chat session as a pristine **Oracle / Control Room**.

1. **The Main Chat is the Oracle**: The model running in the main chat acts as the high-level architect and decision-maker. It holds the user's ultimate goals, preferences, and context. It does not get bogged down reading thousands of lines of `rg` output or wrestling with Git diffs.
2. **Strict Mode Forces Delegation**: Running `/cockpit strict on` strips the `edit` and `write` tools from the main chat. The Oracle is *forced* to route mutation tasks through the delegates. It becomes physically impossible for the main chat to bloatedly rewrite a file directly.
3. **Absolute Context Isolation**: Every delegate (`ideate`, `research`, `planner`, `normal`, `reviewer`) is spawned using `child-pi.ts` with `--no-session` and without loading extra context. Delegates are amnesiac, single-purpose workers. They wake up, execute their highly specific prompt using their isolated tool allowlist, return a compact markdown summary, and die. The main Oracle chat only ever sees the clean summary, saving massive amounts of context tokens.
4. **The `codeflow` Tool**: Instead of the Oracle manually calling `research`, waiting, calling `planner`, waiting, and calling `normal`, it uses the `cockpit_codeflow` tool. The Oracle calls `cockpit_codeflow` and the TypeScript orchestrator spins up the workers, passes context between them, handles the review loop, and manages the coder fix budget. The Oracle gets back a single, clean `# Codeflow Result`.

---

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
- `/cockpit ideate <unclear feature/refactor/product direction>`
- `/cockpit normal <implementation plan>`
- `/cockpit plan <task + optional research brief>`
- `/cockpit review <task + plan + change summary>`
- `/cockpit strict on|off`

Tiny, exact, low-risk one-file edits are routed to the `instant` delegate flow. Small semantic tasks can use the `fast` delegate flow. When the user does not yet know what they want, the read-only `ideate` delegate runs divergent passes and returns option space plus a recommendation; the Oracle surfaces that recommendation and the human decides. Planner handoffs can start with the read-only `research` delegate flow, move through the high-reasoning `planner` flow, execute with `normal` when the change needs a bounded coding delegate, then review with `reviewer`. `/cockpit codeflow` orchestrates those steps as a cockpit-controlled workflow.

`instant` is the first delegate flow: the cockpit sends one simple plan plus the exact file, optionally a target line, and the worker runs with only `read` + `edit` by default so it can do the one change without scouting or expanding scope.

`fast` usually uses the same implementation model chosen for instant, turns thinking to `low`, and gets `ls`, `find`, `grep`, `read`, `write`, and `edit` so it can do small local discovery tasks like writing `CODEMAP.md` without bloating the cockpit.

`research` usually uses the reasoning model with minimal thinking, but is read-only. It gets `ls`, `find`, `grep`, `read`, and optional web tools (`web_search`, `web_fetch`) so it can produce a concise Research Brief for a planner without editing the repo.

`ideate` usually uses the reasoning model plus the hands model as a second perspective when available. It is read-only and runs divergent passes: pragmatic path, ambitious path, and risk/maintenance path. It then synthesizes the options into a recommendation. The Oracle should not choose the direction by itself; it presents the recommendation and asks the human to approve or choose before planning/codeflow.

`planner` is read-only and high-reasoning. It takes the user task, human-approved direction, and optional Research Brief and returns a bounded Implementation Plan for the coding agent, including files, steps, validation commands, risks, and stop conditions.

`normal` usually uses the implementation model with medium thinking and a terse coding-executor prompt. It can edit/write files and run safe validation commands from the plan.

`reviewer` is read-only and returns calibrated issues plus a feedback weight: `none`, `light`, `medium`, `heavy`, or `blocker`. The cockpit uses that weight to approve, send a small fix back to coder, replan, or ask the human.

`codeflow` is the full cockpit/oracle loop: it decides whether research is needed, runs planner, chooses `instant`/`fast`/`normal`, runs reviewer, and routes feedback through coder fixes, planner revision, or human decision. For obvious `instant` or `fast` work, the Oracle can skip `codeflow` and call the direct delegate with its own compact plan, using `planner` only when a verbose handoff would help.


Run `/cockpit setup` for the onboarding wizard. Setup is simplified to two model choices: the **hands model** inherited by implementation workers (`instant`, `fast`, `normal`) and the **reasoning model** inherited by ideation/research/planning/review workers (`ideate`, `research`, `planner`, `reviewer`). Recommended: local model for hands, latest cloud reasoning model for reasoning. Thinking is forced per flow: instant off, research minimal, ideate high, fast low, normal medium, planner xhigh, reviewer high. Strict mode is recommended so the main chat stays the Oracle and delegates perform code mutation.
