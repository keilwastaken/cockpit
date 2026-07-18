import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { opencodeDoctorPrompt, opencodeRunPrompt, opencodeSetupPrompt, roles, skills } from "../scripts/adapter-definition.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("shared adapter inventory matches canonical skills and role mappings", () => {
  assert.equal(skills.length, 11);
  assert.deepEqual(roles.map((role) => role.name), [
    "cockpit-strategist",
    "cockpit-planner",
    "cockpit-reviewer",
  ]);
  assert.ok(roles.every((role) => skills.includes(role.skill)));
});

test("generated adapters are fresh", () => {
  const result = spawnSync("node", ["scripts/generate-adapters.mjs", "--check"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("OpenCode plugin does not inject an always-on bootstrap", async () => {
  const source = await readFile(path.join(root, ".opencode/plugins/cockpit.js"), "utf8");
  assert.doesNotMatch(source, /COCKPIT_BOOTSTRAP/);
  assert.doesNotMatch(source, /experimental\.chat\.messages\.transform/);
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  assert.equal(hooks["experimental.chat.messages.transform"], undefined);
});

test("OpenCode generated plugin has no Pi or Claude references in action mapping", async () => {
  const source = await readFile(path.join(root, ".opencode/plugins/cockpit.js"), "utf8");
  assert.doesNotMatch(source, /Pi action mapping:/);
  assert.doesNotMatch(source, /Claude action mapping:/);
});

test("strategist and OpenCode explore inventory preserved", () => {
  assert.ok(roles.some((role) => role.name === "cockpit-strategist"));
  assert.equal(roles.length, 3);
});

test("package contains OpenCode plugin, evals, scripts, skills, and scorecards", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const paths = new Set(JSON.parse(result.stdout)[0].files.map((file) => file.path));
  for (const required of [
    ".opencode/plugins/cockpit.js",
    "evals/scenarios.json",
    "evals/fixture/package.json",
    "evals/cost/fixture/package.json",
    "evals/cost/scorecards/v1.0.0.md",
    "scripts/run-cost-benchmark.mjs",
  ]) assert.ok(paths.has(required), `package is missing ${required}`);
  assert.ok([...paths].every((file) => !file.startsWith("evals/results/")), "package must exclude raw evaluation results");
  // No retired host prefixes in the packed output
  for (const retired of [".claude-plugin/", "agents/", "commands/", "extensions/", "hooks/"]) {
    assert.ok([...paths].every((file) => !file.startsWith(retired)), `package must not contain ${retired}`);
  }
});

test("package does not contain retired host paths", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const paths = JSON.parse(result.stdout)[0].files.map((file) => file.path);
  for (const retiredPrefix of [".claude-plugin/", "agents/", "commands/", "extensions/", "hooks/"]) {
    assert.ok(paths.every((p) => !p.startsWith(retiredPrefix)), `packed output contains ${retiredPrefix}`);
  }
});

test("behavioral scenario inventory integrates with the runner", async () => {
  const scenarios = JSON.parse(await readFile(path.join(root, "evals/scenarios.json"), "utf8"));
  assert.deepEqual(scenarios.map((scenario) => scenario.id), ["ordinary-native", "single-contract", "parallel-contract", "false-assumption-contract", "scope-pressure", "consequential-ambiguity", "worker-unavailable", "security-review", "failed-verification"]);
  const result = spawnSync(process.execPath, ["scripts/run-behavioral-evals.mjs", "--parent-model", "openai/test", "--scenario", "ordinary-native", "--dry-run"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ordinary-native/);
});

test("setup prompt configures explicit worker without overriding native general", () => {
  const prompt = opencodeSetupPrompt;
  assert.match(prompt, /cockpit-worker.*preserve existing model, description, explicit disablement, and unrelated safe custom fields/i);
  assert.match(prompt, /Do not modify built-in general/i);
  assert.match(prompt, /cockpit-executor.*cockpit-reviewer.*preserve or remove each legacy definition/i);
  assert.match(prompt, /Collect all choices without modifying/);
  assert.match(prompt, /Show one exact preview[\s\S]*Apply configuration[\s\S]*Cancel/);
  assert.match(prompt, /Do not write before the user selects Apply/);
});

test("doctor checks the subagent worker and absence of automatic injection", () => {
  assert.match(opencodeDoctorPrompt, /cockpit-worker is an enabled subagent/i);
  assert.match(opencodeDoctorPrompt, /no chat-message transform/i);
  assert.match(opencodeDoctorPrompt, /cockpit-contract and cockpit-run both use build with subtask false/i);
  assert.match(opencodeDoctorPrompt, /required prompt behavior.*FAIL/i);
  assert.match(opencodeDoctorPrompt, /FAIL, not WARN/i);
});

test("run prompt requires parent preflight before worker dispatch", () => {
  assert.match(opencodeRunPrompt, /Before dispatching, validate the contract and its stop conditions yourself/i);
  assert.match(opencodeRunPrompt, /every Required Change fits within Allowed Files/i);
  assert.match(opencodeRunPrompt, /required paths and APIs exist/i);
  assert.match(opencodeRunPrompt, /stop without dispatching or editing/i);
});

test("setup prompt forbids Scout configuration", () => {
  assert.match(opencodeSetupPrompt, /Scout configuration/);
});

test("role descriptions distinguish reasoning-sensitive work", () => {
  for (const role of roles) {
    assert.match(role.description, /do not use/i, `${role.name}: description missing "do not use"`);
    assert.match(role.description, /reasoning-sensitive/i);
  }
});

test("role permissions are correctly set", () => {
  const readOnlyRoles = ["cockpit-strategist", "cockpit-planner", "cockpit-reviewer"];
  for (const role of roles) {
    if (readOnlyRoles.includes(role.name)) {
      assert.equal(role.readOnly, true, `${role.name} should be read-only`);
    }
  }
});

test("every role maps to a registered skill", () => {
  for (const role of roles) {
    assert.ok(skills.includes(role.skill), `${role.name}: skill ${role.skill} not in skills list`);
  }
});
