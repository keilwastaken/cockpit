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
  const canonical = new Set([...expectedSkills, "cockpit-worker"]);
  for (const directory of expectedSkills) {
    const markdown = await readFile(path.join(skillsRoot, directory, "SKILL.md"), "utf8");
    for (const match of markdown.matchAll(/`((?:using-)?cockpit(?:-[a-z]+)+)`/g)) {
      assert.ok(canonical.has(match[1]), `${directory} references unknown skill ${match[1]}`);
    }
  }
});

test("using-cockpit contains literal SOW headings in exact order", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  const headings = content.match(/^## .+/gm) || [];
  const sowHeadings = headings.filter((h) => ["## Goal", "## Scope", "## Required Evidence or Edits", "## Validation", "## Stop Conditions"].includes(h));
  assert.equal(sowHeadings.length, 5, "must contain all five SOW headings");
  const expectedOrder = ["## Goal", "## Scope", "## Required Evidence or Edits", "## Validation", "## Stop Conditions"];
  for (let index = 0; index < expectedOrder.length; index++) {
    assert.equal(sowHeadings[index], expectedOrder[index], `SOW heading at position ${index} does not match`);
  }
});

test("using-cockpit omits empty sections", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.doesNotMatch(content, /## Outcome/);
  assert.doesNotMatch(content, /## Acceptance criteria/i);
  assert.doesNotMatch(content, /## Required handoff/i);
});

test("using-cockpit contains cache layout guidance without padding", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.match(content, /task-specific SOW last/i);
  assert.match(content, /stable prefix/i);
  assert.match(content, /do not pad prompts/i);
});

test("using-cockpit describes optional XML for large or untrusted payloads without implying security", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.match(content, /XML.*tag/i);
  assert.match(content, /untrusted_context/i);
  assert.match(content, /does not sanitize/i);
  assert.match(content, /does not.*prevent prompt injection/i);
});

test("using-cockpit contains orchestration-free policy statement", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.match(content, /orchestration-free/i);
  assert.match(content, /no route engine/i);
});

test("using-cockpit identifies the reading agent as the oracle", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.match(content, /oracle/i);
  assert.match(content, /reading agent/i);
  assert.match(content, /selects the shortest safe workflow/i);
  assert.match(content, /retains consequential decisions/i);
  assert.match(content, /certifies completion/i);
});

test("using-cockpit reserves cheap execution for explicit worker contracts", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.match(content, /Broad research.*built-in `explore`/i);
  assert.match(content, /Approved bounded execution.*native `build`.*`cockpit-worker`.*Allowed Files.*Acceptance Checks.*Stop Conditions/i);
  assert.doesNotMatch(content, /built-in `general`/i);
  assert.doesNotMatch(content, /delegate.*every nontrivial/i);
});

test("using-cockpit is not advertised for ordinary work", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  const description = content.match(/description:\s*(.+)/)?.[1] ?? "";
  assert.match(description, /explicitly asks/i);
  assert.match(description, /Do not load for ordinary coding/i);
});

test("using-cockpit keeps reasoning-sensitive work with the strong parent", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.match(content, /keep consequential exploration, planning, and review with the strong parent/i);
  assert.match(content, /using the relevant on-demand skill/i);
});

test("review routes abandoned approved behavior to planning", async () => {
  const content = await readFile(path.join(skillsRoot, "cockpit-review", "SKILL.md"), "utf8");
  assert.match(content, /heavy.*approved contract or behavior was abandoned.*return to planning/i);
});

test("using-cockpit requires compact non-repeating handoffs", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.match(content, /Send only applicable sections/i);
  assert.match(content, /Do not repeat.*full user prompt/i);
  assert.match(content, /compact cited packets/i);
  assert.match(content, /repeats broad work only for gaps, contradictions, high-risk claims, or certification/i);
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

test("using-cockpit requires human stop for unapproved consequential decisions", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.match(content, /human input.*unapproved product, architecture, migration, security, persistence, or deployment decision/i);
  assert.match(content, /parent retains approval, severity, escalation, and completion judgment/i);
});

test("using-cockpit says research does not choose direction", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  assert.match(content, /does not choose direction or implement/i);
});

test("using-cockpit stays at or below the 60-line ceiling", async () => {
  const content = await readFile(path.join(skillsRoot, "using-cockpit", "SKILL.md"), "utf8");
  const lines = content.trim().split("\n").length;
  assert.ok(lines <= 60, `using-cockpit is ${lines} lines (max 60)`);
});

