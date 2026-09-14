import type { DocumentLayout } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import { positionDocumentLayout } from "./relative-positioning.js";
import { establishesScrollport } from "./overflow-policy.js";

interface Rectangle {
	x: number;
	y: number;
	width: number;
	height: number;
}

function axisOffset(
	startValue: string,
	endValue: string,
	scrollStart: number,
	scrollSize: number,
	borderStart: number,
	borderSize: number,
	containingStart: number,
	containingSize: number,
	marginStart: number,
	marginEnd: number,
) {
	const inset = (value: string) =>
		value === "auto" ? null : resolveLayoutLength(value, scrollSize, true);
	const start = inset(startValue);
	const end = inset(endValue);
	const viewStart = layoutNumber(scrollStart + (start ?? 0), true);
	const effectiveEnd = Math.min(
		end ?? 0,
		scrollSize - (start ?? 0) - borderSize,
	);
	const viewEnd = layoutNumber(scrollStart + scrollSize - effectiveEnd, true);
	const borderEnd = layoutNumber(borderStart + borderSize, true);
	const containingEnd = layoutNumber(containingStart + containingSize, true);
	const leadingMargin = Math.min(
		marginStart,
		Math.abs(borderStart - marginStart - containingStart),
	);
	const trailingMargin = Math.min(
		marginEnd,
		Math.abs(containingEnd - borderEnd - marginEnd),
	);
	let movement = start === null ? 0 : Math.max(0, viewStart - borderStart);
	if (end !== null) movement = Math.min(movement, viewEnd - borderEnd);
	if (movement > 0)
		movement = Math.max(
			0,
			Math.min(movement, containingEnd - trailingMargin - borderEnd),
		);
	else if (movement < 0)
		movement = Math.min(
			0,
			Math.max(movement, containingStart + leadingMargin - borderStart),
		);
	return layoutNumber(movement, true);
}

