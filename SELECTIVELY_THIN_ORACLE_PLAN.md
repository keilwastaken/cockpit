# Selectively Thin Oracle Redesign

## Status

Approved direction. Implementation has not started.

This plan redesigns Cockpit around a selectively thin oracle while preserving its skills-first, orchestration-free, cross-host architecture.

## Outcome

The primary reasoning agent is the oracle. It owns:

- work-mode decisions;
- consequential product, architecture, migration, security, and persistence judgment;
- synthesis of worker and specialist outputs;
- human escalation and approval boundaries;
- review conclusions;
- deciding whether fresh evidence supports a completion claim.

Host-native agents are bounded tools. Hands workers are used for broad or noisy evidence collection and approved low-risk execution. Reasoning specialists may provide independent options, plans, or review evidence when isolation has clear value, but they do not replace oracle synthesis or approval boundaries.

The redesign must reduce duplicated context and unnecessary delegation without adding a router, queue, state machine, retry loop, background worker, custom agent runtime, or automatic workflow.

## Fixed Decisions

- Keep Cockpit a portable methodology with thin native adapters.
- Keep the current skills-first architecture.
- Keep direct handling for tiny deterministic work.
- Use a moderate, self-sufficient bootstrap rather than a fragile pointer that always loads another skill.
- Keep detailed edge-case routing in `cockpit-work-mode`, loaded only when mode selection is genuinely ambiguous.
- Keep the existing role inventory. Do not add a supervisor agent or new worker role.
- Use the current `cockpit-strategist` and OpenCode built-in `explore` roles; role migration is outside this change.
- Keep `/cockpit-setup` and `/cockpit-doctor`; they are explicit, infrequent commands and are not bootstrap overhead.
- Keep existing handoff shapes, extending them with compact request and evidence rules.
- Do not centralize the already-short worker prompt strings in this change.
- Do not modify historical benchmark scorecards.
- Require separate approval before paid model evaluations.

## Scope

### Canonical Skills

- `skills/using-cockpit/SKILL.md`
- `skills/cockpit-work-mode/SKILL.md`

### Methodology And Contracts

- `docs/methodology.md`
- `docs/handoff-contracts.md`
- `README.md`
- `CODEMAP.md`
- `skills/README.md`

### Adapter Source And Host Documentation

- `scripts/adapter-definition.mjs`
- `docs/README.opencode.md`
- `docs/README.claude.md`
- `docs/README.pi.md`

### Generated Artifacts

Regenerate these from their canonical sources; do not edit them directly:

- `.opencode/plugins/cockpit.js`
- `extensions/cockpit.js`
- `hooks/session-start.mjs`

Existing generated agent changes must remain intact:

- `agents/cockpit-strategist.md`
- removal of `agents/cockpit-explorer.md`

### Behavioral Evaluation

- `evals/scenarios.json`
- `evals/README.md`
- `scripts/run-behavioral-evals.mjs`
- `tests/adapters.test.js`

### Cost Evaluation

- `evals/cost/scenarios.json`
- `evals/cost/README.md`
- `scripts/cost-benchmark-core.mjs`
- `scripts/run-cost-benchmark.mjs`
- `tests/cost-benchmark.test.js`

### Skill And Generation Tests

- `tests/skills.test.js`
- `tests/adapters.test.js`

## Out Of Scope

- New agents, plugins, dependencies, commands, or runtime services.
- A deterministic workflow engine.
- Multiple-worker security review, debate, voting, or Reflexion loops.
- Changes to provider credentials or user configuration outside setup behavior already in the baseline.
- Replacing native host dispatch with a custom abstraction.
- Rewriting all individual workflow skills.
- Changing package identity or release mechanics.
- Editing `evals/cost/scorecards/*.md`.
- Running a publishable benchmark from a dirty worktree.

## Phase 1: Establish The Baseline

1. Capture `git status --short`, `git diff --stat`, and the complete diff before editing.
2. Run `npm test` and `npm run check:generated` before making changes.
3. Document any pre-existing failure rather than attributing it to the redesign.
4. Fix nothing outside the approved redesign without explicit approval.
5. Record which generated files are expected to change when adapters are regenerated.

### Checkpoint

- The starting diff is understood.
- Existing failures, if any, are reported rather than attributed to the redesign.
- Baseline checks pass or any pre-existing failure is documented.

## Phase 2: Create The Oracle Kernel

Rewrite `skills/using-cockpit/SKILL.md` into a compact, self-sufficient entry policy.

It must contain:

1. **Oracle ownership**
   - The reading agent selects the shortest safe workflow.
   - It retains consequential decisions, synthesis, escalation, and completion certification.

2. **Direct-work threshold**
   - Tiny, clear, low-risk, deterministic work stays direct.
   - Delegation is not a success metric.

