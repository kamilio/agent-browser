import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentElementSizes } from "./element-sizes.js";
import { AgentBrowserError } from "./errors.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { layoutValueLimits } from "./layout-values.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const sides = ["top", "right", "bottom", "left"] as const;
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const baseCss =
	"html,body{margin:0;font-size:8px;line-height:8px}table{border-spacing:2px}td,th{vertical-align:top;text-align:left;background:red;border:1px solid black}.chip{display:block;width:12px;height:8px;background:blue}";
const singleCell =
	'<table id="table"><tbody id="group"><tr id="row"><td id="target"><div id="chip" class="chip"></div></td></tr></tbody></table>';

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup = singleCell, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style id="author">${css}</style><style>${baseCss}</style>${markup}`,
		"https://fixture.invalid/cell-padding",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(180, 160);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing cellpadding fixture ${selector}`);
		return found;
	};
	const rectangle = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	const box = (selector: string) => {
		const found = layoutDocument(tree).boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing cellpadding box ${selector}`);
		return found;
	};
	return { tree, styles, id, rectangle, box };
}

function withHint(value: string) {
	return singleCell.replace(
		'<table id="table">',
		`<table id="table" cellpadding="${value}">`,
	);
}

function expectSpecifiedPadding(
	test: ReturnType<typeof fixture>,
	selector: string,
	values: readonly number[],
) {
	for (const [index, side] of sides.entries()) {
		const property = `padding-${side}` as const;
		expect(test.styles.box(test.id(selector))[property]).toBe(
			`${values[index]}px`,
		);
	}
}

function expectPadding(
	test: ReturnType<typeof fixture>,
	selector: string,
	values: readonly number[],
) {
	expectSpecifiedPadding(test, selector, values);
	for (const [index, side] of sides.entries()) {
		const property = `padding-${side}` as const;
		expect(resolvedStyleValue(test.tree, test.id(selector), property)).toBe(
			`${values[index]}px`,
		);
	}
}

function pixel(
	raster: ReturnType<typeof rasterizeDocument>,
	horizontal: number,
	vertical: number,
) {
	const column = Math.floor(horizontal - raster.clip.x);
	const row = Math.floor(vertical - raster.clip.y);
	if (
		column < 0 ||
		row < 0 ||
		column >= raster.image.width ||
		row >= raster.image.height
	)
		throw new Error("Cellpadding sample outside raster");
	const offset = (row * raster.image.width + column) * 4;
	return [...raster.image.pixels.slice(offset, offset + 4)];
}

function expectContentOffsets(
	test: ReturnType<typeof fixture>,
	cell = "#target",
	child = "#chip",
) {
	const rectangle = test.rectangle(cell);
	const content = test.rectangle(child);
	const box = test.box(cell);
	expect(content.width).toBeGreaterThan(0);
	expect(content.height).toBeGreaterThan(0);
	expect(content.left).toBe(rectangle.left + box.borderLeft + box.paddingLeft);
	expect(content.top).toBe(rectangle.top + box.borderTop + box.paddingTop);
	expect(rectangle.right - content.right).toBeGreaterThanOrEqual(
		box.borderRight + box.paddingRight,
	);
	expect(rectangle.bottom - content.bottom).toBeGreaterThanOrEqual(
		box.borderBottom + box.paddingBottom,
	);
	const raster = rasterizeDocument(test.tree);
	const hits = documentHitTesting(test.tree);
	const horizontal = content.left + content.width / 2;
	const vertical = content.top + content.height / 2;
	expect(pixel(raster, horizontal, vertical)).toEqual(blue);
	expect(hits.elementFromPoint(horizontal, vertical)).toBe(test.id(child));
	if (box.paddingLeft >= 1) {
		const paddingPoint = rectangle.left + box.borderLeft + 0.5;
		expect(pixel(raster, paddingPoint, vertical)).toEqual(red);
		expect(hits.elementFromPoint(paddingPoint, vertical)).toBe(test.id(cell));
	}
	if (box.paddingTop >= 1) {
		const paddingPoint = rectangle.top + box.borderTop + 0.5;
		expect(pixel(raster, horizontal, paddingPoint)).toEqual(red);
		expect(hits.elementFromPoint(horizontal, paddingPoint)).toBe(test.id(cell));
	}
}

function expectEquivalent(
	actual: ReturnType<typeof fixture>,
	expected: ReturnType<typeof fixture>,
	selectors = ["#table", "#target", "#chip"],
) {
	for (const selector of selectors) {
		expect(actual.rectangle(selector)).toEqual(expected.rectangle(selector));
		expect(documentElementSizes(actual.tree).get(actual.id(selector))).toEqual(
			documentElementSizes(expected.tree).get(expected.id(selector)),
		);
	}
	expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
		rasterizeDocument(expected.tree).image.pixels,
	);
	expect(buildFormattingTree(actual.tree).issues).toEqual(
		buildFormattingTree(expected.tree).issues,
	);
}

function expectErrorCode(action: () => unknown, code: string) {
	let failure: unknown;
	try {
		action();
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(AgentBrowserError);
	expect(failure).toMatchObject({ code });
}

it("keeps the coordinated formatting profile for a table with cell padding", () => {
	const test = fixture(withHint("5"));
	expect(test.styles.box(test.id("#target"))["padding-left"]).toBe("5px");
	expect(Number.isFinite(test.styles.metrics().work)).toBe(true);
	expect(test.styles.metrics().work).toBeGreaterThan(0);
	const issues = buildFormattingTree(test.tree).issues;
	expect(issues, JSON.stringify(issues)).toEqual({
		"display-layout-not-supported": 1,
	});
});

it.each([
	{ value: "0", padding: 0 },
	{ value: "-0", padding: 0 },
	{ value: "+3", padding: 3 },
	{ value: "3.9", padding: 3 },
	{ value: "3%", padding: 3 },
	{ value: "3e2", padding: 3 },
	{ value: "-2", padding: 1 },
	{ value: "", padding: 1 },
])(
	"uses cellpadding=$value as $padding px in native geometry, pixels and hits",
	({ value, padding }) => {
		const actual = fixture(withHint(value));
		const expected = fixture(singleCell, `#target{padding:${padding}px}`);
		expectPadding(actual, "#target", [padding, padding, padding, padding]);
		expectPadding(actual, "#table", [0, 0, 0, 0]);
		expectEquivalent(actual, expected);
		expectContentOffsets(actual);
		expect(actual.rectangle("#target").height).toBe(10 + padding * 2);
	},
);

