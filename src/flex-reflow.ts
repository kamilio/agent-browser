import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import { documentLayoutLimits } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { layoutFormattingFlexFlow } from "./flex-document.js";
import {
	flexMainWorkLimit,
	resolveFormattingFlexMainSizes,
	type FlexMainConstraints,
	type FlexMainOptions,
} from "./flex-main.js";
import {
	buildFormattingTree,
	formattingLimits,
	resolveFormattingBlockWidths,
	type BlockReflowRoot,
	type FormattingTree,
} from "./formatting-tree.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import {
	layoutFormattingText,
	textLayoutWorkLimit,
	type TextLayoutLimits,
} from "./text-layout.js";

export const flexReflowLimits = Object.freeze({ maxWork: 12_000_000 });
export interface FlexReflowOptions {
	maxWork?: number;
	main?: FlexMainOptions;
	text?: Partial<TextLayoutLimits>;
}
export function flexReflowWorkLimits(
	constraints: FlexMainConstraints,
	options: FlexReflowOptions = {},
) {
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some(
			(key) => !["maxWork", "main", "text"].includes(key),
		)
	)
		throw new AgentBrowserError("invalid-input", "Invalid flex reflow options");
	const main = flexMainWorkLimit(constraints, options.main);
	const text = textLayoutWorkLimit(options.text);
	if (options.text && Object.hasOwn(options.text, "formatting"))
		throw new AgentBrowserError(
			"invalid-input",
			"Configure formatting through flex main measurement",
		);
	const maxWork =
		options.maxWork === undefined ? flexReflowLimits.maxWork : options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > flexReflowLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid flex reflow work limit",
		);
	return { main, text, maxWork };
}

export function reflowFlexItems(
	tree: DocumentTree,
	reference: string,
	constraints: FlexMainConstraints,
	options: FlexReflowOptions = {},
) {
	const limits = flexReflowWorkLimits(constraints, options);
	tree.resolve(reference);
	const phase = options.main?.intrinsic?.formatting;
	const formatting = buildFormattingTree(tree, {
		...phase,
		maxWork: Math.min(
			phase?.maxWork ?? formattingLimits.maxWork,
			options.main?.intrinsic?.maxWork ?? limits.main,
			limits.main,
			limits.maxWork,
		),
	});
	const container = formatting.nodes.find((node) => node.ref === reference);
	if (!container)
		throw new AgentBrowserError(
			"not-found",
			"Flex formatting container is unavailable",
		);
	return reflowFormattingFlexItems(
		formatting,
		container.id,
		constraints,
		options,
	);
}

export function reflowFormattingFlexItems(
	formatting: FormattingTree,
	containerId: number,
	constraints: FlexMainConstraints,
	options: FlexReflowOptions = {},
	nesting = 0,
	validatedFormatting = false,
) {
	const limits = flexReflowWorkLimits(constraints, options);
	const main = resolveFormattingFlexMainSizes(
		formatting,
		containerId,
		constraints,
		{ ...options.main, maxWork: Math.min(limits.main, limits.maxWork) },
		validatedFormatting,
	);
	if (main.metrics.work >= limits.maxWork)
		throw new AgentBrowserError(
			"resource-limit",
			"Flex item reflow work limit exceeded",
		);
	const result = reflowAllocatedFlexItems(
		formatting,
		main,
		{
			...options,
			maxWork: limits.maxWork - main.metrics.work,
		},
		new Map(),
		nesting,
	);
	return Object.freeze({
		...result,
		metrics: Object.freeze({
			...result.metrics,
			main: main.metrics.work,
			work: main.metrics.work + result.metrics.work,
		}),
	});
}

