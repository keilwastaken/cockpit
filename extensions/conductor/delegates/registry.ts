import { fastDelegate } from "./fast.js";
import { instantDelegate } from "./instant.js";
import { researchDelegate } from "./research.js";

export const delegates = {
	instant: instantDelegate,
	fast: fastDelegate,
	research: researchDelegate,
};

export { fastDelegate, instantDelegate, researchDelegate };
