# Cockpit Skills-First Migration

## Status

The migration is complete. Cockpit's core package is now a portable Markdown methodology with thin harness registration.

## Completed

- [x] Define the portable methodology and handoff contracts.
- [x] Replace size/model-oriented roles with situation-oriented workflow skills.
- [x] Namespace workflow skill IDs to coexist with other skill packages.
- [x] Add explicit review-response, parallel-work, and verification skills.
- [x] Add concise delegation visibility without routing noise for direct work.
- [x] Add a thin OpenCode registrar/bootstrap plugin.
- [x] Add scrollable conversational `/cockpit-setup` model configuration.
- [x] Add read-only `/cockpit-doctor` diagnostics.
- [x] Add eight isolated behavioral model scenarios.
- [x] Retain native Pi skill discovery without a Pi-specific runtime.
- [x] Remove the legacy TypeScript runtime, dependencies, build config, and tests.
- [x] Add package, metadata, adapter, and skill-reference tests.

## Release criteria

- [ ] Run all behavioral scenarios with the chosen reasoning model.
- [ ] Run all behavioral scenarios with the chosen hands model.
- [ ] Record and fix only observed behavioral failures.
- [ ] Verify OpenCode installation from a tagged Git URL.
- [ ] Verify Pi discovers the same canonical skills.
- [ ] Finalize repository/package name and first public version.
- [ ] Add update and uninstall commands using the final Git URL.

## Product constraint

Do not rebuild model routers, background jobs, warm delegates, progress UI, automatic fix loops, or task managers in the core. Optional harness integrations must remain thin and inspectable.
