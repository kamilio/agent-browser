import { expect, it } from "vitest";
import type {
	DocumentLayout,
	PositionedTextContext,
} from "./document-layout.js";
import { measureLayoutOverflow } from "./layout-overflow.js";
import type { OverflowStyle, OverflowValue } from "./overflow-policy.js";
import type { TextLine } from "./text-layout.js";

interface BoxSpec {
	parent?: number;
	containingBlock?: number;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	borderLeft?: number;
	borderRight?: number;
	borderTop?: number;
	borderBottom?: number;
	paddingRight?: number;
	paddingBottom?: number;
	marginLeft?: number;
	marginRight?: number;
	marginTop?: number;
	marginBottom?: number;
	position?: "absolute" | "fixed" | "relative" | "sticky";
	overflow?: Readonly<OverflowStyle>;
	gridItem?: boolean;
	flexItem?: boolean;
	inline?: boolean;
}

function fixture(
	specs: readonly BoxSpec[],
	contexts: readonly Readonly<PositionedTextContext>[] = [],
	viewport = { width: 100, height: 100 },
): Readonly<DocumentLayout> {
	const nodes = [
		{
			id: 0,
			parent: null as number | null,
			kind: "viewport",
			level: "block",
			visible: true,
			children: [] as number[],
		},
		...specs.map((spec, index) => ({
			id: index + 1,
			parent: spec.parent ?? 0,
			kind: spec.inline ? "inline" : "block",
			level: spec.inline ? "inline" : "block",
			visible: true,
			children: [] as number[],
			position: spec.position,
			overflow: spec.overflow,
			gridItem: spec.gridItem,
			flexItem: spec.flexItem,
		})),
	];
	for (const node of nodes.slice(1))
		nodes[node.parent as number].children.push(node.id);
	const boxes = specs.flatMap((spec, index) => {
		if (spec.inline) return [];
		const width = spec.width ?? 100;
		const height = spec.height ?? 100;
		return [
			{
				id: index + 1,
				containingBlock: spec.containingBlock ?? spec.parent ?? 0,
				borderX: spec.x ?? 0,
				borderY: spec.y ?? 0,
				borderBoxWidth: width,
				borderBoxHeight: height,
				borderLeft: spec.borderLeft ?? 0,
				borderRight: spec.borderRight ?? 0,
				borderTop: spec.borderTop ?? 0,
				borderBottom: spec.borderBottom ?? 0,
				paddingRight: spec.paddingRight ?? 0,
				paddingBottom: spec.paddingBottom ?? 0,
				marginLeft: spec.marginLeft ?? 0,
				marginRight: spec.marginRight ?? 0,
				marginTop: spec.marginTop ?? 0,
				marginBottom: spec.marginBottom ?? 0,
			},
		];
	});
	return {
		stage: "normal-flow-document-layout",
		partial: true,
		boxes,
		contexts,
		flowHeight: 9999,
		text: { horizontal: { formatting: { root: 0, nodes, viewport } } },
		metrics: { work: 9999, boxes: boxes.length, glyphs: 0, lines: 0 },
	} as unknown as Readonly<DocumentLayout>;
}

function line(width: number, top = 0, height = 10): Readonly<TextLine> {
	return {
		index: 0,
		top,
		height,
		baseline: top + height,
		width,
		overflow: 0,
		forcedBreak: false,
		glyphStart: 0,
		glyphEnd: 0,
		fragmentStart: 0,
		fragmentEnd: 0,
	};
}

function context(
	id: number,
	values: Partial<PositionedTextContext>,
): Readonly<PositionedTextContext> {
	return {
		id,
		contentX: 0,
		contentY: 0,
		contentWidth: 100,
		textHeight: 0,
		lines: [],
		glyphs: [],
		fragments: [],
		...values,
	};
}

const hidden: Readonly<OverflowStyle> = { x: "hidden", y: "hidden" };

