import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
	buildIsolatedConfig,
	changedSnapshotFiles,
	cockpitWorkerPrompt,
	correlateRoot,
	evaluateScenario,
	modelID,
	normalizeTelemetry,
	parseArgs,
	parseJsonEvents,
	renderContract,
	selectScenarios,
	shellCommand,
	snapshotDirectory,
	stableStringify,
	validateReportShape,
	validateResolvedConfig,
	validateScenarioSchema,
} from "../scripts/behavioral-eval-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginURL = pathToFileURL(path.join(root, ".opencode/plugins/cockpit.js")).href;
const parentModel = "openai/parent";
const workerModel = "opencode/worker";

function sessionRow(id, parentID, agent, model, start, end, directory = "/workspace") {
	const [providerID, modelID] = model.split("/");
	return { id, parent_id: parentID, directory, agent, model: JSON.stringify({ id: modelID, providerID, variant: "test" }), time_created: start, time_updated: end, cost: 0, tokens_input: 1, tokens_output: 1, tokens_reasoning: 0, tokens_cache_read: 0, tokens_cache_write: 0 };
}

function toolPart(id, sessionID, tool, { start, end, input = {}, metadata = {}, output = null, error = null, status = "completed" }) {
	return {
		id, message_id: `message-${id}`, session_id: sessionID, time_created: start, time_updated: end,
		data: JSON.stringify({ type: "tool", tool, state: { status, input, metadata, output, error, time: { start, end } } }),
	};
}

function taskPart(id, childID, start, end, model = workerModel) {
	const [providerID, modelID] = model.split("/");
	return toolPart(id, "parent", "task", {
		start, end,
		input: { subagent_type: "cockpit-worker", prompt: "packet" },
		metadata: { parentSessionId: "parent", sessionId: childID, model: { providerID, modelID } },
	});
}

function scenario(overrides = {}) {
	return {
		id: "unit", name: "Unit", category: "test", invocation: { type: "native", prompt: "test" }, workerMode: "unused", contract: null,
		expectedTopology: { children: 0, tasks: 0, skillCalls: 0 }, stateExpectation: { type: "prepared-only" }, verificationCommands: [], manualRubric: [],
		...overrides,
	};
}

function context(telemetry, overrides = {}) {
	return {
		process: { status: 0, signal: null, error: null }, correlation: { valid: true, rootID: "parent", reason: "matched" }, telemetry,
		parentModel, workerModel, baselineSnapshot: {}, preparedSnapshot: {}, finalSnapshot: {}, preparedStatus: "", finalStatus: "", preparedDiff: "", finalDiff: "", independentChecks: [],
		...overrides,
	};
}

test("modelID uses confirmed OpenCode model JSON fields", () => {
	assert.equal(modelID({ id: "worker", providerID: "opencode", variant: "free" }), workerModel);
	assert.equal(modelID({ modelID: "worker", providerID: "opencode" }), workerModel);
	assert.equal(modelID("invalid"), null);
});

test("scenario inventory is canonical and contains no legacy harness fields", async () => {
	const scenarios = validateScenarioSchema(JSON.parse(await readFile(path.join(root, "evals/scenarios.json"), "utf8")));
	assert.deepEqual(scenarios.map((item) => item.id), [
		"ordinary-native", "single-contract", "parallel-contract", "false-assumption-contract", "scope-pressure", "consequential-ambiguity", "worker-unavailable", "security-review", "failed-verification",
	]);
	for (const item of scenarios) for (const field of ["route", "commands", "workerModel", "criticalGates", "output-all", "runner-failure"]) assert.equal(field in item, false, `${item.id} contains ${field}`);
	assert.equal(scenarios.some((item) => item.id === "failed-validation"), false);
});

test("contracts render all five canonical sections in order", async () => {
	const scenarios = validateScenarioSchema(JSON.parse(await readFile(path.join(root, "evals/scenarios.json"), "utf8")));
	for (const item of scenarios.filter((entry) => entry.contract)) {
		const rendered = renderContract(item.contract);
		const headings = ["# Execution Contract", "## Goal", "## Allowed Files", "## Required Changes", "## Acceptance Checks", "## Stop Conditions"];
		let cursor = -1;
		for (const heading of headings) {
			const next = rendered.indexOf(heading);
			assert.ok(next > cursor, `${item.id} missing or misordered ${heading}`);
			cursor = next;
		}
	}
});

