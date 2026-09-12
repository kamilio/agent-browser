import { resolveBorders } from "./border-box.js";
import type { BlockWidth } from "./block-width.js";
import { initialBoxStyle } from "./css-box.js";
import {
	layoutFormattingDocument,
	type DocumentFlowCoordinator,
	type DocumentFlowFrame,
	type DocumentLayout,
	type PositionedTextContext,
} from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import {
	FloatLayoutContext,
	floatLayoutLimits,
	type FloatClear,
	type FloatPlacement,
} from "./float-layout.js";
import {
	formattingLimits,
	resolveFormattingBlockWidths,
	resolveFormattingPageWidths,
	type BlockReflowRoot,
	type DocumentBlockWidths,
	type FormattingTree,
} from "./formatting-tree.js";
import type { AtomicInlineResolutionContext } from "./inline-atomic-layout.js";
import { mergeAtomicInlineLayouts } from "./inline-atomic-placement.js";
import {
	intrinsicWidthLimits,
	measureValidatedIntrinsicRoot,
} from "./intrinsic-widths.js";
import { layoutNumber } from "./layout-values.js";
import { resolveReplacedSize } from "./replaced-box.js";
import { resolveShrinkToFitWidth } from "./shrink-to-fit.js";
import {
	layoutFormattingText,
	textLayoutLimits,
	type DocumentTextLayout,
	type TextFormattingInput,
	type TextLayoutOptions,
} from "./text-layout.js";

export interface FloatBoxLayout {
	id: number;
	containingBlock: number;
	width: number;
	height: number;
	marginLeft: number;
	marginRight: number;
	marginTop: number;
	marginBottom: number;
	document: Readonly<DocumentLayout>;
	metrics: Readonly<{ work: number }>;
}

interface FloatScope {
	id: number;
	frame: Readonly<DocumentFlowFrame>;
	context?: FloatLayoutContext;
	floor: number;
	bottom: number;
	placements: FloatPlacement[];
}

const maximumNesting = 32;

function acceptedFormatting(formatting: FormattingTree, charge: () => void) {
	let floats = 0;
	let clears = 0;
	for (const node of formatting.nodes) {
		charge();
		if (node.floatSide) {
			if (!["left", "right"].includes(node.floatSide))
				throw new AgentBrowserError(
					"unsupported",
					"Logical float placement is not coordinated",
				);
			floats++;
		}
		if (node.clear) {
			if (!["left", "right", "both"].includes(node.clear))
				throw new AgentBrowserError(
					"unsupported",
					"Logical float clearance is not coordinated",
				);
			if (!node.floatSide && node.kind !== "block" && node.kind !== "replaced")
				throw new AgentBrowserError(
					"unsupported",
					"Clearance requires a supported block owner",
				);
			clears++;
		}
		if (["flex", "grid", "table"].includes(node.contentMode ?? ""))
			throw new AgentBrowserError(
				"unsupported",
				"Float integration with flex, grid and table reflow is not coordinated",
			);
	}
	if (!floats || formatting.issues["float-layout-not-supported"] !== floats)
		throw new AgentBrowserError(
			"unsupported",
			"Float formatting ownership does not match its diagnostics",
		);
	if (floats > floatLayoutLimits.maxFloats)
		throw new AgentBrowserError(
			"resource-limit",
			"Document float count limit exceeded",
		);
	if ((formatting.issues["clear-layout-not-supported"] ?? 0) !== clears)
		throw new AgentBrowserError(
			"unsupported",
			"Float clearance ownership does not match its diagnostics",
		);
	const issues = { ...formatting.issues };
	delete issues["float-layout-not-supported"];
	delete issues["clear-layout-not-supported"];
	return Object.freeze({ ...formatting, issues: Object.freeze(issues) });
}

export function layoutFormattingFloatDocument(
	formatting: FormattingTree,
	maxWork: number,
	options: TextLayoutOptions = {},
): Readonly<DocumentLayout> {
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > formattingLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid float document work limit",
		);
	let work = formatting.metrics.work;
	const charge = () => {
		if (++work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Float document validation work limit exceeded",
			);
	};
	const accepted = acceptedFormatting(formatting, charge);
	const document = layoutFloatScope(
		accepted,
		maxWork - work,
		options,
		undefined,
		0,
	);
	return Object.freeze({
		...document,
		metrics: Object.freeze({
			...document.metrics,
			work: document.metrics.work + work,
		}),
	});
}

