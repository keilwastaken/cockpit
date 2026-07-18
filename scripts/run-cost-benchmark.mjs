#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { access, chmod, cp, mkdir, mkdtemp, readFile, realpath, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { opencodeRoles } from "./adapter-definition.mjs";
import {
	ALL_ARMS,
	REQUIRED_NODE_MAJOR,
	REQUIRED_OPENCODE_VERSION,
	aggregateTelemetry,
	armConfig,
	changedSnapshotFiles,
	collectSessionTree,
	createManifest,
	evaluateCriticalGates,
	generateJobs,
	modelID,
	outputText,
	parseArgs,
	parseJsonLines,
	sanitizeConfig,
	sanitizeEnvironment,
	sha256,
	snapshotDirectory,
	validateManifest,
	validateResult,
	validateRunID,
	writeJsonExclusiveAtomic,
} from "./cost-benchmark-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let activeChild = null;
let terminating = false;

function killGroup(child, signal) {
	if (!child?.pid) return;
	try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
}

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
	process.on(signal, () => {
		if (terminating) return;
		terminating = true;
		if (!activeChild) process.exit(code);
		killGroup(activeChild, "SIGTERM");
		const child = activeChild;
		setTimeout(() => {
			killGroup(child, "SIGKILL");
			setTimeout(() => process.exit(code), 100);
		}, 5_000);
	});
}

function run(command, args, cwd, env, timeout = 120_000) {
	return spawnSync(command, args, { cwd, env, timeout, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
}

function runModel(command, args, cwd, env, timeout) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
		activeChild = child;
		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;
		let escalationTimer = null;
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		const timer = setTimeout(() => {
			timedOut = true;
			killGroup(child, "SIGTERM");
			escalationTimer = setTimeout(() => {
				killGroup(child, "SIGKILL");
				setTimeout(() => finish(child.exitCode, child.signalCode, null), 100);
			}, 5_000);
		}, timeout);
		function finish(status, signal, error) {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (escalationTimer) clearTimeout(escalationTimer);
			activeChild = null;
			resolve({ status, signal, stdout, stderr, error: timedOut ? `timed out after ${timeout} ms` : error?.message ?? null });
		}
		child.once("error", (error) => { if (!terminating) finish(null, null, error); });
		child.once("close", (status, signal) => { if (!timedOut && !terminating) finish(status, signal, null); });
	});
}

async function hashTree(directory) {
	const entries = [];
	async function walk(current, relative = "") {
		for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
			const childRelative = path.join(relative, entry.name);
			const child = path.join(current, entry.name);
			if (entry.isDirectory()) await walk(child, childRelative);
			else if (entry.isFile()) entries.push([childRelative, sha256(await readFile(child))]);
		}
	}
	await walk(directory);
	return sha256(entries);
}

async function defaultDatabasePath() {
	for (const candidate of [
		process.env.XDG_DATA_HOME && path.join(process.env.XDG_DATA_HOME, "opencode/opencode.db"),
		path.join(os.homedir(), ".local/share/opencode/opencode.db"),
		path.join(os.homedir(), "Library/Application Support/opencode/opencode.db"),
	].filter(Boolean)) {
		try { await access(candidate); return realpath(candidate); } catch {}
	}
	throw new Error("OpenCode database not found; pass --opencode-db");
}

function usage() {
	return "Usage: npm run benchmark:cost -- --run-id ID [--scenario ID] [--arms control,isolation,role-split] [--repetitions 2] [--reasoning-model ID] [--hands-model ID] [--timeout-minutes 6] [--observed-cost-stop N] [--max-runs N] [--allow-env NAME] [--resume] [--dry-run]";
}

let options;
try { options = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(1); }
if (options.has("--help")) { console.log(usage()); process.exit(0); }
if (Number(process.versions.node.split(".")[0]) !== REQUIRED_NODE_MAJOR) throw new Error(`Benchmark requires Node ${REQUIRED_NODE_MAJOR}.x`);

const runID = options.get("--run-id") ?? new Date().toISOString().replaceAll(/[:.]/g, "-");
const runIDError = validateRunID(runID);
if (runIDError) throw new Error(runIDError);
const cockpitRoot = await realpath(options.get("--cockpit-root") ?? root);
const databasePath = options.has("--dry-run") && !options.get("--opencode-db")
	? "<OPENCODE_DB>"
	: await realpath(options.get("--opencode-db") ?? await defaultDatabasePath());
