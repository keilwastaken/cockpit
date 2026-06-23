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

test("user-facing command uses handoff terminology and canonical flow names", async () => {
  const index = await readFile(new URL("extensions/conductor/index.ts", root), "utf8");
  assert.match(index, /\/conductor handoff \[instant\|rapid\|verified\|deep\]/);
  for (const flow of ["instant", "rapid", "verified", "deep"]) {
    assert.match(index, new RegExp(`Type\\.Literal\\("${flow}"\\)`));
  }
  assert.doesNotMatch(index, /normalizeTier/);
  assert.doesNotMatch(index, /\/conductor packet/);
});

test("behavior-aligned prompt files are exposed", async () => {
  for (const file of ["instant-linear.md", "rapid-linear.md", "verified-orchestrated.md", "deep-orchestrated.md"]) {
    const content = await readFile(new URL(`prompts/${file}`, root), "utf8");
    assert.match(content, /Execution Profile/);
  }
});