it("reports frozen padding-box ports and viewport minima without using flowHeight", () => {
	const result = measureLayoutOverflow(
		fixture([
			{
				x: 10,
				y: 20,
				width: 120,
				height: 80,
				borderLeft: 2,
				borderRight: 3,
				borderTop: 4,
				borderBottom: 5,
				overflow: { x: "hidden", y: "auto" },
			},
		]),
	);
	expect(result.ports.get(1)).toEqual({
		id: 1,
		x: 12,
		y: 24,
		width: 115,
		height: 71,
		scrollWidth: 115,
		scrollHeight: 71,
		overflow: { x: "hidden", y: "auto" },
	});
	expect(result.root).toEqual({ width: 130, height: 100 });
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result.root)).toBe(true);
	expect(Object.isFrozen(result.ports)).toBe(true);
	expect(Object.isFrozen(result.ports.get(1))).toBe(true);
	expect(Object.isFrozen(result.ports.get(1)?.overflow)).toBe(true);
	expect(measureLayoutOverflow(fixture([])).root).toEqual({
		width: 100,
		height: 100,
	});
});

it.each(["hidden", "clip", "scroll", "auto"] as const)(
	"clips the %s axis while retaining internal scroll dimensions",
	(value: OverflowValue) => {
		const result = measureLayoutOverflow(
			fixture([
				{ overflow: { x: value, y: "visible" } },
				{ parent: 1, x: 80, y: 80, width: 80, height: 80 },
			]),
		);
		expect(result.ports.get(1)).toMatchObject({
			scrollWidth: 160,
			scrollHeight: 160,
		});
		expect(result.root).toEqual({ width: 100, height: 160 });
	},
);

it("clips nested descendant overflow without clipping the child's own border", () => {
	const result = measureLayoutOverflow(
		fixture([
			{ overflow: hidden },
			{ parent: 1, x: 40, width: 80, height: 80, overflow: hidden },
			{ parent: 2, x: 100, width: 200, height: 50 },
		]),
	);
	expect(result.ports.get(2)?.scrollWidth).toBe(260);
	expect(result.ports.get(1)?.scrollWidth).toBe(120);
	expect(result.root).toEqual({ width: 100, height: 100 });
});

it("routes escaped absolute boxes through their containing block, not DOM clips", () => {
	const result = measureLayoutOverflow(
		fixture([
			{},
			{ parent: 1, x: 10, width: 50, height: 50, overflow: hidden },
			{
				parent: 2,
				containingBlock: 1,
				position: "absolute",
				x: 200,
				width: 50,
				height: 20,
			},
		]),
	);
	expect(result.ports.get(2)?.scrollWidth).toBe(50);
	expect(result.ports.get(1)?.scrollWidth).toBe(250);
	expect(result.root.width).toBe(250);
});

it("keeps fixed-subtree ports while preventing root and ancestor inflation", () => {
	const layout = fixture([
		{},
		{
			parent: 1,
			containingBlock: 0,
			position: "fixed",
			x: 500,
			width: 50,
			height: 50,
		},
		{ parent: 2, x: 700, width: 100, height: 20 },
		{ parent: 2, containingBlock: 0, position: "absolute", x: 900, width: 100 },
	]);
	const result = measureLayoutOverflow({ ...layout, fixedIds: [2, 3, 4] });
	expect(result.ports.size).toBe(4);
	expect(result.ports.get(2)?.scrollWidth).toBe(300);
	expect(result.ports.get(1)?.scrollWidth).toBe(100);
	expect(result.root).toEqual({ width: 100, height: 100 });
});

it("ignores zero-area borders but propagates their visible descendants", () => {
	expect(
		measureLayoutOverflow(
			fixture([
				{ x: 500, width: 0, height: 900 },
				{ y: 500, width: 900, height: 0 },
			]),
		).root,
	).toEqual({ width: 100, height: 100 });
	const result = measureLayoutOverflow(
		fixture([
			{ x: 100, width: 0, height: 200 },
			{ parent: 1, x: 150, y: 150, width: 50, height: 100 },
		]),
	);
	expect(result.root).toEqual({ width: 200, height: 250 });
	expect(result.ports.get(1)?.scrollWidth).toBe(100);
});

it("does not turn wholly negative rectangles into cross-axis scroll range", () => {
	const result = measureLayoutOverflow(
		fixture([
			{ x: -50, width: 20, height: 1000 },
			{ y: -40, width: 1000, height: 20 },
			{ x: -20, y: 10, width: 150, height: 30 },
		]),
	);
	expect(result.root).toEqual({ width: 130, height: 100 });
	const padded = measureLayoutOverflow(
		fixture([
			{ overflow: hidden, paddingRight: 20 },
			{ parent: 1, x: -10, width: 5, height: 1000 },
		]),
	);
	expect(padded.ports.get(1)?.scrollHeight).toBe(100);
});

