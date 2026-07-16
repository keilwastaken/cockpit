import { randomUUID } from "node:crypto";
import { createSession } from "./auth/session.js";
import { passwordMatches } from "./auth/password.js";
import { resolveConfig } from "./config/index.js";

export function createAuthService(settings) {
	const config = resolveConfig(settings);
	return {
		login(user, password) {
			if (!passwordMatches(password, user.passwordHash)) return null;
			return createSession(user, randomUUID(), config.sessionMinutes);
		},
	};
}
