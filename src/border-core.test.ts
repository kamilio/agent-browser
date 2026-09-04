import { afterEach, expect, it } from "vitest";
import { paintSolidBorders } from "./border-raster.js";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	borderSides,
	normalizeBorderWidth,
	parseBorderShorthand,
} from "./css-border.js";
import { initialBoxStyle } from "./css-box.js";
import { initialPaintStyle } from "./css-paint.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentElementSizes } from "./element-sizes.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import { encodePng } from "./png.js";
import { createRaster, type RasterImage } from "./raster.js";
import { resolveReplacedSize } from "./replaced-box.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(css = "", content = '<div id="target"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}${css}</style>${content}`,
		"https://fixture.invalid/border-core",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(100, 100);
	return {
		tree,
		id,
		styles,
		rect: () => documentGeometry(tree).getBoundingClientRect(id()),
		read: (name: string) => resolvedStyleValue(tree, id(), name),
	};
}
function pixel(image: RasterImage, column: number, row: number) {
	return Array.from(
		image.pixels.slice(
			(row * image.width + column) * 4,
			(row * image.width + column) * 4 + 4,
		),
	);
}

it.each([
	"border",
	"border-top",
	"border-right",
	"border-bottom",
	"border-left",
])("expands %s atomically", (name) => {
	const declarations = parseBorderShorthand(name, "calc(1px + 1px) solid red");
	expect(declarations).toHaveLength(name === "border" ? 12 : 3);
	expect(
		declarations
			?.filter((entry) => entry.property.endsWith("-width"))
			.every((entry) => entry.value === "calc(1px + 1px)"),
	).toBe(true);
});

it.each(["10%", "-1px", "calc(0% + 1px)", "min(1px, 10%)", "1ch", "1e999px"])(
	"rejects unsupported or invalid border width %s",
	(value) => {
		expect(normalizeBorderWidth(value)).toBeUndefined();
		expect(
			parseBorderShorthand("border", `${value} solid red`),
		).toBeUndefined();
	},
);

it.each([
	["0px", "0px"],
	[".2px", "1px"],
	["1.9px", "1px"],
	["2.9px", "2px"],
	["thin", "1px"],
	["medium", "3px"],
	["thick", "5px"],
])("resolves scale-one width %s to %s", (value, expected) => {
	const { read } = fixture(`#target{border:${value} solid red}`);
	expect(read("border-left-width")).toBe(expected);
});

it.each(
	borderSides.flatMap((side) =>
		["none", "hidden"].map((style) => [side, style]),
	),
)("inherits zero %s width from a %s parent border", (side, style) => {
	const { tree, id, read } = fixture(
		`#parent{border:9px ${style}}#target{width:10px;height:10px;border-style:solid;border-${side}-width:inherit}`,
		'<div id="parent"><div id="target"></div></div>',
	);
	expect(read(`border-${side}-width`)).toBe("0px");
	tree.setAttribute(id("#parent"), "style", "border-style:solid");
	expect(read(`border-${side}-width`)).toBe("9px");
	tree.setAttribute(id("#parent"), "style", "border-style:none");
	expect(read(`border-${side}-width`)).toBe("0px");
});

it("retains own declared width when style changes without leaking it through inheritance", () => {
	const { tree, id, styles, read } = fixture(
		"#target{border-width:1in;border-style:none}",
	);
	expect(styles.box(id())["border-left-width"]).toBe("96px");
	expect(read("border-left-width")).toBe("0px");
	tree.setAttribute(id(), "style", "border-style:solid");
	expect(read("border-left-width")).toBe("96px");
});

it("inherits zero from an unstyled parent's initial border", () => {
	const { read } = fixture(
		"#target{border-style:solid;border-width:inherit}",
		'<div><div id="target"></div></div>',
	);
	for (const side of borderSides)
		expect(read(`border-${side}-width`)).toBe("0px");
});