3. **Hands-worker threshold**
   - Delegate broad or noisy evidence gathering when isolation is likely to save primary context.
   - Delegate only approved, bounded, low-risk execution.
   - Keep narrow lookups direct when the handoff costs more than the likely context savings.

4. **Reasoning-specialist boundary**
   - A strategist, planner, or reviewer may provide independent analysis when useful.
   - The oracle still integrates the result and retains approval, severity, and final-claim judgment.

5. **Compact handoff protocol**
   - Send only the goal, relevant scope, required evidence or approved edits, validation, and stop conditions.
   - Do not repeat the full user prompt, bootstrap, methodology, or known repository context.
   - Workers return findings and evidence, not a transcript of their process.
   - The oracle does not automatically repeat a worker's broad search. It performs targeted checks only for gaps, contradictions, high-risk claims, or final certification.

6. **Safety boundaries**
   - Exploration recommends; the human approves.
   - Research gathers evidence; it does not choose direction.
   - Planning specifies; it does not edit.
   - Execution follows approved scope; it does not redesign.
   - Review inspects actual work; it does not trust summaries.
   - Verification requires fresh evidence.

7. **Orchestration-free constraint**
   - Preserve the explicit prohibition on route engines, dispatch functions, queues, retry loops, state machines, and automatic invocation.

Remove from the bootstrap:

- the Pi/OpenCode/Claude harness distinction section;
- expanded edge-case routing already covered by `cockpit-work-mode`;
- repeated explanations available in individual workflow skills;
- wording that implies every nontrivial stage should be delegated.

Target 45 to 55 lines, with a hard ceiling of 60 lines. The semantic requirements above take precedence over achieving the smallest possible file.

### Checkpoint

- A common task can be routed safely from the bootstrap alone.
- Edge cases can load `cockpit-work-mode` without reading duplicated policy.
- No host-specific mechanics remain in the canonical bootstrap.
- Approval, escalation, stop, and verification boundaries remain explicit.

## Phase 3: Make Work Mode An Edge-Case Aid

Revise `skills/cockpit-work-mode/SKILL.md` so it helps resolve ambiguous mode choices instead of restating the bootstrap.

Required changes:

- Preserve the clarity, evidence, scope, risk, noise, and independence assessment dimensions.
- Add an explicit context-savings test: delegate only when expected isolation exceeds request, handoff, and reintegration overhead.
- Separate hands-worker eligibility from reasoning-specialist independence.
- State that narrow security review and consequential severity judgment remain with the oracle by default.
- State that mechanical evidence collection for review or verification may be delegated, while judgment remains with the oracle.
- Remove repeated workflow-sequence and generic safety language already present in `using-cockpit`.
- Keep the compact work-mode output optional and avoid routing commentary for obvious direct work.

### Checkpoint

- `using-cockpit` answers common cases.
- `cockpit-work-mode` adds decision value only for ambiguous cases.
- The two skills do not contain parallel routing tables that can drift.

## Phase 4: Define Thin Handoffs

Extend `docs/handoff-contracts.md` without replacing the established workflow outputs.

Add a **Worker Request** contract containing only applicable fields:

```markdown
# Worker Request
## Goal
## Scope
## Required Evidence Or Edits
## Validation
## Stop Conditions
```

Add a **Worker Evidence Packet** contract:

```markdown
# Worker Evidence Packet
## Status
## Findings
- finding - file, line, command, or URL evidence
## Commands And Outcomes
## Scope Deviations
## Gaps And Uncertainty
## Stop Reason
```

Document these rules:

- Omit irrelevant sections rather than emitting empty boilerplate.
- Do not copy the full user prompt, bootstrap, plan, or raw logs into a handoff.
- Distinguish observed evidence from inference.
- A worker packet is not approval, a final review verdict, or completion certification.
- The oracle may trust low-risk mechanical evidence when provenance is adequate, but must target-check consequential, contradictory, or incomplete claims.
- Research Brief, Execution Result, and Review Result remain valid specialized forms.

Update `docs/methodology.md` to show:

```text
request -> oracle decision
              | direct work
              | bounded evidence worker
              | approved execution worker
              | optional reasoning specialist
              v
        oracle integration -> human decision or certified result
```

Move host distinctions to host documentation and keep the methodology focused on portable behavior.

Update `README.md`, `CODEMAP.md`, and `skills/README.md` only enough to make the oracle/worker distinction discoverable. Do not duplicate the full methodology.

### Checkpoint

- Handoffs carry decisions and evidence rather than working context.
- Existing specialized contracts remain compatible.
- Documentation does not imply that worker output is independently authoritative.

## Phase 5: Thin The Native Adapter Guidance

Update only the `actionMappings` portion of `scripts/adapter-definition.mjs` for this redesign. Preserve current strategist, built-in `explore`, setup, doctor, and migration behavior.

