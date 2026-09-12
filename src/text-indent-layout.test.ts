import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { InlineStyles } from "./inline-styles.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";
import type { TextContext } from "./text-layout.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(content: string, css = "", width = 36) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0}html,body{font-size:8px;line-height:8px;color:black;background:white}#main{width:${width}px}${css}</style><main id="main">${content}</main>`,
		"https://fixture.invalid/text-indent-layout",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(96, 96);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing indent fixture ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	const context = (selector = "#main") => {
		const found = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing indent text context ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		geometry,
		context,
		rect: (selector: string) => geometry.getBoundingClientRect(id(selector)),
	};
}

function texts(context: TextContext) {
	return context.lines.map((line) =>
		context.glyphs
			.slice(line.glyphStart, line.glyphEnd)
			.map((glyph) => glyph.character)
			.join(""),
	);
}

function expectSources(tree: DocumentTree, context: TextContext) {
	for (const glyph of context.glyphs) {
		expect(
			tree
				.resolve(glyph.ref)
				.data.slice(glyph.offset, glyph.offset + glyph.codeUnits),
		).toBe(glyph.character);
		for (const value of [glyph.x, glyph.y, glyph.advance])
			expect(Number.isFinite(value)).toBe(true);
	}
}

function pixel(tree: DocumentTree, horizontal: number, vertical: number) {
	return [
		...rasterizeDocument(tree, {
			clip: { x: horizontal, y: vertical, width: 1, height: 1 },
		}).image.pixels,
	];
}

it.each([
	{
		name: "positive",
		indent: 12,
		width: 36,
		lines: ["AA", "BB CC"],
		positions: [12, 18, 0, 6, 12, 18, 24],
	},
	{
		name: "negative",
		indent: -6,
		width: 24,
		lines: ["AA BB", "CC"],
		positions: [-6, 0, 6, 12, 18, 0, 6],
	},
])("uses $name indent space when wrapping actual glyphs", (test) => {
	const page = fixture(
		'<span id="text">AA BB CC</span>',
		`#main{text-indent:${test.indent}px}`,
		test.width,
	);
	const context = page.context();
	expect(texts(context)).toEqual(test.lines);
	expect(context.glyphs.map((glyph) => glyph.x)).toEqual(test.positions);
	expect(context.lines.map((line) => line.top)).toEqual([0, 8]);
	expect(page.rect("#main")).toMatchObject({
		x: 0,
		y: 0,
		width: test.width,
		height: 16,
	});
	expectSources(page.tree, context);
	expect(rasterizeDocument(page.tree).metrics).toMatchObject({
		paintedGlyphs: test.indent < 0 ? 5 : 6,
		clippedGlyphs: test.indent < 0 ? 1 : 0,
	});
});

it("moves native bitmap ink and inline hits without painting the indent gap", () => {
	const page = fixture('<span id="text">A</span>', "#main{text-indent:6px}");
	expect(page.context().glyphs).toMatchObject([{ character: "A", x: 6, y: 0 }]);
	expect(page.rect("#text")).toMatchObject({ x: 6, y: 0, width: 6, height: 8 });
	expect(pixel(page.tree, 7, 0)).toEqual([0, 0, 0, 255]);
	expect(pixel(page.tree, 1, 0)).toEqual([255, 255, 255, 255]);
	expect(documentHitTesting(page.tree).elementFromPoint(7, 1)).toBe(
		page.id("#text"),
	);
	expect(documentHitTesting(page.tree).elementFromPoint(1, 1)).toBe(
		page.id("#main"),
	);
});

it("preserves default glyphs, fragments, geometry and pixels for explicit zero", () => {
	const page = fixture('<span id="text">AA BB CC</span>');
	const original = page.context();
	const rectangles = page.geometry.getClientRects(page.id("#text"));
	const image = rasterizeDocument(page.tree).image;
	expect(texts(original)).toEqual(["AA BB", "CC"]);
	for (const value of ["0px", "-0px"]) {
		page.tree.setAttribute(page.id("#main"), "style", `text-indent:${value}`);
		expect(page.context()).toEqual(original);
		expect(page.geometry.getClientRects(page.id("#text"))).toEqual(rectangles);
		expect(rasterizeDocument(page.tree).image).toEqual(image);
	}
	page.tree.removeAttribute(page.id("#main"), "style");
	expect(page.context()).toEqual(original);
});

