import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { instantDelegate } from "../extensions/cockpit/delegates/instant.ts";

const config = {
	strictMode: true,
	agents: ["instant", "fast", "normal"],
	delegateFlows: {
		instant: { agent: "instant", description: "", model: "", tools: ["read", "edit"], thinking: "off", maxFiles: 1, maxEstimatedLines: 30, maxTurns: 1, timeoutMs: 15_000 },
		fast: { agent: "fast", description: "", model: "", tools: [], thinking: "low", maxFiles: 3, maxEstimatedLines: 300, maxTurns: 3, timeoutMs: 45_000 },
		research: { agent: "research", description: "", model: "", tools: [], thinking: "minimal", maxFiles: 7, maxEstimatedLines: 0, maxTurns: 5, timeoutMs: 180_000 },
		normal: { agent: "normal", description: "", model: "", tools: [], thinking: "medium", maxFiles: 6, maxEstimatedLines: 600, maxTurns: 8, timeoutMs: 600_000 },
		planner: { agent: "planner", description: "", model: "", tools: [], thinking: "xhigh", maxFiles: 3, maxEstimatedLines: 0, maxTurns: 5, timeoutMs: 240_000 },
		reviewer: { agent: "reviewer", description: "", model: "", tools: [], thinking: "medium", maxFiles: 10, maxEstimatedLines: 0, maxTurns: 6, timeoutMs: 240_000 },
		taskWriter: { agent: "task-writer", description: "", model: "", tools: [], thinking: "low", maxFiles: 6, maxEstimatedLines: 250, maxTurns: 4, timeoutMs: 180_000 },
		ideate: { agent: "ideate", description: "", model: "", tools: [], thinking: "high", maxFiles: 8, maxEstimatedLines: 0, maxTurns: 6, timeoutMs: 300_000 },
	},
	maxFiles: 1,
	maxEstimatedLines: 30,
	disallowDomains: ["deployment", "architecture"],
	forbiddenCommands: [],
};

test("instant delegate applies deterministic quoted replace without child agent", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "cockpit-instant-"));
	await writeFile(join(cwd, "sample.txt"), "hello old world\n", "utf8");

	const result = await instantDelegate.run(
		{ plan: "replace `old` with `new` in sample.txt", file: "sample.txt" },
		config,
		{ cwd, projectTrusted: true },
	);

	assert.equal(result.exitCode, 0);
	assert.match(result.finalOutput, /direct edit/i);
	assert.equal(await readFile(join(cwd, "sample.txt"), "utf8"), "hello new world\n");
});

test("instant delegate escalates ambiguous semantic edits to fast", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "cockpit-instant-"));
	await writeFile(join(cwd, "sample.txt"), "hello world\n", "utf8");

	const result = await instantDelegate.run(
		{ plan: "make the greeting more friendly in sample.txt", file: "sample.txt" },
		config,
		{ cwd, projectTrusted: true },
	);

	assert.equal(result.exitCode, 1);
	assert.equal(result.escalateTo, "fast");
	assert.match(result.blockedReason ?? "", /deterministic/i);
	assert.equal(await readFile(join(cwd, "sample.txt"), "utf8"), "hello world\n");
});
