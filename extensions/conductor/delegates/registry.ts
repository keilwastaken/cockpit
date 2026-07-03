import { fastDelegate } from "./fast.js";
import { instantDelegate } from "./instant.js";
import { plannerDelegate } from "./planner.js";
import { researchDelegate } from "./research.js";

export const delegates = {
	instant: instantDelegate,
	fast: fastDelegate,
	research: researchDelegate,
	planner: plannerDelegate,
};

export { fastDelegate, instantDelegate, plannerDelegate, researchDelegate };