it("applies default indentation only before the first hard-break line", () => {
	const page = fixture(
		'<span id="text">AA<br>BB<br>CC</span>',
		"#main{text-indent:6px}",
	);
	const context = page.context();
	expect(texts(context)).toEqual(["AA", "BB", "CC"]);
	expect(context.lines.map((line) => line.forcedBreak)).toEqual([
		true,
		true,
		false,
	]);
	expect(context.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
		[6, 0],
		[12, 0],
		[0, 8],
		[6, 8],
		[0, 16],
		[6, 16],
	]);
	expect(page.geometry.getClientRects(page.id("#text"))).toMatchObject([
		{ x: 6, y: 0, width: 12, height: 8 },
		{ x: 0, y: 8, width: 12, height: 8 },
		{ x: 0, y: 16, width: 12, height: 8 },
	]);
	expectSources(page.tree, context);
});

it.each([
	{
		mode: "nowrap",
		source: "AA BB",
		lines: ["AA BB"],
		positions: [6, 12, 18, 24, 30],
	},
	{
		mode: "pre",
		source: "AA\nBB CC",
		lines: ["AA", "BB CC"],
		positions: [6, 12, 0, 6, 12, 18, 24],
	},
	{
		mode: "pre-line",
		source: "AA\nBB CC",
		lines: ["AA", "BB", "CC"],
		positions: [6, 12, 0, 6, 0, 6],
	},
])("keeps first-line-only indentation in $mode text", (test) => {
	const page = fixture(
		test.source,
		`#main{text-indent:6px;white-space:${test.mode}}`,
		24,
	);
	const context = page.context();
	expect(texts(context)).toEqual(test.lines);
	expect(context.glyphs.map((glyph) => glyph.x)).toEqual(test.positions);
	expectSources(page.tree, context);
});

it.each([
	{ alignment: "left", indent: 12, left: 12 },
	{ alignment: "start", indent: 12, left: 12 },
	{ alignment: "center", indent: 12, left: 18 },
	{ alignment: "right", indent: 12, left: 24 },
	{ alignment: "end", indent: 12, left: 24 },
	{ alignment: "center", indent: -6, left: 9 },
	{ alignment: "end", indent: -6, left: 24 },
])("aligns $alignment in the remaining line space for $indent px", (test) => {
	const page = fixture(
		'<span id="text">AA</span>',
		`#main{text-indent:${test.indent}px;text-align:${test.alignment}}`,
	);
	expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([
		test.left,
		test.left + 6,
	]);
	expect(page.rect("#text")).toMatchObject({ x: test.left, width: 12 });
	expect(page.rect("#main")).toMatchObject({ x: 0, width: 36 });
	expect(documentHitTesting(page.tree).elementFromPoint(test.left + 1, 1)).toBe(
		page.id("#text"),
	);
});

it("measures preserved tabs from the content origin rather than the indented start", () => {
	const page = fixture(
		"A\tB\nC\tD",
		"#main{margin-left:10px;padding-left:2px;text-indent:6px;white-space:pre}",
		84,
	);
	const context = page.context();
	expect(context.contentX).toBe(12);
	expect(texts(context)).toEqual(["A\tB", "C\tD"]);
	expect(context.glyphs.map((glyph) => [glyph.x, glyph.advance])).toEqual([
		[18, 6],
		[24, 36],
		[60, 6],
		[12, 6],
		[18, 42],
		[60, 6],
	]);
	expectSources(page.tree, context);
});

it("keeps sliced decorated fragments and source offsets through an indented wrap", () => {
	const page = fixture(
		'<span id="text">AA BB</span>',
		"#main{text-indent:6px}#text{border:1px solid red;padding:0 2px;color:transparent}",
		24,
	);
	const context = page.context();
	expect(texts(context)).toEqual(["AA", "BB"]);
	expect(context.glyphs.map((glyph) => [glyph.x, glyph.offset])).toEqual([
		[9, 0],
		[15, 1],
		[0, 3],
		[6, 4],
	]);
	const fragments = context.fragments.filter(
		(fragment) => fragment.ref === page.tree.reference(page.id("#text")),
	);
	expect(fragments).toMatchObject([
		{ x: 6, width: 15, borders: { borderLeft: 1, borderRight: 0 } },
		{ x: 0, width: 15, borders: { borderLeft: 0, borderRight: 1 } },
	]);
	expect(page.geometry.getClientRects(page.id("#text"))).toMatchObject([
		{ x: 6, width: 15 },
		{ x: 0, width: 15 },
	]);
	expect(pixel(page.tree, 6, 2)).toEqual([255, 0, 0, 255]);
	expect(pixel(page.tree, 0, 9)).toEqual([255, 255, 255, 255]);
	expect(documentHitTesting(page.tree).elementFromPoint(6.5, 2)).toBe(
		page.id("#text"),
	);
	expectSources(page.tree, context);
});