const allScenarios = JSON.parse(await readFile(path.join(root, "evals/cost/scenarios.json"), "utf8"));
const scenarioID = options.get("--scenario");
const scenarios = scenarioID ? allScenarios.filter((scenario) => scenario.id === scenarioID) : allScenarios;
if (!scenarios.length) throw new Error(`Unknown scenario: ${scenarioID}`);
const arms = (options.get("--arms") ?? ALL_ARMS.join(",")).split(",");
if (arms.some((arm) => !ALL_ARMS.includes(arm))) throw new Error(`Unknown arm: ${arms.join(",")}`);
const repetitions = Number(options.get("--repetitions") ?? 2);
if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("--repetitions must be a positive integer");
const timeoutMinutes = Number(options.get("--timeout-minutes") ?? 6);
const maxRuns = Number(options.get("--max-runs") ?? Number.POSITIVE_INFINITY);
const observedCostStop = Number(options.get("--observed-cost-stop") ?? Number.POSITIVE_INFINITY);
if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0 || !(maxRuns === Number.POSITIVE_INFINITY || Number.isInteger(maxRuns) && maxRuns > 0) || !(observedCostStop >= 0)) throw new Error("invalid numeric benchmark option");
const reasoningModel = options.get("--reasoning-model") ?? "openai/gpt-5.6-sol";
const handsModel = options.get("--hands-model") ?? "opencode/deepseek-v4-flash-free";
if (!modelID(reasoningModel) || !modelID(handsModel)) throw new Error("models must use provider/model identifiers");
const allowedEnvironmentNames = options.get("--allow-env") ?? [];
const baseEnv = sanitizeEnvironment(process.env, allowedEnvironmentNames);
const publishable = scenarios.length === allScenarios.length && arms.length === 3 && ALL_ARMS.every((arm) => arms.includes(arm)) && repetitions === 2;
if (publishable && !options.has("--dry-run") && cockpitRoot !== await realpath(root)) throw new Error("publishable runs require the benchmark source checkout as --cockpit-root");

let openCodeVersion = "unchecked-dry-run";
if (!options.has("--dry-run")) {
	const version = run("opencode", ["--version"], cockpitRoot, baseEnv, 30_000);
	openCodeVersion = version.stdout.trim();
	if (version.status !== 0 || openCodeVersion !== REQUIRED_OPENCODE_VERSION) throw new Error(`Benchmark requires OpenCode ${REQUIRED_OPENCODE_VERSION}; observed ${openCodeVersion || "unavailable"}`);
}

const gitHeadResult = run("git", ["rev-parse", "HEAD"], cockpitRoot, baseEnv);
const gitStatusResult = run("git", ["status", "--porcelain"], cockpitRoot, baseEnv);
if (gitHeadResult.status !== 0 || gitStatusResult.status !== 0) throw new Error("could not capture Git provenance");
const gitHead = gitHeadResult.stdout.trim();
const gitStatus = gitStatusResult.stdout;
if (publishable && !options.has("--dry-run") && gitStatus) throw new Error("publishable benchmark runs require a clean Git working tree");
const provenance = {
	nodeVersion: process.versions.node,
	openCodeVersion,
	gitHead,
	workingTreeHash: sha256(gitStatus),
	scenariosHash: sha256(await readFile(path.join(root, "evals/cost/scenarios.json"))),
	fixtureHash: await hashTree(path.join(root, "evals/cost/fixture")),
	pluginHash: sha256(await readFile(path.join(cockpitRoot, ".opencode/plugins/cockpit.js"))),
	adapterDefinitionHash: sha256(await readFile(path.join(cockpitRoot, "scripts/adapter-definition.mjs"))),
	skillsHash: await hashTree(path.join(cockpitRoot, "skills")),
	benchmarkSourceHash: sha256([
		sha256(await readFile(path.join(root, "scripts/run-cost-benchmark.mjs"))),
		sha256(await readFile(path.join(root, "scripts/cost-benchmark-core.mjs"))),
		sha256(await readFile(path.join(root, "scripts/prepare-cost-benchmark-review.mjs"))),
		sha256(await readFile(path.join(root, "scripts/summarize-cost-benchmark.mjs"))),
	]),
};
const seed = sha256({ runID, provenance, reasoningModel, handsModel });
const jobs = generateJobs(scenarios, arms, repetitions, seed);

