import { readFileSync } from "node:fs";
import { lstat, readdir, readFile, readlink, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pluginSource = readFileSync(new URL("../.opencode/plugins/cockpit.js", import.meta.url), "utf8");
const workerPromptMatch = pluginSource.match(/const workerPrompt = (.+);\nconst workerDescription/);
if (!workerPromptMatch) throw new Error("generated Cockpit worker prompt is missing");
export const cockpitWorkerPrompt = JSON.parse(workerPromptMatch[1]);

const LEGACY_AGENTS = ["general", "cockpit-executor", "cockpit-explorer", "cockpit-research", "cockpit-strategist", "cockpit-planner", "cockpit-reviewer"];
const SCENARIO_KEYS = new Set(["id", "name", "category", "scored", "prepare", "invocation", "workerMode", "contract", "expectedTopology", "stateExpectation", "verificationCommands", "manualRubric"]);
const TOPOLOGY_KEYS = new Set(["children", "tasks", "skillCalls", "mutationCalls", "bashPolicy", "bashAllow", "boundedTasks", "preflightPaths", "responseIncludes", "childAgent", "tasksOverlap", "inspectAfterTasks", "inspectionPaths", "parentInspection", "parentValidation"]);

export function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object" && !Buffer.isBuffer(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}

export function modelID(model) {
	if (typeof model === "string" && /^[^/\s]+\/.+/.test(model)) return model;
	if (!model || typeof model !== "object") return null;
	const provider = model.providerID ?? model.provider;
	const id = model.id ?? model.modelID;
	return provider && id ? `${provider}/${id}` : null;
}

export function parseArgs(input) {
	const booleans = new Set(["--dry-run", "--validate-config", "--help", "--no-worker"]);
	const values = new Set(["--parent-model", "--worker-model", "--scenario"]);
	const parsed = new Map();
	for (let index = 0; index < input.length; index += 1) {
		const flag = input[index];
		if (booleans.has(flag)) {
			if (parsed.has(flag)) throw new Error(`Duplicate option: ${flag}`);
			parsed.set(flag, true);
			continue;
		}
		if (!values.has(flag)) throw new Error(`Unknown option: ${flag}`);
		const next = input[index + 1];
		if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
		if (parsed.has(flag)) throw new Error(`Duplicate option: ${flag}`);
		parsed.set(flag, next);
		index += 1;
	}
	return parsed;
}

export function formatUsage() {
	return "Usage: npm run eval -- --parent-model <provider/model> [--worker-model <provider/model>] [--scenario <id>] [--no-worker] [--dry-run|--validate-config]";
}

function requireKeys(object, keys, label) {
	if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error(`${label} must be an object`);
	for (const key of keys) if (!(key in object)) throw new Error(`${label} missing ${key}`);
}

export function validateScenarioSchema(scenarios) {
	if (!Array.isArray(scenarios) || scenarios.length === 0) throw new Error("scenario inventory must be a nonempty array");
	const ids = new Set();
	for (const scenario of scenarios) {
		requireKeys(scenario, ["id", "name", "category", "invocation", "workerMode", "contract", "expectedTopology", "stateExpectation", "verificationCommands", "manualRubric"], "scenario");
		for (const key of Object.keys(scenario)) if (!SCENARIO_KEYS.has(key)) throw new Error(`scenario ${scenario.id} has legacy or unknown field ${key}`);
		if (!scenario.id || ids.has(scenario.id)) throw new Error(`invalid or duplicate scenario id ${scenario.id}`);
		ids.add(scenario.id);
		if (scenario.scored != null && typeof scenario.scored !== "boolean") throw new Error(`scenario ${scenario.id} has invalid scored flag`);
		if (!["unused", "required", "unavailable"].includes(scenario.workerMode)) throw new Error(`scenario ${scenario.id} has invalid workerMode`);
		requireKeys(scenario.invocation, ["type"], `scenario ${scenario.id} invocation`);
		if (scenario.invocation.type === "native") {
			if (typeof scenario.invocation.prompt !== "string" || scenario.contract !== null) throw new Error(`scenario ${scenario.id} native invocation requires prompt and null contract`);
		} else if (scenario.invocation.type === "command") {
			if (scenario.invocation.command !== "cockpit-run" || !scenario.contract) throw new Error(`scenario ${scenario.id} command invocation must use cockpit-run with a contract`);
		} else throw new Error(`scenario ${scenario.id} has invalid invocation type`);
		if (scenario.contract) requireKeys(scenario.contract, ["goal", "allowedFiles", "requiredChanges", "acceptanceChecks", "stopConditions"], `scenario ${scenario.id} contract`);
		requireKeys(scenario.expectedTopology, ["children", "tasks"], `scenario ${scenario.id} expectedTopology`);
		for (const key of Object.keys(scenario.expectedTopology)) if (!TOPOLOGY_KEYS.has(key)) throw new Error(`scenario ${scenario.id} has unknown topology field ${key}`);
		for (const key of ["children", "tasks", "skillCalls", "mutationCalls"]) {
			const value = scenario.expectedTopology[key];
			if (value != null && !(Number.isInteger(value) && value >= 0) && !(Array.isArray(value) && value.length > 0 && value.every((item) => Number.isInteger(item) && item >= 0))) throw new Error(`scenario ${scenario.id} has invalid ${key}`);
		}
		if (scenario.expectedTopology.bashPolicy != null && !["none", "inspection-only", "validation-only"].includes(scenario.expectedTopology.bashPolicy)) throw new Error(`scenario ${scenario.id} has invalid bashPolicy`);
		if (scenario.expectedTopology.bashAllow != null && (!Array.isArray(scenario.expectedTopology.bashAllow) || scenario.expectedTopology.bashAllow.length === 0 || !scenario.expectedTopology.bashAllow.every((command) => typeof command === "string" && command))) throw new Error(`scenario ${scenario.id} has invalid bashAllow`);
		for (const key of ["preflightPaths", "responseIncludes"]) if (scenario.expectedTopology[key] != null && (!Array.isArray(scenario.expectedTopology[key]) || scenario.expectedTopology[key].length === 0 || !scenario.expectedTopology[key].every((value) => typeof value === "string" && value))) throw new Error(`scenario ${scenario.id} has invalid ${key}`);
		if (scenario.expectedTopology.boundedTasks != null && typeof scenario.expectedTopology.boundedTasks !== "boolean") throw new Error(`scenario ${scenario.id} has invalid boundedTasks`);
		if (!["changed-exactly", "prepared-only"].includes(scenario.stateExpectation?.type)) throw new Error(`scenario ${scenario.id} has invalid stateExpectation`);
		if (scenario.stateExpectation.type === "changed-exactly" && !Array.isArray(scenario.stateExpectation.paths)) throw new Error(`scenario ${scenario.id} changed-exactly requires paths`);
		if (scenario.stateExpectation.testCountDelta) {
			requireKeys(scenario.stateExpectation.testCountDelta, ["path", "delta"], `scenario ${scenario.id} testCountDelta`);
			if (typeof scenario.stateExpectation.testCountDelta.pattern !== "string" && typeof scenario.stateExpectation.testCountDelta.token !== "string") throw new Error(`scenario ${scenario.id} testCountDelta requires pattern or token`);
		}
		if (!Array.isArray(scenario.verificationCommands) || !Array.isArray(scenario.manualRubric)) throw new Error(`scenario ${scenario.id} requires verificationCommands and manualRubric arrays`);
		for (const check of scenario.verificationCommands) validateCommandExpectation(check, `scenario ${scenario.id} verification command`);
		if (scenario.expectedTopology.parentValidation) validateCommandExpectation(scenario.expectedTopology.parentValidation, `scenario ${scenario.id} parent validation`);
	}
	const required = ["ordinary-native", "single-contract", "parallel-contract", "false-assumption-contract", "scope-pressure", "consequential-ambiguity", "worker-unavailable", "security-review", "failed-verification"];
	if (required.some((id) => !ids.has(id)) || ids.has("failed-validation")) throw new Error("scenario inventory does not match the retained set");
	return scenarios;
}

function validateCommandExpectation(check, label) {
	if (!check || !Array.isArray(check.argv) || check.argv.length === 0 || !check.argv.every((value) => typeof value === "string")) throw new Error(`${label} requires string argv`);
	if (!(Number.isInteger(check.status) || check.status === "nonzero")) throw new Error(`${label} has invalid status`);
	if (check.command != null && typeof check.command !== "string") throw new Error(`${label} has invalid command`);
	if (check.includes != null && (!Array.isArray(check.includes) || !check.includes.every((value) => typeof value === "string"))) throw new Error(`${label} has invalid includes`);
}

export function selectScenarios(scenarios, options) {
	const selectedID = options.get("--scenario");
	const noWorker = options.has("--no-worker");
	const workerModel = options.get("--worker-model");
	if (noWorker && workerModel) throw new Error("--no-worker and --worker-model are mutually exclusive");
	if (noWorker && selectedID !== "worker-unavailable") throw new Error("--no-worker is only valid with --scenario worker-unavailable");
	let selected;
	if (selectedID) {
		selected = scenarios.filter((scenario) => scenario.id === selectedID);
		if (!selected.length) throw new Error(`Unknown scenario: ${selectedID}`);
	} else {
		selected = workerModel ? scenarios.filter((scenario) => scenario.workerMode !== "unavailable") : scenarios;
	}
	if (selected.some((scenario) => scenario.workerMode === "required") && !workerModel) throw new Error("--worker-model is required for scenarios that require workers");
	if (selected.some((scenario) => scenario.workerMode === "unavailable") && !noWorker) throw new Error("worker-unavailable requires --no-worker");
	if (selected.some((scenario) => scenario.workerMode === "unavailable") && workerModel) throw new Error("worker-unavailable cannot be run with --worker-model");
	return selected;
}

export function renderContract(contract) {
	return [
		"# Execution Contract", "## Goal", contract.goal, "## Allowed Files", ...contract.allowedFiles.map((item) => `- ${item}`),
		"## Required Changes", ...contract.requiredChanges.map((item) => `- ${item}`), "## Acceptance Checks", ...contract.acceptanceChecks.map((item) => `- ${item}`),
		"## Stop Conditions", ...contract.stopConditions.map((item) => `- ${item}`),
	].join("\n");
}

export function buildIsolatedConfig({ parentModel, workerModel, workerMode, pluginURL }) {
	const config = { $schema: "https://opencode.ai/config.json", model: parentModel, plugin: [pluginURL] };
	if (workerMode !== "unavailable" && workerModel) config.agent = { "cockpit-worker": { model: workerModel } };
	return config;
}

export function validateResolvedConfig({ intended, resolved, parentModel, workerModel, workerMode, pluginURL }) {
	const failures = [];
	if (stableStringify(intended.plugin) !== stableStringify([pluginURL])) failures.push("intended plugin list is not the exact Cockpit file URL");
	if (stableStringify(resolved.plugin) !== stableStringify([pluginURL])) failures.push("resolved plugin list is not the exact Cockpit file URL");
	if (resolved.model !== parentModel) failures.push(`resolved parent model ${resolved.model} does not match ${parentModel}`);
	if (intended.small_model !== undefined || resolved.small_model !== undefined) failures.push("small_model must not be configured");
	for (const agent of LEGACY_AGENTS) if (intended.agent?.[agent] || resolved.agent?.[agent]) failures.push(`unexpected agent override ${agent}`);
	const worker = resolved.agent?.["cockpit-worker"];
	if (!worker) failures.push("resolved cockpit-worker is absent");
	else {
		if (worker.mode !== "subagent" || worker.steps !== 20) failures.push("cockpit-worker must be a 20-step subagent");
		if (worker.prompt !== cockpitWorkerPrompt) failures.push("cockpit-worker prompt is not canonical");
		for (const permission of ["task", "question", "webfetch", "skill"]) if (worker.permission?.[permission] !== "deny") failures.push(`cockpit-worker must deny ${permission}`);
	}
	if (worker && workerMode === "unavailable") {
		if (!worker.disable || worker.model) failures.push("unavailable cockpit-worker must be disabled without a model");
		for (const permission of ["edit", "bash"]) if (worker.permission?.[permission] !== "deny") failures.push(`unavailable cockpit-worker must deny ${permission}`);
		if (intended.agent?.["cockpit-worker"]) failures.push("unavailable config must not define cockpit-worker");
	} else if (worker && workerModel) {
		if (worker.disable || modelID(worker.model) !== workerModel) failures.push("cockpit-worker does not resolve to the explicit worker model");
		if (modelID(intended.agent?.["cockpit-worker"]?.model) !== workerModel) failures.push("intended config lacks the explicit worker model");
	} else if (worker && (!worker.disable || worker.model)) failures.push("worker without an explicit model must be disabled");
	const command = resolved.command?.["cockpit-run"];
	if (!command || command.agent !== "build" || command.subtask !== false) failures.push("cockpit-run must use build with subtask false");
	const template = command?.template ?? "";
	for (const phrase of ["available through the native Task tool", "Do not inspect project or global config files", "Await all task returns", "Inspect the actual combined repository state", "Run fresh validation checks yourself"]) if (!template.includes(phrase)) failures.push(`cockpit-run template missing required behavior: ${phrase}`);
	if (failures.length) throw new Error(`isolated config validation failed: ${failures.join("; ")}`);
	return { valid: true, failures: [] };
}

export async function snapshotDirectory(directory) {
	const entries = {};
	async function walk(current, relative = "") {
		for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.name === ".git") continue;
			const childRelative = path.posix.join(relative, entry.name);
			const child = path.join(current, entry.name);
			if (entry.isDirectory()) await walk(child, childRelative);
			else {
				const metadata = await lstat(child);
				if (entry.isSymbolicLink()) entries[childRelative] = { type: "symlink", mode: metadata.mode & 0o777, target: await readlink(child) };
				else if (entry.isFile()) entries[childRelative] = { type: "file", mode: metadata.mode & 0o777, content: await readFile(child, "utf8") };
			}
		}
	}
	await walk(directory);
	return entries;
}

