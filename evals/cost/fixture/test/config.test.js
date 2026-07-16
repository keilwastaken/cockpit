import assert from "node:assert/strict";
import test from "node:test";
import { resolveConfig } from "../src/config/index.js";

test("project settings override user settings and defaults", () => {
	assert.deepEqual(resolveConfig({
		user: { port: 4000, sessionMinutes: 90 },
		project: { port: 5000 },
	}), { port: 5000, sessionMinutes: 90, requireMfa: false });
});

test("invalid configuration is rejected", () => {
	assert.throws(() => resolveConfig({ project: { port: 0 } }), /port/);
});
