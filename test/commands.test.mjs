import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { compileExtension } from "./helpers/compile-extension.mjs";

async function makeSandbox() {
	return {
		cwd: await mkdtemp(join(tmpdir(), "pi-conductor-commands-cwd-")),
		home: await mkdtemp(join(tmpdir(), "pi-conductor-commands-home-")),
	};
}

function makeFakePi() {
	const commands = new Map();
	const tools = new Map();
	const events = new Map();
	return {
		commands,
		tools,
		events,
		on(event, handler) {
			const handlers = events.get(event) ?? [];
			handlers.push(handler);
			events.set(event, handlers);
		},
		registerCommand(name, options) {
			commands.set(name, options);
		},
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
	};
}

function makeCtx(cwd) {
	const notifications = [];
	const statuses = [];
	return {
		ctx: {
			cwd,
			hasUI: true,
			mode: "cli",
			isProjectTrusted: () => true,
			ui: {
				notify(message, level) {
					notifications.push({ message, level });
				},
				setStatus(name, text) {
					statuses.push({ name, text });
				},
				input() {
					throw new Error("unexpected input");
				},
				select() {
					throw new Error("unexpected select");
				},
				custom() {
					throw new Error("unexpected custom");
				},
			},
		},
		notifications,
		statuses,
	};
}

const compiled = await compileExtension();
const { default: conductorExtension } = await compiled.importCompiled("extensions/conductor/index.js");

async function withSandbox(fn) {
	const { cwd, home } = await makeSandbox();
	const previousHome = process.env.HOME;
	process.env.HOME = home;
	try {
		return await fn({ cwd, home });
	} finally {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	}
}

function latestNotification(notifications) {
	assert.ok(notifications.length > 0, "expected at least one notification");
	return notifications[notifications.length - 1];
}

test("command flow persists and surfaces real registry artifacts", async () => {
	await withSandbox(async ({ cwd }) => {
		const pi = makeFakePi();
		conductorExtension(pi);
		const command = pi.commands.get("conductor");
		assert.ok(command);

		const { ctx, notifications, statuses } = makeCtx(cwd);
		const sessionStart = pi.events.get("session_start")?.[0];
		await sessionStart?.({}, ctx);
		assert.equal(statuses.at(-1)?.text, "conductor: strict on");

		await command.handler("handoff careful update test/scaffold.test.mjs and README.md to harden registry coverage", ctx);
		const handoffNotice = latestNotification(notifications);
		assert.equal(handoffNotice.level, "info");
		assert.match(handoffNotice.message, /Saved run:/);
		assert.match(handoffNotice.message, /Handoff:/);

		const handoffPath = handoffNotice.message.match(/Handoff: (.+)$/m)?.[1];
		assert.ok(handoffPath);
		const runDir = dirname(handoffPath);
		const statusPath = join(runDir, "status.json");
		const handoffText = await readFile(handoffPath, "utf8");
		const status = JSON.parse(await readFile(statusPath, "utf8"));
		assert.equal(status.state, "drafted");
		assert.equal(status.handoffPath, handoffPath);
		assert.equal(status.statusPath, statusPath);
		assert.match(handoffText, /Manager-style work order/);

		await command.handler("runs", ctx);
		assert.match(latestNotification(notifications).message, /Conductor runs:/);
		assert.ok(latestNotification(notifications).message.includes(`${status.id} | drafted | careful/careful`));

		await command.handler(`inspect ${status.id}`, ctx);
		const inspectNotice = latestNotification(notifications);
		assert.match(inspectNotice.message, /"state": "drafted"/);
		assert.match(inspectNotice.message, /Notes:/);
		assert.match(inspectNotice.message, /Evidence:/);
		assert.match(inspectNotice.message, /Review:/);

		await command.handler(`launch --approve ${status.id}`, ctx);
		const launchNotice = latestNotification(notifications);
		assert.match(launchNotice.message, /approved; no worker launched yet/);
		assert.match(launchNotice.message, /Status updated at/);

		const approved = JSON.parse(await readFile(statusPath, "utf8"));
		assert.equal(approved.state, "approved");
		assert.ok(approved.approvedAt);
		assert.ok(approved.decisionsPath);
		assert.match(await readFile(approved.decisionsPath, "utf8"), /Human approved launch for run/);

		await command.handler("runs", ctx);
		assert.ok(latestNotification(notifications).message.includes(`${status.id} | approved | careful/careful`));
	});
});

test("conductor_handoff tool writes real registry artifacts", async () => {
	await withSandbox(async ({ cwd }) => {
		const pi = makeFakePi();
		conductorExtension(pi);
		const tool = pi.tools.get("conductor_handoff");
		assert.ok(tool);

		const { ctx } = makeCtx(cwd);
		const result = await tool.execute("tool-call-1", { task: "update registry hardening tests in test/registry.test.mjs", tier: "fast" }, undefined, undefined, ctx);
		assert.equal(result.content[0].type, "text");
		assert.match(result.content[0].text, /Saved run:/);
		assert.match(result.content[0].text, /Handoff:/);
		assert.equal(result.details.decision.route, "fast");
		assert.equal(result.details.decision.tier, "fast");

		const statusPath = result.details.statusPath;
		const handoffPath = result.details.logPath;
		await access(statusPath);
		await access(handoffPath);
		const status = JSON.parse(await readFile(statusPath, "utf8"));
		assert.equal(status.id, result.details.runId);
		assert.equal(status.state, "drafted");
		assert.equal(status.statusPath, statusPath);
		assert.equal(status.handoffPath, handoffPath);
		assert.match(await readFile(handoffPath, "utf8"), /Execution profile:/);
	});
});