test("retained scenario objective expectations use exact topology and state rules", async () => {
	const scenarios = validateScenarioSchema(JSON.parse(await readFile(path.join(root, "evals/scenarios.json"), "utf8")));
	const byID = new Map(scenarios.map((item) => [item.id, item]));
	assert.deepEqual(byID.get("ordinary-native").expectedTopology, { children: 0, tasks: 0 });
	assert.equal(byID.get("single-contract").expectedTopology.children, 1);
	assert.equal(byID.get("single-contract").expectedTopology.tasks, 1);
	assert.equal(byID.get("parallel-contract").expectedTopology.children, 2);
	assert.equal(byID.get("parallel-contract").expectedTopology.tasksOverlap, true);
	assert.equal(byID.get("false-assumption-contract").expectedTopology.children, 0);
	assert.equal(byID.get("scope-pressure").expectedTopology.children, 0);
	assert.equal(byID.get("consequential-ambiguity").scored, false);
	for (const id of ["false-assumption-contract", "scope-pressure", "consequential-ambiguity", "worker-unavailable", "security-review", "failed-verification"]) assert.equal(byID.get(id).stateExpectation.type, "prepared-only");
	assert.deepEqual(byID.get("single-contract").expectedTopology.parentValidation.argv, ["npm", "test"]);
	assert.equal(byID.get("failed-verification").expectedTopology.parentValidation.status, "nonzero");
});

test("parseJsonEvents parses every nonblank line and fails closed", () => {
	assert.deepEqual(parseJsonEvents('{"sessionID":"a"}\n\n{"sessionID":"b"}\n').sessionIDs, ["a", "b"]);
	assert.equal(parseJsonEvents('{"sessionID":"a"}\nnot-json\n').valid, false);
	assert.equal(parseJsonEvents('{"type":"text"}\n').valid, false);
});

test("root correlation requires one parentless build session and workspace realpath", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "cockpit-root-"));
	const link = `${directory}-link`;
	try {
		await symlink(directory, link);
		const rows = [sessionRow("parent", null, "build", parentModel, 2_000, 3_000, link)];
		const matched = await correlateRoot({ eventSessionIDs: ["parent"], sessions: rows, workspace: directory, startedAt: 2_000, endedAt: 4_000, parentModel });
		assert.equal(matched.valid, true);
		assert.equal(matched.workspaceRealpath, await realpath(directory));
		const ambiguous = await correlateRoot({ eventSessionIDs: ["parent", "other"], sessions: [...rows, sessionRow("other", null, "build", parentModel, 2_100, 3_100, directory)], workspace: directory, startedAt: 2_000, endedAt: 4_000, parentModel });
		assert.equal(ambiguous.valid, false);
		assert.match(ambiguous.reason, /found 2/);
		const wrongWorkspace = await correlateRoot({ eventSessionIDs: ["parent"], sessions: rows, workspace: os.tmpdir(), startedAt: 2_000, endedAt: 4_000, parentModel });
		assert.equal(wrongWorkspace.valid, false);
	} finally {
		await rm(link, { force: true });
		await rm(directory, { recursive: true, force: true });
	}
});

test("normalization matches Task identity with realistic timestamp skew", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1_000, 5_000), sessionRow("child", "parent", "cockpit-worker", workerModel, 2_000, 3_000)];
	const normalized = normalizeTelemetry(rows, [taskPart("task", "child", 2_000, 3_000)], "parent");
	assert.equal(normalized.taskMatches.length, 1);
	assert.equal(normalized.taskMatches[0].matched, true);
	const skewed = normalizeTelemetry(rows, [taskPart("task", "child", 2_004, 2_997)], "parent");
	assert.equal(skewed.taskMatches[0].matched, true);
	const wrongTime = normalizeTelemetry(rows, [taskPart("task", "child", 3_001, 3_000)], "parent");
	assert.equal(wrongTime.taskMatches[0].matched, false);
	assert.match(wrongTime.taskMatches[0].reasons.join(" "), /times/);
});

test("Task matching is one-to-one and covers every child", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1_000, 5_000), sessionRow("one", "parent", "cockpit-worker", workerModel, 2_000, 3_000), sessionRow("two", "parent", "cockpit-worker", workerModel, 2_000, 3_000)];
	const telemetry = normalizeTelemetry(rows, [taskPart("first", "one", 2_000, 3_000), taskPart("second", "one", 2_000, 3_000)], "parent");
	const result = evaluateScenario(scenario({ workerMode: "required", expectedTopology: { children: 2, tasks: 2, skillCalls: 0, childAgent: "cockpit-worker" } }), context(telemetry));
	assert.equal(result.gates.find((gate) => gate.id === "task-child-matches").pass, false);
});

