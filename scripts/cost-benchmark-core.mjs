import { createHash } from "node:crypto";
import { chmod, link, lstat, mkdir, open, readFile, readdir, readlink, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BENCHMARK_VERSION = 2;
export const ALL_ARMS = ["control", "isolation", "role-split"];
export const REQUIRED_NODE_MAJOR = 22;
export const REQUIRED_OPENCODE_VERSION = "1.18.3";
export const BASE_ENV_NAMES = [
	"HOME", "PATH", "SHELL", "TMPDIR", "TMP", "TEMP", "USER", "LOGNAME",
	"LANG", "LC_ALL", "LC_CTYPE", "SSL_CERT_FILE", "SSL_CERT_DIR", "XDG_DATA_HOME",
];

export function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

export function sha256(value) {
	const input = typeof value === "string" || Buffer.isBuffer(value) ? value : stableStringify(value);
	return createHash("sha256").update(input).digest("hex");
}

export function parseArgs(input) {
	const booleans = new Set(["--dry-run", "--resume", "--help"]);
	const values = new Set(["--arms", "--repetitions", "--reasoning-model", "--hands-model", "--observed-cost-stop", "--max-runs", "--run-id", "--cockpit-root", "--scenario", "--opencode-db", "--timeout-minutes", "--allow-env"]);
	const parsed = new Map();
	const allowedEnv = [];
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
		if (flag === "--allow-env") allowedEnv.push(next);
		else {
			if (parsed.has(flag)) throw new Error(`Duplicate option: ${flag}`);
			parsed.set(flag, next);
		}
		index += 1;
	}
	if (allowedEnv.length) parsed.set("--allow-env", [...new Set(allowedEnv)].sort());
	return parsed;
}

export function validateRunID(runID) {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runID) || runID.includes("..")) return "run ID must be 1-128 safe filename characters without '..'";
	return null;
}

export function modelID(model) {
	if (typeof model === "string" && /^[^/]+\/.+/.test(model)) return model;
	if (!model || typeof model !== "object") return null;
	const provider = model.providerID ?? model.provider;
	const id = model.modelID ?? model.id;
	return provider && id ? `${provider}/${id}` : null;
}

export function agentConfig(reasoningModel, handsModel, roles) {
	return Object.fromEntries(roles.map((role) => [role.name, {
		mode: "subagent",
		model: ["cockpit-research", "cockpit-executor"].includes(role.name) ? handsModel : reasoningModel,
		description: role.description,
		prompt: `Load the ${role.skill} skill before acting and follow it. Return only the requested handoff.`,
		permission: { edit: role.readOnly ? "deny" : "allow" },
	}]));
}

export function armConfig(arm, cockpitRoot, reasoningModel, handsModel, roles) {
	const config = { $schema: "https://opencode.ai/config.json", model: reasoningModel, small_model: arm === "role-split" ? handsModel : reasoningModel };
	if (arm === "control") {
		config.agent = Object.fromEntries(roles.map((role) => [role.name, { disable: true }]));
		config.agent.explore = { model: reasoningModel };
		config.agent.general = { model: reasoningModel };
		return config;
	}
	config.plugin = [pathToFileURL(`${cockpitRoot}/.opencode/plugins/cockpit.js`).href];
	config.agent = agentConfig(reasoningModel, arm === "isolation" ? reasoningModel : handsModel, roles);
	// Override built-in explore and general with appropriate models for OpenCode
	config.agent.explore = { model: arm === "role-split" ? handsModel : reasoningModel };
	config.agent.general = { model: arm === "role-split" ? handsModel : reasoningModel };
	return config;
}

export function sanitizeEnvironment(source, extraNames = []) {
	const names = new Set([...BASE_ENV_NAMES, ...extraNames]);
	return Object.fromEntries([...names].filter((name) => source[name] !== undefined && !name.startsWith("OPENCODE_")).map((name) => [name, source[name]]));
}

export function sanitizeConfig(value, replacements = []) {
	const secret = /(token|secret|password|credential|api.?key)/i;
	function visit(item, key = "") {
		if (secret.test(key)) return "<REDACTED>";
		if (Array.isArray(item)) return item.map((entry) => visit(entry));
		if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([entryKey, entry]) => [entryKey, visit(entry, entryKey)]));
		if (typeof item !== "string") return item;
		let output = item;
		for (const [actual, placeholder] of replacements) output = output.replaceAll(actual, placeholder);
		return output;
	}
	return visit(value);
}

export async function hashTree(directory) {
	const entries = [];
	async function walk(current, relative = "") {
		for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
			const childRelative = path.posix.join(relative, entry.name);
			const child = path.join(current, entry.name);
			if (entry.isDirectory()) await walk(child, childRelative);
			else if (entry.isFile()) entries.push([childRelative, sha256(await readFile(child))]);
		}
	}
	await walk(directory);
	return sha256(entries);
}

