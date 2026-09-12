import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const white = [255, 255, 255, 255];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(css = "", content = '<div id="child"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0;font-size:8px;line-height:8px}html,body{background:white}main{width:96px}#container{width:40px;height:32px;align-content:center;background:white}#child{width:12px;height:8px;background:red}#tail{width:12px;height:8px;background:blue}#after{height:4px}${css}</style><main><div id="container">${content}</div><div id="after"></div></main>`,
		"https://fixture.invalid/block-content-alignment-layout",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(96, 96);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing alignment fixture ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	const box = (selector: string, layout: Readonly<DocumentLayout>) => {
		const found = layout.boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing alignment box ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		geometry,
		box,
		rect: (selector: string) => geometry.getBoundingClientRect(id(selector)),
	};
}

function pixel(tree: DocumentTree, horizontal: number, vertical: number) {
	return [
		...rasterizeDocument(tree, {
			clip: { x: horizontal, y: vertical, width: 1, height: 1 },
		}).image.pixels,
	];
}

function expectOwnership(layout: Readonly<DocumentLayout>) {
	for (const entries of [
		layout.boxes,
		layout.contexts,
		layout.text.contexts,
		layout.text.horizontal.widths,
	])
		expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
	const glyphs = layout.contexts.flatMap((context) => context.glyphs);
	const lines = layout.contexts.flatMap((context) => context.lines);
	const fragments = layout.contexts.flatMap((context) => context.fragments);
	expect(layout.metrics).toMatchObject({
		boxes: layout.boxes.length,
		glyphs: glyphs.length,
		lines: lines.length,
	});
	expect(layout.text.metrics).toMatchObject({
		glyphs: glyphs.length,
		lines: lines.length,
		fragments: fragments.length,
	});
	for (const box of layout.boxes) {
		expect(box.ref).toBe(layout.text.horizontal.formatting.nodes[box.id].ref);
		for (const value of [box.borderY, box.contentY, box.contentHeight])
			expect(Number.isFinite(value)).toBe(true);
	}
	expect(Number.isSafeInteger(layout.metrics.work)).toBe(true);
	expect(layout.metrics.work).toBeGreaterThan(0);
}

it.each([
	["normal", 0],
	["start", 0],
	["flex-start", 0],
	["stretch", 0],
	["space-between", 0],
	["end", 16],
	["flex-end", 16],
	["center", 8],
	["space-around", 8],
	["space-evenly", 8],
	["safe center", 8],
	["unsafe center", 8],
	["safe end", 16],
	["unsafe end", 16],
] as const)(
	"aligns the complete block contents for %s without distributing gaps",
	(alignment, top) => {
		const page = fixture(
			`#container{align-content:${alignment}}`,
			'<div id="child"></div><div id="tail"></div>',
		);
		const layout = layoutDocument(page.tree);
		expect(page.rect("#container")).toMatchObject({
			x: 0,
			y: 0,
			width: 40,
			height: 32,
		});
		expect(page.box("#container", layout)).toMatchObject({
			borderY: 0,
			contentY: 0,
			contentHeight: 32,
			naturalContentHeight: 16,
		});
		expect(page.rect("#child")).toMatchObject({
			x: 0,
			y: top,
			width: 12,
			height: 8,
		});
		expect(page.rect("#tail")).toMatchObject({ y: top + 8, height: 8 });
		expect(page.rect("#after").y).toBe(32);
		const node = buildFormattingTree(page.tree).nodes.find(
			(entry) => entry.ref === page.tree.reference(page.id("#container")),
		);
		expect(node).toMatchObject({
			kind: "block",
			independentContext: alignment !== "normal",
		});
		const hits = documentHitTesting(page.tree);
		expect(hits.elementFromPoint(1, top + 1)).toBe(page.id("#child"));
		expect(hits.elementFromPoint(1, top + 9)).toBe(page.id("#tail"));
		expect(hits.elementFromPoint(39, 1)).toBe(page.id("#container"));
		expect(pixel(page.tree, 1, top + 1)).toEqual(red);
		expect(pixel(page.tree, 1, top + 9)).toEqual(blue);
		expect(pixel(page.tree, 39, 1)).toEqual(white);
		expectOwnership(layout);
	},
);

