import type {
	DocumentLayout,
	DocumentBox,
	PositionedTextContext,
} from "./document-layout.js";
import type { FormattingTree } from "./formatting-tree.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

interface Baselines {
	first: number | null;
	last: number | null;
	unsupported: boolean;
}
export interface FlexPlacement {
	id: number;
	index: number;
	line: number;
	x: number;
	y: number;
	marginLeft?: number;
	marginRight?: number;
	marginTop: number;
	marginBottom: number;
	firstBaseline: number | null;
	lastBaseline: number | null;
}

export function collectFlexBaselines(
	layout: DocumentLayout,
	formatting: FormattingTree,
	charge: () => void,
) {
	const contexts = new Map(
		layout.contexts.map((context) => {
			charge();
			return [context.id, context];
		}),
	);
	const children = new Map<number, number[]>();
	for (const box of layout.boxes) {
		charge();
		if (
			box.containingBlock === box.id ||
			formatting.nodes[box.id].floatSide !== undefined
		)
			continue;
		const siblings = children.get(box.containingBlock) ?? [];
		siblings.push(box.id);
		children.set(box.containingBlock, siblings);
	}
	const values = new Map<number, Baselines>();
	for (const box of [...layout.boxes].reverse()) {
		charge();
		if (box.flexBaselines) {
			values.set(box.id, {
				first:
					box.flexBaselines.first === null
						? null
						: layoutNumber(box.borderY + box.flexBaselines.first, true),
				last:
					box.flexBaselines.last === null
						? null
						: layoutNumber(box.borderY + box.flexBaselines.last, true),
				unsupported: box.flexBaselines.unsupported,
			});
			continue;
		}
		const lines = contexts.get(box.id)?.lines;
		let first = lines?.[0]?.baseline ?? null;
		let last = lines?.at(-1)?.baseline ?? null;
		let unsupported = !!formatting.nodes[box.id].control;
		for (const child of children.get(box.id) ?? []) {
			charge();
			const value = values.get(child);
			if (!value)
				throw new AgentBrowserError(
					"unsupported",
					"Missing child baseline state",
				);
			unsupported ||= value.unsupported;
			if (first === null && value.first !== null) first = value.first;
			if (value.last !== null && !lines?.length) last = value.last;
		}
		values.set(box.id, { first, last, unsupported });
	}
	return values;
}

export function placeFlexLayout(
	layout: DocumentLayout,
	placements: ReadonlyMap<number, FlexPlacement>,
	charge: () => void,
) {
	const owners = new Map<number, number>();
	const boxes: Readonly<DocumentBox>[] = layout.boxes.map((box) => {
		charge();
		const root = placements.has(box.id)
			? box.id
			: owners.get(box.containingBlock);
		const placement = root === undefined ? undefined : placements.get(root);
		if (!placement || root === undefined)
			throw new AgentBrowserError("unsupported", "Missing flex box owner");
		owners.set(box.id, root);
		const borderX = layoutNumber(box.borderX + placement.x, true);
		const borderY = layoutNumber(box.borderY + placement.y, true);
		layoutNumber(borderX + box.borderBoxWidth, true);
		layoutNumber(borderY + box.borderBoxHeight, true);
		return Object.freeze({
			...box,
			borderX,
			borderY,
			contentX: layoutNumber(box.contentX + placement.x, true),
			contentY: layoutNumber(box.contentY + placement.y, true),
			...(root === box.id
				? {
						marginTop: placement.marginTop,
						marginBottom: placement.marginBottom,
						...(placement.marginLeft === undefined
							? {}
							: {
									marginLeft: placement.marginLeft,
									contentOffset: layoutNumber(
										placement.marginLeft + box.borderLeft + box.paddingLeft,
										true,
									),
								}),
						...(placement.marginRight === undefined
							? {}
							: { marginRight: placement.marginRight }),
					}
				: {}),
		});
	});
	const contexts: Readonly<PositionedTextContext>[] = layout.contexts.map(
		(context) => {
			charge();
			const root = owners.get(context.id);
			const placement = root === undefined ? undefined : placements.get(root);
			if (!placement)
				throw new AgentBrowserError("unsupported", "Missing flex text owner");
			const lines = context.lines.map((line) => {
				charge();
				const top = layoutNumber(line.top + placement.y, true);
				layoutNumber(top + line.height, true);
				return Object.freeze({
					...line,
					top,
					baseline: layoutNumber(line.baseline + placement.y, true),
				});
			});
			const glyphs = context.glyphs.map((glyph) => {
				charge();
				const x = layoutNumber(glyph.x + placement.x, true);
				const y = layoutNumber(glyph.y + placement.y, true);
				layoutNumber(x + glyph.advance, true);
				layoutNumber(y + glyph.fontSize, true);
				return Object.freeze({ ...glyph, x, y });
			});
			const fragments = context.fragments.map((fragment) => {
				charge();
				const x = layoutNumber(fragment.x + placement.x, true);
				const y = layoutNumber(fragment.y + placement.y, true);
				layoutNumber(x + fragment.width, true);
				layoutNumber(y + fragment.height, true);
				return Object.freeze({ ...fragment, x, y });
			});
			return Object.freeze({
				...context,
				contentX: layoutNumber(context.contentX + placement.x, true),
				contentY: layoutNumber(context.contentY + placement.y, true),
				lines: Object.freeze(lines),
				glyphs: Object.freeze(glyphs),
				fragments: Object.freeze(fragments),
			});
		},
	);
	const images = layout.text.horizontal.images.map((image) => {
		charge();
		const placement = placements.get(image.id);
		return placement
			? Object.freeze({
					...image,
					marginTop: placement.marginTop,
					marginBottom: placement.marginBottom,
					...(placement.marginLeft === undefined
						? {}
						: { marginLeft: placement.marginLeft }),
					...(placement.marginRight === undefined
						? {}
						: { marginRight: placement.marginRight }),
				})
			: image;
	});
	const boxesById = new Map(
		boxes.map((box) => {
			charge();
			return [box.id, box];
		}),
	);
	const items = [...placements.values()].map((item) => {
		charge();
		const box = boxesById.get(item.id);
		const placement = placements.get(item.id);
		if (!box || !placement)
			throw new AgentBrowserError("unsupported", "Missing final flex item box");
		return Object.freeze({ ...placement, box });
	});
	return { boxes, contexts, images, items };
}
