# pi-conductor

Instant-only Pi delegation router.

## Code map

This project is an instant-only Pi delegation router:

- `package.json` — package metadata and scripts.
- `tsconfig.json` — TypeScript compiler settings.
- `extensions/conductor/index.ts` — Pi extension entry point and command registration.
- `extensions/conductor/config.ts` — conductor configuration helpers.
- `extensions/conductor/delegate.ts` — instant delegate execution flow.
- `extensions/conductor/routing.ts` — routing decisions for delegate eligibility.
- `extensions/conductor/safety.ts` — safety checks for low-risk edits.

Commands:

- `/conductor status`
- `/conductor setup`
- `/conductor route <task>`
- `/conductor instant <simple plan mentioning one file>`
- `/conductor strict on|off`

Only tiny, exact, low-risk one-file edits are routed to the `instant` delegate flow.

`instant` is the first delegate flow: the cockpit sends one simple plan plus the exact file, optionally a target line, and the worker runs with only `read` + `edit` by default so it can do the one change without scouting or expanding scope.

Run `/conductor setup` to choose the Pi model used by instant delegates. Thinking is always forced off for instant to keep it cheaper and faster.