it.each([
	["end", 0],
	["center", 0],
	["space-around", 0],
	["space-evenly", 0],
	["safe end", 0],
	["safe center", 0],
	["unsafe end", -8],
	["unsafe center", -4],
] as const)(
	"preserves the non-scroll overflow policy for %s",
	(alignment, offset) => {
		const page = fixture(
			`main{padding-top:16px}#container{height:8px;align-content:${alignment}}#child{height:16px}`,
		);
		const layout = layoutDocument(page.tree);
		expect(page.box("#container", layout)).toMatchObject({
			borderY: 16,
			contentY: 16,
			contentHeight: 8,
			naturalContentHeight: 16,
		});
		expect(page.rect("#child")).toMatchObject({ y: 16 + offset, height: 16 });
		expect(page.rect("#after").y).toBe(24);
		expect(documentHitTesting(page.tree).elementFromPoint(1, 17 + offset)).toBe(
			page.id("#child"),
		);
		expect(pixel(page.tree, 1, 17 + offset)).toEqual(red);
	},
);

it.each([
	{ css: "height:24px", height: 24, top: 8, clamped: "none" },
	{ css: "height:auto", height: 8, top: 0, clamped: "none" },
	{
		css: "height:auto;min-height:24px",
		height: 24,
		top: 8,
		clamped: "min-height",
	},
	{
		css: "height:40px;max-height:24px",
		height: 24,
		top: 8,
		clamped: "max-height",
	},
	{
		css: "height:auto;max-height:4px",
		height: 4,
		top: 0,
		clamped: "max-height",
	},
	{
		css: "height:4px;min-height:24px;max-height:12px",
		height: 24,
		top: 8,
		clamped: "min-height",
	},
	{ css: "height:17px", height: 17, top: 4.5, clamped: "none" },
])("uses the final constrained content height for $css", (test) => {
	const page = fixture(`#container{${test.css}}`);
	const layout = layoutDocument(page.tree);
	expect(page.box("#container", layout)).toMatchObject({
		borderY: 0,
		contentY: 0,
		naturalContentHeight: 8,
		contentHeight: test.height,
		heightClampedBy: test.clamped,
	});
	expect(page.rect("#child")).toMatchObject({ y: test.top, height: 8 });
	expect(page.rect("#after").y).toBe(test.height);
});

it("keeps parent margins, padding, borders and following flow outside the translation", () => {
	const page = fixture(
		"main{display:flow-root}#container{margin:4px 0 0 3px;padding:3px 5px 7px 2px;border:2px solid blue}",
	);
	const layout = layoutDocument(page.tree);
	expect(page.rect("#container")).toMatchObject({
		x: 3,
		y: 4,
		width: 51,
		height: 46,
	});
	expect(page.box("#container", layout)).toMatchObject({
		contentX: 7,
		contentY: 9,
		contentWidth: 40,
		contentHeight: 32,
		naturalContentHeight: 8,
	});
	expect(page.rect("#child")).toMatchObject({ x: 7, y: 21, height: 8 });
	expect(page.rect("#after").y).toBe(50);
	expect(pixel(page.tree, 3, 4)).toEqual(blue);
	expect(pixel(page.tree, 7, 9)).toEqual(white);
	expect(pixel(page.tree, 8, 22)).toEqual(red);
	expect(documentHitTesting(page.tree).elementFromPoint(8, 22)).toBe(
		page.id("#child"),
	);
});

it("contains child edge margins while retaining adjoining sibling margin collapse", () => {
	const page = fixture(
		"#container{height:43px;align-content:end}#child{margin-top:2px;margin-bottom:4px}#tail{margin-top:6px;margin-bottom:3px}",
		'<div id="child"></div><div id="tail"></div>',
	);
	const layout = layoutDocument(page.tree);
	expect(page.box("#container", layout)).toMatchObject({
		borderY: 0,
		contentY: 0,
		naturalContentHeight: 27,
		contentHeight: 43,
		marginCollapse: { withFirstChild: false, withLastChild: false },
	});
	expect(page.rect("#child").y).toBe(18);
	expect(page.rect("#tail").y).toBe(32);
	expect(page.rect("#after").y).toBe(43);
});

it("composes nested alignment once while retaining both content-box origins", () => {
	const page = fixture(
		"#inner{width:24px;height:16px;align-content:end}",
		'<div id="inner"><div id="child">A</div></div>',
	);
	const layout = layoutDocument(page.tree);
	expect(page.box("#container", layout)).toMatchObject({
		borderY: 0,
		contentY: 0,
		naturalContentHeight: 16,
	});
	expect(page.box("#inner", layout)).toMatchObject({
		borderY: 8,
		contentY: 8,
		contentHeight: 16,
		naturalContentHeight: 8,
	});
	expect(page.rect("#child").y).toBe(16);
	expect(layout.contexts.flatMap((context) => context.glyphs)).toMatchObject([
		{ character: "A", x: 0, y: 16 },
	]);
	expectOwnership(layout);
});

