import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { roles as opencodeRoles } from "../scripts/adapter-definition.mjs";
import {
	aggregateTelemetry,
	armConfig,
	changedSnapshotFiles,
	collectSessionTree,
	createManifest,
	evaluateCriticalGates,
	generateJobs,
	median,
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

test("cost benchmark CLI loads after role inventory changes", () => {
	const result = spawnSync(process.execPath, ["scripts/run-cost-benchmark.mjs", "--run-id", "cli-smoke", "--dry-run", "--repetitions", "1", "--max-runs", "1"], { cwd: root, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /config-research/);
});

test("OpenCode JSONL parsing rejects malformed non-empty records", () => {
	assert.deepEqual(parseJsonLines('{"type":"text"}\n'), [{ type: "text" }]);
	assert.throws(() => parseJsonLines('{"type":"text"}\nnot-json\n'), /malformed OpenCode JSONL/);
});

test("armConfig sets small_model and explore model per arm semantics", () => {
	const cockpitRoot = "/tmp/test";
	const reasoning = "openai/reasoner";
	const hands = "opencode/hands";
	const control = armConfig("control", cockpitRoot, reasoning, hands, opencodeRoles);
	assert.equal(control.model, reasoning);
	assert.equal(control.small_model, reasoning);
	assert.equal(control.agent.explore.model, reasoning);
	assert.equal(control.agent.general.model, reasoning);
	assert.equal(control.plugin, undefined);

	const isolation = armConfig("isolation", cockpitRoot, reasoning, hands, opencodeRoles);
	assert.equal(isolation.small_model, reasoning);
	assert.equal(isolation.agent.explore.model, reasoning);
	assert.equal(isolation.agent.general.model, reasoning);
	assert.ok(isolation.plugin);

	const roleSplit = armConfig("role-split", cockpitRoot, reasoning, hands, opencodeRoles);
	assert.equal(roleSplit.small_model, hands);
	assert.equal(roleSplit.agent.explore.model, hands);
	assert.equal(roleSplit.agent.general.model, hands);
	assert.ok(roleSplit.plugin);
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
	// Agent model mismatches are invalid: general must use hands model
	const wrongGeneral = session("child", "parent", "openai", "reasoner", 1, 1, 0, 0, 0);
	wrongGeneral.agent = "general";
	assert.equal(collectSessionTree([session("parent", null, "openai", "reasoner", 1, 1, 0, 0, 0), wrongGeneral], [message("parent", 1, 0, 0), message("child", 1, 0, 0)], "parent", "/workspace", 2_000, ["openai/reasoner", "opencode/hands"], "openai/reasoner", { "general": "opencode/hands" }).valid, false);
	// Agent model mismatches are invalid: built-in explore must use hands model in role-split
	const wrongExplore = session("explore-child", "parent", "openai", "reasoner", 1, 1, 0, 0, 0);
	wrongExplore.agent = "explore";
	assert.equal(collectSessionTree([session("parent", null, "openai", "reasoner", 1, 1, 0, 0, 0), wrongExplore], [message("parent", 1, 0, 0), message("explore-child", 1, 0, 0)], "parent", "/workspace", 2_000, ["openai/reasoner", "opencode/hands"], "openai/reasoner", { "explore": "opencode/hands" }).valid, false);
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

test("delegation gate: exempt control with any delegation count and without telemetry", () => {
	const gate = { id: "d", type: "delegation", arms: { control: { min: 0, max: 0 }, isolation: { min: 1 } } };
	// Control passes with explicit telemetry
	let result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "control",
		telemetry: { delegationCount: 5 }, sessions: [{ isParent: true }, { isParent: false }, { isParent: false }],
	});
	assert.equal(result.pass, true, "control must pass even with nonzero delegation");
	// Control passes with absent telemetry
	result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "control",
	});
	assert.equal(result.pass, true, "control must pass without any telemetry");
	// Control passes with null telemetry
	result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "control",
		telemetry: null, sessions: null,
	});
	assert.equal(result.pass, true, "control must pass with null telemetry");
});

