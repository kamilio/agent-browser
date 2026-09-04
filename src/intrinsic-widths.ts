import { resolveBorders } from "./border-box.js";
import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import { lengthHasPercentage } from "./css-math.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { flexIntrinsicContribution } from "./flex-intrinsic.js";
import { crossInput } from "./flex-main.js";
import { flexLineLimits } from "./flex-line.js";
import { layoutFormattingColumnContainer } from "./flex-column.js";
import { flexLayoutLimits } from "./flex-layout.js";
import { isAtomicInline, type AtomicInlineMetrics } from "./inline-atomic.js";
import {
	buildFormattingTree,
	formattingLimits,
	type FormattingImageSize,
	type FormattingLimits,
	type FormattingNode,
	type FormattingTree,
} from "./formatting-tree.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import {
	resolveHeightConstraints,
	resolveReplacedSize,
} from "./replaced-box.js";
import {
	measureFormattingText,
	textLayoutLimits,
	type TextLayoutLimits,
} from "./text-layout.js";

export const intrinsicWidthLimits = Object.freeze({ maxWork: 4_000_000 });
export interface IntrinsicWidthOptions {
	maxWork?: number;
	formatting?: Partial<FormattingLimits>;
	text?: Partial<TextLayoutLimits>;
}
export interface IntrinsicWidth {
	id: number;
	ref?: string;
	minContent: number;
	maxContent: number;
	minContribution: number;
	maxContribution: number;
}
export interface IntrinsicWidthMeasurement {
	stage: "native-intrinsic-widths";
	partial: true;
	revision: number;
	root: number;
	widths: readonly Readonly<IntrinsicWidth>[];
	metrics: Readonly<{
		work: number;
		formattingWork: number;
		minText: ReturnType<typeof measureFormattingText>["metrics"];
		maxText: ReturnType<typeof measureFormattingText>["metrics"];
		boxes: number;
	}>;
}

function cyclicStyle(style: BoxStyle, minimumReplaced = false): BoxStyle {
	const result = { ...style };
	for (const property of ["width", "max-width"] as const)
		if (lengthHasPercentage(style[property]))
			result[property] = minimumReplaced
				? `${resolveLayoutLength(style[property], 0)}px`
				: initialBoxStyle[property];
	for (const property of [
		"min-width",
		"padding-top",
		"padding-right",
		"padding-bottom",
		"padding-left",
		"margin-top",
		"margin-right",
		"margin-bottom",
		"margin-left",
	] as const)
		if (lengthHasPercentage(style[property]))
			result[property] =
				`${resolveLayoutLength(style[property], 0, property.startsWith("margin-"))}px`;
	return result;
}

function contribution(style: BoxStyle, content: number) {
	const borders = resolveBorders(style);
	const edges = layoutNumber(
		borders.borderLeft +
			borders.borderRight +
			resolveLayoutLength(style["padding-left"], 0) +
			resolveLayoutLength(style["padding-right"], 0),
	);
	const adjustment = style["box-sizing"] === "border-box" ? edges : 0;
	const value = (source: string) =>
		Math.max(0, resolveLayoutLength(source, 0) - adjustment);
	const preferred = style.width === "auto" ? content : value(style.width);
	const minimum = style["min-width"] === "auto" ? 0 : value(style["min-width"]);
	const maximum =
		style["max-width"] === "none"
			? Number.POSITIVE_INFINITY
			: value(style["max-width"]);
	const margin = (side: "left" | "right") =>
		style[`margin-${side}`] === "auto"
			? 0
			: resolveLayoutLength(style[`margin-${side}`], 0, true);
	return layoutNumber(
		Math.max(minimum, Math.min(preferred, maximum)) +
			edges +
			margin("left") +
			margin("right"),
		true,
	);
}

function phaseOptions(
	value: unknown,
	limits: Readonly<Record<string, number>>,
) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid intrinsic measurement phase options",
		);
	for (const [key, limit] of Object.entries(value))
		if (
			!Object.hasOwn(limits, key) ||
			!Number.isSafeInteger(limit) ||
			(limit as number) < 1 ||
			(limit as number) > limits[key]
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid intrinsic measurement phase limit",
			);
}

