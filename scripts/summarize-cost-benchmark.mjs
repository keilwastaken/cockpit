#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { median, sha256, stableStringify, validateCompleteMatrix, validateManifest, validateResult, validateRunID, writeFileExclusiveAtomic } from "./cost-benchmark-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage = "Usage: npm run benchmark:summary -- --run-id ID --scores PATH --mapping PATH --output PATH";
const args = process.argv.slice(2);
if (args.includes("--help")) { console.log(usage); process.exit(0); }
const known = new Set(["--run-id", "--scores", "--mapping", "--output"]);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
	const flag = args[index];
	const value = args[index + 1];
	if (!known.has(flag) || !value || value.startsWith("--") || options.has(flag)) throw new Error(usage);
	options.set(flag, value);
}
if ([...known].some((flag) => !options.has(flag))) throw new Error(usage);
const runID = options.get("--run-id");
if (validateRunID(runID)) throw new Error("invalid run ID");

const runDirectory = path.join(root, "evals/results/cost", runID);
const manifest = JSON.parse(await readFile(path.join(runDirectory, "manifest.json"), "utf8"));
const invalidManifest = validateManifest(manifest);
if (invalidManifest) throw new Error(invalidManifest);
const scenarios = JSON.parse(await readFile(path.join(root, "evals/cost/scenarios.json"), "utf8"));
const invalidMatrix = validateCompleteMatrix(manifest, scenarios.map((scenario) => scenario.id));
if (invalidMatrix) throw new Error(invalidMatrix);
const mapping = JSON.parse(await readFile(path.resolve(options.get("--mapping")), "utf8"));
const scores = JSON.parse(await readFile(path.resolve(options.get("--scores")), "utf8"));
if (mapping.manifestHash !== manifest.manifestHash || scores.manifestHash !== manifest.manifestHash || mapping.packetHash !== scores.packetHash) throw new Error("review artifacts do not match the manifest");
if (!Array.isArray(mapping.items) || !Array.isArray(scores.scores) || mapping.items.length !== 24 || scores.scores.length !== 24) throw new Error("blind review is incomplete");
const mappingByJob = new Map(mapping.items.map((item) => [item.jobID, item.blindID]));
const scoreByBlindID = new Map(scores.scores.map((score) => [score.blindID, score]));
const mappingBlindIDs = mapping.items.map((item) => item.blindID);
const manifestJobIDs = manifest.jobs.map((job) => job.jobID).sort();
if (mapping.schemaVersion !== 1 || scores.schemaVersion !== 1 || mapping.runID !== runID || mappingByJob.size !== 24 || scoreByBlindID.size !== 24 || new Set(mappingBlindIDs).size !== 24) throw new Error("blind review contains duplicate or invalid identifiers");
if (stableStringify([...mappingByJob.keys()].sort()) !== stableStringify(manifestJobIDs) || stableStringify([...mappingBlindIDs].sort()) !== stableStringify([...scoreByBlindID.keys()].sort())) throw new Error("blind review identifier sets do not match");
const scenarioByID = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

const results = [];
for (const job of manifest.jobs) {
	const result = JSON.parse(await readFile(path.join(runDirectory, job.scenario, job.arm, `${job.repetition}.json`), "utf8"));
	const invalid = validateResult(result, manifest, job);
	if (invalid) throw new Error(`${job.key}: ${invalid}`);
	const score = scoreByBlindID.get(mappingByJob.get(job.jobID));
	const expectedDimensions = scenarioByID.get(job.scenario)?.manualRubric ?? [];
	if (!score || JSON.stringify(Object.keys(score.dimensions).sort()) !== JSON.stringify([...expectedDimensions].sort())) throw new Error(`${job.key}: rubric dimensions do not match the scenario`);
	const values = Object.values(score.dimensions);
	if (!values.length || values.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) throw new Error(`${job.key}: rubric dimensions must be integers from 1 to 5`);
	results.push({ ...result, manualScore: values.reduce((sum, value) => sum + value, 0) / values.length * 20 });
}

