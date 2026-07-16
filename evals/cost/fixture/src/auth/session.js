export function createSession(user, token, sessionMinutes) {
	return {
		userId: user.id,
		token,
		expiresAt: Date.now() + sessionMinutes * 60_000,
	};
}

export function isSessionActive(session, now = Date.now()) {
	return session.expiresAt > now;
}
