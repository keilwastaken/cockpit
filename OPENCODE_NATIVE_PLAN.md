# OpenCode-Native Prompt Contracts

## Status

Approved and implemented. It supersedes the cross-host prompt-contract plan.

## Goal

Make Cockpit OpenCode-native for now while completing the Markdown SOW, compact return, cache-safe prompt layout, and cache-observability work already present in the worktree.

The change removes Claude Code and Pi support without compatibility shims. It preserves all 11 canonical skills, OpenCode setup and doctor commands, three reasoning subagents, built-in `explore` and `general` hands roles, behavioral evaluations, cost benchmarking, and historical scorecards.

## Approved Direction

- OpenCode is the only supported host.
- Delete Claude Code and Pi adapters, package entries, documentation, generation paths, and tests.
- Keep `COCKPIT_BOOTSTRAP_V2`.
- Keep one role inventory containing only `cockpit-strategist`, `cockpit-planner`, and `cockpit-reviewer`.
- Continue using built-in OpenCode `explore` for research and `general` for execution.
- Keep all canonical skills, including `cockpit-research` and `cockpit-execute`.
- Use compact Markdown SOWs with only applicable fields in this order:
  - `Goal`
  - `Scope`
  - `Required Evidence or Edits`
  - `Validation`
  - `Stop Conditions`
- Keep worker returns as specialized Markdown packets.
- Use optional XML only around large or untrusted variable payloads, never as a security boundary.
- Keep runtime OpenCode bootstrap assembly.
- Report raw cache-read and cache-write observations without hit-rate, savings, or causal claims.
- Add no dependency, runtime, provider setting, credential, model call, commit, or push.

## Baseline

- Expected `HEAD`: `0b39ee460484f97fe7cc9222c23367b05ac63162`.
- The current dirty worktree contains intentional partial prompt-contract implementation.
- Execution must integrate that work without reset, checkout, stash, or broad regeneration before canonical source edits.

## Delete

Delete these tracked host surfaces completely:

- `.claude-plugin/plugin.json`
- `agents/cockpit-strategist.md`
- `agents/cockpit-planner.md`
- `agents/cockpit-reviewer.md`
- `agents/cockpit-research.md`
- `agents/cockpit-executor.md`
- `commands/cockpit-setup.md`
- `commands/cockpit-doctor.md`
- `hooks/hooks.json`
- `hooks/session-start.mjs`
- `extensions/cockpit.js`
- `docs/README.claude.md`
- `docs/README.pi.md`

Remove empty parent directories where applicable.

## Change

### Product And Package

- `package.json`
- `package-lock.json`
- `README.md`
- `CODEMAP.md`
- `MIGRATION_PLAN.md`
- `skills/README.md`

### Prompt Contracts

- `skills/using-cockpit/SKILL.md`
- `skills/cockpit-execute/SKILL.md`
- `skills/cockpit-parallel/SKILL.md`
- `skills/cockpit-plan/SKILL.md`
- `skills/cockpit-research/SKILL.md`
- `skills/cockpit-review/SKILL.md`
- `docs/handoff-contracts.md`
- `docs/methodology.md`
- `docs/README.opencode.md`

### OpenCode Adapter

- `scripts/adapter-definition.mjs`
- `scripts/generate-adapters.mjs`
- `.opencode/plugins/cockpit.js` generated from source

### Cache Reporting

- `evals/cost/README.md`
- `scripts/summarize-cost-benchmark.mjs`

### Tests

- `tests/adapters.test.js`
- `tests/skills.test.js`
- `tests/cost-benchmark.test.js`

## Keep Unchanged

- All canonical skill files not listed above.
- `.opencode/package.json` and `.opencode/package-lock.json`.
- `scripts/cost-benchmark-core.mjs`.
- `scripts/run-cost-benchmark.mjs`.
- `scripts/prepare-cost-benchmark-review.mjs`.
- Behavioral and cost scenarios and fixtures.
- `.github/workflows/ci.yml`.
- Every file under `evals/cost/scorecards/`.
- Provider and user configuration.

## Phase 1: Remove Retired Hosts

Update `package.json`:

- describe Cockpit as OpenCode-native;
- remove `pi-package` and `claude-code` keywords;
- remove `.claude-plugin`, `agents`, `commands`, `extensions`, and `hooks` from `files`;
- remove the complete `pi` metadata object;
- retain `.opencode`, docs, evals, scripts, skills, icon, license, README, scripts, and `main`.

Reconcile `package-lock.json` with the dependency-free root manifest. Remove only stale Pi root metadata and Pi-only lock entries. Add or upgrade nothing and do not use network-dependent installation.

Delete every listed Claude/Pi file.

### Checkpoint

