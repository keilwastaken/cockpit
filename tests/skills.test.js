import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, "skills");

function frontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "skill must start with YAML frontmatter");
  return new Map(match[1].split("\n").map((line) => {
    const separator = line.indexOf(":");
    assert.ok(separator > 0, `invalid frontmatter line: ${line}`);
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
}

async function inventory() {
  return (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test("skills have valid unique metadata", async () => {
  const entries = await inventory();
  assert.equal(entries.length, 9);
  const names = new Set();
  for (const directory of entries) {
    const markdown = await readFile(path.join(skillsRoot, directory, "SKILL.md"), "utf8");
    const metadata = frontmatter(markdown);
    assert.equal(metadata.get("name"), directory);
    assert.match(metadata.get("description") ?? "", /^Use (at|after|before|immediately|when)/);
    assert.match(directory, /^cockpit-[a-z-]+$/);
    assert.equal(names.has(directory), false);
    names.add(directory);
  }
});

test("skill references resolve", async () => {
  const entries = await inventory();
  const known = new Set(entries);
  for (const directory of entries) {
    const markdown = await readFile(path.join(skillsRoot, directory, "SKILL.md"), "utf8");
    for (const match of markdown.matchAll(/`(cockpit(?:-[a-z]+)+)`/g)) {
      assert.ok(known.has(match[1]), `${directory} references unknown skill ${match[1]}`);
    }
  }
});
