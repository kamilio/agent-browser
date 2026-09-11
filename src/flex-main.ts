import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import { initialFlexStyle } from "./css-flex.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	flexLineLimits,
	resolveFlexLines,
	type FlexJustification,
	type FlexLineItemInput,
} from "./flex-line.js";
import {
	buildFormattingTree,
	formattingLimits,
	type FormattingTree,
	type FormattingNode,
} from "./formatting-tree.js";
import {
	intrinsicWidthWorkLimit,
	measureFormattingFlexItemWidths,
	type IntrinsicWidthOptions,
} from "./intrinsic-widths.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import {
	resolveHeightConstraints,
	resolveReplacedSize,
} from "./replaced-box.js";

export const flexMainLimits = Object.freeze({ maxWork: 8_000_000 });
export interface FlexMainConstraints {
	contentWidth: number;
	contentHeight: number | null;
}
export interface FlexMainOptions {
	maxWork?: number;
	intrinsic?: IntrinsicWidthOptions;
}
export interface MeasuredFlexMainItem extends FlexLineItemInput {
	id: number;
	ref?: string;
	minContent: number;
	maxContent: number;
	baseSource:
		| "definite"
		| "min-content"
		| "max-content"
		| "fit-content"
		| "aspect-ratio";
	minimumSource: "explicit" | "content-based";
	definiteCrossSize: number | null;
}

export function flexMainWorkLimit(
	constraints: FlexMainConstraints,
	options: FlexMainOptions = {},
) {
	if (
		!constraints ||
		typeof constraints !== "object" ||
		Array.isArray(constraints) ||
		Object.keys(constraints).some(
			(key) => !["contentWidth", "contentHeight"].includes(key),
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid flex main constraints",
		);
	layoutNumber(constraints.contentWidth);
	if (constraints.contentHeight !== null)
		layoutNumber(constraints.contentHeight);
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some((key) => !["maxWork", "intrinsic"].includes(key))
	)
		throw new AgentBrowserError("invalid-input", "Invalid flex main options");
	const maximum =
		options.maxWork === undefined ? flexMainLimits.maxWork : options.maxWork;
	if (
		!Number.isSafeInteger(maximum) ||
		maximum < 1 ||
		maximum > flexMainLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid flex main work limit",
		);
	intrinsicWidthWorkLimit(
		options.intrinsic === undefined ? {} : options.intrinsic,
	);
	return maximum;
}

export function crossInput(
	node: FormattingNode,
	container: FormattingNode,
	constraints: FlexMainConstraints,
) {
	const style = node.box ?? initialBoxStyle;
	const flex = node.flex ?? initialFlexStyle;
	const parent = container.flex ?? initialFlexStyle;
	const vertical = resolveHeightConstraints(
		style,
		constraints.contentWidth,
		constraints.contentHeight,
	);
	const clamp = (height: number) =>
		Math.max(
			vertical.minimum,
			Math.min(height, vertical.maximum ?? Number.POSITIVE_INFINITY),
		);
	let definite = vertical.definite;
	const self =
		flex["align-self"] === "auto" ? parent["align-items"] : flex["align-self"];
	if (
		definite === null &&
		parent["flex-wrap"] === "nowrap" &&
		constraints.contentHeight !== null &&
		style.height === "auto" &&
		["normal", "stretch"].includes(self.replace(/^(safe|unsafe) /, "")) &&
		style["margin-top"] !== "auto" &&
		style["margin-bottom"] !== "auto"
	)
		definite = clamp(
			Math.max(
				0,
				constraints.contentHeight -
					vertical.borderTop -
					vertical.borderBottom -
					vertical.paddingTop -
					vertical.paddingBottom -
					resolveLayoutLength(
						style["margin-top"],
						constraints.contentWidth,
						true,
					) -
					resolveLayoutLength(
						style["margin-bottom"],
						constraints.contentWidth,
						true,
					),
			),
		);
	if (definite !== null) definite = layoutNumber(definite);
	return { vertical, definite, clamp };
}

export function resolveFlexMainSizes(
	tree: DocumentTree,
	reference: string,
	constraints: FlexMainConstraints,
	options: FlexMainOptions = {},
) {
	const maxWork = flexMainWorkLimit(constraints, options);
	tree.resolve(reference);
	const formatting = buildFormattingTree(tree, {
		...options.intrinsic?.formatting,
		maxWork: Math.min(
			options.intrinsic?.formatting?.maxWork ?? formattingLimits.maxWork,
			maxWork,
			options.intrinsic?.maxWork ?? maxWork,
		),
	});
	const container = formatting.nodes.find((node) => node.ref === reference);
	if (!container)
		throw new AgentBrowserError(
			"not-found",
			"Flex formatting container is unavailable",
		);
	return resolveFormattingFlexMainSizes(
		formatting,
		container.id,
		constraints,
		options,
	);
}

