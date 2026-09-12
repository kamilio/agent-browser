import { expect, it } from "vitest";
import { resolveBlockWidth } from "./block-width.js";
import { initialBoxStyle } from "./css-box.js";
import type {
	DocumentBox,
	DocumentLayout,
	PositionedTextContext,
} from "./document-layout.js";
import type { FormattingNode, FormattingTree } from "./formatting-tree.js";
import {
	layoutContentItems,
	type LayoutContentItem,
} from "./layout-paint-order.js";
import { stackingContentItems } from "./stacking-order.js";
import type {
	TextContext,
	TextGlyph,
	TextInlineFragment,
} from "./text-layout.js";

type NodeInput = Partial<Omit<FormattingNode, "id" | "parent" | "children">> & {
	parent: number | null;
};
interface ContextInput {
	id: number;
	glyphs?: readonly number[];
	fragments?: readonly { id: number; atomic?: true }[];
}

function freeze<Value>(value: Value): Value {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freeze(child);
		Object.freeze(value);
	}
	return value;
}

function fixture(
	inputs: readonly NodeInput[],
	contextInputs: readonly ContextInput[],
	markers: DocumentLayout["outsideMarkers"] = [],
): DocumentLayout {
	const nodes: FormattingNode[] = inputs.map(
		(input, id): FormattingNode => ({
			id,
			kind: id === 0 ? "viewport" : "block",
			level:
				input.kind === "text" || input.kind === "inline" ? "inline" : "block",
			visible: true,
			ref: id === 0 ? undefined : `e${id}`,
			...input,
			children: inputs.flatMap((child, index) =>
				child.parent === id ? [index] : [],
			),
		}),
	);
	const boxes: DocumentBox[] = nodes
		.filter((node) => node.kind !== "text" && node.kind !== "inline")
		.map(
			(node): DocumentBox => ({
				...resolveBlockWidth(initialBoxStyle, 120),
				id: node.id,
				ref: node.ref,
				containingBlock: node.parent ?? node.id,
				borderX: 0,
				contentX: 0,
				borderTop: 0,
				borderBottom: 0,
				containingHeight: null,
				preferredHeight: null,
				minimumHeight: 0,
				maximumHeight: null,
				definiteHeight: null,
				marginTop: 0,
				marginBottom: 0,
				paddingTop: 0,
				paddingBottom: 0,
				naturalContentHeight: 20,
				contentHeight: 20,
				borderBoxHeight: 20,
				borderY: node.id * 20,
				contentY: node.id * 20,
				heightClampedBy: "none",
				marginCollapse: {
					top: { positive: 0, negative: 0, value: 0 },
					bottom: { positive: 0, negative: 0, value: 0 },
					through: false,
					withFirstChild: false,
					withLastChild: false,
				},
			}),
		);
	const contexts: TextContext[] = contextInputs.map((input) => {
		const glyphs: TextGlyph[] = (input.glyphs ?? []).map((id, index) => ({
			formattingId: id,
			ref: `e${id}`,
			offset: 0,
			codeUnits: 1,
			character: nodes[id].text ?? "X",
			kind: "glyph",
			supported: true,
			visible: true,
			fontSize: 8,
			line: 0,
			x: index * 8,
			y: 2,
			advance: 8,
		}));
		const fragments: TextInlineFragment[] = (input.fragments ?? []).map(
			(fragment, index) => ({
				formattingId: fragment.id,
				ref: `e${fragment.id}`,
				atomic: fragment.atomic,
				line: 0,
				x: index * 12,
				y: 0,
				width: 12,
				height: 12,
			}),
		);
		return {
			id: input.id,
			ref: `e${input.id}`,
			contentX: 0,
			contentWidth: 120,
			textHeight: 12,
			lines: [
				{
					index: 0,
					top: 0,
					height: 12,
					baseline: 8,
					width: glyphs.length * 8 + fragments.length * 12,
					overflow: 0,
					forcedBreak: false,
					glyphStart: 0,
					glyphEnd: glyphs.length,
					fragmentStart: 0,
					fragmentEnd: fragments.length,
				},
			],
			glyphs,
			fragments,
		};
	});
	const glyphCount = contexts.reduce(
		(total, context) => total + context.glyphs.length,
		0,
	);
	const fragmentCount = contexts.reduce(
		(total, context) => total + context.fragments.length,
		0,
	);
	const formatting: FormattingTree = {
		stage: "display-decomposition",
		partial: true,
		revision: 1,
		root: 0,
		viewport: { width: 120, height: 120 },
		nodes,
		issues: {},
		metrics: {
			visitedDomNodes: nodes.length,
			boxes: boxes.length,
			textCodeUnits: glyphCount,
			work: 0,
			deferredSubtrees: 0,
		},
	};
	const positioned: PositionedTextContext[] = contexts.map((context) => ({
		...context,
		contentY: context.id * 20,
	}));
	return freeze({
		stage: "normal-flow-document-layout",
		partial: true,
		text: {
			stage: "block-relative-text-lines",
			partial: true,
			horizontal: {
				stage: "normal-flow-horizontal-only",
				partial: true,
				formatting,
				widths: boxes,
				images: [],
				metrics: { work: 0 },
			},
			contexts,
			metrics: {
				tokens: glyphCount + fragmentCount,
				lines: contexts.length,
				glyphs: glyphCount,
				fragments: fragmentCount,
				unsupportedGlyphs: 0,
				work: 0,
			},
		},
		boxes,
		contexts: positioned,
		flowHeight: nodes.length * 20,
		outsideMarkers: markers,
		metrics: {
			work: 0,
			boxes: boxes.length,
			glyphs: glyphCount,
			lines: contexts.length,
		},
	} satisfies DocumentLayout);
}