it("preserves negative child-relative coordinates that are reachable in an ancestor", () => {
	const result = measureLayoutOverflow(
		fixture([
			{ x: 200, width: 10, height: 10 },
			{ parent: 1, x: 150, y: 200, width: 20, height: 20 },
		]),
	);
	expect(result.ports.get(1)?.scrollHeight).toBe(10);
	expect(result.root).toEqual({ width: 210, height: 220 });
});

it("measures line boxes, advances and inline fragments rather than ink overhang", () => {
	const result = measureLayoutOverflow(
		fixture(
			[
				{ height: 20, overflow: hidden, paddingRight: 10, paddingBottom: 5 },
				{ parent: 1, inline: true },
				{ parent: 1, inline: true },
			],
			[
				context(1, {
					lines: [line(150), line(0, 50)],
					fragments: [
						{
							formattingId: 3,
							ref: "e3",
							line: 0,
							x: 200,
							y: 0,
							width: 20,
							height: 10,
							marginRight: 5,
						},
					],
					glyphs: [
						{
							formattingId: 2,
							ref: "e2",
							offset: 0,
							codeUnits: 1,
							character: "a",
							kind: "glyph",
							supported: true,
							visible: true,
							fontSize: 10,
							line: 0,
							x: 180,
							y: 0,
							advance: 10,
						},
						{
							formattingId: 2,
							ref: "e2",
							offset: 1,
							codeUnits: 1,
							character: "\u0301",
							kind: "glyph",
							supported: true,
							visible: true,
							fontSize: 100,
							line: 0,
							x: 900,
							y: 900,
							advance: 0,
						},
					],
				}),
			],
		),
	);
	expect(result.ports.get(1)).toMatchObject({
		scrollWidth: 235,
		scrollHeight: 65,
	});
	expect(result.root).toEqual({ width: 100, height: 100 });
});

it.each(["gridItem", "flexItem"] as const)(
	"includes supported %s margin areas",
	(kind) => {
		const result = measureLayoutOverflow(
			fixture([
				{ overflow: hidden },
				{
					parent: 1,
					[kind]: true,
					x: 80,
					y: 80,
					width: 20,
					height: 20,
					marginLeft: 10,
					marginTop: 5,
					marginRight: 20,
					marginBottom: 30,
				},
			]),
		);
		expect(result.ports.get(1)).toMatchObject({
			scrollWidth: 120,
			scrollHeight: 130,
		});
	},
);

it("does not promise ordinary margins or shrink borders with negative item margins", () => {
	for (const spec of [
		{ marginRight: 50, marginBottom: 50 },
		{ gridItem: true, marginRight: -30, marginBottom: -30 },
	]) {
		const result = measureLayoutOverflow(
			fixture([
				{ overflow: hidden },
				{ parent: 1, x: 80, y: 80, width: 20, height: 20, ...spec },
			]),
		);
		expect(result.ports.get(1)).toMatchObject({
			scrollWidth: 100,
			scrollHeight: 100,
		});
	}
});

it("adds end padding once to direct in-flow content, not escaped descendant maxima", () => {
	for (const position of [undefined, "absolute"] as const) {
		const result = measureLayoutOverflow(
			fixture([
				{ overflow: hidden, paddingRight: 10, paddingBottom: 10 },
				{ parent: 1, x: 80, y: 80, width: 50, height: 50, position },
			]),
		);
		expect(result.ports.get(1)?.scrollWidth).toBe(position ? 130 : 140);
		expect(result.ports.get(1)?.scrollHeight).toBe(position ? 130 : 140);
	}
	const nested = measureLayoutOverflow(
		fixture([
			{ overflow: hidden, paddingRight: 10 },
			{ parent: 1, x: 10, width: 20, height: 20 },
			{ parent: 2, position: "absolute", x: 200, width: 20, height: 20 },
		]),
	);
	expect(nested.ports.get(1)?.scrollWidth).toBe(220);
});

