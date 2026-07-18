# Cockpit Behavioral Evaluations

These evaluations test workflow behavior rather than exact wording. Each scenario runs in a fresh disposable Git repository copied from `evals/fixture/`.

Scenarios are categorized to cover each workflow mode:

| Category | Scenario IDs | What is tested |
|---|---|---|
| direct | `tiny-direct` | Tiny deterministic work handled without delegation |
| exploration | `ambiguous-feature` | Ambiguous direction exploration; strategist delegation, oracle retains boundary |
| planning | `approved-planning` | Oracle produces a bounded plan without mandatory delegation |
| research | `read-only-research` | Read-only evidence gathering; noisy search delegation to explore |
| execution | `approved-execution`, `false-assumption` | Hands-worker execution and invalid-plan stop conditions |
| review | `localized-review`, `structural-review`, `security-review-direct` | Localized, structural, and security review paths; narrow security kept direct by default |
| verification | `verification-failure` | Fresh evidence before completion claims |

## Config isolation

When running with OpenCode, the eval runner creates a standalone temporary config using Cockpit's generated plugin and canonical native-agent definitions. Every role uses the supplied evaluation model. An isolated `XDG_CONFIG_HOME` prevents global OpenCode configuration from merging, and Claude Code compatibility loading is disabled, while OpenCode's separate data directory remains available for authentication. Before any model call, the runner resolves the effective config and rejects unexpected plugins or mismatched role definitions. It removes the temporary config in a `finally` block and never reads or mutates user configuration. Provider authentication must already be available through OpenCode's auth store or the process environment; models that require custom provider configuration are not supported by this isolated runner.

## Usage

List scenarios:

```bash
npm run eval
```

Validate the isolated native-agent configuration without making a model call:

```bash
npm run eval -- --model openai/gpt-5.6-sol --validate-config
```

Preview prompts without model calls:

```bash
npm run eval -- --model openai/gpt-5.6-luna --dry-run
```

Run one scenario:

```bash
npm run eval -- --model openai/gpt-5.6-luna --scenario tiny-direct
```

Run the complete suite:

```bash
npm run eval -- --model openai/gpt-5.6-luna
```

Reports are written under the ignored `evals/results/` directory. Score each expected behavior manually as Pass, Partial, or Fail. Compare the same scenarios across reasoning, hands, and local models.

Behavioral failures should normally result in a skill clarification. Do not move workflow policy into a harness adapter merely to make an evaluation pass.

Model runs can consume paid tokens and may take several minutes. The runner never starts a model call unless `--model` is supplied.
