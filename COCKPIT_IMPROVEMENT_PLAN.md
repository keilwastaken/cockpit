# Cockpit Extension Improvement Plan

This plan outlines the next phase of development for the `cockpit` extension to transition it from a "heavy scripting" feel to a fast, cohesive, and intelligent AI dev team.

## Phase 1: Hybrid Strict Mode (Quick Win)
**Problem:** `strictMode` hard-blocks the user from using standard edit tools in the main chat, causing friction.
**Solution:**
- Update `extensions/cockpit/safety.ts`.
- Instead of returning a block reason for `edit` and `write`, we will allow the operation but inject a warning (e.g., via `ctx.ui.notify`) that code is being modified in the Oracle control room.
- Remove the hard block for these tools.

## Phase 2: Interactive Codeflow Approval (UI Smoothing)
**Problem:** `codeflow` forces the user to manually read the pre-plan job and then type `/cockpit codeflow --approved <task>`.
**Solution:**
- Update the `codeflow-preplan` job completion logic in `extensions/cockpit/jobs/service.ts`.
- When a `codeflow-preplan` job finishes, trigger an interactive TUI overlay using `ctx.ui.custom()`.
- Display the generated plan and provide `[Approve and Execute]` and `[Reject]` buttons.
- If approved, automatically start the `codeflow` job without requiring the user to type another command.

## Phase 3: Rich Reviewer Context (Isolating Diffs)
**Problem:** The `reviewer` relies on global `git diff`, which gets messy if files are uncommitted or multiple jobs run in parallel.
**Solution:**
- Update the `normal` (and `fast`) delegates to reliably report exactly which files they modified (already in the "Files Changed" section).
- Update the job service to capture these changed files in the job's artifact state.
- When `/cockpit review` is called, automatically fetch the pre-run and post-run state of *only* those specific files and inject that exact diff into the `reviewer` delegate's prompt.

## Phase 4: Structural Map for Discovery (Context Pre-loading)
**Problem:** Delegates waste tokens and time running `ls` and `grep` to understand the codebase layout.
**Solution:**
- Create a lightweight directory and structural mapper (e.g., parsing imports and class/function signatures for TypeScript/Python).
- Pre-inject this "Project Skeleton" into the `fast` and `normal` delegate prompts automatically.
- This eliminates the need for initial "guess who" `find`/`grep` commands.

## Phase 5: Fast Execution Model (Solving Child Process Overhead)
**Problem:** Spawning a fresh `pi` CLI process for every job adds massive cold-start overhead.
**Solution:**
- Investigate the `@earendil-works/pi-coding-agent` SDK for programmatic execution or Node.js `Worker` threads to run agents in the background *within the same memory space*.
- If the SDK requires CLI spawning for isolation, optimize the spawned command by stripping out unnecessary plugins, UI loading, and theme initializations to achieve a sub-second boot time.
