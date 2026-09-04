import { afterEach, expect, it } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(content: string, css: string, explicit: boolean) {
	const style = `<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}${css}</style>`;
	const html = explicit
		? `<!doctype html><html><head>${style}</head><body>${content}</body></html>`
		: `<!doctype html>${style}${content}`;
	const tree = parseHtmlDocument(
		html,
		"https://fixture.invalid/positioned-root-stacking",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(480, 320);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw Error(`Missing ${selector}`);
		return found;
	};
	return { tree, id };
}
function pixel(
	image: { width: number; pixels: Uint8Array },
	x: number,
	y: number,
) {
	const offset = (y * image.width + x) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}
const hostContent =
	'<div id="title">Mixed inline selection</div><div id="label">Shared native Range and editing</div>\n<div id="editor" contenteditable><b id="first">Hello</b><i id="last">World</i></div>\n<button id="outside">Other focus</button><div id="flow">Ordinary content moves with root scroll.</div>';
const hostCss = `html,body{background:#edf2f8;color:#123;font-size:16px;line-height:20px}
#title{position:fixed;left:24px;top:18px;font-size:20px}
#label{position:fixed;left:24px;top:54px}
#editor{position:fixed;left:24px;top:80px;width:260px;height:90px;padding:8px;border:1px solid #678;background:white;white-space:pre-wrap}
#first{color:maroon}#last{color:navy}
#outside{position:fixed;left:24px;top:204px;width:164px;height:28px}
#flow{height:800px;padding-top:260px;padding-left:24px;color:#567;font-size:12px}
:focus-visible{outline:2px solid #0755aa;outline-offset:2px}`;

it("parses both bare and explicit fixture markup to one html formatting-root child with identical pixels", () => {
	const captures = [];
	for (const explicit of [false, true]) {
		const { tree, id } = fixture(hostContent, hostCss, explicit);
		const rootElements = tree
			.get(tree.root)
			.children.filter((child) => tree.get(child).kind === "element");
		expect(rootElements.map((child) => tree.get(child).tagName)).toEqual([
			"html",
		]);
		const formatting = layoutDocument(tree).text.horizontal.formatting;
		expect(formatting.nodes[formatting.root].children).toHaveLength(1);
		expect(
			formatting.nodes[formatting.nodes[formatting.root].children[0]].ref,
		).toBe(tree.reference(id("html")));
		documentScroll(tree).to(0, 80);
		captures.push(rasterizeDocument(tree).image);
	}
	expect(captures[0]).toEqual(captures[1]);
});

it.each([false, true])(
	"keeps fixed borders and focus outlines opaque while the offset gap remains unfilled (explicit=%s)",
	(explicit) => {
		const { tree, id } = fixture(hostContent, hostCss, explicit);
		documentInteractions(tree).focus.focusElement(id("#editor"), {
			preventScroll: true,
			focusVisible: true,
		});
		documentScroll(tree).to(0, 80);
		const raster = rasterizeDocument(tree);
		const editor = raster.layout.boxes.find(
			(box) => box.ref === tree.reference(id("#editor")),
		);
		expect(editor).toMatchObject({
			borderX: 24,
			borderY: 160,
			borderBoxWidth: 278,
			borderBoxHeight: 108,
		});
		for (let column = 24; column < 302; column++) {
			expect(pixel(raster.image, column, 187)).toEqual([102, 119, 136, 255]);
			expect(
				documentHitTesting(tree).elementFromPoint(column + 0.5, 187.5),
			).toBe(id("#editor"));
		}
		for (const row of [190, 191])
			for (let column = 20; column < 306; column++)
				expect(pixel(raster.image, column, row)).toEqual([7, 85, 170, 255]);
		for (const row of [188, 189, 192, 193]) {
			let visibleFlowPixels = 0;
			for (let column = 24; column < 302; column++)
				if (pixel(raster.image, column, row).join(",") === "85,102,119,255")
					visibleFlowPixels++;
			expect(visibleFlowPixels).toBeGreaterThan(0);
		}
		expect(documentHitTesting(tree).elementFromPoint(30, 188.5)).toBe(
			id("#flow"),
		);
		const items = Array.from(layoutContentItems(raster.layout, () => {}));
		const fixedBox = items.findIndex(
			(item) =>
				item.kind === "box" && item.box.ref === tree.reference(id("#editor")),
		);
		const flowRef = tree.reference(tree.get(id("#flow")).children[0]);
		const flowGlyphIndices = items.flatMap((item, index) =>
			item.kind === "glyph" && item.glyph.ref === flowRef ? [index] : [],
		);
		expect(flowGlyphIndices.length).toBeGreaterThan(0);
		expect(Math.max(...flowGlyphIndices)).toBeLessThan(fixedBox);
	},
);

