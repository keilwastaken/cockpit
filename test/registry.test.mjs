import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compileExtension } from "./helpers/compile-extension.mjs";

const decisionFixture = {
	route: "fast",
	tier: "fast",
	requiresApproval: true,
	confidence: 0.84,
	handoffQuality: {
		score: 4,
		maxScore: 6,
		checks: [
			{ id: "outcome", label: "Desired outcome is present", passed: true },
			{ id: "scope", label: "Scope/files or repo area are identified", passed: true },
			{ id: "constraints", label: "Constraints/non-goals are represented or inferable", passed: true },
			{ id: "validation", label: "Validation expectation is present or inferable", passed: false },
			{ id: "escalation", label: "Escalation/stop rules are represented", passed: true },
			{ id: "evidence", label: "Evidence expectation is represented", passed: false },
		],
		missing: ["validation", "evidence"],
		summary: "needs validation and evidence",
	},
	missingContextQuestions: ["What validation evidence is required before this can be considered done?"],
	suggestedRefinement: "Please update registry coverage in extensions/conductor/logs.ts and test/registry.test.mjs; preserve existing behavior outside this scope; run npm test; stop if product/design decisions are needed.",
	reasons: ["Task is narrow, low-risk, and fits the fast profile thresholds."],
	risks: ["No major risks detected."],
	signals: {
		text: "update registry coverage in extensions/conductor/logs.ts and test/registry.test.mjs",
		mentionedFiles: ["extensions/conductor/logs.ts", "test/registry.test.mjs"],
		riskDomains: [],
		isQuestionOnly: false,
		tasksLooksLikeCoding: true,
		estimatedFiles: 2,
		estimatedLines: 120,
		requiresPlan: false,
		isAmbiguous: false,
		mechanicalEdit: false,
	},
	suggestedAgent: "delegate",
	suggestedModel: undefined,
};

const handoffText = "# Handoff\n\nSaved for registry test.";

async function makeSandbox() {
	return mkdtemp(join(tmpdir(), "pi-conductor-registry-"));
}

function fixedDate(fixedIso) {
	const RealDate = Date;
	class FixedDate extends RealDate {
		constructor(...args) {
			super(...(args.length > 0 ? args : [fixedIso]));
		}
		static now() {
			return RealDate.parse(fixedIso);
		}
	}
	return { RealDate, FixedDate };
}

const compiled = await compileExtension();
const logs = await compiled.importCompiled("extensions/conductor/logs.js");

const { approveRun, createRunRegistryEntry, inspectRun, listRuns, readRunStatusText, formatRunListLine } = logs;

test("behavioral registry temp-run operations cover create/list/inspect/approve/read/format", async () => {
	const cwd = await makeSandbox();
	const { RealDate, FixedDate } = fixedDate("2026-06-27T12:34:56.789Z");
	globalThis.Date = FixedDate;
	try {
		const [runOne, runTwo] = await Promise.all([
			createRunRegistryEntry(cwd, "update registry coverage in extensions/conductor/logs.ts", decisionFixture, handoffText),
			createRunRegistryEntry(cwd, "update registry coverage in test/registry.test.mjs", decisionFixture, handoffText),
		]);

		assert.notEqual(runOne.id, runTwo.id);
		assert.match(runOne.id, /^2026-06-27T12-34-56-789Z-/);
		assert.match(runTwo.id, /^2026-06-27T12-34-56-789Z-/);

		const runs = await listRuns(cwd);
		assert.equal(runs.length, 2);
		assert.deepEqual(runs.map((run) => run.id).sort(), [runOne.id, runTwo.id].sort());

		const exact = await inspectRun(cwd, runOne.id);
		assert.equal("run" in exact ? exact.run.id : undefined, runOne.id);

		const prefix = runOne.id.slice(0, runOne.id.indexOf("Z-") + 1);
		const ambiguous = await inspectRun(cwd, prefix);
		assert.equal("warning" in ambiguous, true);
		assert.match(ambiguous.warning, /Multiple Conductor runs match/);

		assert.equal(formatRunListLine(runOne), `${runOne.id} | drafted | fast/fast | update registry coverage in extensions/conductor/logs.ts`);

		const draftedStatusText = await readRunStatusText(runOne);
		assert.match(draftedStatusText, /"state": "drafted"/);
		assert.match(draftedStatusText, /"route": "fast"/);

		const approved = await approveRun(cwd, runOne);
		assert.equal(approved.state, "approved");
		assert.equal(approved.approvedAt, approved.updatedAt);
		assert.ok(approved.decisionsPath);

		const approvedText = await readRunStatusText(approved);
		assert.match(approvedText, /"state": "approved"/);
		assert.match(approvedText, /"approvedAt": "/);

		const decisionsText = await readFile(approved.decisionsPath, "utf8");
		assert.match(decisionsText, /Human approved launch for run/);
		assert.match(decisionsText, /# Decisions/);

		const updatedRuns = await listRuns(cwd);
		assert.equal(updatedRuns.find((run) => run.id === runOne.id)?.state, "approved");
		assert.equal(updatedRuns.find((run) => run.id === runTwo.id)?.state, "drafted");
	} finally {
		globalThis.Date = RealDate;
	}
});

test("behavioral registry creation is unique under rapid concurrent creation", async () => {
	const cwd = await makeSandbox();
	const { RealDate, FixedDate } = fixedDate("2026-06-27T12:34:56.789Z");
	globalThis.Date = FixedDate;
	try {
		const runs = await Promise.all(
			Array.from({ length: 12 }, (_, index) =>
				createRunRegistryEntry(cwd, `rapid-create-${index}`, decisionFixture, handoffText)
			)
		);

		const ids = new Set(runs.map((run) => run.id));
		assert.equal(ids.size, runs.length);
		assert.equal((await listRuns(cwd)).length, runs.length);
	} finally {
		globalThis.Date = RealDate;
	}
});