it("adds relative inline offsets without moving following text or consuming indent twice", () => {
	const page = fixture(
		'<span id="text">AA</span> BB',
		"#main{text-indent:6px}#text{position:relative;left:3px;top:2px;background:red;color:transparent}",
		48,
	);
	expect(
		page.context().glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
	).toEqual([
		["A", 9, 2],
		["A", 15, 2],
		[" ", 18, 0],
		["B", 24, 0],
		["B", 30, 0],
	]);
	expect(page.rect("#text")).toMatchObject({
		x: 9,
		y: 2,
		width: 12,
		height: 8,
	});
	expect(page.rect("#main").height).toBe(8);
	expect(pixel(page.tree, 10, 3)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(page.tree).elementFromPoint(10, 3)).toBe(
		page.id("#text"),
	);
});

it("coordinates a text-bearing atom and following glyphs without flattening its source", () => {
	const page = fixture(
		'<span id="atom">AA</span> BB',
		"#main{text-indent:6px}#atom{display:inline-block;width:12px;text-indent:0px;background:red}",
	);
	expect(page.rect("#atom")).toMatchObject({
		x: 6,
		y: 0,
		width: 12,
		height: 8,
	});
	const outer = page.context();
	const inner = page.context("#atom");
	expect(outer.glyphs.map((glyph) => [glyph.character, glyph.x])).toEqual([
		[" ", 18],
		["B", 24],
		["B", 30],
	]);
	expect(inner.glyphs.map((glyph) => [glyph.character, glyph.x])).toEqual([
		["A", 6],
		["A", 12],
	]);
	expect(outer.fragments.filter((fragment) => fragment.atomic)).toMatchObject([
		{ ref: page.tree.reference(page.id("#atom")), x: 6, width: 12 },
	]);
	expectSources(page.tree, outer);
	expectSources(page.tree, inner);
	expect(pixel(page.tree, 7, 7)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(page.tree).elementFromPoint(7, 7)).toBe(
		page.id("#atom"),
	);
});

it.each(["left", "right"])(
	"indents inside the interval beside a physical %s float",
	(side) => {
		const page = fixture(
			'<span id="float"></span><span id="text">AA BB CC</span>',
			`#main{text-indent:6px}#float{float:${side};width:12px;height:16px;background:blue}`,
		);
		const context = page.context();
		expect(texts(context)).toEqual(["AA", "BB", "CC"]);
		expect(context.glyphs.map((glyph) => glyph.x)).toEqual(
			side === "left" ? [18, 24, 12, 18, 0, 6] : [6, 12, 0, 6, 0, 6],
		);
		expect(context.lines.map((line) => line.top)).toEqual([0, 8, 16]);
		const floatLeft = side === "left" ? 0 : 24;
		expect(page.rect("#float")).toMatchObject({
			x: floatLeft,
			y: 0,
			width: 12,
			height: 16,
		});
		expect(page.rect("#main")).toMatchObject({ x: 0, width: 36, height: 24 });
		expect(pixel(page.tree, floatLeft + 1, 1)).toEqual([0, 0, 255, 255]);
		expect(
			documentHitTesting(page.tree).elementFromPoint(floatLeft + 1, 1),
		).toBe(page.id("#float"));
		expect(
			documentHitTesting(page.tree).elementFromPoint(
				context.glyphs[0].x + 1,
				1,
			),
		).toBe(page.id("#text"));
		expectSources(page.tree, context);
	},
);

