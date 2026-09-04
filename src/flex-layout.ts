import { initialBoxStyle } from "./css-box.js";
import { initialFlexStyle } from "./css-flex.js";
import {
	collectFlexBaselines,
	placeFlexLayout,
	type FlexPlacement as Placement,
} from "./flex-placement.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	flexReflowLimits,
	flexReflowWorkLimits,
	reflowAllocatedFlexItems,
	reflowFormattingFlexItems,
	type FlexReflowOptions,
} from "./flex-reflow.js";
import {
	buildFormattingTree,
	formattingLimits,
	type FormattingTree,
} from "./formatting-tree.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import { resolveHeightConstraints } from "./replaced-box.js";
import { layoutFormattingColumnContainer } from "./flex-column.js";

export const flexLayoutLimits = Object.freeze({
	maxWork: 24_000_000,
	maxNesting: 32,
});
export interface FlexContainerConstraints {
	contentWidth: number;
	containingWidth: number;
	containingHeight: number | null;
}
export interface FlexContainerLayoutOptions {
	maxWork?: number;
	reflow?: FlexReflowOptions;
}
export interface FlexLayoutContext {
	validatedFormatting?: boolean;
	atomicRoot?: boolean;
	nesting?: number;
	contentHeight?: number;
	contentHeightDefinite?: boolean;
	intrinsicHeight?: boolean;
}
type Reflow = ReturnType<typeof reflowFormattingFlexItems>;
interface BaselineGroup {
	start: number;
	end: number;
	count: number;
}
interface CrossLine {
	index: number;
	size: number;
	offset: number;
	first: BaselineGroup;
	last: BaselineGroup;
}
function checked(
	constraints: FlexContainerConstraints,
	options: FlexContainerLayoutOptions,
) {
	if (
		!constraints ||
		typeof constraints !== "object" ||
		Array.isArray(constraints) ||
		Object.keys(constraints).some(
			(key) =>
				!["contentWidth", "containingWidth", "containingHeight"].includes(key),
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid flex container constraints",
		);
	layoutNumber(constraints.contentWidth);
	layoutNumber(constraints.containingWidth);
	if (constraints.containingHeight !== null)
		layoutNumber(constraints.containingHeight);
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some((key) => !["maxWork", "reflow"].includes(key))
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid flex container layout options",
		);
	const reflow = flexReflowWorkLimits(
		{ contentWidth: constraints.contentWidth, contentHeight: null },
		options.reflow,
	);
	const maxWork =
		options.maxWork === undefined ? flexLayoutLimits.maxWork : options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > flexLayoutLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid flex container layout work limit",
		);
	return { maxWork, reflow };
}

function alignment(value: string, reverse: boolean, free: number) {
	const safe = value.startsWith("safe ");
	const keyword = value.replace(/^(safe|unsafe) /, "");
	if (safe && free < 0) return 0;
	if (["start", "self-start"].includes(keyword)) return 0;
	if (["end", "self-end"].includes(keyword)) return free;
	if (keyword === "center") return free / 2;
	if (keyword === "flex-end") return reverse ? 0 : free;
	if (["flex-start", "normal", "stretch"].includes(keyword))
		return reverse ? free : 0;
	throw new AgentBrowserError(
		"unsupported",
		"Unsupported flex cross alignment",
	);
}

export function layoutFlexContainer(
	tree: DocumentTree,
	reference: string,
	constraints: FlexContainerConstraints,
	options: FlexContainerLayoutOptions = {},
) {
	const limits = checked(constraints, options);
	tree.resolve(reference);
	const phase = options.reflow?.main?.intrinsic?.formatting;
	const formatting = buildFormattingTree(tree, {
		...phase,
		maxWork: Math.min(
			phase?.maxWork ?? formattingLimits.maxWork,
			options.reflow?.main?.intrinsic?.maxWork ?? limits.reflow.main,
			limits.reflow.main,
			limits.reflow.maxWork,
			limits.maxWork,
		),
	});
	const container = formatting.nodes.find((node) => node.ref === reference);
	if (!container)
		throw new AgentBrowserError(
			"not-found",
			"Flex formatting container is unavailable",
		);
	return layoutFormattingFlexContainer(
		formatting,
		container.id,
		constraints,
		options,
	);
}

