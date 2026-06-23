import { ModelSelectorComponent, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, saveGlobalConfig } from "./config.js";
import type { ConductorConfig } from "./types.js";

const NO_MODEL = "No model preference / inherit agent default";

const splitAgents = (value: string): string[] =>
	value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);

type ModelLike = {
	id?: string;
	name?: string;
	provider?: string;
	providerId?: string;
};

const modelId = (model: ModelLike): string | undefined => {
	if (!model.id) return undefined;
	const provider = model.provider ?? model.providerId;
	return provider && !model.id.includes("/") ? `${provider}/${model.id}` : model.id;
};

const modelLabel = (model: ModelLike): string | undefined => {
	const id = modelId(model);
	if (!id) return undefined;
	return model.name && model.name !== model.id ? `${model.name} (${id})` : id;
};

async function getModelChoices(ctx: ExtensionCommandContext): Promise<Array<{ label: string; value: string }>> {
	try {
		const registry = (ctx as unknown as { modelRegistry?: { getAvailable?: () => Promise<unknown[]> } }).modelRegistry;
		const available = registry?.getAvailable ? await registry.getAvailable() : [];
		const choices = available
			.map((model) => {
				const typed = model as ModelLike;
				const value = modelId(typed);
				const label = modelLabel(typed);
				return value && label ? { label, value } : undefined;
			})
			.filter((choice): choice is { label: string; value: string } => Boolean(choice));
		return choices.sort((a, b) => a.label.localeCompare(b.label));
	} catch {
		return [];
	}
}

async function selectModel(ctx: ExtensionCommandContext, title: string, current: string, choices: Array<{ label: string; value: string }>): Promise<string> {
	if (ctx.mode === "tui") {
		const selected = await ctx.ui.custom<string | undefined>((tui, _theme, _kb, done) => {
			const settingsManager = { setDefaultModelAndProvider: () => undefined };
			return new ModelSelectorComponent(
				tui,
				ctx.model,
				settingsManager as never,
				ctx.modelRegistry,
				[],
				(model: { provider?: string; id?: string }) => done(modelId(model) ?? current),
				() => done(current || undefined),
			);
		});
		return selected ?? current;
	}

	if (choices.length === 0) {
		const manual = await ctx.ui.input(`${title} model id`, current || "provider/model-id or blank");
		return manual?.trim() ?? "";
	}

	const labels = [NO_MODEL, ...choices.map((choice) => choice.label), "Manual entry..."];
	const selected = await ctx.ui.select(title, labels);
	if (selected === NO_MODEL) return "";
	if (selected === "Manual entry...") {
		const manual = await ctx.ui.input(`${title} model id`, current || "provider/model-id");
		return manual?.trim() ?? "";
	}
	return choices.find((choice) => choice.label === selected)?.value ?? current;
}

export async function runSetup(ctx: ExtensionCommandContext): Promise<string> {
	let config: ConductorConfig = structuredClone(DEFAULT_CONFIG);

	if (!ctx.hasUI) {
		const path = await saveGlobalConfig(config);
		return `Wrote default Conductor config to ${path}`;
	}

	const modelChoices = await getModelChoices(ctx);

	const micro = await ctx.ui.input("Micro executor agents", config.agents.micro.join(", "));
	const microModel = await selectModel(ctx, "Micro tier model", config.models.micro, modelChoices);
	const small = await ctx.ui.input("Small executor agents", config.agents.small.join(", "));
	const smallModel = await selectModel(ctx, "Small tier model", config.models.small, modelChoices);
	const medium = await ctx.ui.input("Medium worker agent", config.agents.medium);
	const mediumModel = await selectModel(ctx, "Medium tier model", config.models.medium, modelChoices);
	const reviewer = await ctx.ui.input("Reviewer agent", config.agents.reviewer);
	const strictChoice = await ctx.ui.select("Strict mode default", ["on", "off"]);

	config = {
		...config,
		strictMode: strictChoice !== "off",
		agents: {
			micro: splitAgents(micro || config.agents.micro.join(", ")),
			small: splitAgents(small || config.agents.small.join(", ")),
			medium: medium?.trim() || config.agents.medium,
			reviewer: reviewer?.trim() || config.agents.reviewer,
			fullAuto: "review-loop",
		},
		models: {
			micro: microModel,
			small: smallModel,
			medium: mediumModel,
			fullAuto: "",
		},
	};

	const path = await saveGlobalConfig(config);
	return `Conductor config saved to ${path}`;
}
