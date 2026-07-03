import { briefDelegate } from "./brief.js";
import { fastDelegate } from "./fast.js";
import { ideateDelegate } from "./ideate.js";
import { instantDelegate } from "./instant.js";
import { normalDelegate } from "./normal.js";
import { plannerDelegate } from "./planner.js";
import { researchDelegate } from "./research.js";
import { reviewerDelegate } from "./reviewer.js";

export const delegates = {
	instant: instantDelegate,
	fast: fastDelegate,
	research: researchDelegate,
	normal: normalDelegate,
	planner: plannerDelegate,
	reviewer: reviewerDelegate,
	ideate: ideateDelegate,
	brief: briefDelegate,
};

export { briefDelegate, fastDelegate, ideateDelegate, instantDelegate, normalDelegate, plannerDelegate, researchDelegate, reviewerDelegate };