function layoutFloatScope(
	formatting: FormattingTree,
	maxWork: number,
	options: TextLayoutOptions,
	root: Readonly<BlockReflowRoot> | undefined,
	nesting: number,
): Readonly<DocumentLayout> {
	if (nesting >= maximumNesting)
		throw new AgentBrowserError(
			"resource-limit",
			"Float document nesting limit exceeded",
		);
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Float document work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Float document work limit exceeded",
			);
		return maxWork - work;
	};
	const resolution: AtomicInlineResolutionContext = {
		nesting,
		floatRoot: root?.id,
		text: options,
		layoutFloat: (frame, limit, context) =>
			measureFloatBox(
				formatting,
				frame,
				limit,
				options,
				Math.max(nesting, context.nesting ?? 0) + 1,
			),
	};
	const rejectShell = () => {
		throw new AgentBrowserError(
			"unsupported",
			"Float flex, grid and table shell reflow is not coordinated",
		);
	};
	const horizontal = root
		? resolveFormattingBlockWidths(
				formatting,
				[root],
				Math.min(remaining(), formattingLimits.maxWork),
				true,
				rejectShell,
				resolution,
			)
		: resolveFormattingPageWidths(
				formatting,
				Math.min(remaining(), formattingLimits.maxWork),
				rejectShell,
				resolution,
			);
	charge(horizontal.metrics.work);
	const document = layoutFormattingFloatFlow(
		horizontal,
		remaining(),
		options,
		root !== undefined,
	);
	charge(document.metrics.work);
	return Object.freeze({
		...document,
		metrics: Object.freeze({ ...document.metrics, work }),
	});
}

