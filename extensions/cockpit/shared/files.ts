export const normalizeOwnedFile = (file: string): string => file.trim().replace(/^\.\//, "");

export const withFileOwnershipGuard = (file: string, plan: string): string => [
	`Output file: ${file}`,
	`File ownership guard: write or edit only ${file}. Do not modify any other project file. If the task requires another file, stop and report that instead.`,
	"",
	plan,
].join("\n");
