export function validateConfig(config) {
	if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
		throw new Error("port must be an integer between 1 and 65535");
	}
	if (!Number.isInteger(config.sessionMinutes) || config.sessionMinutes < 1) {
		throw new Error("sessionMinutes must be a positive integer");
	}
	if (typeof config.requireMfa !== "boolean") {
		throw new Error("requireMfa must be a boolean");
	}
	return config;
}