export function layoutFormattingFloatFlow(
	horizontal: DocumentBlockWidths,
	maxWork: number,
	options: TextLayoutOptions = {},
	isolated = false,
): Readonly<DocumentLayout> {
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > formattingLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid float flow work limit",
		);
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Float flow work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Float flow work limit exceeded",
			);
		return maxWork - work;
	};
	const formatting = horizontal.formatting;
	if (!horizontal.floatLayouts?.length) {
		const text = layoutFormattingText(horizontal, {
			...options,
			maxWork: Math.min(
				options.maxWork ?? textLayoutLimits.maxWork,
				remaining(),
			),
		});
		charge(text.metrics.work);
		const document = layoutFormattingDocument(text, remaining(), isolated);
		charge(document.metrics.work);
		return mergeAtomicInlineLayouts(
			Object.freeze({
				...document,
				metrics: Object.freeze({ ...document.metrics, work }),
			}),
			horizontal.atomicLayouts ?? [],
			maxWork,
			options,
		);
	}
	const widths = new Map(
		horizontal.widths.map((width) => {
			charge();
			return [width.id, width] as const;
		}),
	);
	const floats = new Map(
		(horizontal.floatLayouts ?? []).map((owner) => {
			charge();
			return [owner.id, owner] as const;
		}),
	);
	const frames = new Map<number, Readonly<DocumentFlowFrame>>();
	const scopes = new Map<number, FloatScope>();
	const owners = new Map<number, FloatScope>();
	const placed = new Map<
		number,
		{ scope: FloatScope; placement: FloatPlacement }
	>();
	let coordinationWork = 0;
	const account = (amount = 1) => {
		coordinationWork += amount;
		if (coordinationWork > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Float coordination work limit exceeded",
			);
	};
	const use = <Value>(
		scope: FloatScope,
		operation: (context: FloatLayoutContext) => Value,
	): Value => {
		const context = (scope.context ??= new FloatLayoutContext({
			maxWork: Math.min(floatLayoutLimits.maxWork, maxWork),
		}));
		const before = context.metrics().work;
		try {
			return operation(context);
		} finally {
			account(context.metrics().work - before);
		}
	};
	const emptyLayout: NonNullable<TextFormattingInput["floatLayout"]> = {
		place: () => {},
		interval: (id) => ({
			left: 0,
			right: widths.get(id)?.contentWidth ?? 0,
			nextBottom: null,
		}),
	};
	const provisional = layoutFormattingText(
		{ ...horizontal, floatLayout: emptyLayout },
		{
			...options,
			maxWork: Math.min(
				options.maxWork ?? textLayoutLimits.maxWork,
				remaining(),
			),
		},
	);
	charge(provisional.metrics.work);
	const floatLayout: NonNullable<TextFormattingInput["floatLayout"]> = {
		place: (id, floatId, anchor) => {
			account();
			const frame = frames.get(id);
			const scope = owners.get(id);
			const owner = floats.get(floatId);
			const node = formatting.nodes[floatId];
			if (
				!frame ||
				!scope ||
				!owner ||
				placed.has(floatId) ||
				owner.containingBlock !== id
			)
				throw new AgentBrowserError(
					"unsupported",
					"Missing or duplicate source-ordered float ownership",
				);
			if (node.floatSide !== "left" && node.floatSide !== "right")
				throw new AgentBrowserError("unsupported", "Uncoordinated float side");
			const left = frame.width.contentX - scope.frame.width.contentX;
			const top = frame.contentY - scope.frame.contentY;
			const lineTop = top + anchor.top;
			let minimumTop = Math.max(scope.floor, lineTop);
			if (anchor.hasContent) {
				const interval = use(scope, (context) =>
					context.lineInterval({
						left,
						right: left + frame.width.contentWidth,
						top: lineTop,
						bottom: lineTop + anchor.height,
					}),
				);
				if (owner.width + anchor.occupiedWidth > interval.width)
					minimumTop = Math.max(minimumTop, lineTop + anchor.height);
			}
			const placement = use(scope, (context) =>
				context.place({
					id: floatId,
					side: node.floatSide as "left" | "right",
					clear: (node.clear ?? "none") as FloatClear,
					containingBlock: {
						left,
						right: left + frame.width.contentWidth,
						top,
					},
					minimumTop,
					width: owner.width,
					height: owner.height,
				}),
			);
			scope.floor = Math.max(scope.floor, placement.top);
			scope.bottom = Math.max(scope.bottom, placement.bottom);
			scope.placements.push(placement);
			placed.set(floatId, { scope, placement });
		},
		interval: (id, top, bottom) => {
			account();
			const frame = frames.get(id);
			const scope = owners.get(id);
			if (!frame || !scope)
				throw new AgentBrowserError(
					"unsupported",
					"Missing float line formatting context",
				);
			if (!scope.context)
				return { left: 0, right: frame.width.contentWidth, nextBottom: null };
			const left = frame.width.contentX - scope.frame.width.contentX;
			const originTop = frame.contentY - scope.frame.contentY;
			const interval = use(scope, (context) =>
				context.lineInterval({
					left,
					right: left + frame.width.contentWidth,
					top: originTop + top,
					bottom: originTop + bottom,
				}),
			);
			return {
				left: layoutNumber(interval.left - left),
				right: layoutNumber(interval.right - left),
				nextBottom:
					interval.nextBottom === null
						? null
						: layoutNumber(interval.nextBottom - originTop, true),
			};
		},
	};
	const coordinator: DocumentFlowCoordinator = {
		work: () => coordinationWork,
		clearanceBottom: (frame, owner) => {
			account();
			const clear = frame.node.clear;
			if (!clear || frame.node.floatSide) return null;
			if (clear !== "left" && clear !== "right" && clear !== "both")
				throw new AgentBrowserError(
					"unsupported",
					"Logical float clearance is not coordinated",
				);
			const scope = owners.get(owner ?? frame.width.containingBlock);
			if (!scope?.context) return null;
			const bottom = use(scope, (context) => context.clearanceBottom(clear));
			return bottom === null
				? null
				: layoutNumber(scope.frame.contentY + bottom, true);
		},
		enterBlock: (frame) => {
			account();
			frames.set(frame.node.id, frame);
			const parent = owners.get(frame.width.containingBlock);
			if (frame.node.independentContext || !parent) {
				const scope: FloatScope = {
					id: frame.node.id,
					frame,
					floor: 0,
					bottom: 0,
					placements: [],
				};
				scopes.set(scope.id, scope);
				owners.set(scope.id, scope);
			} else {
				owners.set(frame.node.id, parent);
				parent.floor = Math.max(
					parent.floor,
					frame.borderY - frame.marginTop - parent.frame.contentY,
				);
			}
		},
		layoutText: (context, frame, limit) => {
			const input = { ...horizontal, widths: [frame.width], floatLayout };
			const text = layoutFormattingText(input, {
				...options,
				maxWork: Math.min(limit, options.maxWork ?? textLayoutLimits.maxWork),
			});
			const resolved = text.contexts[0];
			if (!resolved || resolved.id !== context.id || text.contexts.length !== 1)
				throw new AgentBrowserError(
					"unsupported",
					"Missing coordinated float text context",
				);
			const scope = owners.get(frame.node.id) as FloatScope;
			const last = resolved.lines.at(-1);
			if (last)
				scope.floor = Math.max(
					scope.floor,
					frame.contentY - scope.frame.contentY + last.top,
				);
			return { context: resolved, metrics: text.metrics };
		},
		naturalHeight: (frame) => {
			account();
			const scope = scopes.get(frame.node.id);
			return scope
				? Math.max(frame.naturalContentHeight, scope.bottom)
				: frame.naturalContentHeight;
		},
		positionBlock: (frame) => {
			account();
			if (
				!frame.node.independentContext ||
				frame.width.containingBlock === frame.node.id
			)
				return frame.borderY;
			const scope = owners.get(frame.width.containingBlock);
			if (!scope) return frame.borderY;
			let top = frame.borderY - scope.frame.contentY;
			const left = frame.width.borderX - scope.frame.width.contentX;
			for (const placement of scope.placements) {
				account();
				if (
					placement.height > 0 &&
					left < placement.right &&
					left + frame.width.borderBoxWidth > placement.left &&
					top + frame.borderBoxHeight > placement.top &&
					top < placement.bottom
				)
					top = placement.bottom;
			}
			return layoutNumber(scope.frame.contentY + top, true);
		},
		finishBlock: (frame) => {
			account();
			frames.set(frame.node.id, frame);
			const scope = scopes.get(frame.node.id);
			if (scope) scope.frame = frame;
			const parent = owners.get(frame.width.containingBlock);
			if (parent && parent.id !== frame.node.id)
				parent.floor = Math.max(
					parent.floor,
					frame.borderY - frame.marginTop - parent.frame.contentY,
				);
		},
	};
	try {
		const base = layoutFormattingDocument(
			provisional,
			remaining(),
			isolated,
			new Map(),
			coordinator,
		);
		charge(base.metrics.work);
		if (placed.size !== floats.size)
			throw new AgentBrowserError(
				"unsupported",
				"Not every retained float has a text source anchor",
			);
		return mergeAtomicInlineLayouts(
			mergeFloats(base, horizontal, placed, work, maxWork, options),
			horizontal.atomicLayouts ?? [],
			maxWork,
			options,
		);
	} finally {
		for (const scope of scopes.values()) scope.context?.close();
	}
}

