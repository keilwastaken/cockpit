import assert from "node:assert/strict";
import test from "node:test";
import { isBroadWork, sliceWork } from "../extensions/cockpit/work.ts";

const config = {
	strictMode: true,
	agents: ["instant", "fast", "normal"],
	delegateFlows: {
		instant: { agent: "instant", description: "", model: "", tools: [], thinking: "off", maxFiles: 1, maxEstimatedLines: 30, maxTurns: 2, timeoutMs: 60_000 },
		fast: { agent: "fast", description: "", model: "", tools: [], thinking: "low", maxFiles: 3, maxEstimatedLines: 300, maxTurns: 5, timeoutMs: 180_000 },
		research: { agent: "research", description: "", model: "", tools: [], thinking: "minimal", maxFiles: 7, maxEstimatedLines: 0, maxTurns: 5, timeoutMs: 180_000 },
		normal: { agent: "normal", description: "", model: "", tools: [], thinking: "medium", maxFiles: 6, maxEstimatedLines: 600, maxTurns: 8, timeoutMs: 900_000 },
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

test("broad work is detected from many actions", () => {
	assert.equal(isBroadWork("fix auth, add rate limiting, update tests, wire errors", config), true);
});

test("small exact work is not broad", () => {
	assert.equal(isBroadWork("fix typo in src/a.ts", config), false);
});

test("sliceWork creates focused first slice prompt", () => {
	const slices = sliceWork("fix auth then add rate limiting then update tests");
	assert.ok(slices.length >= 2);
	assert.match(slices[0].prompt, /This slice only/i);
	assert.match(slices[0].prompt, /fix auth/i);
	assert.doesNotMatch(slices[0].prompt.split("This slice only:")[1], /rate limiting/i);
});