it("uses cascade winners, variables, math and font metrics for borders", () => {
	const { tree, id, read } = fixture(
		"#target{--edge:calc(1em + 1px);font-size:10px;border:var(--edge) solid red;border-left-width:2px!important}",
	);
	expect(read("border-top-width")).toBe("11px");
	expect(read("border-left-width")).toBe("2px");
	tree.setAttribute(id(), "style", "font-size:20px;border-color:blue");
	expect(read("border-top-width")).toBe("21px");
	expect(read("border-top-color")).toBe("rgb(0, 0, 255)");
});

it("resolves currentcolor inheritance against the consuming color in the native profile", () => {
	const { read } = fixture(
		"#parent{color:red}#target{color:blue;border:2px solid;border-color:inherit}",
		'<div id="parent"><div id="target"></div></div>',
	);
	expect(read("border-left-color")).toBe("rgb(0, 0, 255)");
});

it.each(["content-box", "border-box"])(
	"separates border and padding in %s geometry and client sizes",
	(sizing) => {
		const { tree, id, rect, read } = fixture(
			`#target{box-sizing:${sizing};width:30px;height:20px;padding:3px;border:2px solid red}`,
		);
		const extra = sizing === "content-box" ? 10 : 0;
		expect(rect()).toMatchObject({ width: 30 + extra, height: 20 + extra });
		expect(documentElementSizes(tree).get(id())).toMatchObject({
			clientWidth: 26 + extra,
			clientHeight: 16 + extra,
			clientTop: 2,
			clientLeft: 2,
			offsetWidth: 30 + extra,
			offsetHeight: 20 + extra,
		});
		expect(read("width")).toBe("30px");
	},
);

it("does not collapse child margins through top or bottom borders", () => {
	const { tree, id } = fixture(
		"#target{border-top:2px solid;border-bottom:3px solid}#child{height:10px;margin-top:7px;margin-bottom:11px}",
		'<div id="target"><div id="child"></div></div>',
	);
	const geometry = documentGeometry(tree);
	expect(geometry.getBoundingClientRect(id())).toMatchObject({
		y: 0,
		height: 33,
	});
	expect(geometry.getBoundingClientRect(id("#child"))).toMatchObject({
		y: 9,
		height: 10,
	});
});

it("subtracts border-box edges before preserving replaced aspect ratios", () => {
	const style = {
		...initialBoxStyle,
		"box-sizing": "border-box",
		width: "120px",
		"border-left-style": "solid",
		"border-right-style": "solid",
		"border-left-width": "10px",
		"border-right-width": "10px",
	};
	expect(resolveReplacedSize(100, 50, style, 200, null)).toMatchObject({
		contentWidth: 100,
		contentHeight: 50,
		borderBoxWidth: 120,
		borderLeft: 10,
		borderRight: 10,
	});
});

it("paints unequal translucent sides once at corners", () => {
	const { tree } = fixture(
		"#target{width:8px;height:8px;border-width:2px 4px;border-style:solid;border-color:rgba(255,0,0,.5) blue;background:white}",
	);
	const { image, metrics } = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 16, height: 12 },
	});
	expect(pixel(image, 7, 0)).toEqual([255, 127, 127, 255]);
	expect(pixel(image, 0, 6)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 7, 6)).toEqual([255, 255, 255, 255]);
	expect(metrics.borderPixels).toBe(128);
});

it("keeps transparent borders in geometry without painting border pixels", () => {
	const { tree, rect } = fixture(
		"#target{width:8px;height:8px;border:2px solid transparent}",
	);
	expect(rect()).toMatchObject({ width: 12, height: 12 });
	expect(rasterizeDocument(tree).metrics.borderPixels).toBe(0);
});

it("paints root borders even when the root background is propagated to the canvas", () => {
	const { tree } = fixture(
		"html{border:2px solid red;background:blue}#target{height:10px}",
	);
	const { image } = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 20, height: 20 },
	});
	expect(pixel(image, 0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 5, 5)).toEqual([0, 0, 255, 255]);
});

