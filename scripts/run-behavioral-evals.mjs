#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
	buildIsolatedConfig,
	changedSnapshotFiles,
	correlateRoot,
	evaluateScenario,
	formatUsage,
	modelID,
	normalizeTelemetry,
	parseArgs,
	parseJsonEvents,
	renderContract,
	selectScenarios,
	snapshotDirectory,
	validateResolvedConfig,
	validateReportShape,
	validateScenarioSchema,
} from "./behavioral-eval-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginURL = pathToFileURL(path.join(root, ".opencode/plugins/cockpit.js")).href;
const fixture = path.join(root, "evals/fixture");

function fail(message) {
	console.error(message);
	process.exit(1);
}

let options;
try { options = parseArgs(process.argv.slice(2)); } catch (error) { fail(error.message); }
if (options.has("--help")) {
	console.log(formatUsage());
	process.exit(0);
}

const parentModel = options.get("--parent-model");
const workerModel = options.get("--worker-model") ?? null;
if (!modelID(parentModel)) fail(`An explicit valid --parent-model is required.\n${formatUsage()}`);
if (workerModel && !modelID(workerModel)) fail("--worker-model must be a provider/model identifier");

let scenarios;
let selected;
try {
	scenarios = validateScenarioSchema(JSON.parse(await readFile(path.join(root, "evals/scenarios.json"), "utf8")));
	selected = selectScenarios(scenarios, options);
} catch (error) { fail(error.message); }

if (options.has("--dry-run")) {
	for (const scenario of selected) console.log(`${scenario.id}\t${scenario.invocation.type}${scenario.invocation.command ? `:${scenario.invocation.command}` : ""}\tworker=${scenario.workerMode === "unavailable" ? "disabled" : (workerModel ?? "disabled")}`);
	process.exit(0);
}

const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("OPENCODE_")));

