# Cockpit Cost Benchmark

This benchmark measures whether Cockpit changes reasoning-model usage, total processed tokens, peak parent context, and duration while preserving task quality.

It does not assume that delegation reduces total tokens. Provider-reported cost is observational and is not a billing cap or dollar-savings guarantee.

## Arms

- `control`: Cockpit disabled with OpenCode `--pure`; native subagents remain available on the reasoning model.
- `isolation`: Cockpit enabled with every Cockpit agent on the reasoning model.
- `role-split`: Cockpit enabled with research and execution on the hands model.

## Protocol

A publishable run is one interleaved matrix containing four scenarios, three arms, and two repetitions. Every `(scenario, repetition)` block contains all three arms in a deterministic shuffled order.

Focused arm or scenario runs are diagnostic and cannot produce a scorecard.

Publishable runs require a clean Git working tree so the recorded commit identifies all benchmark inputs. Commit and verify the harness before starting paid calls.

Before model calls, the runner records:

- Node and OpenCode versions.
- Git commit and working-tree status hash.
- Scenario, fixture, plugin, adapter-definition, benchmark-source, and skills hashes.
- Sanitized resolved OpenCode configuration and hash for every arm.
- The complete ordered job matrix.

The benchmark currently requires Node 22 and OpenCode 1.18.3.

## Run

```bash
NODE_NO_WARNINGS=1 npm run benchmark:cost -- \
  --run-id v1-corrected \
  --repetitions 2 \
  --reasoning-model openai/gpt-5.6-sol \
  --hands-model opencode/deepseek-v4-flash-free \
  --timeout-minutes 6 \
  --observed-cost-stop 20
```

Use `--dry-run` to inspect the interleaved matrix without model calls. Use `--resume` only with the exact original options and provenance. A run ID cannot be reused without `--resume`.

`--max-runs` limits work attempted in one invocation. `--observed-cost-stop` is checked between completed runs using provider-reported telemetry; it cannot prevent one run from exceeding a billing budget and is ineffective when the provider reports zero.

The runner passes only a small environment allowlist. Repeat `--allow-env NAME` for provider credentials that are not stored in OpenCode auth. Values are never written to the manifest.

## Telemetry

The runner reads OpenCode's SQLite database in read-only mode. It starts from the parent session ID emitted by `opencode run` and follows only that session's recursive descendants. Missing parents, malformed counters or messages, arm-incompatible models, a non-reasoning parent model, or absent parent-context samples invalidate the observation rather than becoming zero usage.

Metrics include reasoning and hands processed tokens, total processed tokens, parent tokens, peak parent context, delegation count, duration, and provider-reported cost.

## Quality

Every scenario has mandatory deterministic gates. These cover process success, worktree boundaries, required evidence, changed-file scope, and independent verification commands. Gate outcomes are pass/fail and are never averaged into a quality percentage.

Subjective quality is scored separately through blind review:

```bash
npm run benchmark:prepare-review -- \
  v1-corrected \
  --packet /private/path/packet.json \
  --mapping /private/path/mapping.json \
  --scores /private/path/scores.json
```

Give only `packet.json` and `scores.json` to the reviewer. Keep the mapping private until scoring is complete. Treatment names, model identifiers, provider names, session IDs, and local paths are redacted from the packet. Every rubric dimension is scored from 1 to 5.

Generate a scorecard only after all scores are complete:

```bash
npm run benchmark:summary -- \
  --run-id v1-corrected \
  --scores /private/path/scores.json \
  --mapping /private/path/mapping.json \
  --output evals/cost/scorecards/v1.0.0.md
```

The summary marks a reduction supported only when both arms pass every deterministic gate and blinded quality does not decrease for that scenario.

## Security And Retention

Raw results include complete model output and may contain source text or diagnostics. Run directories are mode `0700`; files are mode `0600`; final files are created with exclusive atomic writes; `evals/results/` is ignored by Git.

Blind packets can still contain synthetic source excerpts. Keep packets, mappings, and score sheets private and delete them with raw results within seven days of validated scorecard generation. Commit only the aggregate scorecard and sanitized provenance.

Existing ignored `v1-*` pilots predate this protocol and are exploratory only. They must not be merged or summarized as publication evidence.
