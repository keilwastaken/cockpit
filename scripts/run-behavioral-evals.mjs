import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { roles as opencodeRoles } from "./adapter-definition.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function value(flag) {
	const index = args.indexOf(flag);
	return index >= 0 ? args[index + 1] : undefined;
}

const scenarios = JSON.parse(await readFile(path.join(root, "evals/scenarios.json"), "utf8"));

const model = value("--model");
const selectedID = value("--scenario");
const dryRun = args.includes("--dry-run");
const validateConfig = args.includes("--validate-config");
const selected = selectedID ? scenarios.filter((scenario) => scenario.id === selectedID) : scenarios;

if (selectedID && selected.length === 0) {
	console.error(`Unknown scenario: ${selectedID}`);
	process.exit(1);
}

if (args.includes("--help") || !model && !dryRun) {
	console.log("Usage: npm run eval -- --model <provider/model> [--scenario <id>] [--dry-run] [--validate-config]");
	console.log("\nScenarios:");
	for (const scenario of scenarios) console.log(`  ${scenario.id.padEnd(22)} ${scenario.name}`);
	process.exit(args.includes("--help") ? 0 : 1);
}

if (dryRun) {
	for (const scenario of selected) {
		const route = scenario.route.role ?? "current-agent";
		console.log(`[${scenario.category.padEnd(12)}] ${scenario.id.padEnd(22)} ${scenario.route.mode}:${route}`);
	}
	process.exit(0);
}

const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const resultsDirectory = validateConfig ? null : path.join(root, "evals/results", `${timestamp}-${model.replaceAll("/", "-")}`);
if (resultsDirectory) await mkdir(resultsDirectory, { recursive: true });

function run(command, commandArgs, cwd, environment = process.env) {
	return spawnSync(command, commandArgs, {
		cwd,
		encoding: "utf8",
		timeout: 10 * 60 * 1000,
		maxBuffer: 10 * 1024 * 1024,
		env: environment,
	});
}

for (const scenario of selected) {
	const workspace = await mkdtemp(path.join(os.tmpdir(), `cockpit-eval-${scenario.id}-`));
	const configDirectory = await mkdtemp(path.join(os.tmpdir(), "cockpit-eval-config-"));
	try {
		await cp(path.join(root, "evals/fixture"), workspace, { recursive: true });
		run("git", ["init", "-q"], workspace);
		run("git", ["config", "user.email", "cockpit-eval@example.invalid"], workspace);
		run("git", ["config", "user.name", "Cockpit Eval"], workspace);
		run("git", ["add", "."], workspace);
		run("git", ["commit", "-qm", "fixture baseline"], workspace);

		for (const [relativePath, content] of Object.entries(scenario.prepare ?? {})) {
			const destination = path.join(workspace, relativePath);
			await mkdir(path.dirname(destination), { recursive: true });
			await writeFile(destination, content);
		}

		// OpenCode evals use 3 Cockpit subagents (strategist, planner, reviewer) plus built-in explore and general overrides
		const agent = Object.fromEntries(opencodeRoles.map((role) => [role.name, {
			mode: "subagent",
			model,
			description: role.description,
			prompt: `Load the ${role.skill} skill before acting and follow it. Return only the requested handoff.`,
			permission: { edit: role.readOnly ? "deny" : "allow" },
		}]));
		// Override built-in explore and general with appropriate models
		agent.explore = { model };
		agent.general = { model };
		const config = {
			$schema: "https://opencode.ai/config.json",
			model,
			small_model: model,
			plugin: [pathToFileURL(path.join(root, ".opencode/plugins/cockpit.js")).href],
			agent,
		};
		await writeFile(path.join(configDirectory, "opencode.json"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
		const environment = {
			...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("OPENCODE_"))),
			PWD: workspace,
			XDG_CONFIG_HOME: path.join(configDirectory, "xdg-config"),
			OPENCODE_CONFIG_DIR: configDirectory,
			OPENCODE_DISABLE_CLAUDE_CODE: "1",
		};
		const resolvedResult = run("opencode", ["debug", "config"], workspace, environment);
		if (resolvedResult.status !== 0) throw new Error(`Could not resolve isolated OpenCode config: ${resolvedResult.stderr}`);
		const resolved = JSON.parse(resolvedResult.stdout);
		const unexpectedPlugins = (resolved.plugin ?? []).filter((plugin) => plugin !== config.plugin[0]);
		if (unexpectedPlugins.length) throw new Error(`Isolated OpenCode config loaded unexpected plugins: ${unexpectedPlugins.join(", ")}`);
		for (const role of opencodeRoles) {
			const actual = resolved.agent?.[role.name];
			if (!actual || actual.model !== model || actual.description !== role.description) throw new Error(`Isolated OpenCode config mismatch for ${role.name}`);
		}
		// Verify no cockpit-research or cockpit-executor subagents in OpenCode config
		if (resolved.agent?.["cockpit-research"]) throw new Error("Isolated OpenCode config must not contain cockpit-research subagent");
		if (resolved.agent?.["cockpit-executor"]) throw new Error("Isolated OpenCode config must not contain cockpit-executor subagent");
		// Verify built-in explore and general are overridden with hands model
		if (!resolved.agent?.explore || resolved.agent.explore.model !== model) throw new Error("Isolated OpenCode config must override built-in explore with hands model");
		if (!resolved.agent?.general || resolved.agent.general.model !== model) throw new Error("Isolated OpenCode config must override built-in general with hands model");
		if (validateConfig) {
			console.log(`Validated isolated OpenCode config for ${model}`);
			break;
		}

		console.log(`[${scenario.category.padEnd(12)}] Running ${scenario.id} with ${model}...`);
		const result = run("opencode", ["run", "-m", model, scenario.prompt], workspace, environment);
		const status = result.error ? `runner error: ${result.error.message}` : `exit ${result.status}`;
		const report = [
			`# ${scenario.name}`,
			"",
			`- Scenario: \`${scenario.id}\``,
			`- Category: \`${scenario.category}\``,
			`- Expected route: \`${scenario.route.mode}:${scenario.route.role ?? "current-agent"}\``,
			`- Model: \`${model}\``,
			`- Runner: ${status}`,
			"- Config isolation: resolved and validated before model invocation",
			"",
			"## Prompt",
			"",
			scenario.prompt,
			"",
			"## Expected behavior",
			"",
			...scenario.expected.map((item) => `- [ ] ${item}`),
			"",
			"## Agent output",
			"",
			"```text",
			(result.stdout || "(no stdout)").trim(),
			"```",
			"",
			"## Stderr",
			"",
			"```text",
			(result.stderr || "(no stderr)").trim(),
			"```",
			"",
			"## Human score",
			"",
			"- [ ] Pass",
			"- [ ] Partial",
			"- [ ] Fail",
			"- Notes:",
			"",
		].join("\n");
		await writeFile(path.join(resultsDirectory, `${scenario.id}.md`), report);
	} finally {
		await rm(workspace, { recursive: true, force: true });
		await rm(configDirectory, { recursive: true, force: true });
	}
}

if (resultsDirectory) console.log(`Results: ${resultsDirectory}`);