function execute(argv, { cwd, env = cleanEnvironment, timeout = 120_000 } = {}) {
	const result = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: "utf8", timeout, maxBuffer: 20 * 1024 * 1024 });
	return { argv, status: result.status, signal: result.signal, error: result.error?.message ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function requireSuccess(result, label) {
	if (result.status !== 0 || result.error || result.signal) throw new Error(`${label} failed: ${result.error ?? result.stderr ?? `exit ${result.status}`}`);
	return result;
}

function gitState(workspace, env) {
	const status = requireSuccess(execute(["git", "status", "--porcelain=v1", "--untracked-files=all"], { cwd: workspace, env }), "git status").stdout;
	let diff = requireSuccess(execute(["git", "diff", "--binary", "HEAD", "--"], { cwd: workspace, env }), "git diff").stdout;
	const untracked = requireSuccess(execute(["git", "ls-files", "--others", "--exclude-standard", "-z"], { cwd: workspace, env }), "git ls-files").stdout.split("\0").filter(Boolean).sort();
	for (const relative of untracked) {
		const untrackedDiff = execute(["git", "diff", "--no-index", "--binary", "--", "/dev/null", relative], { cwd: workspace, env });
		if (untrackedDiff.status !== 1 || untrackedDiff.error || untrackedDiff.signal) throw new Error(`git diff for untracked ${relative} failed: ${untrackedDiff.error ?? untrackedDiff.stderr}`);
		diff += untrackedDiff.stdout;
	}
	return { status, diff };
}

function configEnvironment(configDirectory, workspace) {
	return {
		...cleanEnvironment,
		PWD: workspace,
		XDG_CONFIG_HOME: path.join(configDirectory, "xdg-config"),
		OPENCODE_CONFIG_DIR: configDirectory,
		OPENCODE_DISABLE_CLAUDE_CODE: "1",
	};
}

async function createAndValidateConfig({ configDirectory, workspace, scenario }) {
	const intended = buildIsolatedConfig({ parentModel, workerModel, workerMode: scenario.workerMode, pluginURL });
	await writeFile(path.join(configDirectory, "opencode.json"), `${JSON.stringify(intended, null, 2)}\n`, { mode: 0o600 });
	const env = configEnvironment(configDirectory, workspace);
	const configResult = requireSuccess(execute(["opencode", "debug", "config"], { cwd: workspace, env, timeout: 30_000 }), "opencode debug config");
	let resolved;
	try { resolved = JSON.parse(configResult.stdout); } catch { throw new Error("opencode debug config returned malformed JSON"); }
	validateResolvedConfig({ intended, resolved, parentModel, workerModel, workerMode: scenario.workerMode, pluginURL });
	return { intended, resolved, env, debug: configResult };
}

if (options.has("--validate-config")) {
	for (const scenario of selected) {
		const configDirectory = await mkdtemp(path.join(os.tmpdir(), "cockpit-eval-config-"));
		try {
			await createAndValidateConfig({ configDirectory, workspace: fixture, scenario });
			console.log(`validated ${scenario.id}`);
		} finally { await rm(configDirectory, { recursive: true, force: true }); }
	}
	process.exit(0);
}

async function databasePath() {
	const candidates = [
		path.join(os.homedir(), ".local/share/opencode/opencode.db"),
		path.join(os.homedir(), "Library/Application Support/opencode/opencode.db"),
	];
	for (const candidate of candidates) {
		try { await access(candidate); return candidate; } catch {}
	}
	throw new Error("OpenCode SQLite database was not found");
}

function queryTelemetry(databaseFile, rootID) {
	const database = new DatabaseSync(databaseFile, { readOnly: true });
	try {
		const tree = database.prepare(`
			WITH RECURSIVE tree AS (
				SELECT id, parent_id, directory, agent, model, time_created, time_updated, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write FROM session WHERE id = ?
				UNION ALL
				SELECT child.id, child.parent_id, child.directory, child.agent, child.model, child.time_created, child.time_updated, child.cost, child.tokens_input, child.tokens_output, child.tokens_reasoning, child.tokens_cache_read, child.tokens_cache_write
				FROM session child JOIN tree parent ON child.parent_id = parent.id
			)
			SELECT * FROM tree ORDER BY time_created, id
		`).all(rootID);
		const placeholders = tree.map(() => "?").join(",");
		const parts = tree.length ? database.prepare(`SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE session_id IN (${placeholders}) ORDER BY time_created, id`).all(...tree.map((row) => row.id)) : [];
		return { tree, parts };
	} finally { database.close(); }
}

async function correlate(databaseFile, parsed, workspace, startedAt, endedAt) {
	const database = new DatabaseSync(databaseFile, { readOnly: true });
	let candidates;
	try {
		const placeholders = parsed.sessionIDs.map(() => "?").join(",");
		candidates = database.prepare(`SELECT id, parent_id, directory, agent, model, time_created, time_updated, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write FROM session WHERE id IN (${placeholders})`).all(...parsed.sessionIDs);
	} finally { database.close(); }
	return correlateRoot({ eventSessionIDs: parsed.sessionIDs, sessions: candidates, workspace, startedAt, endedAt, parentModel });
}

const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const resultsDirectory = path.join(root, "evals/results", `${stamp}-${process.pid}-${parentModel.replaceAll("/", "-")}`);
await mkdir(resultsDirectory, { recursive: true, mode: 0o700 });
await chmod(resultsDirectory, 0o700);
const summaries = [];

for (const scenario of selected) {
	const workspace = await mkdtemp(path.join(os.tmpdir(), `cockpit-eval-${scenario.id}-`));
	const configDirectory = await mkdtemp(path.join(os.tmpdir(), "cockpit-eval-config-"));
	const prompt = scenario.invocation.type === "command" ? renderContract(scenario.contract) : scenario.invocation.prompt;
	const argv = ["opencode", "run", "--format", "json", "-m", parentModel];
	if (scenario.invocation.type === "command") argv.push("--command", "cockpit-run");
	argv.push(prompt);
	let report;
	try {
		await cp(fixture, workspace, { recursive: true });
		const gitEnv = { ...cleanEnvironment, PWD: workspace, GIT_AUTHOR_NAME: "Cockpit Eval", GIT_AUTHOR_EMAIL: "cockpit-eval@example.invalid", GIT_COMMITTER_NAME: "Cockpit Eval", GIT_COMMITTER_EMAIL: "cockpit-eval@example.invalid" };
		for (const argv of [["git", "init", "-q"], ["git", "add", "."], ["git", "commit", "-qm", "fixture baseline"]]) requireSuccess(execute(argv, { cwd: workspace, env: gitEnv }), argv.join(" "));
		const baselineSnapshot = await snapshotDirectory(workspace);
		const baselineState = gitState(workspace, gitEnv);

		for (const [relative, content] of Object.entries(scenario.prepare ?? {})) {
			const destination = path.join(workspace, relative);
			await mkdir(path.dirname(destination), { recursive: true });
			await writeFile(destination, content);
		}
		const preparedSnapshot = await snapshotDirectory(workspace);
		const preparedState = gitState(workspace, gitEnv);

		// This shared validator is the final operation before every model invocation.
		const config = await createAndValidateConfig({ configDirectory, workspace, scenario });
		const startedAt = Date.now();
		const processResult = execute(argv, { cwd: workspace, env: config.env, timeout: 10 * 60_000 });
		const endedAt = Date.now();

		const finalSnapshot = await snapshotDirectory(workspace);
		const finalState = gitState(workspace, gitEnv);
		const independentChecks = scenario.verificationCommands.map((check) => execute(check.argv, { cwd: workspace, env: gitEnv }));
		const parsed = parseJsonEvents(processResult.stdout);
		let databaseFile = null;
		let correlation = { valid: false, reason: parsed.reason };
		if (parsed.valid) {
			try {
				databaseFile = await databasePath();
				correlation = await correlate(databaseFile, parsed, workspace, startedAt, endedAt);
			} catch (error) { correlation = { valid: false, reason: error.message }; }
		}
		let telemetry = null;
		if (correlation.valid) {
			try {
				const raw = queryTelemetry(databaseFile, correlation.rootID);
				telemetry = normalizeTelemetry(raw.tree, raw.parts, correlation.rootID);
				if (telemetry.sessions.length === 0) correlation = { valid: false, reason: "correlated session tree was empty" };
			} catch (error) { correlation = { valid: false, reason: error.message }; }
		}
		const objective = evaluateScenario(scenario, {
			process: processResult, correlation, telemetry, parentModel, workerModel,
			baselineSnapshot, preparedSnapshot, finalSnapshot,
			preparedStatus: preparedState.status, finalStatus: finalState.status,
			preparedDiff: preparedState.diff, finalDiff: finalState.diff,
			independentChecks,
		});

		report = {
			schemaVersion: 2,
			scenario,
			config: { intended: config.intended, resolved: config.resolved },
			invocation: { argv, startedAt, endedAt, status: processResult.status, signal: processResult.signal, error: processResult.error, stdout: processResult.stdout, stderr: processResult.stderr },
			parsedEvents: parsed.events ?? [],
			correlation,
			sessions: telemetry?.sessions ?? [],
			parts: telemetry?.parts ?? [],
			toolChronology: telemetry?.tools ?? [],
			taskMatches: telemetry?.taskMatches ?? [],
			state: {
				baseline: { snapshot: baselineSnapshot, status: baselineState.status, diff: baselineState.diff },
				prepared: { snapshot: preparedSnapshot, status: preparedState.status, diff: preparedState.diff },
				final: { snapshot: finalSnapshot, status: finalState.status, diff: finalState.diff },
				changedPaths: {
					baselineToPrepared: changedSnapshotFiles(baselineSnapshot, preparedSnapshot),
					preparedToFinal: changedSnapshotFiles(preparedSnapshot, finalSnapshot),
					baselineToFinal: changedSnapshotFiles(baselineSnapshot, finalSnapshot),
				},
			},
			independentChecks,
			objective,
			manualRubric: scenario.manualRubric,
		};
		validateReportShape(report);
	} catch (error) {
		report = {
			schemaVersion: 2,
			scenario,
			config: { intended: null, resolved: null },
			invocation: { argv, startedAt: null, endedAt: null, status: null, signal: null, error: error.message, stdout: "", stderr: "" },
			parsedEvents: [],
			correlation: { valid: false, reason: error.message },
			sessions: [],
			parts: [],
			toolChronology: [],
			taskMatches: [],
			state: { baseline: null, prepared: null, final: null, changedPaths: { baselineToPrepared: [], preparedToFinal: [], baselineToFinal: [] } },
			independentChecks: [],
			objective: { pass: false, gates: [{ id: "harness", pass: false, reason: error.message }] },
			manualRubric: scenario.manualRubric,
			harnessError: error.stack ?? error.message,
		};
		validateReportShape(report);
	} finally {
		await rm(workspace, { recursive: true, force: true });
		await rm(configDirectory, { recursive: true, force: true });
	}
	const scenarioDirectory = path.join(resultsDirectory, scenario.id);
	await mkdir(scenarioDirectory, { recursive: true, mode: 0o700 });
	await writeFile(path.join(scenarioDirectory, "result.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
	summaries.push({ id: scenario.id, scored: scenario.scored !== false, pass: report.objective.pass, gates: report.objective.gates.length, failed: report.objective.gates.filter((gate) => !gate.pass).map((gate) => gate.id) });
	console.log(`${scenario.id}: ${scenario.scored === false ? "BASELINE" : report.objective.pass ? "PASS" : "FAIL"}`);
}

const summary = [
	"# Behavioral Eval Summary", "", `Parent model: \`${parentModel}\``, `Worker model: \`${workerModel ?? "none"}\``, "",
	"| Scenario | Objective | Failed gates |", "|---|---:|---|",
	...summaries.map((item) => `| ${item.id} | ${item.scored ? item.pass ? "PASS" : "FAIL" : "BASELINE"} | ${item.failed.join(", ") || "none"} |`), "",
];
await writeFile(path.join(resultsDirectory, "SUMMARY.md"), summary.join("\n"), { mode: 0o600 });
console.log(`Results: ${resultsDirectory}`);
if (summaries.some((item) => item.scored && !item.pass)) process.exit(1);