export function resolveFormattingFlexMainSizes(
	formatting: FormattingTree,
	containerId: number,
	constraints: FlexMainConstraints,
	options: FlexMainOptions = {},
	validatedFormatting = false,
) {
	const maxWork = flexMainWorkLimit(constraints, options);
	const container = formatting.nodes[containerId];
	if (
		!Number.isSafeInteger(containerId) ||
		!container ||
		container.contentMode !== "flex" ||
		!container.flex
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Main sizing requires a retained flex container",
		);
	const direction = container.flex["flex-direction"];
	if (direction !== "row" && direction !== "row-reverse")
		throw new AgentBrowserError(
			"unsupported",
			"Column flex main sizing requires block-axis intrinsic layout",
		);
	const reverse = direction === "row-reverse";
	const wrap = container.flex["flex-wrap"] !== "nowrap";
	const align = container.flex["justify-content"];
	const alignment = align.replace(/^(safe|unsafe) /, "");
	const position = (
		["normal", "stretch"].includes(alignment)
			? "flex-start"
			: ["start", "left"].includes(alignment)
				? reverse
					? "flex-end"
					: "flex-start"
				: ["end", "right"].includes(alignment)
					? reverse
						? "flex-start"
						: "flex-end"
					: alignment
	) as FlexJustification;
	const justify = (
		align.startsWith("safe ") ? `safe ${position}` : position
	) as FlexJustification;
	if (
		![
			"flex-start",
			"flex-end",
			"center",
			"space-between",
			"space-around",
			"space-evenly",
			"safe flex-start",
			"safe flex-end",
			"safe center",
		].includes(justify)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported flex main alignment",
		);
	if (container.children.length > flexLineLimits.maxItems)
		throw new AgentBrowserError(
			"resource-limit",
			"Flex main item limit exceeded",
		);
	let work = 0;
	const charge = (units = 1) => {
		work += units;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Flex main work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Flex main work limit exceeded",
			);
		return maxWork - work;
	};
	const intrinsicLimit = intrinsicWidthWorkLimit(
		options.intrinsic === undefined ? {} : options.intrinsic,
	);
	const crossSizes = new Map<number, ReturnType<typeof crossInput>>();
	const definiteHeights = new Map<number, number>();
	for (const id of container.children) {
		charge();
		const cross = crossInput(formatting.nodes[id], container, constraints);
		crossSizes.set(id, cross);
		if (cross.definite !== null) definiteHeights.set(id, cross.definite);
	}
	const measured = measureFormattingFlexItemWidths(
		formatting,
		containerId,
		constraints.contentHeight,
		{ ...options.intrinsic, maxWork: Math.min(intrinsicLimit, remaining()) },
		definiteHeights,
		validatedFormatting,
	);
	charge(measured.metrics.work);
	const widths = new Map(
		measured.widths.map((width) => {
			charge();
			return [width.id, width];
		}),
	);
	const width = constraints.contentWidth;
	const items: Readonly<MeasuredFlexMainItem>[] = [];
	for (const id of container.children) {
		charge();
		const node = formatting.nodes[id];
		const intrinsic = widths.get(id);
		if (!intrinsic)
			throw new AgentBrowserError(
				"unsupported",
				"Missing measured flex item content",
			);
		const style = node.box ?? initialBoxStyle;
		const flex = node.flex ?? initialFlexStyle;
		const borders = resolveBorders(style);
		const edges = layoutNumber(
			borders.borderLeft +
				borders.borderRight +
				resolveLayoutLength(style["padding-left"], width) +
				resolveLayoutLength(style["padding-right"], width),
		);
		const adjustment = style["box-sizing"] === "border-box" ? edges : 0;
		const size = (value: string) =>
			Math.max(0, resolveLayoutLength(value, width) - adjustment);
		const margin = (side: "left" | "right" | "top" | "bottom") =>
			style[`margin-${side}`] === "auto"
				? ("auto" as const)
				: resolveLayoutLength(style[`margin-${side}`], width, true);
		const start = margin(reverse ? "right" : "left");
		const end = margin(reverse ? "left" : "right");
		const maximum =
			style["max-width"] === "none" ? null : size(style["max-width"]);
		const specified = style.width === "auto" ? null : size(style.width);
		let minContent = intrinsic.minContent;
		let maxContent = intrinsic.maxContent;
		let ratioBase: number | null = null;
		let transferred: number | null = null;
		if (node.kind === "replaced" && node.intrinsic) {
			const content = resolveReplacedSize(
				node.intrinsic.width,
				node.intrinsic.height,
				{ ...style, width: "auto", "min-width": "auto", "max-width": "none" },
				width,
				constraints.contentHeight,
				!node.control && node.intrinsicRatio !== false,
			).contentWidth;
			minContent = maxContent = content;
			if (!node.control && node.intrinsicRatio !== false) {
				const cross = crossSizes.get(id);
				if (!cross)
					throw new AgentBrowserError(
						"unsupported",
						"Missing flex cross-size prerequisites",
					);
				const { vertical, clamp } = cross;
				const ratio = node.intrinsic.width / node.intrinsic.height;
				if (vertical.preferred !== null)
					transferred = layoutNumber(clamp(vertical.preferred) * ratio);
				if (cross.definite !== null)
					ratioBase = layoutNumber(cross.definite * ratio);
				minContent = layoutNumber(clamp(minContent / ratio) * ratio);
			}
		}
		let minimum = minContent;
		if (transferred !== null) minimum = Math.min(minimum, transferred);
		if (specified !== null) minimum = Math.min(minimum, specified);
		if (maximum !== null) minimum = Math.min(minimum, maximum);
		if (style["min-width"] !== "auto") minimum = size(style["min-width"]);
		let basis = flex["flex-basis"];
		if (basis === "auto")
			basis = style.width === "auto" ? "content" : style.width;
		let base: number;
		let source: MeasuredFlexMainItem["baseSource"];
		if (basis === "content" && ratioBase !== null) {
			base = ratioBase;
			source = "aspect-ratio";
		} else if (basis === "content" || basis === "max-content") {
			base = maxContent;
			source = "max-content";
		} else if (basis === "min-content") {
			base = minContent;
			source = "min-content";
		} else if (basis === "fit-content") {
			base = Math.min(
				maxContent,
				Math.max(
					minContent,
					width -
						edges -
						(start === "auto" ? 0 : start) -
						(end === "auto" ? 0 : end),
				),
			);
			source = "fit-content";
		} else {
			base = resolveLayoutLength(basis, width) - adjustment;
			source = "definite";
		}
		items.push(
			Object.freeze({
				definiteCrossSize: crossSizes.get(id)?.definite ?? null,
				id,
				...(node.ref ? { ref: node.ref } : {}),
				minContent,
				maxContent,
				baseSource: source,
				minimumSource:
					style["min-width"] === "auto" ? "content-based" : "explicit",
				baseSize: layoutNumber(base, true),
				minSize: layoutNumber(minimum),
				maxSize: maximum,
				borderPadding: edges,
				marginStart: start,
				marginEnd: end,
				grow: Number(flex["flex-grow"]),
				shrink: Number(flex["flex-shrink"]),
				order: Number(flex.order),
			}),
		);
	}
	const gap =
		container.flex["column-gap"] === "normal"
			? 0
			: resolveLayoutLength(container.flex["column-gap"], width);
	const inputs = items.map((item) => {
		charge();
		return {
			baseSize: item.baseSize,
			minSize: item.minSize,
			maxSize: item.maxSize,
			grow: item.grow,
			shrink: item.shrink,
			borderPadding: item.borderPadding,
			marginStart: item.marginStart,
			marginEnd: item.marginEnd,
			order: item.order,
		};
	});
	const resolved = resolveFlexLines(inputs, width, {
		wrap,
		gap,
		justify,
		overflowStart: reverse ? "flex-end" : "flex-start",
		maxWork: Math.min(flexLineLimits.maxWork, remaining()),
	});
	charge(resolved.metrics.work);
	return Object.freeze({
		stage: "measured-flex-main-sizes" as const,
		partial: true as const,
		revision: formatting.revision,
		container: containerId,
		reference: container.ref,
		direction,
		wrap: container.flex["flex-wrap"],
		constraints: Object.freeze({ ...constraints }),
		items: Object.freeze(items),
		resolved,
		metrics: Object.freeze({
			work,
			intrinsic: measured.metrics,
			sizing: resolved.metrics,
		}),
	});
}