function label(item: LayoutContentItem) {
	if (item.kind === "glyph") return `glyph:${item.glyph.formattingId}`;
	if (item.kind === "fragment") return `fragment:${item.fragment.formattingId}`;
	if (item.kind === "marker") return `marker:${item.marker.id}`;
	return `${item.kind}:${item.box.id}`;
}

function paint(layout: DocumentLayout) {
	return [...layoutContentItems(layout, () => {})];
}

it.each(["left", "right", "inline-start", "inline-end"] as const)(
	"paints a %s float above block backgrounds and below earlier and later inline content",
	(floatSide) => {
		const layout = fixture(
			[
				{ parent: null },
				{ parent: 0 },
				{ parent: 1 },
				{ parent: 2, kind: "text", text: "B" },
				{ parent: 1, floatSide },
				{ parent: 4, kind: "text", text: "F" },
				{ parent: 1 },
				{ parent: 6, kind: "text", text: "L" },
			],
			[
				{ id: 2, glyphs: [3] },
				{ id: 4, glyphs: [5] },
				{ id: 6, glyphs: [7] },
			],
		);
		const items = paint(layout);
		expect(items.map(label)).toEqual([
			"box:0",
			"box:1",
			"box:2",
			"box:6",
			"box:4",
			"glyph:5",
			"glyph:3",
			"glyph:7",
		]);
		expect(
			items.find((item) => item.kind === "box" && item.box.id === 4),
		).toEqual({
			kind: "box",
			box: layout.boxes.find((box) => box.id === 4),
		});
		const glyph = items.find(
			(item) => item.kind === "glyph" && item.glyph.formattingId === 5,
		);
		expect(glyph?.kind).toBe("glyph");
		if (glyph?.kind !== "glyph") throw Error("Missing retained float glyph");
		expect(glyph.glyph).toBe(layout.text.contexts[1].glyphs[0]);
		expect(glyph.contentY).toBe(layout.contexts[1].contentY);
		expect(glyph.glyph.y).toBe(2);
	},
);

it("keeps multiple floats in source order and nests each float's own paint phases", () => {
	const layout = fixture(
		[
			{ parent: null },
			{ parent: 0 },
			{ parent: 1, floatSide: "left" },
			{ parent: 2 },
			{ parent: 3, kind: "text", text: "A" },
			{ parent: 2, floatSide: "right" },
			{ parent: 5, kind: "text", text: "N" },
			{ parent: 1, floatSide: "right" },
			{ parent: 7, kind: "text", text: "S" },
			{ parent: 1 },
			{ parent: 9, kind: "text", text: "L" },
		],
		[
			{ id: 3, glyphs: [4] },
			{ id: 5, glyphs: [6] },
			{ id: 7, glyphs: [8] },
			{ id: 9, glyphs: [10] },
		],
	);
	expect(paint(layout).map(label)).toEqual([
		"box:0",
		"box:1",
		"box:9",
		"box:2",
		"box:3",
		"box:5",
		"glyph:6",
		"glyph:4",
		"box:7",
		"glyph:8",
		"glyph:10",
	]);
});

