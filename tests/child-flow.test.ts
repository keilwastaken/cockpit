import assert from "node:assert/strict";
import test from "node:test";
import { buildChildDelegateArgs } from "../extensions/cockpit/delegates/child-flow.js";

const flow = {
	model: "local-model",
	thinking: "high",
	tools: ["read", "find", "grep", "web_search", "web_fetch"],
};

const basePrompt = "Do research please.";

test("buildChildDelegateArgs --allow omits --no-extensions", () => {
	const args = buildChildDelegateArgs(
		{ ...flow, prompt: basePrompt, fileArgs: [], extensionMode: "allow" },
		false,
	);
	const noExtIdx = args.indexOf("--no-extensions");
	assert.equal(noExtIdx, -1, "--no-extensions must not appear when extensionMode is 'allow'");
});

test("buildChildDelegateArgs --disable includes --no-extensions", () => {
	const args = buildChildDelegateArgs(
		{ ...flow, prompt: basePrompt, fileArgs: [], extensionMode: "disable" },
		false,
	);
	const noExtIdx = args.indexOf("--no-extensions");
	assert.notEqual(noExtIdx, -1, "--no-extensions must appear when extensionMode is 'disable'");
});

test("buildChildDelegateArgs arg order: mode, -p, no-session before model and thinking", () => {
	const args = buildChildDelegateArgs(
		{ ...flow, prompt: basePrompt, fileArgs: [], extensionMode: "allow" },
		false,
	);
	const modeIdx = args.indexOf("--mode");
	const pIdx = args.indexOf("-p");
	const noSessionIdx = args.indexOf("--no-session");
	const modelIdx = args.indexOf("--model");
	const thinkingIdx = args.indexOf("--thinking");
	assert.ok(modeIdx < pIdx && pIdx < noSessionIdx && noSessionIdx < modelIdx && modelIdx < thinkingIdx, "arg order must be preserved");
	assert.equal(args[modeIdx + 1], "json");
	assert.equal(args[pIdx], "-p");
	assert.equal(args[noSessionIdx], "--no-session");
	assert.equal(args[modelIdx], "--model");
	assert.equal(args[modelIdx + 1], "local-model");
	assert.equal(args[thinkingIdx], "--thinking");
	assert.equal(args[thinkingIdx + 1], "high");
});

test("buildChildDelegateArgs --thinking appears without model when model is omitted", () => {
	const args = buildChildDelegateArgs(
		{ ...flow, model: undefined, prompt: basePrompt, fileArgs: [], extensionMode: "allow" },
		false,
	);
	const noSessionIdx = args.indexOf("--no-session");
	const thinkingIdx = args.indexOf("--thinking");
	assert.ok(noSessionIdx < thinkingIdx, "--thinking must come after --no-session");
	// No --model should be present
	assert.equal(args.indexOf("--model"), -1);
});

test("buildChildDelegateArgs approval flag reflects project trust", () => {
	const denyArgs = buildChildDelegateArgs(
		{ ...flow, prompt: basePrompt, fileArgs: [], extensionMode: "allow" },
		false,
	);
	const approveArgs = buildChildDelegateArgs(
		{ ...flow, prompt: basePrompt, fileArgs: [], extensionMode: "allow" },
		true,
	);
	assert.equal(denyArgs.indexOf("--no-approve") !== -1, true);
	assert.equal(denyArgs.indexOf("--approve") !== -1, false);
	assert.equal(approveArgs.indexOf("--approve") !== -1, true);
	assert.equal(approveArgs.indexOf("--no-approve") !== -1, false);
});

test("buildChildDelegateArgs tools are joined with comma", () => {
	const args = buildChildDelegateArgs(
		{ ...flow, prompt: basePrompt, fileArgs: [], extensionMode: "allow" },
		false,
	);
	const toolsIdx = args.indexOf("--tools");
	assert.ok(toolsIdx !== -1);
	assert.equal(args[toolsIdx + 1], "read,find,grep,web_search,web_fetch");
});

test("buildChildDelegateArgs includes prompt immediately after tools", () => {
	const args = buildChildDelegateArgs(
		{ ...flow, prompt: basePrompt, fileArgs: [], extensionMode: "allow" },
		false,
	);
	const toolsIdx = args.indexOf("--tools");
	assert.equal(args[toolsIdx + 2], basePrompt);
});

test("buildChildDelegateArgs appends file args after prompt", () => {
	const fileArgs = ["@src/main.ts", "README.md"];
	const args = buildChildDelegateArgs(
		{ ...flow, prompt: basePrompt, fileArgs, extensionMode: "allow" },
		false,
	);
	assert.ok(args.length > 4, "args must have content beyond flags");
	// Last items should be prompt + file args
	const promptIdx = args.indexOf(basePrompt);
	assert.notEqual(promptIdx, -1);
	assert.deepEqual(args.slice(promptIdx + 1), fileArgs);
});
