export function resolveConfig({ project, user, defaults }) {
	return { ...defaults, ...user, ...project };
}
