import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument, type DocumentLayout } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];
const clip = { x: 0, y: 0, width: 160, height: 160 };
const tableStyle = "display:table;border-collapse:separate;border-spacing:0";

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string, css: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><html><head><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}main,#target{width:120px}#inside,#following{height:10px}#left{float:left;width:20px;height:24px;background:blue}#right{float:right;width:20px;height:36px;background:green}${css}</style></head><body><main id="main">${markup}</main></body></html>`,
		"https://fixture.invalid/generated-content-table-layout",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	documentStyles(tree).setViewport(clip.width, clip.height);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, queries, id };
}

function pair({
	name = "before",
	text = "AB",
	declarations = "",
	css = "",
	generatedCss = "",
	inside = "",
	lead = "",
}: {
	name?: "before" | "after";
	text?: string;
	declarations?: string;
	css?: string;
	generatedCss?: string;
	inside?: string;
	lead?: string;
} = {}) {
	const ordinary = `<div id="ordinary">${text}</div>`;
	const shell = (children: string) =>
		`${lead}<section id="target">${children}</section><div id="following"></div>`;
	return {
		name,
		generated: fixture(
			shell(inside),
			`#target::${name}{content:${JSON.stringify(text)};${tableStyle};${declarations}}${css}${generatedCss}`,
		),
		ordinary: fixture(
			shell(name === "before" ? ordinary + inside : inside + ordinary),
			`#ordinary{${tableStyle};${declarations}}${css}`,
		),
	};
}

function pseudoNode(
	layout: DocumentLayout,
	owner: number,
	name: "before" | "after",
) {
	const found = layout.text.horizontal.formatting.nodes.find(
		(node) =>
			node.display === "table" &&
			node.generatedContent?.owner === owner &&
			node.generatedContent.name === name,
	);
	if (!found) throw new Error(`Missing generated ::${name} table`);
	return found;
}

function boxById(layout: DocumentLayout, id: number) {
	const found = layout.boxes.find((box) => box.id === id);
	if (!found) throw new Error(`Missing laid-out box ${id}`);
	return found;
}

function elementBox(
	layout: DocumentLayout,
	current: ReturnType<typeof fixture>,
	selector: string,
) {
	const found = layout.boxes.find(
		(box) => box.ref === current.tree.reference(current.id(selector)),
	);
	if (!found) throw new Error(`Missing laid-out ${selector}`);
	return found;
}

function rectangle(box: DocumentLayout["boxes"][number]) {
	return {
		x: box.borderX,
		y: box.borderY,
		width: box.borderBoxWidth,
		height: box.borderBoxHeight,
	};
}

function glyphs(layout: DocumentLayout) {
	return layout.contexts.flatMap((context) => context.glyphs);
}