export function intrinsicWidthWorkLimit(options: IntrinsicWidthOptions) {
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some(
			(key) => !["maxWork", "formatting", "text"].includes(key),
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid intrinsic width options",
		);
	const maxWork =
		options.maxWork === undefined
			? intrinsicWidthLimits.maxWork
			: options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > intrinsicWidthLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid intrinsic width work limit",
		);
	phaseOptions(
		options.formatting === undefined ? {} : options.formatting,
		formattingLimits,
	);
	phaseOptions(
		options.text === undefined ? {} : options.text,
		textLayoutLimits,
	);
	return maxWork;
}

export function measureIntrinsicWidths(
	tree: DocumentTree,
	options: IntrinsicWidthOptions = {},
) {
	const maxWork = intrinsicWidthWorkLimit(options);
	const formatting = buildFormattingTree(tree, {
		...options.formatting,
		maxWork: Math.min(
			options.formatting?.maxWork ?? formattingLimits.maxWork,
			maxWork,
		),
	});
	return measureFormattingIntrinsicWidths(formatting, options);
}

export function measureFormattingIntrinsicWidths(
	formatting: FormattingTree,
	options: IntrinsicWidthOptions = {},
) {
	return measureScopes(formatting, options, formatting.root, [
		{ id: formatting.root, height: formatting.viewport.height },
	]);
}

export function measureFormattingFlexItemWidths(
	formatting: FormattingTree,
	containerId: number,
	containingHeight: number | null,
	options: IntrinsicWidthOptions = {},
	definiteItemHeights: ReadonlyMap<number, number> = new Map(),
	validatedFormatting = false,
) {
	if (containingHeight !== null) layoutNumber(containingHeight);
	const container = formatting.nodes[containerId];
	if (
		!Number.isSafeInteger(containerId) ||
		!container ||
		container.contentMode !== "flex"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Intrinsic flex measurement requires a flex container",
		);
	return measureScopes(
		formatting,
		options,
		containerId,
		container.children.map((id) => {
			const definiteHeight = definiteItemHeights.get(id);
			if (definiteHeight !== undefined) layoutNumber(definiteHeight);
			return { id, height: containingHeight, definiteHeight };
		}),
		validatedFormatting
			? { minimum: emptyTextMetrics(), maximum: emptyTextMetrics() }
			: undefined,
	);
}

type MutableTextMetrics = {
	-readonly [Key in keyof IntrinsicWidthMeasurement["metrics"]["minText"]]: IntrinsicWidthMeasurement["metrics"]["minText"][Key];
};
interface IntrinsicScopeState {
	minimum: MutableTextMetrics;
	maximum: MutableTextMetrics;
	cyclicFormatting?: FormattingTree;
}
function emptyTextMetrics(): MutableTextMetrics {
	return {
		tokens: 0,
		lines: 0,
		glyphs: 0,
		fragments: 0,
		unsupportedGlyphs: 0,
		work: 0,
	};
}

export function measureValidatedIntrinsicRoot(
	formatting: FormattingTree,
	id: number,
	containingHeight: number | null,
	options: IntrinsicWidthOptions,
	nesting: number,
) {
	return measureScopes(
		formatting,
		options,
		id,
		[{ id, height: containingHeight, flexDepth: nesting }],
		{
			minimum: emptyTextMetrics(),
			maximum: emptyTextMetrics(),
		},
	);
}
function textMetricDifference(
	total: MutableTextMetrics,
	before: MutableTextMetrics,
) {
	return Object.freeze({
		tokens: total.tokens - before.tokens,
		lines: total.lines - before.lines,
		glyphs: total.glyphs - before.glyphs,
		fragments: total.fragments - before.fragments,
		unsupportedGlyphs: total.unsupportedGlyphs - before.unsupportedGlyphs,
		work: total.work - before.work,
	});
}

