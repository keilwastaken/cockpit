# Cockpit Methodology

Cockpit is an oracle-and-worker methodology for keeping coding-agent work deliberate, bounded, and evidence-driven. The reading agent (the oracle) selects the shortest safe workflow, retains consequential judgment, and certifies completion. Hands workers and reasoning specialists provide bounded evidence or analysis but do not replace oracle decisions. The methodology lives in Markdown skills; the OpenCode plugin makes those skills discoverable.

## Principles

1. **Context is a budget.** Keep broad discovery, logs, diffs, and failed attempts out of the primary conversation when isolation is available and useful.
2. **Use the smallest sufficient workflow.** Tiny deterministic work should stay direct. Process overhead must earn its cost. Broad/noisy research and bounded execution may delegate to host-native workers when available.
3. **Resolve direction before implementation.** Ambiguous product or architecture choices require exploration and human approval. Exploration, planning, and review are reasoning-sensitive and must not transfer consequential judgment to hands-only workers.
4. **Evidence precedes commitment.** Research establishes facts and gaps. Plans distinguish verified facts from assumptions.
5. **Plans are bounded contracts.** A useful plan names scope, files, order, acceptance criteria, validation, risks, and stop conditions.
6. **Executors execute rather than redesign.** Unexpected scope or invalid assumptions trigger escalation.
7. **Review routes work.** Local defects return to execution, structural defects return to planning, and consequential ambiguity returns to the human.
8. **Verification precedes completion.** Never claim success based on expectation or an earlier run.
9. **Handoffs are compact.** Pass conclusions, evidence, decisions, and unresolved risks—not a transcript of the work.
10. **Orchestration-free.** Cockpit has no route engine, dispatch function, queue, retry loop, state machine, or automatic invocation mechanism. All routing decisions are explicit, inline, and made by the reading agent.

## Workflow

```text
request -> oracle decision
               | direct work
               | bounded evidence worker
               | approved execution worker
               | optional reasoning specialist
               v
         oracle integration -> human decision or certified result
```

Not every task traverses every stage. The oracle selects the shortest safe path.

### Worker fallback

When a host-native worker is unavailable, perform the same work sequentially in the current agent. Never spin up a custom runtime, queue, or dispatch mechanism.

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

## Prompt layout for cache efficiency

When Cockpit controls prompt composition, content is ordered as:

```text
stable host, role, and skill instructions
stable output contract
final task-specific SOW or variable payload
```

- Static instructions contain no timestamps, run IDs, temporary paths, model IDs, user text, or task-specific substitutions.
- Variable task content stays in the final payload.
- Prompts are never padded merely to cross a provider cache threshold.
- Provider features such as `cache_control`, `prompt_cache_key`, TTLs, cache breakpoints, and tool serialization remain host/provider responsibilities. Cache controls do not affect routing correctness.

## Non-goals

Cockpit is not:

- a mandatory ceremony for every edit,
- a model router,
- a dispatch engine or route invoker,
- a background job manager,
- a replacement for harness permissions,
- a guarantee that all work should be delegated,
- a license to continue when assumptions fail.
