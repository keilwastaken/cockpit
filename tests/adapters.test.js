import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { actionMappings, bootstrapMarker, opencodeDoctorPrompt, opencodeSetupPrompt, roles, skills } from "../scripts/adapter-definition.mjs";

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

test("OpenCode generated bootstrap uses V2 marker with oracle ownership", async () => {
  const source = await readFile(path.join(root, ".opencode/plugins/cockpit.js"), "utf8");
  const markerInSource = (source.match(/COCKPIT_BOOTSTRAP_V\d+/g) || []).length;
  assert.ok(markerInSource >= 1, "source must contain a bootstrap version marker");
  assert.doesNotMatch(source, /COCKPIT_BOOTSTRAP_V1/, "generated source must not contain V1 marker");
  assert.match(source, /COCKPIT_BOOTSTRAP_V2/, "generated source must contain V2 marker");
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const config = {};
  await hooks.config(config);
  const output = { messages: [{ info: { role: "user" }, parts: [{ type: "text", text: "hello" }] }] };
  await hooks["experimental.chat.messages.transform"]({}, output);
  const bootstrapParts = output.messages[0].parts.filter((part) => part.text.includes(bootstrapMarker));
  assert.equal(bootstrapParts.length, 1, "bootstrap must appear exactly once in injected text");
  assert.match(bootstrapParts[0].text, /the reading agent is the oracle/i);
  assert.match(bootstrapParts[0].text, /OpenCode action mapping:/);
  assert.doesNotMatch(bootstrapParts[0].text, /Harness distinctions/i);
  assert.doesNotMatch(bootstrapParts[0].text, /Pi action mapping:/);
  assert.doesNotMatch(bootstrapParts[0].text, /Claude action mapping:/);
});

test("OpenCode regex detection suppresses V1 and prevents duplicate V2 injection", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();

  // V1 conversation with exact preamble should suppress V2 injection
  const v1Preamble = "COCKPIT_BOOTSTRAP_V1\n\nYou have Cockpit skills available. The using-cockpit skill is already loaded below; do not load it again for this conversation.";
  const v1Output = { messages: [{ info: { role: "user" }, parts: [{ type: "text", text: v1Preamble }] }] };
  await hooks["experimental.chat.messages.transform"]({}, v1Output);
  assert.equal(v1Output.messages[0].parts.length, 1, "V1 preamble must suppress V2 injection");

  // V2 conversation with exact preamble should suppress duplicate V2 injection
  const v2Preamble = "COCKPIT_BOOTSTRAP_V2\n\nYou have Cockpit skills available. The using-cockpit skill is already loaded below; do not load it again for this conversation.";
  const v2Output = { messages: [{ info: { role: "user" }, parts: [{ type: "text", text: v2Preamble }] }] };
  await hooks["experimental.chat.messages.transform"]({}, v2Output);
  assert.equal(v2Output.messages[0].parts.length, 1, "existing V2 preamble must suppress duplicate V2 injection");
});

test("structural detection: valid marker with exact preamble suppresses injection", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const validBootstrap = "COCKPIT_BOOTSTRAP_V2\n\nYou have Cockpit skills available. The using-cockpit skill is already loaded below; do not load it again for this conversation.";
  const output = { messages: [{ info: { role: "user" }, parts: [{ type: "text", text: validBootstrap }] }] };
  await hooks["experimental.chat.messages.transform"]({}, output);
  assert.equal(output.messages[0].parts.length, 1, "valid bootstrap must suppress injection");
});

test("structural detection: valid V1 marker with exact preamble suppresses injection", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const v1Bootstrap = "COCKPIT_BOOTSTRAP_V1\n\nYou have Cockpit skills available. The using-cockpit skill is already loaded below; do not load it again for this conversation.";
  const output = { messages: [{ info: { role: "user" }, parts: [{ type: "text", text: v1Bootstrap }] }] };
  await hooks["experimental.chat.messages.transform"]({}, output);
  assert.equal(output.messages[0].parts.length, 1, "valid V1 bootstrap must suppress injection");
});

