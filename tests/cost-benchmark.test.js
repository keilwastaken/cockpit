import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	aggregateTelemetry,
	changedSnapshotFiles,
	collectSessionTree,
	createManifest,
	evaluateCriticalGates,
	generateJobs,
	parseArgs,
	parseJsonLines,
	sanitizeEnvironment,
	sha256,
	snapshotDirectory,
	stableStringify,
	validateManifest,
	validateCompleteMatrix,
	validateResult,
	writeFileExclusiveAtomic,
} from "../scripts/cost-benchmark-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const scenarios = [
	{
		id: "research",
		criticalGates: [
			{ id: "runner", type: "runner-success" },
			{ id: "clean", type: "worktree", value: "clean" },
			{ id: "evidence", type: "output-all", patterns: ["src/config.js"] },
		],
	},
	{
		id: "implementation",
		criticalGates: [
			{ id: "runner", type: "runner-success" },
			{ id: "scope", type: "changed-only", paths: ["src/config.js", "test/config.test.js"], required: ["src/config.js"] },
			{ id: "verification", type: "commands-pass", count: 1 },
		],
	},
];

test("stable hashing ignores object key order", () => {
	const left = { z: [{ b: 2, a: 1 }], a: true };
	const right = { a: true, z: [{ a: 1, b: 2 }] };
	assert.equal(stableStringify(left), stableStringify(right));
	assert.equal(sha256(left), sha256(right));
});

test("argument parsing rejects unknown and duplicate options", () => {
	assert.equal(parseArgs(["--run-id", "run", "--resume"]).get("--run-id"), "run");
	assert.throws(() => parseArgs(["--run-id", "one", "--run-id", "two"]), /Duplicate/);
	assert.throws(() => parseArgs(["--unknown"]), /Unknown/);
});

test("OpenCode JSONL parsing rejects malformed non-empty records", () => {
	assert.deepEqual(parseJsonLines('{"type":"text"}\n'), [{ type: "text" }]);
	assert.throws(() => parseJsonLines('{"type":"text"}\nnot-json\n'), /malformed OpenCode JSONL/);
});

test("generateJobs interleaves all arms in deterministic scenario-repetition blocks", () => {
	const arms = ["control", "isolation", "role-split"];
	const jobs = generateJobs(scenarios, arms, 2, "run-seed");
	assert.equal(jobs.length, 12);
	for (const scenario of scenarios) for (let repetition = 1; repetition <= 2; repetition += 1) {
		const block = jobs.filter((job) => job.scenario.id === scenario.id && job.repetition === repetition);
		assert.deepEqual(new Set(block.map((job) => job.arm)), new Set(arms));
		assert.equal(new Set(block.map((job) => job.blockID)).size, 1);
	}
	assert.deepEqual(jobs, generateJobs(scenarios, arms, 2, "run-seed"));
});

test("sanitizeEnvironment excludes inherited OpenCode and credential variables", () => {
	const child = sanitizeEnvironment({
		PATH: "/bin",
		HOME: "/home/tester",
		OPENCODE_CONFIG: "hidden",
		OPENAI_API_KEY: "hidden",
		CUSTOM_TOKEN: "allowed",
	}, ["CUSTOM_TOKEN"]);
	assert.deepEqual(child, { HOME: "/home/tester", PATH: "/bin", CUSTOM_TOKEN: "allowed" });
});

test("recursive telemetry selects descendants and excludes unrelated sessions", () => {
	const rows = [
		session("parent", null, "openai", "reasoner", 100, 20, 5, 1, 0.5),
		session("child", "parent", "opencode", "hands", 40, 10, 0, 0, 0),
		session("grandchild", "child", "opencode", "hands", 15, 5, 0, 0, 0),
		session("unrelated", null, "openai", "reasoner", 999, 999, 0, 0, 99),
	];
	const messages = [message("parent", 100, 5, 1), message("child", 40, 0, 0), message("grandchild", 15, 0, 0)];
	const collected = collectSessionTree(rows, messages, "parent", "/workspace", 2_000, ["openai/reasoner", "opencode/hands"]);
	assert.equal(collected.valid, true);
	assert.deepEqual(collected.sessions.map((entry) => entry.id), ["parent", "child", "grandchild"]);
	const telemetry = aggregateTelemetry(collected.sessions, "openai/reasoner", "opencode/hands");
	assert.equal(telemetry.reasoningModelTokens, 126);
	assert.equal(telemetry.handsModelTokens, 70);
	assert.equal(telemetry.totalTokens, 196);
	assert.equal(telemetry.parentTokens, 126);
	assert.equal(telemetry.peakParentContext, 106);
	assert.equal(telemetry.delegationCount, 2);
	assert.equal(telemetry.cost, 0.5);
});

