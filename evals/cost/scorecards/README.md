# Cost Benchmark Scorecards

Scorecards are published comparison reports generated from completed benchmark runs.

## Process

1. Run one complete interleaved benchmark: `npm run benchmark:cost -- --run-id <id>`.
2. Generate separate packet, mapping, and score files with `npm run benchmark:prepare-review`.
3. Give the reviewer only the packet and blank score file.
4. Generate the scorecard with `npm run benchmark:summary -- --run-id <id> --scores <scores.json> --mapping <mapping.json> --output <path>`.

## Policy

- Scorecards require a **complete matrix**: all scenarios × arms × repetitions.
- Scorecards require **blind human review** for rubric scores.
- Mandatory deterministic gates are computed automatically; blinded rubric scores are filled manually.
- A scorecard is only publishable when the summary shows complete data and applied blind scores.
- Raw run data is retained under ignored `evals/results/cost/<run-id>/` for no more than seven days after validation.
- Scorecard files in this directory are the final publishable reports.

## Retention

- Raw run data: delete within 7 days after validated scorecard generation.
- Published scorecards in this directory: retained indefinitely.
- Intermediate review files (blind packets, mappings, score sheets): delete on the same schedule.

## Naming convention

Scorecards follow: `v<major>.<minor>.<patch>.md` or `v<major>-<descriptor>.md`.

Examples:
- `v1.0.0.md`: scorecard supporting the V1 release.
- `v1-corrected.md`: corrected protocol run before release.

## No unsupported scorecards

Do not commit scorecards that:
- Are based on incomplete matrices
- Lack blind review scores
- Contain unredacted paths or session IDs
- Claim cost savings without equivalent quality
