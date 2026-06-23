import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("package exposes pi resources", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.deepEqual(pkg.pi.extensions, ["./extensions"]);
  assert.deepEqual(pkg.pi.skills, ["./skills"]);
  assert.deepEqual(pkg.pi.prompts, ["./prompts"]);
});

test("user-facing command uses handoff terminology", async () => {
  const index = await readFile(new URL("extensions/conductor/index.ts", root), "utf8");
  assert.match(index, /\/conductor handoff/);
  assert.doesNotMatch(index, /\/conductor packet/);
});