it.each(["left", "right"])(
	"retains the first indent when a %s float forces the line below it",
	(side) => {
		const page = fixture(
			'<span id="float"></span>AA BB',
			`#main{text-indent:6px}#float{float:${side};width:40px;height:16px}`,
			24,
		);
		const context = page.context();
		expect(texts(context)).toEqual(["AA", "BB"]);
		expect(context.lines.map((line) => line.top)).toEqual([16, 24]);
		expect(context.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
			[6, 16],
			[12, 16],
			[0, 24],
			[6, 24],
		]);
		expect(page.rect("#main")).toMatchObject({ x: 0, width: 24, height: 32 });
	},
);

it("inherits computed pixels rather than recomputing the parent's em in a larger child font", () => {
	const page = fixture(
		'<div id="child">AA</div>',
		"#main{text-indent:1em}#child{font-size:16px;line-height:16px}",
		60,
	);
	expect(resolvedStyleValue(page.tree, page.id("#main"), "text-indent")).toBe(
		"8px",
	);
	expect(resolvedStyleValue(page.tree, page.id("#child"), "text-indent")).toBe(
		"8px",
	);
	expect(page.context("#child").glyphs.map((glyph) => glyph.x)).toEqual([
		8, 20,
	]);
	expect(page.rect("#child")).toMatchObject({ x: 0, width: 60, height: 16 });
});