function glyphGeometry(layout: DocumentLayout) {
	return glyphs(layout).map(
		({ character, x, y, advance, fontSize, kind, visible }) => ({
			character,
			x,
			y,
			advance,
			fontSize,
			kind,
			visible,
		}),
	);
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function expectEquivalent(current: ReturnType<typeof pair>) {
	const generated = rasterizeDocument(current.generated.tree, { clip });
	const ordinary = rasterizeDocument(current.ordinary.tree, { clip });
	const node = pseudoNode(
		generated.layout,
		current.generated.id(),
		current.name,
	);
	const box = boxById(generated.layout, node.id);
	const oracle = elementBox(ordinary.layout, current.ordinary, "#ordinary");
	expect(rectangle(box)).toEqual(rectangle(oracle));
	for (const selector of ["#main", "#target", "#following", "#inside"]) {
		if (current.generated.queries.querySelector(selector) === null) continue;
		expect(
			rectangle(elementBox(generated.layout, current.generated, selector)),
		).toEqual(
			rectangle(elementBox(ordinary.layout, current.ordinary, selector)),
		);
	}
	expect(glyphGeometry(generated.layout)).toEqual(
		glyphGeometry(ordinary.layout),
	);
	expect(generated.layout.flowHeight).toBe(ordinary.layout.flowHeight);
	expect(generated.image.width).toBe(clip.width);
	expect(generated.image.height).toBe(clip.height);
	expect(generated.image.pixels).toEqual(ordinary.image.pixels);
	expect(node.ref).toBeUndefined();
	expect(box.ref).toBeUndefined();
	expect(node.generatedContent).toEqual({
		owner: current.generated.id(),
		name: current.name,
	});
	return { generated, ordinary, node, box, oracle };
}

it.each([
	{ name: "before", text: "" },
	{ name: "before", text: " " },
	{ name: "after", text: "" },
	{ name: "after", text: " " },
] as const)(
	"keeps a no-float ::$name table with content '$text' empty despite clear:both",
	({ name, text }) => {
		const current = pair({ name, text, declarations: "clear:both" });
		const { generated, node, box } = expectEquivalent(current);
		expect(node.children).toEqual([]);
		expect(rectangle(box)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
		expect(glyphs(generated.layout)).toEqual([]);
		expect(generated.metrics.paintedGlyphs).toBe(0);
		expect(
			elementBox(generated.layout, current.generated, "#following").borderY,
		).toBe(0);
	},
);

it.each(["", " "])(
	"matches paired clearfix tables with content '%s' around an internal float",
	(text) => {
		const generated = fixture(
			'<section id="target"><span id="left"></span></section><div id="following"></div>',
			`#target::before,#target::after{content:${JSON.stringify(text)};${tableStyle}}#target::after{clear:both}`,
		);
		const ordinary = fixture(
			`<section id="target"><div id="before">${text}</div><span id="left"></span><div id="after">${text}</div></section><div id="following"></div>`,
			`#before,#after{${tableStyle}}#after{clear:both}`,
		);
		const actual = rasterizeDocument(generated.tree, { clip });
		const expected = rasterizeDocument(ordinary.tree, { clip });
		for (const name of ["before", "after"] as const) {
			const node = pseudoNode(actual.layout, generated.id(), name);
			const box = boxById(actual.layout, node.id);
			expect(rectangle(box)).toEqual(
				rectangle(elementBox(expected.layout, ordinary, `#${name}`)),
			);
			expect(node.ref).toBeUndefined();
			expect(node.children).toEqual([]);
			expect(box.borderY).toBe(name === "before" ? 0 : 24);
		}
		expect(
			elementBox(actual.layout, generated, "#target").borderBoxHeight,
		).toBe(24);
		expect(elementBox(actual.layout, generated, "#following").borderY).toBe(24);
		expect(actual.image.pixels).toEqual(expected.image.pixels);
		expect(glyphs(actual.layout)).toEqual([]);
	},
);

it.each(["before", "after"] as const)(
	"lays out real anonymous table cells for nonempty ::%s beside ordinary content",
	(name) => {
		const current = pair({ name, inside: '<div id="inside">I</div>' });
		const { generated, ordinary, node, oracle, box } =
			expectEquivalent(current);
		const actualNodes = generated.layout.text.horizontal.formatting.nodes;
		const expectedNodes = ordinary.layout.text.horizontal.formatting.nodes;
		let actualParent = node;
		let expectedParent = expectedNodes[oracle.id];
		for (const display of ["table-row-group", "table-row", "table-cell"]) {
			expect(actualParent.children).toHaveLength(1);
			expect(expectedParent.children).toHaveLength(1);
			actualParent = actualNodes[actualParent.children[0]];
			expectedParent = expectedNodes[expectedParent.children[0]];
			expect(actualParent.display).toBe(display);
			expect(actualParent.ref).toBeUndefined();
			expect(rectangle(boxById(generated.layout, actualParent.id))).toEqual(
				rectangle(boxById(ordinary.layout, expectedParent.id)),
			);
		}
		expect(box.borderBoxWidth).toBeGreaterThan(0);
		expect(box.borderBoxHeight).toBeGreaterThan(0);
		const text = glyphs(generated.layout).filter((glyph) => glyph.ref === "");
		expect(text.map((glyph) => glyph.character).join("")).toBe("AB");
		for (const glyph of text) {
			expect(actualNodes[glyph.formattingId].generatedContent).toEqual({
				owner: current.generated.id(),
				name,
			});
			expect(glyph.x).toBeGreaterThanOrEqual(box.borderX);
			expect(glyph.x + glyph.advance).toBeLessThanOrEqual(
				box.borderX + box.borderBoxWidth,
			);
		}
		expect(generated.metrics.paintedGlyphs).toBe(3);
	},
);

it("uses table intrinsic width rather than disguising a full-width block", () => {
	const current = pair({ declarations: "background:red" });
	const { generated, box } = expectEquivalent(current);
	const block = fixture(
		'<section id="target"></section><div id="following"></div>',
		'#target::before{content:"AB";display:block;background:red}',
	);
	const blockRaster = rasterizeDocument(block.tree, { clip });
	const blockNode = blockRaster.layout.text.horizontal.formatting.nodes.find(
		(node) =>
			node.kind !== "text" && node.generatedContent?.owner === block.id(),
	);
	if (!blockNode) throw new Error("Missing generated block control");
	expect(boxById(blockRaster.layout, blockNode.id).borderBoxWidth).toBe(120);
	expect(box.borderBoxWidth).toBeGreaterThan(0);
	expect(box.borderBoxWidth).toBeLessThan(120);
	expect(pixel(generated.image, 100, 5)).not.toEqual([255, 0, 0, 255]);
	expect(pixel(blockRaster.image, 100, 5)).toEqual([255, 0, 0, 255]);
});

it.each(["", " ", "AB"])(
	"retains explicit table dimensions and separate-model edges for content '%s'",
	(text) => {
		const current = pair({
			text,
			declarations:
				"width:40px;height:24px;padding:3px;border:2px solid blue;background:red;color:green;border-spacing:2px",
		});
		const { generated, box } = expectEquivalent(current);
		expect(box.contentWidth).toBe(40);
		expect(box.contentHeight).toBe(24);
		expect(box.paddingTop).toBe(3);
		expect(box.borderTop).toBe(2);
		expect(box.borderBoxWidth).toBe(50);
		expect(box.borderBoxHeight).toBe(34);
		expect(pixel(generated.image, box.borderX, box.borderY)).toEqual([
			0, 0, 255, 255,
		]);
		expect(pixel(generated.image, box.borderX + 3, box.borderY + 3)).toEqual([
			255, 0, 0, 255,
		]);
		expect(generated.metrics.paintedGlyphs).toBe(text.trim().length);
	},
);

it.each(["before", "after"] as const)(
	"matches nonempty collapsed-border ::%s table geometry and border pixels",
	(name) => {
		const current = pair({
			name,
			declarations:
				"border-collapse:collapse;width:40px;height:24px;padding:3px;border-spacing:9px;border:4px solid blue;background:red;color:green;margin:4px 0 6px 3px",
			inside: '<div id="inside">I</div>',
		});
		const { generated, node, box, oracle } = expectEquivalent(current);
		expect(node.collapsedTable).toBeDefined();
		expect(node.collapsedTable?.placement.cells).toHaveLength(1);
		expect(node.collapsedTable?.segments.length).toBeGreaterThan(0);
		expect(box.collapsedTableBorders?.length).toBeGreaterThan(0);
		const borders = (entry: typeof box) =>
			entry.collapsedTableBorders?.map(({ x, y, width, height, color }) => ({
				x,
				y,
				width,
				height,
				color,
			}));
		expect(borders(box)).toEqual(borders(oracle));
		expect(box.paddingTop).toBe(0);
		expect(box.paddingLeft).toBe(0);
		expect(pixel(generated.image, box.borderX, box.borderY)).toEqual([
			0, 0, 255, 255,
		]);
		expect(generated.metrics.paintedGlyphs).toBe(3);
		expect(
			documentHitTesting(current.generated.tree).targetFromPoint(
				box.contentX + 1,
				box.contentY + 1,
			),
		).toEqual({ id: current.generated.id() });
	},
);

it.each(["", " "])(
	"matches an empty collapsed table with content '%s' without inventing border cells",
	(text) => {
		const current = pair({
			text,
			declarations:
				"border-collapse:collapse;border:none;width:40px;height:18px;padding:3px;border-spacing:5px;background:red",
		});
		const { generated, node, box } = expectEquivalent(current);
		expect(node.children).toEqual([]);
		expect(node.collapsedTable).toBeDefined();
		expect(node.collapsedTable?.placement.cells).toEqual([]);
		expect(node.collapsedTable?.segments).toEqual([]);
		expect(rectangle(box)).toEqual({ x: 0, y: 0, width: 40, height: 18 });
		expect(pixel(generated.image, 1, 1)).toEqual([255, 0, 0, 255]);
		expect(generated.metrics.paintedGlyphs).toBe(0);
	},
);

it("keeps later fieldset layout links valid after omitting generated table whitespace", () => {
	const current = pair({
		text: " ",
		inside: '<fieldset id="fieldset"><div id="field-child">F</div></fieldset>',
		css: "fieldset{width:40px;margin:0;padding:2px;border:1px solid blue;background:red}#field-child{height:10px}",
	});
	const { generated, ordinary } = expectEquivalent(current);
	const actualNodes = generated.layout.text.horizontal.formatting.nodes;
	const fieldset = elementBox(generated.layout, current.generated, "#fieldset");
	const outerNode = actualNodes[fieldset.id];
	if (outerNode.fieldsetContent === undefined)
		throw new Error("Missing remapped fieldset content link");
	const innerNode = actualNodes[outerNode.fieldsetContent];
	expect(innerNode.fieldsetOwner).toBe(outerNode.id);
	expect(innerNode.parent).toBe(outerNode.id);
	expect(
		boxById(generated.layout, innerNode.id).borderBoxHeight,
	).toBeGreaterThan(0);
	for (const selector of ["#fieldset", "#field-child"]) {
		expect(
			rectangle(elementBox(generated.layout, current.generated, selector)),
		).toEqual(
			rectangle(elementBox(ordinary.layout, current.ordinary, selector)),
		);
		expect(
			documentGeometry(current.generated.tree).getBoundingClientRect(
				current.generated.id(selector),
			),
		).toEqual(
			documentGeometry(current.ordinary.tree).getBoundingClientRect(
				current.ordinary.id(selector),
			),
		);
	}
	const child = elementBox(generated.layout, current.generated, "#field-child");
	expect(
		documentHitTesting(current.generated.tree).elementFromPoint(
			child.borderX + 1,
			child.borderY + 1,
		),
	).toBe(current.generated.id("#field-child"));
});

it.each(["before", "after"] as const)(
	"preserves ::%s table margins and adjacent block flow",
	(name) => {
		const current = pair({
			name,
			declarations: "margin:7px 0 9px 5px;background:red",
			css: "#inside{margin-top:3px;margin-bottom:4px}#following{margin-top:6px}",
			inside: '<div id="inside">I</div>',
		});
		const { box } = expectEquivalent(current);
		expect(box.marginTop).toBe(7);
		expect(box.marginBottom).toBe(9);
		expect(box.borderX).toBe(5);
	},
);

it.each([
	{ name: "before", clear: "left", top: 24 },
	{ name: "before", clear: "right", top: 36 },
	{ name: "before", clear: "both", top: 36 },
	{ name: "after", clear: "left", top: 24 },
	{ name: "after", clear: "right", top: 36 },
	{ name: "after", clear: "both", top: 36 },
] as const)(
	"clears ::$name table to Y$top with clear:$clear around native floats",
	({ name, clear, top }) => {
		const current = pair({
			name,
			declarations: `clear:${clear};background:red`,
			lead: '<div id="lead"><span id="left"></span><span id="right"></span></div>',
			inside: '<div id="inside"></div>',
		});
		const { generated, box } = expectEquivalent(current);
		expect(box.borderY).toBe(top);
		expect(box.borderBoxWidth).toBeGreaterThan(0);
		for (const glyph of glyphs(generated.layout))
			expect(glyph.y).toBeGreaterThanOrEqual(top);
		expect(
			elementBox(generated.layout, current.generated, "#following").borderY,
		).toBeGreaterThanOrEqual(top + box.borderBoxHeight);
	},
);

it.each([
	{ side: "left", clear: "right" },
	{ side: "right", clear: "left" },
] as const)(
	"does not clear an opposite-side $side float for clear:$clear",
	({ side, clear }) => {
		const current = pair({
			declarations: "clear:var(--clear-side)",
			css: `#target{--clear-side:${clear}}`,
			lead: `<div id="lead"><span id="${side}"></span></div>`,
		});
		const { box } = expectEquivalent(current);
		for (const fixture of [current.generated, current.ordinary])
			fixture.tree.setAttribute(fixture.id(), "style", "--clear-side:none");
		expect(rectangle(expectEquivalent(current).box)).toEqual(rectangle(box));
	},
);

it("inherits font and text values through anonymous table cells without DOM text", () => {
	const current = pair({
		text: "ab  cd",
		css: "#target{font-size:12px;line-height:16px;font-weight:bold;font-style:italic;color:red;white-space:pre;text-transform:uppercase}",
	});
	const { generated, node } = expectEquivalent(current);
	expect(node.typography).toMatchObject({
		"font-size": "12px",
		"line-height": "16px",
		"font-weight": "700",
		"font-style": "italic",
		"white-space": "pre",
		"text-transform": "uppercase",
	});
	expect(
		glyphs(generated.layout)
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("AB  CD");
	for (const glyph of glyphs(generated.layout)) expect(glyph.fontSize).toBe(12);
	expect(generated.metrics.paintedGlyphs).toBe(4);
	expect(current.generated.tree.textContent(current.generated.id())).toBe("");
});

it("retains unsupported letter-spacing diagnostics for generated and ordinary tables", () => {
	const current = pair({ css: "#target{letter-spacing:-1px}" });
	for (const fixture of [current.generated, current.ordinary]) {
		expect(() => layoutDocument(fixture.tree)).toThrow(
			/unimplemented-or-invalid-css-value/,
		);
		expect(
			documentStyles(fixture.tree).metrics().issues[
				"unimplemented-or-invalid-css-value"
			],
		).toBe(1);
	}
});

it("renders supported letter spacing in generated and ordinary tables", () => {
	const current = pair({ css: "#target{letter-spacing:1px}" });
	const { generated, box } = expectEquivalent(current);
	expect(glyphs(generated.layout).map((glyph) => glyph.x)).toEqual([0, 7]);
	expect(glyphs(generated.layout).map((glyph) => glyph.advance)).toEqual([
		7, 6,
	]);
	expect(box.borderBoxWidth).toBe(13);
});

it("refreshes geometry and hits after float, content and inherited font mutations", () => {
	const current = pair({
		declarations: "clear:both;background:red",
		lead: '<div id="lead"><span id="left"></span></div>',
		css: "#target.changed{font-size:12px;line-height:16px;color:blue}",
		generatedCss: '#target.changed::before{content:"WIDE"}',
	});
	const initial = expectEquivalent(current);
	const geometry = documentGeometry(current.generated.tree);
	const hits = documentHitTesting(current.generated.tree);
	const first = geometry.getBoundingClientRect(
		current.generated.id("#following"),
	);
	expect(
		hits.elementFromPoint(initial.box.borderX + 1, initial.box.borderY + 1),
	).toBe(current.generated.id());
	const geometryBuilds = geometry.metrics().builds;
	const hitBuilds = hits.metrics().builds;
	geometry.getBoundingClientRect(current.generated.id("#following"));
	hits.elementFromPoint(initial.box.borderX + 1, initial.box.borderY + 1);
	expect(geometry.metrics().builds).toBe(geometryBuilds);
	expect(hits.metrics().builds).toBe(hitBuilds);
	for (const fixture of [current.generated, current.ordinary]) {
		fixture.tree.setAttribute(fixture.id("#left"), "style", "height:50px");
		fixture.tree.setAttribute(fixture.id(), "class", "changed");
	}
	current.ordinary.tree.setTextContent(
		current.ordinary.id("#ordinary"),
		"WIDE",
	);
	const updated = expectEquivalent(current);
	expect(updated.box.borderY).toBe(50);
	expect(updated.box.borderBoxWidth).toBeGreaterThan(
		initial.box.borderBoxWidth,
	);
	expect(
		glyphs(updated.generated.layout)
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("WIDE");
	const next = geometry.getBoundingClientRect(
		current.generated.id("#following"),
	);
	expect(next.y).toBeGreaterThan(first.y);
	expect(
		hits.elementFromPoint(updated.box.borderX + 1, updated.box.borderY + 1),
	).toBe(current.generated.id());
	expect(hits.elementFromPoint(1, 25)).toBe(current.generated.id("#left"));
	expect(geometry.metrics().builds).toBeGreaterThan(geometryBuilds);
	expect(hits.metrics().builds).toBeGreaterThan(hitBuilds);
	expect(initial.box.borderY).toBe(24);
	expect(
		glyphs(initial.generated.layout)
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("AB");
	for (const fixture of [current.generated, current.ordinary]) {
		fixture.tree.removeAttribute(fixture.id("#left"), "style");
		fixture.tree.removeAttribute(fixture.id(), "class");
	}
	current.ordinary.tree.setTextContent(current.ordinary.id("#ordinary"), "AB");
	expect(expectEquivalent(current).generated.image.pixels).toEqual(
		initial.generated.image.pixels,
	);
});

it("removes and restores whitespace clearfix table geometry when content is suppressed", () => {
	const current = pair({
		name: "after",
		text: " ",
		declarations: "clear:both",
		inside: '<span id="left"></span>',
		css: "#target.suppressed::after{content:none}#target.suppressed #ordinary{display:none}",
	});
	const initial = expectEquivalent(current);
	const geometry = documentGeometry(current.generated.tree);
	expect(geometry.getBoundingClientRect(current.generated.id()).height).toBe(
		24,
	);
	for (const fixture of [current.generated, current.ordinary])
		fixture.tree.setAttribute(fixture.id(), "class", "suppressed");
	const hidden = rasterizeDocument(current.generated.tree, { clip });
	const oracle = rasterizeDocument(current.ordinary.tree, { clip });
	expect(hidden.image.pixels).toEqual(oracle.image.pixels);
	expect(
		hidden.layout.text.horizontal.formatting.nodes.some(
			(node) => node.generatedContent?.owner === current.generated.id(),
		),
	).toBe(false);
	expect(geometry.getBoundingClientRect(current.generated.id()).height).toBe(0);
	expect(
		geometry.getBoundingClientRect(current.generated.id("#following")).y,
	).toBe(0);
	for (const fixture of [current.generated, current.ordinary])
		fixture.tree.removeAttribute(fixture.id(), "class");
	expect(expectEquivalent(current).generated.image.pixels).toEqual(
		initial.generated.image.pixels,
	);
	expect(geometry.getBoundingClientRect(current.generated.id()).height).toBe(
		24,
	);
});

it("exposes only the originating owner to geometry and hits, not invented pseudo refs", () => {
	const current = pair({
		declarations:
			"width:40px;height:24px;padding:3px;border:2px solid blue;background:red",
	});
	const { tree, queries, id } = current.generated;
	const controls = documentGeneratedControls(tree);
	const targets = controls.metrics().targets;
	const revision = tree.revision;
	const count = tree.nodeCount;
	const children = [...tree.get(id()).children];
	const references = queries
		.querySelectorAll("*")
		.map((owner) => tree.reference(owner));
	const { generated, box } = expectEquivalent(current);
	const geometry = documentGeometry(tree);
	const ordinaryGeometry = documentGeometry(current.ordinary.tree);
	for (const selector of ["#target", "#following"])
		expect(geometry.getBoundingClientRect(id(selector))).toEqual(
			ordinaryGeometry.getBoundingClientRect(current.ordinary.id(selector)),
		);
	for (const [horizontal, vertical] of [
		[box.borderX, box.borderY],
		[box.borderX + 3, box.borderY + 3],
		[box.contentX + 1, box.contentY + 1],
	]) {
		expect(
			documentHitTesting(tree).targetFromPoint(horizontal, vertical),
		).toEqual({ id: id() });
		expect(
			documentHitTesting(current.ordinary.tree).elementFromPoint(
				horizontal,
				vertical,
			),
		).toBe(current.ordinary.id("#ordinary"));
	}
	for (const node of generated.layout.text.horizontal.formatting.nodes) {
		if (!node.generatedContent) continue;
		expect(node.generatedContent).toEqual({ owner: id(), name: "before" });
		expect(node.ref).toBeUndefined();
		expect(node.generated).toBeUndefined();
		expect(node.control).toBeUndefined();
	}
	for (const glyph of glyphs(generated.layout)) expect(glyph.ref).toBe("");
	expect(queries.querySelectorAll("#target::before, #target::after")).toEqual(
		[],
	);
	expect(
		queries.querySelectorAll("*").map((owner) => tree.reference(owner)),
	).toEqual(references);
	expect(tree.revision).toBe(revision);
	expect(tree.nodeCount).toBe(count);
	expect(tree.get(id()).children).toEqual(children);
	expect(tree.textContent(id())).toBe("");
	expect(controls.metrics().targets).toBe(targets);
});

it.each(["text", "boxes", "work"] as const)(
	"charges anonymous generated table content to the formatting %s cap and recovers",
	(budget) => {
		const current = pair({ text: "four" });
		const { tree } = current.generated;
		const complete = buildFormattingTree(tree);
		const revision = tree.revision;
		const count = tree.nodeCount;
		const options = {
			text: { maxTextCodeUnits: 3 },
			boxes: { maxBoxes: complete.metrics.boxes - 1 },
			work: { maxWork: complete.metrics.work - 1 },
		}[budget];
		expect(complete.metrics.textCodeUnits).toBe(4);
		expect(() => buildFormattingTree(tree, options)).toThrow(
			`${budget === "boxes" ? "box" : budget} limit`,
		);
		expect(tree.revision).toBe(revision);
		expect(tree.nodeCount).toBe(count);
		expect(buildFormattingTree(tree).metrics).toEqual(complete.metrics);
		expect(expectEquivalent(current).generated.metrics.paintedGlyphs).toBe(4);
	},
);

it.each(["layout", "raster"] as const)(
	"enforces the generated table %s work cap without poisoning later output",
	(stage) => {
		const current = pair({ declarations: "background:red" });
		const initial = expectEquivalent(current);
		const { tree } = current.generated;
		const revision = tree.revision;
		const count = tree.nodeCount;
		expect(() =>
			stage === "layout"
				? layoutDocument(tree, { maxWork: 1 })
				: rasterizeDocument(tree, { clip, maxWork: 1 }),
		).toThrow("work limit");
		expect(tree.revision).toBe(revision);
		expect(tree.nodeCount).toBe(count);
		expect(expectEquivalent(current).generated.image.pixels).toEqual(
			initial.generated.image.pixels,
		);
	},
);

it("releases generated table query, geometry, hit and control state on close", () => {
	const current = pair();
	const { tree, queries, id } = current.generated;
	const owner = id();
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	const controls = documentGeneratedControls(tree);
	const { generated, box } = expectEquivalent(current);
	geometry.getBoundingClientRect(owner);
	hits.elementFromPoint(box.borderX + 1, box.borderY + 1);
	expect(geometry.metrics().rectangles).toBeGreaterThan(0);
	expect(hits.metrics().regions).toBeGreaterThan(0);
	expect(queries.metrics().indexedNodes).toBeGreaterThan(0);
	tree.close();
	expect(geometry.metrics()).toMatchObject({
		closed: true,
		rectangles: 0,
		usedStyles: 0,
	});
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(controls.metrics()).toMatchObject({ closed: true, targets: 0 });
	expect(queries.metrics()).toMatchObject({
		closed: true,
		cachedSelectors: 0,
		indexedNodes: 0,
	});
	expect(() => geometry.getBoundingClientRect(owner)).toThrow("closed");
	expect(() => hits.elementFromPoint(1, 1)).toThrow("closed");
	expect(() => queries.querySelector("#target")).toThrow("closed");
	expect(
		glyphs(generated.layout)
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("AB");
});