it.each(sides)(
	"lets the very first zero-specificity author declaration override the %s hint",
	(side) => {
		const test = fixture(withHint("4"), `*{padding-${side}:0}`);
		const values = sides.map((candidate) => (candidate === side ? 0 : 4));
		expectPadding(test, "#target", values);
		const control = fixture(
			singleCell,
			`#target{padding:${values.map((value) => `${value}px`).join(" ")}}`,
		);
		expectEquivalent(test, control);
		expectContentOffsets(test);
	},
);

it.each([
	{ css: "#target{padding:2px 3px 4px 5px}", inline: "", values: [2, 3, 4, 5] },
	{ css: "#target{padding-left:0}", inline: "", values: [4, 4, 4, 0] },
	{ css: "", inline: "padding:2px", values: [2, 2, 2, 2] },
	{
		css: "*{padding:3px!important}",
		inline: "padding:2px",
		values: [3, 3, 3, 3],
	},
	{
		css: "#target{padding:3px!important}",
		inline: "padding:2px!important",
		values: [2, 2, 2, 2],
	},
	{
		css: "#target{--space:3px;padding:var(--space)}",
		inline: "",
		values: [3, 3, 3, 3],
	},
	{
		css: "#target{padding:var(--missing, 2px)}",
		inline: "",
		values: [2, 2, 2, 2],
	},
	{ css: "#target{padding:var(--missing)}", inline: "", values: [0, 0, 0, 0] },
	{
		css: "#target{--space:red;padding:var(--space)}",
		inline: "",
		values: [0, 0, 0, 0],
	},
	{ css: "#target{padding:initial}", inline: "", values: [0, 0, 0, 0] },
	{ css: "#target{padding:unset}", inline: "", values: [0, 0, 0, 0] },
	{ css: "#target{padding:revert}", inline: "", values: [1, 1, 1, 1] },
	{
		css: "#row{padding:2px 3px 4px 5px}#target{padding:inherit}",
		inline: "",
		values: [2, 3, 4, 5],
	},
])(
	"resolves author padding over hints without resurrecting lower winners: $css / $inline",
	({ css, inline, values }) => {
		const actual = fixture(
			withHint("4").replace('id="target"', `id="target" style="${inline}"`),
			css,
		);
		expectPadding(actual, "#target", values);
		expectContentOffsets(actual);
		const control = fixture(
			singleCell,
			`${css}#target{padding:${values.map((value) => `${value}px`).join(" ")}!important}`,
		);
		expectEquivalent(actual, control);
	},
);

