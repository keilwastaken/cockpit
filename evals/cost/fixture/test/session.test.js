import assert from "node:assert/strict";
import test from "node:test";
import { createSession, isSessionActive } from "../src/auth/session.js";

test("sessions expire after the configured duration", () => {
	const session = createSession({ id: "user-1" }, "secret", 30);
	assert.equal(isSessionActive(session, session.expiresAt - 1), true);
	assert.equal(isSessionActive(session, session.expiresAt), false);
});