it.each([false, true])(
	"paints an opaque fixed box and glyph above later normal-flow backgrounds and glyphs at scroll 0 and 80 (explicit=%s)",
	(explicit) => {
		const { tree, id } = fixture(
			'<div id="fixed">X</div><div id="flow">MMMMMM</div>',
			"#fixed{position:fixed;left:0;top:10px;width:60px;height:20px;border:2px solid navy;background:white;color:red}#flow{height:500px;padding-top:110px;background:lime;color:black}",
			explicit,
		);
		for (const scroll of [0, 80]) {
			documentScroll(tree).to(0, scroll);
			const raster = rasterizeDocument(tree);
			expect(pixel(raster.image, 40, 15)).toEqual([255, 255, 255, 255]);
			for (let column = 0; column < 64; column++)
				expect(pixel(raster.image, column, 33)).toEqual([0, 0, 128, 255]);
			expect(documentHitTesting(tree).elementFromPoint(40, 15)).toBe(
				id("#fixed"),
			);
			expect(documentHitTesting(tree).elementFromPoint(40, 34)).toBe(
				id("#flow"),
			);
			const items = Array.from(layoutContentItems(raster.layout, () => {}));
			const fixedRef = tree.reference(tree.get(id("#fixed")).children[0]);
			const flowRef = tree.reference(tree.get(id("#flow")).children[0]);
			const fixedGlyph = items.findIndex(
				(item) => item.kind === "glyph" && item.glyph.ref === fixedRef,
			);
			const lastFlowGlyph = items
				.flatMap((item, index) =>
					item.kind === "glyph" && item.glyph.ref === flowRef ? [index] : [],
				)
				.at(-1);
			if (lastFlowGlyph === undefined) throw Error("Missing flow glyph");
			expect(fixedGlyph).toBeGreaterThan(lastFlowGlyph);
		}
	},
);

it.each([
	[3, 1, "#first", [255, 0, 0, 255]],
	[1, 3, "#last", [0, 0, 128, 255]],
	[-1, -3, "#first", [255, 0, 0, 255]],
	[-3, -1, "#last", [0, 0, 128, 255]],
	[-1, 0, "#last", [0, 0, 128, 255]],
	[0, -1, "#first", [255, 0, 0, 255]],
	[0, 0, "#last", [0, 0, 128, 255]],
] as const)(
	"keeps sibling z-index ordering %s/%s authoritative for pixels and hits",
	(first, last, selector, color) => {
		for (const explicit of [false, true]) {
			const { tree, id } = fixture(
				'<div id="first"></div><div id="last"></div>',
				`#first,#last{position:fixed;left:10px;top:10px;width:40px;height:20px}#first{background:red;z-index:${first}}#last{background:navy;z-index:${last}}`,
				explicit,
			);
			expect(pixel(rasterizeDocument(tree).image, 20, 15)).toEqual(color);
			expect(documentHitTesting(tree).elementFromPoint(20, 15)).toBe(
				id(selector),
			);
		}
	},
);

it.each([false, true])(
	"paints negative contexts below normal-flow content (explicit=%s)",
	(explicit) => {
		const { tree, id } = fixture(
			'<div id="fixed"></div><div id="flow">text</div>',
			"#fixed{position:fixed;left:0;top:0;width:60px;height:30px;background:red;z-index:-1}#flow{height:80px;background:lime}",
			explicit,
		);
		expect(pixel(rasterizeDocument(tree).image, 30, 15)).toEqual([
			0, 255, 0, 255,
		]);
		expect(documentHitTesting(tree).elementFromPoint(30, 15)).toBe(id("#flow"));
	},
);

it.each([
	["relative;z-index:1", "#sibling", [0, 0, 128, 255]],
	["fixed", "#sibling", [0, 0, 128, 255]],
	["relative", "#inner", [255, 0, 0, 255]],
	["absolute", "#inner", [255, 0, 0, 255]],
] as const)(
	"preserves nested context isolation versus auto-positioned participation: %s",
	(position, selector, color) => {
		for (const explicit of [false, true]) {
			const { tree, id } = fixture(
				'<div id="outer"><div id="inner"></div></div><div id="sibling"></div>',
				`#outer{position:${position};left:0;top:0;width:60px;height:30px;background:yellow}#inner{position:fixed;left:0;top:0;width:60px;height:30px;background:red;z-index:99}#sibling{position:fixed;left:0;top:0;width:60px;height:30px;background:navy;z-index:2}`,
				explicit,
			);
			expect(pixel(rasterizeDocument(tree).image, 30, 15)).toEqual(color);
			expect(documentHitTesting(tree).elementFromPoint(30, 15)).toBe(
				id(selector),
			);
		}
	},
);

it("does not let a high nested z-index escape a negative parent context", () => {
	const { tree, id } = fixture(
		'<div id="outer"><div id="inner"></div></div><div id="flow"></div>',
		"#outer{position:fixed;left:0;top:0;width:60px;height:30px;z-index:-1}#inner{position:fixed;left:0;top:0;width:60px;height:30px;background:red;z-index:99}#flow{height:80px;background:lime}",
		true,
	);
	expect(pixel(rasterizeDocument(tree).image, 30, 15)).toEqual([
		0, 255, 0, 255,
	]);
	expect(documentHitTesting(tree).elementFromPoint(30, 15)).toBe(id("#flow"));
});
