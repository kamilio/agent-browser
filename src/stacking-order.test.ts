import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	parseFlowValue,
	computeFlowStyle,
	initialFlowStyle,
} from "./css-flow.js";
import { directDeclaration, inlineProperties } from "./css-declarations.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
function fixture(
	css = "",
	content = '<div id="first"><div id="child"></div></div><div id="second"></div>',
) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{width:60px}#first,#second,#child{width:20px;height:20px}#first{background:red}#child{background:lime}#second{background:blue}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/stacking",
	);
	documents.push(document);
	documentStyles(document).setViewport(100, 100);
	const query = new DocumentQueries(document);
	const id = (selector: string) => {
		const value = query.querySelector(selector);
		if (value === null) throw Error(selector);
		return value;
	};
	const order = () =>
		[...layoutContentItems(layoutDocument(document), () => {})]
			.filter((item) => item.kind === "box")
			.map((item) => item.box.ref);
	const pixel = (x = 15, y = 5) => {
		const image = rasterizeDocument(document).image;
		const start = (y * image.width + x) * 4;
		return [...image.pixels.slice(start, start + 4)];
	};
	return {
		document,
		id,
		order,
		pixel,
		ref: (selector: string) => document.reference(id(selector)),
		hit: (x = 15, y = 5) => documentHitTesting(document).elementFromPoint(x, y),
	};
}

it.each([
	["auto", "auto"],
	["0", "0"],
	["-0", "0"],
	["+0003", "3"],
	["-42", "-42"],
	["9007199254740991", "9007199254740991"],
	["-9007199254740991", "-9007199254740991"],
	["initial", "initial"],
	["inherit", "inherit"],
	["unset", "unset"],
	["revert", "revert"],
] as const)(
	"shares stylesheet/CSSOM z-index grammar for %s",
	(value, normalized) => {
		expect(parseFlowValue("z-index", value)).toBe(normalized);
		expect(directDeclaration("z-index", value, false)).toEqual([
			{ name: "z-index", value: normalized, important: false },
		]);
	},
);

it.each([
	"1.5",
	"1px",
	"1e2",
	"9007199254740992",
	"-9007199254740992",
	"NaN",
	"Infinity",
	"calc(1)",
	"auto 1",
	"",
])("rejects unsupported z-index value %s", (value) => {
	expect(parseFlowValue("z-index", value)).toBeUndefined();
	expect(directDeclaration("z-index", value, false)).toEqual([]);
});

it("keeps one CSSOM property and non-inherited computed values", () => {
	expect(inlineProperties.filter((name) => name === "z-index")).toHaveLength(1);
	const parent = computeFlowStyle({ "z-index": "8" }, initialFlowStyle);
	expect(computeFlowStyle({}, parent)["z-index"]).toBe("auto");
	expect(computeFlowStyle({ "z-index": "inherit" }, parent)["z-index"]).toBe(
		"8",
	);
	for (const value of ["initial", "unset", "revert"])
		expect(computeFlowStyle({ "z-index": value }, parent)["z-index"]).toBe(
			"auto",
		);
});

it.each([
	[1, 2, "#second", [0, 0, 255, 255]],
	[2, 1, "#first", [255, 0, 0, 255]],
	[1, 1, "#second", [0, 0, 255, 255]],
	[0, 0, "#second", [0, 0, 255, 255]],
	[-1, -2, "#first", [255, 0, 0, 255]],
	[-2, -1, "#second", [0, 0, 255, 255]],
	[-1, -1, "#second", [0, 0, 255, 255]],
	[9007199254740991, -9007199254740991, "#first", [255, 0, 0, 255]],
] as const)(
	"orders sibling levels %s and %s, preserving geometry",
	(first, second, winner, color) => {
		const { document, id, pixel, hit } = fixture(
			`main{position:relative;z-index:0}#first{position:relative;z-index:${first}}#second{position:relative;top:-20px;z-index:${second}}`,
			'<div id="first"></div><div id="second"></div>',
		);
		expect(pixel()).toEqual(color);
		expect(hit()).toBe(id(winner));
		expect(
			documentGeometry(document).getBoundingClientRect(id("#first")),
		).toMatchObject({ x: 0, y: 0, width: 20, height: 20 });
		expect(layoutDocument(document).flowHeight).toBe(40);
	},
);

it.each(["0", "1", "-1"])(
	"contains a high descendant inside the parent's %s context",
	(level) => {
		const { id, pixel, hit } = fixture(
			`#first{position:relative;z-index:${level}}#child{position:relative;z-index:999}#second{position:relative;top:-20px;z-index:2}`,
		);
		expect(pixel()).toEqual([0, 0, 255, 255]);
		expect(hit()).toBe(id("#second"));
	},
);

