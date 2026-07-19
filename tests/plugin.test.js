import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("plugin registers one idempotent skill path and nothing else", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const config = { model: "provider/model" };
  await hooks.config(config);
  await hooks.config(config);
  assert.equal(config.skills.paths.length, 1);
  assert.match(config.skills.paths[0], /\/skills$/);
  assert.deepEqual(Object.keys(config).sort(), ["model", "skills"]);
  assert.equal(config.model, "provider/model");
  assert.equal(Object.keys(hooks).length, 1);
});

test("package contains only the Lite runtime surface", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const paths = JSON.parse(result.stdout)[0].files.map((file) => file.path).sort();
  const expected = [
    ".opencode/plugins/cockpit.js",
    "LICENSE",
    "README.md",
    "package.json",
    "skills/cockpit-capture/SKILL.md",
    "skills/cockpit-execute/SKILL.md",
    "skills/cockpit-parallel/SKILL.md",
    "skills/cockpit-plan/SKILL.md",
    "skills/cockpit-research/SKILL.md",
    "skills/cockpit-review-response/SKILL.md",
    "skills/cockpit-review/SKILL.md",
    "skills/cockpit-strategy/SKILL.md",
    "skills/cockpit-verify/SKILL.md",
  ].sort();
  assert.deepEqual(paths, expected);
});