test("bounded Task gates require worker-owned in-scope mutations and contract prompts", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1_000, 5_000), sessionRow("child", "parent", "cockpit-worker", workerModel, 2_000, 3_000)];
	const task = taskPart("task", "child", 2_000, 3_000);
	const taskData = JSON.parse(task.data);
	taskData.state.input.prompt = "## Goal\nEdit math.\n## Allowed Files\nsrc/math.js\n## Required Changes\nAdd behavior.\n## Acceptance Checks\nnpm test\n## Stop Conditions\nStop on conflict.";
	task.data = JSON.stringify(taskData);
	const edit = toolPart("edit", "child", "edit", { start: 2_200, end: 2_300, input: { filePath: "/workspace/src/math.js" } });
	const expected = scenario({ workerMode: "required", contract: { allowedFiles: ["src/math.js"] }, expectedTopology: { children: 1, tasks: 1, boundedTasks: true } });
	let result = evaluateScenario(expected, context(normalizeTelemetry(rows, [task, edit], "parent")));
	assert.equal(result.gates.find((gate) => gate.id === "bounded-task-prompts").pass, true);
	assert.equal(result.gates.find((gate) => gate.id === "worker-mutation-ownership").pass, true);
	const parentEdit = toolPart("edit", "parent", "edit", { start: 3_100, end: 3_200, input: { filePath: "/workspace/src/math.js" } });
	result = evaluateScenario(expected, context(normalizeTelemetry(rows, [task, parentEdit], "parent")));
	assert.equal(result.gates.find((gate) => gate.id === "worker-mutation-ownership").pass, false);
	const outside = toolPart("edit", "child", "edit", { start: 2_200, end: 2_300, input: { filePath: "/workspace/package.json" } });
	result = evaluateScenario(expected, context(normalizeTelemetry(rows, [task, outside], "parent")));
	assert.equal(result.gates.find((gate) => gate.id === "worker-mutation-ownership").pass, false);
	const parentBash = toolPart("bash", "parent", "bash", { start: 3_100, end: 3_200, input: { command: "touch src/extra.js" } });
	result = evaluateScenario(expected, context(normalizeTelemetry(rows, [task, edit, parentBash], "parent")));
	assert.equal(result.gates.find((gate) => gate.id === "bash-mutation-intent").pass, false);
	const redirected = toolPart("redirect", "parent", "bash", { start: 3_100, end: 3_200, input: { command: "printf changed > src/math.js" } });
	result = evaluateScenario(expected, context(normalizeTelemetry(rows, [task, edit, redirected], "parent")));
	assert.equal(result.gates.find((gate) => gate.id === "bash-mutation-intent").pass, false);
});

test("normalization fails malformed part JSON", () => {
	assert.throws(() => normalizeTelemetry([sessionRow("parent", null, "build", parentModel, 1, 2)], [{ id: "bad", message_id: "m", session_id: "parent", time_created: 1, time_updated: 2, data: "{" }], "parent"), /malformed part/);
});

test("other tools use metadata time when state time is absent", () => {
	const row = {
		id: "bash", message_id: "message", session_id: "parent", time_created: 1, time_updated: 9,
		data: JSON.stringify({ type: "tool", tool: "bash", state: { status: "completed", input: { command: "npm test" }, metadata: { exit: 0, time: { start: 3, end: 4 } } } }),
	};
	const normalized = normalizeTelemetry([sessionRow("parent", null, "build", parentModel, 1, 9)], [row], "parent");
	assert.equal(normalized.tools[0].start, 3);
	assert.equal(normalized.tools[0].end, 4);
});

test("normalization retains actual session counters and tool output evidence", () => {
	const row = sessionRow("parent", null, "build", parentModel, 1, 9);
	row.cost = 0.25;
	row.tokens_input = 10;
	const part = {
		id: "bash", message_id: "message", session_id: "parent", time_created: 2, time_updated: 3,
		data: JSON.stringify({ type: "tool", tool: "bash", state: { status: "completed", input: { command: "npm test" }, output: "tests failed", error: "exit 1", metadata: { exit: 1 }, time: { start: 2, end: 3 } } }),
	};
	const normalized = normalizeTelemetry([row], [part], "parent");
	assert.equal(normalized.sessions[0].counters.cost, 0.25);
	assert.equal(normalized.sessions[0].counters.input, 10);
	assert.equal(normalized.tools[0].output, "tests failed");
	assert.equal(normalized.tools[0].error, "exit 1");
});