export function changedSnapshotFiles(initial, final) {
	return [...new Set([...Object.keys(initial), ...Object.keys(final)])].filter((file) => stableStringify(initial[file]) !== stableStringify(final[file])).sort();
}

export function parseJsonEvents(stdout) {
	const events = [];
	for (const [index, line] of stdout.split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		try { events.push(JSON.parse(line)); } catch { return { valid: false, reason: `malformed JSON stdout line ${index + 1}`, events: [] }; }
	}
	const sessionIDs = [...new Set(events.map((event) => event.sessionID).filter((id) => typeof id === "string"))];
	if (!sessionIDs.length) return { valid: false, reason: "stdout contained no sessionIDs", events };
	return { valid: true, events, sessionIDs };
}

export async function correlateRoot({ eventSessionIDs, sessions, workspace, startedAt, endedAt, parentModel }) {
	const workspaceRealpath = await realpath(workspace);
	const candidates = [];
	for (const row of sessions) {
		if (!eventSessionIDs.includes(row.id) || row.parent_id != null || row.agent !== "build") continue;
		let directory;
		try { directory = await realpath(row.directory); } catch { continue; }
		let rowModel;
		try { rowModel = modelID(JSON.parse(row.model)); } catch { continue; }
		if (directory !== workspaceRealpath || row.time_created < startedAt - 1_000 || row.time_created > endedAt + 1_000 || rowModel !== parentModel) continue;
		candidates.push(row);
	}
	if (candidates.length !== 1) return { valid: false, reason: `expected exactly one correlated parentless build session, found ${candidates.length}`, workspaceRealpath };
	return { valid: true, rootID: candidates[0].id, workspaceRealpath, reason: "unique parentless build session matched stdout, workspace realpath, start window, and parent model" };
}