it("reflows definite-pixel indentation after CSSOM mutation and removal", () => {
	const page = fixture('<span id="text">AA BB CC</span>');
	const owner = new InlineStyles(page.tree, {
		createHostObject(definition: ScriptHostObjectDefinition): object {
			const target = Object.create(null);
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(target, name, descriptor);
			for (const [name, value] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(target, name, { value });
			return target;
		},
	});
	const style = owner.get(page.id("#main")) as {
		setProperty(name: string, value: string): void;
		removeProperty(name: string): string;
		getPropertyValue(name: string): string;
	};
	try {
		expect(page.geometry.getClientRects(page.id("#text"))[0]).toMatchObject({
			x: 0,
			width: 30,
		});
		style.setProperty("text-indent", "12px");
		expect(style.getPropertyValue("text-indent")).toBe("12px");
		expect(texts(page.context())).toEqual(["AA", "BB CC"]);
		expect(page.geometry.getClientRects(page.id("#text"))[0]).toMatchObject({
			x: 12,
			width: 12,
		});
		expect(pixel(page.tree, 13, 0)).toEqual([0, 0, 0, 255]);
		expect(documentHitTesting(page.tree).elementFromPoint(1, 1)).toBe(
			page.id("#main"),
		);
		expect(style.removeProperty("text-indent")).toBe("12px");
		expect(texts(page.context())).toEqual(["AA BB", "CC"]);
		expect(page.geometry.getClientRects(page.id("#text"))[0]).toMatchObject({
			x: 0,
			width: 30,
		});
		expect(documentHitTesting(page.tree).elementFromPoint(1, 1)).toBe(
			page.id("#text"),
		);
	} finally {
		owner.close();
	}
	expect(owner.stats).toMatchObject({ objects: 0, cachedCodeUnits: 0 });
});

it("reflows after viewport changes without scaling definite-pixel indentation", () => {
	const page = fixture("AA BB CC", "#main{width:auto;text-indent:12px}");
	page.styles.setViewport(48, 96);
	expect(texts(page.context())).toEqual(["AA BB", "CC"]);
	expect(page.context().glyphs[0].x).toBe(12);
	page.styles.setViewport(36, 96);
	expect(texts(page.context())).toEqual(["AA", "BB CC"]);
	expect(page.context().glyphs[0].x).toBe(12);
	expect(page.rect("#main").width).toBe(36);
	page.styles.setViewport(48, 96);
	expect(texts(page.context())).toEqual(["AA BB", "CC"]);
});

it("keeps repeated layout, geometry, paint and hit reads observational", () => {
	const page = fixture(
		'<span id="text">AA BB CC</span>',
		"#main{text-indent:12px}",
	);
	const revision = page.tree.revision;
	const before = snapshotDocument(page.tree);
	const source = serializeHtml(page.tree);
	const first = layoutDocument(page.tree);
	const rectangles = page.geometry.getClientRects(page.id("#text"));
	const image = rasterizeDocument(page.tree).image;
	for (let attempt = 0; attempt < 3; attempt++) {
		expect(layoutDocument(page.tree)).toEqual(first);
		expect(page.geometry.getClientRects(page.id("#text"))).toEqual(rectangles);
		expect(rasterizeDocument(page.tree).image).toEqual(image);
		expect(documentHitTesting(page.tree).elementFromPoint(13, 1)).toBe(
			page.id("#text"),
		);
	}
	expect(page.tree.revision).toBe(revision);
	expect(snapshotDocument(page.tree)).toEqual(before);
	expect(serializeHtml(page.tree)).toBe(source);
	expect(page.tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
	expect(Object.isFrozen(first)).toBe(true);
	expectSources(page.tree, page.context());
});

it("resolves an inherited percentage against the child's own inner width", () => {
	const page = fixture(
		'<div id="child">AA</div>',
		"#main{text-indent:25%}#child{width:40px;padding:4px;border:2px solid red}",
		120,
	);
	expect(resolvedStyleValue(page.tree, page.id("#child"), "text-indent")).toBe(
		"25%",
	);
	expect(page.rect("#child")).toMatchObject({ x: 0, width: 52 });
	const context = page.context("#child");
	expect(context.contentX).toBe(6);
	expect(context.contentWidth).toBe(40);
	expect(context.glyphs.map((glyph) => glyph.x)).toEqual([16, 22]);
	expectSources(page.tree, context);
});

it("does not use the float-shortened line interval as the percentage basis", () => {
	const page = fixture(
		'<span id="float"></span>AA BB',
		"#main{text-indent:25%}#float{float:left;width:24px;height:16px}",
		48,
	);
	const context = page.context();
	expect(texts(context)).toEqual(["AA", "BB"]);
	expect(context.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
		[36, 0],
		[42, 0],
		[24, 8],
		[30, 8],
	]);
	expect(page.rect("#main").width).toBe(48);
});

it("indents a first anonymous block but not the anonymous block after a real block", () => {
	const page = fixture(
		'<span id="leading">AA</span><div id="block">BB</div><span id="trailing">CC</span>',
		"#main{text-indent:6px}",
	);
	expect(page.rect("#leading")).toMatchObject({ x: 6, y: 0, width: 12 });
	expect(
		page.context("#block").glyphs.map((glyph) => [glyph.x, glyph.y]),
	).toEqual([
		[6, 8],
		[12, 8],
	]);
	expect(page.rect("#trailing")).toMatchObject({ x: 0, y: 16, width: 12 });
	const layout = layoutDocument(page.tree);
	expect(layout.metrics).toMatchObject({ glyphs: 6, lines: 3 });
	for (const context of layout.contexts) expectSources(page.tree, context);
});

it.each([
	{ value: "6px", trailingLeft: 0 },
	{ value: "6px each-line", trailingLeft: 6 },
])(
	"uses anonymous block eligibility for $value after a first block child",
	(test) => {
		const page = fixture(
			'<div id="block">AA</div><span id="trailing">BB</span>',
			`#main{text-indent:${test.value}}`,
		);
		expect(page.context("#block").glyphs.map((glyph) => glyph.x)).toEqual([
			6, 12,
		]);
		expect(page.rect("#trailing")).toMatchObject({
			x: test.trailingLeft,
			y: 8,
			width: 12,
			height: 8,
		});
	},
);

it.each([
	{ value: "6px each-line", starts: [6, 0, 6, 0] },
	{ value: "hanging 6px", starts: [0, 6, 6, 6] },
	{ value: "6px hanging each-line", starts: [0, 6, 0, 6] },
	{ value: "each-line 6px hanging", starts: [0, 6, 0, 6] },
])("distinguishes forced and soft breaks for $value", (test) => {
	const page = fixture(
		'<span id="text">AA BB CC<br>DD EE FF</span>',
		`#main{text-indent:${test.value}}`,
	);
	const context = page.context();
	expect(texts(context)).toEqual(["AA BB", "CC", "DD EE", "FF"]);
	expect(context.lines.map((line) => line.forcedBreak)).toEqual([
		false,
		true,
		false,
		false,
	]);
	expect(
		context.lines.map((line) => context.glyphs[line.glyphStart].x),
	).toEqual(test.starts);
	expect(
		page.geometry.getClientRects(page.id("#text")).map((rect) => rect.x),
	).toEqual(test.starts);
	expectSources(page.tree, context);
});

it("inherits indentation into the independent text context of an inline-block", () => {
	const page = fixture(
		'<span id="atom">AA</span>',
		"#main{text-indent:6px}#atom{display:inline-block;width:24px;background:red}",
	);
	expect(resolvedStyleValue(page.tree, page.id("#atom"), "text-indent")).toBe(
		"6px",
	);
	expect(page.rect("#atom")).toMatchObject({
		x: 6,
		y: 0,
		width: 24,
		height: 8,
	});
	const context = page.context("#atom");
	expect(context.glyphs.map((glyph) => glyph.x)).toEqual([12, 18]);
	expectSources(page.tree, context);
	expect(pixel(page.tree, 7, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(page.tree, 13, 0)).toEqual([0, 0, 0, 255]);
	expect(documentHitTesting(page.tree).elementFromPoint(7, 1)).toBe(
		page.id("#atom"),
	);
});

it("treats percentage indentation as zero intrinsically but resolves it during atom layout", () => {
	const page = fixture(
		'<span id="atom">AA BB</span>',
		"#atom{display:inline-block;text-indent:50%}",
	);
	const ref = page.tree.reference(page.id("#atom"));
	const intrinsic = measureIntrinsicWidths(page.tree).widths.find(
		(entry) => entry.ref === ref,
	);
	expect(intrinsic).toMatchObject({
		minContent: 12,
		maxContent: 30,
		minContribution: 12,
		maxContribution: 30,
	});
	expect(page.rect("#atom")).toMatchObject({ x: 0, width: 30, height: 16 });
	const context = page.context("#atom");
	expect(texts(context)).toEqual(["AA", "BB"]);
	expect(context.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
		[15, 0],
		[21, 0],
		[0, 8],
		[6, 8],
	]);
	expectSources(page.tree, context);
});

it.each([
	{ value: "6px", minimum: 18, maximum: 36, left: 6, height: 8 },
	{ value: "-6px", minimum: 12, maximum: 24, left: -6, height: 8 },
	{
		value: "calc(6px + 50%)",
		minimum: 18,
		maximum: 36,
		left: 24,
		height: 16,
	},
])("retains the fixed intrinsic component of $value", (test) => {
	const page = fixture(
		'<span id="atom">AA BB</span>',
		`#atom{display:inline-block;text-indent:${test.value}}`,
	);
	const intrinsic = measureIntrinsicWidths(page.tree).widths.find(
		(entry) => entry.ref === page.tree.reference(page.id("#atom")),
	);
	expect(intrinsic).toMatchObject({
		minContent: test.minimum,
		maxContent: test.maximum,
		minContribution: test.minimum,
		maxContribution: test.maximum,
	});
	expect(page.rect("#atom")).toMatchObject({
		x: 0,
		width: test.maximum,
		height: test.height,
	});
	const context = page.context("#atom");
	expect(context.glyphs[0].x).toBe(test.left);
	expectSources(page.tree, context);
});

it("keeps float-only shrink-to-fit bounds free of text indentation", () => {
	const page = fixture(
		'<span id="atom"><i id="float"></i></span>',
		"#atom{display:inline-block;text-indent:6px}#float{float:left;width:12px;height:8px}",
	);
	expect(() => measureIntrinsicWidths(page.tree)).toThrowError(
		/issue-free supported formatting profile/,
	);
	expect(page.rect("#atom")).toMatchObject({ width: 12, height: 8 });
	expect(page.rect("#float")).toMatchObject({
		x: 0,
		y: 0,
		width: 12,
		height: 8,
	});
	page.tree.setAttribute(page.id("#main"), "style", "width:6px");
	expect(page.rect("#main").width).toBe(6);
	expect(page.rect("#atom")).toMatchObject({ width: 12, height: 8 });
	expect(page.rect("#float")).toMatchObject({ x: 0, width: 12, height: 8 });
});

it.each([
	{ side: "left", floatLeft: 0, secondLeft: 18 },
	{ side: "right", floatLeft: 18, secondLeft: 0 },
])("reserves the indent before placing a later $side float", (test) => {
	const page = fixture(
		'AA<span id="float"></span> BB',
		`#main{text-indent:12px}#float{float:${test.side};width:18px;height:16px}`,
	);
	const context = page.context();
	expect(texts(context)).toEqual(["AA", "BB"]);
	expect(context.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
		[12, 0],
		[18, 0],
		[test.secondLeft, 8],
		[test.secondLeft + 6, 8],
	]);
	expect(page.rect("#float")).toMatchObject({
		x: test.floatLeft,
		y: 8,
		width: 18,
		height: 16,
	});
	expectSources(page.tree, context);
});

