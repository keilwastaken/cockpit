// Cockpit Lite: on-demand prompt/skill library.
// Native OpenCode owns routing and execution.
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillsDirectory = path.resolve(pluginDirectory, "../../skills");

export const CockpitPlugin = async () => ({
  config: async (config) => {
    config.skills ??= {};
    config.skills.paths ??= [];
    if (!config.skills.paths.includes(skillsDirectory)) {
      config.skills.paths.push(skillsDirectory);
    }
  },
});