it.each([
	{ keyword: "initial", padding: 0 },
	{ keyword: "unset", padding: 0 },
	{ keyword: "revert", padding: 1 },
	{ keyword: "inherit", padding: 3 },
])(
	"distinguishes all:$keyword from the HTML cell default",
	({ keyword, padding }) => {
		const css = `#row{padding:3px}#target{all:${keyword};display:table-cell;vertical-align:top;background:red;border:1px solid black}`;
		const actual = fixture(withHint("4"), css);
		const expected = fixture(singleCell, `${css}#target{padding:${padding}px}`);
		expectPadding(actual, "#target", [padding, padding, padding, padding]);
		expectEquivalent(actual, expected);
		expectContentOffsets(actual);
	},
);

it.each(["separate", "collapse"])(
	"keeps author table padding independent of cell hints under %s borders",
	(collapse) => {
		const css = `#table{padding:7px;border-collapse:${collapse}}`;
		const actual = fixture(withHint("3"), css);
		const expected = fixture(singleCell, `${css}#target{padding:3px}`);
		expectSpecifiedPadding(actual, "#table", [7, 7, 7, 7]);
		for (const side of sides)
			expect(
				resolvedStyleValue(actual.tree, actual.id("#table"), `padding-${side}`),
			).toBe(collapse === "collapse" ? "0px" : "7px");
		expectPadding(actual, "#row", [0, 0, 0, 0]);
		expectPadding(actual, "#target", [3, 3, 3, 3]);
		expectEquivalent(actual, expected);
		expectContentOffsets(actual);
	},
);

it.each([undefined, "0", "2"])(
	"isolates nested-table cellpadding=%s from the outer table",
	(innerPadding) => {
		const attribute =
			innerPadding === undefined ? "" : ` cellpadding="${innerPadding}"`;
		const markup = `<table id="outer" cellpadding="4"><tr><td id="outer-cell"><table id="inner"${attribute}><tr><td id="target"><div id="chip" class="chip"></div></td></tr></table></td></tr></table>`;
		const actual = fixture(markup);
		const padding = innerPadding === undefined ? 1 : Number(innerPadding);
		const expected = fixture(
			markup.replace(/ cellpadding="[^"]*"/g, ""),
			`#outer-cell{padding:4px}#target{padding:${padding}px}`,
		);
		expectPadding(actual, "#outer-cell", [4, 4, 4, 4]);
		expectPadding(actual, "#target", [padding, padding, padding, padding]);
		expectPadding(actual, "#inner", [0, 0, 0, 0]);
		expectEquivalent(actual, expected, [
			"#outer",
			"#outer-cell",
			"#inner",
			"#target",
			"#chip",
		]);
		const outer = actual.rectangle("#outer-cell");
		const inner = actual.rectangle("#inner");
		const outerBox = actual.box("#outer-cell");
		expect(inner.left).toBe(outer.left + outerBox.borderLeft + 4);
		expect(inner.top).toBe(outer.top + outerBox.borderTop + 4);
		expectContentOffsets(actual);
	},
);

it.each(["thead", "tbody", "tfoot", "direct"])(
	"uses native HTML membership for %s rows rather than requiring authored tbody markup",
	(group) => {
		const row =
			'<tr id="row"><th id="target"><div id="chip" class="chip"></div></th></tr>';
		const markup = `<table id="table" cellpadding="3">${group === "direct" ? row : `<${group} id="group">${row}</${group}>`}</table>`;
		const actual = fixture(markup);
		if (group === "direct") {
			const parent = actual.tree.get(actual.id("#row")).parent;
			if (parent === null) throw new Error("Missing implied row group");
			expect(actual.tree.get(parent).tagName).toBe("tbody");
			actual.tree.append(actual.id("#table"), actual.id("#row"));
			expect(actual.tree.get(actual.id("#row")).parent).toBe(
				actual.id("#table"),
			);
		}
		const expected = fixture(
			markup.replace(' cellpadding="3"', ""),
			"#target{padding:3px}",
		);
		if (group === "direct")
			expected.tree.append(expected.id("#table"), expected.id("#row"));
		expectPadding(actual, "#target", [3, 3, 3, 3]);
		expectEquivalent(actual, expected);
		expectContentOffsets(actual);
	},
);