- Deleted paths are absent.
- Package metadata advertises only OpenCode.
- No dependency was added or upgraded.

## Phase 2: Simplify Adapter Definitions

In `scripts/adapter-definition.mjs`:

- retain the 11-skill inventory and V2 marker;
- replace the five-role plus filtered-role arrangement with one exported role array containing strategist, planner, and reviewer;
- retain each role's skill, description, and read-only status;
- keep only the OpenCode action mapping;
- retain setup and doctor behavior for built-in `explore`, built-in `general`, model assignments, permissions, and legacy user-config warnings.

Update evaluation, benchmark, and tests to import the single role inventory. Do not create research or executor subagents.

### Checkpoint

- Exactly three configured reasoning roles remain.
- Built-in `explore` and `general` remain the only hands roles.
- Setup, doctor, model routing, and permissions are unchanged.

## Phase 3: Make Generation OpenCode-Only

In `scripts/generate-adapters.mjs`:

- remove Pi rendering;
- remove Claude manifest, hook, command, and agent rendering;
- remove generic multi-host bootstrap composition;
- generate only `.opencode/plugins/cockpit.js`;
- keep runtime reading of `skills/using-cockpit/SKILL.md`;
- keep setup/doctor registration and deterministic assembly;
- make `--check` validate only the OpenCode artifact;
- add no retired-host output or shim.

Regenerate `.opencode/plugins/cockpit.js` only.

### Checkpoint

- Generator source contains no Claude/Pi branch.
- Generation does not recreate any deleted path.
- OpenCode plugin remains deterministic and fresh.

## Phase 4: Correct Bootstrap Detection

Suppress injection only when a text part starts with:

```text
COCKPIT_BOOTSTRAP_V<integer>

You have Cockpit skills available. The using-cockpit skill is already loaded below; do not load it again for this conversation.
```

The version may be V1, V2, or a future integer, but the exact preamble must immediately follow the marker and blank line.

Do not suppress injection for:

- marker text later in ordinary prose;
- text beginning with a marker followed by unrelated prose;
- malformed or partial markers;
- a marker in another part without the exact Cockpit preamble.

Prepend a separate bootstrap part and preserve every byte and metadata field of the original user part.

### Checkpoint

- Valid current and older Cockpit bootstrap parts suppress duplicate injection.
- Unrelated marker prose cannot disable Cockpit.
- V2 is the only generated bootstrap body.

## Phase 5: Finish Markdown Contracts

In `skills/using-cockpit/SKILL.md`, include literal ordered Markdown headings:

```markdown
## Goal
## Scope
## Required Evidence or Edits
## Validation
## Stop Conditions
```

Keep the complete skill no longer than 60 lines.

Preserve:

- oracle ownership;
- human approval and escalation;
- hands-worker eligibility;
- worker fallback;
- orchestration-free behavior;
- fresh verification.

Retain these format rules:

- only applicable headings;
- no empty boilerplate;
- stable instructions before the final variable SOW;
- no copied bootstrap, methodology, or known context;
- optional XML only around large/untrusted payloads;
- XML does not sanitize, authorize, authenticate, or prevent injection;
- no prompt padding for cache thresholds.

Finish compact return guidance in research, execute, plan, and review. Keep parallel packets on the same canonical fields without aliases. Align `docs/handoff-contracts.md` and `docs/methodology.md`.

### Checkpoint

- Field names and order are structurally testable.
- Compactness removes repetition, not evidence, uncertainty, validation, escalation, or stop reasons.

## Phase 6: Update OpenCode-Native Documentation

Update active documentation to say Cockpit is OpenCode-native and document only:

- the OpenCode plugin;
- `/cockpit-setup` and `/cockpit-doctor`;
- strategist, planner, and reviewer reasoning subagents;
- built-in `explore` and `general` hands roles;
- OpenCode-native generation, evaluation, and benchmarking.

Remove Pi/Claude installation and lifecycle instructions from README, CODEMAP, package docs, and migration status.

`MIGRATION_PLAN.md` may mention retired hosts only as historical removal, never as current support.

Retain `OPENCODE_DISABLE_CLAUDE_CODE` only where it remains an OpenCode isolation control. Do not present it as supported Claude functionality.

### Checkpoint

- Active product text no longer says portable, cross-host, or cross-harness.
- Historical language is clearly historical.
- OpenCode setup and doctor remain accurately documented.

## Phase 7: Correct Cache Precision

In `scripts/summarize-cost-benchmark.mjs`:

- report raw cache-read and cache-write medians in overall and scenario tables;
- preserve fractional medians rather than applying `Math.round`;
- report exact arithmetic sums in matrix totals;
- do not hide absent validated telemetry with fallback coercion;
- keep cache counters out of quality, support predicates, causal deltas, and cost/savings claims;
- retain provider-normalized and ambiguous-zero qualifications.

