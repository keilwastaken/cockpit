# Cockpit Context-Budget Autopilot Improvement Plan

Cockpit is a context-budget autopilot: the Oracle stays small and strategic, while delegates absorb noisy detail work on cheaper/faster/specialized models. Direct action remains available for tiny maneuvers where delegation overhead would cost more than it saves.

## Completed refactor direction

- Retire strict mode as a product concept.
- Keep direct `edit`/`write` available for tiny maneuvers.
- Keep flight-safety guards for destructive shell patterns.
- Make setup choose only hands/reasoning models.
- Make Cockpit's loaded default be context-budget autopilot.
- Reframe `instant` as a discipline first and a delegate when isolation is worth it.
- Extract portable role skills under `skills/`.
- Keep `/cockpit route` as optional diagnostic output, not a normal user step.

## Phase 1: Context-budget routing guidance

**Problem:** The Oracle needs to know when to spend its own context vs delegate without the user saying "use fast" or "use ideate".

**Policy:**

- If the task needs <= 1 file and <= 2 tool calls, direct is fine.
- If the task needs search, multiple files, tests/logs, uncertainty, review, or a cheaper/specialized model, delegate.
- Delegation is preferred whenever it protects Oracle context.

**Solution:** Continue improving tool descriptions, command descriptions, and skill text so the model naturally chooses:

- direct tools for tiny maneuvers,
- `fast` for bounded noisy local work,
- `ideate` for unclear direction,
- `research` for noisy read-only investigation,
- `reviewer` for nontrivial diffs,
- `codeflow` for larger approved workflows.

## Phase 2: Portable skills + runtime orchestration

**Problem:** Role prompts alone are commodity and should be portable.

**Solution:** Keep role definitions under `skills/` for use in other agents, while Cockpit Runtime provides Pi-specific orchestration: background jobs, artifacts, parallel work, approval gates, model routing, review routing, and safety.

## Phase 3: Interactive Codeflow Approval

**Problem:** Codeflow preplans should smoothly become approved execution when the human agrees.

**Solution:** Keep and refine the approval dialog shown when a `codeflow-preplan` finishes. Ensure approval starts `codeflow` with the original task plus approved plan/constraints.

## Phase 4: Rich Reviewer Context

**Problem:** The reviewer currently relies heavily on broad `git diff`, which can get messy with unrelated changes or multiple jobs.

**Solution:**

- Capture changed files from `normal`/`fast` job outputs.
- Store changed files in job artifacts.
- Feed focused diffs for only those files into reviewer prompts when possible.

## Phase 5: Fast Execution Model

**Problem:** Spawning a fresh `pi` CLI process for every child job adds cold-start overhead.

**Solution:**

- Investigate persistent workers or the Pi SDK for in-process/background agent execution.
- If CLI spawning remains required, strip unnecessary startup work for delegate child processes.
- Keep direct Oracle edits only for latency-sensitive tiny maneuvers.