function measureFloatBox(
	formatting: FormattingTree,
	frame: Readonly<BlockReflowRoot>,
	maxWork: number,
	options: TextLayoutOptions,
	nesting: number,
): Readonly<FloatBoxLayout> {
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Float box measurement work limit exceeded",
			);
	};
	const node = formatting.nodes[frame.id];
	const style = node.box ?? initialBoxStyle;
	const borders = resolveBorders(style);
	let intrinsic: { minContent: number; maxContent: number } | undefined;
	if (style.width === "auto" && node.kind !== "replaced") {
		const measured = measureValidatedIntrinsicRoot(
			formatting,
			node.id,
			frame.containingHeight,
			{
				maxWork: Math.min(intrinsicWidthLimits.maxWork, maxWork - work),
				text: options,
			},
			nesting,
		);
		charge(measured.metrics.work);
		intrinsic = measured.widths.find((width) => {
			charge();
			return width.id === node.id;
		});
		if (!intrinsic)
			throw new AgentBrowserError(
				"unsupported",
				"Missing floated intrinsic width",
			);
	}
	let width: Readonly<BlockWidth>;
	if (node.kind === "replaced" && node.intrinsic) {
		const replaced = resolveReplacedSize(
			node.intrinsic.width,
			node.intrinsic.height,
			style,
			frame.containingWidth,
			frame.containingHeight,
			!node.control && node.intrinsicRatio !== false,
		);
		width = Object.freeze({
			containingWidth: frame.containingWidth,
			contentWidth: replaced.contentWidth,
			paddingLeft: replaced.paddingLeft,
			paddingRight: replaced.paddingRight,
			borderLeft: borders.borderLeft,
			borderRight: borders.borderRight,
			marginLeft: replaced.marginLeft,
			marginRight: replaced.marginRight,
			borderBoxWidth: replaced.borderBoxWidth,
			contentOffset: layoutNumber(
				replaced.marginLeft + borders.borderLeft + replaced.paddingLeft,
				true,
			),
			clampedBy: "none",
		});
	} else {
		width = resolveShrinkToFitWidth(
			style,
			frame.containingWidth,
			intrinsic,
			borders,
		);
	}
	const document = layoutFloatScope(
		formatting,
		maxWork - work,
		options,
		{ ...frame, containingBlock: node.id, contentX: 0, usedWidth: width },
		nesting,
	);
	charge(document.metrics.work);
	const box = document.boxes.find((box) => {
		charge();
		return box.id === node.id;
	});
	if (!box)
		throw new AgentBrowserError("unsupported", "Missing floated document root");
	const outerWidth = box.marginLeft + box.borderBoxWidth + box.marginRight;
	const outerHeight = box.marginTop + box.borderBoxHeight + box.marginBottom;
	if (outerWidth < 0 || outerHeight < 0)
		throw new AgentBrowserError(
			"unsupported",
			"Negative float outer extents are not coordinated",
		);
	return Object.freeze({
		id: node.id,
		containingBlock: frame.containingBlock,
		width: layoutNumber(outerWidth),
		height: layoutNumber(outerHeight),
		marginLeft: box.marginLeft,
		marginRight: box.marginRight,
		marginTop: box.marginTop,
		marginBottom: box.marginBottom,
		document,
		metrics: Object.freeze({ work }),
	});
}