test("exact topology rejects extra children, tasks, and skill calls", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1_000, 6_000), sessionRow("one", "parent", "cockpit-worker", workerModel, 2_000, 3_000), sessionRow("two", "parent", "cockpit-worker", workerModel, 3_100, 4_000)];
	const telemetry = normalizeTelemetry(rows, [taskPart("task-one", "one", 2_000, 3_000), taskPart("task-two", "two", 3_100, 4_000), toolPart("skill", "parent", "skill", { start: 4_100, end: 4_200 })], "parent");
	const result = evaluateScenario(scenario(), context(telemetry));
	assert.equal(result.pass, false);
	assert.deepEqual(result.gates.filter((gate) => !gate.pass).map((gate) => gate.id).sort(), ["child-count", "skill-count", "task-count"]);
});

test("required worker enforces the explicit worker model and exact Task matching", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1_000, 5_000), sessionRow("child", "parent", "cockpit-worker", parentModel, 2_000, 3_000)];
	const telemetry = normalizeTelemetry(rows, [taskPart("task", "child", 2_000, 3_000, parentModel)], "parent");
	const result = evaluateScenario(scenario({ workerMode: "required", expectedTopology: { children: 1, tasks: 1, skillCalls: 0, childAgent: "cockpit-worker" } }), context(telemetry));
	assert.equal(result.gates.find((gate) => gate.id === "worker-model").pass, false);
});

test("parent inspection and exact fresh validation must follow task join with matching exit", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1_000, 6_000), sessionRow("child", "parent", "cockpit-worker", workerModel, 2_000, 3_000)];
	const parts = [
		taskPart("task", "child", 2_000, 3_000),
		toolPart("read", "parent", "read", { start: 3_100, end: 3_200, input: { filePath: "/workspace/src/math.js" } }),
		toolPart("test", "parent", "bash", { start: 3_300, end: 3_500, input: { command: "npm test" }, metadata: { exit: 0, time: { start: 3_300, end: 3_500 } } }),
	];
	const telemetry = normalizeTelemetry(rows, parts, "parent");
	const expected = scenario({ workerMode: "required", stateExpectation: { type: "changed-exactly", paths: ["src/math.js"] }, expectedTopology: { children: 1, tasks: 1, skillCalls: 0, childAgent: "cockpit-worker", inspectAfterTasks: true, inspectionPaths: ["src/math.js"], parentValidation: { argv: ["npm", "test"], status: 0 } } });
	const state = { baselineSnapshot: { "src/math.js": { content: "old" } }, preparedSnapshot: { "src/math.js": { content: "old" } }, finalSnapshot: { "src/math.js": { content: "new" } } };
	assert.equal(evaluateScenario(expected, context(telemetry, state)).pass, true);
	parts[2] = toolPart("test", "parent", "bash", { start: 3_300, end: 3_500, input: { command: "npm test" }, metadata: { exit: 1 } });
	assert.equal(evaluateScenario(expected, context(normalizeTelemetry(rows, parts, "parent"), state)).gates.find((gate) => gate.id === "parent-validation").pass, false);
	parts[2] = toolPart("test", "parent", "bash", { start: 2_500, end: 2_600, input: { command: "npm test" }, metadata: { exit: 0 } });
	assert.equal(evaluateScenario(expected, context(normalizeTelemetry(rows, parts, "parent"), state)).gates.find((gate) => gate.id === "parent-validation").pass, false);
	const unrelated = [taskPart("task", "child", 2_000, 3_000), toolPart("read", "parent", "read", { start: 3_100, end: 3_200, input: { filePath: "/workspace/package.json" } }), toolPart("test", "parent", "bash", { start: 3_300, end: 3_500, input: { command: "npm test" }, metadata: { exit: 0 } })];
	assert.equal(evaluateScenario(expected, context(normalizeTelemetry(rows, unrelated, "parent"), state)).gates.find((gate) => gate.id === "inspection-after-tasks").pass, false);
});