it.each([
	{ position: "absolute", zIndex: -1, phase: "negative" },
	{ position: "absolute", zIndex: 0, phase: "zero" },
	{ position: "absolute", zIndex: 2, phase: "positive" },
	{ position: "relative", zIndex: undefined, phase: "zero" },
	{ position: "fixed", zIndex: undefined, phase: "zero" },
] as const)(
	"lets a $position/$zIndex descendant escape the float to its actual ancestor context",
	({ position, zIndex, phase }) => {
		const layout = fixture(
			[
				{ parent: null },
				{ parent: 0 },
				{ parent: 1, floatSide: "left" },
				{ parent: 2, position, zIndex },
				{ parent: 3, kind: "text", text: "P" },
				{ parent: 2, kind: "text", text: "F" },
				{ parent: 1 },
				{ parent: 6, kind: "text", text: "I" },
				{ parent: 1, position: "relative", zIndex: 1 },
				{ parent: 8, kind: "text", text: "S" },
			],
			[
				{ id: 2, glyphs: [5] },
				{ id: 3, glyphs: [4] },
				{ id: 6, glyphs: [7] },
				{ id: 8, glyphs: [9] },
			],
		);
		const descendant = ["box:3", "glyph:4"];
		expect(paint(layout).map(label)).toEqual([
			"box:0",
			"box:1",
			...(phase === "negative" ? descendant : []),
			"box:6",
			"box:2",
			"glyph:5",
			"glyph:7",
			...(phase === "zero" ? descendant : []),
			"box:8",
			"glyph:9",
			...(phase === "positive" ? descendant : []),
		]);
	},
);

it("keeps float descendants inside the nearest real ancestor stacking context", () => {
	const layout = fixture(
		[
			{ parent: null },
			{ parent: 0 },
			{ parent: 1, position: "relative", zIndex: 0 },
			{ parent: 2, floatSide: "left" },
			{ parent: 3, position: "absolute", zIndex: 9 },
			{ parent: 4, kind: "text", text: "P" },
			{ parent: 3, kind: "text", text: "F" },
			{ parent: 1, position: "relative", zIndex: 1 },
			{ parent: 7, kind: "text", text: "S" },
			{ parent: 2 },
			{ parent: 9, kind: "text", text: "I" },
		],
		[
			{ id: 3, glyphs: [6] },
			{ id: 4, glyphs: [5] },
			{ id: 7, glyphs: [8] },
			{ id: 9, glyphs: [10] },
		],
	);
	expect(paint(layout).map(label)).toEqual([
		"box:0",
		"box:1",
		"box:2",
		"box:9",
		"box:3",
		"glyph:6",
		"glyph:10",
		"box:4",
		"glyph:5",
		"box:7",
		"glyph:8",
	]);
});

it.each(["flexItem", "gridItem"] as const)(
	"lets a static z-index %s escape its float pseudo context",
	(itemFlag) => {
		const layout = fixture(
			[
				{ parent: null },
				{ parent: 0 },
				{ parent: 1, floatSide: "left" },
				{ parent: 2, [itemFlag]: true, zIndex: 2 },
				{ parent: 3, kind: "text", text: "P" },
				{ parent: 2, kind: "text", text: "F" },
				{ parent: 1 },
				{ parent: 6, kind: "text", text: "I" },
				{ parent: 1, position: "relative", zIndex: 1 },
				{ parent: 8, kind: "text", text: "S" },
			],
			[
				{ id: 2, glyphs: [5] },
				{ id: 3, glyphs: [4] },
				{ id: 6, glyphs: [7] },
				{ id: 8, glyphs: [9] },
			],
		);
		expect(paint(layout).map(label)).toEqual([
			"box:0",
			"box:1",
			"box:6",
			"box:2",
			"glyph:5",
			"glyph:7",
			"box:8",
			"glyph:9",
			"box:3",
			"glyph:4",
		]);
		expect(layout.text.horizontal.formatting.nodes[3].position).toBeUndefined();
	},
);

it("lets a positioned descendant escape through multiple nested float pseudo contexts", () => {
	const layout = fixture(
		[
			{ parent: null },
			{ parent: 0 },
			{ parent: 1, floatSide: "left" },
			{ parent: 2, floatSide: "right" },
			{ parent: 3, position: "absolute", zIndex: 2 },
			{ parent: 4, kind: "text", text: "P" },
			{ parent: 3, kind: "text", text: "N" },
			{ parent: 2, kind: "text", text: "F" },
			{ parent: 1 },
			{ parent: 8, kind: "text", text: "I" },
			{ parent: 1, position: "relative", zIndex: 1 },
			{ parent: 10, kind: "text", text: "S" },
		],
		[
			{ id: 2, glyphs: [7] },
			{ id: 3, glyphs: [6] },
			{ id: 4, glyphs: [5] },
			{ id: 8, glyphs: [9] },
			{ id: 10, glyphs: [11] },
		],
	);
	expect(paint(layout).map(label)).toEqual([
		"box:0",
		"box:1",
		"box:8",
		"box:2",
		"box:3",
		"glyph:6",
		"glyph:7",
		"glyph:9",
		"box:10",
		"glyph:11",
		"box:4",
		"glyph:5",
	]);
});