test("structural detection: unrelated prose with marker text does not suppress injection", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const unrelated = "The COCKPIT_BOOTSTRAP_V2 feature is great.";
  const output = { messages: [{ info: { role: "user" }, parts: [{ type: "text", text: unrelated }] }] };
  await hooks["experimental.chat.messages.transform"]({}, output);
  assert.equal(output.messages[0].parts.length, 2, "unrelated marker prose must not suppress injection");
});

test("structural detection: marker with wrong preamble does not suppress injection", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const wrongPreamble = "COCKPIT_BOOTSTRAP_V2\n\nThis is some other text that does not match the exact preamble.";
  const output = { messages: [{ info: { role: "user" }, parts: [{ type: "text", text: wrongPreamble }] }] };
  await hooks["experimental.chat.messages.transform"]({}, output);
  assert.equal(output.messages[0].parts.length, 2, "wrong preamble must not suppress injection");
});

test("structural detection: malformed marker does not suppress injection", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const malformed = "COCKPIT_BOOTSTRAP_\n\nYou have Cockpit skills available. The using-cockpit skill is already loaded below; do not load it again for this conversation.";
  const output = { messages: [{ info: { role: "user" }, parts: [{ type: "text", text: malformed }] }] };
  await hooks["experimental.chat.messages.transform"]({}, output);
  assert.equal(output.messages[0].parts.length, 2, "malformed marker must not suppress injection");
});

test("structural detection: original user part metadata is preserved byte-for-byte", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const referencePart = { type: "text", text: "hello world", extraField: "preserve" };
  const output = { messages: [{ info: { role: "user" }, parts: [referencePart] }] };
  await hooks["experimental.chat.messages.transform"]({}, output);
  assert.equal(output.messages[0].parts.length, 2);
  const originalPart = output.messages[0].parts[1];
  assert.equal(originalPart.text, "hello world");
  assert.equal(originalPart.extraField, "preserve");
  assert.equal(originalPart.type, "text");
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
  assert.deepEqual(byID.get("approved-execution"), { mode: "delegate", role: "general" });
  assert.deepEqual(byID.get("false-assumption"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("approved-planning"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("security-review-direct"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("localized-review"), { mode: "direct", role: null });
  assert.deepEqual(byID.get("structural-review"), { mode: "direct", role: null });
});

test("setup prompt preserves existing current-name agent fields and collects legacy migration choices before preview", () => {
  const prompt = opencodeSetupPrompt;
  // Must preserve existing fields on current-name agents — only update model
  assert.match(prompt, /current-name Cockpit subagents.*preserve all existing fields/);
  assert.match(prompt, /model.*value will be updated/);
  // Must handle BOTH legacy explorer and current strategist existing: three-way choice
  assert.match(prompt, /BOTH.*cockpit-explorer.*AND.*cockpit-strategist/);
  assert.match(prompt, /Keep current.*cockpit-strategist/);
  assert.match(prompt, /Replace current.*cockpit-strategist.*with legacy.*cockpit-explorer/);
  assert.match(prompt, /Retain both/);
  assert.match(prompt, /Do not silently merge/);
  // Must inspect solo legacy entries and ask before replacing
  assert.match(prompt, /only.*cockpit-explorer.*rename it to.*cockpit-strategist/);
  assert.match(prompt, /cockpit-research.*ask whether to remove/);
  assert.match(prompt, /built-in.*explore.*general.*preserve all existing fields/);
  assert.match(prompt, /Do not silently delete/);
  assert.match(prompt, /Do not silently overwrite/);
  // Must collect choices first, then show one preview with Apply/Cancel
  assert.match(prompt, /Collect all choices without modifying/);
  assert.match(prompt, /show one exact preview.*Apply configuration.*Cancel/);
  // Must not write before user selects Apply
  assert.match(prompt, /Do not write before the user selects Apply/);
});

test("OpenCode general delegations require the cockpit-execute contract", () => {
  assert.match(actionMappings.opencode.join("\n"), /Approved bounded execution delegates to built-in general and must instruct it: Load the cockpit-execute skill before acting and follow it/);
  assert.match(opencodeDoctorPrompt, /cockpit-executor.*built-in.*general/);
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