test("parallel overlap gate fails for sequential task intervals", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1_000, 7_000), sessionRow("one", "parent", "cockpit-worker", workerModel, 2_000, 3_000), sessionRow("two", "parent", "cockpit-worker", workerModel, 3_000, 4_000)];
	const telemetry = normalizeTelemetry(rows, [taskPart("one-task", "one", 2_000, 3_000), taskPart("two-task", "two", 3_000, 4_000)], "parent");
	const result = evaluateScenario(scenario({ workerMode: "required", expectedTopology: { children: 2, tasks: 2, skillCalls: 0, childAgent: "cockpit-worker", tasksOverlap: true } }), context(telemetry));
	assert.equal(result.gates.find((gate) => gate.id === "task-overlap").pass, false);
});

test("prepared-only requires exact snapshot, status, and diff equality", () => {
	const telemetry = normalizeTelemetry([sessionRow("parent", null, "build", parentModel, 1, 2)], [], "parent");
	const prepared = { "new.js": { type: "file", content: "prepared" } };
	assert.equal(evaluateScenario(scenario(), context(telemetry, { preparedSnapshot: prepared, finalSnapshot: prepared, preparedStatus: "?? new.js\n", finalStatus: "?? new.js\n", preparedDiff: "", finalDiff: "" })).pass, true);
	const changed = evaluateScenario(scenario(), context(telemetry, { preparedSnapshot: prepared, finalSnapshot: { "new.js": { type: "file", content: "changed" } }, preparedStatus: "?? new.js\n", finalStatus: "?? new.js\n", preparedDiff: "", finalDiff: "" }));
	assert.equal(changed.gates.find((gate) => gate.id === "prepared-snapshot").pass, false);
});

test("prepared scenarios must remain visibly uncommitted", () => {
	const telemetry = normalizeTelemetry([sessionRow("parent", null, "build", parentModel, 1, 2)], [], "parent");
	const expected = scenario({ prepare: { "new.js": "prepared" } });
	const result = evaluateScenario(expected, context(telemetry));
	assert.equal(result.gates.find((gate) => gate.id === "prepared-uncommitted").pass, false);
});

test("preflight gate requires objective not-found evidence", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1, 5)];
	const expected = scenario({ expectedTopology: { children: 0, tasks: 0, preflightPaths: ["src/missing.js"] } });
	let telemetry = normalizeTelemetry(rows, [toolPart("found", "parent", "read", { start: 2, end: 3, input: { filePath: "/workspace/src/missing.js" }, output: "present" })], "parent");
	assert.equal(evaluateScenario(expected, context(telemetry)).gates.find((gate) => gate.id === "parent-preflight").pass, false);
	telemetry = normalizeTelemetry(rows, [toolPart("missing", "parent", "read", { start: 2, end: 3, input: { filePath: "/workspace/src/missing.js" }, status: "error", error: "File not found" })], "parent");
	assert.equal(evaluateScenario(expected, context(telemetry)).gates.find((gate) => gate.id === "parent-preflight").pass, true);
});

test("single-contract state counts standard and focused test declarations", () => {
	const telemetry = normalizeTelemetry([sessionRow("parent", null, "build", parentModel, 1, 2)], [], "parent");
	const before = { "test/math.test.js": { content: "test('add',()=>{})\n" } };
	const after = { "test/math.test.js": { content: "test('add',()=>{})\ntest.only('subtract',()=>{})\n" } };
	const expected = scenario({ stateExpectation: { type: "changed-exactly", paths: ["test/math.test.js"], testCountDelta: { path: "test/math.test.js", pattern: "\\btest(?:\\.[A-Za-z]+)?\\s*\\(", delta: 1 } } });
	assert.equal(evaluateScenario(expected, context(telemetry, { baselineSnapshot: before, preparedSnapshot: before, finalSnapshot: after })).pass, true);
	const two = { "test/math.test.js": { content: `${after["test/math.test.js"].content}test('extra',()=>{})\n` } };
	assert.equal(evaluateScenario(expected, context(telemetry, { baselineSnapshot: before, preparedSnapshot: before, finalSnapshot: two })).gates.find((gate) => gate.id === "test-count-delta").pass, false);
});

