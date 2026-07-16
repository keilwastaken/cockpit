import { defaults } from "./defaults.js";
import { validateConfig } from "./validate.js";

export function resolveConfig({ project = {}, user = {} } = {}) {
	return validateConfig({ ...defaults, ...user, ...project });
}
