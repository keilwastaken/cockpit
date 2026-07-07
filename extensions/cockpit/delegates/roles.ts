import type { CockpitConfig } from "../config.js";
import type { DelegateFlowName } from "./protocol.js";

export type RoleName = Exclude<DelegateFlowName, "codeflow">;
export type RoleConfigKey = keyof CockpitConfig["delegateFlows"];
export type RoleKind = "direct" | "child" | "multi";

export type RoleDefinition = {
	name: RoleName;
	configKey: RoleConfigKey;
	kind: RoleKind;
	label: string;
};

export const roleDefinitions = {
	instant: {
		name: "instant",
		configKey: "instant",
		kind: "direct",
		label: "Instant delegate",
	},
	fast: {
		name: "fast",
		configKey: "fast",
		kind: "child",
		label: "Fast delegate",
	},
	ideate: {
		name: "ideate",
		configKey: "ideate",
		kind: "multi",
		label: "Ideate delegate",
	},
	research: {
		name: "research",
		configKey: "research",
		kind: "child",
		label: "Research delegate",
	},
	normal: {
		name: "normal",
		configKey: "normal",
		kind: "child",
		label: "Normal role",
	},
	planner: {
		name: "planner",
		configKey: "planner",
		kind: "child",
		label: "Planner delegate",
	},
	reviewer: {
		name: "reviewer",
		configKey: "reviewer",
		kind: "child",
		label: "Reviewer delegate",
	},
	"task-writer": {
		name: "task-writer",
		configKey: "taskWriter",
		kind: "child",
		label: "Task writer delegate",
	},
} as const satisfies Record<RoleName, RoleDefinition>;

export type RoleInputName = RoleName | "taskWriter";

export function normalizeRoleName(value: string): RoleName | undefined {
	if (value === "taskWriter") return "task-writer";
	return isRoleName(value) ? value : undefined;
}

export function isRoleName(value: string): value is RoleName {
	return Object.prototype.hasOwnProperty.call(roleDefinitions, value);
}

export function roleDefinitionFor(value: RoleInputName): RoleDefinition {
	const role = normalizeRoleName(value);
	if (!role) throw new Error(`Unknown Cockpit role: ${value}`);
	return roleDefinitions[role];
}

export function flowConfigKeyForRole(value: RoleInputName): RoleConfigKey {
	return roleDefinitionFor(value).configKey;
}