function measureScopes(
	formatting: FormattingTree,
	options: IntrinsicWidthOptions,
	root: number,
	roots: {
		id: number;
		height: number | null;
		definiteHeight?: number;
		flexDepth?: number;
	}[],
	shared?: IntrinsicScopeState,
): Readonly<IntrinsicWidthMeasurement> {
	const maxWork = intrinsicWidthWorkLimit(options);
	const state = shared ?? {
		minimum: emptyTextMetrics(),
		maximum: emptyTextMetrics(),
	};
	const minimumBefore = { ...state.minimum };
	const maximumBefore = { ...state.maximum };
	let work = 0;
	const charge = (units = 1) => {
		work += units;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Intrinsic width work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Intrinsic width work limit exceeded",
			);
		return maxWork - work;
	};
	if (!shared) {
		charge(formatting.metrics.work);
		let deferredFlexContainers = 0;
		for (const node of formatting.nodes) {
			charge();
			if (
				node.kind === "deferred" &&
				node.contentMode === "flex" &&
				node.deferredReason === "display-layout-not-supported"
			)
				deferredFlexContainers++;
		}
		if (
			Object.entries(formatting.issues).some(
				([code, count]) =>
					code !== "display-layout-not-supported" ||
					count !== deferredFlexContainers,
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Intrinsic measurement requires an issue-free supported formatting profile",
			);
	}
	const minima = new Map<number, Readonly<FormattingImageSize>>();
	const maxima = new Map<number, Readonly<FormattingImageSize>>();
	const replacedContent = new Map<number, number>();
	const pending = [...roots].reverse();
	const order: number[] = [];
	const atomicResults = new Map<number, Readonly<IntrinsicWidthMeasurement>>();
	const intrinsicContexts = new Map<
		number,
		{ containingHeight: number | null; contentHeight?: number; nesting: number }
	>();
	while (pending.length) {
		charge();
		const frame = pending.pop();
		if (!frame) break;
		const node = formatting.nodes[frame.id];
		const flex = node.contentMode === "flex";
		if (flex && node.children.length > flexLineLimits.maxItems)
			throw new AgentBrowserError(
				"resource-limit",
				"Flex intrinsic item limit exceeded",
			);
		if (
			(node.kind === "deferred" && !flex) ||
			(flex &&
				!["row", "row-reverse", "column", "column-reverse"].includes(
					node.flex?.["flex-direction"] ?? "",
				))
		)
			throw new AgentBrowserError(
				"unsupported",
				"Intrinsic flex item measurement requires supported normal-flow item content",
			);
		order.push(node.id);
		const flexDepth =
			(frame.flexDepth ?? 0) + Number(flex || isAtomicInline(node));
		if (flexDepth > flexLayoutLimits.maxNesting)
			throw new AgentBrowserError(
				"resource-limit",
				"Intrinsic flex nesting limit exceeded",
			);
		if (isAtomicInline(node) && node.id !== root) {
			const result = measureScopes(
				formatting,
				{ ...options, maxWork: remaining() },
				node.id,
				[frame],
				state,
			);
			charge(result.metrics.work);
			atomicResults.set(node.id, result);
			continue;
		}
		if (flex)
			intrinsicContexts.set(node.id, {
				containingHeight: frame.height,
				contentHeight: frame.definiteHeight,
				nesting: flexDepth - 1,
			});
		let height = frame.height;
		const style = cyclicStyle(node.box ?? initialBoxStyle);
		const contentReference = node.ref ?? node.generated?.ref;
		if (node.kind === "replaced" && node.intrinsic && contentReference) {
			charge();
			const withCrossHeight = (source: BoxStyle): BoxStyle => {
				if (frame.definiteHeight === undefined) return source;
				const cross = resolveHeightConstraints(source, 0, height);
				return {
					...source,
					height: `${frame.definiteHeight + (source["box-sizing"] === "border-box" ? cross.borderTop + cross.borderBottom + cross.paddingTop + cross.paddingBottom : 0)}px`,
				};
			};
			const replacedStyle = withCrossHeight(style);
			replacedContent.set(
				node.id,
				resolveReplacedSize(
					node.intrinsic.width,
					node.intrinsic.height,
					{
						...replacedStyle,
						width: "auto",
						"min-width": "auto",
						"max-width": "none",
					},
					0,
					height,
					!node.control,
				).contentWidth,
			);
			let minStyle = withCrossHeight(
				cyclicStyle(
					node.box ?? initialBoxStyle,
					node.control?.kind !== "button",
				),
			);
			const minWidthPercentage =
				node.control?.kind !== "button" &&
				["width", "max-width"].some((property) =>
					lengthHasPercentage(
						(node.box ?? initialBoxStyle)[property as "width" | "max-width"],
					),
				);
			if (minWidthPercentage && !node.control) {
				const minHeight = minStyle["min-height"];
				const transferStyle = {
					...minStyle,
					"min-height": lengthHasPercentage(minHeight)
						? `${resolveLayoutLength(minHeight, 0)}px`
						: minHeight,
				};
				const transferred =
					(resolveHeightConstraints(transferStyle, 0, null).minimum *
						node.intrinsic.width) /
					node.intrinsic.height;
				const borders = resolveBorders(minStyle);
				const edges =
					borders.borderLeft +
					borders.borderRight +
					resolveLayoutLength(minStyle["padding-left"], 0) +
					resolveLayoutLength(minStyle["padding-right"], 0);
				const minimum =
					minStyle["min-width"] === "auto"
						? 0
						: resolveLayoutLength(minStyle["min-width"], 0);
				minStyle = {
					...minStyle,
					"min-width": `${layoutNumber(Math.max(minimum, transferred + (minStyle["box-sizing"] === "border-box" ? edges : 0)))}px`,
				};
			}
			const minimum = resolveReplacedSize(
				node.intrinsic.width,
				node.intrinsic.height,
				minStyle,
				0,
				height,
				!node.control,
			);
			let maximum = resolveReplacedSize(
				node.intrinsic.width,
				node.intrinsic.height,
				replacedStyle,
				0,
				height,
				!node.control,
			);
			if (maximum.contentWidth < minimum.contentWidth)
				maximum = resolveReplacedSize(
					node.intrinsic.width,
					node.intrinsic.height,
					{
						...replacedStyle,
						"min-width": `${style["box-sizing"] === "border-box" ? minimum.borderBoxWidth : minimum.contentWidth}px`,
					},
					0,
					height,
					!node.control,
				);
			minima.set(
				node.id,
				Object.freeze({
					...minimum,
					id: node.id,
					ref: contentReference,
					containingWidth: 0,
					containingHeight: height,
				}),
			);
			maxima.set(
				node.id,
				Object.freeze({
					...maximum,
					id: node.id,
					ref: contentReference,
					containingWidth: 0,
					containingHeight: height,
				}),
			);
		}
		if (node.kind === "block" || flex)
			height =
				frame.definiteHeight ??
				resolveHeightConstraints(style, 0, height).definite;
		for (let index = node.children.length - 1; index >= 0; index--) {
			charge();
			const id = node.children[index];
			const definiteHeight =
				flex && !node.flex?.["flex-direction"].startsWith("column")
					? crossInput(formatting.nodes[id], node, {
							contentWidth: 0,
							contentHeight: height,
						}).definite
					: null;
			pending.push({
				id,
				height,
				flexDepth,
				...(definiteHeight === null ? {} : { definiteHeight }),
			});
		}
	}
	const widths = order
		.filter((id) => {
			charge();
			return (
				formatting.nodes[id].contentMode === "inline" && !atomicResults.has(id)
			);
		})
		.map((id) => {
			charge();
			const node = formatting.nodes[id];
			return {
				id: node.id,
				...(node.ref ? { ref: node.ref } : {}),
				contentX: 0,
				contentWidth: 0,
			};
		});
	charge(minima.size + maxima.size);
	const atomicContributions = (
		maximum: boolean,
	): Readonly<AtomicInlineMetrics>[] =>
		[...atomicResults].map(([id, result]) => {
			charge();
			const measured = result.widths.find((width) => {
				charge();
				return width.id === id;
			});
			if (!measured)
				throw new AgentBrowserError(
					"unsupported",
					"Missing intrinsic atomic contribution",
				);
			const style = cyclicStyle(formatting.nodes[id].box ?? initialBoxStyle);
			const marginLeft =
				style["margin-left"] === "auto"
					? 0
					: resolveLayoutLength(style["margin-left"], 0, true);
			const marginRight =
				style["margin-right"] === "auto"
					? 0
					: resolveLayoutLength(style["margin-right"], 0, true);
			return {
				id,
				borderBoxWidth: layoutNumber(
					Math.max(
						0,
						(maximum ? measured.maxContribution : measured.minContribution) -
							marginLeft -
							marginRight,
					),
				),
				marginLeft,
				marginRight,
			};
		});
	const textBudget = (used: MutableTextMetrics): Partial<TextLayoutLimits> => ({
		maxTokens: Math.max(
			1,
			(options.text?.maxTokens ?? textLayoutLimits.maxTokens) - used.tokens,
		),
		maxLines: Math.max(
			1,
			(options.text?.maxLines ?? textLayoutLimits.maxLines) - used.lines,
		),
		maxFragments: Math.max(
			1,
			(options.text?.maxFragments ?? textLayoutLimits.maxFragments) -
				used.fragments,
		),
		maxWork: Math.min(
			Math.max(
				1,
				(options.text?.maxWork ?? textLayoutLimits.maxWork) - used.work,
			),
			remaining(),
		),
	});
	const recordText = (
		used: MutableTextMetrics,
		added: Readonly<MutableTextMetrics>,
	) => {
		for (const key of Object.keys(used) as (keyof MutableTextMetrics)[])
			used[key] += added[key];
		for (const [limit, metric] of [
			["maxTokens", "tokens"],
			["maxLines", "lines"],
			["maxFragments", "fragments"],
			["maxWork", "work"],
		] as const)
			if (used[metric] > (options.text?.[limit] ?? textLayoutLimits[limit]))
				throw new AgentBrowserError(
					"resource-limit",
					"Intrinsic atomic text limit exceeded",
				);
	};
	const minText = measureFormattingText(
		{
			formatting,
			widths,
			images: [...minima.values()],
			atomics: atomicContributions(false),
		},
		"min-content",
		textBudget(state.minimum),
	);
	charge(minText.metrics.work);
	recordText(state.minimum, minText.metrics);
	const maxText = measureFormattingText(
		{
			formatting,
			widths,
			images: [...maxima.values()],
			atomics: atomicContributions(true),
		},
		"max-content",
		textBudget(state.maximum),
	);
	charge(maxText.metrics.work);
	recordText(state.maximum, maxText.metrics);
	const minWidths = new Map(
		minText.widths.map((entry) => {
			charge();
			return [entry.id, entry.width];
		}),
	);
	const maxWidths = new Map(
		maxText.widths.map((entry) => {
			charge();
			return [entry.id, entry.width];
		}),
	);
	const records = new Map<number, Readonly<IntrinsicWidth>>();
	for (const result of atomicResults.values())
		for (const record of result.widths) {
			charge();
			records.set(record.id, record);
		}
	for (const id of order.reverse()) {
		charge();
		if (atomicResults.has(id)) continue;
		const node: FormattingNode = formatting.nodes[id];
		if (
			!["viewport", "block", "anonymous-block", "replaced"].includes(
				node.kind,
			) &&
			node.contentMode !== "flex"
		)
			continue;
		let minContent = minWidths.get(id) ?? 0;
		let maxContent = maxWidths.get(id) ?? 0;
		if (node.kind === "replaced" && node.intrinsic) {
			const measured = replacedContent.get(id);
			if (measured === undefined)
				throw new AgentBrowserError(
					"unsupported",
					"Missing intrinsic replaced content size",
				);
			minContent = maxContent = measured;
		} else if (
			node.contentMode === "flex" &&
			!node.flex?.["flex-direction"].startsWith("column")
		) {
			const gap =
				node.flex?.["column-gap"] === "normal"
					? 0
					: resolveLayoutLength(node.flex?.["column-gap"] ?? "0px", 0);
			const wrap = node.flex?.["flex-wrap"] !== "nowrap";
			let minimumSum = 0;
			let maximumSum = 0;
			for (const child of node.children) {
				charge();
				const measured = records.get(child);
				if (!measured)
					throw new AgentBrowserError(
						"unsupported",
						"Missing intrinsic flex contribution",
					);
				const minimum = flexIntrinsicContribution(
					formatting.nodes[child],
					measured,
					false,
				);
				const maximum = flexIntrinsicContribution(
					formatting.nodes[child],
					measured,
					true,
				);
				minimumSum = layoutNumber(minimumSum + minimum, true);
				maximumSum = layoutNumber(maximumSum + maximum, true);
				minContent = Math.max(minContent, minimum);
			}
			const gaps = Math.max(0, node.children.length - 1) * gap;
			if (!wrap)
				minContent = Math.max(0, layoutNumber(minimumSum + gaps, true));
			maxContent = Math.max(0, layoutNumber(maximumSum + gaps, true));
		} else if (node.contentMode === "blocks" || node.contentMode === "flex") {
			for (const child of node.children) {
				charge();
				const measured = records.get(child);
				if (!measured)
					throw new AgentBrowserError(
						"unsupported",
						"Missing intrinsic block contribution",
					);
				minContent = Math.max(minContent, measured.minContribution);
				maxContent = Math.max(maxContent, measured.maxContribution);
			}
			if (
				node.contentMode === "flex" &&
				node.flex?.["flex-direction"].startsWith("column") &&
				node.flex["flex-wrap"] !== "nowrap"
			) {
				if (!state.cyclicFormatting)
					state.cyclicFormatting = {
						...formatting,
						nodes: formatting.nodes.map((entry) => {
							charge();
							return {
								...entry,
								...(entry.box ? { box: cyclicStyle(entry.box) } : {}),
								...(entry.flex
									? {
											flex: {
												...entry.flex,
												"column-gap":
													entry.flex["column-gap"] === "normal"
														? "normal"
														: `${resolveLayoutLength(entry.flex["column-gap"], 0)}px`,
											},
										}
									: {}),
							};
						}),
					};
				const context = intrinsicContexts.get(id);
				if (!context)
					throw new AgentBrowserError(
						"unsupported",
						"Missing intrinsic column context",
					);
				const widths = node.children.map((child) => {
					charge();
					const measured = records.get(child);
					if (!measured)
						throw new AgentBrowserError(
							"unsupported",
							"Missing intrinsic column item",
						);
					return measured;
				});
				const layout = layoutFormattingColumnContainer(
					state.cyclicFormatting,
					id,
					{
						contentWidth: maxContent,
						containingWidth: 0,
						containingHeight: context.containingHeight,
					},
					{ maxWork: remaining(), reflow: { text: options.text } },
					{ ...context, atomicRoot: node.level === "inline" },
					{
						stage: "native-intrinsic-widths",
						partial: true,
						revision: formatting.revision,
						root: id,
						widths,
						metrics: {
							work,
							formattingWork: formatting.metrics.work,
							minText: minText.metrics,
							maxText: maxText.metrics,
							boxes: widths.length,
						},
					},
				);
				charge(layout.metrics.work);
				maxContent = layout.naturalCrossSize;
			}
		}
		maxContent = Math.max(minContent, maxContent);
		const replacedMin = minima.get(id);
		const replacedMax = maxima.get(id);
		const style = cyclicStyle(node.box ?? initialBoxStyle);
		const minContribution = replacedMin
			? layoutNumber(
					replacedMin.borderBoxWidth +
						replacedMin.marginLeft +
						replacedMin.marginRight,
					true,
				)
			: contribution(style, minContent);
		const maxContribution = Math.max(
			minContribution,
			replacedMax
				? layoutNumber(
						replacedMax.borderBoxWidth +
							replacedMax.marginLeft +
							replacedMax.marginRight,
						true,
					)
				: contribution(style, maxContent),
		);
		records.set(
			id,
			Object.freeze({
				id,
				...(node.ref ? { ref: node.ref } : {}),
				minContent,
				maxContent,
				minContribution,
				maxContribution,
			}),
		);
	}
	const result = [...records.values()].sort((first, second) => {
		charge();
		return first.id - second.id;
	});
	return Object.freeze({
		stage: "native-intrinsic-widths" as const,
		partial: true as const,
		revision: formatting.revision,
		root,
		widths: Object.freeze(result),
		metrics: Object.freeze({
			work,
			formattingWork: shared ? 0 : formatting.metrics.work,
			minText: textMetricDifference(state.minimum, minimumBefore),
			maxText: textMetricDifference(state.maximum, maximumBefore),
			boxes: result.length,
		}),
	});
}