it("moves inline fragments, lines and bitmap glyph baselines together", () => {
	const page = fixture(
		"#container{align-content:end}",
		'<span id="text">AA<br>BB</span>',
	);
	const layout = layoutDocument(page.tree);
	const context = layout.contexts.find(
		(entry) => entry.ref === page.tree.reference(page.id("#container")),
	);
	if (!context) throw new Error("Missing aligned inline text context");
	expect(page.box("#container", layout)).toMatchObject({
		contentY: 0,
		naturalContentHeight: 16,
	});
	expect(context.lines).toMatchObject([
		{ top: 16, height: 8, baseline: 23 },
		{ top: 24, height: 8, baseline: 31 },
	]);
	expect(
		context.glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
	).toEqual([
		["A", 0, 16],
		["A", 6, 16],
		["B", 0, 24],
		["B", 6, 24],
	]);
	expect(page.geometry.getClientRects(page.id("#text"))).toMatchObject([
		{ x: 0, y: 16, width: 12, height: 8 },
		{ x: 0, y: 24, width: 12, height: 8 },
	]);
	expect(documentHitTesting(page.tree).elementFromPoint(1, 17)).toBe(
		page.id("#text"),
	);
	expect(rasterizeDocument(page.tree).metrics.paintedGlyphs).toBe(4);
	expectOwnership(layout);
});

it.each([
	{ fontSize: 0, natural: 8, top: 12 },
	{ fontSize: 8, natural: 9, top: 11.5 },
])(
	"includes the parent strut for an empty atom at font size $fontSize",
	(test) => {
		const page = fixture(
			`#container,#child{font-size:${test.fontSize}px;line-height:${test.fontSize}px}#child{display:inline-block}`,
			'<span id="child"></span>',
		);
		const layout = layoutDocument(page.tree);
		expect(page.box("#container", layout)).toMatchObject({
			contentY: 0,
			naturalContentHeight: test.natural,
			contentHeight: 32,
		});
		expect(page.rect("#child")).toMatchObject({
			x: 0,
			y: test.top,
			width: 12,
			height: 8,
		});
		expect(
			layout.contexts
				.flatMap((context) => context.fragments)
				.filter(
					(fragment) =>
						fragment.atomic &&
						fragment.ref === page.tree.reference(page.id("#child")),
				),
		).toMatchObject([{ x: 0, y: test.top, width: 12, height: 8 }]);
		expectOwnership(layout);
	},
);

it.each(["left", "right"])(
	"aligns a physical %s float and its cleared descendant as one measured subject",
	(side) => {
		const page = fixture(
			`#container{align-content:end}#child{float:${side}}#tail{clear:both;width:20px}`,
			'<div id="child"></div><div id="tail"></div>',
		);
		const layout = layoutDocument(page.tree);
		expect(page.box("#container", layout)).toMatchObject({
			contentY: 0,
			naturalContentHeight: 16,
			contentHeight: 32,
		});
		const left = side === "left" ? 0 : 28;
		expect(page.rect("#child")).toMatchObject({ x: left, y: 16, height: 8 });
		expect(page.rect("#tail")).toMatchObject({ x: 0, y: 24, height: 8 });
		expect(page.rect("#after").y).toBe(32);
		expect(pixel(page.tree, left + 1, 17)).toEqual(red);
		expect(pixel(page.tree, 1, 25)).toEqual(blue);
		expect(documentHitTesting(page.tree).elementFromPoint(left + 1, 17)).toBe(
			page.id("#child"),
		);
		expect(documentHitTesting(page.tree).elementFromPoint(1, 25)).toBe(
			page.id("#tail"),
		);
		expectOwnership(layout);
	},
);