it("keeps hint metadata when HTML table roles are displayed as blocks or hidden", () => {
	const css = "#table,#group,#row,#target{display:block}#table{width:80px}";
	const actual = fixture(withHint("3"), css);
	const expected = fixture(singleCell, `${css}#target{padding:3px}`);
	expectPadding(actual, "#target", [3, 3, 3, 3]);
	expectEquivalent(actual, expected);
	expectContentOffsets(actual);
	actual.tree.setAttribute(actual.id("#target"), "style", "display:none");
	expectPadding(actual, "#target", [3, 3, 3, 3]);
	expect(actual.rectangle("#target").width).toBe(0);
	actual.tree.removeAttribute(actual.id("#target"), "style");
	expectEquivalent(actual, expected);
});

it.each(["css-row", "wrapped-row", "css-cell"])(
	"does not confuse %s formatting with HTML cell membership",
	(shape) => {
		const test = fixture('<table id="table" cellpadding="4"></table>');
		const row = test.tree.createElement(shape === "css-row" ? "div" : "tr", {
			style: "display:table-row",
		});
		const cell = test.tree.createElement(shape === "css-cell" ? "div" : "td", {
			id: "target",
			style:
				"display:table-cell;background:red;border:1px solid black;vertical-align:top",
		});
		const chip = test.tree.createElement("div", { id: "chip", class: "chip" });
		if (shape === "wrapped-row") {
			const wrapper = test.tree.createElement("div", {
				style: "display:contents",
			});
			test.tree.append(test.id("#table"), wrapper);
			test.tree.append(wrapper, row);
		} else test.tree.append(test.id("#table"), row);
		test.tree.append(row, cell);
		test.tree.append(cell, chip);
		const padding = shape === "css-cell" ? 0 : 1;
		expectPadding(test, "#target", [padding, padding, padding, padding]);
		expectContentOffsets(test);
		const rectangle = test.rectangle("#target");
		const raster = rasterizeDocument(test.tree).image.pixels.slice();
		test.tree.removeAttribute(test.id("#table"), "cellpadding");
		expect(test.rectangle("#target")).toEqual(rectangle);
		expect(rasterizeDocument(test.tree).image.pixels).toEqual(raster);
	},
);

it.each(["separate", "collapse"])(
	"preserves padded rowspan/colspan geometry and border paint in %s tables",
	(collapse) => {
		const markup =
			'<table id="table" cellpadding="3"><tbody><tr><td id="target" rowspan="2"><div id="chip" class="chip"></div></td><td id="first"><div class="chip"></div></td></tr><tr><td id="second"><div class="chip"></div></td></tr><tr><th id="wide" colspan="2"><div id="wide-chip" class="chip"></div></th></tr></tbody></table>';
		const css = `#table{border-collapse:${collapse};width:100px}#table td,#table th{border:2px solid black}`;
		const actual = fixture(markup, css);
		const expected = fixture(
			markup.replace(' cellpadding="3"', ""),
			`${css}td,th{padding:3px}`,
		);
		expectEquivalent(actual, expected, [
			"#table",
			"#target",
			"#chip",
			"#first",
			"#second",
			"#wide",
			"#wide-chip",
		]);
		expect(actual.rectangle("#target").bottom).toBe(
			actual.rectangle("#second").bottom,
		);
		expect(actual.rectangle("#wide").width).toBeGreaterThan(
			actual.rectangle("#target").width,
		);
		expectContentOffsets(actual);
		expectContentOffsets(actual, "#wide", "#wide-chip");
		const cell = actual.rectangle("#target");
		const vertical =
			actual.rectangle("#second").top + actual.rectangle("#second").height / 2;
		expect(pixel(rasterizeDocument(actual.tree), cell.left, vertical)).toEqual([
			0, 0, 0, 255,
		]);
		expect(
			pixel(
				rasterizeDocument(actual.tree),
				cell.left + cell.width / 2,
				vertical,
			),
		).toEqual(red);
		expect(
			documentHitTesting(actual.tree).elementFromPoint(
				cell.left + cell.width / 2,
				vertical,
			),
		).toBe(actual.id("#target"));
	},
);

