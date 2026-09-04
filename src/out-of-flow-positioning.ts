import { type BlockWidth, resolveBlockWidth } from "./block-width.js";
import { resolveBorders } from "./border-box.js";
import type { BoxStyle } from "./css-box.js";
import type { DocumentBox, DocumentLayout } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import {
	layoutFormattingFlexFlow,
	layoutFormattingPageDocument,
} from "./flex-document.js";
import {
	type FormattingNode,
	type FormattingTree,
	resolveFormattingBlockWidths,
} from "./formatting-tree.js";
import { measureValidatedIntrinsicRoot } from "./intrinsic-widths.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import {
	applyRelativePositioning,
	positionDocumentLayout,
} from "./relative-positioning.js";
import {
	resolveHeightConstraints,
	resolveReplacedSize,
} from "./replaced-box.js";
import {
	flexStaticPosition,
	flowStaticPosition,
} from "./static-positioning.js";
import {
	type TextLayoutOptions,
	layoutFormattingText,
	textLayoutLimits,
} from "./text-layout.js";

export const positioningCapabilities = Object.freeze({
	partial: true,
	profile: "ltr-physical-insets-and-bounded-static-reflow",
	absolute: "positioned-block-padding-box-or-initial-containing-block",
	fixed: "viewport-with-root-scroll-projection",
	staticPosition: "hypothetical-flow-and-sole-flex-item",
	staticBlockInInline: false,
	staticFlexBaselines: false,
	inlineContainingBlocks: false,
	transformedContainingBlocks: false,
	sticky: false,
});

function outOfFlow(node: Readonly<FormattingNode>) {
	return node.position === "absolute" || node.position === "fixed";
}

function length(value: string, basis: number): number | null {
	return value === "auto" ? null : resolveLayoutLength(value, basis, true);
}

function axis(
	start: number | null,
	end: number | null,
	size: number,
	basis: number,
	leading: number | null,
	trailing: number | null,
	vertical = false,
) {
	if (start === null && end === null)
		throw new AgentBrowserError(
			"unsupported",
			"Missing resolved positioning anchor",
		);
	let marginStart = leading ?? 0;
	let marginEnd = trailing ?? 0;
	if (start !== null && end !== null) {
		const free = basis - start - end - size - marginStart - marginEnd;
		if (leading === null && trailing === null) {
			marginStart = vertical || free >= 0 ? free / 2 : 0;
			marginEnd = free - marginStart;
		} else if (leading === null) marginStart = free;
		else if (trailing === null) marginEnd = free;
	}
	const usedStart =
		start ?? basis - (end as number) - size - marginStart - marginEnd;
	return {
		start: layoutNumber(usedStart, true),
		end: layoutNumber(basis - usedStart - size - marginStart - marginEnd, true),
		marginStart: layoutNumber(marginStart, true),
		marginEnd: layoutNumber(marginEnd, true),
	};
}