test("security inspection must read a prepared path or run git diff", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1, 5)];
	const unrelated = normalizeTelemetry(rows, [toolPart("read", "parent", "read", { start: 2, end: 3, input: { filePath: "/workspace/package.json" } })], "parent");
	const expected = scenario({ expectedTopology: { children: 0, tasks: 0, skillCalls: 0, parentInspection: { paths: ["src/auth/session.js"] } } });
	assert.equal(evaluateScenario(expected, context(unrelated)).gates.find((gate) => gate.id === "parent-inspection").pass, false);
	const actual = normalizeTelemetry(rows, [toolPart("read", "parent", "read", { start: 2, end: 3, input: { filePath: "/workspace/src/auth/session.js" } })], "parent");
	assert.equal(evaluateScenario(expected, context(actual)).gates.find((gate) => gate.id === "parent-inspection").pass, true);
	const statusOnly = normalizeTelemetry(rows, [toolPart("status", "parent", "bash", { start: 2, end: 3, input: { command: "git status" } })], "parent");
	assert.equal(evaluateScenario(expected, context(statusOnly)).gates.find((gate) => gate.id === "parent-inspection").pass, false);
	const unrelatedDiff = normalizeTelemetry(rows, [toolPart("diff", "parent", "bash", { start: 2, end: 3, input: { command: "git diff -- package.json" } })], "parent");
	assert.equal(evaluateScenario(expected, context(unrelatedDiff)).gates.find((gate) => gate.id === "parent-inspection").pass, false);
	const untrackedDiff = normalizeTelemetry(rows, [toolPart("diff", "parent", "bash", { start: 2, end: 3, input: { command: "git diff" } })], "parent");
	assert.equal(evaluateScenario(expected, context(untrackedDiff)).gates.find((gate) => gate.id === "parent-inspection").pass, false);
	const failedRead = normalizeTelemetry(rows, [toolPart("read", "parent", "read", { start: 2, end: 3, input: { filePath: "/workspace/src/auth/session.js" }, status: "error" })], "parent");
	assert.equal(evaluateScenario(expected, context(failedRead)).gates.find((gate) => gate.id === "parent-inspection").pass, false);
});

test("all scenarios require normal OpenCode exit zero", () => {
	const telemetry = normalizeTelemetry([sessionRow("parent", null, "build", parentModel, 1, 2)], [], "parent");
	const result = evaluateScenario(scenario(), context(telemetry, { process: { status: 1, signal: null, error: null } }));
	assert.equal(result.gates.find((gate) => gate.id === "opencode-exit").pass, false);
});

test("independent verification statuses are objective gates", () => {
	const telemetry = normalizeTelemetry([sessionRow("parent", null, "build", parentModel, 1, 2)], [], "parent");
	const expected = scenario({ verificationCommands: [{ argv: ["npm", "test"], status: "nonzero" }] });
	assert.equal(evaluateScenario(expected, context(telemetry, { independentChecks: [{ status: 1 }] })).pass, true);
	assert.equal(evaluateScenario(expected, context(telemetry, { independentChecks: [{ status: 0 }] })).pass, false);
});

test("isolated config uses exact plugin and explicit worker without small_model or parent fallback", () => {
	const intended = buildIsolatedConfig({ parentModel, workerModel, workerMode: "required", pluginURL });
	assert.deepEqual(intended.plugin, [pluginURL]);
	assert.equal(intended.agent["cockpit-worker"].model, workerModel);
	assert.equal(intended.small_model, undefined);
	assert.equal(intended.agent.general, undefined);
	const resolved = {
		...intended,
		agent: { "cockpit-worker": { model: workerModel, mode: "subagent", disable: false, steps: 20, prompt: cockpitWorkerPrompt, permission: { task: "deny", question: "deny", webfetch: "deny", skill: "deny" } } },
		command: { "cockpit-run": { agent: "build", subtask: false, template: "available through the native Task tool Do not inspect project or global config files Await all task returns Inspect the actual combined repository state Run fresh validation checks yourself" } },
	};
	assert.equal(validateResolvedConfig({ intended, resolved, parentModel, workerModel, workerMode: "required", pluginURL }).valid, true);
	assert.throws(() => validateResolvedConfig({ intended, resolved: { ...resolved, plugin: [pluginURL, "file:///other.js"] }, parentModel, workerModel, workerMode: "required", pluginURL }), /plugin list/);
	for (const worker of [
		{ ...resolved.agent["cockpit-worker"], mode: "primary" },
		{ ...resolved.agent["cockpit-worker"], steps: 99 },
		{ ...resolved.agent["cockpit-worker"], prompt: "not canonical" },
		{ ...resolved.agent["cockpit-worker"], permission: { ...resolved.agent["cockpit-worker"].permission, task: "allow" } },
	]) assert.throws(() => validateResolvedConfig({ intended, resolved: { ...resolved, agent: { "cockpit-worker": worker } }, parentModel, workerModel, workerMode: "required", pluginURL }), /cockpit-worker/);
});