it.each([undefined, 0] as const)(
	"preserves relative floated roots' existing auto/zero distinction: %s",
	(zIndex) => {
		const layout = fixture(
			[
				{ parent: null },
				{ parent: 0 },
				{ parent: 1, floatSide: "left", position: "relative", zIndex },
				{ parent: 2, position: "absolute", zIndex: -1 },
				{ parent: 3, kind: "text", text: "N" },
				{ parent: 2, kind: "text", text: "F" },
				{ parent: 1 },
				{ parent: 6, kind: "text", text: "I" },
			],
			[
				{ id: 2, glyphs: [5] },
				{ id: 3, glyphs: [4] },
				{ id: 6, glyphs: [7] },
			],
		);
		expect(paint(layout).map(label)).toEqual(
			zIndex === undefined
				? [
						"box:0",
						"box:1",
						"box:3",
						"glyph:4",
						"box:6",
						"glyph:7",
						"box:2",
						"glyph:5",
					]
				: [
						"box:0",
						"box:1",
						"box:6",
						"glyph:7",
						"box:2",
						"box:3",
						"glyph:4",
						"glyph:5",
					],
		);
	},
);

it("keeps atomic boxes inside floats and nested floats inside atomic content", () => {
	const layout = fixture(
		[
			{ parent: null },
			{ parent: 0 },
			{ parent: 1, floatSide: "left" },
			{ parent: 2, level: "inline", display: "inline-block" },
			{ parent: 3, floatSide: "right" },
			{ parent: 4, kind: "text", text: "N" },
			{ parent: 3, kind: "text", text: "A" },
			{ parent: 2, kind: "text", text: "F" },
			{ parent: 1 },
			{ parent: 8, kind: "text", text: "I" },
		],
		[
			{ id: 2, glyphs: [7], fragments: [{ id: 3, atomic: true }] },
			{ id: 3, glyphs: [6] },
			{ id: 4, glyphs: [5] },
			{ id: 8, glyphs: [9] },
		],
	);
	expect(paint(layout).map(label)).toEqual([
		"box:0",
		"box:1",
		"box:8",
		"box:2",
		"box:3",
		"box:4",
		"glyph:5",
		"glyph:6",
		"glyph:7",
		"glyph:9",
	]);
});

it.each(["flexItem", "gridItem"] as const)(
	"preserves order-modified %s scopes and their own nested floats",
	(itemFlag) => {
		const layout = fixture(
			[
				{ parent: null },
				{ parent: 0, orderModifiedChildren: [6, 2] },
				{ parent: 1, [itemFlag]: true },
				{ parent: 2, floatSide: "left" },
				{ parent: 3, kind: "text", text: "F" },
				{ parent: 2, kind: "text", text: "A" },
				{ parent: 1, [itemFlag]: true },
				{ parent: 6, floatSide: "right" },
				{ parent: 7, kind: "text", text: "G" },
				{ parent: 6, kind: "text", text: "B" },
			],
			[
				{ id: 2, glyphs: [5] },
				{ id: 3, glyphs: [4] },
				{ id: 6, glyphs: [9] },
				{ id: 7, glyphs: [8] },
			],
		);
		expect(paint(layout).map(label)).toEqual([
			"box:0",
			"box:1",
			"box:6",
			"box:7",
			"glyph:8",
			"glyph:9",
			"box:2",
			"box:3",
			"glyph:4",
			"glyph:5",
		]);
	},
);

it("keeps table-cell content together without moving its float into the outer float phase", () => {
	const layout = fixture(
		[
			{ parent: null },
			{ parent: 0 },
			{ parent: 1, display: "table-cell" },
			{ parent: 2, floatSide: "left" },
			{ parent: 3, kind: "text", text: "F" },
			{ parent: 2, kind: "text", text: "C" },
			{ parent: 1, floatSide: "right" },
			{ parent: 6, kind: "text", text: "O" },
		],
		[
			{ id: 2, glyphs: [5] },
			{ id: 3, glyphs: [4] },
			{ id: 6, glyphs: [7] },
		],
	);
	expect(paint(layout).map(label)).toEqual([
		"box:0",
		"box:1",
		"box:6",
		"glyph:7",
		"box:2",
		"box:3",
		"glyph:4",
		"glyph:5",
	]);
});

