import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { opencodeDoctorPrompt, opencodeSetupPrompt, roles, skills } from "../scripts/adapter-definition.mjs";

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

test("scenario metadata defines routing expectations", async () => {
  const scenarios = JSON.parse(await readFile(path.join(root, "evals/scenarios.json"), "utf8"));
  const byID = new Map(scenarios.map((scenario) => [scenario.id, scenario.route]));
  const categories = new Set();
  for (const scenario of scenarios) {
    assert.ok(scenario.id, `scenario missing id`);
    assert.ok(scenario.name, `scenario ${scenario.id} missing name`);
    assert.ok(scenario.category, `scenario ${scenario.id} missing category`);
    assert.ok(scenario.prompt, `scenario ${scenario.id} missing prompt`);
    assert.ok(Array.isArray(scenario.expected) && scenario.expected.length > 0,
      `scenario ${scenario.id} missing expected behaviors`);
    assert.ok(["direct", "delegate"].includes(scenario.route?.mode), `scenario ${scenario.id} has invalid route mode`);
    if (scenario.route.mode === "delegate") assert.ok(roles.some((role) => role.name === scenario.route.role) || ["explore", "general"].includes(scenario.route.role), `scenario ${scenario.id} has unknown route role`);
    else assert.equal(scenario.route.role, null, `direct scenario ${scenario.id} must not name a role`);
    categories.add(scenario.category);
  }
  // Verify coverage of key workflow categories
  for (const category of ["direct", "exploration", "planning", "research", "execution", "review", "verification"]) {
    assert.ok(categories.has(category), `missing scenarios for category: ${category}`);
  }
  assert.deepEqual(byID.get("tiny-direct"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("ambiguous-feature"), { mode: "delegate", role: "cockpit-strategist" });
  // OpenCode research delegates to built-in explore, not a Cockpit subagent
  assert.deepEqual(byID.get("read-only-research"), { mode: "delegate", role: "explore" });
  assert.deepEqual(byID.get("approved-execution"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("false-assumption"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("approved-planning"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("security-review-direct"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("localized-review"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("structural-review"), { mode: "direct", role: null });
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

test("setup prompt forbids Scout configuration", () => {
  assert.match(opencodeSetupPrompt, /Scout configuration/);
});

test("behavioral eval uses a standalone native OpenCode configuration", async () => {
  const runner = await readFile(path.join(root, "scripts/run-behavioral-evals.mjs"), "utf8");
  assert.match(runner, /OPENCODE_CONFIG_DIR/);
  assert.match(runner, /PWD: workspace/);
  assert.match(runner, /OPENCODE_DISABLE_CLAUDE_CODE/);
  assert.match(runner, /XDG_CONFIG_HOME/);
  assert.match(runner, /\["debug", "config"\]/);
  assert.match(runner, /unexpected plugins/);
  assert.match(runner, /\.opencode\/plugins\/cockpit\.js/);
  assert.match(runner, /agent\.explore/);
  assert.match(runner, /agent\.general/);
  assert.match(runner, /cockpit.research.*subagent/);
  assert.match(runner, /cockpit.executor.*subagent/);
  assert.doesNotMatch(runner, /subAgents|readUserOpenCodeConfig|OPENCODE_DISABLE_PROJECT_CONFIG|\.config["',]/);
});

test("behavioral eval CLI loads after role inventory changes", () => {
  const result = spawnSync(process.execPath, ["scripts/run-behavioral-evals.mjs", "--model", "openai/test", "--dry-run"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /tiny-direct/);
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