it("lets positioned descendants escape an auto-level relative parent", () => {
	const { id, pixel, hit } = fixture(
		"#first{position:relative;z-index:auto}#child{position:relative;z-index:999}#second{position:relative;top:-20px;z-index:2}",
	);
	expect(pixel()).toEqual([0, 255, 0, 255]);
	expect(hit()).toBe(id("#child"));
});

it.each([
	["auto", [255, 0, 0, 255]],
	["0", [0, 255, 0, 255]],
] as const)(
	"distinguishes auto from zero for a negative child: %s",
	(level, color) => {
		const { pixel } = fixture(
			`#first{position:relative;z-index:${level}}#child{position:relative;z-index:-1}`,
			'<div id="first"><div id="child"></div></div>',
		);
		expect(pixel()).toEqual(color);
	},
);

it("paints ordinary descendant backgrounds over negative child contexts", () => {
	const { pixel, hit, id } = fixture(
		"#first{position:relative;z-index:0}#child{position:relative;z-index:-1}#second{margin-top:-20px}",
		'<div id="first"><div id="child"></div><div id="second"></div></div>',
	);
	expect(pixel()).toEqual([0, 0, 255, 255]);
	expect(hit()).toBe(id("#second"));
});

it("ignores z-index on static non-flex boxes without hiding its computed value", () => {
	const { document, id, pixel } = fixture(
		"#first{z-index:0}#child{position:relative;z-index:999}#second{position:relative;top:-20px;z-index:2}",
	);
	expect(pixel()).toEqual([0, 255, 0, 255]);
	expect(resolvedStyleValue(document, id("#first"), "z-index")).toBe("0");
});

it("keeps the root background behind negative descendants regardless of its z-index", () => {
	const { document, id, pixel } = fixture(
		"html{position:relative;z-index:999;background:red}body,main{background:transparent}#first{position:relative;z-index:-2;background:blue}",
		'<div id="first"></div>',
	);
	expect(pixel()).toEqual([0, 0, 255, 255]);
	expect(resolvedStyleValue(document, id("html"), "z-index")).toBe("999");
});

it.each(["block", "inline-block", "inline-flex"])(
	"keeps descendants inside a %s stacking context",
	(display) => {
		const { pixel } = fixture(
			`#first{display:${display};position:relative;z-index:0}#child{position:relative;z-index:3}#second{position:relative;top:-20px;z-index:1}`,
		);
		expect(pixel()).toEqual([0, 0, 255, 255]);
	},
);

it("orders inline context backgrounds after their negative descendants", () => {
	const { document, ref } = fixture(
		"#first{position:relative;z-index:0}#child{position:relative;z-index:-1}",
		'<span id="first"><span id="child">ab</span></span>',
	);
	const items = [...layoutContentItems(layoutDocument(document), () => {})];
	const fragment = (reference: string) =>
		items.findIndex(
			(item) => item.kind === "fragment" && item.fragment.ref === reference,
		);
	expect(fragment(ref("#child"))).toBeGreaterThan(-1);
	expect(fragment(ref("#child"))).toBeLessThan(fragment(ref("#first")));
});

it.each(["flex", "inline-flex"])(
	"applies z-index to static %s items and their descendants",
	(display) => {
		const { document, id, pixel, hit } = fixture(
			`main{display:${display}}#first,#second{flex-shrink:0;margin-right:-20px}#first{z-index:2}#child{position:relative;z-index:-99}#second{z-index:1}`,
		);
		expect(pixel()).toEqual([0, 255, 0, 255]);
		expect(hit()).toBe(id("#child"));
		expect(documentStyles(document).flow(id("#first")).position).toBe("static");
	},
);

it("uses order-modified traversal to break equal flex stack-level ties", () => {
	const { id, hit, pixel } = fixture(
		"main{display:flex}#first,#second{z-index:1;flex-shrink:0;margin-right:-20px}#first{order:2}#second{order:1}",
		'<div id="first"></div><div id="second"></div>',
	);
	expect(pixel()).toEqual([255, 0, 0, 255]);
	expect(hit()).toBe(id("#first"));
});

it("lets descendants escape an auto flex item's pseudo context but not a zero one", () => {
	const { document, id, pixel } = fixture(
		"main{display:flex}#first,#second{flex-shrink:0;margin-right:-20px}#child{position:relative;z-index:3}#second{z-index:1}",
	);
	expect(pixel()).toEqual([0, 255, 0, 255]);
	document.setAttribute(id("#first"), "style", "z-index:0");
	expect(pixel()).toEqual([0, 0, 255, 255]);
});