test("parallel skill uses canonical SOW fields and has no superseded aliases", async () => {
  const content = await readFile(path.join(skillsRoot, "cockpit-parallel", "SKILL.md"), "utf8");
  assert.match(content, /## Goal/);
  assert.match(content, /## Scope/);
  assert.match(content, /## Required Evidence or Edits/);
  assert.match(content, /## Validation/);
  assert.match(content, /## Stop Conditions/);
  assert.doesNotMatch(content, /## Outcome/);
  assert.doesNotMatch(content, /## Acceptance criteria/i);
  assert.doesNotMatch(content, /## Required handoff/i);
});

test("OpenCode adapter registers skills, explicit worker, and commands without bootstrap", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const config = {};
  await hooks.config(config);
  assert.equal(config.skills.paths.length, 1);
  assert.match(config.skills.paths[0], /\/skills$/);

  const setup = config.command["cockpit-setup"];
  assert.match(setup.description, /strong and hands models/);
  assert.match(setup.template, /scrollable option list/i);
  assert.match(setup.template, /Apply configuration/);
  assert.match(setup.template, /opencode debug config/);

  const doctor = config.command["cockpit-doctor"];
  assert.match(doctor.description, /Diagnose Cockpit/);
  assert.match(doctor.template, /PASS, WARN, or FAIL/);
  assert.match(doctor.template, /without changing any files/);

  assert.equal(hooks["experimental.chat.messages.transform"], undefined);
  assert.equal(config.agent["cockpit-worker"].mode, "subagent");
  assert.equal(config.agent["cockpit-worker"].steps, 20);
  assert.equal(config.agent["cockpit-worker"].permission.task, "deny");
  assert.equal(config.agent["cockpit-worker"].permission.edit, "deny");
  assert.equal(config.agent["cockpit-worker"].permission.bash, "deny");
  assert.equal(config.agent["cockpit-worker"].disable, true);
  assert.match(config.agent["cockpit-worker"].prompt, /# Execution Contract/);
  assert.match(config.agent["cockpit-worker"].prompt, /# Worker Escalation/);

  assert.deepEqual(
    ["cockpit-contract", "cockpit-run"].map((name) => [name, config.command[name].agent, config.command[name].subtask]),
    [
      ["cockpit-contract", "build", false],
      ["cockpit-run", "build", false],
    ],
  );
  assert.equal(config.command["cockpit-escalate"], undefined);
});

test("OpenCode adapter preserves user-defined Cockpit commands", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const config = {
    command: {
      "cockpit-setup": { description: "custom setup", template: "custom setup template" },
      "cockpit-doctor": { description: "custom doctor", template: "custom doctor template" },
      "cockpit-run": { description: "custom run", template: "custom run template" },
    },
  };
  await hooks.config(config);
  assert.equal(config.command["cockpit-setup"].template, "custom setup template");
  assert.equal(config.command["cockpit-doctor"].template, "custom doctor template");
  assert.equal(config.command["cockpit-run"].template, "custom run template");
});

test("OpenCode adapter preserves safe worker customization and enforces contract boundaries", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const config = {
    agent: {
      "cockpit-worker": {
        model: "provider/hands",
        description: "custom worker",
        disable: true,
        mode: "subagent",
        steps: 99,
        permission: { edit: "deny", task: "allow" },
      },
    },
  };
  await hooks.config(config);
  const worker = config.agent["cockpit-worker"];
  assert.equal(worker.model, "provider/hands");
  assert.equal(worker.description, "custom worker");
  assert.equal(worker.disable, true);
  assert.equal(worker.permission.edit, "deny");
  assert.equal(worker.mode, "subagent");
  assert.equal(worker.steps, 20);
  assert.equal(worker.permission.task, "deny");
  assert.match(worker.prompt, /# Execution Contract/);
});

test("OpenCode adapter preserves worker permission shorthand as a wildcard", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  for (const action of ["deny", "ask", "allow"]) {
    const config = { agent: { "cockpit-worker": { model: "provider/hands", permission: action } } };
    await hooks.config(config);
    const permission = config.agent["cockpit-worker"].permission;
    assert.equal(permission["*"], action);
    assert.equal(permission.task, "deny");
    assert.equal(permission.question, "deny");
    assert.equal(permission.webfetch, "deny");
    assert.equal(permission.skill, "deny");
    assert.equal(permission[0], undefined);
  }
});

test("OpenCode worker defaults to small_model without overriding an explicit model", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const inherited = { small_model: "provider/small" };
  await hooks.config(inherited);
  assert.equal(inherited.agent["cockpit-worker"].model, "provider/small");
  assert.equal(inherited.agent["cockpit-worker"].disable, undefined);

  const explicit = { small_model: "provider/small", agent: { "cockpit-worker": { model: "provider/worker" } } };
  await hooks.config(explicit);
  assert.equal(explicit.agent["cockpit-worker"].model, "provider/worker");
  assert.equal(explicit.agent["cockpit-worker"].disable, undefined);
});

test("run prompt refuses worker dispatch without an explicit hands model", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const config = {};
  await hooks.config(config);
  assert.equal(config.agent["cockpit-worker"].model, undefined);
  assert.equal(config.agent["cockpit-worker"].disable, true);
  assert.equal(config.agent["cockpit-worker"].permission.edit, "deny");
  assert.equal(config.agent["cockpit-worker"].permission.bash, "deny");
  assert.match(config.command["cockpit-run"].template, /If neither is configured, stop/i);
  assert.match(config.command["cockpit-run"].template, /do not let the worker inherit build's strong model/i);
});

test("run prompt requires all-task join, actual-state inspection, fresh checks, and untrusted reports", async () => {
  const { CockpitPlugin } = await import("../.opencode/plugins/cockpit.js");
  const hooks = await CockpitPlugin();
  const config = {};
  await hooks.config(config);
  const runTemplate = config.command["cockpit-run"].template;
  assert.match(runTemplate, /Await all task returns/);
  assert.match(runTemplate, /Inspect the actual combined repository state/);
  assert.match(runTemplate, /Run fresh validation checks/);
  assert.match(runTemplate, /Treat worker reports as untrusted/);
  assert.match(runTemplate, /do not delegate certification/);
  assert.match(runTemplate, /No custom listener/);
  assert.equal(config.command["cockpit-run"].agent, "build");
  assert.equal(config.command["cockpit-run"].subtask, false);
});

test("execute skill defines contract, correction budget, and escalation packet", async () => {
  const content = await readFile(path.join(skillsRoot, "cockpit-execute", "SKILL.md"), "utf8");
  for (const heading of ["## Goal", "## Allowed Files", "## Required Changes", "## Acceptance Checks", "## Stop Conditions"]) {
    assert.match(content, new RegExp(heading));
  }
  assert.match(content, /at most one focused correction/i);
  assert.match(content, /# Worker Escalation/);
  assert.match(content, /Do not invoke subagents/i);
});