it.each(["separate", "collapse"])(
	"offsets a decoded replaced child inside hinted padding in a %s table",
	async (collapse) => {
		const markup =
			'<table id="table" cellpadding="3"><tr><td id="target"><img id="chip" src="/chip.png"></td></tr></table>';
		const css = `#table{border-collapse:${collapse}}img{display:block}`;
		const actual = fixture(markup, css);
		const expected = fixture(
			markup.replace(' cellpadding="3"', ""),
			`${css}#target{padding:3px}`,
		);
		const requests: string[] = [];
		const body = encodePng(createRaster(12, 8, [0, 0, 255, 255]));
		for (const test of [actual, expected]) {
			const images = documentImages(test.tree, {
				fetch: async (url) => {
					if (url !== "https://fixture.invalid/chip.png")
						throw new Error(`Unexpected in-memory image: ${url}`);
					requests.push(url);
					return {
						url,
						status: 200,
						headers: { "content-type": ["image/png"] },
						body,
						encodedBytes: body.length,
						redirects: [],
						elapsedMs: 0,
					};
				},
			});
			await images.settle();
			expect(images.get(test.id("#chip"))).toMatchObject({
				state: "complete",
				naturalWidth: 12,
				naturalHeight: 8,
			});
		}
		expect(requests).toEqual([
			"https://fixture.invalid/chip.png",
			"https://fixture.invalid/chip.png",
		]);
		expectEquivalent(actual, expected);
		expectContentOffsets(actual);
		expect(rasterizeDocument(actual.tree).metrics.paintedImages).toBe(1);
	},
);

it("preserves the percentage table-width guard for both hints and CSS controls", () => {
	const actual = fixture(withHint("3"), "#table{width:50%}");
	const expected = fixture(singleCell, "#table{width:50%}#target{padding:3px}");
	for (const test of [actual, expected]) {
		expectSpecifiedPadding(test, "#target", [3, 3, 3, 3]);
		expectErrorCode(() => layoutDocument(test.tree), "unsupported");
		expect(() => layoutDocument(test.tree)).toThrow(
			"Percentage table role sizing requires cycle resolution",
		);
	}
});

it("reflows viewport-relative table widths without scaling pixel padding", () => {
	const actual = fixture(withHint("3"), "#table{width:50vw}");
	const expected = fixture(
		singleCell,
		"#table{width:50vw}#target{padding:3px}",
	);
	for (const width of [180, 240]) {
		actual.styles.setViewport(width, 160);
		expected.styles.setViewport(width, 160);
		expect(actual.rectangle("#table").width).toBe(width / 2);
		expectPadding(actual, "#target", [3, 3, 3, 3]);
		expectEquivalent(actual, expected);
		expectContentOffsets(actual);
	}
});

it("invalidates all geometry consumers after attribute addition, replacement and removal", () => {
	const test = fixture();
	const target = test.id("#target");
	const ref = test.tree.reference(target);
	const initial = test.rectangle("#target");
	for (const value of ["4", "0", "-3", "2", undefined]) {
		if (value === undefined)
			test.tree.removeAttribute(test.id("#table"), "cellpadding");
		else test.tree.setAttribute(test.id("#table"), "cellpadding", value);
		const padding = value === undefined || value === "-3" ? 1 : Number(value);
		const expected = fixture(singleCell, `#target{padding:${padding}px}`);
		expectPadding(test, "#target", [padding, padding, padding, padding]);
		expectEquivalent(test, expected);
		expectContentOffsets(test);
		expect(test.tree.reference(target)).toBe(ref);
	}
	expect(test.rectangle("#target")).toEqual(initial);
});