it.each([
	{ display: "block", left: 0 },
	{ display: "none", left: 6 },
])(
	"distinguishes an empty $display predecessor from an anonymous first child",
	(test) => {
		const page = fixture(
			'<div id="empty"></div><span id="text">AA</span>',
			`#main{text-indent:6px}#empty{display:${test.display}}`,
		);
		expect(page.rect("#text")).toMatchObject({
			x: test.left,
			y: 0,
			width: 12,
			height: 8,
		});
	},
);

it.each([
	{ value: "6px", left: 0 },
	{ value: "6px each-line", left: 6 },
	{ value: "6px hanging", left: 6 },
	{ value: "6px hanging each-line", left: 0 },
])("preserves forced empty first-line eligibility for $value", (test) => {
	const page = fixture(
		'<span id="text"><br>AA</span>',
		`#main{text-indent:${test.value}}`,
	);
	const context = page.context();
	expect(texts(context)).toEqual(["", "AA"]);
	expect(context.lines.map((line) => line.forcedBreak)).toEqual([true, false]);
	expect(context.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
		[test.left, 8],
		[test.left + 6, 8],
	]);
	expectSources(page.tree, context);
});

it("overflows an oversized first indent without creating an empty soft line", () => {
	const page = fixture(
		'<span id="text">AA</span>',
		"#main{text-indent:24px}",
		12,
	);
	const context = page.context();
	expect(texts(context)).toEqual(["AA"]);
	expect(context.glyphs.map((glyph) => glyph.x)).toEqual([24, 30]);
	expect(page.rect("#main")).toMatchObject({ width: 12, height: 8 });
	expect(page.rect("#text")).toMatchObject({
		x: 24,
		y: 0,
		width: 12,
		height: 8,
	});
	expectSources(page.tree, context);
});