async function resolveArmConfig(arm) {
	const intended = armConfig(arm, cockpitRoot, reasoningModel, handsModel, opencodeRoles);
	if (options.has("--dry-run")) return { intended: sanitizeConfig(intended, [[cockpitRoot, "<COCKPIT_ROOT>"]]), resolvedHash: "unchecked-dry-run" };
	const configDir = await mkdtemp(path.join(os.tmpdir(), "cockpit-cost-resolve-"));
	try {
		await writeFile(path.join(configDir, "opencode.json"), `${JSON.stringify(intended, null, 2)}\n`, { mode: 0o600 });
		const env = { ...baseEnv, PWD: path.join(root, "evals/cost/fixture"), OPENCODE_CONFIG_DIR: configDir, OPENCODE_DISABLE_PROJECT_CONFIG: "1" };
		const args = ["debug", "config"];
		if (arm === "control") args.push("--pure");
		const result = run("opencode", args, root, env);
		if (result.status !== 0) throw new Error(`Could not resolve ${arm} config: ${result.stderr}`);
		const resolved = JSON.parse(result.stdout);
		const sanitized = sanitizeConfig(resolved, [[cockpitRoot, "<COCKPIT_ROOT>"], [configDir, "<CONFIG_DIR>"], [os.homedir(), "<HOME>"]]);
		return { intended: sanitizeConfig(intended, [[cockpitRoot, "<COCKPIT_ROOT>"]]), resolved: sanitized, resolvedHash: sha256(sanitized) };
	} finally { await rm(configDir, { recursive: true, force: true }); }
}

const resolvedConfigs = Object.fromEntries(await Promise.all(arms.map(async (arm) => [arm, await resolveArmConfig(arm)])));
const manifest = createManifest({ runID, publishable, models: { reasoning: reasoningModel, hands: handsModel }, repetitions, arms, timeoutMinutes, allowedEnvironmentNames, provenance, resolvedConfigs, jobs });
if (options.has("--dry-run")) {
	console.log(JSON.stringify(manifest, null, 2));
	for (const job of jobs) console.log(job.key);
	process.exit(0);
}

const resultsRoot = path.join(root, "evals/results/cost", runID);
const manifestPath = path.join(resultsRoot, "manifest.json");
if (options.has("--resume")) {
	const existing = JSON.parse(await readFile(manifestPath, "utf8"));
	const invalidManifest = validateManifest(existing);
	if (invalidManifest) throw new Error(invalidManifest);
	if (existing.manifestHash !== manifest.manifestHash) throw new Error("resume manifest/provenance mismatch");
} else {
	try { await access(resultsRoot); throw new Error(`run ID already exists: ${runID}`); } catch (error) { if (!String(error.message).includes("ENOENT") && !String(error.message).includes("no such file")) throw error; }
	await mkdir(resultsRoot, { recursive: true, mode: 0o700 });
	await chmod(resultsRoot, 0o700);
	await writeJsonExclusiveAtomic(manifestPath, manifest);
}