it("retains outside markers, replaced boxes and inline fragments in their float owners", () => {
	const layout = fixture(
		[
			{ parent: null },
			{ parent: 0 },
			{ parent: 1, floatSide: "left" },
			{ parent: 2, kind: "replaced" },
			{ parent: 1 },
			{ parent: 4, kind: "inline", level: "inline" },
			{ parent: 5, kind: "text", text: "I" },
		],
		[{ id: 4, glyphs: [6], fragments: [{ id: 5 }] }],
		[{ id: 2, width: 4, height: 4, offsetY: 1, baselineOwner: null }],
	);
	const items = paint(layout);
	expect(items.map(label)).toEqual([
		"box:0",
		"box:1",
		"box:4",
		"box:2",
		"marker:2",
		"image:3",
		"fragment:5",
		"glyph:6",
	]);
	const image = items.find((item) => item.kind === "image");
	if (image?.kind !== "image") throw Error("Missing retained image owner");
	expect(image.box).toBe(layout.boxes.find((box) => box.id === 3));
});

it("retains each float's content as a unit in direct stacking traversal", () => {
	const layout = fixture(
		[
			{ parent: null },
			{ parent: 0 },
			{ parent: 1, floatSide: "left" },
			{ parent: 2, kind: "text", text: "F" },
			{ parent: 1 },
			{ parent: 4, kind: "text", text: "I" },
		],
		[
			{ id: 2, glyphs: [3] },
			{ id: 4, glyphs: [5] },
		],
	);
	const items: LayoutContentItem[] = layout.boxes.map((box) => ({
		kind: "box",
		box,
	}));
	const floatBox = items.splice(2, 1)[0];
	items.push(floatBox);
	items.push({
		kind: "glyph",
		glyph: layout.text.contexts[1].glyphs[0],
		contentY: layout.contexts[1].contentY,
	});
	items.push({
		kind: "glyph",
		glyph: layout.text.contexts[0].glyphs[0],
		contentY: layout.contexts[0].contentY,
	});
	freeze(items);
	expect(
		[
			...stackingContentItems(
				layout.text.horizontal.formatting,
				items,
				() => {},
			),
		].map(label),
	).toEqual(["box:0", "box:1", "box:4", "box:2", "glyph:3", "glyph:5"]);
});

it("paints a floated replaced principal box once in the float phase", () => {
	const layout = fixture(
		[
			{ parent: null },
			{ parent: 0 },
			{ parent: 1, kind: "replaced", floatSide: "right" },
			{ parent: 1 },
			{ parent: 3, kind: "text", text: "I" },
		],
		[{ id: 3, glyphs: [4] }],
	);
	expect(paint(layout).map(label)).toEqual([
		"box:0",
		"box:1",
		"box:3",
		"image:2",
		"glyph:4",
	]);
});

it("keeps the nonfloating normal-flow background and inline order unchanged", () => {
	const layout = fixture(
		[
			{ parent: null },
			{ parent: 0 },
			{ parent: 1 },
			{ parent: 2, kind: "text", text: "A" },
			{ parent: 1 },
			{ parent: 4, kind: "text", text: "B" },
		],
		[
			{ id: 2, glyphs: [3] },
			{ id: 4, glyphs: [5] },
		],
	);
	expect(paint(layout).map(label)).toEqual([
		"box:0",
		"box:1",
		"box:2",
		"box:4",
		"glyph:3",
		"glyph:5",
	]);
});

it("charges float classification, retention and emission without mutating retained inputs", () => {
	const inputs: NodeInput[] = [{ parent: null }, { parent: 0 }];
	const contexts: ContextInput[] = [];
	for (let index = 0; index < 32; index++) {
		const id = inputs.length;
		inputs.push({ parent: 1, floatSide: index % 2 ? "right" : "left" });
		inputs.push({ parent: id, kind: "text", text: "F" });
		contexts.push({ id, glyphs: [id + 1] });
	}
	const layout = fixture(inputs, contexts);
	const before = JSON.stringify(layout);
	let total = 0;
	const items = [
		...layoutContentItems(layout, (amount = 1) => {
			total += amount;
		}),
	];
	expect(items.filter((item) => item.kind === "glyph")).toHaveLength(32);
	expect(new Set(items.map(label)).size).toBe(items.length);
	expect(total).toBeGreaterThan(inputs.length + items.length);
	for (const limit of [1, Math.floor(total / 2), total - 1]) {
		let work = 0;
		expect(() => [
			...layoutContentItems(layout, (amount = 1) => {
				work += amount;
				if (work > limit) throw Error("float paint budget");
			}),
		]).toThrow("float paint budget");
	}
	expect(JSON.stringify(layout)).toBe(before);
	expect(Object.isFrozen(layout.text.horizontal.formatting.nodes)).toBe(true);
});