export function normalizeTelemetry(sessionRows, partRows, rootID) {
	const sessions = sessionRows.map((row) => ({
		id: row.id, parentID: row.parent_id, directory: row.directory, agent: row.agent, model: modelID(JSON.parse(row.model)),
		modelData: JSON.parse(row.model), timeCreated: row.time_created, timeUpdated: row.time_updated,
		counters: { cost: row.cost, input: row.tokens_input, output: row.tokens_output, reasoning: row.tokens_reasoning, cacheRead: row.tokens_cache_read, cacheWrite: row.tokens_cache_write },
		isParent: row.id === rootID,
	})).sort((a, b) => a.timeCreated - b.timeCreated || a.id.localeCompare(b.id));
	const parts = [];
	for (const row of partRows) {
		let data;
		try { data = JSON.parse(row.data); } catch { throw new Error(`malformed part data for ${row.id}`); }
		const state = data.state ?? {};
		parts.push({
			id: row.id, messageID: row.message_id, sessionID: row.session_id, timeCreated: row.time_created, timeUpdated: row.time_updated,
			type: data.type ?? null, text: data.text ?? null, tool: data.tool ?? null, status: state.status ?? null, input: state.input ?? null, metadata: state.metadata ?? null, output: state.output ?? null, error: state.error ?? null,
			start: state.time?.start ?? state.metadata?.time?.start ?? row.time_created,
			end: state.time?.end ?? state.metadata?.time?.end ?? row.time_updated,
		});
	}
	parts.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
	const tools = parts.filter((part) => part.type === "tool");
	const tasks = tools.filter((part) => part.tool === "task");
	const children = sessions.filter((session) => !session.isParent);
	const taskMatches = tasks.map((task) => {
		const child = children.find((candidate) => candidate.id === task.metadata?.sessionId);
		const reasons = [];
		if (!child) reasons.push("task metadata sessionId has no child session");
		if (task.status !== "completed") reasons.push("task is not completed");
		if (task.input?.subagent_type !== "cockpit-worker") reasons.push("task subagent_type is not cockpit-worker");
		if (task.metadata?.parentSessionId !== rootID) reasons.push("task parentSessionId does not match root");
		if (child?.parentID !== rootID) reasons.push("child parent_id does not match root");
		if (child?.agent !== "cockpit-worker") reasons.push("child agent is not cockpit-worker");
		if (child && modelID(task.metadata?.model) !== child.model) reasons.push("task and child models do not match");
		if (child && (Math.abs(task.start - child.timeCreated) > 1_000 || Math.abs(task.end - child.timeUpdated) > 1_000)) reasons.push("task and child times differ by more than 1000ms");
		return { taskID: task.id, childID: child?.id ?? null, matched: reasons.length === 0, reasons };
	});
	return { sessions, parts, tools, tasks, children, taskMatches };
}

