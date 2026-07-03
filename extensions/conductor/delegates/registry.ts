import { fastDelegate } from "./fast.js";
import { instantDelegate } from "./instant.js";
import { normalDelegate } from "./normal.js";
import { plannerDelegate } from "./planner.js";
import { researchDelegate } from "./research.js";

export const delegates = {
	instant: instantDelegate,
	fast: fastDelegate,
	research: researchDelegate,
	normal: normalDelegate,
	planner: plannerDelegate,
};

export { fastDelegate, instantDelegate, normalDelegate, plannerDelegate, researchDelegate };