it.each([
	{
		name: "flex",
		css: "#shell{display:flex}#leaf{flex-shrink:0}",
		markup: '<div id="shell"><div id="leaf">A</div></div>',
	},
	{
		name: "grid",
		css: "#shell{display:grid;grid-template-columns:24px}",
		markup: '<div id="shell"><div id="leaf">A</div></div>',
	},
	{
		name: "table",
		css: "#shell{border-spacing:0}td{vertical-align:top}",
		markup: '<table id="shell"><tr><td id="leaf">A</td></tr></table>',
	},
])(
	"translates an ordinary $name child shell and its real contents",
	(shell) => {
		const page = fixture(
			`#container{align-content:end}#shell,#leaf{width:24px}#leaf{height:8px;background:red}${shell.css}`,
			shell.markup,
		);
		const layout = layoutDocument(page.tree);
		expect(page.box("#container", layout)).toMatchObject({
			contentY: 0,
			naturalContentHeight: 8,
			contentHeight: 32,
		});
		for (const selector of ["#shell", "#leaf"])
			expect(page.rect(selector)).toMatchObject({
				x: 0,
				y: 24,
				width: 24,
				height: 8,
			});
		expect(layout.contexts.flatMap((context) => context.glyphs)).toMatchObject([
			{ character: "A", x: 0, y: 24 },
		]);
		expect(pixel(page.tree, 20, 25)).toEqual(red);
		expect(documentHitTesting(page.tree).elementFromPoint(20, 25)).toBe(
			page.id("#leaf"),
		);
		expectOwnership(layout);
	},
);

it("adds relative descendant offsets without changing the alignment subject or sibling flow", () => {
	const page = fixture(
		"#child{position:relative;left:3px;top:2px}",
		'<div id="child">A</div><div id="tail"></div>',
	);
	const layout = layoutDocument(page.tree);
	expect(page.box("#container", layout)).toMatchObject({
		contentY: 0,
		naturalContentHeight: 16,
	});
	expect(page.rect("#child")).toMatchObject({ x: 3, y: 10, height: 8 });
	expect(page.rect("#tail")).toMatchObject({ x: 0, y: 16, height: 8 });
	expect(layout.contexts.flatMap((context) => context.glyphs)).toMatchObject([
		{ character: "A", x: 3, y: 10 },
	]);
	expect(documentHitTesting(page.tree).elementFromPoint(4, 11)).toBe(
		page.id("#child"),
	);
	expect(page.rect("#after").y).toBe(32);
});

it.each([
	{ value: "normal", computed: "normal", top: 16 },
	{ value: "initial", computed: "normal", top: 16 },
	{ value: "unset", computed: "normal", top: 16 },
	{ value: "inherit", computed: "end", top: 24 },
])(
	"resolves author $value without accidentally inheriting block alignment",
	(test) => {
		const page = fixture(
			`#container{align-content:end}#inner{height:16px;align-content:${test.value}}`,
			'<div id="inner"><div id="child"></div></div>',
		);
		expect(page.styles.flex(page.id("#inner"))["align-content"]).toBe(
			test.computed,
		);
		expect(page.styles.flex(page.id("#child"))["align-content"]).toBe("normal");
		expect(page.rect("#inner")).toMatchObject({ y: 16, height: 16 });
		expect(page.rect("#child").y).toBe(test.top);
		expect(page.rect("#container")).toMatchObject({ y: 0, height: 32 });
	},
);

it.each([false, true])(
	"translates a replaced input descendant without changing disabled=%s or its value",
	(disabled) => {
		const page = fixture(
			"#container{align-content:end}#field{display:block;width:24px;height:16px}",
			`<input id="field" value="A"${disabled ? " disabled" : ""}>`,
		);
		const before = snapshotDocument(page.tree);
		const revision = page.tree.revision;
		const layout = layoutDocument(page.tree);
		expect(page.rect("#field")).toMatchObject({
			x: 0,
			y: 16,
			width: 24,
			height: 16,
		});
		expect(page.box("#container", layout)).toMatchObject({
			contentY: 0,
			naturalContentHeight: 16,
		});
		expect(
			layout.text.horizontal.formatting.nodes.find(
				(node) => node.ref === page.tree.reference(page.id("#field")),
			),
		).toMatchObject({ kind: "replaced", control: { text: "A", disabled } });
		expect(documentHitTesting(page.tree).elementFromPoint(2, 18)).toBe(
			page.id("#field"),
		);
		expect(documentHitTesting(page.tree).elementFromPoint(2, 2)).toBe(
			page.id("#container"),
		);
		expect(rasterizeDocument(page.tree).metrics.paintedControls).toBe(1);
		expect(page.tree.get(page.id("#field")).attributes.value).toBe("A");
		expect(page.tree.revision).toBe(revision);
		expect(snapshotDocument(page.tree)).toEqual(before);
	},
);

