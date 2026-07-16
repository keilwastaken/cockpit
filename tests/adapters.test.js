import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import cockpitPi from "../extensions/cockpit.js";
import { bootstrapMarker, roles, skills } from "../scripts/adapter-definition.mjs";

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
    "cockpit-explorer",
    "cockpit-planner",
    "cockpit-reviewer",
    "cockpit-research",
    "cockpit-executor",
  ]);
  assert.ok(roles.every((role) => skills.includes(role.skill)));
});

test("generated adapters are fresh", () => {
  const result = spawnSync("node", ["scripts/generate-adapters.mjs", "--check"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
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
  ]) assert.ok(paths.has(required), `package is missing ${required}`);
});