Do not edit historical scorecards.

### Checkpoint

- Fractional medians render exactly.
- Matrix totals match fixture arithmetic exactly.
- No hit-rate, avoided-cost, savings, causal, billing, or semantic non-duplication claim is generated.

## Phase 8: Rewrite Tests

### Skill Tests

- Assert literal SOW headings and compare their indices for exact order.
- Assert omission of empty sections and absence of old aliases.
- Assert Markdown default, narrow XML use, XML non-security status, no padding, and final variable SOW placement.
- Preserve oracle, approval, delegation, orchestration-free, verification, and 60-line tests.

### Adapter Tests

- Remove all Pi fakes/tests and Claude manifest/hook/agent tests.
- Assert one three-role OpenCode inventory and all 11 skills.
- Assert setup/doctor and built-in hands-role contracts.
- Functionally test structural duplicate detection for valid V2, valid older version, unrelated prose, wrong preamble, and malformed marker.
- Assert the original user part remains byte-for-byte and metadata-identical.
- Assert generation freshness and absence of deleted host paths.
- Parse `npm pack --dry-run --json`; require OpenCode, skills, evals, scripts, and historical scorecards, and reject deleted host prefixes.

### Cost Tests

Use distinct values per arm and job so assertions cover fractional medians and exact sums. Parse table rows and assert exact cells rather than generic number matches.

Retain existing telemetry, gate, matrix, blind-review, and support behavior tests.

## Acceptance Criteria

- Every listed Claude/Pi file is deleted and not regenerated.
- Package metadata has no Pi/Claude keyword, file entry, or Pi block.
- Root lockfile contains no stale Pi tree and no new dependency.
- One three-role OpenCode inventory remains.
- Built-in `explore` and `general` remain the hands roles.
- Setup, doctor, all 11 skills, evals, and cost benchmark remain available.
- V2 is the only generated body and unrelated marker prose cannot suppress it.
- Exact SOW headings appear in order within a 60-line bootstrap.
- Fractional cache medians and exact totals are tested.
- Packed output contains no retired host surface.
- Active docs consistently describe OpenCode-native support.
- Historical scorecards are unchanged.
- No model call, provider change, dependency addition, commit, or push occurs.

## Validation

Run in order:

```bash
git status --short
git rev-parse HEAD
npm run generate
npm run check:generated
node --test tests/skills.test.js
node --test tests/adapters.test.js
node --test tests/cost-benchmark.test.js
npm test
npm run check
npm pack --dry-run --json
git diff --check
git diff --exit-code -- evals/cost/scorecards
git status --short
git diff --stat
```

Inspect packed paths and require every retired prefix to be absent.

Review reference searches across active product surfaces:

```bash
git grep -nEi 'Claude Code|claude-code|pi-package|\.claude-plugin|extensions/cockpit|hooks/session-start' -- package.json README.md CODEMAP.md MIGRATION_PLAN.md skills docs scripts tests evals
git grep -nEi 'portable|cross-host|cross-harness' -- package.json README.md CODEMAP.md MIGRATION_PLAN.md skills docs evals
```

The OpenCode isolation variable `OPENCODE_DISABLE_CLAUDE_CODE` is permissible when technically required. Historical removal notes must not imply current support. No active Pi support reference is permitted.

No validation command may invoke a model or provider operation.

## Risks

- Broad deletion could remove OpenCode setup/doctor files with similar names.
- Marker detection could still be broad enough for user prose to disable initialization.
- Lockfile cleanup could accidentally introduce dependency changes.
- Role consolidation could break eval/benchmark imports.
- Cache arithmetic could be correct internally but rounded during rendering.
- Existing partial prompt/cache changes could be lost through reset or premature regeneration.

## Stop Conditions

Stop and return for replanning if:

- `HEAD` is no longer `0b39ee4` or unrelated dirty files appear;
- OpenCode requires retaining a Claude/Pi adapter branch or shim;
- lockfile cleanup requires network access, dependency addition, or upgrade;
- structural detection requires an OpenCode API change;
- the SOW contract cannot fit within 60 lines without weakening oracle safety;
- cache precision requires collector, schema, scenario, or historical-scorecard changes;
- tests require a model call, credential, provider mutation, commit, or push;
- any historical scorecard changes.

## Execution Handoff

Execute against the existing dirty worktree without resetting it. Remove retired host surfaces, simplify the adapter source and generator, finish Markdown contracts and cache precision, regenerate only the OpenCode plugin, update product documentation and tests, and run the complete non-model validation sequence. Stop rather than adding compatibility behavior or dependencies.