test("delegation gate: required minimum delegation passes when count meets threshold", () => {
	const gate = { id: "d", type: "delegation", arms: { isolation: { min: 1 } } };
	const result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "isolation",
		telemetry: { delegationCount: 2 }, sessions: [{ isParent: true }, { isParent: false }, { isParent: false }],
	});
	assert.equal(result.pass, true);
});

test("delegation gate: prohibited delegation fails when count exceeds max", () => {
	const gate = { id: "d", type: "delegation", arms: { isolation: { max: 0 } } };
	const result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "isolation",
		telemetry: { delegationCount: 1 }, sessions: [{ isParent: true }, { isParent: false, agent: "explore" }],
	});
	assert.equal(result.pass, false);
	assert.match(result.outcomes[0].detail, /1 > max 0/);
});

test("delegation gate: wrong worker role fails", () => {
	const gate = { id: "d", type: "delegation", arms: { isolation: { min: 1, max: 1, agents: ["general"] } } };
	const result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "isolation",
		telemetry: { delegationCount: 1 }, sessions: [{ isParent: true }, { isParent: false, agent: "explore" }],
	});
	assert.equal(result.pass, false);
	assert.match(result.outcomes[0].detail, /expected agents \[general\], found \[explore\]/);
});

test("delegation gate: missing telemetry fails", () => {
	const gate = { id: "d", type: "delegation", arms: { isolation: { min: 1 } } };
	const result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "isolation",
	});
	assert.equal(result.pass, false);
	assert.match(result.outcomes[0].detail, /telemetry missing/);
});

test("delegation gate: valid role-split with expected agent passes", () => {
	const gate = { id: "d", type: "delegation", arms: { "role-split": { min: 1, agents: ["general"] } } };
	const result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "role-split",
		telemetry: { delegationCount: 1 }, sessions: [{ isParent: true }, { isParent: false, agent: "general" }],
	});
	assert.equal(result.pass, true);
});

test("delegation gate: child session count mismatch fails", () => {
	const gate = { id: "d", type: "delegation", arms: { isolation: { min: 1 } } };
	const result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "isolation",
		telemetry: { delegationCount: 2 }, sessions: [{ isParent: true }],
	});
	assert.equal(result.pass, false);
	assert.match(result.outcomes[0].detail, /child session count \d+ != delegation count 2/);
});

test("delegation gate: wrong child model fails", () => {
	const gate = { id: "d", type: "delegation", arms: { "role-split": { min: 1, max: 1, agents: ["general"], agentModels: { "general": "hands" } } } };
	const result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "role-split",
		telemetry: { delegationCount: 1 },
		sessions: [{ isParent: true, model: "reasoner-v1" }, { isParent: false, agent: "general", model: "wrong-model" }],
		models: { reasoning: "reasoner-v1", hands: "hands-v1" },
	});
	assert.equal(result.pass, false);
	assert.match(result.outcomes[0].detail, /wrong model for general/);
});

test("delegation gate: valid model check passes", () => {
	const gate = { id: "d", type: "delegation", arms: { "role-split": { min: 1, max: 1, agents: ["general"], agentModels: { "general": "hands" } } } };
	const result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "role-split",
		telemetry: { delegationCount: 1 },
		sessions: [{ isParent: true, model: "reasoner-v1" }, { isParent: false, agent: "general", model: "hands-v1" }],
		models: { reasoning: "reasoner-v1", hands: "hands-v1" },
	});
	assert.equal(result.pass, true);
});

test("delegation gate: rejects extra child when max is 1", () => {
	const gate = { id: "d", type: "delegation", arms: { isolation: { min: 1, max: 1, agents: ["explore"] } } };
	const result = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "isolation",
		telemetry: { delegationCount: 2 }, sessions: [{ isParent: true }, { isParent: false, agent: "explore" }, { isParent: false, agent: "explore" }],
	});
	assert.equal(result.pass, false);
	assert.match(result.outcomes[0].detail, /2 > max 1/);
});