function commandMatches(part, expectation) {
	if (part.tool !== "bash" || part.status !== "completed") return false;
	const command = part.input?.command;
	const expected = expectation.command ?? shellCommand(expectation.argv);
	if (typeof command !== "string") return false;
	if (command === expected || command === `${expected} 2>&1`) return true;
	return expectation.command == null && expectation.includes ? expectation.includes.every((fragment) => command.includes(fragment)) : false;
}

function countMatches(actual, expected) {
	return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
}

function diffCoversPaths(part, paths) {
	if (part.tool !== "bash" || part.status !== "completed") return false;
	const command = part.input?.command?.trim();
	if (command === "git diff") return true;
	if (typeof command !== "string" || !command.startsWith("git diff -- ")) return false;
	const targets = command.slice("git diff -- ".length).split(/\s+/);
	return paths.every((expected) => targets.includes(expected));
}

function isReadOnlyBash(part) {
	if (part.tool !== "bash" || part.status !== "completed") return false;
	const command = part.input?.command?.trim().replace(/\s+2>&1$/, "");
	if (!command || /[;|<>`\n]/.test(command)) return false;
	return command.split(/\s*&&\s*/).every((segment) => /^git\s+(?:status|diff|log|ls-tree|ls-files|show)(?:\s|$)/.test(segment) && !/--(?:output|ext-diff|textconv)(?:[=\s]|$)/.test(segment));
}

function hasMutationIntent(part) {
	const command = part.input?.command ?? "";
	return /(?<![=])>{1,2}(?![>&])/.test(command)
		|| /(?:^|[;&|]\s*)(?:rm|mv|cp|touch|mkdir|rmdir|truncate|dd|install|tee)\s/.test(command)
		|| /(?:^|[;&|]\s*)(?:sed|perl)\s+[^;&|]*\s-i(?:\s|$)/.test(command)
		|| /--(?:output|ext-diff|textconv)(?:[=\s]|$)/.test(command)
		|| /\b(?:writeFile|appendFile|unlink|rename|rmSync|mkdirSync)\b/.test(command);
}

export function shellCommand(argv) {
	return argv.map((value) => /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`).join(" ");
}

function statusMatches(actual, expected) {
	return expected === "nonzero" ? Number.isInteger(actual) && actual !== 0 : actual === expected;
}

export function evaluateScenario(scenario, context) {
	const gates = [];
	const gate = (id, pass, reason) => gates.push({ id, pass: Boolean(pass), reason });
	gate("opencode-exit", context.process.status === 0 && !context.process.error && !context.process.signal, context.process.error ?? `exit ${context.process.status}`);
	gate("telemetry-valid", context.correlation.valid && !!context.telemetry, context.correlation.reason);
	if (context.telemetry) {
		const { sessions, tools, tasks, children, taskMatches } = context.telemetry;
		const topology = scenario.expectedTopology;
		gate("parent-count", sessions.filter((item) => item.isParent).length === 1, `found ${sessions.filter((item) => item.isParent).length}`);
		gate("child-count", countMatches(children.length, topology.children), `expected ${JSON.stringify(topology.children)}, found ${children.length}`);
		gate("task-count", countMatches(tasks.length, topology.tasks), `expected ${JSON.stringify(topology.tasks)}, found ${tasks.length}`);
		if (topology.skillCalls != null) gate("skill-count", countMatches(tools.filter((part) => part.tool === "skill").length, topology.skillCalls), `expected ${JSON.stringify(topology.skillCalls)}, found ${tools.filter((part) => part.tool === "skill").length}`);
		if (topology.mutationCalls != null) gate("mutation-count", tools.filter((part) => ["edit", "write"].includes(part.tool)).length === topology.mutationCalls, `expected ${topology.mutationCalls}, found ${tools.filter((part) => ["edit", "write"].includes(part.tool)).length}`);
		if (topology.bashPolicy) {
			const bash = tools.filter((part) => part.tool === "bash");
			let allowed = [];
			if (topology.bashPolicy === "inspection-only") allowed = bash.filter((part) => isReadOnlyBash(part) || (topology.parentValidation && commandMatches(part, topology.parentValidation)));
			else if (topology.bashPolicy === "validation-only") allowed = bash.filter((part) => isReadOnlyBash(part) || (topology.parentValidation && commandMatches(part, topology.parentValidation)));
			allowed = bash.filter((part) => allowed.includes(part) || (part.status === "completed" && topology.bashAllow?.includes(part.input?.command)));
			gate("bash-policy", allowed.length === bash.length, `${allowed.length}/${bash.length} bash calls allowed by ${topology.bashPolicy}`);
		}
		if (topology.childAgent) gate("child-agent", children.every((child) => child.agent === topology.childAgent), children.map((child) => child.agent).join(",") || "none");
		if (scenario.workerMode === "required") gate("worker-model", children.every((child) => child.model === context.workerModel), children.map((child) => child.model).join(",") || "none");
		const matchedChildIDs = new Set(taskMatches.map((match) => match.childID).filter(Boolean));
		const allChildrenCovered = children.every((child) => matchedChildIDs.has(child.id));
		gate("task-child-matches", tasks.length === children.length && taskMatches.length === tasks.length && taskMatches.every((match) => match.matched) && matchedChildIDs.size === children.length && allChildrenCovered, JSON.stringify(taskMatches));
		const maxTaskEnd = tasks.length ? Math.max(...tasks.map((part) => part.end)) : null;
		const parentTools = tools.filter((part) => part.sessionID === context.correlation.rootID);
		if (topology.boundedTasks) {
			const mutations = tools.filter((part) => ["edit", "write"].includes(part.tool));
			const childIDs = new Set(children.map((child) => child.id));
			const allowedFiles = scenario.contract?.allowedFiles ?? [];
			const boundedPrompts = tasks.every((part) => {
				const prompt = part.input?.prompt ?? "";
				return /(?:^|\n)#{2,3} Goal\b/.test(prompt)
					&& /(?:^|\n)#{2,3} (?:Allowed Files|Scope)\b/.test(prompt)
					&& /(?:^|\n)#{2,3} (?:Required Changes|Required Evidence or Edits)\b/.test(prompt)
					&& /(?:^|\n)#{2,3} (?:Acceptance Checks|Validation)\b/.test(prompt)
					&& /(?:^|\n)#{2,3} Stop Conditions\b/.test(prompt);
			}) && allowedFiles.every((file) => tasks.some((part) => part.input?.prompt?.includes(file)));
			const workerOwned = mutations.length >= children.length && mutations.every((part) => childIDs.has(part.sessionID));
			const pathsAllowed = mutations.every((part) => allowedFiles.some((file) => part.input?.filePath?.endsWith(`/${file}`)));
			const everyChildMutated = children.every((child) => mutations.some((part) => part.sessionID === child.id));
			gate("bounded-task-prompts", boundedPrompts, `${tasks.filter((part) => typeof part.input?.prompt === "string").length}/${tasks.length} task prompts present`);
			gate("worker-mutation-ownership", workerOwned && pathsAllowed && everyChildMutated, `${mutations.length} mutation calls; parent=${mutations.filter((part) => part.sessionID === context.correlation.rootID).length}; allowed=${pathsAllowed}`);
			const suspiciousBash = tools.filter((part) => part.tool === "bash" && hasMutationIntent(part));
			gate("bash-mutation-intent", suspiciousBash.length === 0, suspiciousBash.map((part) => part.input?.command).join(" | ") || "none");
		}
		if (topology.preflightPaths) {
			const absent = topology.preflightPaths.filter((expected) => parentTools.some((part) =>
				(part.tool === "read" && part.input?.filePath?.endsWith(`/${expected}`) && part.status === "error" && /not found/i.test(part.error ?? ""))
				|| (part.tool === "glob" && part.input?.pattern === expected && part.status === "completed" && (part.metadata?.count === 0 || /no files found/i.test(part.output ?? "")))
			));
			gate("parent-preflight", absent.length === topology.preflightPaths.length, `${absent.length}/${topology.preflightPaths.length} required paths proven absent`);
		}
		if (topology.responseIncludes) {
			const response = context.telemetry.parts.filter((part) => part.sessionID === context.correlation.rootID && part.type === "text").map((part) => part.text ?? "").join("\n").toLowerCase();
			const missing = topology.responseIncludes.filter((fragment) => !response.includes(fragment.toLowerCase()));
			gate("response-evidence", missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : "required response evidence present");
		}
		const inspections = parentTools.filter((part) => part.status === "completed" && (part.tool === "read" || part.tool === "bash"));
		let inspectionCompletedAt = null;
		if (topology.inspectAfterTasks) {
			const expectedPaths = topology.inspectionPaths ?? scenario.stateExpectation.paths ?? [];
			const afterJoin = maxTaskEnd == null ? [] : inspections.filter((part) => part.start >= maxTaskEnd);
			const allTrackedAtBaseline = expectedPaths.every((expected) => context.baselineSnapshot[expected] != null);
			const diff = allTrackedAtBaseline ? afterJoin.find((part) => diffCoversPaths(part, expectedPaths)) : null;
			const reads = expectedPaths.map((expected) => afterJoin.find((part) => part.tool === "read" && (part.input?.filePath ?? "").endsWith(expected)));
			const complete = Boolean(diff) || (expectedPaths.length > 0 && reads.every(Boolean));
			inspectionCompletedAt = diff?.end ?? (complete ? Math.max(...reads.map((part) => part.end)) : null);
			gate("inspection-after-tasks", complete, `max task end ${maxTaskEnd}; expected paths ${expectedPaths.join(",")}; completed ${inspectionCompletedAt ?? "none"}`);
		}
		if (topology.parentInspection) {
			const paths = topology.parentInspection.paths ?? [];
			const relevantReads = paths.map((expected) => inspections.find((part) => part.tool === "read" && (part.input?.filePath ?? "").endsWith(expected)));
			const allTrackedAtBaseline = paths.every((expected) => context.baselineSnapshot[expected] != null);
			const diff = allTrackedAtBaseline ? inspections.find((part) => diffCoversPaths(part, paths)) : null;
			const actual = diff ? [diff] : relevantReads.filter(Boolean);
			gate("parent-inspection", Boolean(diff) || (paths.length > 0 && relevantReads.every(Boolean)), `${actual.length} relevant completed read/git inspection calls`);
		}
		if (topology.tasksOverlap) {
			const overlap = tasks.length === 2 && Math.max(tasks[0].start, tasks[1].start) < Math.min(tasks[0].end, tasks[1].end);
			gate("task-overlap", overlap, tasks.map((part) => `${part.start}-${part.end}`).join(", "));
		}
		if (topology.parentValidation) {
			const matches = parentTools.filter((part) => commandMatches(part, topology.parentValidation));
			const threshold = inspectionCompletedAt ?? maxTaskEnd;
			const ordered = matches.filter((part) => threshold == null || part.start >= threshold);
			const valid = ordered.filter((part) => statusMatches(part.metadata?.exit, topology.parentValidation.status));
			gate("parent-validation", valid.length === 1, `exact matches=${matches.length}, after join=${ordered.length}, expected-exit matches=${valid.length}`);
		}
	}
	const baselineChanges = changedSnapshotFiles(context.baselineSnapshot, context.finalSnapshot);
	if (scenario.stateExpectation.type === "changed-exactly") {
		gate("changed-paths", stableStringify(baselineChanges) === stableStringify([...scenario.stateExpectation.paths].sort()), `changed ${baselineChanges.join(",") || "none"}`);
		const count = scenario.stateExpectation.testCountDelta;
		if (count) {
			const before = context.baselineSnapshot[count.path]?.content ?? "";
			const after = context.finalSnapshot[count.path]?.content ?? "";
			const occurrences = count.pattern
				? (value) => [...value.matchAll(new RegExp(count.pattern, "g"))].length
				: (value) => value.split(count.token).length - 1;
			gate("test-count-delta", occurrences(after) - occurrences(before) === count.delta, `expected delta ${count.delta}, found ${occurrences(after) - occurrences(before)}`);
		}
	}
	else {
		if (scenario.prepare && Object.keys(scenario.prepare).length) gate("prepared-uncommitted", context.preparedStatus.trim().length > 0, context.preparedStatus || "clean");
		gate("prepared-snapshot", stableStringify(context.preparedSnapshot) === stableStringify(context.finalSnapshot), "prepared and final snapshots must be identical");
		gate("prepared-status", context.preparedStatus === context.finalStatus, "prepared and final git status must be identical");
		gate("prepared-diff", context.preparedDiff === context.finalDiff, "prepared and final git diff must be identical");
	}
	for (const [index, check] of context.independentChecks.entries()) gate(`independent-${index + 1}`, statusMatches(check.status, scenario.verificationCommands[index].status), `exit ${check.status}`);
	return { pass: gates.every((item) => item.pass), gates };
}

export function validateReportShape(report) {
	for (const key of ["schemaVersion", "scenario", "config", "invocation", "parsedEvents", "correlation", "sessions", "parts", "toolChronology", "taskMatches", "state", "independentChecks", "objective", "manualRubric"]) {
		if (!(key in report) || report[key] == null) throw new Error(`result report missing ${key}`);
	}
	for (const key of ["baseline", "prepared", "final", "changedPaths"]) if (!(key in report.state)) throw new Error(`result state missing ${key}`);
	if (!Array.isArray(report.invocation.argv) || !Array.isArray(report.objective.gates)) throw new Error("result report has invalid argv or gates");
	return report;
}
