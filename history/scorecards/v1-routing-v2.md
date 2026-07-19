# Cockpit Cost Benchmark

- Run: `v1-routing-v2`
- Manifest: `391a9103114a6eb702f144d52c5a25bb369c8b609b1ac9906ee1db911022cd4e`
- Commit: `b40d655ec968bd49242ca044df841efa3f4fc987`
- Working tree: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- Benchmark sources: `47ed7c3c13ce761742442695f1bca962598c1bb7c11e672bf455320c9a653b98`
- Node: `22.22.0`
- OpenCode: `1.18.3`
- Models: `openai/gpt-5.6-sol` reasoning, `opencode/deepseek-v4-flash-free` hands
- Matrix: four scenarios, three interleaved arms, two repetitions

## Overall

| Arm | Critical Pass | Blind Quality | Reasoning Processed | Hands Processed | Total Processed | Peak Parent | Delegations | Time (s) | Observed Cost |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| control | 88% | 100.0 | 95507 | 0 | 95507 | 11769 | 0.5 | 100.1 | $0.0000 |
| isolation | 100% | 97.5 | 107661 | 0 | 107661 | 11885 | 1.0 | 109.8 | $0.0000 |
| role-split | 100% | 100.0 | 66552 | 26540 | 102055 | 11398 | 1.0 | 109.2 | $0.0000 |

## Matrix Token Totals

| Arm | Reasoning Tokens | Hands Tokens | Total Tokens | Reasoning Share | Hands Share |
|---|---:|---:|---:|---:|---:|
| control | 694003 | 0 | 694003 | 100.0% | 0.0% |
| isolation | 783333 | 0 | 783333 | 100.0% | 0.0% |
| role-split | 536802 | 356999 | 893801 | 60.1% | 39.9% |

Estimated model cost can be calculated as `(reasoning tokens × reasoning rate) + (hands tokens × hands rate)`. Provider-reported cost remains observational.

## Scenario Results

| Scenario | Arm | Critical Pass | Blind Quality | Reasoning | Hands | Total | Peak Parent | Time (s) |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| audit-design | control | 50% | 100.0 | 109321 | 0 | 109321 | 13853 | 185.2 |
| audit-design | isolation | 100% | 90.0 | 62216 | 0 | 62216 | 12393 | 99.5 |
| audit-design | role-split | 100% | 100.0 | 78683 | 0 | 78683 | 13126 | 136.4 |
| bounded-implementation | control | 100% | 100.0 | 95507 | 0 | 95507 | 11462 | 66.2 |
| bounded-implementation | isolation | 100% | 97.5 | 115127 | 0 | 115127 | 10997 | 102.1 |
| bounded-implementation | role-split | 100% | 97.5 | 54819 | 111303 | 166122 | 11566 | 73.3 |
| config-research | control | 100% | 100.0 | 97312 | 0 | 97312 | 11411 | 177.5 |
| config-research | isolation | 100% | 100.0 | 113293 | 0 | 113293 | 12661 | 114.7 |
| config-research | role-split | 100% | 100.0 | 39338 | 67197 | 106535 | 10873 | 81.3 |
| security-review | control | 100% | 95.0 | 44863 | 0 | 44863 | 11249 | 55.1 |
| security-review | isolation | 100% | 95.0 | 101031 | 0 | 101031 | 12184 | 103.5 |
| security-review | role-split | 100% | 92.5 | 95562 | 0 | 95562 | 11722 | 141.5 |

## Role-Split Delta

| Scenario | Supported | Quality Delta | Reasoning | Hands Used | Total | Peak Parent | Time |
|---|---|---:|---:|---:|---:|---:|---:|
| audit-design | no | 0.0 | -28.0% | 0 | -28.0% | -5.2% | -26.3% |
| bounded-implementation | no | -2.5 | -42.6% | 111303 | +73.9% | +0.9% | +10.8% |
| config-research | yes | 0.0 | -59.6% | 67197 | +9.5% | -4.7% | -54.2% |
| security-review | no | -2.5 | +113.0% | 0 | +113.0% | +4.2% | +156.9% |

Provider-reported cost is observational, not a billing guarantee. Results describe this bounded matrix only and are not a general causal estimate.
