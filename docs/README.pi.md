# Cockpit for Pi

Pi loads Cockpit's canonical skills and thin extension from the package metadata in `package.json#pi`.

## Install

For local development, run Pi with the package extension:

```bash
pi -e ./extensions/cockpit.js
```

Published Git or npm installation should use Pi's native `pi install` command once the package URL is finalized. Pi then discovers both `skills/` and `extensions/cockpit.js`.

## Setup

Run `/cockpit-setup` inside interactive Pi. The command lists authenticated models using Pi's native model registry, asks for confirmation, and changes only the active model for the current session.

Cockpit runs sequentially in Pi's current agent. It does not persist reasoning/hands roles, create subagents, or write Pi settings.

## Doctor

Run `/cockpit-doctor` for read-only checks of command registration, packaged skill inventory, the active model, authenticated model availability, and sequential execution.

## Bootstrap

The extension uses Pi's `before_agent_start` event to append `using-cockpit` and `COCKPIT_BOOTSTRAP_V1` when the marker is absent.

## Disable Or Remove

Disable the extension through Pi package filtering if you want to retain only the skills. Remove an installed package with Pi's native `pi remove` command. Cockpit does not modify user configuration during removal.

## Development

```bash
node --check extensions/cockpit.js
npm test
npm run check:generated
```