it("recomputes row, moved-cell and nested-table ownership without stale inherited hints", () => {
	const test = fixture(
		'<table id="first" cellpadding="4"><tbody id="first-group"><tr id="moving"><td id="target"><div id="chip" class="chip"></div><table id="nested"><tr><td id="inner"></td></tr></table></td></tr></tbody></table><table id="second" cellpadding="2"><tbody id="second-group"><tr id="destination"></tr></tbody></table>',
	);
	const target = test.id("#target");
	const ref = test.tree.reference(target);
	expectPadding(test, "#target", [4, 4, 4, 4]);
	expectPadding(test, "#inner", [1, 1, 1, 1]);
	test.tree.append(test.id("#second-group"), test.id("#moving"));
	expectPadding(test, "#target", [2, 2, 2, 2]);
	expectPadding(test, "#inner", [1, 1, 1, 1]);
	expectContentOffsets(test);
	test.tree.append(test.id("#first-group"), test.id("#moving"));
	test.tree.append(test.id("#destination"), target);
	expectPadding(test, "#target", [2, 2, 2, 2]);
	test.tree.setAttribute(test.id("#nested"), "cellpadding", "0");
	expectPadding(test, "#inner", [0, 0, 0, 0]);
	test.tree.setAttribute(test.id("#second"), "cellpadding", "6");
	expectPadding(test, "#target", [6, 6, 6, 6]);
	expectPadding(test, "#inner", [0, 0, 0, 0]);
	expectContentOffsets(test);
	test.tree.removeAttribute(test.id("#nested"), "cellpadding");
	expectPadding(test, "#inner", [1, 1, 1, 1]);
	expect(test.tree.reference(target)).toBe(ref);
});

it("restores current hints after inline and stylesheet-owner overrides are removed", () => {
	const test = fixture(
		`<link id="sheet" rel="stylesheet" href="/owned.css">${withHint("4")}`,
	);
	const target = test.id("#target");
	const sheet = test.id("#sheet");
	test.styles.setExternalSheet(
		sheet,
		"https://fixture.invalid/owned.css",
		"#target{padding:2px}",
	);
	expectPadding(test, "#target", [2, 2, 2, 2]);
	expectContentOffsets(test);
	test.tree.setAttribute(target, "style", "padding:0!important");
	test.tree.setAttribute(test.id("#table"), "cellpadding", "6");
	expectPadding(test, "#target", [0, 0, 0, 0]);
	test.tree.removeAttribute(target, "style");
	test.styles.setExternalSheet(
		sheet,
		"https://fixture.invalid/owned.css",
		"#target{padding:3px}",
	);
	expectPadding(test, "#target", [3, 3, 3, 3]);
	expectContentOffsets(test);
	test.tree.remove(sheet);
	expectPadding(test, "#target", [6, 6, 6, 6]);
	expectContentOffsets(test);
	test.tree.removeAttribute(test.id("#table"), "cellpadding");
	expectPadding(test, "#target", [1, 1, 1, 1]);
	expectContentOffsets(test);
});

it.each(["cellspacing", "rules", "frame", "background"])(
	"preserves the independent %s table hint guard",
	(attribute) => {
		const test = fixture(
			withHint("3").replace(
				'cellpadding="3"',
				`cellpadding="3" ${attribute}="legacy"`,
			),
		);
		expectSpecifiedPadding(test, "#target", [3, 3, 3, 3]);
		expect(
			buildFormattingTree(test.tree).issues[
				"html-table-presentation-hint-not-supported"
			],
		).toBeGreaterThan(0);
		expectErrorCode(() => layoutDocument(test.tree), "unsupported");
		test.tree.removeAttribute(test.id("#table"), attribute);
		expectContentOffsets(test);
	},
);

it("does not recognize cellpadding on a cell as an implemented table hint", () => {
	const test = fixture(
		singleCell.replace('id="target"', 'id="target" cellpadding="4"'),
	);
	expectSpecifiedPadding(test, "#target", [1, 1, 1, 1]);
	expect(
		buildFormattingTree(test.tree).issues[
			"html-table-presentation-hint-not-supported"
		],
	).toBeGreaterThan(0);
	expectErrorCode(() => layoutDocument(test.tree), "unsupported");
});