test("unavailable config omits worker and small model and requires plugin disablement", () => {
	const intended = buildIsolatedConfig({ parentModel, workerModel: null, workerMode: "unavailable", pluginURL });
	assert.equal(intended.agent, undefined);
	const resolved = {
		...intended, agent: { "cockpit-worker": { disable: true, mode: "subagent", steps: 20, prompt: cockpitWorkerPrompt, permission: { task: "deny", question: "deny", webfetch: "deny", skill: "deny", edit: "deny", bash: "deny" } } },
		command: { "cockpit-run": { agent: "build", subtask: false, template: "available through the native Task tool Do not inspect project or global config files Await all task returns Inspect the actual combined repository state Run fresh validation checks yourself" } },
	};
	assert.doesNotThrow(() => validateResolvedConfig({ intended, resolved, parentModel, workerModel: null, workerMode: "unavailable", pluginURL }));
});

test("CLI selection constraints prevent worker fallback and isolate unavailable mode", async () => {
	const scenarios = validateScenarioSchema(JSON.parse(await readFile(path.join(root, "evals/scenarios.json"), "utf8")));
	assert.throws(() => selectScenarios(scenarios, parseArgs([])), /worker-model is required/);
	assert.throws(() => selectScenarios(scenarios, parseArgs(["--no-worker", "--scenario", "ordinary-native"])), /only valid/);
	assert.throws(() => selectScenarios(scenarios, parseArgs(["--no-worker", "--worker-model", workerModel, "--scenario", "worker-unavailable"])), /mutually exclusive/);
	assert.throws(() => selectScenarios(scenarios, parseArgs(["--scenario", "worker-unavailable"])), /requires --no-worker/);
	assert.deepEqual(selectScenarios(scenarios, parseArgs(["--worker-model", workerModel])).map((item) => item.id).includes("worker-unavailable"), false);
	assert.deepEqual(selectScenarios(scenarios, parseArgs(["--no-worker", "--scenario", "worker-unavailable"])).map((item) => item.id), ["worker-unavailable"]);
});

test("CLI requires parent model and dry-run makes no model call", () => {
	const missing = spawnSync(process.execPath, ["scripts/run-behavioral-evals.mjs", "--scenario", "ordinary-native", "--dry-run"], { cwd: root, encoding: "utf8" });
	assert.notEqual(missing.status, 0);
	const dry = spawnSync(process.execPath, ["scripts/run-behavioral-evals.mjs", "--parent-model", parentModel, "--scenario", "ordinary-native", "--dry-run"], { cwd: root, encoding: "utf8" });
	assert.equal(dry.status, 0, dry.stderr);
	assert.match(dry.stdout, /ordinary-native/);
});

test("behavioral result directories include process identity to avoid concurrent collisions", async () => {
	const source = await readFile(path.join(root, "scripts/run-behavioral-evals.mjs"), "utf8");
	assert.match(source, /resultsDirectory[\s\S]*process\.pid/);
});

test("shell command representation is exact", () => {
	assert.equal(shellCommand(["npm", "test"]), "npm test");
	assert.equal(shellCommand(["node", "-e", "process.exit(0)"]), "node -e 'process.exit(0)'");
});

test("parent validation permits stderr capture without broad shell matching", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1, 5)];
	const telemetry = normalizeTelemetry(rows, [toolPart("test", "parent", "bash", { start: 2, end: 3, input: { command: "npm test 2>&1" }, metadata: { exit: 1 } })], "parent");
	const expected = scenario({ expectedTopology: { children: 0, tasks: 0, skillCalls: 0, parentValidation: { argv: ["npm", "test"], status: "nonzero" } } });
	assert.equal(evaluateScenario(expected, context(telemetry)).gates.find((gate) => gate.id === "parent-validation").pass, true);
});

test("explicit parent validation command takes precedence over substring hints", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1, 5)];
	const telemetry = normalizeTelemetry(rows, [toolPart("fake", "parent", "bash", { start: 2, end: 3, input: { command: "printf './src/alpha.js ./src/beta.js assert.equal(alpha assert.equal(beta'" }, metadata: { exit: 0 } })], "parent");
	const expected = scenario({ expectedTopology: { children: 0, tasks: 0, parentValidation: { argv: ["node", "validate.js"], command: "node validate.js", includes: ["./src/alpha.js", "./src/beta.js"], status: 0 } } });
	assert.equal(evaluateScenario(expected, context(telemetry)).gates.find((gate) => gate.id === "parent-validation").pass, false);
});