export function layoutFormattingFlexContainer(
	formatting: FormattingTree,
	containerId: number,
	constraints: FlexContainerConstraints,
	options: FlexContainerLayoutOptions = {},
	context: Readonly<FlexLayoutContext> = {},
) {
	const limits = checked(constraints, options);
	const nesting = context.nesting ?? 0;
	if (
		!Number.isSafeInteger(nesting) ||
		nesting < 0 ||
		nesting >= flexLayoutLimits.maxNesting
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Flex nesting limit exceeded",
		);
	const container = formatting.nodes[containerId];
	if (
		!Number.isSafeInteger(containerId) ||
		!container?.flex ||
		container.contentMode !== "flex"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Container layout requires a retained flex container",
		);
	if (container.flex["flex-direction"].startsWith("column"))
		return layoutFormattingColumnContainer(
			formatting,
			containerId,
			constraints,
			options,
			context,
		);
	let work = 0;
	const charge = (units = 1) => {
		work += units;
		if (work > limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Flex container layout work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Flex container layout work limit exceeded",
			);
		return limits.maxWork - work;
	};
	let cross = resolveHeightConstraints(
		container.box ?? initialBoxStyle,
		constraints.containingWidth,
		constraints.containingHeight,
	);
	if (context.intrinsicHeight)
		cross = {
			...cross,
			preferred: null,
			minimum: 0,
			maximum: null,
			definite: null,
		};
	if (context.contentHeight !== undefined) {
		layoutNumber(context.contentHeight);
		const definite = Math.max(
			cross.minimum,
			Math.min(
				context.contentHeight,
				cross.maximum ?? Number.POSITIVE_INFINITY,
			),
		);
		cross = {
			...cross,
			preferred: definite,
			definite: context.contentHeightDefinite === false ? null : definite,
		};
	}
	const clamp = (height: number) =>
		layoutNumber(
			Math.max(
				cross.minimum,
				Math.min(height, cross.maximum ?? Number.POSITIVE_INFINITY),
			),
		);
	let reflow = reflowFormattingFlexItems(
		formatting,
		containerId,
		{ contentWidth: constraints.contentWidth, contentHeight: cross.definite },
		{
			...options.reflow,
			maxWork: Math.min(limits.reflow.maxWork, remaining()),
		},
		nesting,
		context.validatedFormatting,
	);
	const mainWork = reflow.metrics.work;
	charge(mainWork);
	let baselineValues = collectFlexBaselines(reflow.layout, formatting, charge);
	const wrap = container.flex["flex-wrap"] !== "nowrap";
	const reverse = container.flex["flex-wrap"] === "wrap-reverse";
	const rowGap =
		container.flex["row-gap"] === "normal"
			? 0
			: resolveLayoutLength(container.flex["row-gap"], cross.definite ?? 0);
	const group = (): BaselineGroup => ({
		start: Number.NEGATIVE_INFINITY,
		end: Number.NEGATIVE_INFINITY,
		count: 0,
	});
	const lines: CrossLine[] = reflow.main.resolved.lines.map((_line, index) => {
		charge();
		return { index, size: 0, offset: 0, first: group(), last: group() };
	});
	const self = (id: number) => {
		const own = formatting.nodes[id].flex ?? initialFlexStyle;
		return own["align-self"] === "auto"
			? (container.flex?.["align-items"] ?? "normal")
			: own["align-self"];
	};
	for (const item of reflow.items) {
		charge();
		const style = formatting.nodes[item.id].box ?? initialBoxStyle;
		const mode = self(item.id);
		const line = lines[item.line];
		if (
			["baseline", "last baseline"].includes(mode) &&
			style["margin-top"] !== "auto" &&
			style["margin-bottom"] !== "auto"
		) {
			const measured = baselineValues.get(item.id);
			if (measured?.unsupported)
				throw new AgentBrowserError(
					"unsupported",
					"Software control block baselines are not implemented",
				);
			const baseline =
				(mode === "baseline" ? measured?.first : measured?.last) ??
				item.box.borderBoxHeight;
			const distance = reverse ? item.box.borderBoxHeight - baseline : baseline;
			const selected = mode === "baseline" ? line.first : line.last;
			selected.start = Math.max(
				selected.start,
				(reverse ? item.box.marginBottom : item.box.marginTop) + distance,
			);
			selected.end = Math.max(
				selected.end,
				(reverse ? item.box.marginTop : item.box.marginBottom) +
					item.box.borderBoxHeight -
					distance,
			);
			selected.count++;
		} else line.size = Math.max(line.size, item.outerCrossSize);
	}
	for (const line of lines) {
		charge();
		for (const selected of [line.first, line.last])
			if (selected.count)
				line.size = Math.max(line.size, selected.start + selected.end);
		line.size = layoutNumber(Math.max(0, line.size));
		if (!wrap) line.size = clamp(cross.preferred ?? line.size);
	}
	const total = () =>
		lines.reduce((sum, line) => {
			charge();
			return layoutNumber(sum + line.size);
		}, 0) +
		rowGap * Math.max(0, lines.length - 1);
	const naturalCrossSize = layoutNumber(total());
	const contentHeight = clamp(cross.preferred ?? naturalCrossSize);
	const alignContent = wrap ? container.flex["align-content"] : "flex-start";
	let free = contentHeight - naturalCrossSize;
	if (
		["normal", "stretch"].includes(alignContent) &&
		free > 0 &&
		lines.length
	) {
		const addition = free / lines.length;
		for (const line of lines) {
			charge();
			line.size = layoutNumber(line.size + addition);
		}
		free = 0;
	}
	let separation = rowGap;
	let leading = 0;
	if (alignContent.startsWith("space-")) {
		if (free < 0) leading = reverse ? free : 0;
		else if (alignContent === "space-between")
			separation += lines.length > 1 ? free / (lines.length - 1) : 0;
		else if (alignContent === "space-around") {
			separation += lines.length ? free / lines.length : 0;
			leading = lines.length ? free / (2 * lines.length) : 0;
		} else if (alignContent === "space-evenly") {
			separation += free / (lines.length + 1);
			leading = free / (lines.length + 1);
		} else
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported flex line distribution",
			);
	} else {
		const physical = alignment(alignContent, reverse, free);
		leading = reverse ? free - physical : physical;
	}
	let cursor = leading;
	for (const line of lines) {
		charge();
		line.offset = layoutNumber(
			reverse ? contentHeight - cursor - line.size : cursor,
			true,
		);
		cursor = layoutNumber(
			cursor + line.size + (line.index + 1 < lines.length ? separation : 0),
			true,
		);
	}
	const heights = new Map<number, number>();
	for (const item of reflow.items) {
		charge();
		const style = formatting.nodes[item.id].box ?? initialBoxStyle;
		const own = resolveHeightConstraints(
			style,
			constraints.contentWidth,
			cross.definite,
		);
		if (
			!["normal", "stretch"].includes(
				self(item.id).replace(/^(safe|unsafe) /, ""),
			) ||
			own.preferred !== null ||
			style["margin-top"] === "auto" ||
			style["margin-bottom"] === "auto"
		)
			continue;
		const available =
			lines[item.line].size -
			item.box.marginTop -
			item.box.marginBottom -
			item.box.borderTop -
			item.box.borderBottom -
			item.box.paddingTop -
			item.box.paddingBottom;
		const height = layoutNumber(
			Math.max(
				own.minimum,
				Math.min(
					Math.max(0, available),
					own.maximum ?? Number.POSITIVE_INFINITY,
				),
			),
		);
		if (height !== item.box.contentHeight || item.box.definiteHeight === null)
			heights.set(item.id, height);
	}
	let secondPassWork = 0;
	if (heights.size) {
		reflow = reflowAllocatedFlexItems(
			formatting,
			reflow.main,
			{
				...options.reflow,
				maxWork: Math.min(
					limits.reflow.maxWork,
					flexReflowLimits.maxWork,
					remaining(),
				),
			},
			heights,
			nesting,
		);
		secondPassWork = reflow.metrics.work;
		charge(secondPassWork);
		baselineValues = collectFlexBaselines(reflow.layout, formatting, charge);
	}
	const placements = new Map<number, Placement>();
	const mainPositions = new Map<
		number,
		Reflow["main"]["resolved"]["lines"][number]["items"][number]
	>();
	for (const line of reflow.main.resolved.lines)
		for (const item of line.items) {
			charge();
			mainPositions.set(item.index, item);
		}
	for (const item of reflow.items) {
		charge();
		const line = lines[item.line];
		const style = formatting.nodes[item.id].box ?? initialBoxStyle;
		const mode = self(item.id);
		let top = item.box.marginTop;
		let bottom = item.box.marginBottom;
		const autoTop = style["margin-top"] === "auto";
		const autoBottom = style["margin-bottom"] === "auto";
		let offset: number;
		const freeSpace = line.size - top - bottom - item.box.borderBoxHeight;
		const measured = baselineValues.get(item.id);
		const firstBaseline = measured?.unsupported
			? null
			: (measured?.first ?? item.box.borderBoxHeight);
		const lastBaseline = measured?.unsupported
			? null
			: (measured?.last ?? item.box.borderBoxHeight);
		if (autoTop || autoBottom) {
			if (freeSpace > 0) {
				const share = freeSpace / (Number(autoTop) + Number(autoBottom));
				if (autoTop) top = share;
				if (autoBottom) bottom = share;
			} else {
				if (autoTop) top = 0;
				bottom = line.size - item.box.borderBoxHeight - top;
			}
			offset = top;
		} else if (mode === "baseline" || mode === "last baseline") {
			const baseline = mode === "baseline" ? firstBaseline : lastBaseline;
			if (baseline === null)
				throw new AgentBrowserError(
					"unsupported",
					"Missing flex item baseline",
				);
			const selected = mode === "baseline" ? line.first : line.last;
			const target =
				mode === "baseline" ? selected.start : line.size - selected.end;
			const logical =
				target - (reverse ? item.box.borderBoxHeight - baseline : baseline);
			offset = reverse
				? line.size - logical - item.box.borderBoxHeight
				: logical;
		} else offset = top + alignment(mode, reverse, freeSpace);
		const allocated = mainPositions.get(item.index);
		if (!allocated)
			throw new AgentBrowserError("unsupported", "Missing flex main placement");
		const x = layoutNumber(
			reflow.main.direction === "row-reverse"
				? constraints.contentWidth -
						allocated.mainOffset -
						allocated.borderBoxSize
				: allocated.mainOffset,
			true,
		);
		const y = layoutNumber(line.offset + offset, true);
		placements.set(item.id, {
			id: item.id,
			index: item.index,
			line: item.line,
			x,
			y,
			marginTop: layoutNumber(top, true),
			marginBottom: layoutNumber(bottom, true),
			firstBaseline:
				firstBaseline === null ? null : layoutNumber(y + firstBaseline, true),
			lastBaseline:
				lastBaseline === null ? null : layoutNumber(y + lastBaseline, true),
		});
	}
	const { boxes, contexts, images, items } = placeFlexLayout(
		reflow.layout,
		placements,
		charge,
	);
	const paintOrder: number[] = [];
	for (const line of reflow.main.resolved.lines)
		for (const item of line.items) {
			charge();
			paintOrder.push(reflow.main.items[item.index].id);
		}
	const exportedBaseline = (last: boolean) => {
		if (!lines.length) return { value: null, unsupported: false };
		const lineIndex = last !== reverse ? lines.length - 1 : 0;
		const ordered = [...reflow.main.resolved.lines[lineIndex].items];
		if (last !== (reflow.main.direction === "row-reverse")) ordered.reverse();
		const ids = ordered.map((item) => {
			charge();
			return reflow.main.items[item.index].id;
		});
		const field = last ? "last" : "first";
		for (const mode of last
			? ["last baseline", "baseline"]
			: ["baseline", "last baseline"]) {
			for (const id of ids) {
				charge();
				const style = formatting.nodes[id].box ?? initialBoxStyle;
				if (
					self(id) !== mode ||
					style["margin-top"] === "auto" ||
					style["margin-bottom"] === "auto"
				)
					continue;
				const item = placements.get(id) as Placement;
				return {
					value: mode === "baseline" ? item.firstBaseline : item.lastBaseline,
					unsupported: !!baselineValues.get(id)?.unsupported,
				};
			}
		}
		for (const id of ids) {
			charge();
			const value = baselineValues.get(id);
			if (value?.unsupported) return { value: null, unsupported: true };
			if (value?.[field] !== null && value?.[field] !== undefined) {
				const item = placements.get(id) as Placement;
				return {
					value: last ? item.lastBaseline : item.firstBaseline,
					unsupported: false,
				};
			}
		}
		const item = placements.get(ids[0]);
		return {
			value: item ? (last ? item.lastBaseline : item.firstBaseline) : null,
			unsupported: false,
		};
	};
	const firstBaseline = exportedBaseline(false);
	const lastBaseline = exportedBaseline(true);
	return Object.freeze({
		stage: "native-flex-container-layout" as const,
		partial: true as const,
		revision: formatting.revision,
		reference: container.ref,
		container: containerId,
		formatting,
		main: reflow.main,
		contentWidth: constraints.contentWidth,
		contentHeight,
		naturalCrossSize,
		naturalContentHeight: naturalCrossSize,
		rowGap,
		lines: Object.freeze(
			lines.map((line) => {
				charge();
				return Object.freeze({
					index: line.index,
					crossSize: line.size,
					crossOffset: line.offset,
				});
			}),
		),
		items: Object.freeze(items),
		boxes: Object.freeze(boxes),
		contexts: Object.freeze(contexts),
		images: Object.freeze(images),
		textMetrics: reflow.layout.text.metrics,
		atomics: reflow.layout.text.horizontal.atomics ?? [],
		paintOrder: Object.freeze(paintOrder),
		baselines: Object.freeze({
			first: firstBaseline.value,
			last: lastBaseline.value,
			unsupported: firstBaseline.unsupported || lastBaseline.unsupported,
		}),
		metrics: Object.freeze({
			work,
			initialReflow: mainWork,
			stretchReflow: secondPassWork,
			reflowPasses: heights.size ? 2 : 1,
			stretchedItems: heights.size,
		}),
	});
}
