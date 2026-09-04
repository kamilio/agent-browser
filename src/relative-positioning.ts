import type { BoxStyle } from "./css-box.js";
import type { DocumentLayout } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";

export function resolveRelativeInsets(
	style: BoxStyle,
	width: number,
	height: number | null,
): Readonly<{ left: number; top: number }> {
	layoutNumber(width);
	if (height !== null) layoutNumber(height);
	const axis = (start: string, end: string, basis: number | null) => {
		const length = (value: string) =>
			value === "auto" || (basis === null && value.includes("%"))
				? null
				: resolveLayoutLength(value, basis ?? 0, true);
		const leading = length(start);
		if (leading !== null) return leading;
		return layoutNumber(-(length(end) ?? 0), true);
	};
	return Object.freeze({
		left: axis(style.left, style.right, width),
		top: axis(style.top, style.bottom, height),
	});
}

export function applyRelativePositioning(
	layout: Readonly<DocumentLayout>,
	maxWork: number,
): Readonly<DocumentLayout> {
	const formatting = layout.text.horizontal.formatting;
	if (!formatting.nodes.some((node) => node.position === "relative"))
		return layout;
	let work = layout.metrics.work;
	const charge = () => {
		if (++work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Relative positioning work limit exceeded",
			);
	};
	const boxes = new Map(
		layout.boxes.map((box) => {
			charge();
			return [box.id, box];
		}),
	);
	const offsets = new Map<number, Readonly<{ left: number; top: number }>>();
	const positions: Readonly<{ id: number; left: number; top: number }>[] = [];
	const pending = [
		{ id: formatting.root, containing: formatting.root, left: 0, top: 0 },
	];
	while (pending.length) {
		charge();
		const state = pending.pop() as (typeof pending)[number];
		const node = formatting.nodes[state.id];
		const box = boxes.get(node.id);
		const containingId = box?.containingBlock ?? state.containing;
		const containing = boxes.get(containingId);
		let left = state.left;
		let top = state.top;
		if (node.position === "relative" && node.box) {
			const own = resolveRelativeInsets(
				node.box,
				containing?.contentWidth ?? formatting.viewport.width,
				containingId === formatting.root
					? formatting.viewport.height
					: (containing?.definiteHeight ?? null),
			);
			positions.push(Object.freeze({ id: node.id, ...own }));
			left = layoutNumber(left + own.left, true);
			top = layoutNumber(top + own.top, true);
		}
		offsets.set(node.id, Object.freeze({ left, top }));
		for (let index = node.children.length - 1; index >= 0; index--) {
			charge();
			pending.push({
				id: node.children[index],
				containing: box ? node.id : state.containing,
				left,
				top,
			});
		}
	}
	const offset = (id: number) => {
		charge();
		const value = offsets.get(id);
		if (!value)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing relative positioning owner",
			);
		return value;
	};
	const rectangle = (x: number, y: number, width: number, height: number) => {
		layoutNumber(x + width, true);
		layoutNumber(y + height, true);
		return { x: layoutNumber(x, true), y: layoutNumber(y, true) };
	};
	const contexts = layout.contexts.map((context) => {
		const own = offset(context.id);
		return Object.freeze({
			...context,
			contentX: layoutNumber(context.contentX + own.left, true),
			contentY: layoutNumber(context.contentY + own.top, true),
			lines: Object.freeze(
				context.lines.map((line) => {
					charge();
					return Object.freeze({
						...line,
						top: layoutNumber(line.top + own.top, true),
						baseline: layoutNumber(line.baseline + own.top, true),
					});
				}),
			),
			glyphs: Object.freeze(
				context.glyphs.map((glyph) => {
					const shift = offset(glyph.formattingId);
					return Object.freeze({
						...glyph,
						...rectangle(
							glyph.x + shift.left,
							glyph.y + shift.top,
							glyph.advance,
							glyph.fontSize,
						),
					});
				}),
			),
			fragments: Object.freeze(
				context.fragments.map((fragment) => {
					const shift = offset(fragment.formattingId);
					return Object.freeze({
						...fragment,
						...rectangle(
							fragment.x + shift.left,
							fragment.y + shift.top,
							fragment.width,
							fragment.height,
						),
					});
				}),
			),
		});
	});
	const relativeContexts = contexts.map((context) =>
		Object.freeze({
			...context,
			lines: Object.freeze(
				context.lines.map((line) => {
					charge();
					return Object.freeze({
						...line,
						top: layoutNumber(line.top - context.contentY, true),
						baseline: layoutNumber(line.baseline - context.contentY, true),
					});
				}),
			),
			glyphs: Object.freeze(
				context.glyphs.map((glyph) => {
					charge();
					return Object.freeze({
						...glyph,
						y: layoutNumber(glyph.y - context.contentY, true),
					});
				}),
			),
			fragments: Object.freeze(
				context.fragments.map((fragment) => {
					charge();
					return Object.freeze({
						...fragment,
						y: layoutNumber(fragment.y - context.contentY, true),
					});
				}),
			),
		}),
	);
	const positionedBoxes = layout.boxes.map((box) => {
		const shift = offset(box.id);
		const border = rectangle(
			box.borderX + shift.left,
			box.borderY + shift.top,
			box.borderBoxWidth,
			box.borderBoxHeight,
		);
		return Object.freeze({
			...box,
			borderX: border.x,
			borderY: border.y,
			contentX: layoutNumber(box.contentX + shift.left, true),
			contentY: layoutNumber(box.contentY + shift.top, true),
		});
	});
	return Object.freeze({
		...layout,
		boxes: Object.freeze(positionedBoxes),
		contexts: Object.freeze(contexts),
		text: Object.freeze({
			...layout.text,
			contexts: Object.freeze(relativeContexts),
		}),
		relativePositions: Object.freeze(positions),
		metrics: Object.freeze({ ...layout.metrics, work }),
	});
}
