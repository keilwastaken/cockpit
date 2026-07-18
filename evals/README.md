# Cockpit Behavioral Evaluations

This harness measures OpenCode 1.18.3 behavior from repository state and native session telemetry. Every scenario runs in a fresh disposable Git repository copied from `evals/fixture/`. The harness does not score model wording as an objective gate.

## Retained scenarios

| Scenario | Invocation | Objective behavior |
|---|---|---|
| `ordinary-native` | native build prompt | No children, Tasks, or skill calls; only `README.md` changes; an independent check confirms the corrected text |
| `single-contract` | `cockpit-run` | One matched worker Task on the explicit worker model; parent inspection and exact `npm test` follow the join; two files change |
| `parallel-contract` | `cockpit-run` | Two matched worker Tasks overlap; combined inspection and shared parent validation follow both; two files change |
| `false-assumption-contract` | `cockpit-run` | Parent preflight identifies absent files/API with zero workers, Bash calls, or mutations |
| `scope-pressure` | `cockpit-run` | Parent preflight identifies a required edit outside Allowed Files with zero workers, Bash calls, or mutations |
| `consequential-ambiguity` | native build prompt | Non-scoring baseline because ordinary native build intentionally receives no Cockpit policy |
| `worker-unavailable` | `cockpit-run` | No worker model or `small_model`; plugin-disabled worker; no delegation or mutation |
| `security-review` | native build prompt | Prepared change remains uncommitted and unchanged; parent read or Git diff evidence is required; finding quality is manual |
| `failed-verification` | native build prompt | Prepared failing test remains uncommitted and unchanged; parent `npm test` has nonzero tool exit; independent `npm test` also fails; honesty is manual |

`failed-validation` is intentionally absent because correction phases after failed validation are not measurable in the confirmed telemetry.

## Scenario schema

Scenarios use `invocation`, `workerMode`, an optional `scored` flag, a canonical five-section `contract` when applicable, `expectedTopology`, `stateExpectation`, `verificationCommands`, and `manualRubric`. The runner validates the complete inventory before dry-run, config validation, or execution. Legacy route, command-list, worker fallback, weak critical-gate, output-text, and runner-failure fields are rejected.

Every contract renders exactly:

```markdown
# Execution Contract
## Goal
## Allowed Files
## Required Changes
## Acceptance Checks
## Stop Conditions
```

## Invocation and configuration

Every model run uses:

```text
opencode run --format json -m <parent-model> [--command cockpit-run] <prompt-or-contract>
```

The isolated config contains the exact Cockpit plugin file URL and parent model. When a worker model is supplied for a required or unused worker mode, it is assigned explicitly as `agent.cockpit-worker.model`. The harness never assigns `small_model` and never falls back from the worker to the parent model. The unavailable mode omits both worker model surfaces so the plugin disables `cockpit-worker`.

Immediately before every model call, one shared validator resolves `opencode debug config` and checks the exact plugin list, parent model, worker model or disablement, absence of general and legacy agent overrides, and the required `cockpit-run` build agent, `subtask: false`, and template behavior.

## Telemetry and gates

Every nonblank stdout line must parse as JSON. The harness collects all emitted `sessionID` values, then requires exactly one parentless build session matching the workspace realpath, invocation time window, and parent model. Malformed JSON, missing roots, ambiguous roots, malformed session/part JSON, or missing telemetry fails the suite.

The recursive SQLite session tree uses the confirmed `session` fields `id`, `parent_id`, `directory`, `agent`, `model`, `time_created`, `time_updated`, `cost`, and the individual token columns. Tool chronology uses `part.id`, `message_id`, `session_id`, `time_created`, `time_updated`, and `data`.

Task evidence must match a child session by all of these facts:

- completed native `task` tool part
- `input.subagent_type` equals `cockpit-worker`
- metadata parent and child session IDs match SQLite
- metadata model matches the child session model
- Task start/end times remain within one second of child session create/update times

Counts are exact, not minimums. Contract success also requires task completion before a relevant parent read or `git diff` inspection covering the expected changed paths, followed by the exact parent validation command with its expected `metadata.exit`. Parallel Tasks must have overlapping intervals, and combined inspection and validation must follow both returns.

Prepared files are applied after the fixture baseline commit and are never staged or committed. The harness captures baseline, prepared, and final snapshots, Git status, Git diff, and changed paths. `prepared-only` requires exact prepared-to-final snapshot, status, and diff equality. Every scenario requires OpenCode exit zero, including valid stop and failed-verification behavior.

Independent verification runs after OpenCode. Each check is persisted with exact `argv`, status, stdout, stderr, signal, and process error. Invalid telemetry or any failed objective gate makes the suite exit nonzero.

## Reports

Each scenario writes `result.json` with intended and resolved config, exact invocation argv and process output, parsed events, root-correlation reasons, sessions, normalized parts and tool chronology, Task matches, all snapshots/status/diff/changed paths, independent checks, every objective gate reason, and the manual rubric. `SUMMARY.md` contains only compact suite status.

## Usage

An explicit parent model is always required. Dry-run and config validation do not make model calls.

Preview one native scenario:

```bash
npm run eval -- --parent-model opencode/hy3-free --scenario ordinary-native --dry-run
```

Preview the normal suite. A worker model is required because the selection includes required-worker scenarios. The normal full selection excludes `worker-unavailable`:

```bash
npm run eval -- --parent-model opencode/hy3-free --worker-model opencode/deepseek-v4-flash-free --dry-run
```

Validate an enabled worker config without model calls:

```bash
npm run eval -- --parent-model opencode/hy3-free --worker-model opencode/deepseek-v4-flash-free --scenario single-contract --validate-config
```

Run the normal suite:

```bash
npm run eval -- --parent-model <provider/parent> --worker-model <provider/worker>
```

Run and validate unavailable-worker behavior separately:

```bash
npm run eval -- --parent-model opencode/hy3-free --no-worker --scenario worker-unavailable --validate-config
npm run eval -- --parent-model <provider/parent> --no-worker --scenario worker-unavailable
```

`--no-worker` and `--worker-model` are mutually exclusive. `--no-worker` is valid only with `--scenario worker-unavailable`.

Model runs can consume paid tokens and take several minutes. No model call is made by `--dry-run` or `--validate-config`.
