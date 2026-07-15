import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenarios = JSON.parse(await readFile(path.join(root, "evals/scenarios.json"), "utf8"));
const args = process.argv.slice(2);

function value(flag) {
	const index = args.indexOf(flag);
	return index >= 0 ? args[index + 1] : undefined;
}

const model = value("--model");
const selectedID = value("--scenario");
const dryRun = args.includes("--dry-run");
const selected = selectedID ? scenarios.filter((scenario) => scenario.id === selectedID) : scenarios;

if (selectedID && selected.length === 0) {
	console.error(`Unknown scenario: ${selectedID}`);
	process.exit(1);
}

if (!model || args.includes("--help")) {
	console.log("Usage: npm run eval -- --model <provider/model> [--scenario <id>] [--dry-run]");
	console.log("\nScenarios:");
	for (const scenario of scenarios) console.log(`  ${scenario.id.padEnd(22)} ${scenario.name}`);
	process.exit(model ? 0 : 0);
}

const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const resultsDirectory = path.join(root, "evals/results", `${timestamp}-${model.replaceAll("/", "-")}`);
await mkdir(resultsDirectory, { recursive: true });

function run(command, commandArgs, cwd) {
	return spawnSync(command, commandArgs, {
		cwd,
		encoding: "utf8",
		timeout: 10 * 60 * 1000,
		maxBuffer: 10 * 1024 * 1024,
	});
}

for (const scenario of selected) {
	if (dryRun) {
		console.log(`\n[${scenario.id}] ${scenario.prompt}`);
		continue;
	}

	const workspace = await mkdtemp(path.join(os.tmpdir(), `cockpit-eval-${scenario.id}-`));
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

		console.log(`Running ${scenario.id} with ${model}...`);
		const result = run("opencode", ["run", "-m", model, scenario.prompt], workspace);
		const status = result.error ? `runner error: ${result.error.message}` : `exit ${result.status}`;
		const report = [
			`# ${scenario.name}`,
			"",
			`- Scenario: \`${scenario.id}\``,
			`- Model: \`${model}\``,
			`- Runner: ${status}`,
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
	}
}

if (!dryRun) console.log(`Results: ${resultsDirectory}`);