it("preserves DOM, journals and snapshots on repeated reads and releases cached owners on close", () => {
	const page = fixture("", '<div id="child">A</div>');
	const child = page.id("#child");
	const source = serializeHtml(page.tree);
	const before = snapshotDocument(page.tree);
	const revision = page.tree.revision;
	const retained = () =>
		[...page.tree.walk()].map(({ node }) => ({
			id: node.id,
			ref: page.tree.reference(node.id),
			attributes: { ...node.attributes },
			children: [...node.children],
			data: node.data,
		}));
	const nodes = retained();
	const mutations: unknown[] = [];
	const changes: unknown[] = [];
	page.tree.onMutation((record) => mutations.push(record));
	page.tree.onChange((change) => changes.push(change));
	const hits = documentHitTesting(page.tree);
	for (let iteration = 0; iteration < 3; iteration++) {
		expect(page.rect("#child").y).toBe(12);
		expect(hits.elementFromPoint(1, 13)).toBe(child);
		expect(rasterizeDocument(page.tree).metrics.paintedGlyphs).toBe(1);
		expectOwnership(layoutDocument(page.tree));
		expect(snapshotDocument(page.tree)).toEqual(before);
	}
	expect(page.geometry.metrics().builds).toBe(1);
	expect(hits.metrics().builds).toBe(1);
	expect(serializeHtml(page.tree)).toBe(source);
	expect(retained()).toEqual(nodes);
	expect(page.tree.revision).toBe(revision);
	expect(page.tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
	expect(mutations).toEqual([]);
	expect(changes).toEqual([]);
	page.tree.close();
	expect(page.tree.nodeCount).toBe(0);
	expect(page.geometry.metrics()).toMatchObject({
		closed: true,
		rectangles: 0,
	});
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(() => page.geometry.getBoundingClientRect(child)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => hits.elementFromPoint(1, 13)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => page.styles.box(child)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("invalidates alignment and measured content after style and subtree mutations", () => {
	const page = fixture();
	const hits = documentHitTesting(page.tree);
	const container = page.id("#container");
	const child = page.id("#child");
	expect(page.rect("#child").y).toBe(12);
	expect(hits.elementFromPoint(1, 13)).toBe(child);
	page.tree.setAttribute(container, "style", "align-content:end");
	expect(page.rect("#child").y).toBe(24);
	expect(hits.elementFromPoint(1, 13)).toBe(container);
	expect(hits.elementFromPoint(1, 25)).toBe(child);
	expect(pixel(page.tree, 1, 13)).toEqual(white);
	expect(pixel(page.tree, 1, 25)).toEqual(red);
	page.tree.setAttribute(child, "style", "height:16px");
	expect(page.rect("#child").y).toBe(16);
	page.tree.setAttribute(container, "style", "align-content:start");
	expect(page.rect("#child").y).toBe(0);
	page.tree.removeAttribute(container, "style");
	expect(page.rect("#child").y).toBe(8);
	const tail = page.tree.createElement("div", { id: "tail" });
	page.tree.append(container, tail);
	expect(page.rect("#child").y).toBe(4);
	expect(page.rect("#tail").y).toBe(20);
	expect(hits.elementFromPoint(1, 21)).toBe(tail);
	page.tree.remove(tail);
	expect(page.rect("#child").y).toBe(8);
	expect(hits.elementFromPoint(1, 21)).toBe(child);
	expect(page.rect("#container")).toMatchObject({ y: 0, height: 32 });
	expect(page.rect("#after").y).toBe(32);
	expect(page.geometry.metrics().builds).toBeGreaterThan(1);
	expect(hits.metrics().builds).toBeGreaterThan(1);
});

it("retains an immutable aligned layout snapshot after mutation and close", () => {
	const page = fixture("", '<div id="child">A</div>');
	const first = layoutDocument(page.tree);
	const context = first.contexts.find(
		(entry) => entry.ref === page.tree.reference(page.id("#child")),
	);
	if (!context) throw new Error("Missing retained alignment context");
	page.tree.setAttribute(page.id("#container"), "style", "align-content:end");
	page.tree.setTextContent(page.id("#child"), "BB");
	const second = layoutDocument(page.tree);
	expect(second.contexts.flatMap((entry) => entry.glyphs)).toMatchObject([
		{ character: "B", x: 0, y: 24 },
		{ character: "B", x: 6, y: 24 },
	]);
	page.tree.close();
	expect(context.glyphs).toMatchObject([{ character: "A", x: 0, y: 12 }]);
	expect(Object.isFrozen(first)).toBe(true);
	expect(Object.isFrozen(context.glyphs)).toBe(true);
	expect(context.glyphs.every(Object.isFrozen)).toBe(true);
	expect(first.metrics.glyphs).toBe(1);
	expect(second.metrics.glyphs).toBe(2);
});
