import assert from "node:assert/strict";
import test from "node:test";
import { flowConfigKeyForRole, isRoleName, normalizeRoleName, roleDefinitionFor, roleDefinitions } from "../extensions/cockpit/delegates/roles.ts";

test("role registry normalizes taskWriter alias", () => {
	assert.equal(normalizeRoleName("taskWriter"), "task-writer");
	assert.equal(normalizeRoleName("task-writer"), "task-writer");
});

test("role registry excludes codeflow", () => {
	assert.equal(isRoleName("codeflow"), false);
	assert.equal(normalizeRoleName("codeflow"), undefined);
});

test("role config key preserves taskWriter config shape", () => {
	assert.equal(flowConfigKeyForRole("task-writer"), "taskWriter");
	assert.equal(flowConfigKeyForRole("taskWriter"), "taskWriter");
});

test("role definitions identify special and child roles", () => {
	assert.equal(roleDefinitionFor("instant").kind, "direct");
	assert.equal(roleDefinitionFor("ideate").kind, "multi");
	assert.equal(roleDefinitionFor("research").kind, "child");
	assert.equal(roleDefinitions.normal.label, "Normal delegate");
});

test("role registry is the source of user-runnable non-codeflow roles", () => {
	assert.deepEqual(Object.keys(roleDefinitions).sort(), [
		"fast",
		"ideate",
		"instant",
		"normal",
		"planner",
		"research",
		"reviewer",
		"task-writer",
	].sort());
});
