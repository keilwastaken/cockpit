import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import cockpitPi from "../extensions/cockpit.js";
import { actionMappings, bootstrapMarker, opencodeDoctorPrompt, opencodeRoles, opencodeSetupPrompt, roles, skills } from "../scripts/adapter-definition.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fakePi(skillCommands = skills) {
  const events = new Map();
  const commands = new Map();
  const selected = [];
  const api = {
    on(name, handler) { events.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    getCommands() {
      return [
        ...[...commands.keys()].map((name) => ({ name, source: "extension" })),
        ...skillCommands.map((name) => ({ name, source: "skill" })),
      ];
    },
    async setModel(model) { selected.push(model); return true; },
  };
  cockpitPi(api);
  return { api, commands, events, selected };
}

function context(overrides = {}) {
  const notices = [];
  return {
    hasUI: true,
    model: { provider: "anthropic", id: "current" },
    modelRegistry: {
      async getAvailable() {
        return [{ provider: "anthropic", id: "next", name: "Next model" }];
      },
    },
    ui: {
      async select(_title, values) { return values[0]; },
      async confirm() { return true; },
      notify(message, level) { notices.push({ message, level }); },
    },
    notices,
    ...overrides,
  };
}

test("Pi registers setup and read-only doctor commands", async () => {
  const pi = fakePi();
  assert.deepEqual([...pi.commands.keys()], ["cockpit-setup", "cockpit-doctor"]);

  const ctx = context();
  await pi.commands.get("cockpit-doctor").handler("", ctx);
  assert.equal(pi.selected.length, 0);
  assert.match(ctx.notices[0].message, /no Cockpit subagent runtime/);
});

test("Pi doctor reports missing discovered skills", async () => {
  const pi = fakePi(skills.slice(1));
  const ctx = context();
  await pi.commands.get("cockpit-doctor").handler("", ctx);
  assert.match(ctx.notices[0].message, new RegExp(`FAIL skills: missing ${skills[0]}`));
  assert.equal(ctx.notices[0].level, "error");
});

test("Pi setup selects one active model after confirmation", async () => {
  const pi = fakePi();
  const ctx = context();
  await pi.commands.get("cockpit-setup").handler("", ctx);
  assert.equal(pi.selected.length, 1);
  assert.equal(pi.selected[0].id, "next");
  assert.match(ctx.notices.at(-1).message, /sequentially/);
});

test("Pi setup cancellation does not change the model", async () => {
  const pi = fakePi();
  const ctx = context({
    ...context(),
    ui: {
      ...context().ui,
      async confirm() { return false; },
    },
  });
  await pi.commands.get("cockpit-setup").handler("", ctx);
  assert.equal(pi.selected.length, 0);
});

test("Pi injects the bootstrap without duplicating an existing marker", async () => {
  const pi = fakePi();
  const handler = pi.events.get("before_agent_start");
  const injected = await handler({ systemPrompt: "base" });
  assert.match(injected.systemPrompt, new RegExp(bootstrapMarker));
  assert.equal(await handler({ systemPrompt: injected.systemPrompt }), undefined);
});

test("Claude plugin manifest, hook, and agents follow native contracts", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, ".claude-plugin/plugin.json"), "utf8"));
  const hooks = JSON.parse(await readFile(path.join(root, "hooks/hooks.json"), "utf8"));
  assert.equal(manifest.name, "cockpit");
  assert.equal(hooks.hooks.SessionStart[0].hooks[0].type, "command");

  const hook = hooks.hooks.SessionStart[0].hooks[0];
  assert.equal(hook.command, "node");
  const hookScript = hook.args[0].replace("${CLAUDE_PLUGIN_ROOT}", root);
  const hookOutput = JSON.parse(execFileSync(hook.command, [hookScript], { cwd: root, encoding: "utf8" }));
  assert.equal(hookOutput.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(hookOutput.hookSpecificOutput.additionalContext, new RegExp(bootstrapMarker));
  assert.match(hookOutput.hookSpecificOutput.additionalContext, /# Using Cockpit/);

  for (const role of roles) {
    const markdown = await readFile(path.join(root, "agents", `${role.name}.md`), "utf8");
    assert.match(markdown, /model: inherit/);
    assert.match(markdown, new RegExp(`cockpit:${role.skill}`));
    assert.equal(markdown.includes("disallowedTools: Write, Edit"), role.readOnly);
  }
});

