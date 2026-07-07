# Cockpit Advisory Autopilot Improvement Plan

Cockpit is moving from a strict delegation framework to an advisory autopilot: the Oracle can act directly, and delegates are used when they create value.

## Completed refactor direction

- Retire strict mode as a product concept.
- Keep direct `edit`/`write` available to the Oracle.
- Keep flight-safety guards for destructive shell patterns.
- Make setup choose only hands/reasoning models.
- Make Cockpit's loaded default be advisory autopilot.
- Reframe `instant` as a discipline first and a delegate only when isolation is worth it.
- Keep `/cockpit route` as optional diagnostic output, not a normal user step.

## Phase 1: Better ambient autopilot guidance

**Problem:** The Oracle needs to know when to act directly vs delegate without the user saying "use fast" or "use ideate".

**Solution:** Continue improving tool descriptions, command descriptions, and delegate prompt snippets so the model naturally chooses:

- direct tools for tiny/interactive edits,
- `fast` for bounded noisy local work,
- `ideate` for unclear direction,
- `research` for noisy read-only investigation,
- `reviewer` for nontrivial diffs,
- `codeflow` for larger approved workflows.

## Phase 2: Interactive Codeflow Approval

**Problem:** Codeflow preplans should smoothly become approved execution when the human agrees.

**Solution:** Keep and refine the approval dialog shown when a `codeflow-preplan` finishes. Ensure approval starts `codeflow` with the original task plus approved plan/constraints.

## Phase 3: Rich Reviewer Context

**Problem:** The reviewer currently relies heavily on broad `git diff`, which can get messy with unrelated changes or multiple jobs.

**Solution:**

- Capture changed files from `normal`/`fast` job outputs.
- Store changed files in job artifacts.
- Feed focused diffs for only those files into reviewer prompts when possible.

## Phase 4: Structural Map for Discovery

**Problem:** Delegates waste time and tokens rediscovering basic repo layout.

**Solution:**

- Maintain a lightweight project skeleton.
- Pre-inject it into `fast`/`normal` where helpful.
- Avoid broad discovery in fast mode.

## Phase 5: Fast Execution Model

**Problem:** Spawning a fresh `pi` CLI process for every child job adds cold-start overhead.

**Solution:**

- Investigate persistent workers or the Pi SDK for in-process/background agent execution.
- If CLI spawning remains required, strip unnecessary startup work for delegate child processes.
- Keep direct Oracle edits as the default for latency-sensitive work.
