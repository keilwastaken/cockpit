import assert from "node:assert/strict";
import test from "node:test";
import { jobResultSummary } from "../extensions/cockpit/jobs/ui.ts";
import type { AsyncJob } from "../extensions/cockpit/jobs/async-jobs.ts";

function mockJob(output: string): AsyncJob {
	return {
		id: "2eacf1ee",
		flow: "research",
		plan: "research flutter api client",
		status: "done",
		output,
		stderr: "",
		artifactsDir: "/tmp/.pi/cockpit/jobs/2eacf1ee",
		startedAt: 0,
		finishedAt: 1000,
		timeoutMs: 60_000,
		controller: new AbortController(),
	};
}

test("jobResultSummary shows compact digest instead of full research dump", () => {
	const output = `# Research Brief

## Task Understanding
Plan Slice 2: add a Flutter FastAPI API client that sends Cognito bearer token, and replace only GameService.searchGames.

## Research Summary Meta
- Confidence: High
- Files fully inspected: 11

## Evidence Quality
- Direct code evidence: GameService currently uses Firebase callable.
- Gaps: No existing Flutter HTTP client dependency in pubspec.yaml.
- Restored sessions only persist token payload, not raw ID token.

## Relevant Files
- lib/services/game_service.dart
  - Current search implementation uses callable searchGames.
- lib/services/auth_service.dart
  - Private token field only.
- backend/app/api/v1/games.py
  - Target endpoint exists.

## Long Section
${"verbose details\n".repeat(200)}`;

	const summary = jobResultSummary(mockJob(output));

	assert.match(summary, /Digest:/);
	assert.match(summary, /Task: Plan Slice 2/);
	assert.match(summary, /Confidence: High/);
	assert.match(summary, /Gap: Gaps: No existing Flutter HTTP client dependency/);
	assert.match(summary, /File: lib\/services\/game_service\.dart/);
	assert.match(summary, /Full output: \/cockpit job 2eacf1ee/);
	assert.doesNotMatch(summary, /verbose details/);
	assert.ok(summary.length < 2200);
});