it("charges a long raw hint once per table rather than once per cell and recovers from work exhaustion", () => {
	const test = fixture(
		'<table id="table" cellpadding="2"><tr><td id="target"></td><td></td><th></th></tr></table>',
	);
	const shortWork = test.styles.metrics().work;
	test.tree.setAttribute(
		test.id("#table"),
		"cellpadding",
		`${"0".repeat(5000)}2`,
	);
	const required = test.styles.metrics().work;
	expect(required - shortWork).toBe(5000);
	expectPadding(test, "#target", [2, 2, 2, 2]);
	expect(test.styles.metrics().work).toBe(required);
	const exact = new DocumentStyles(test.tree, { maxWork: required });
	const insufficient = new DocumentStyles(test.tree, { maxWork: required - 1 });
	try {
		expect(exact.metrics().work).toBe(required);
		expectErrorCode(() => insufficient.metrics(), "resource-limit");
		test.tree.setAttribute(test.id("#table"), "cellpadding", "2");
		expect(insufficient.box(test.id("#target"))["padding-left"]).toBe("2px");
		expect(insufficient.metrics().work).toBe(shortWork);
	} finally {
		exact.close();
		insufficient.close();
	}
});

it("does not suppress unsafe positive hint failures for hidden tables with important author padding", () => {
	const test = fixture(
		withHint("2"),
		"#table{display:none}#target{padding:0!important}",
	);
	test.tree.setAttribute(test.id("#table"), "cellpadding", "9007199254740992");
	expectErrorCode(() => test.styles.metrics(), "resource-limit");
	test.tree.removeAttribute(test.id("#table"), "cellpadding");
	expectPadding(test, "#target", [0, 0, 0, 0]);
	test.tree.remove(test.id("#author"));
	expectPadding(test, "#target", [1, 1, 1, 1]);
	expectContentOffsets(test);
});

it("rejects representable but out-of-range used padding without poisoning later layout", () => {
	const value = layoutValueLimits.maxAbsoluteLength + 1;
	const test = fixture(withHint(String(value)));
	expect(test.styles.box(test.id("#target"))["padding-left"]).toBe(
		`${value}px`,
	);
	expectErrorCode(() => test.rectangle("#target"), "resource-limit");
	test.tree.setAttribute(test.id("#table"), "cellpadding", "3");
	expectPadding(test, "#target", [3, 3, 3, 3]);
	expectContentOffsets(test);
});

it("keeps geometry, paint and hit work limits fail-closed on hinted cells", () => {
	const test = fixture(withHint("3"));
	expectErrorCode(
		() => layoutDocument(test.tree, { maxWork: 1 }),
		"resource-limit",
	);
	expectErrorCode(
		() => rasterizeDocument(test.tree, { maxWork: 1 }),
		"resource-limit",
	);
	const limited = new DocumentHitTesting(test.tree, { maxWork: 1 });
	try {
		expectErrorCode(() => limited.elementFromPoint(6, 6), "resource-limit");
	} finally {
		limited.close();
	}
	expectContentOffsets(test);
});

it("keeps read-only source, DOM, references and journals stable and releases geometry owners on close", () => {
	const test = fixture(withHint("  +003suffix"));
	const target = test.id("#target");
	const source = serializeHtml(test.tree);
	const revision = test.tree.revision;
	const retained = () =>
		[...test.tree.walk()].map(({ node }) => ({
			id: node.id,
			ref: test.tree.reference(node.id),
			attributes: { ...node.attributes },
			children: [...node.children],
			data: node.data,
		}));
	const nodes = retained();
	const mutations: unknown[] = [];
	const changes: unknown[] = [];
	test.tree.onMutation((record) => mutations.push(record));
	test.tree.onChange((change) => changes.push(change));
	const snapshot = snapshotDocument(test.tree);
	for (let iteration = 0; iteration < 3; iteration++) {
		expectPadding(test, "#target", [3, 3, 3, 3]);
		expectContentOffsets(test);
		expect(documentElementSizes(test.tree).get(target).offsetHeight).toBe(16);
		expect(snapshotDocument(test.tree)).toEqual(snapshot);
	}
	expect(serializeHtml(test.tree)).toBe(source);
	expect(retained()).toEqual(nodes);
	expect(test.tree.get(target).attributes.style).toBeUndefined();
	expect(test.tree.revision).toBe(revision);
	expect(test.tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
	expect(mutations).toEqual([]);
	expect(changes).toEqual([]);
	const geometry = documentGeometry(test.tree);
	const hits = documentHitTesting(test.tree);
	test.tree.close();
	expect(test.tree.nodeCount).toBe(0);
	expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expectErrorCode(() => test.styles.box(target), "closed");
});