Host mappings should describe mechanics, not repeat methodology:

- **OpenCode:** use native `task`; built-in `explore` handles broad/noisy hands research; executor handles approved bounded execution; reasoning specialists remain optional for independent analysis.
- **Claude Code:** use native Agent only when bounded isolation has value; agents inherit the active model.
- **Pi:** perform the same boundaries sequentially in the current agent because there is no dispatch runtime.

The mappings must not instruct the host to run a default strategist -> planner -> executor -> reviewer chain.

Run `npm run generate`, then inspect every generated diff. Reject unexplained generated changes.

### Checkpoint

- Each generated bootstrap contains the marker once.
- Each host receives one matching mechanics section.
- No host receives mechanics for the other two hosts.
- Setup and doctor behavior remains available.
- Retired generated artifacts stay retired.

## Phase 6: Strengthen Deterministic Tests

### `tests/skills.test.js`

Add behavior-focused assertions proving that `using-cockpit`:

- identifies the reading agent as the oracle;
- assigns decisions, synthesis, escalation, and certification to the oracle;
- limits hands workers to evidence gathering and approved bounded execution;
- requires compact, non-repeating handoffs;
- discourages automatic repetition of delegated broad work;
- retains orchestration-free prohibitions;
- retains fresh-evidence verification;
- contains no `Harness distinctions` section;
- stays at or below the 60-line ceiling.

Avoid tests that require exact prose beyond stable contract terms.

### `tests/adapters.test.js`

Prove that generated host bootstraps:

- contain `COCKPIT_BOOTSTRAP_V1` exactly once;
- contain the oracle ownership boundary;
- contain only their own host action mapping;
- do not contain the removed cross-host section;
- remain generated from shared definitions;
- preserve the strategist and OpenCode `explore` inventory.

Keep all existing setup migration, permission, and generated-freshness tests.

### Checkpoint

- Tests enforce behavior and boundaries, not formatting trivia.
- The compact bootstrap cannot silently grow back into the full methodology.
- The current role inventory remains covered.

## Phase 7: Update Behavioral Evaluation

Revise `evals/scenarios.json`, its documentation, and route assertions to test selective delegation rather than delegation volume.

Required coverage:

1. **Tiny deterministic change**
   - Direct.
   - No routing announcement or worker.

2. **Broad read-only research**
   - Delegate to OpenCode built-in `explore`.
   - Worker request is bounded.
   - Worker returns compact cited evidence.
   - Parent synthesizes rather than forwarding raw output.
   - Parent does not repeat the complete broad search without a stated gap.

3. **Ambiguous consequential design**
   - Oracle retains the decision boundary.
   - A strategist may provide options, but output must stop for human approval and be integrated by the parent.

4. **Approved planning**
   - Add one scenario proving the oracle can produce a bounded plan without mandatory delegation.
   - No edits occur.

5. **Approved bounded execution**
   - Delegate to executor when the task is sufficiently bounded.
   - Parent checks scope and validation evidence without repeating implementation.

6. **Narrow security or authentication review**
   - Keep direct by default.
   - No hands worker assigns severity or final verdict.

7. **Verification**
   - Mechanical command collection may be isolated when noisy.
   - The oracle decides whether results prove the claim.

Update `tests/adapters.test.js` route-schema assertions accordingly. Keep scoring semantic; do not require exact phrases such as `oracle` if behavior is otherwise clear.

Run dry-run and configuration-validation modes before any paid scenario.

### Checkpoint

- The suite rewards context saved with preserved judgment, not the number of agents called.
- Direct, hands-worker, and optional reasoning-specialist paths are all represented.
- No scenario requires a custom orchestrator.

## Phase 8: Add Cost Benchmark Routing Gates

Keep the existing four scenarios and three arms. Do not change historical scorecards.

Add an arm-aware delegation gate to the current critical-gate system. The gate must consume observed telemetry rather than infer delegation from output prose.

Expected behavior:

| Scenario | Control | Isolation | Role split |
|---|---|---|---|
| Configuration research | exempt | at least one bounded research delegation | at least one hands research delegation |
| Audit design | exempt | no mandatory delegation | no mandatory delegation |
| Bounded implementation | exempt | executor delegation allowed or required by declared gate | hands executor delegation allowed or required by declared gate |
| Authentication security review | exempt | zero hands research delegation | zero hands research delegation |

Before implementation, choose one consistent gate for bounded implementation: either require exactly one executor call in both Cockpit arms or permit direct execution in both. Do not compare arms with different route requirements. The preferred choice is exactly one executor call because the scenario is deliberately approved and bounded.

The gate implementation must:

- exempt control explicitly;
- reject missing or invalid telemetry in arms where delegation is constrained;
- support minimum and maximum delegation counts;
- identify the child agent and model when the scenario requires hands work;
- remain independent of output wording;
- produce a clear critical-gate failure reason.