export function projectStickyLayout(
	layout: Readonly<DocumentLayout>,
	scroll: Readonly<{ x: number; y: number }>,
	maxWork: number,
): Readonly<DocumentLayout> {
	const formatting = layout.text.horizontal.formatting;
	if (!formatting.nodes.some((node) => node.position === "sticky"))
		return layout;
	let work = layout.metrics.work;
	const charge = () => {
		if (++work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Sticky positioning work limit exceeded",
			);
	};
	const boxes = new Map(
		layout.boxes.map((box) => {
			charge();
			return [box.id, box];
		}),
	);
	const fragments = new Map<number, Rectangle>();
	for (const context of layout.contexts) {
		charge();
		for (const fragment of context.fragments) {
			charge();
			if (formatting.nodes[fragment.formattingId].position !== "sticky")
				continue;
			const previous = fragments.get(fragment.formattingId);
			if (previous && previous.y !== fragment.y)
				throw new AgentBrowserError(
					"unsupported",
					"Multiline inline sticky positioning is not implemented",
				);
			const left = Math.min(previous?.x ?? fragment.x, fragment.x);
			const top = Math.min(previous?.y ?? fragment.y, fragment.y);
			fragments.set(fragment.formattingId, {
				x: left,
				y: top,
				width:
					Math.max(
						previous ? previous.x + previous.width : fragment.x,
						fragment.x + fragment.width,
					) - left,
				height:
					Math.max(
						previous ? previous.y + previous.height : fragment.y,
						fragment.y + fragment.height,
					) - top,
			});
		}
	}
	const images = new Map(
		layout.text.horizontal.images.map((image) => {
			charge();
			return [image.id, image];
		}),
	);
	const fixed = new Set<number>();
	for (const id of layout.fixedIds ?? []) {
		charge();
		fixed.add(id);
	}
	const offsets = new Map<number, Readonly<{ left: number; top: number }>>();
	const stickyOffsets: Readonly<{ id: number; left: number; top: number }>[] =
		[];
	const zero: Readonly<{ left: number; top: number }> = Object.freeze({
		left: 0,
		top: 0,
	});
	const viewport = { x: 0, y: 0, ...formatting.viewport };
	const pending: {
		id: number;
		containing: number;
		left: number;
		top: number;
		port?: number;
	}[] = [{ id: formatting.root, containing: formatting.root, ...zero }];
	let moved = false;
	while (pending.length) {
		charge();
		const state = pending.pop() as (typeof pending)[number];
		const node = formatting.nodes[state.id];
		const box = boxes.get(node.id);
		let left = node.position === "fixed" ? 0 : state.left;
		let top = node.position === "fixed" ? 0 : state.top;
		const portId = node.position === "fixed" ? undefined : state.port;
		const port = portId === undefined ? undefined : boxes.get(portId);
		const portOffset =
			portId === undefined ? zero : (offsets.get(portId) ?? zero);
		if (node.position === "sticky" && node.box) {
			let containingId = box?.containingBlock ?? state.containing;
			while (formatting.nodes[containingId].kind === "anonymous-block") {
				charge();
				containingId =
					boxes.get(containingId)?.containingBlock ?? formatting.root;
			}
			const owner = boxes.get(containingId);
			const containing =
				box?.gridArea ??
				(formatting.nodes[containingId].kind === "viewport" || !owner
					? viewport
					: {
							x: owner.contentX,
							y: owner.contentY,
							width: owner.contentWidth,
							height: owner.contentHeight,
						});
			const border = box
				? {
						x: box.borderX,
						y: box.borderY,
						width: box.borderBoxWidth,
						height: box.borderBoxHeight,
					}
				: fragments.get(node.id);
			if (border) {
				const containingOffset = offsets.get(containingId) ?? zero;
				const image = images.get(node.id);
				const margin = (value: string) =>
					value === "auto"
						? 0
						: resolveLayoutLength(value, containing.width, true);
				const ownLeft = axisOffset(
					node.box.left,
					node.box.right,
					port
						? port.borderX + port.borderLeft + portOffset.left
						: fixed.has(node.id)
							? 0
							: scroll.x,
					port
						? port.borderBoxWidth - port.borderLeft - port.borderRight
						: viewport.width,
					border.x + left,
					border.width,
					containing.x + containingOffset.left,
					containing.width,
					box?.marginLeft ??
						image?.marginLeft ??
						margin(node.box["margin-left"]),
					box?.marginRight ??
						image?.marginRight ??
						margin(node.box["margin-right"]),
				);
				const ownTop = axisOffset(
					node.box.top,
					node.box.bottom,
					port
						? port.borderY + port.borderTop + portOffset.top
						: fixed.has(node.id)
							? 0
							: scroll.y,
					port
						? port.borderBoxHeight - port.borderTop - port.borderBottom
						: viewport.height,
					border.y + top,
					border.height,
					containing.y + containingOffset.top,
					containing.height,
					box?.marginTop ?? image?.marginTop ?? 0,
					box?.marginBottom ?? image?.marginBottom ?? 0,
				);
				left = layoutNumber(left + ownLeft, true);
				top = layoutNumber(top + ownTop, true);
			}
		}
		moved ||= left !== 0 || top !== 0;
		offsets.set(node.id, Object.freeze({ left, top }));
		if (left !== 0 || top !== 0) {
			charge();
			stickyOffsets.push(Object.freeze({ id: node.id, left, top }));
		}
		for (let index = node.children.length - 1; index >= 0; index--) {
			charge();
			pending.push({
				id: node.children[index],
				containing: box ? node.id : state.containing,
				left,
				top,
				port:
					box && node.overflow && establishesScrollport(node.overflow)
						? node.id
						: portId,
			});
		}
	}
	const measured = Object.freeze({
		...layout,
		stickyOffsets: Object.freeze(stickyOffsets),
		metrics: Object.freeze({ ...layout.metrics, work }),
	});
	return moved
		? positionDocumentLayout(
				measured,
				(id) => {
					const offset = offsets.get(id);
					if (!offset)
						throw new AgentBrowserError(
							"invalid-input",
							"Missing sticky positioning owner",
						);
					return offset;
				},
				maxWork,
			)
		: measured;
}