test("telemetry invalidates provenance, malformed counters, unknown models, and absent context", () => {
	assert.equal(collectSessionTree([], [], "missing", "/workspace", 2_000).valid, false);
	assert.equal(collectSessionTree([session("parent", null, "openai", "reasoner", -1, 0, 0, 0, 0)], [message("parent", 1, 0, 0)], "parent", "/workspace", 2_000).valid, false);
	assert.equal(collectSessionTree([session("parent", null, "other", "model", 1, 1, 0, 0, 0)], [message("parent", 1, 0, 0)], "parent", "/workspace", 2_000, ["openai/reasoner"]).valid, false);
	assert.equal(collectSessionTree([session("parent", null, "openai", "reasoner", 1, 1, 0, 0, 0)], [], "parent", "/workspace", 2_000).valid, false);
	assert.equal(collectSessionTree([session("parent", null, "openai", "reasoner", 1, 1, 0, 0, 0)], [{ session_id: "parent", data: "{" }], "parent", "/workspace", 2_000).valid, false);
	assert.equal(collectSessionTree([session("parent", null, "opencode", "hands", 1, 1, 0, 0, 0)], [message("parent", 1, 0, 0)], "parent", "/workspace", 2_000, ["openai/reasoner", "opencode/hands"], "openai/reasoner").valid, false);
	const wrongAgent = session("child", "parent", "openai", "reasoner", 1, 1, 0, 0, 0);
	wrongAgent.agent = "cockpit-executor";
	assert.equal(collectSessionTree([session("parent", null, "openai", "reasoner", 1, 1, 0, 0, 0), wrongAgent], [message("parent", 1, 0, 0), message("child", 1, 0, 0)], "parent", "/workspace", 2_000, ["openai/reasoner", "opencode/hands"], "openai/reasoner", { "cockpit-executor": "opencode/hands" }).valid, false);
});