Add focused tests for:

- exempt control;
- required minimum delegation;
- prohibited delegation;
- wrong worker role;
- wrong worker model;
- missing telemetry;
- valid isolation and role-split behavior.

Add handoff concision to the configuration-research manual rubric. Document that token totals and peak parent context measure overhead but cannot prove semantic non-duplication; behavioral evaluation covers that claim.

### Checkpoint

- Broad research delegation and narrow review non-delegation are measurable.
- Existing matrix comparability is preserved.
- No fifth paid scenario is introduced.

## Phase 9: Review And Validation

Run validation in this order:

```bash
git status --short
git diff --check
npm run generate
git status --short
git diff --check
npm test
npm run check:generated
npm run eval -- --model openai/gpt-5.6-sol --dry-run
npm run eval -- --model openai/gpt-5.6-sol --validate-config
NODE_NO_WARNINGS=1 npm run benchmark:cost -- --run-id thin-oracle-dry-run --dry-run --repetitions 1 --max-runs 1
npm run check
git diff --stat
git diff --name-status
```

Then perform an independent review against this plan. The review must inspect the actual diff, not the implementation summary.

Review questions:

- Is the oracle materially thinner without losing safety boundaries?
- Does any canonical skill still encourage automatic workflow chains?
- Can a worker packet be consumed without importing raw working context?
- Does the oracle retain consequential security and completion judgment?
- Are host mechanics absent from the canonical bootstrap?
- Did generation preserve the strategist and OpenCode `explore` role semantics?
- Are cost gates based on actual telemetry?
- Did any historical scorecard or unrelated file change?

## Paid Evaluation Gate

Paid model calls are not part of deterministic implementation validation. After implementation and independent review, request approval for:

```bash
npm run eval -- --model openai/gpt-5.6-sol --scenario read-only-research
npm run eval -- --model openai/gpt-5.6-sol --scenario localized-review
```

If those smoke scenarios pass behavioral review, decide separately whether to run the full behavioral suite and a fresh publishable cost matrix. Publishable cost runs require a clean worktree and reviewed benchmark code.

## Acceptance Criteria

- `using-cockpit` is no more than 60 lines and remains self-sufficient for common routing decisions.
- The bootstrap explicitly defines oracle ownership and bounded worker eligibility.
- The bootstrap contains no cross-host distinctions.
- `cockpit-work-mode` adds edge-case analysis without duplicating the entry policy.
- Worker requests and results avoid full prompts, bootstrap text, methodology, and raw logs.
- The oracle is told not to automatically repeat delegated broad work.
- Consequential review, severity, escalation, and completion certification remain with the oracle.
- OpenCode, Claude Code, and Pi retain native behavior without custom orchestration.
- Strategist and built-in `explore` role semantics remain intact.
- Generated artifacts are fresh.
- Behavioral evaluations cover direct work, broad research, optional reasoning support, bounded execution, narrow review, and certification.
- Cost gates require broad research delegation and prohibit inappropriate security-review delegation.
- All deterministic tests, generated checks, dry runs, and config validation pass.
- No historical scorecard, dependency, package lock, or unrelated file changes.

## Risks

- **Over-compression:** A bootstrap that is too short may hide approval or verification boundaries. Mitigate with semantic tests and the 45 to 55 line target.
- **Role ambiguity:** Calling all subagents workers could imply that reasoning judgment is transferable. Use `hands worker` and `reasoning specialist` distinctly.
- **Duplicated checking:** An overly strict independent-verification instruction could cause the oracle to repeat research. Require targeted verification based on risk and gaps.
- **Under-verification:** Trusting every evidence packet could allow hallucinated or poisoned evidence. Preserve provenance and consequential-claim checks.
- **Concurrent overlap:** Current user changes touch most adapter and evaluation files in scope. Baseline and post-generation diff inspection are mandatory.
- **Brittle evaluations:** Exact delegation requirements can overfit one model. Gate only strong distinctions supported by current benchmark evidence.
- **False economic claims:** Lower reasoning-model tokens do not imply lower total cost. Continue reporting reasoning, hands, total, latency, and quality separately.

## Stop Conditions

Stop and return for a decision if:

- the bootstrap cannot stay self-sufficient under the 60-line ceiling;
- a second bootstrap source of truth appears necessary;
- any host requires a custom routing or orchestration runtime;
- cost routing gates require undocumented session or telemetry assumptions;
- generated output changes files outside the expected artifact set without explanation;
- approval, escalation, review, or fresh-verification boundaries are weakened;
- a paid model run would be needed to diagnose a deterministic failure.

## Execution Handoff

Implement this plan sequentially. Edit canonical sources only, regenerate artifacts, add behavior-focused tests and telemetry-backed routing gates, run deterministic validation, obtain an independent review, and stop for approval before paid evaluation.