test("actual config-research delegation requires exactly one explore child in Cockpit arms", async () => {
	const scenarios = JSON.parse(await readFile(path.join(root, "evals/cost/scenarios.json"), "utf8"));
	const configResearch = scenarios.find((s) => s.id === "config-research");
	assert.ok(configResearch, "config-research scenario must exist");
	const gate = configResearch.criticalGates.find((g) => g.type === "delegation");
	assert.ok(gate, "delegation gate must exist");
	// Control exempt: min:0 max:0
	assert.deepEqual(gate.arms.control, { min: 0, max: 0 }, "control must be exempt");
	// Both Cockpit arms require exactly one delegation
	assert.equal(gate.arms.isolation.min, 1, "isolation must have min 1");
	assert.equal(gate.arms.isolation.max, 1, "isolation must have max 1");
	assert.deepEqual(gate.arms.isolation.agents, ["explore"], "isolation agents must be [explore]");
	assert.equal(gate.arms["role-split"].min, 1, "role-split must have min 1");
	assert.equal(gate.arms["role-split"].max, 1, "role-split must have max 1");
	assert.deepEqual(gate.arms["role-split"].agents, ["explore"], "role-split agents must be [explore]");
	// Verify gate rejects extra child
	const passResult = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "isolation",
		telemetry: { delegationCount: 1 }, sessions: [{ isParent: true }, { isParent: false, agent: "explore" }],
	});
	assert.equal(passResult.pass, true, "exactly one explore delegation must pass");
	const failResult = evaluateCriticalGates({ criticalGates: [gate] }, {
		process: { status: 0, signal: null, error: null }, output: "", initialStatus: "", finalStatus: "",
		initialSnapshot: {}, finalSnapshot: {}, commandResults: [], arm: "isolation",
		telemetry: { delegationCount: 2 }, sessions: [{ isParent: true }, { isParent: false, agent: "explore" }, { isParent: false, agent: "explore" }],
	});
	assert.equal(failResult.pass, false, "two explore delegations must fail");
	assert.match(failResult.outcomes[0].detail, /2 > max 1/);
});

test("config-research manualRubric includes handoff-concision", async () => {
	const scenarios = JSON.parse(await readFile(path.join(root, "evals/cost/scenarios.json"), "utf8"));
	const configResearch = scenarios.find((s) => s.id === "config-research");
	assert.ok(configResearch, "config-research scenario must exist");
	assert.ok(configResearch.manualRubric.includes("handoff-concision"), "manualRubric must include handoff-concision");
});

