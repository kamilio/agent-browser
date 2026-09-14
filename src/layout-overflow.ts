import type { DocumentLayout } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import {
	clipsOverflow,
	type LayoutOverflow,
	type OverflowPort,
	type OverflowStyle,
	visibleOverflow,
} from "./overflow-policy.js";

interface Rectangle {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

interface PortState {
	id: number;
	x: number;
	y: number;
	width: number;
	height: number;
	right: number;
	bottom: number;
	paddingRight: number;
	paddingBottom: number;
	overflow: Readonly<OverflowStyle>;
	owner: number | null;
	fixed: number | null;
}

export function measureLayoutOverflow(
	layout: Readonly<DocumentLayout>,
	maxWork = 2_000_000,
): Readonly<LayoutOverflow> {
	if (!Number.isSafeInteger(maxWork) || maxWork < 1 || maxWork > 2_000_000)
		throw new AgentBrowserError("invalid-input", "Invalid overflow work limit");
	let work = 0;
	const charge = () => {
		if (++work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Layout overflow work limit exceeded",
			);
	};
	const invalid = () => {
		throw new AgentBrowserError("invalid-input", "Invalid overflow ownership");
	};
	const formatting = layout.text.horizontal.formatting;
	const nodes = formatting.nodes;
	if (nodes.length > 50_000 || layout.boxes.length > 50_000)
		throw new AgentBrowserError(
			"resource-limit",
			"Layout overflow node limit exceeded",
		);
	const nodeAt = (id: number) => {
		if (!Number.isSafeInteger(id) || id < 0 || id >= nodes.length) invalid();
		const node = nodes[id];
		if (!node || node.id !== id) invalid();
		return node;
	};
	const rootNode = nodeAt(formatting.root);
	if (rootNode.parent !== null) invalid();
	for (let index = 0; index < nodes.length; index++) {
		charge();
		nodeAt(index);
	}
	const rectangle = (x: number, y: number, width: number, height: number) => {
		charge();
		return {
			left: layoutNumber(x, true),
			top: layoutNumber(y, true),
			right: layoutNumber(x + layoutNumber(width), true),
			bottom: layoutNumber(y + layoutNumber(height), true),
		};
	};
	const boxes = new Map<number, DocumentLayout["boxes"][number]>();
	const borders = new Map<number, Rectangle>();
	for (const box of layout.boxes) {
		charge();
		nodeAt(box.id);
		nodeAt(box.containingBlock);
		if (boxes.has(box.id)) invalid();
		boxes.set(box.id, box);
		borders.set(
			box.id,
			rectangle(
				box.borderX,
				box.borderY,
				box.borderBoxWidth,
				box.borderBoxHeight,
			),
		);
	}
	const fixedIds = new Set<number>();
	for (const id of layout.fixedIds ?? []) {
		charge();
		nodeAt(id);
		fixedIds.add(id);
	}
	const nearest = new Map<number, number | null>();
	const fixed = new Map<number, number | null>();
	const pending: { id: number; owner: number | null; fixed: number | null }[] =
		[{ id: formatting.root, owner: null, fixed: null }];
	const scheduled = new Set([formatting.root]);
	while (pending.length) {
		charge();
		const entry = pending.pop() as (typeof pending)[number];
		const node = nodeAt(entry.id);
		if (nearest.has(node.id)) invalid();
		const owner = boxes.has(node.id) ? node.id : entry.owner;
		const fixedRoot =
			node.position === "fixed" ||
			(entry.fixed === null && fixedIds.has(node.id))
				? node.id
				: entry.fixed;
		nearest.set(node.id, owner);
		fixed.set(node.id, fixedRoot);
		for (const child of node.children) {
			charge();
			if (nodeAt(child).parent !== node.id || scheduled.has(child)) invalid();
			scheduled.add(child);
			pending.push({ id: child, owner, fixed: fixedRoot });
		}
	}
	const ownedNode = (id: number) => {
		const node = nodeAt(id);
		if (!nearest.has(id)) invalid();
		return node;
	};
	for (const id of fixedIds) {
		charge();
		ownedNode(id);
	}
	const states = new Map<number, PortState>();
	const viewport: PortState = {
		id: formatting.root,
		x: 0,
		y: 0,
		width: layoutNumber(formatting.viewport.width),
		height: layoutNumber(formatting.viewport.height),
		right: formatting.viewport.width,
		bottom: formatting.viewport.height,
		paddingRight: 0,
		paddingBottom: 0,
		overflow: visibleOverflow,
		owner: null,
		fixed: null,
	};
	for (const box of layout.boxes) {
		charge();
		const node = ownedNode(box.id);
		ownedNode(box.containingBlock);
		const overflow = node.overflow ?? visibleOverflow;
		for (const value of [overflow.x, overflow.y])
			if (!["visible", "hidden", "clip", "scroll", "auto"].includes(value))
				throw new AgentBrowserError("invalid-input", "Invalid used overflow");
		const horizontal = layoutNumber(
			box.borderX + layoutNumber(box.borderLeft),
			true,
		);
		const vertical = layoutNumber(
			box.borderY + layoutNumber(box.borderTop),
			true,
		);
		const width = layoutNumber(
			box.borderBoxWidth - box.borderLeft - layoutNumber(box.borderRight),
		);
		const height = layoutNumber(
			box.borderBoxHeight - box.borderTop - layoutNumber(box.borderBottom),
		);
		states.set(box.id, {
			id: box.id,
			x: horizontal,
			y: vertical,
			width,
			height,
			right: layoutNumber(horizontal + width, true),
			bottom: layoutNumber(vertical + height, true),
			paddingRight: layoutNumber(box.paddingRight),
			paddingBottom: layoutNumber(box.paddingBottom),
			overflow: Object.freeze({ x: overflow.x, y: overflow.y }),
			owner:
				box.id === formatting.root && box.containingBlock === box.id
					? null
					: (nearest.get(box.containingBlock) ?? null),
			fixed: fixed.get(box.id) ?? null,
		});
	}
	const complete = new Set<number>();
	for (const state of states.values()) {
		charge();
		const path: number[] = [];
		const active = new Set<number>();
		let owner: number | null = state.id;
		while (owner !== null && !complete.has(owner)) {
			charge();
			if (active.has(owner)) invalid();
			active.add(owner);
			path.push(owner);
			const current = states.get(owner);
			if (!current) invalid();
			owner = current!.owner;
		}
		for (const id of path) {
			charge();
			complete.add(id);
		}
	}
	const include = (
		initialOwner: number | null,
		initial: Rectangle,
		fixedRoot: number | null,
		endPadding = false,
	) => {
		let owner = initialOwner;
		let area = initial;
		if (endPadding && owner !== null) {
			const state = states.get(owner)!;
			if (
				(area.right > state.x ||
					(area.left === area.right && area.right === state.x)) &&
				(area.bottom > state.y ||
					(area.top === area.bottom && area.bottom === state.y))
			)
				area = {
					...area,
					right: layoutNumber(area.right + state.paddingRight, true),
					bottom: layoutNumber(area.bottom + state.paddingBottom, true),
				};
		}
		while (true) {
			charge();
			const state = owner === null ? viewport : states.get(owner)!;
			if (state.fixed !== fixedRoot) return;
			const zeroWidth = area.left === area.right;
			const zeroHeight = area.top === area.bottom;
			if (
				(area.right > state.x || (zeroWidth && area.right === state.x)) &&
				(area.bottom > state.y || (zeroHeight && area.bottom === state.y))
			) {
				state.right = Math.max(state.right, area.right);
				state.bottom = Math.max(state.bottom, area.bottom);
			}
			if (owner === null) return;
			const viewportBox =
				owner === formatting.root && rootNode.kind === "viewport";
			const clipX = !viewportBox && clipsOverflow(state.overflow.x);
			const clipY = !viewportBox && clipsOverflow(state.overflow.y);
			const left = clipX ? Math.max(area.left, state.x) : area.left;
			const right = clipX
				? Math.min(area.right, state.x + state.width)
				: area.right;
			const top = clipY ? Math.max(area.top, state.y) : area.top;
			const bottom = clipY
				? Math.min(area.bottom, state.y + state.height)
				: area.bottom;
			if (
				right < left ||
				bottom < top ||
				(right === left && !zeroWidth) ||
				(bottom === top && !zeroHeight)
			)
				return;
			area = { left, top, right, bottom };
			owner = state.owner;
		}
	};
	for (const box of layout.boxes) {
		charge();
		const node = nodeAt(box.id);
		const state = states.get(box.id)!;
		const border = borders.get(box.id)!;
		const inFlow = node.position !== "absolute" && node.position !== "fixed";
		if (border.right > border.left && border.bottom > border.top)
			include(state.owner, border, state.fixed, inFlow);
		if (node.gridItem || node.flexItem) {
			const area = {
				left: layoutNumber(
					border.left - layoutNumber(box.marginLeft, true),
					true,
				),
				top: layoutNumber(border.top - layoutNumber(box.marginTop, true), true),
				right: layoutNumber(
					border.right + layoutNumber(box.marginRight, true),
					true,
				),
				bottom: layoutNumber(
					border.bottom + layoutNumber(box.marginBottom, true),
					true,
				),
			};
			if (area.right > area.left && area.bottom > area.top)
				include(state.owner, area, state.fixed, inFlow);
		}
	}
	for (const context of layout.contexts) {
		charge();
		ownedNode(context.id);
		const owner = nearest.get(context.id) ?? null;
		const fixedRoot = fixed.get(context.id) ?? null;
		for (const line of context.lines)
			include(
				owner,
				rectangle(context.contentX, line.top, line.width, line.height),
				fixedRoot,
				true,
			);
		for (const fragment of context.fragments) {
			charge();
			ownedNode(fragment.formattingId);
			if (boxes.has(fragment.formattingId)) continue;
			include(
				nearest.get(fragment.formattingId) ?? null,
				rectangle(
					fragment.x,
					fragment.y,
					fragment.width +
						Math.max(0, layoutNumber(fragment.marginRight ?? 0, true)),
					fragment.height +
						Math.max(0, layoutNumber(fragment.marginBottom ?? 0, true)),
				),
				fixed.get(fragment.formattingId) ?? null,
				true,
			);
		}
		for (const glyph of context.glyphs) {
			charge();
			ownedNode(glyph.formattingId);
			if (glyph.advance === 0) continue;
			include(
				nearest.get(glyph.formattingId) ?? null,
				rectangle(glyph.x, glyph.y, glyph.advance, glyph.fontSize),
				fixed.get(glyph.formattingId) ?? null,
				true,
			);
		}
	}
	const ports = new Map<number, Readonly<OverflowPort>>();
	for (const state of states.values()) {
		charge();
		ports.set(
			state.id,
			Object.freeze({
				id: state.id,
				x: state.x,
				y: state.y,
				width: state.width,
				height: state.height,
				scrollWidth: layoutNumber(state.right - state.x),
				scrollHeight: layoutNumber(state.bottom - state.y),
				overflow: state.overflow,
			}),
		);
	}
	return Object.freeze({
		ports: Object.freeze(ports),
		root: Object.freeze({ width: viewport.right, height: viewport.bottom }),
		work,
	});
}