export function layoutPositionedDocument(
	formatting: FormattingTree,
	maxWork: number,
	options: TextLayoutOptions,
): Readonly<DocumentLayout> {
	let work = formatting.metrics.work;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Out-of-flow positioning work limit exceeded",
			);
	};
	const remaining = () => {
		charge();
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Out-of-flow positioning work limit exceeded",
			);
		return maxWork - work;
	};
	const relativeRoots = new Set<number>();
	const nodes = formatting.nodes.map((node) => {
		charge();
		if (node.position === "relative") {
			let ancestor = node;
			while (ancestor.parent !== null && !outOfFlow(ancestor)) {
				charge();
				ancestor = formatting.nodes[ancestor.parent];
			}
			relativeRoots.add(ancestor.id);
		}
		const children = node.children.filter((id) => {
			charge();
			return !outOfFlow(formatting.nodes[id]);
		});
		return Object.freeze({
			...node,
			children: Object.freeze(children),
			...(node.orderModifiedChildren
				? {
						orderModifiedChildren: Object.freeze(
							node.orderModifiedChildren.filter((id) => {
								charge();
								return !outOfFlow(formatting.nodes[id]);
							}),
						),
					}
				: {}),
		});
	});
	const issues = Object.freeze(
		Object.fromEntries(
			Object.entries(formatting.issues).filter(
				([name]) => name !== "positioned-layout-requires-coordination",
			),
		),
	);
	const flow: FormattingTree = Object.freeze({
		...formatting,
		issues,
		nodes: Object.freeze(nodes),
	});
	const normal = applyRelativePositioning(
		layoutFormattingPageDocument(flow, remaining(), options),
		remaining(),
		relativeRoots.has(formatting.root),
	);
	charge(
		normal.metrics.work +
			normal.text.metrics.work +
			normal.text.horizontal.metrics.work,
	);
	const boxes = [...normal.boxes];
	const boxMap = new Map(boxes.map((box) => [box.id, box]));
	const contexts = [...normal.contexts];
	const textContexts = [...normal.text.contexts];
	const images = [...normal.text.horizontal.images];
	const atomics = [...(normal.text.horizontal.atomics ?? [])];
	const relativePositions = [...(normal.relativePositions ?? [])];
	const positionedInsets: NonNullable<
		DocumentLayout["positionedInsets"]
	>[number][] = [];
	const fixedIds: number[] = [];
	const pending = [{ id: formatting.root, fixed: false }];
	const textMetrics = { ...normal.text.metrics };
	const { formatting: _formatting, ...textOptions } = options;
	while (pending.length) {
		charge();
		const state = pending.pop() as (typeof pending)[number];
		const node = formatting.nodes[state.id];
		const fixed = state.fixed || node.position === "fixed";
		if (fixed) fixedIds.push(node.id);
		for (let index = node.children.length - 1; index >= 0; index--) {
			charge();
			pending.push({ id: node.children[index], fixed });
		}
		if (!outOfFlow(node)) continue;
		const style = node.box;
		if (!style)
			throw new AgentBrowserError(
				"unsupported",
				"Positioned element has no supported box",
			);
		let containing: Readonly<DocumentBox> | undefined;
		if (node.position === "absolute") {
			let ancestor = node.parent;
			while (ancestor !== null) {
				charge();
				const parent = formatting.nodes[ancestor];
				if (parent.position) {
					containing = boxMap.get(ancestor);
					if (!containing)
						throw new AgentBrowserError(
							"unsupported",
							"Positioned inline containing blocks are not implemented",
						);
					break;
				}
				ancestor = parent.parent;
			}
		}
		const containingWidth = containing
			? containing.contentWidth +
				containing.paddingLeft +
				containing.paddingRight
			: formatting.viewport.width;
		const containingHeight = containing
			? containing.contentHeight +
				containing.paddingTop +
				containing.paddingBottom
			: formatting.viewport.height;
		const originX = containing ? containing.borderX + containing.borderLeft : 0;
		const originY = containing ? containing.borderY + containing.borderTop : 0;
		let left = length(style.left, containingWidth);
		const right = length(style.right, containingWidth);
		let top = length(style.top, containingHeight);
		const bottom = length(style.bottom, containingHeight);
		const staticX = left === null && right === null;
		const staticY = top === null && bottom === null;
		const parent =
			node.parent === null ? undefined : formatting.nodes[node.parent];
		const flexParent =
			parent?.contentMode === "flex" ? boxMap.get(parent.id) : undefined;
		if (staticX || staticY) {
			if (flexParent) {
				if (staticX) left = 0;
				if (staticY) top = 0;
			} else {
				const anchor = flowStaticPosition(
					formatting,
					node.id,
					boxMap,
					remaining(),
					options,
				);
				charge(anchor.work);
				if (staticX) left = anchor.left - originX;
				if (staticY) top = anchor.top - originY;
			}
		}
		const subtree = Object.freeze({ ...flow, root: node.id });
		const borders = resolveBorders(style);
		const base = resolveBlockWidth(style, containingWidth, borders);
		const edges = base.borderBoxWidth - base.contentWidth;
		const marginLeft = length(style["margin-left"], containingWidth);
		const marginRight = length(style["margin-right"], containingWidth);
		const marginTop = length(style["margin-top"], containingWidth);
		const marginBottom = length(style["margin-bottom"], containingWidth);
		const replaced =
			node.kind === "replaced" && node.intrinsic
				? resolveReplacedSize(
						node.intrinsic.width,
						node.intrinsic.height,
						style,
						containingWidth,
						containingHeight,
						!node.control,
					)
				: undefined;
		let width = replaced?.contentWidth;
		if (width === undefined && style.width === "auto") {
			const available = Math.max(
				0,
				containingWidth -
					(left ?? 0) -
					(right ?? 0) -
					(marginLeft ?? 0) -
					(marginRight ?? 0) -
					edges,
			);
			if (left !== null && right !== null) width = available;
			else {
				const intrinsic = measureValidatedIntrinsicRoot(
					subtree,
					node.id,
					containingHeight,
					{ maxWork: remaining(), text: textOptions },
					0,
				);
				charge(intrinsic.metrics.work);
				const measured = intrinsic.widths.find((entry) => {
					charge();
					return entry.id === node.id;
				});
				if (!measured)
					throw new AgentBrowserError(
						"unsupported",
						"Missing positioned intrinsic width",
					);
				width = Math.min(
					measured.maxContent,
					Math.max(measured.minContent, available),
				);
			}
		}
		const usedStyle: BoxStyle =
			width === undefined
				? style
				: {
						...style,
						width: `${width + (style["box-sizing"] === "border-box" ? edges : 0)}px`,
					};
		const used = resolveBlockWidth(usedStyle, containingWidth, borders);
		let horizontalAxis = axis(
			left,
			right,
			used.borderBoxWidth,
			containingWidth,
			marginLeft,
			marginRight,
		);
		const usedWidth: BlockWidth = Object.freeze({
			...used,
			marginLeft: horizontalAxis.marginStart,
			marginRight: horizontalAxis.marginEnd,
			contentOffset:
				horizontalAxis.marginStart + used.borderLeft + used.paddingLeft,
		});
		const height = resolveHeightConstraints(
			style,
			containingWidth,
			containingHeight,
		);
		const heightOverride =
			!replaced && style.height === "auto" && top !== null && bottom !== null
				? Math.max(
						0,
						containingHeight -
							top -
							bottom -
							(marginTop ?? 0) -
							(marginBottom ?? 0) -
							height.paddingTop -
							height.paddingBottom -
							height.borderTop -
							height.borderBottom,
					)
				: undefined;
		const horizontal = resolveFormattingBlockWidths(
			subtree,
			[
				{
					id: node.id,
					containingBlock: containing?.id ?? formatting.root,
					containingWidth,
					containingHeight,
					contentX: 0,
					usedWidth,
					...(heightOverride === undefined
						? {}
						: { contentHeightOverride: heightOverride }),
				},
			],
			remaining(),
			true,
			() => {},
			{ nesting: 0, text: textOptions },
		);
		charge(horizontal.metrics.work);
		const text = layoutFormattingText(horizontal, options);
		charge(text.metrics.work);
		const local = applyRelativePositioning(
			layoutFormattingFlexFlow(text, remaining(), options, true),
			remaining(),
			relativeRoots.has(node.id),
		);
		const root = local.boxes.find((box) => {
			charge();
			return box.id === node.id;
		});
		if (!root)
			throw new AgentBrowserError("unsupported", "Missing positioned root box");
		if (flexParent && parent && (staticX || staticY)) {
			const anchor = flexStaticPosition(
				parent,
				flexParent,
				node,
				root.borderBoxWidth + (marginLeft ?? 0) + (marginRight ?? 0),
				root.borderBoxHeight + (marginTop ?? 0) + (marginBottom ?? 0),
				{ horizontal: staticX, vertical: staticY },
			);
			if (staticX) {
				left = anchor.left - originX;
				horizontalAxis = axis(
					left,
					right,
					root.borderBoxWidth,
					containingWidth,
					marginLeft,
					marginRight,
				);
			}
			if (staticY) top = anchor.top - originY;
		}
		const verticalAxis = axis(
			top,
			bottom,
			root.borderBoxHeight,
			containingHeight,
			marginTop,
			marginBottom,
			true,
		);
		const shifted = positionDocumentLayout(
			local,
			() => ({
				left: originX + horizontalAxis.start + horizontalAxis.marginStart,
				top: originY + verticalAxis.start + verticalAxis.marginStart,
			}),
			remaining(),
		);
		charge(shifted.metrics.work);
		for (const box of shifted.boxes) {
			charge();
			const positioned =
				box.id === node.id
					? Object.freeze({
							...box,
							marginTop: verticalAxis.marginStart,
							marginBottom: verticalAxis.marginEnd,
						})
					: box;
			boxes.push(positioned);
			boxMap.set(box.id, positioned);
		}
		contexts.push(...shifted.contexts);
		textContexts.push(...shifted.text.contexts);
		images.push(...shifted.text.horizontal.images);
		atomics.push(...(shifted.text.horizontal.atomics ?? []));
		relativePositions.push(...(shifted.relativePositions ?? []));
		positionedInsets.push(
			Object.freeze({
				id: node.id,
				left: horizontalAxis.start,
				right: horizontalAxis.end,
				top: verticalAxis.start,
				bottom: verticalAxis.end,
			}),
		);
		for (const key of Object.keys(textMetrics) as (keyof typeof textMetrics)[])
			textMetrics[key] += shifted.text.metrics[key];
		for (const [limit, metric] of [
			["maxTokens", "tokens"],
			["maxLines", "lines"],
			["maxFragments", "fragments"],
			["maxWork", "work"],
		] as const)
			if (textMetrics[metric] > (options[limit] ?? textLayoutLimits[limit]))
				throw new AgentBrowserError(
					"resource-limit",
					"Positioned document text limit exceeded",
				);
	}
	return Object.freeze({
		...normal,
		boxes: Object.freeze(boxes),
		contexts: Object.freeze(contexts),
		fixedIds: Object.freeze(fixedIds),
		positionedInsets: Object.freeze(positionedInsets),
		relativePositions: Object.freeze(relativePositions),
		text: Object.freeze({
			...normal.text,
			contexts: Object.freeze(textContexts),
			metrics: Object.freeze(textMetrics),
			horizontal: Object.freeze({
				...normal.text.horizontal,
				formatting: Object.freeze({ ...formatting, issues }),
				widths: Object.freeze(boxes),
				images: Object.freeze(images),
				atomics: Object.freeze(atomics),
			}),
		}),
		metrics: Object.freeze({
			work,
			boxes: boxes.length,
			glyphs: contexts.reduce(
				(total, context) => total + context.glyphs.length,
				0,
			),
			lines: contexts.reduce(
				(total, context) => total + context.lines.length,
				0,
			),
		}),
	});
}

export function projectFixedLayout(
	layout: DocumentLayout,
	scroll: Readonly<{ x: number; y: number }>,
	maxWork: number,
): Readonly<DocumentLayout> {
	if (!layout.fixedIds?.length || (!scroll.x && !scroll.y)) return layout;
	const fixed = new Set(layout.fixedIds);
	return positionDocumentLayout(
		layout,
		(id) =>
			fixed.has(id) ? { left: scroll.x, top: scroll.y } : { left: 0, top: 0 },
		maxWork,
	);
}