export async function snapshotDirectory(directory) {
	const entries = {};
	async function walk(current, relative = "") {
		for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
			if (entry.name === ".git") continue;
			const childRelative = path.posix.join(relative, entry.name);
			const child = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(child, childRelative);
				continue;
			}
			const metadata = await lstat(child);
			if (entry.isSymbolicLink()) entries[childRelative] = { type: "symlink", mode: metadata.mode & 0o777, target: await readlink(child) };
			else if (entry.isFile()) entries[childRelative] = { type: "file", mode: metadata.mode & 0o777, content: await readFile(child, "utf8") };
			else entries[childRelative] = { type: "other", mode: metadata.mode & 0o777 };
		}
	}
	await walk(directory);
	return entries;
}

export function changedSnapshotFiles(initialSnapshot, finalSnapshot) {
	return [...new Set([...Object.keys(initialSnapshot), ...Object.keys(finalSnapshot)])]
		.filter((file) => stableStringify(initialSnapshot[file]) !== stableStringify(finalSnapshot[file]))
		.sort();
}

export async function writeFileExclusiveAtomic(file, content, mode = 0o600) {
	const parent = path.dirname(file);
	let parentExists = true;
	try { await stat(parent); } catch (error) { if (error.code === "ENOENT") parentExists = false; else throw error; }
	if (!parentExists) {
		await mkdir(parent, { recursive: true, mode: 0o700 });
		await chmod(parent, 0o700);
	}
	const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
	const handle = await open(temporary, "wx", mode);
	try {
		await handle.writeFile(content);
		await handle.sync();
	} finally {
		await handle.close();
	}
	try {
		await link(temporary, file);
	} finally {
		await unlink(temporary).catch(() => {});
	}
}

