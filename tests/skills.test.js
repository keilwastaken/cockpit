import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { skills as expectedSkills } from "../scripts/adapter-definition.mjs";

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

test("canonical skills have valid, unique, namespaced metadata", async () => {
	const entries = (await readdir(skillsRoot, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	assert.deepEqual(entries, expectedSkills);

	const names = new Set();
	for (const directory of entries) {
		const markdown = await readFile(path.join(skillsRoot, directory, "SKILL.md"), "utf8");
		const metadata = frontmatter(markdown);
		assert.equal(metadata.get("name"), directory);
		assert.match(metadata.get("description") ?? "", /^Use (at|after|before|immediately|when)/);
		assert.ok(directory === "using-cockpit" || directory.startsWith("cockpit-"));
		assert.ok(!names.has(directory), `duplicate skill name: ${directory}`);
		names.add(directory);
	}
});

test("skill references resolve to canonical skill IDs", async () => {
	const canonical = new Set(expectedSkills);
	for (const directory of expectedSkills) {
		const markdown = await readFile(path.join(skillsRoot, directory, "SKILL.md"), "utf8");
		for (const match of markdown.matchAll(/`((?:using-)?cockpit(?:-[a-z]+)+)`/g)) {
			assert.ok(canonical.has(match[1]), `${directory} references unknown skill ${match[1]}`);
		}
	}
});

test("using-cockpit contains orchestration-free policy statement", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.match(content, /orchestration-free/i);
	assert.match(content, /no route engine/i);
	assert.match(content, /no.*dispatch/i);
	assert.match(content, /no.*queue/i);
	assert.match(content, /no.*retry/i);
});

test("using-cockpit identifies the reading agent as the oracle", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.match(content, /oracle/i);
	assert.match(content, /reading agent/i);
	assert.match(content, /selects the shortest safe workflow/i);
	assert.match(content, /retains consequential decisions/i);
	assert.match(content, /certifies completion/i);
});

test("using-cockpit limits hands workers to evidence gathering and approved bounded execution", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.match(content, /hands worker.*isolation/i);
	assert.match(content, /executor.*plan.*explicit.*low-risk/i);
	assert.doesNotMatch(content, /delegate.*every nontrivial/i);
});

test("using-cockpit requires compact non-repeating handoffs", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.match(content, /Send only the goal/i);
	assert.match(content, /Do not repeat.*full user prompt/i);
	assert.match(content, /compact cited evidence/i);
});

test("using-cockpit discourages automatic repetition of delegated broad work", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.match(content, /does not automatically repeat/i);
	assert.match(content, /checks only gaps/i);
});

test("using-cockpit retains fresh-evidence verification", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.match(content, /fresh evidence/i);
	assert.match(content, /does not infer success/i);
});

test("using-cockpit references cockpit-work-mode for ambiguous mode selection", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.match(content, /cockpit-work-mode.*not immediately obvious/i);
});

test("using-cockpit requires human stop for unapproved product, architecture, or migration decisions", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.match(content, /human.*approve/i);
	assert.match(content, /unapproved.*(product|architecture|migration|security|persistence|deployment)/i);
});

test("using-cockpit says research does not choose direction", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.match(content, /does not choose direction/i);
});

test("using-cockpit contains no Harness distinctions section", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	assert.doesNotMatch(content, /## Harness distinctions/i);
});

test("using-cockpit stays at or below the 60-line ceiling", async () => {
	const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
	const lines = content.trim().split("\n").length;
	assert.ok(lines <= 60, `using-cockpit is ${lines} lines (max 60)`);
});

test("OpenCode adapter registers skills, setup, doctor, and bootstrap", async () => {
	const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
	const hooks = await CockpitPlugin();
	const config = {};
	await hooks.config(config);
	assert.equal(config.skills.paths.length, 1);
	assert.match(config.skills.paths[0], /\/skills$/);

	const setup = config.command["cockpit-setup"];
	assert.match(setup.description, /reasoning and hands models/);
	assert.match(setup.template, /scrollable option list/i);
	assert.match(setup.template, /Apply configuration/);
	assert.match(setup.template, /opencode debug config/);

	const doctor = config.command["cockpit-doctor"];
	assert.match(doctor.description, /Diagnose Cockpit/);
	assert.match(doctor.template, /PASS, WARN, or FAIL/);
	assert.match(doctor.template, /without changing any files/);

	const output = {
		messages: [{ info: { role: "user" }, parts: [{ type: "text", text: "hello" }] }],
	};
	await hooks["experimental.chat.messages.transform"]({}, output);
	await hooks["experimental.chat.messages.transform"]({}, output);
	const bootstrapParts = output.messages[0].parts.filter((part) => part.text.includes("COCKPIT_BOOTSTRAP_V1"));
	assert.equal(bootstrapParts.length, 1);
	assert.match(bootstrapParts[0].text, /# Using Cockpit/);
	assert.match(bootstrapParts[0].text, /Cockpit: research/);
});

test("OpenCode adapter preserves user-defined Cockpit commands", async () => {
	const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
	const hooks = await CockpitPlugin();
	const config = {
		command: {
			"cockpit-setup": { description: "custom setup", template: "custom setup template" },
			"cockpit-doctor": { description: "custom doctor", template: "custom doctor template" },
		},
	};
	await hooks.config(config);
	assert.equal(config.command["cockpit-setup"].template, "custom setup template");
	assert.equal(config.command["cockpit-doctor"].template, "custom doctor template");
});