it("does not consume the first indentation while collapsing leading whitespace", () => {
	const page = fixture(
		'<span id="text"> \t  AA</span>',
		"#main{text-indent:6px}",
	);
	const context = page.context();
	expect(texts(context)).toEqual(["AA"]);
	expect(context.glyphs.map((glyph) => [glyph.x, glyph.offset])).toEqual([
		[6, 4],
		[12, 5],
	]);
	expectSources(page.tree, context);
});

it.each(
	["none", "left", "right"].flatMap((float) =>
		[
			{ alignment: "left", left: 24 },
			{ alignment: "start", left: 24 },
			{ alignment: "center", left: 12 },
			{ alignment: "right", left: 0 },
			{ alignment: "end", left: 0 },
		].map((test) => ({ ...test, float })),
	),
)(
	"retains the real $alignment edge with oversized indent and $float float",
	(test) => {
		const content = `${test.float === "none" ? "" : '<i id="float"></i>'}<span id="text">AA</span>`;
		const shared = `#main{text-align:${test.alignment}}#float{float:${test.float};width:4px;height:8px}`;
		const page = fixture(content, `${shared}#main{text-indent:24px}`, 12);
		const control = fixture(content, `${shared}#text{margin-left:24px}`, 12);
		const context = page.context();
		const top = test.float === "none" ? 0 : 8;
		expect(texts(context)).toEqual(["AA"]);
		expect(context.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
			[test.left, top],
			[test.left + 6, top],
		]);
		expect(page.rect("#text")).toMatchObject({
			x: test.left,
			y: top,
			width: 12,
			height: 8,
		});
		expect(page.rect("#text")).toEqual(control.rect("#text"));
		expect(page.rect("#main")).toEqual(control.rect("#main"));
		expect(context.lines.map((line) => line.overflow)).toEqual([24]);
		expect(context.lines.map((line) => line.overflow)).toEqual(
			control.context().lines.map((line) => line.overflow),
		);
		expect(
			documentHitTesting(page.tree).elementFromPoint(test.left + 1, top + 1),
		).toBe(page.id("#text"));
		expectSources(page.tree, context);
	},
);