it("places decoded image pixels inside borders and padding without network access", async () => {
	const { tree, rect } = fixture(
		"#target{display:block;padding:1px;border:2px solid red}",
		'<img id="target" src="/local.png">',
	);
	const images = documentImages(tree, {
		fetch: async (url) => {
			const body = encodePng(createRaster(2, 2, [0, 0, 255, 255]));
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
	expect(rect()).toMatchObject({ width: 8, height: 8 });
	const { image } = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 10, height: 10 },
	});
	expect(pixel(image, 0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 3, 3)).toEqual([0, 0, 255, 255]);
});

it("slices ordinary inline side borders at wraps and paints open continuation edges", () => {
	const { tree, id } = fixture(
		"main{width:20px;font-size:8px;line-height:12px}#target{border:1px solid red;color:transparent}",
		'<main><span id="target">ab cd ef</span></main>',
	);
	const context = layoutDocument(tree).contexts.find(
		(value) => value.ref === tree.reference(id("main")),
	);
	expect(context?.fragments.map((fragment) => fragment.borders)).toEqual([
		{ borderTop: 1, borderBottom: 1, borderLeft: 1, borderRight: 0 },
		{ borderTop: 1, borderBottom: 1, borderLeft: 0, borderRight: 0 },
		{ borderTop: 1, borderBottom: 1, borderLeft: 0, borderRight: 1 },
	]);
	expect(
		documentGeometry(tree)
			.getClientRects(id())
			.map((rect) => [rect.x, rect.y, rect.width, rect.height]),
	).toEqual([
		[0, 1, 13, 10],
		[0, 13, 12, 10],
		[0, 25, 13, 10],
	]);
	const { image } = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 20, height: 40 },
	});
	expect(pixel(image, 0, 5)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 0, 17)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 12, 29)).toEqual([255, 0, 0, 255]);
});

it("keeps vertical inline borders out of line-height while enlarging rectangles", () => {
	const { tree, id } = fixture(
		"main{font-size:8px;line-height:12px}#target{border-top:3px solid;border-bottom:4px solid;padding:2px}",
		'<main><span id="target">a</span><br>b</main>',
	);
	const context = layoutDocument(tree).contexts.find(
		(value) => value.ref === tree.reference(id("main")),
	);
	expect(context?.lines.map((line) => line.height)).toEqual([12, 12]);
	expect(documentGeometry(tree).getClientRects(id())[0]).toMatchObject({
		y: -3,
		height: 19,
	});
});

it("preserves borders across CSSOM edits and removes complete pending border shorthands", () => {
	const { tree, id, read } = fixture(
		"",
		'<div id="target" style="--edge:2px solid red;border:var(--edge)"></div>',
	);
	const factory = {
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
	};
	const style = new InlineStyles(tree, factory).get(id()) as {
		setProperty(name: string, value: string): void;
		removeProperty(name: string): string;
		getPropertyValue(name: string): string;
	};
	style.setProperty("width", "10px");
	expect(read("border-top-width")).toBe("2px");
	style.setProperty("--edge", "3px solid blue");
	expect(read("border-top-width")).toBe("3px");
	expect(style.removeProperty("border")).toBe("var(--edge)");
	expect(read("border-top-width")).toBe("0px");
	expect(style.getPropertyValue("width")).toBe("10px");
});

it("does no border-paint work for border-free layout objects", () => {
	let work = 0;
	const borders = {
		borderTop: 0,
		borderRight: 0,
		borderBottom: 0,
		borderLeft: 0,
		contentWidth: 100,
		contentHeight: 100,
	};
	expect(
		paintSolidBorders(
			createRaster(10, 10),
			0,
			0,
			10,
			10,
			borders,
			initialPaintStyle,
			(amount) => {
				work += amount;
			},
		),
	).toBe(0);
	expect(work).toBe(0);
});

it("retains existing capture work limits and rejects stale prepared geometry after close", () => {
	const { tree, rect } = fixture(
		"#target{width:20px;height:20px;border:2px solid red}",
	);
	expect(() => rasterizeDocument(tree, { maxWork: 1 })).toThrow("limit");
	rect();
	tree.close();
	expect(rect).toThrow();
});