test("collectSessionTree anchors to parent session from SQLite database and excludes unrelated sessions", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "cockpit-session-db-test-"));
	try {
		const dbPath = path.join(directory, "opencode.db");
		const database = new DatabaseSync(dbPath, { readWrite: true });
		database.exec("CREATE TABLE session (id TEXT PRIMARY KEY, parent_id TEXT, directory TEXT, agent TEXT, model TEXT, cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER, time_created INTEGER)");
		database.exec("CREATE TABLE message (session_id TEXT, data TEXT)");

		const now = Date.now();
		// Parent session matching workspace and time
		database.prepare("INSERT INTO session (id, parent_id, directory, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("parent", null, "/workspace", null, JSON.stringify({ providerID: "openai", modelID: "reasoner" }), 0.5, 100, 20, 5, 10, 2, now);
		// Child session
		database.prepare("INSERT INTO session (id, parent_id, directory, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("child", "parent", "/workspace", "explore", JSON.stringify({ providerID: "opencode", modelID: "hands" }), 0.1, 30, 10, 0, 5, 1, now + 100);
		// Grandchild session
		database.prepare("INSERT INTO session (id, parent_id, directory, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("grandchild", "child", "/workspace", "explore", JSON.stringify({ providerID: "opencode", modelID: "hands" }), 0.05, 15, 5, 0, 2, 0, now + 200);
		// Unrelated session in different workspace
		database.prepare("INSERT INTO session (id, parent_id, directory, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("unrelated", null, "/other-project", null, JSON.stringify({ providerID: "openai", modelID: "reasoner" }), 999, 999, 999, 0, 0, 0, now + 300);
		// Another unrelated session with stale time
		database.prepare("INSERT INTO session (id, parent_id, directory, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("stale", null, "/workspace", null, JSON.stringify({ providerID: "openai", modelID: "other" }), 0, 0, 0, 0, 0, 0, 500);

		// Add messages with token data for collectSessionTree validation
		database.prepare("INSERT INTO message (session_id, data) VALUES (?, ?)").run("parent", JSON.stringify({ role: "user", text: "Research the codebase for configuration handling.", tokens: { input: 100, cache: { read: 5, write: 1 } } }));
		database.prepare("INSERT INTO message (session_id, data) VALUES (?, ?)").run("parent", JSON.stringify({ role: "assistant", text: "I found the configuration system in src/config/ with three files.", tokens: { input: 50, cache: { read: 10, write: 2 } } }));
		database.prepare("INSERT INTO message (session_id, data) VALUES (?, ?)").run("child", JSON.stringify({ role: "user", text: "Find how config validation works.", tokens: { input: 30, cache: { read: 2, write: 0 } } }));
		database.prepare("INSERT INTO message (session_id, data) VALUES (?, ?)").run("child", JSON.stringify({ role: "assistant", text: "Config validation uses a schema defined in src/config/validate.js.", tokens: { input: 20, cache: { read: 5, write: 1 } } }));
		database.close();

		// Query the database using the same pattern as run-behavioral-evals.mjs
		const queryDb = new DatabaseSync(dbPath, { readOnly: true });
		const rows = queryDb.prepare("SELECT id, parent_id, directory, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created FROM session ORDER BY time_created ASC").all();
		const messageRows = queryDb.prepare("SELECT session_id, data FROM message ORDER BY session_id").all();
		queryDb.close();

		// Collect tree anchored at parent
		const collected = collectSessionTree(rows, messageRows, "parent", "/workspace", now, [], null, {});
		assert.equal(collected.valid, true, "tree collection must be valid");
		const ids = collected.sessions.map((s) => s.id);
		assert.deepEqual(ids, ["parent", "child", "grandchild"], "must select parent, child, and grandchild only");
		assert.ok(collected.sessions.find((s) => s.isParent).id === "parent", "parent session must be marked isParent");

		// Collect tree anchored at unrelated should fail
		const unrelatedCollected = collectSessionTree(rows, [], "unrelated", "/workspace", now);
		assert.equal(unrelatedCollected.valid, false, "unrelated session must fail provenance check");

		// Collect tree anchored at stale should fail
		const staleCollected = collectSessionTree(rows, [], "stale", "/workspace", now);
		assert.equal(staleCollected.valid, false, "stale session must fail provenance check");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
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

test("blind review and summary CLIs accept only a complete matched matrix with fractional medians and exact sums", async () => {
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
		// Use distinct cache values per job so medians are fractional and totals vary by arm
		const cacheByJob = {};
		for (const job of manifest.jobs) {
			const key = `${job.arm}-${job.scenario}-${job.repetition}`;
			// Control arm: values 10-19, isolation: 20-29, role-split: 30-39
			const base = job.arm === "control" ? 10 : job.arm === "isolation" ? 20 : 30;
			const offset = fullScenarios.findIndex((s) => s.id === job.scenario) * 2 + job.repetition;
			cacheByJob[job.jobID] = { cacheRead: base + offset + 0.5, cacheWrite: base + offset };
		}
		for (const job of manifest.jobs) {
			const c = cacheByJob[job.jobID];
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
				telemetry: { reasoningModelTokens: 100, handsModelTokens: 50, totalTokens: 150, cacheRead: c.cacheRead, cacheWrite: c.cacheWrite, peakParentContext: 80, delegationCount: 1, cost: 0.01 },
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
		const scorecard = await readFile(output, "utf8");
		assert.match(scorecard, /Role-Split Delta/);
		assert.match(scorecard, /Hands Processed/);
		assert.match(scorecard, /Hands Used/);
		assert.match(scorecard, /Matrix Token Totals/);
		assert.match(scorecard, /Reasoning Share/);
		// Cache columns present in overall, matrix totals, and scenario results
		assert.match(scorecard, /Cache Reads/);
		assert.match(scorecard, /Cache Writes/);
		assert.match(scorecard, /Cache observations/);
		const sectionRows = (heading, nextHeading) => {
			const start = scorecard.indexOf(heading);
			const end = nextHeading ? scorecard.indexOf(nextHeading, start + heading.length) : scorecard.length;
			return scorecard.slice(start, end).split("\n");
		};
		const cells = (row) => row.split("|").slice(1, -1).map((cell) => cell.trim());
		const overallRows = sectionRows("## Overall", "## Matrix Token Totals");
		const totalRows = sectionRows("## Matrix Token Totals", "## Scenario Results");
		const scenarioRows = sectionRows("## Scenario Results", "## Role-Split Delta");
		// Fractional cache medians and exact matrix sums are rendered in their specific cells.
		for (const arm of ["control", "isolation", "role-split"]) {
			const armJobs = manifest.jobs.filter((j) => j.arm === arm);
			const reads = armJobs.map((j) => cacheByJob[j.jobID].cacheRead).sort((a, b) => a - b);
			const writes = armJobs.map((j) => cacheByJob[j.jobID].cacheWrite).sort((a, b) => a - b);
			const middle = reads.length / 2;
			const medianRead = reads.length % 2 === 0 ? (reads[middle - 1] + reads[middle]) / 2 : reads[Math.floor(middle)];
			const medianWrite = writes.length % 2 === 0 ? (writes[middle - 1] + writes[middle]) / 2 : writes[Math.floor(middle)];
			const overall = cells(overallRows.find((row) => row.startsWith(`| ${arm} |`)));
			assert.equal(overall[6], medianRead.toFixed(1), `${arm} cache-read median`);
			assert.equal(overall[7], medianWrite.toFixed(1), `${arm} cache-write median`);
			const armTotalReads = armJobs.reduce((sum, j) => sum + cacheByJob[j.jobID].cacheRead, 0);
			const armTotalWrites = armJobs.reduce((sum, j) => sum + cacheByJob[j.jobID].cacheWrite, 0);
			const totals = cells(totalRows.find((row) => row.startsWith(`| ${arm} |`)));
			assert.equal(totals[4], String(armTotalReads), `${arm} cache-read total`);
			assert.equal(totals[5], String(armTotalWrites), `${arm} cache-write total`);
			for (const scenario of fullScenarios) {
				const jobs = armJobs.filter((job) => job.scenario === scenario.id);
				const scenarioRead = median(jobs.map((job) => cacheByJob[job.jobID].cacheRead));
				const scenarioWrite = median(jobs.map((job) => cacheByJob[job.jobID].cacheWrite));
				const row = cells(scenarioRows.find((line) => line.startsWith(`| ${scenario.id} | ${arm} |`)));
				assert.equal(row[7], scenarioRead.toFixed(1), `${scenario.id}/${arm} cache-read median`);
				assert.equal(row[8], scenarioWrite.toFixed(1), `${scenario.id}/${arm} cache-write median`);
			}
		}
		// No banned cache claims (qualification descriptions may mention these terms in negation)
		assert.doesNotMatch(scorecard, /cache hit rate/i);
		assert.doesNotMatch(scorecard, /avoided cost/i);
		assert.doesNotMatch(scorecard, /savings/i);
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