function mergeFloats(
	base: Readonly<DocumentLayout>,
	horizontal: DocumentBlockWidths,
	placed: ReadonlyMap<number, { scope: FloatScope; placement: FloatPlacement }>,
	initialWork: number,
	maxWork: number,
	options: TextLayoutOptions,
): Readonly<DocumentLayout> {
	let work = initialWork;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Float layout merge work limit exceeded",
			);
	};
	const boxes = [...base.boxes];
	const contexts = [...base.contexts];
	const relativeContexts = [...base.text.contexts];
	const widths = [...horizontal.widths];
	const images = [...horizontal.images];
	charge(
		boxes.length +
			contexts.length +
			relativeContexts.length +
			widths.length +
			images.length,
	);
	const roots = new Map(
		base.boxes.map((box) => {
			charge();
			return [box.id, box] as const;
		}),
	);
	const textMetrics = { ...base.text.metrics };
	for (const owner of horizontal.floatLayouts ?? []) {
		charge();
		const location = placed.get(owner.id);
		const containing = location && roots.get(location.scope.id);
		const root = owner.document.boxes.find((box) => {
			charge();
			return box.id === owner.id;
		});
		if (!location || !containing || !root)
			throw new AgentBrowserError(
				"unsupported",
				"Missing float merge ownership",
			);
		const offsetX = layoutNumber(
			containing.contentX +
				location.placement.left +
				owner.marginLeft -
				root.borderX,
			true,
		);
		const offsetY = layoutNumber(
			containing.contentY +
				location.placement.top +
				owner.marginTop -
				root.borderY,
			true,
		);
		for (const box of owner.document.boxes) {
			charge();
			boxes.push(
				Object.freeze({
					...box,
					containingBlock:
						box.id === owner.id ? owner.containingBlock : box.containingBlock,
					borderX: layoutNumber(box.borderX + offsetX, true),
					contentX: layoutNumber(box.contentX + offsetX, true),
					borderY: layoutNumber(box.borderY + offsetY, true),
					contentY: layoutNumber(box.contentY + offsetY, true),
				}),
			);
		}
		for (const width of owner.document.text.horizontal.widths) {
			charge();
			widths.push(
				Object.freeze({
					...width,
					containingBlock:
						width.id === owner.id
							? owner.containingBlock
							: width.containingBlock,
					borderX: layoutNumber(width.borderX + offsetX, true),
					contentX: layoutNumber(width.contentX + offsetX, true),
				}),
			);
		}
		for (const image of owner.document.text.horizontal.images) {
			charge();
			images.push(image);
		}
		for (const context of owner.document.contexts) {
			charge();
			const positioned: PositionedTextContext = {
				...context,
				contentX: layoutNumber(context.contentX + offsetX, true),
				contentY: layoutNumber(context.contentY + offsetY, true),
				lines: Object.freeze(
					context.lines.map((line) => {
						charge();
						return Object.freeze({
							...line,
							top: layoutNumber(line.top + offsetY, true),
							baseline: layoutNumber(line.baseline + offsetY, true),
						});
					}),
				),
				glyphs: Object.freeze(
					context.glyphs.map((glyph) => {
						charge();
						return Object.freeze({
							...glyph,
							x: layoutNumber(glyph.x + offsetX, true),
							y: layoutNumber(glyph.y + offsetY, true),
						});
					}),
				),
				fragments: Object.freeze(
					context.fragments.map((fragment) => {
						charge();
						return Object.freeze({
							...fragment,
							x: layoutNumber(fragment.x + offsetX, true),
							y: layoutNumber(fragment.y + offsetY, true),
						});
					}),
				),
			};
			contexts.push(Object.freeze(positioned));
		}
		for (const context of owner.document.text.contexts) {
			charge();
			relativeContexts.push(
				Object.freeze({
					...context,
					contentX: layoutNumber(context.contentX + offsetX, true),
					glyphs: Object.freeze(
						context.glyphs.map((glyph) => {
							charge();
							return Object.freeze({
								...glyph,
								x: layoutNumber(glyph.x + offsetX, true),
							});
						}),
					),
					fragments: Object.freeze(
						context.fragments.map((fragment) => {
							charge();
							return Object.freeze({
								...fragment,
								x: layoutNumber(fragment.x + offsetX, true),
							});
						}),
					),
				}),
			);
		}
		for (const key of Object.keys(textMetrics) as (keyof typeof textMetrics)[])
			textMetrics[key] += owner.document.text.metrics[key];
	}
	for (const [metric, maximum] of [
		["tokens", options.maxTokens ?? textLayoutLimits.maxTokens],
		["lines", options.maxLines ?? textLayoutLimits.maxLines],
		["fragments", options.maxFragments ?? textLayoutLimits.maxFragments],
		["work", options.maxWork ?? textLayoutLimits.maxWork],
	] as const)
		if (textMetrics[metric] > maximum)
			throw new AgentBrowserError(
				"resource-limit",
				"Combined float text retention limit exceeded",
			);
	const text: DocumentTextLayout = Object.freeze({
		...base.text,
		horizontal: Object.freeze({
			...horizontal,
			widths: Object.freeze(widths),
			images: Object.freeze(images),
		}),
		contexts: Object.freeze(relativeContexts),
		metrics: Object.freeze(textMetrics),
	});
	return Object.freeze({
		...base,
		text,
		boxes: Object.freeze(boxes),
		contexts: Object.freeze(contexts),
		metrics: Object.freeze({
			work,
			boxes: boxes.length,
			glyphs: textMetrics.glyphs,
			lines: textMetrics.lines,
		}),
	});
}