test("stop-scenario Bash policy rejects mutation even when final state is restored", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1, 5)];
	const telemetry = normalizeTelemetry(rows, [toolPart("mutate", "parent", "bash", { start: 2, end: 3, input: { command: "touch temp && rm temp" }, metadata: { exit: 0 } })], "parent");
	const expected = scenario({ expectedTopology: { children: 0, tasks: 0, mutationCalls: 0, bashPolicy: "none" } });
	assert.equal(evaluateScenario(expected, context(telemetry)).gates.find((gate) => gate.id === "bash-policy").pass, false);
});

test("read-only Bash policies permit Git inspection and the declared fixture test", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1, 10)];
	const parts = [
		toolPart("status", "parent", "bash", { start: 2, end: 3, input: { command: "git status --short" } }),
		toolPart("diff", "parent", "bash", { start: 4, end: 5, input: { command: "git diff --stat && git diff --no-ext-diff --unified=80" } }),
		toolPart("tracked", "parent", "bash", { start: 5, end: 6, input: { command: "git ls-files && git show HEAD:package.json" } }),
		toolPart("test", "parent", "bash", { start: 6, end: 7, input: { command: "npm test" }, metadata: { exit: 1 } }),
	];
	const telemetry = normalizeTelemetry(rows, parts, "parent");
	for (const bashPolicy of ["inspection-only", "validation-only"]) {
		const expected = scenario({ expectedTopology: { children: 0, tasks: 0, mutationCalls: 0, bashPolicy, parentValidation: { argv: ["npm", "test"], status: "nonzero" } } });
		assert.equal(evaluateScenario(expected, context(telemetry)).gates.find((gate) => gate.id === "bash-policy").pass, true);
	}
});

test("read-only Bash policy rejects shell redirection and unrelated commands", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1, 10)];
	for (const command of ["git status > status.txt", "node -e 'process.exit(0)'", "git status; touch temp", "git diff --output=result.patch", "git show --ext-diff HEAD"]) {
		const telemetry = normalizeTelemetry(rows, [toolPart("bash", "parent", "bash", { start: 2, end: 3, input: { command } })], "parent");
		const expected = scenario({ expectedTopology: { children: 0, tasks: 0, mutationCalls: 0, bashPolicy: "inspection-only" } });
		assert.equal(evaluateScenario(expected, context(telemetry)).gates.find((gate) => gate.id === "bash-policy").pass, false);
	}
});

test("Bash policy permits only an exact scenario-specific probe", () => {
	const rows = [sessionRow("parent", null, "build", parentModel, 1, 10)];
	const command = "node --input-type=module -e 'probe()'";
	const expected = scenario({ expectedTopology: { children: 0, tasks: 0, mutationCalls: 0, bashPolicy: "inspection-only", bashAllow: [command] } });
	const exact = normalizeTelemetry(rows, [toolPart("bash", "parent", "bash", { start: 2, end: 3, input: { command } })], "parent");
	assert.equal(evaluateScenario(expected, context(exact)).gates.find((gate) => gate.id === "bash-policy").pass, true);
	const appended = normalizeTelemetry(rows, [toolPart("bash", "parent", "bash", { start: 2, end: 3, input: { command: `${command}; touch temp` } })], "parent");
	assert.equal(evaluateScenario(expected, context(appended)).gates.find((gate) => gate.id === "bash-policy").pass, false);
});

test("snapshots capture content and changed paths", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "cockpit-snapshot-"));
	try {
		await mkdir(path.join(directory, ".git"));
		await writeFile(path.join(directory, "a.txt"), "one");
		const before = await snapshotDirectory(directory);
		await writeFile(path.join(directory, "a.txt"), "two");
		const after = await snapshotDirectory(directory);
		assert.deepEqual(changedSnapshotFiles(before, after), ["a.txt"]);
		assert.notEqual(stableStringify(before), stableStringify(after));
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test("report shape includes config, argv, telemetry, chronology, snapshots, checks, gates, and rubric", () => {
	const report = {
		schemaVersion: 2, scenario: {}, config: { intended: {}, resolved: {} }, invocation: { argv: [] }, parsedEvents: [], correlation: {}, sessions: [], parts: [], toolChronology: [], taskMatches: [],
		state: { baseline: {}, prepared: {}, final: {}, changedPaths: {} }, independentChecks: [], objective: { gates: [] }, manualRubric: [],
	};
	assert.equal(validateReportShape(report), report);
	assert.throws(() => validateReportShape({ ...report, taskMatches: undefined }), /taskMatches/);
});
