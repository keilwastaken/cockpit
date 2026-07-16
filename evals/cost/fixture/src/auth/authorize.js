export function canAccess(user, requiredRole) {
	return user.roles.includes(requiredRole);
}
