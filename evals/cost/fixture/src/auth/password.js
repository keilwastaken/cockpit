import { createHash, timingSafeEqual } from "node:crypto";

export function hashPassword(password) {
	return createHash("sha256").update(password).digest("hex");
}

export function passwordMatches(password, expectedHash) {
	const actual = Buffer.from(hashPassword(password));
	const expected = Buffer.from(expectedHash);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
