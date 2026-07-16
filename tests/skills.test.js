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