test("workspace snapshots detect modes and symlink targets", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "cockpit-snapshot-test-"));
	try {
		await writeFile(path.join(directory, "script.sh"), "exit 0\n");
		await chmod(path.join(directory, "script.sh"), 0o755);
		await symlink("script.sh", path.join(directory, "link"));
		const snapshot = await snapshotDirectory(directory);
		assert.deepEqual(snapshot["script.sh"], { type: "file", mode: 0o755, content: "exit 0\n" });
		assert.equal(snapshot.link.type, "symlink");
		assert.equal(snapshot.link.target, "script.sh");
		assert.equal(typeof snapshot.link.mode, "number");
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test("structurally identical snapshots do not produce changed artifacts", () => {
	const initial = { "file.txt": { type: "file", mode: 0o644, content: "same" } };
	const final = structuredClone(initial);
	assert.deepEqual(changedSnapshotFiles(initial, final), []);
	final["file.txt"].mode = 0o755;
	assert.deepEqual(changedSnapshotFiles(initial, final), ["file.txt"]);
});

test("atomic writes do not alter an existing parent directory mode", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "cockpit-atomic-test-"));
	try {
		await chmod(directory, 0o755);
		await writeFileExclusiveAtomic(path.join(directory, "result.txt"), "result");
		assert.equal((await stat(directory)).mode & 0o777, 0o755);
		assert.equal(await readFile(path.join(directory, "result.txt"), "utf8"), "result");
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test("critical gates enforce runner, worktree, output, scope, and verification", () => {
	const clean = evaluateCriticalGates(scenarios[0], {
		process: { status: 0, signal: null, error: null },
		output: "Evidence: src/config.js",
		initialStatus: "",
		finalStatus: "",
		initialSnapshot: { "src/config.js": "same" },
		finalSnapshot: { "src/config.js": "same" },
		commandResults: [],
	});
	assert.equal(clean.pass, true);
	const preparedMutation = evaluateCriticalGates({ id: "review", criticalGates: [{ id: "read-only", type: "worktree", value: "prepared-only" }] }, {
		process: { status: 0, signal: null, error: null },
		output: "",
		initialStatus: " M src/session.js",
		finalStatus: " M src/session.js",
		initialSnapshot: { "src/session.js": "prepared" },
		finalSnapshot: { "src/session.js": "mutated" },
		commandResults: [],
	});
	assert.equal(preparedMutation.pass, false);

	const changed = evaluateCriticalGates(scenarios[1], {
		process: { status: 0, signal: null, error: null },
		output: "done",
		initialStatus: "",
		finalStatus: " M src/config.js\n?? package.json",
		initialSnapshot: { "src/config.js": "old" },
		finalSnapshot: { "src/config.js": "new", "package.json": "new" },
		commandResults: [{ command: ["npm", "test"], status: 1, signal: null, error: null }],
	});
	assert.equal(changed.pass, false);
	assert.equal(changed.outcomes.find((gate) => gate.id === "scope").pass, false);
	assert.equal(changed.outcomes.find((gate) => gate.id === "verification").pass, false);
});

test("manifest and result validation reject tampering and config mismatches", () => {
	const job = generateJobs([scenarios[0]], ["control"], 1, "seed")[0];
	const manifest = createManifest({
		runID: "run",
		publishable: false,
		models: { reasoning: "openai/reasoner", hands: "opencode/hands" },
		repetitions: 1,
		arms: ["control"],
		timeoutMinutes: 1,
		allowedEnvironmentNames: [],
		provenance: { nodeVersion: process.versions.node },
		resolvedConfigs: { control: { resolvedHash: "config-hash" } },
		jobs: [job],
	});
	assert.equal(validateManifest(manifest), null);
	const manifestJob = manifest.jobs[0];
	const result = {
		schemaVersion: 2,
		runID: "run",
		jobID: manifestJob.jobID,
		manifestHash: manifest.manifestHash,
		scenario: manifestJob.scenario,
		arm: manifestJob.arm,
		repetition: manifestJob.repetition,
		resolvedConfigHash: "config-hash",
		telemetryValid: true,
		telemetry: { totalTokens: 1 },
		process: { status: 0, signal: null, error: null },
	};
	assert.equal(validateResult(result, manifest, manifestJob), null);
	const tampered = structuredClone(manifest);
	tampered.repetitions = 2;
	assert.match(validateManifest(tampered), /hash/);
	result.resolvedConfigHash = "wrong";
	assert.match(validateResult(result, manifest, manifestJob), /config/);
});

test("complete matrix validation rejects duplicated tuples", () => {
	const arms = ["control", "isolation", "role-split"];
	const jobs = generateJobs(scenarios, arms, 2, "seed");
	const manifest = createManifest({ runID: "run", publishable: true, models: {}, repetitions: 2, arms, timeoutMinutes: 1, allowedEnvironmentNames: [], provenance: {}, resolvedConfigs: {}, jobs });
	assert.equal(validateCompleteMatrix(manifest, scenarios.map((scenario) => scenario.id)), null);
	const malformed = structuredClone(manifest);
	malformed.jobs[1] = structuredClone(malformed.jobs[0]);
	assert.match(validateCompleteMatrix(malformed, scenarios.map((scenario) => scenario.id)), /incomplete|duplicated/);
});

test("blind review and summary CLIs accept only a complete matched matrix", async () => {
	const runID = `synthetic-${process.pid}-${Date.now()}`;
	const runDirectory = path.join(root, "evals/results/cost", runID);
	const privateDirectory = await mkdtemp(path.join(os.tmpdir(), "cockpit-review-test-"));
	try {
		const fullScenarios = JSON.parse(await readFile(path.join(root, "evals/cost/scenarios.json"), "utf8"));
		const arms = ["control", "isolation", "role-split"];
		const jobs = generateJobs(fullScenarios, arms, 2, "synthetic-seed");
		const resolvedConfigs = Object.fromEntries(arms.map((arm) => [arm, { resolvedHash: `${arm}-config` }]));
		const manifest = createManifest({
			runID,
			publishable: true,
			models: { reasoning: "openai/gpt-test", hands: "opencode/hands-test" },
			repetitions: 2,
			arms,
			timeoutMinutes: 1,
			allowedEnvironmentNames: [],
			provenance: { gitHead: "abc", workingTreeHash: "tree", benchmarkSourceHash: "source", nodeVersion: process.versions.node, openCodeVersion: "test" },
			resolvedConfigs,
			jobs,
		});
		await mkdir(runDirectory, { recursive: true });
		await writeFile(path.join(runDirectory, "manifest.json"), JSON.stringify(manifest));
		for (const job of manifest.jobs) {
			const directory = path.join(runDirectory, job.scenario, job.arm);
			await mkdir(directory, { recursive: true });
			await writeFile(path.join(directory, `${job.repetition}.json`), JSON.stringify({
				schemaVersion: 2,
				runID,
				jobID: job.jobID,
				manifestHash: manifest.manifestHash,
				scenario: job.scenario,
				arm: job.arm,
				repetition: job.repetition,
				resolvedConfigHash: resolvedConfigs[job.arm].resolvedHash,
				durationMs: 100,
				telemetryValid: true,
				telemetry: { reasoningModelTokens: 100, totalTokens: 150, peakParentContext: 80, delegationCount: 1, cost: 0.01 },
				critical: { pass: true, outcomes: [] },
				artifacts: { changes: [], prepared: [] },
				commandResults: [],
				output: "Synthetic gpt-test review output",
				process: { status: 0, signal: null, error: null },
			}));
		}

		const packet = path.join(privateDirectory, "packet.json");
		const mapping = path.join(privateDirectory, "mapping.json");
		const scores = path.join(privateDirectory, "scores.json");
		const prepared = spawnSync(process.execPath, ["scripts/prepare-cost-benchmark-review.mjs", runID, "--packet", packet, "--mapping", mapping, "--scores", scores], { cwd: root, encoding: "utf8" });
		assert.equal(prepared.status, 0, prepared.stderr);
		assert.doesNotMatch(await readFile(packet, "utf8"), /gpt-test/i);
		const scoreData = JSON.parse(await readFile(scores, "utf8"));
		for (const score of scoreData.scores) for (const dimension of Object.keys(score.dimensions)) score.dimensions[dimension] = 5;
		await writeFile(scores, JSON.stringify(scoreData));
		const mappingData = JSON.parse(await readFile(mapping, "utf8"));
		mappingData.items[1].blindID = mappingData.items[0].blindID;
		const invalidMapping = path.join(privateDirectory, "invalid-mapping.json");
		await writeFile(invalidMapping, JSON.stringify(mappingData));
		const rejected = spawnSync(process.execPath, ["scripts/summarize-cost-benchmark.mjs", "--run-id", runID, "--scores", scores, "--mapping", invalidMapping, "--output", path.join(privateDirectory, "invalid.md")], { cwd: root, encoding: "utf8" });
		assert.notEqual(rejected.status, 0);
		const output = path.join(privateDirectory, "scorecard.md");
		const summarized = spawnSync(process.execPath, ["scripts/summarize-cost-benchmark.mjs", "--run-id", runID, "--scores", scores, "--mapping", mapping, "--output", output], { cwd: root, encoding: "utf8" });
		assert.equal(summarized.status, 0, summarized.stderr);
		assert.match(await readFile(output, "utf8"), /Role-Split Delta/);
	} finally {
		await rm(runDirectory, { recursive: true, force: true });
		await rm(privateDirectory, { recursive: true, force: true });
	}
});

function message(sessionID, input, read, write) {
	return { session_id: sessionID, data: JSON.stringify({ role: "assistant", tokens: { input, cache: { read, write } } }) };
}

function session(id, parentID, providerID, modelID, input, output, read, write, cost) {
	return {
		id,
		parent_id: parentID,
		directory: "/workspace",
		time_created: 2_000,
		model: JSON.stringify({ providerID, modelID }),
		cost,
		tokens_input: input,
		tokens_output: output,
		tokens_reasoning: 0,
		tokens_cache_read: read,
		tokens_cache_write: write,
	};
}
