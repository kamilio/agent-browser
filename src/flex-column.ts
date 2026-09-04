import type { BlockWidth } from "./block-width.js";
import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import { initialFlexStyle } from "./css-flex.js";
import { lengthHasPercentage } from "./css-math.js";
import { documentLayoutLimits } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { layoutFormattingFlexFlow } from "./flex-document.js";
import type {
	FlexContainerConstraints,
	FlexContainerLayoutOptions,
	FlexLayoutContext,
} from "./flex-layout.js";
import {
	flexLineLimits,
	resolveFlexLines,
	type FlexJustification,
} from "./flex-line.js";
import type { MeasuredFlexMainItem } from "./flex-main.js";
import {
	collectFlexBaselines,
	placeFlexLayout,
	type FlexPlacement,
} from "./flex-placement.js";
import { flexReflowWorkLimits } from "./flex-reflow.js";
import {
	formattingLimits,
	resolveFormattingBlockWidths,
	type BlockReflowRoot,
	type FormattingTree,
} from "./formatting-tree.js";
import { measureFormattingFlexItemWidths } from "./intrinsic-widths.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import {
	resolveHeightConstraints,
	resolveReplacedSize,
} from "./replaced-box.js";
import { layoutFormattingText } from "./text-layout.js";

export function layoutFormattingColumnContainer(
	formatting: FormattingTree,
	containerId: number,
	constraints: FlexContainerConstraints,
	options: FlexContainerLayoutOptions,
	context: FlexLayoutContext,
	prepared?: ReturnType<typeof measureFormattingFlexItemWidths>,
) {
	const container = formatting.nodes[containerId];
	const flex = container.flex ?? initialFlexStyle;
	if (container.level !== "block" && !context.atomicRoot)
		throw new AgentBrowserError(
			"unsupported",
			"Column layout requires a block-level flex container",
		);
	const wrapping = flex["flex-wrap"] as "nowrap" | "wrap" | "wrap-reverse";
	const wrap = wrapping !== "nowrap";
	const crossReverse = wrapping === "wrap-reverse";
	const direction = flex["flex-direction"] as "column" | "column-reverse";
	const reverse = direction === "column-reverse";
	const maxWork = options.maxWork ?? 24_000_000;
	const limits = flexReflowWorkLimits(
		{ contentWidth: constraints.contentWidth, contentHeight: null },
		options.reflow,
	);
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Column flex layout work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Column flex layout work limit exceeded",
			);
		return maxWork - work;
	};
	let own = resolveHeightConstraints(
		container.box ?? initialBoxStyle,
		constraints.containingWidth,
		constraints.containingHeight,
	);
	if (context.intrinsicHeight)
		own = {
			...own,
			preferred: null,
			minimum: 0,
			maximum: null,
			definite: null,
		};
	const clampHeight = (value: number) =>
		layoutNumber(
			Math.max(
				own.minimum,
				Math.min(value, own.maximum ?? Number.POSITIVE_INFINITY),
			),
		);
	if (context.contentHeight !== undefined) {
		layoutNumber(context.contentHeight);
		const preferred = clampHeight(context.contentHeight);
		own = {
			...own,
			preferred,
			definite: context.contentHeightDefinite === false ? null : preferred,
		};
	}
	const percentageBasis = own.definite;
	const measured =
		prepared ??
		measureFormattingFlexItemWidths(
			formatting,
			containerId,
			percentageBasis,
			{
				...options.reflow?.main?.intrinsic,
				maxWork: Math.min(
					options.reflow?.main?.intrinsic?.maxWork ?? limits.main,
					limits.main,
					4_000_000,
					remaining(),
				),
			},
			new Map(),
			context.validatedFormatting,
		);
	if (!prepared) charge(measured.metrics.work);
	const widths = new Map(
		measured.widths.map((item) => {
			charge();
			return [item.id, item];
		}),
	);
	const width = constraints.contentWidth;
	const self = (id: number) => {
		const value = (formatting.nodes[id].flex ?? initialFlexStyle)["align-self"];
		return value === "auto" ? flex["align-items"] : value;
	};
	const crossWidths = new Map<number, Readonly<BlockWidth>>();
	const crossData = new Map<
		number,
		{
			minimum: number;
			maximum: number;
			specified: number | null;
			stretch: boolean;
		}
	>();
	for (const id of container.children) {
		charge();
		const node = formatting.nodes[id];
		const style = node.box ?? initialBoxStyle;
		const intrinsic = widths.get(id);
		if (!intrinsic)
			throw new AgentBrowserError(
				"unsupported",
				"Missing column intrinsic width",
			);
		const borders = resolveBorders(style);
		const paddingLeft = resolveLayoutLength(style["padding-left"], width);
		const paddingRight = resolveLayoutLength(style["padding-right"], width);
		const edges =
			borders.borderLeft + borders.borderRight + paddingLeft + paddingRight;
		const adjustment = style["box-sizing"] === "border-box" ? edges : 0;
		const size = (value: string) =>
			Math.max(0, resolveLayoutLength(value, width) - adjustment);
		const minimum =
			style["min-width"] === "auto" ? 0 : size(style["min-width"]);
		const maximum =
			style["max-width"] === "none"
				? Number.POSITIVE_INFINITY
				: size(style["max-width"]);
		const specified = style.width === "auto" ? null : size(style.width);
		const marginLeft =
			style["margin-left"] === "auto"
				? 0
				: resolveLayoutLength(style["margin-left"], width, true);
		const marginRight =
			style["margin-right"] === "auto"
				? 0
				: resolveLayoutLength(style["margin-right"], width, true);
		const stretch =
			specified === null &&
			["normal", "stretch"].includes(self(id).replace(/^(safe|unsafe) /, "")) &&
			style["margin-left"] !== "auto" &&
			style["margin-right"] !== "auto";
		const available = Math.max(0, width - edges - marginLeft - marginRight);
		let preferred =
			specified ??
			(stretch && !wrap
				? available
				: Math.min(
						intrinsic.maxContent,
						Math.max(intrinsic.minContent, available),
					));
		if (
			specified === null &&
			!stretch &&
			node.kind === "replaced" &&
			node.intrinsic
		)
			preferred = resolveReplacedSize(
				node.intrinsic.width,
				node.intrinsic.height,
				style,
				width,
				percentageBasis,
				!node.control,
			).contentWidth;
		const contentWidth = layoutNumber(
			Math.max(minimum, Math.min(preferred, maximum)),
		);
		crossWidths.set(
			id,
			Object.freeze({
				containingWidth: width,
				contentWidth,
				paddingLeft,
				paddingRight,
				borderLeft: borders.borderLeft,
				borderRight: borders.borderRight,
				marginLeft,
				marginRight,
				borderBoxWidth: layoutNumber(contentWidth + edges),
				contentOffset: layoutNumber(
					marginLeft + borders.borderLeft + paddingLeft,
					true,
				),
				clampedBy:
					contentWidth > preferred
						? "min-width"
						: contentWidth < preferred
							? "max-width"
							: "none",
			}),
		);
		crossData.set(id, { minimum, maximum, specified, stretch });
	}
	const run = (roots: Readonly<BlockReflowRoot>[], budget = limits.maxWork) => {
		const start = work;
		const phaseRemaining = () => {
			const available = Math.min(remaining(), budget - (work - start));
			if (available < 1)
				throw new AgentBrowserError(
					"resource-limit",
					"Column item reflow work limit exceeded",
				);
			return available;
		};
		const horizontal = resolveFormattingBlockWidths(
			formatting,
			roots,
			Math.min(formattingLimits.maxWork, phaseRemaining()),
			true,
			() => {},
			{ nesting: (context.nesting ?? 0) + 1, text: options.reflow?.text },
		);
		charge(horizontal.metrics.work);
		const text = layoutFormattingText(horizontal, {
			...options.reflow?.text,
			maxWork: Math.min(limits.text, phaseRemaining()),
		});
		charge(text.metrics.work);
		const layout = layoutFormattingFlexFlow(
			text,
			Math.min(documentLayoutLimits.maxWork, phaseRemaining()),
			options.reflow?.text,
			true,
			(context.nesting ?? 0) + 1,
		);
		charge(layout.metrics.work);
		if (work - start > limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Column item reflow work limit exceeded",
			);
		return layout;
	};
	const roots = container.children.map(
		(id): BlockReflowRoot => ({
			id,
			containingBlock: containerId,
			containingWidth: width,
			containingHeight: percentageBasis,
			contentX: 0,
			usedWidth: crossWidths.get(id),
			intrinsicHeight: true,
		}),
	);
	const initialStart = work;
	const initial = run(roots, Math.min(limits.maxWork, limits.main - work));
	const initialWork = work - initialStart;
	const initialBoxes = new Map(
		initial.boxes.map((box) => {
			charge();
			return [box.id, box];
		}),
	);
	const items: Readonly<MeasuredFlexMainItem>[] = [];
	const definiteItems = new Map<number, boolean>();
	for (const id of container.children) {
		charge();
		const node = formatting.nodes[id];
		const box = initialBoxes.get(id);
		const cross = crossData.get(id);
		if (!box || !cross)
			throw new AgentBrowserError(
				"unsupported",
				"Missing measured column item",
			);
		const style = node.box ?? initialBoxStyle;
		const ownFlex = node.flex ?? initialFlexStyle;
		const vertical = resolveHeightConstraints(style, width, percentageBasis);
		const edges =
			vertical.borderTop +
			vertical.borderBottom +
			vertical.paddingTop +
			vertical.paddingBottom;
		const adjustment = style["box-sizing"] === "border-box" ? edges : 0;
		const content = box.contentHeight;
		let contentMinimum = content;
		if (node.kind === "replaced" && node.intrinsic && !node.control) {
			const ratio = node.intrinsic.width / node.intrinsic.height;
			contentMinimum =
				Math.max(cross.minimum, Math.min(node.intrinsic.width, cross.maximum)) /
				ratio;
			if (cross.specified !== null)
				contentMinimum = Math.min(
					contentMinimum,
					Math.max(cross.minimum, Math.min(cross.specified, cross.maximum)) /
						ratio,
				);
		}
		let minimum = Math.min(
			contentMinimum,
			vertical.preferred ?? Number.POSITIVE_INFINITY,
			vertical.maximum ?? Number.POSITIVE_INFINITY,
		);
		if (style["min-height"] !== "auto") minimum = vertical.minimum;
		let basis =
			ownFlex["flex-basis"] === "auto" ? style.height : ownFlex["flex-basis"];
		if (
			basis === "auto" ||
			(percentageBasis === null && lengthHasPercentage(basis))
		)
			basis = "content";
		const definite = ![
			"content",
			"min-content",
			"max-content",
			"fit-content",
		].includes(basis);
		const base = definite
			? resolveLayoutLength(basis, percentageBasis ?? 0) - adjustment
			: content;
		definiteItems.set(id, percentageBasis !== null || definite);
		items.push(
			Object.freeze({
				id,
				...(node.ref ? { ref: node.ref } : {}),
				minContent: contentMinimum,
				maxContent: content,
				baseSize: layoutNumber(base, true),
				minSize: layoutNumber(minimum),
				maxSize: vertical.maximum,
				borderPadding: layoutNumber(edges),
				marginStart:
					style[reverse ? "margin-bottom" : "margin-top"] === "auto"
						? "auto"
						: resolveLayoutLength(
								style[reverse ? "margin-bottom" : "margin-top"],
								width,
								true,
							),
				marginEnd:
					style[reverse ? "margin-top" : "margin-bottom"] === "auto"
						? "auto"
						: resolveLayoutLength(
								style[reverse ? "margin-top" : "margin-bottom"],
								width,
								true,
							),
				grow: Number(ownFlex["flex-grow"]),
				shrink: Number(ownFlex["flex-shrink"]),
				order: Number(ownFlex.order),
				baseSource: definite
					? "definite"
					: basis === "min-content"
						? "min-content"
						: "max-content",
				minimumSource:
					style["min-height"] === "auto" ? "content-based" : "explicit",
				definiteCrossSize:
					cross.stretch || cross.specified !== null
						? (crossWidths.get(id)?.contentWidth ?? null)
						: null,
			}),
		);
	}
	const rowGap =
		flex["row-gap"] === "normal"
			? 0
			: resolveLayoutLength(flex["row-gap"], percentageBasis ?? 0);
	let naturalContentHeight = rowGap * Math.max(0, items.length - 1);
	for (const item of items) {
		charge();
		naturalContentHeight +=
			Math.max(
				item.minSize,
				Math.min(item.baseSize, item.maxSize ?? Number.POSITIVE_INFINITY),
			) +
			(item.borderPadding ?? 0) +
			(item.marginStart === "auto" ? 0 : (item.marginStart ?? 0)) +
			(item.marginEnd === "auto" ? 0 : (item.marginEnd ?? 0));
		layoutNumber(naturalContentHeight, true);
	}
	naturalContentHeight = Math.max(0, naturalContentHeight);
	let contentHeight = clampHeight(own.preferred ?? naturalContentHeight);
	const keyword = flex["justify-content"].replace(/^(safe|unsafe) /, "");
	const position = ["normal", "stretch"].includes(keyword)
		? "flex-start"
		: ["start", "left", "right"].includes(keyword)
			? reverse
				? "flex-end"
				: "flex-start"
			: keyword === "end"
				? reverse
					? "flex-start"
					: "flex-end"
				: keyword;
	const justify = (
		flex["justify-content"].startsWith("safe ") ? `safe ${position}` : position
	) as FlexJustification;
	const numericItems = items.map((item) => ({
		baseSize: item.baseSize,
		minSize: item.minSize,
		maxSize: item.maxSize,
		borderPadding: item.borderPadding,
		marginStart: item.marginStart,
		marginEnd: item.marginEnd,
		grow: item.grow,
		shrink: item.shrink,
		order: item.order,
	}));
	let sizingWork = 0;
	const resolve = () => {
		const result = resolveFlexLines(numericItems, contentHeight, {
			wrap,
			gap: rowGap,
			justify,
			overflowStart: reverse ? "flex-end" : "flex-start",
			maxWork: Math.min(flexLineLimits.maxWork, remaining()),
		});
		charge(result.metrics.work);
		sizingWork += result.metrics.work;
		return result;
	};
	let resolved = resolve();
	if (wrap) {
		naturalContentHeight = 0;
		for (const line of resolved.lines) {
			let height = rowGap * Math.max(0, line.items.length - 1);
			for (const allocation of line.items) {
				charge();
				const item = items[allocation.index];
				height +=
					allocation.hypotheticalSize +
					(item.borderPadding ?? 0) +
					(item.marginStart === "auto" ? 0 : (item.marginStart ?? 0)) +
					(item.marginEnd === "auto" ? 0 : (item.marginEnd ?? 0));
			}
			naturalContentHeight = Math.max(
				naturalContentHeight,
				layoutNumber(height, true),
			);
		}
		const usedHeight = clampHeight(own.preferred ?? naturalContentHeight);
		if (usedHeight !== contentHeight) {
			contentHeight = usedHeight;
			resolved = resolve();
		}
	}
	const mainWork = work;
	if (mainWork > limits.main)
		throw new AgentBrowserError(
			"resource-limit",
			"Column main sizing work limit exceeded",
		);
	const allocations = new Map(
		resolved.lines.flatMap((line) =>
			line.items.map((item) => {
				charge();
				return [item.index, item] as const;
			}),
		),
	);
	let finalRoots = items.map((item, index): BlockReflowRoot => {
		charge();
		const allocation = allocations.get(index);
		let usedWidth = crossWidths.get(item.id);
		const cross = crossData.get(item.id);
		const node = formatting.nodes[item.id];
		if (!allocation || !usedWidth || !cross)
			throw new AgentBrowserError("unsupported", "Missing column allocation");
		if (
			node.kind === "replaced" &&
			node.intrinsic &&
			!node.control &&
			cross.specified === null &&
			!cross.stretch
		) {
			const contentWidth = layoutNumber(
				Math.max(
					cross.minimum,
					Math.min(
						(allocation.contentSize * node.intrinsic.width) /
							node.intrinsic.height,
						cross.maximum,
					),
				),
			);
			usedWidth = Object.freeze({
				...usedWidth,
				contentWidth,
				borderBoxWidth: layoutNumber(
					contentWidth +
						usedWidth.borderLeft +
						usedWidth.borderRight +
						usedWidth.paddingLeft +
						usedWidth.paddingRight,
				),
			});
		}
		return {
			id: item.id,
			containingBlock: containerId,
			containingWidth: width,
			containingHeight: percentageBasis,
			contentX: 0,
			usedWidth,
			contentHeightOverride: allocation.contentSize,
			contentHeightDefinite: definiteItems.get(item.id),
		};
	});
	const columnGap =
		flex["column-gap"] === "normal"
			? 0
			: resolveLayoutLength(flex["column-gap"], prepared ? 0 : width);
	const lineByItem = new Map<number, number>();
	const lines = resolved.lines.map((line, index) => {
		let size = 0;
		for (const allocation of line.items) {
			charge();
			lineByItem.set(allocation.index, index);
			const used = finalRoots[allocation.index].usedWidth;
			if (!used)
				throw new AgentBrowserError("unsupported", "Missing column cross size");
			size = Math.max(
				size,
				used.borderBoxWidth + used.marginLeft + used.marginRight,
			);
		}
		return { index, size: wrap ? layoutNumber(size) : width, offset: 0 };
	});
	const naturalCrossSize = layoutNumber(
		lines.reduce((sum, line) => {
			charge();
			return sum + line.size;
		}, 0) +
			columnGap * Math.max(0, lines.length - 1),
	);
	const alignment = (value: string, free: number) => {
		if (value.startsWith("safe ") && free < 0) return 0;
		const mode = value.replace(/^(safe|unsafe) /, "");
		if (["start", "self-start", "baseline"].includes(mode)) return 0;
		if (["end", "self-end", "last baseline"].includes(mode)) return free;
		if (mode === "center") return free / 2;
		if (mode === "flex-end") return crossReverse ? 0 : free;
		if (["normal", "stretch", "flex-start"].includes(mode))
			return crossReverse ? free : 0;
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported column cross alignment",
		);
	};
	const alignContent = wrap && !prepared ? flex["align-content"] : "flex-start";
	if (alignContent.includes("baseline"))
		throw new AgentBrowserError(
			"unsupported",
			"Column baseline line distribution is not supported",
		);
	let freeCross = (prepared ? naturalCrossSize : width) - naturalCrossSize;
	if (
		["normal", "stretch"].includes(alignContent) &&
		freeCross > 0 &&
		lines.length
	) {
		const addition = freeCross / lines.length;
		for (const line of lines) {
			charge();
			line.size = layoutNumber(line.size + addition);
		}
		freeCross = 0;
	}
	let leading = 0;
	let separation = columnGap;
	if (alignContent.startsWith("space-")) {
		if (freeCross < 0) leading = crossReverse ? freeCross : 0;
		else if (alignContent === "space-between")
			separation += lines.length > 1 ? freeCross / (lines.length - 1) : 0;
		else if (alignContent === "space-around") {
			separation += lines.length ? freeCross / lines.length : 0;
			leading = lines.length ? freeCross / (2 * lines.length) : 0;
		} else if (alignContent === "space-evenly") {
			separation += freeCross / (lines.length + 1);
			leading = freeCross / (lines.length + 1);
		} else
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported column line distribution",
			);
	} else {
		const physical = alignment(alignContent, freeCross);
		leading = crossReverse ? freeCross - physical : physical;
	}
	let cursor = leading;
	for (const line of lines) {
		charge();
		line.offset = layoutNumber(
			crossReverse
				? (prepared ? naturalCrossSize : width) - cursor - line.size
				: cursor,
			true,
		);
		cursor = layoutNumber(
			cursor + line.size + (line.index + 1 < lines.length ? separation : 0),
			true,
		);
	}
	finalRoots = finalRoots.map((root, index) => {
		charge();
		const cross = crossData.get(root.id);
		const used = root.usedWidth;
		const line = lines[lineByItem.get(index) ?? -1];
		if (!cross || !used || !line)
			throw new AgentBrowserError(
				"unsupported",
				"Missing column line allocation",
			);
		if (!cross.stretch) return root;
		const edges = used.borderBoxWidth - used.contentWidth;
		const contentWidth = layoutNumber(
			Math.max(
				cross.minimum,
				Math.min(
					line.size - used.marginLeft - used.marginRight - edges,
					cross.maximum,
				),
			),
		);
		return {
			...root,
			usedWidth: Object.freeze({
				...used,
				contentWidth,
				borderBoxWidth: layoutNumber(contentWidth + edges),
			}),
		};
	});
	const finalStart = work;
	const final = run(finalRoots);
	const finalWork = work - finalStart;
	const baselines = collectFlexBaselines(final, formatting, charge);
	const boxesById = new Map(
		final.boxes.map((box) => {
			charge();
			return [box.id, box];
		}),
	);
	const placements = new Map<number, FlexPlacement>();
	for (const [index, item] of items.entries()) {
		charge();
		const box = boxesById.get(item.id);
		const allocation = allocations.get(index);
		if (!box || !allocation)
			throw new AgentBrowserError("unsupported", "Missing column box");
		const style = formatting.nodes[item.id].box ?? initialBoxStyle;
		let left = box.marginLeft;
		let right = box.marginRight;
		const autoLeft = style["margin-left"] === "auto";
		const autoRight = style["margin-right"] === "auto";
		const line = lines[lineByItem.get(index) ?? -1];
		if (!line)
			throw new AgentBrowserError(
				"unsupported",
				"Missing column placement line",
			);
		const free = line.size - box.borderBoxWidth - left - right;
		let x = left;
		if (autoLeft || autoRight) {
			if (free > 0) {
				const share = free / (Number(autoLeft) + Number(autoRight));
				if (autoLeft) left = share;
				if (autoRight) right = share;
			} else {
				if (autoLeft) left = 0;
				right = line.size - box.borderBoxWidth - left;
			}
			x = left;
		} else {
			x += alignment(self(item.id), free);
		}
		const y = layoutNumber(
			reverse
				? contentHeight - allocation.mainOffset - allocation.borderBoxSize
				: allocation.mainOffset,
			true,
		);
		const baseline = baselines.get(item.id);
		placements.set(item.id, {
			id: item.id,
			index,
			line: line.index,
			x: layoutNumber(line.offset + x, true),
			y,
			marginLeft: layoutNumber(left, true),
			marginRight: layoutNumber(right, true),
			marginTop: reverse ? allocation.marginEnd : allocation.marginStart,
			marginBottom: reverse ? allocation.marginStart : allocation.marginEnd,
			firstBaseline: baseline?.unsupported
				? null
				: layoutNumber(y + (baseline?.first ?? box.borderBoxHeight), true),
			lastBaseline: baseline?.unsupported
				? null
				: layoutNumber(y + (baseline?.last ?? box.borderBoxHeight), true),
		});
	}
	const placed = placeFlexLayout(final, placements, charge);
	const paintOrder = resolved.lines.flatMap((line) =>
		line.items.map((item) => {
			charge();
			return items[item.index].id;
		}),
	);
	const visualLines = crossReverse
		? [...resolved.lines].reverse()
		: resolved.lines;
	const visualOrder = visualLines.flatMap((line) =>
		(reverse ? [...line.items].reverse() : line.items).map((item) => {
			charge();
			return items[item.index].id;
		}),
	);
	const first = placements.get(visualOrder[0]);
	const last = placements.get(visualOrder.at(-1) ?? -1);
	const main = Object.freeze({
		stage: "measured-flex-main-sizes" as const,
		partial: true as const,
		revision: formatting.revision,
		container: containerId,
		reference: container.ref,
		direction,
		wrap: wrapping,
		constraints: Object.freeze({
			contentWidth: width,
			contentHeight: percentageBasis,
		}),
		items: Object.freeze(items),
		resolved,
		metrics: Object.freeze({
			work: mainWork,
			intrinsic: measured.metrics,
			sizing: Object.freeze({ ...resolved.metrics, work: sizingWork }),
		}),
	});
	return Object.freeze({
		stage: "native-flex-container-layout" as const,
		partial: true as const,
		revision: formatting.revision,
		reference: container.ref,
		container: containerId,
		formatting,
		main,
		contentWidth: width,
		contentHeight,
		naturalContentHeight,
		naturalCrossSize,
		rowGap,
		lines: Object.freeze(
			lines.map((line) =>
				Object.freeze({
					index: line.index,
					crossSize: line.size,
					crossOffset: line.offset,
				}),
			),
		),
		items: Object.freeze(placed.items),
		boxes: Object.freeze(placed.boxes),
		contexts: Object.freeze(placed.contexts),
		images: Object.freeze(placed.images),
		textMetrics: final.text.metrics,
		atomics: final.text.horizontal.atomics ?? [],
		paintOrder: Object.freeze(paintOrder),
		baselines: Object.freeze({
			first: first?.firstBaseline ?? null,
			last: last?.lastBaseline ?? null,
			unsupported:
				!!(first && baselines.get(first.id)?.unsupported) ||
				!!(last && baselines.get(last.id)?.unsupported),
		}),
		metrics: Object.freeze({
			work,
			initialReflow: initialWork,
			stretchReflow: finalWork,
			reflowPasses: 2,
			stretchedItems: finalRoots.length,
		}),
	});
}
