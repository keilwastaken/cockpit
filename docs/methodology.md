# Cockpit Methodology

Cockpit is a portable workflow for keeping coding-agent work deliberate, bounded, and evidence-driven. The methodology lives in Markdown skills; harness plugins only make those skills discoverable.

## Principles

1. **Context is a budget.** Keep broad discovery, logs, diffs, and failed attempts out of the primary conversation when isolation is available and useful.
2. **Use the smallest sufficient workflow.** Tiny deterministic work should stay direct. Process overhead must earn its cost.
3. **Resolve direction before implementation.** Ambiguous product or architecture choices require exploration and human approval.
4. **Evidence precedes commitment.** Research establishes facts and gaps. Plans distinguish verified facts from assumptions.
5. **Plans are bounded contracts.** A useful plan names scope, files, order, acceptance criteria, validation, risks, and stop conditions.
6. **Executors execute rather than redesign.** Unexpected scope or invalid assumptions trigger escalation.
7. **Review routes work.** Local defects return to execution, structural defects return to planning, and consequential ambiguity returns to the human.
8. **Verification precedes completion.** Never claim success based on expectation or an earlier run.
9. **Handoffs are compact.** Pass conclusions, evidence, decisions, and unresolved risks—not a transcript of the work.

## Workflow

```text
intake
  |
  v
choose work mode ----> direct maneuver ----> verify
  |
  +--> unclear direction --> explore options --> human approval
  |                                           |
  +--> missing facts ------> research <--------+
  |                            |
  +--> approved nontrivial work --> plan --> execute --> review
                                                    ^       |
                                                    |       +-- local issue
                                                    |
                                      replan <------+-- structural issue
                                                    |
                                             human decision
```

Not every task traverses every stage. The work-mode decision selects the shortest safe path.

## Work modes

### Direct maneuver

Use when the change is deterministic, low-risk, and understandable with roughly one file and one or two focused tool calls. Inspect, change, validate, and report.

### Bounded execution

Use when the request is clear but requires targeted discovery, multiple edits, or noisy validation. Establish a compact plan, keep strict scope, and review when the change is nontrivial.

### Explore before planning

Use when user value, behavior, architecture, migration strategy, or tradeoffs are unresolved. Compare concrete options and ask the human to approve a direction before implementation.

### Research before planning

Use when correctness depends on codebase facts, tests, configuration, external APIs, or version-specific behavior that are not yet known.

### Parallel work

Use only for genuinely independent tasks with explicit ownership and no shared mutable files. Parallelism is an optimization, never a requirement.

## Approval boundary

Exploration may recommend a direction, but recommendation is not approval. Do not proceed into consequential planning or implementation until the human accepts a direction. Minor implementation details inside an already approved bounded plan do not require repeated approval.

Stop and return to the human when work introduces an unapproved decision involving product behavior, architecture, security, authentication, persistence, destructive migration, deployment, credentials, cost, or irreversible external effects.

## Escalation

- **Local implementation defect:** return a focused fix packet to execution.
- **Several local defects with a valid plan:** execution may make a bounded correction, then revalidate.
- **Invalid assumption or structural mismatch:** revise the plan before more coding.
- **Consequential ambiguity or high risk:** request a human decision.
- **Missing evidence:** perform targeted research rather than guessing.

Fix loops must be bounded. Two failed focused correction attempts normally indicate a planning or understanding problem.

## Harness independence

Canonical skills describe actions, not tool names. A harness adapter may map:

- inspect a file,
- search the codebase,
- edit a file,
- run a command,
- invoke a skill,
- dispatch an independent worker,
- maintain a task list.

Subagents, background jobs, model routing, and progress interfaces are optional capabilities. If unavailable, perform the same workflow sequentially in the current agent.

## Non-goals

Cockpit is not:

- a mandatory ceremony for every edit,
- a model router,
- a background job manager,
- a replacement for harness permissions,
- a guarantee that all work should be delegated,
- a license to continue when assumptions fail.