let completedThisInvocation = 0;
let accumulatedCost = 0;
for (const job of jobs) {
	const manifestJob = manifest.jobs.find((candidate) => candidate.jobID === job.jobID);
	const resultDirectory = path.join(resultsRoot, job.scenario.id, job.arm);
	const resultPath = path.join(resultDirectory, `${job.repetition}.json`);
	if (options.has("--resume")) {
		try {
			const existing = JSON.parse(await readFile(resultPath, "utf8"));
			const invalid = validateResult(existing, manifest, manifestJob);
			if (invalid) throw new Error(`${job.key}: ${invalid}`);
			accumulatedCost += existing.telemetry.cost;
			continue;
		} catch (error) {
			if (!String(error.message).includes("ENOENT") && !String(error.message).includes("no such file")) throw error;
		}
	}
	if (completedThisInvocation >= maxRuns) break;
	if (accumulatedCost >= observedCostStop) { console.error(`Observed-cost stop reached at $${accumulatedCost.toFixed(4)}; this is not a billing cap.`); break; }
	const workspacePath = await mkdtemp(path.join(os.tmpdir(), `cockpit-cost-${job.scenario.id}-`));
	const workspace = await realpath(workspacePath);
	const configDirectory = await mkdtemp(path.join(os.tmpdir(), "cockpit-cost-config-"));
	try {
		await cp(path.join(root, "evals/cost/fixture"), workspace, { recursive: true });
		const runEnv = { ...baseEnv, PWD: workspace, OPENCODE_CONFIG_DIR: configDirectory, OPENCODE_DISABLE_PROJECT_CONFIG: "1" };
		for (const command of [["init", "-q"], ["config", "user.email", "cockpit-eval@example.invalid"], ["config", "user.name", "Cockpit Eval"], ["add", "."], ["commit", "-qm", "fixture baseline"]]) {
			const result = run("git", command, workspace, runEnv);
			if (result.status !== 0) throw new Error(`fixture command failed: git ${command.join(" ")}`);
		}
		for (const [relative, content] of Object.entries(job.scenario.prepare ?? {})) {
			const destination = path.join(workspace, relative);
			await mkdir(path.dirname(destination), { recursive: true });
			await writeFile(destination, content);
		}
		const initialStatus = run("git", ["status", "--porcelain"], workspace, runEnv).stdout.trim();
		const initialSnapshot = await snapshotDirectory(workspace);
		const config = armConfig(job.arm, cockpitRoot, reasoningModel, handsModel, opencodeRoles);
		await writeFile(path.join(configDirectory, "opencode.json"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
		const startedAt = Date.now();
		const started = performance.now();
		const args = ["run", "--format", "json", "-m", reasoningModel];
		if (job.arm === "control") args.push("--pure");
		args.push(job.scenario.prompt);
		console.error(`Running ${job.key}...`);
		const processResult = await runModel("opencode", args, workspace, runEnv, timeoutMinutes * 60_000);
		const events = parseJsonLines(processResult.stdout);
		const sessionIDs = [...new Set(events.map((event) => event.sessionID).filter(Boolean))];
		const parentSessionID = sessionIDs[0] ?? null;
		const database = new DatabaseSync(databasePath, { readOnly: true });
		const rows = database.prepare(`WITH RECURSIVE tree AS (SELECT * FROM session WHERE id = ? UNION ALL SELECT child.* FROM session child JOIN tree parent ON child.parent_id = parent.id) SELECT * FROM tree`).all(parentSessionID);
		const messageQuery = database.prepare("SELECT session_id, data FROM message WHERE session_id = ?");
		const messageRows = rows.flatMap((row) => messageQuery.all(row.id));
		database.close();
		const expectedModels = job.arm === "role-split" ? [reasoningModel, handsModel] : [reasoningModel];
		const agentModels = Object.fromEntries([
			...opencodeRoles.map((role) => [role.name, reasoningModel]),
			["explore", job.arm === "role-split" ? handsModel : reasoningModel],
			["general", job.arm === "role-split" ? handsModel : reasoningModel],
		]);
		const collected = collectSessionTree(rows, messageRows, parentSessionID, workspace, startedAt, expectedModels, reasoningModel, agentModels);
		const telemetry = collected.valid ? aggregateTelemetry(collected.sessions, reasoningModel, handsModel) : null;
		const finalStatus = run("git", ["status", "--porcelain"], workspace, runEnv).stdout.trim();
		const finalSnapshot = await snapshotDirectory(workspace);
		const commandResults = (job.scenario.verificationCommands ?? []).map((command) => {
			const result = run(command[0], command.slice(1), workspace, runEnv);
			return { command, status: result.status, signal: result.signal, error: result.error?.message ?? null, stdout: result.stdout, stderr: result.stderr };
		});
		const output = outputText(events);
		const critical = evaluateCriticalGates(job.scenario, { process: processResult, output, initialStatus, finalStatus, initialSnapshot, finalSnapshot, commandResults, arm: job.arm, telemetry: collected.valid ? telemetry : null, sessions: collected.valid ? collected.sessions : null, models: { reasoning: reasoningModel, hands: handsModel } });
		const changedFiles = changedSnapshotFiles(initialSnapshot, finalSnapshot)
			.map((file) => ({ path: file, before: initialSnapshot[file] ?? null, after: finalSnapshot[file] ?? null }));
		const result = {
			schemaVersion: 2,
			runID,
			jobID: job.jobID,
			manifestHash: manifest.manifestHash,
			scenario: job.scenario.id,
			arm: job.arm,
			repetition: job.repetition,
			resolvedConfigHash: resolvedConfigs[job.arm].resolvedHash,
			durationMs: Math.round(performance.now() - started),
			telemetryValid: collected.valid,
			telemetryInvalidReason: collected.valid ? null : collected.reason,
			telemetry,
			critical,
			worktree: { initial: initialStatus, final: finalStatus },
			artifacts: {
				changes: changedFiles,
				prepared: Object.keys(job.scenario.prepare ?? {}).sort().map((file) => ({ path: file, snapshot: initialSnapshot[file] ?? null })),
			},
			commandResults,
			output,
			process: { status: processResult.status, signal: processResult.signal, error: processResult.error, stderr: processResult.stderr },
		};
		await mkdir(resultDirectory, { recursive: true, mode: 0o700 });
		await chmod(resultDirectory, 0o700);
		await writeJsonExclusiveAtomic(resultPath, result);
		if (!collected.valid || processResult.status !== 0 || processResult.error) throw new Error(`${job.key} produced an invalid observation: ${collected.reason ?? processResult.error ?? processResult.status}`);
		accumulatedCost += telemetry.cost;
		completedThisInvocation += 1;
	} finally {
		await rm(workspacePath, { recursive: true, force: true });
		await rm(configDirectory, { recursive: true, force: true });
	}
}

console.log(`Run data: ${resultsRoot}`);
