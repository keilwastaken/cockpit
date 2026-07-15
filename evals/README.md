# Cockpit Behavioral Evaluations

These evaluations test workflow behavior rather than exact wording. Each scenario runs in a fresh disposable Git repository copied from `evals/fixture/`.

List scenarios:

```bash
npm run eval
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
