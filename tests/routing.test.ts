import assert from "node:assert/strict";
import test from "node:test";
import { routeTask } from "../extensions/cockpit/routing.ts";
import { fileArgsForPlan, extractFilePaths } from "../extensions/cockpit/delegates/context.ts";

const config = {
	strictMode: true,
	agents: ["instant", "fast", "normal", "planner", "reviewer", "research", "ideate", "task-writer"],
	delegateFlows: {
		instant: { agent: "instant", description: "", model: "", tools: ["read", "edit"], thinking: "off", maxFiles: 1, maxEstimatedLines: 30, maxTurns: 2, timeoutMs: 60_000 },
		fast: { agent: "fast", description: "", model: "", tools: ["read", "edit"], thinking: "low", maxFiles: 3, maxEstimatedLines: 300, maxTurns: 5, timeoutMs: 180_000 },
		research: { agent: "research", description: "", model: "", tools: ["read"], thinking: "minimal", maxFiles: 7, maxEstimatedLines: 0, maxTurns: 5, timeoutMs: 180_000 },
		normal: { agent: "normal", description: "", model: "", tools: ["read", "edit", "bash"], thinking: "medium", maxFiles: 6, maxEstimatedLines: 600, maxTurns: 8, timeoutMs: 900_000 },
		planner: { agent: "planner", description: "", model: "", tools: ["read"], thinking: "xhigh", maxFiles: 3, maxEstimatedLines: 0, maxTurns: 5, timeoutMs: 240_000 },
		reviewer: { agent: "reviewer", description: "", model: "", tools: ["read", "bash"], thinking: "medium", maxFiles: 10, maxEstimatedLines: 0, maxTurns: 6, timeoutMs: 240_000 },
		taskWriter: { agent: "task-writer", description: "", model: "", tools: ["read", "write"], thinking: "low", maxFiles: 6, maxEstimatedLines: 250, maxTurns: 4, timeoutMs: 180_000 },
		ideate: { agent: "ideate", description: "", model: "", tools: ["read"], thinking: "high", maxFiles: 8, maxEstimatedLines: 0, maxTurns: 6, timeoutMs: 300_000 },
	},
	maxFiles: 1,
	maxEstimatedLines: 30,
	disallowDomains: ["deployment", "architecture"],
	forbiddenCommands: ["commit", "push", "deploy", "publish", "reset", "clean"],
};

test("risk domains are advisory unless configured as disallowed", () => {
	const decision = routeTask("fix auth token handling in app/auth/jwt.py", config, true);
	assert.equal(decision.route, "instant");
	assert.ok(decision.signals.riskDomains.includes("auth"));
});

test("file args normalize @ prefixes and README", () => {
	assert.deepEqual(fileArgsForPlan("edit @src/a.ts and README.md", config), ["@src/a.ts"]);
});

test("extractFilePaths deduplicates paths", () => {
	assert.deepEqual(extractFilePaths("Changed src/a.ts, src/a.ts and tests/a.test.ts"), ["src/a.ts", "tests/a.test.ts"]);
});

