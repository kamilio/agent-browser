import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	css = "",
	content = '<div id="first"><div id="child"></div></div><div id="second"></div>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px}main{width:40px;height:40px;position:relative}#first,#second,#child{width:20px;height:20px}#first{background:red}#child{background:lime;position:absolute;left:0;top:0;z-index:10}#second{background:blue;position:absolute;left:0;top:0;z-index:1}${css}</style><main>${content}</main>`,
		"https://fixture.invalid/opacity-stacking",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(40, 40);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const pixel = (column = 5, row = 5) => {
		const image = rasterizeDocument(tree).image;
		const offset = (row * image.width + column) * 4;
		return [...image.pixels.slice(offset, offset + 4)];
	};
	return {
		tree,
		id,
		pixel,
		hit: () => documentHitTesting(tree).elementFromPoint(5, 5),
	};
}

it.each(["", "position:relative", "float:left", "display:inline-block"])(
	"isolates a %s opacity context's high z-index child",
	(style) => {
		const page = fixture(`#first{opacity:.5;${style}}`);
		expect(page.pixel()).toEqual([0, 0, 255, 255]);
		expect(page.hit()).toBe(page.id("#second"));
	},
);

it("does not create a context when opacity clamps to one", () => {
	const page = fixture("#first{opacity:200%}");
	expect(page.pixel()).toEqual([0, 255, 0, 255]);
	expect(page.hit()).toBe(page.id("#child"));
});

it("keeps a transparent group atomic for hit testing", () => {
	const page = fixture("#first{opacity:0}#second{z-index:-1}");
	expect(page.pixel()).toEqual([0, 0, 255, 255]);
	expect(page.hit()).toBe(page.id("#child"));
});

it("paints a group's background before its negative z-index child", () => {
	const page = fixture(
		"#first{opacity:.5}#child{z-index:-1}#second{display:none}",
	);
	expect(page.pixel()).toEqual([128, 255, 128, 255]);
	expect(page.hit()).toBe(page.id("#child"));
});

it("does not make opacity an absolute-position containing block", () => {
	const page = fixture(
		"#first{opacity:.5;margin-left:10px}#child{left:3px}#second{display:none}",
	);
	expect(
		documentGeometry(page.tree).getBoundingClientRect(page.id("#child")).left,
	).toBe(3);
	expect(page.pixel()).toEqual([128, 255, 128, 255]);
});

it("retains fixed descendants in their opacity group without changing their containing block", () => {
	const page = fixture(
		"#first{opacity:.5;margin-left:10px}#child{position:fixed;left:3px}#second{display:none}",
	);
	expect(
		documentGeometry(page.tree).getBoundingClientRect(page.id("#child")).left,
	).toBe(3);
	expect(page.pixel()).toEqual([128, 255, 128, 255]);
});

it("orders separate opacity groups without retaining their surfaces together", () => {
	const page = fixture(
		"#first{opacity:.5;position:absolute;z-index:1}#second{opacity:.5;z-index:2}#child{display:none}",
	);
	expect(page.pixel()).toEqual([128, 64, 192, 255]);
	expect(rasterizeDocument(page.tree).metrics).toMatchObject({
		opacityGroups: 2,
		opacityPeakPixels: 1600,
	});
});

it("ignores opacity on a display-contents element with no generated box", () => {
	const page = fixture(
		"#first{display:contents;opacity:.5}#second{display:none}",
	);
	expect(page.pixel()).toEqual([0, 255, 0, 255]);
	expect(rasterizeDocument(page.tree).metrics.opacityGroups).toBeUndefined();
});