test("shared adapter inventory matches canonical skills and role mappings", () => {
  assert.equal(skills.length, 11);
  assert.deepEqual(roles.map((role) => role.name), [
    "cockpit-strategist",
    "cockpit-planner",
    "cockpit-reviewer",
    "cockpit-research",
    "cockpit-executor",
  ]);
  assert.deepEqual(opencodeRoles.map((role) => role.name), [
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

function extractBootstrapFromSource(source) {
  const match = source.match(/COCKPIT_BOOTSTRAP_V1(\\n|\\")([\s\S]*?)(?=";|" })/);
  if (match) return "COCKPIT_BOOTSTRAP_V1\n" + match[2].replaceAll("\\n", "\n").replaceAll('\\"', '"');
  return null;
}

test("OpenCode generated bootstrap contains exactly one marker and oracle ownership", async () => {
  const source = await readFile(path.join(root, ".opencode/plugins/cockpit.js"), "utf8");
  const markerInSource = (source.match(/COCKPIT_BOOTSTRAP_V1/g) || []).length;
  assert.ok(markerInSource >= 1);
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

test("Pi generated bootstrap contains marker, oracle, and only its own mapping", async () => {
  const source = await readFile(path.join(root, "extensions/cockpit.js"), "utf8");
  const match = source.match(/const bootstrap = "(COCKPIT_BOOTSTRAP_V1[\s\S]*?)";/);
  assert.ok(match, "Pi extension must contain bootstrap string");
  const bootstrap = match[1].replaceAll("\\n", "\n").replaceAll('\\"', '"');
  assert.match(bootstrap, /the reading agent is the oracle/i);
  assert.match(bootstrap, /Pi action mapping:/);
  assert.doesNotMatch(bootstrap, /Harness distinctions/i);
  assert.doesNotMatch(bootstrap, /OpenCode action mapping:/);
  assert.doesNotMatch(bootstrap, /Claude action mapping:/);
});

test("Claude generated bootstrap contains marker, oracle, and only its own mapping", async () => {
  const source = await readFile(path.join(root, "hooks/session-start.mjs"), "utf8");
  const parsed = JSON.parse(source.match(/const output = ({.*?});/s)[1]);
  const context = parsed.hookSpecificOutput.additionalContext;
  assert.ok(context.includes(bootstrapMarker), "Claude bootstrap must contain marker");
  assert.match(context, /the reading agent is the oracle/i);
  assert.match(context, /Claude action mapping:/);
  assert.doesNotMatch(context, /Harness distinctions/i);
  assert.doesNotMatch(context, /OpenCode action mapping:/);
  assert.doesNotMatch(context, /Pi action mapping:/);
});

test("strategist and OpenCode explore inventory preserved", () => {
  assert.ok(roles.some((role) => role.name === "cockpit-strategist"));
  assert.ok(opencodeRoles.every((role) => role.name !== "cockpit-research"));
  assert.ok(opencodeRoles.every((role) => role.name !== "cockpit-executor"));
  assert.equal(opencodeRoles.length, 3);
});

test("package contains every native adapter", () => {
	const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	const paths = new Set(JSON.parse(result.stdout)[0].files.map((file) => file.path));
	for (const required of [
		".claude-plugin/plugin.json",
		".opencode/plugins/cockpit.js",
		"extensions/cockpit.js",
		"hooks/hooks.json",
		"hooks/session-start.mjs",
		"evals/scenarios.json",
		"evals/fixture/package.json",
		"evals/cost/fixture/package.json",
		"evals/cost/scorecards/v1.0.0.md",
		"scripts/run-cost-benchmark.mjs",
	]) assert.ok(paths.has(required), `package is missing ${required}`);
	assert.ok([...paths].every((file) => !file.startsWith("evals/results/")), "package must exclude raw evaluation results");
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
	assert.deepEqual(byID.get("approved-planning"), { mode: "direct", role: null });
	assert.deepEqual(byID.get("security-review-direct"), { mode: "direct", role: null });
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
	assert.match(actionMappings.opencode.join("\n"), /Every execution delegation to general must instruct it: Load the cockpit-execute skill before acting and follow it/);
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
	assert.match(runner, /opencodeRoles/);
	assert.match(runner, /agent\.explore/);
	assert.match(runner, /agent\.general/);
	assert.match(runner, /cockpit.research.*subagent/);
	assert.match(runner, /cockpit.executor.*subagent/);
	assert.doesNotMatch(runner, /subAgents|readUserOpenCodeConfig|OPENCODE_DISABLE_PROJECT_CONFIG|\.config["',]/);
});

test("role descriptions distinguish reasoning-sensitive and hands work", () => {
	for (const role of roles) {
		assert.match(role.description, /do not use/i, `${role.name}: description missing "do not use"`);
		assert.match(role.description, ["cockpit-research", "cockpit-executor"].includes(role.name) ? /hands work/i : /reasoning-sensitive/i);
	}
});

test("opencodeRoles excludes cockpit-research and cockpit-executor", () => {
	assert.ok(opencodeRoles.every((role) => role.name !== "cockpit-research" && role.name !== "cockpit-executor"));
	assert.equal(opencodeRoles.length, 3);
});

test("role permissions are correctly set", () => {
	const readOnlyRoles = ["cockpit-strategist", "cockpit-planner", "cockpit-reviewer", "cockpit-research"];
	for (const role of roles) {
		if (readOnlyRoles.includes(role.name)) {
			assert.equal(role.readOnly, true, `${role.name} should be read-only`);
		} else if (role.name === "cockpit-executor") {
			assert.equal(role.readOnly, false, "cockpit-executor should have write permission");
		}
	}
});

test("every role maps to a registered skill", () => {
	for (const role of roles) {
		assert.ok(skills.includes(role.skill), `${role.name}: skill ${role.skill} not in skills list`);
	}
});