const arms = ["control", "isolation", "role-split"];
const scenarioIDs = [...new Set(results.map((result) => result.scenario))].sort();
function metrics(selected) {
	if (!selected.length) throw new Error("summary matrix is incomplete");
	return {
		critical: selected.filter((result) => result.critical.pass).length / selected.length * 100,
		manual: median(selected.map((result) => result.manualScore)),
		reasoning: median(selected.map((result) => result.telemetry.reasoningModelTokens)),
		hands: median(selected.map((result) => result.telemetry.handsModelTokens)),
		total: median(selected.map((result) => result.telemetry.totalTokens)),
		cacheRead: median(selected.map((result) => result.telemetry.cacheRead)),
		cacheWrite: median(selected.map((result) => result.telemetry.cacheWrite)),
		peak: median(selected.map((result) => result.telemetry.peakParentContext)),
		delegations: median(selected.map((result) => result.telemetry.delegationCount)),
		time: median(selected.map((result) => result.durationMs)) / 1000,
		cost: median(selected.map((result) => result.telemetry.cost)),
	};
}
function tokenTotals(selected) {
	return {
		reasoning: selected.reduce((sum, result) => sum + result.telemetry.reasoningModelTokens, 0),
		hands: selected.reduce((sum, result) => sum + result.telemetry.handsModelTokens, 0),
		total: selected.reduce((sum, result) => sum + result.telemetry.totalTokens, 0),
		cacheRead: selected.reduce((sum, result) => sum + result.telemetry.cacheRead, 0),
		cacheWrite: selected.reduce((sum, result) => sum + result.telemetry.cacheWrite, 0),
	};
}
function delta(candidate, control) {
	if (control === 0) return candidate === 0 ? "0.0%" : "n/a";
	const value = (candidate - control) / control * 100;
	return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const lines = [
	"# Cockpit Cost Benchmark",
	"",
	`- Run: \`${runID}\``,
	`- Manifest: \`${manifest.manifestHash}\``,
	`- Commit: \`${manifest.provenance.gitHead}\``,
	`- Working tree: \`${manifest.provenance.workingTreeHash}\``,
	`- Benchmark sources: \`${manifest.provenance.benchmarkSourceHash}\``,
	`- Node: \`${manifest.provenance.nodeVersion}\``,
	`- OpenCode: \`${manifest.provenance.openCodeVersion}\``,
	`- Models: \`${manifest.models.reasoning}\` reasoning, \`${manifest.models.hands}\` hands`,
	"- Matrix: four scenarios, three interleaved arms, two repetitions",
	"",
	"## Overall",
	"",
	"| Arm | Critical Pass | Blind Quality | Reasoning Processed | Hands Processed | Total Processed | Cache Reads | Cache Writes | Peak Parent | Delegations | Time (s) | Observed Cost |",
	"|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
];
for (const arm of arms) {
	const value = metrics(results.filter((result) => result.arm === arm));
	lines.push(`| ${arm} | ${value.critical.toFixed(0)}% | ${value.manual.toFixed(1)} | ${Math.round(value.reasoning)} | ${Math.round(value.hands)} | ${Math.round(value.total)} | ${value.cacheRead.toFixed(1)} | ${value.cacheWrite.toFixed(1)} | ${Math.round(value.peak)} | ${value.delegations.toFixed(1)} | ${value.time.toFixed(1)} | $${value.cost.toFixed(4)} |`);
}
lines.push("", "## Matrix Token Totals", "", "| Arm | Reasoning Tokens | Hands Tokens | Total Tokens | Cache Reads | Cache Writes | Reasoning Share | Hands Share |", "|---|---:|---:|---:|---:|---:|---:|---:|");
for (const arm of arms) {
	const value = tokenTotals(results.filter((result) => result.arm === arm));
	lines.push(`| ${arm} | ${value.reasoning} | ${value.hands} | ${value.total} | ${value.cacheRead} | ${value.cacheWrite} | ${(value.reasoning / value.total * 100).toFixed(1)}% | ${(value.hands / value.total * 100).toFixed(1)}% |`);
}
lines.push("", "Estimated model cost can be calculated as `(reasoning tokens × reasoning rate) + (hands tokens × hands rate)`. Provider-reported cost remains observational.");
lines.push("", "## Scenario Results", "", "| Scenario | Arm | Critical Pass | Blind Quality | Reasoning | Hands | Total | Cache Reads | Cache Writes | Peak Parent | Time (s) |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const scenario of scenarioIDs) for (const arm of arms) {
	const value = metrics(results.filter((result) => result.scenario === scenario && result.arm === arm));
	lines.push(`| ${scenario} | ${arm} | ${value.critical.toFixed(0)}% | ${value.manual.toFixed(1)} | ${Math.round(value.reasoning)} | ${Math.round(value.hands)} | ${Math.round(value.total)} | ${value.cacheRead.toFixed(1)} | ${value.cacheWrite.toFixed(1)} | ${Math.round(value.peak)} | ${value.time.toFixed(1)} |`);
}
lines.push("", "## Role-Split Delta", "", "| Scenario | Supported | Quality Delta | Reasoning | Hands Used | Total | Peak Parent | Time |", "|---|---|---:|---:|---:|---:|---:|---:|");
for (const scenario of scenarioIDs) {
	const control = metrics(results.filter((result) => result.scenario === scenario && result.arm === "control"));
	const candidate = metrics(results.filter((result) => result.scenario === scenario && result.arm === "role-split"));
	const supported = control.critical === 100 && candidate.critical === 100 && candidate.manual >= control.manual;
	lines.push(`| ${scenario} | ${supported ? "yes" : "no"} | ${(candidate.manual - control.manual).toFixed(1)} | ${delta(candidate.reasoning, control.reasoning)} | ${Math.round(candidate.hands)} | ${delta(candidate.total, control.total)} | ${delta(candidate.peak, control.peak)} | ${delta(candidate.time, control.time)} |`);
}
lines.push("", "### Cache observations", "", "Cache-read and cache-write values are raw provider-normalized counters reported through OpenCode. Provider semantics can differ. A value of zero is ambiguous — it may mean caching was unavailable, unused, or unreported. These observations do not prove that the prompt layout caused cache reuse, and they do not prove semantic non-duplication.", "", "Provider-reported cost is observational, not a billing guarantee. Results describe this bounded matrix only and are not a general causal estimate.", "");
const markdown = lines.join("\n");
const outputPath = path.resolve(options.get("--output"));
await writeFileExclusiveAtomic(outputPath, markdown);
console.log(`Published validated summary: ${outputPath} (${sha256(markdown).slice(0, 12)})`);