it("terminates a viewport box's self owner without discarding its port", () => {
	const layout = fixture([{ x: 10, y: 30, width: 20, height: 40 }], [], {
		width: 100,
		height: 50,
	});
	const rootBox = {
		...layout.boxes[0],
		id: 0,
		containingBlock: 0,
		borderX: 0,
		borderY: 0,
		borderBoxWidth: 100,
		borderBoxHeight: 40,
	};
	const formatting = layout.text.horizontal.formatting;
	const nodes = [
		{ ...formatting.nodes[0], overflow: hidden },
		formatting.nodes[1],
	];
	const result = measureLayoutOverflow({
		...layout,
		boxes: [rootBox, ...layout.boxes],
		text: {
			...layout.text,
			horizontal: {
				...layout.text.horizontal,
				formatting: { ...formatting, nodes },
			},
		},
	});
	expect(result.ports.size).toBe(2);
	expect(result.ports.get(0)?.scrollHeight).toBe(70);
	expect(result.root).toEqual({ width: 100, height: 70 });
});

it.each([0, -1, 1.5, 2_000_001, Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects invalid work limit %s",
	(maxWork) => {
		expect(() => measureLayoutOverflow(fixture([]), maxWork)).toThrow(
			"Invalid overflow work limit",
		);
	},
);

it("charges exact deterministic work and bounds wide aggregation", () => {
	const layout = fixture(
		Array.from({ length: 2048 }, (_, index) => ({
			x: index,
			width: 1,
			height: 1,
		})),
	);
	const measured = measureLayoutOverflow(layout);
	expect(measured.root.width).toBe(2048);
	expect(measured.work).toBeLessThan(2048 * 32);
	expect(measureLayoutOverflow(layout, measured.work).root).toEqual(
		measured.root,
	);
	expect(() => measureLayoutOverflow(layout, measured.work - 1)).toThrow(
		"Layout overflow work limit exceeded",
	);
	expect(measureLayoutOverflow(layout).work).toBe(measured.work);
});

it("bounds deep forwarding iteratively and rejects duplicate traversal edges", () => {
	const deep = fixture(
		Array.from({ length: 1000 }, (_, index) => ({
			parent: index,
			width: 1,
			height: 1,
		})),
	);
	expect(() => measureLayoutOverflow(deep, 20_000)).toThrow(
		"Layout overflow work limit exceeded",
	);
	const layout = fixture([{}]);
	const formatting = layout.text.horizontal.formatting;
	const nodes = [
		{ ...formatting.nodes[0], children: [1, 1] },
		formatting.nodes[1],
	];
	expect(() =>
		measureLayoutOverflow({
			...layout,
			text: {
				...layout.text,
				horizontal: {
					...layout.text.horizontal,
					formatting: { ...formatting, nodes },
				},
			},
		}),
	).toThrow("Invalid overflow ownership");
});

it("rejects bad containing blocks, cycles, duplicates and numerical extents", () => {
	expect(() =>
		measureLayoutOverflow(fixture([{ containingBlock: 99 }])),
	).toThrow("Invalid overflow ownership");
	expect(() =>
		measureLayoutOverflow(
			fixture([{ containingBlock: 2 }, { containingBlock: 1 }]),
		),
	).toThrow("Invalid overflow ownership");
	const layout = fixture([{}]);
	expect(() =>
		measureLayoutOverflow({
			...layout,
			boxes: [...layout.boxes, layout.boxes[0]],
		}),
	).toThrow("Invalid overflow ownership");
	expect(() =>
		measureLayoutOverflow(fixture([{ width: Number.POSITIVE_INFINITY }])),
	).toThrow("Invalid layout length");
	expect(() =>
		measureLayoutOverflow(fixture([{ x: 16_777_216, width: 1 }])),
	).toThrow("Layout length limit exceeded");
	const formatting = layout.text.horizontal.formatting;
	expect(() =>
		measureLayoutOverflow({
			...layout,
			text: {
				...layout.text,
				horizontal: {
					...layout.text.horizontal,
					formatting: {
						...formatting,
						nodes: Array(50_001).fill(formatting.nodes[0]),
					},
				},
			},
		}),
	).toThrow("Layout overflow node limit exceeded");
});