it("recascades importance and custom properties without changing stable node references", () => {
	const { document, id, pixel, ref } = fixture(
		"#first{position:relative;z-index:var(--level, 1)}#second{position:relative;top:-20px;z-index:2}",
		'<div id="first"></div><div id="second"></div>',
	);
	const reference = ref("#first");
	expect(pixel()).toEqual([0, 0, 255, 255]);
	document.setAttribute(id("#first"), "style", "--level:3");
	expect(pixel()).toEqual([255, 0, 0, 255]);
	document.setAttribute(id("#first"), "style", "z-index:0!important;z-index:4");
	expect(pixel()).toEqual([0, 0, 255, 255]);
	expect(ref("#first")).toBe(reference);
	document.setAttribute(id("#first"), "style", "all:initial");
	expect(resolvedStyleValue(document, id("#first"), "z-index")).toBe("auto");
});

it("omits hidden stacking subtrees and ignores boxless z-index", () => {
	const { pixel } = fixture(
		"#first{display:contents;position:relative;z-index:99}#child{position:relative;z-index:1}#second{position:relative;top:-20px;z-index:2}#hidden{display:none;z-index:999;position:absolute}",
		'<div id="first"><div id="child"></div></div><div id="second"></div><div id="hidden"></div>',
	);
	expect(pixel()).toEqual([0, 0, 255, 255]);
});

it("retains each glyph once in raster and PDF, including nested contexts", () => {
	const { document } = fixture(
		"#first{position:relative;z-index:0}#child{position:relative;z-index:-1}#second{position:relative;z-index:1}",
		'<div id="first">A<span id="child">B</span>C</div><div id="second">D</div>',
	);
	const glyphs = [
		...layoutContentItems(layoutDocument(document), () => {}),
	].filter((item) => item.kind === "glyph");
	expect(glyphs).toHaveLength(4);
	expect(
		new Set(glyphs.map((item) => `${item.glyph.ref}:${item.glyph.offset}`))
			.size,
	).toBe(4);
	expect(renderDocumentPdf(document).metrics.glyphs).toBe(4);
});

it("charges classification, retention and ordered emission to the caller's budget", () => {
	const { document } = fixture(
		"#first{position:relative;z-index:0}#child{position:relative;z-index:1}",
	);
	let total = 0;
	const layout = layoutDocument(document);
	[
		...layoutContentItems(layout, (amount = 1) => {
			total += amount;
		}),
	];
	let work = 0;
	expect(() => [
		...layoutContentItems(layout, (amount = 1) => {
			work += amount;
			if (work >= total) throw Error("paint budget");
		}),
	]).toThrow("paint budget");
});

it.each([
	"opacity:0.5",
	"transform:translateX(1px)",
	"isolation:isolate",
	"mix-blend-mode:multiply",
])("keeps unimplemented context-producing effects explicit: %s", (effect) => {
	const { document } = fixture(`#first{z-index:0;position:relative;${effect}}`);
	expect(() => rasterizeDocument(document)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each([
	["0", "auto", false, "#first"],
	["1", "auto", false, "#first"],
	["0", "0", false, "#first"],
	["1", "0", false, "#first"],
	["-1", "auto", true, "#second"],
	["-1", "-1", true, "#first"],
	["-2", "-1", true, "#second"],
	["0", "1", false, "#second"],
] as const)(
	"matches WPT flexbox-paint-ordering-002 phase invariants %s/%s",
	(first, second, negative, top) => {
		const { order, ref } = fixture(
			`main{display:inline-flex;width:20px;height:10px;border:2px solid gray}#first,#second{width:10px;height:10px;min-width:0}#first{order:1;z-index:${first}}#second{z-index:${second}}#child{margin-left:3px;margin-top:3px;width:10px;height:10px;border:1px solid blue}`,
			'<div id="first"><div id="child"></div></div><div id="second"></div>',
		);
		const records = order();
		const firstIndex = records.indexOf(ref("#first"));
		const secondIndex = records.indexOf(ref("#second"));
		const containerIndex = records.indexOf(ref("#host"));
		expect(firstIndex > secondIndex).toBe(top === "#first");
		expect(firstIndex < containerIndex).toBe(negative);
		if (second.startsWith("-"))
			expect(secondIndex).toBeLessThan(containerIndex);
	},
);