export async function writeJsonExclusiveAtomic(file, value) {
	await writeFileExclusiveAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function generateJobs(scenarios, arms, repetitions, seed) {
	const blocks = [];
	for (const scenario of scenarios) for (let repetition = 1; repetition <= repetitions; repetition += 1) {
		const blockID = `${scenario.id}:${repetition}`;
		const orderedArms = [...arms].sort((left, right) => sha256(`${seed}:${blockID}:${left}`).localeCompare(sha256(`${seed}:${blockID}:${right}`)));
		blocks.push({ scenario, repetition, blockID, orderedArms, order: sha256(`${seed}:${blockID}`) });
	}
	blocks.sort((left, right) => left.order.localeCompare(right.order));
	return blocks.flatMap((block) => block.orderedArms.map((arm) => ({
		jobID: sha256(`${seed}:${block.blockID}:${arm}`).slice(0, 16),
		key: `${block.scenario.id}:${block.repetition}:${arm}`,
		scenario: block.scenario,
		repetition: block.repetition,
		arm,
		blockID: block.blockID,
	})));
}

export function createManifest(input) {
	const identity = {
		schemaVersion: BENCHMARK_VERSION,
		runID: input.runID,
		publishable: input.publishable,
		models: input.models,
		repetitions: input.repetitions,
		arms: input.arms,
		timeoutMinutes: input.timeoutMinutes,
		allowedEnvironmentNames: input.allowedEnvironmentNames,
		provenance: input.provenance,
		resolvedConfigs: input.resolvedConfigs,
		jobs: input.jobs.map(({ jobID, key, scenario, repetition, arm, blockID }) => ({ jobID, key, scenario: scenario.id, repetition, arm, blockID })),
	};
	return { ...identity, manifestHash: sha256(identity), createdAt: new Date().toISOString() };
}

export function validateManifest(manifest) {
	if (!manifest || manifest.schemaVersion !== BENCHMARK_VERSION) return "unsupported manifest schema";
	const { manifestHash, createdAt: _createdAt, ...identity } = manifest;
	if (!manifestHash || manifestHash !== sha256(identity)) return "manifest hash mismatch";
	if (!Array.isArray(manifest.jobs) || !manifest.jobs.length || !manifest.resolvedConfigs) return "manifest is incomplete";
	return null;
}

export function validateCompleteMatrix(manifest, scenarioIDs) {
	if (!manifest.publishable) return "manifest is not publishable";
	if (stableStringify([...manifest.arms].sort()) !== stableStringify([...ALL_ARMS].sort()) || manifest.repetitions !== 2) return "publishable matrix options are invalid";
	const expected = [];
	for (const scenario of [...scenarioIDs].sort()) for (let repetition = 1; repetition <= 2; repetition += 1) for (const arm of ALL_ARMS) expected.push(`${scenario}:${repetition}:${arm}`);
	const actual = manifest.jobs.map((job) => `${job.scenario}:${job.repetition}:${job.arm}`).sort();
	if (stableStringify(actual) !== stableStringify(expected.sort())) return "publishable matrix is incomplete or duplicated";
	if (new Set(manifest.jobs.map((job) => job.jobID)).size !== expected.length) return "publishable matrix contains duplicate job IDs";
	return null;
}

export function parseJsonLines(output) {
	return output.split("\n").flatMap((line, index) => {
		if (!line.trim()) return [];
		try { return [JSON.parse(line)]; } catch { throw new Error(`malformed OpenCode JSONL at line ${index + 1}`); }
	});
}

export function outputText(events) {
	return events.filter((event) => event.type === "text").map((event) => event.part?.text ?? "").join("\n");
}

function numeric(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function collectSessionTree(rows, messageRows, parentSessionID, workspace, startedAt, expectedModels = [], requiredParentModel = null, agentModels = {}) {
	if (!parentSessionID) return { valid: false, reason: "missing parent session ID" };
	const byID = new Map(rows.map((row) => [row.id, row]));
	const parent = byID.get(parentSessionID);
	if (!parent) return { valid: false, reason: "parent session missing from telemetry" };
	if (parent.directory !== workspace || parent.time_created < startedAt - 1_000) return { valid: false, reason: "parent session provenance mismatch" };
	const selected = [];
	const queue = [parentSessionID];
	while (queue.length) {
		const id = queue.shift();
		const row = byID.get(id);
		if (!row || selected.some((entry) => entry.id === id)) continue;
		selected.push(row);
		for (const candidate of rows) if (candidate.parent_id === id) queue.push(candidate.id);
	}
	const messagesBySession = new Map();
	for (const row of messageRows) {
		const list = messagesBySession.get(row.session_id) ?? [];
		list.push(row.data);
		messagesBySession.set(row.session_id, list);
	}
	const allowedModels = new Set(expectedModels.map(modelID));
	const sessions = [];
	for (const row of selected) {
		let model;
		try { model = modelID(JSON.parse(row.model)); } catch { model = null; }
		const counters = [row.cost, row.tokens_input, row.tokens_output, row.tokens_reasoning, row.tokens_cache_read, row.tokens_cache_write];
		if (!model || counters.some((value) => !numeric(value))) return { valid: false, reason: `invalid telemetry fields for ${row.id}` };
		if (allowedModels.size && !allowedModels.has(model)) return { valid: false, reason: `unexpected model in telemetry: ${model}` };
		if (row.id === parentSessionID && requiredParentModel && model !== modelID(requiredParentModel)) return { valid: false, reason: `unexpected parent model: ${model}` };
		if (row.agent && agentModels[row.agent] && model !== modelID(agentModels[row.agent])) return { valid: false, reason: `unexpected model for ${row.agent}: ${model}` };
		let peakContext = 0;
		for (const encoded of messagesBySession.get(row.id) ?? []) {
			let message;
			try { message = JSON.parse(encoded); } catch { return { valid: false, reason: `malformed message telemetry for ${row.id}` }; }
			if (message.role !== "assistant") continue;
			const input = message.tokens?.input;
			const read = message.tokens?.cache?.read ?? 0;
			const write = message.tokens?.cache?.write ?? 0;
			if (!numeric(input) || !numeric(read) || !numeric(write)) return { valid: false, reason: `malformed assistant token telemetry for ${row.id}` };
			peakContext = Math.max(peakContext, input + read + write);
		}
		if (row.id === parentSessionID && peakContext === 0) return { valid: false, reason: "parent context telemetry missing" };
		sessions.push({
			id: row.id,
			parentID: row.parent_id,
			isParent: row.id === parentSessionID,
			model,
			agent: row.agent ?? null,
			cost: row.cost,
			tokens: { input: row.tokens_input, output: row.tokens_output, reasoning: row.tokens_reasoning, cache: { read: row.tokens_cache_read, write: row.tokens_cache_write } },
			peakContext,
		});
	}
	return { valid: true, sessions };
}

export function aggregateTelemetry(sessions, reasoningModel, handsModel) {
	if (!sessions.length || sessions.filter((session) => session.isParent).length !== 1) throw new Error("exactly one parent session is required");
	const total = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
	let reasoningModelTokens = 0;
	let handsModelTokens = 0;
	let parentTokens = 0;
	let peakParentContext = 0;
	for (const session of sessions) {
		const processed = session.tokens.input + session.tokens.output + session.tokens.reasoning + session.tokens.cache.read + session.tokens.cache.write;
		total.input += session.tokens.input;
		total.output += session.tokens.output;
		total.reasoning += session.tokens.reasoning;
		total.cacheRead += session.tokens.cache.read;
		total.cacheWrite += session.tokens.cache.write;
		total.cost += session.cost;
		if (session.model === reasoningModel) reasoningModelTokens += processed;
		if (session.model === handsModel && handsModel !== reasoningModel) handsModelTokens += processed;
		if (session.isParent) { parentTokens = processed; peakParentContext = session.peakContext; }
	}
	return { ...total, totalTokens: total.input + total.output + total.reasoning + total.cacheRead + total.cacheWrite, reasoningModelTokens, handsModelTokens, parentTokens, peakParentContext, delegationCount: sessions.length - 1 };
}

export function evaluateCriticalGates(scenario, context) {
	const outcomes = [];
	const snapshotChanges = changedSnapshotFiles(context.initialSnapshot, context.finalSnapshot);
	for (const gate of scenario.criticalGates) {
		let pass = false;
		let detail = "";
		if (gate.type === "runner-success") { pass = context.process.status === 0 && !context.process.signal && !context.process.error; detail = context.process.error ?? `exit ${context.process.status}`; }
		if (gate.type === "worktree") { pass = ["clean", "prepared-only"].includes(gate.value) ? snapshotChanges.length === 0 : snapshotChanges.length > 0; detail = snapshotChanges.join(", ") || "unchanged"; }
		if (gate.type === "output-all") { const missing = gate.patterns.filter((pattern) => !context.output.toLowerCase().includes(pattern.toLowerCase())); pass = missing.length === 0; detail = missing.length ? `missing: ${missing.join(", ")}` : "present"; }
		if (gate.type === "changed-only") { pass = snapshotChanges.every((entry) => gate.paths.includes(entry)) && gate.required.every((entry) => snapshotChanges.includes(entry)); detail = snapshotChanges.join(", "); }
		if (gate.type === "commands-pass") { pass = context.commandResults.length === gate.count && context.commandResults.every((result) => result.status === 0 && !result.signal && !result.error); detail = context.commandResults.map((result) => `${result.command[0]}=${result.status}`).join(", "); }
		if (gate.type === "delegation") {
			const arm = context.arm;
			const config = gate.arms?.[arm];
			if (arm === "control") { pass = true; detail = "control exempt"; }
			else if (!config) { detail = `no delegation config for arm ${arm}`; pass = false; }
			else if (!context.telemetry) { detail = "telemetry missing"; pass = false; }
			else if (typeof context.telemetry.delegationCount !== "number") { detail = "delegation count unavailable"; pass = false; }
			else {
				const count = context.telemetry.delegationCount;
				const childSessions = (context.sessions ?? []).filter((session) => !session.isParent);
				if (childSessions.length !== count) { detail = `child session count ${childSessions.length} != delegation count ${count}`; pass = false; }
				else if (config.min != null && count < config.min) { detail = `delegation ${count} < min ${config.min}`; pass = false; }
				else if (config.max != null && count > config.max) { detail = `delegation ${count} > max ${config.max}`; pass = false; }
				else if (config.agents && !childSessions.some((session) => config.agents.includes(session.agent))) {
					const found = [...new Set(childSessions.map((s) => s.agent))].join(", ") || "none";
					detail = `expected agents [${config.agents.join(", ")}], found [${found}]`; pass = false;
				} else if (config.agentModels && context.models) {
					let modelMismatch = null;
					for (const session of childSessions) {
						const role = config.agentModels[session.agent];
						if (role) {
							const expectedModel = context.models[role];
							if (expectedModel && session.model !== expectedModel) {
								modelMismatch = `wrong model for ${session.agent}: expected ${role} (${expectedModel}), got ${session.model}`;
								break;
							}
						}
					}
					if (modelMismatch) { detail = modelMismatch; pass = false; }
					else { pass = true; detail = `delegation count ${count}`; }
				} else { pass = true; detail = `delegation count ${count}`; }
			}
		}
		outcomes.push({ id: gate.id, pass, detail });
	}
	return { pass: outcomes.every((outcome) => outcome.pass), outcomes };
}

export function validateResult(result, manifest, job) {
	if (!result || result.schemaVersion !== BENCHMARK_VERSION || result.runID !== manifest.runID || result.jobID !== job.jobID || result.manifestHash !== manifest.manifestHash) return "result identity mismatch";
	if (result.scenario !== job.scenario || result.arm !== job.arm || result.repetition !== job.repetition || result.resolvedConfigHash !== manifest.resolvedConfigs[job.arm]?.resolvedHash) return "result job/config mismatch";
	if (!result.telemetryValid || !result.telemetry || result.process.status !== 0 || result.process.signal || result.process.error) return "result is not a successful telemetry observation";
	return null;
}

export function median(values) {
	if (!values.length) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