export function reflowAllocatedFlexItems(
	formatting: FormattingTree,
	main: ReturnType<typeof resolveFormattingFlexMainSizes>,
	options: FlexReflowOptions = {},
	heights: ReadonlyMap<number, number> = new Map(),
	nesting = 0,
) {
	const constraints = main.constraints;
	const containerId = main.container;
	if (
		formatting.revision !== main.revision ||
		formatting.nodes[containerId]?.ref !== main.reference
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Flex reflow allocation belongs to a different formatting snapshot",
		);
	const limits = flexReflowWorkLimits(constraints, options);
	let work = 0;
	const charge = (units = 1) => {
		work += units;
		if (work > limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Flex item reflow work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Flex item reflow work limit exceeded",
			);
		return limits.maxWork - work;
	};
	const allocations = new Map<
		number,
		{
			line: number;
			item: (typeof main.resolved.lines)[number]["items"][number];
		}
	>();
	for (const [line, resolved] of main.resolved.lines.entries()) {
		charge();
		for (const item of resolved.items) {
			charge();
			allocations.set(item.index, { line, item });
		}
	}
	const roots: Readonly<BlockReflowRoot>[] = main.items.map((item, index) => {
		charge();
		const allocated = allocations.get(index);
		if (!allocated)
			throw new AgentBrowserError(
				"unsupported",
				"Missing flex main allocation",
			);
		const style = formatting.nodes[item.id].box ?? initialBoxStyle;
		const borders = resolveBorders(style);
		const paddingLeft = resolveLayoutLength(
			style["padding-left"],
			constraints.contentWidth,
		);
		const paddingRight = resolveLayoutLength(
			style["padding-right"],
			constraints.contentWidth,
		);
		const reverse = main.direction === "row-reverse";
		const marginLeft = reverse
			? allocated.item.marginEnd
			: allocated.item.marginStart;
		const marginRight = reverse
			? allocated.item.marginStart
			: allocated.item.marginEnd;
		const usedWidth = Object.freeze({
			containingWidth: constraints.contentWidth,
			contentWidth: allocated.item.contentSize,
			paddingLeft,
			paddingRight,
			borderLeft: borders.borderLeft,
			borderRight: borders.borderRight,
			marginLeft,
			marginRight,
			borderBoxWidth: allocated.item.borderBoxSize,
			contentOffset: layoutNumber(
				marginLeft + borders.borderLeft + paddingLeft,
				true,
			),
			clampedBy: "none" as const,
		});
		const crossSize = heights.get(item.id) ?? item.definiteCrossSize;
		return Object.freeze({
			id: item.id,
			containingBlock: containerId,
			containingWidth: constraints.contentWidth,
			containingHeight: constraints.contentHeight,
			contentX: 0,
			usedWidth,
			...(crossSize === null ? {} : { contentHeightOverride: crossSize }),
		});
	});
	const horizontal = resolveFormattingBlockWidths(
		formatting,
		roots,
		Math.min(formattingLimits.maxWork, remaining()),
		true,
		() => {},
		{ nesting: nesting + 1, text: options.text },
	);
	charge(horizontal.metrics.work);
	const text = layoutFormattingText(horizontal, {
		...options.text,
		maxWork: Math.min(limits.text, remaining()),
	});
	charge(text.metrics.work);
	const layout = layoutFormattingFlexFlow(
		text,
		Math.min(documentLayoutLimits.maxWork, remaining()),
		options.text,
		true,
		nesting + 1,
	);
	charge(layout.metrics.work);
	const boxes = new Map(
		layout.boxes.map((box) => {
			charge();
			return [box.id, box];
		}),
	);
	const items = main.items.map((item, index) => {
		charge();
		const box = boxes.get(item.id);
		const allocation = allocations.get(index);
		if (!box || !allocation)
			throw new AgentBrowserError(
				"unsupported",
				"Missing reflowed flex item box",
			);
		return Object.freeze({
			id: item.id,
			...(item.ref ? { ref: item.ref } : {}),
			index,
			line: allocation.line,
			box,
			outerCrossSize: layoutNumber(
				box.marginTop + box.borderBoxHeight + box.marginBottom,
				true,
			),
		});
	});
	return Object.freeze({
		stage: "native-flex-item-reflow" as const,
		partial: true as const,
		revision: formatting.revision,
		container: containerId,
		reference: main.reference,
		main,
		items: Object.freeze(items),
		layout,
		metrics: Object.freeze({
			work,
			main: 0,
			horizontal: horizontal.metrics.work,
			text: text.metrics.work,
			layout: layout.metrics.work,
		}),
	});
}
