#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, validateCompleteMatrix, validateManifest, validateResult, validateRunID, writeJsonExclusiveAtomic } from "./cost-benchmark-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage = "Usage: npm run benchmark:prepare-review -- RUN_ID --packet PATH --mapping PATH --scores PATH";
const args = process.argv.slice(2);
if (args.includes("--help")) { console.log(usage); process.exit(0); }
const runID = args.shift();
if (!runID || validateRunID(runID)) throw new Error(usage);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
	const flag = args[index];
	const value = args[index + 1];
	if (!["--packet", "--mapping", "--scores"].includes(flag) || !value || value.startsWith("--") || options.has(flag)) throw new Error(usage);
	options.set(flag, path.resolve(value));
}
if (["--packet", "--mapping", "--scores"].some((flag) => !options.has(flag))) throw new Error(usage);
if (new Set(options.values()).size !== 3) throw new Error("packet, mapping, and scores must use different paths");

function redact(value, replacements, identifiers) {
	if (Array.isArray(value)) return value.map((item) => redact(item, replacements, identifiers));
	if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, replacements, identifiers)]));
	if (typeof value !== "string") return value;
	let redacted = value;
	for (const [actual, placeholder] of replacements) if (actual) redacted = redacted.replaceAll(actual, placeholder);
	redacted = redacted.replaceAll(/ses_[A-Za-z0-9_-]+/g, "<SESSION_ID>");
	redacted = redacted.replaceAll(/\/private\/var\/folders\/[A-Za-z0-9_./-]+/g, "<TEMP_PATH>");
	for (const identifier of identifiers) redacted = redacted.replace(new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<TREATMENT_REDACTED>");
	return redacted;
}

const runDirectory = path.join(root, "evals/results/cost", runID);
const manifest = JSON.parse(await readFile(path.join(runDirectory, "manifest.json"), "utf8"));
const invalidManifest = validateManifest(manifest);
if (invalidManifest) throw new Error(invalidManifest);
const scenarios = JSON.parse(await readFile(path.join(root, "evals/cost/scenarios.json"), "utf8"));
const invalidMatrix = validateCompleteMatrix(manifest, scenarios.map((scenario) => scenario.id));
if (invalidMatrix) throw new Error(invalidMatrix);
const scenarioByID = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
const replacements = [[root, "<PROJECT_ROOT>"], [os.homedir(), "<HOME>"]];
const identifiers = [...manifest.arms, ...Object.values(manifest.models), ...Object.values(manifest.models).flatMap((value) => value.split("/")), "cockpit"];
const records = [];
const items = [];
for (const job of manifest.jobs) {
	const result = JSON.parse(await readFile(path.join(runDirectory, job.scenario, job.arm, `${job.repetition}.json`), "utf8"));
	const invalid = validateResult(result, manifest, job);
	if (invalid) throw new Error(`${job.key}: ${invalid}`);
	const scenario = scenarioByID.get(job.scenario);
	if (!scenario) throw new Error(`unknown scenario in manifest: ${job.scenario}`);
	const blindID = `blind-${sha256(`${manifest.manifestHash}:${job.jobID}`).slice(0, 16)}`;
	records.push(redact({
		blindID,
		scenario: scenario.name,
		prompt: scenario.prompt,
		rubric: scenario.manualRubric,
		output: result.output,
		artifacts: result.artifacts,
		commandEvidence: result.commandResults.map((entry) => ({ command: entry.command, status: entry.status, stdout: entry.stdout, stderr: entry.stderr })),
	}, replacements, identifiers));
	items.push({ blindID, jobID: job.jobID });
}
records.sort((left, right) => left.blindID.localeCompare(right.blindID));
items.sort((left, right) => left.blindID.localeCompare(right.blindID));
const packet = {
	schemaVersion: 1,
	instructions: "Score each rubric dimension from 1 (poor) to 5 (excellent). Review only this packet; do not inspect benchmark results or the mapping.",
	records,
};
const packetHash = sha256(packet);
const mapping = { schemaVersion: 1, runID, manifestHash: manifest.manifestHash, packetHash, items };
const scores = {
	schemaVersion: 1,
	manifestHash: manifest.manifestHash,
	packetHash,
	scores: records.map((record) => ({ blindID: record.blindID, dimensions: Object.fromEntries(record.rubric.map((name) => [name, null])), notes: "" })),
};
const serializedPacket = JSON.stringify(packet).toLowerCase();
const leaked = identifiers.find((identifier) => serializedPacket.includes(identifier.toLowerCase()));
if (leaked) throw new Error(`blind packet contains treatment identifier after redaction: ${leaked}`);
await writeJsonExclusiveAtomic(options.get("--packet"), packet);
await writeJsonExclusiveAtomic(options.get("--mapping"), mapping);
await writeJsonExclusiveAtomic(options.get("--scores"), scores);
console.log(`Prepared ${records.length} blind records. Keep the mapping separate and delete private review artifacts within seven days of validation.`);
