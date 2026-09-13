import { afterEach, expect, it } from "vitest";
import { resolveBorders } from "./border-box.js";
import { paintBorders } from "./border-raster.js";
import { createRoundedBox } from "./rounded-box.js";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import { directDeclaration } from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import { encodePng } from "./png.js";
import { createRaster, type RasterImage } from "./raster.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { type DocumentStyles, documentStyles } from "./styles.js";

const properties = [
	"border-top-left-radius",
	"border-top-right-radius",
	"border-bottom-right-radius",
	"border-bottom-left-radius",
] as const;
type RadiusStyle = Readonly<Record<(typeof properties)[number], string>>;
type RadiusDocumentStyles = DocumentStyles & {
	radius(id: number): RadiusStyle;
};
interface RadiusDeclaration {
	borderRadius: string;
	borderTopLeftRadius: string;
	borderTopRightRadius: string;
	borderBottomRightRadius: string;
	borderBottomLeftRadius: string;
	length: number;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
	item(index: number): string;
}
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(target, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		if (definition.indexed)
			Object.defineProperty(target, "length", {
				get: definition.indexed.length,
			});
		return target;
	},
};
const documents: DocumentTree[] = [];
const white = [255, 255, 255, 255];
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css = "", content = '<div id="target"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px;background-color:white}html,body{margin:0;padding:0}main{width:64px;font-size:8px;line-height:8px}#target{width:20px;height:20px}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/rounded-document",
	);
	documents.push(tree);
	const styles = documentStyles(tree) as RadiusDocumentStyles;
	styles.setViewport(80, 80);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, styles, id, hits: documentHitTesting(tree) };
}

function radiusValues(styles: RadiusDocumentStyles, id: number) {
	expect(typeof styles.radius).toBe("function");
	const radius = styles.radius(id);
	return properties.map((property) => radius[property]);
}

function declarations(source: string) {
	return parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 64 },
		() => {},
	);
}

function pixel(image: Readonly<RasterImage>, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.subarray(offset, offset + 4)];
}

function insideEllipse(
	horizontal: number,
	vertical: number,
	width: number,
	height: number,
) {
	return (
		((horizontal - width / 2) / (width / 2)) ** 2 +
			((vertical - height / 2) / (height / 2)) ** 2 <=
		1
	);
}

it.each([
	{ value: "3px", expected: ["3px", "3px", "3px", "3px"] },
	{ value: "2px 4px", expected: ["2px", "4px", "2px", "4px"] },
	{ value: "2px 4px 6px", expected: ["2px", "4px", "6px", "4px"] },
	{ value: "2px 4px 6px 8px", expected: ["2px", "4px", "6px", "8px"] },
	{
		value: "2px 4px 6px / 8px 10px",
		expected: ["2px 8px", "4px 10px", "6px 8px", "4px 10px"],
	},
	{
		value: "1px 2px / 3px 4px 5px 6px",
		expected: ["1px 3px", "2px 4px", "1px 5px", "2px 6px"],
	},
	{ value: "5% / 5%", expected: ["5%", "5%", "5%", "5%"] },
	...(["initial", "inherit", "unset", "revert"] as const).map((value) => ({
		value,
		expected: Array<string>(4).fill(value),
	})),
])(
	"expands radius $value identically in the parser and CSSOM",
	({ value, expected }) => {
		expect(declarations(`BORDER-RADIUS: ${value} !important`)).toEqual(
			properties.map((property, index) => ({
				property,
				value: expected[index],
				important: true,
			})),
		);
		expect(directDeclaration("border-radius", value, true)).toEqual(
			properties.map((name, index) => ({
				name,
				value: expected[index],
				important: true,
			})),
		);
	},
);

it.each(properties)(
	"accepts one or two values for %s without treating them as a shorthand",
	(property) => {
		for (const [value, expected] of [
			["4px", "4px"],
			["4px 4px", "4px"],
			["4px 25%", "4px 25%"],
		]) {
			expect(declarations(`${property}:${value}`)).toEqual([
				{ property, value: expected, important: false },
			]);
			expect(directDeclaration(property, value, false)).toEqual([
				{ name: property, value: expected, important: false },
			]);
		}
		for (const value of ["2px 3px 4px", "2px / 3px", "-1px", "auto"])
			expect(directDeclaration(property, value, false)).toEqual([]);
	},
);

it.each([
	"-1px",
	"2px -1%",
	"1px / -2px",
	"1px 2px 3px 4px 5px",
	"1px / 2px 3px 4px 5px 6px",
	"1px /",
	"/ 1px",
	"1px / 2px / 3px",
	"1px, 2px",
	"inherit 2px",
	"auto",
])(
	"rejects malformed radius %s without discarding the preceding declaration",
	(value) => {
		expect(directDeclaration("border-radius", value, false)).toEqual([]);
		expect(declarations(`border-radius:${value}`)).toEqual([]);
		const { styles, id } = fixture(
			`#target{border-radius:3px;border-radius:${value}}`,
		);
		expect(radiusValues(styles, id())).toEqual(Array(4).fill("3px"));
	},
);

it("computes font-relative and calc axes while retaining percentages", () => {
	const { tree, styles, id } = fixture(
		"#target{font-size:10px;border-radius:2em 1rem calc(1em + 2px) / 25%}",
	);
	expect(radiusValues(styles, id())).toEqual([
		"20px 25%",
		"8px 25%",
		"12px 25%",
		"8px 25%",
	]);
	tree.setAttribute(id(), "style", "font-size:12px");
	expect(radiusValues(styles, id())).toEqual([
		"24px 25%",
		"8px 25%",
		"14px 25%",
		"8px 25%",
	]);
	tree.setAttribute(id("html"), "style", "font-size:16px");
	expect(radiusValues(styles, id())[1]).toBe("16px 25%");
});

it.each(["initial", "inherit", "unset", "revert"])(
	"resolves noninherited radius and both forms of %s reset",
	(value) => {
		const { tree, styles, id } = fixture("#host{border-radius:12px / 6px}");
		expect(radiusValues(styles, id())).toEqual(Array(4).fill("0px"));
		const expected = value === "inherit" ? "12px 6px" : "0px";
		for (const property of ["border-radius", "all"]) {
			tree.setAttribute(
				id(),
				"style",
				`border-radius:3px;${property}:${value}`,
			);
			expect(radiusValues(styles, id())).toEqual(Array(4).fill(expected));
		}
	},
);

it("inherits computed lengths rather than recomputing them in the child's font", () => {
	const { styles, id } = fixture(
		"#host{font-size:10px;border-radius:1em / 25%}#target{font-size:20px;border-radius:inherit}",
	);
	expect(radiusValues(styles, id())).toEqual(Array(4).fill("10px 25%"));
});

it("cascades shorthand and longhands by specificity, order and importance", () => {
	const { tree, styles, id } = fixture(
		"#target{border-radius:2px 4px!important;border-top-left-radius:6px!important}div{border-radius:9px!important}",
	);
	tree.setAttribute(
		id(),
		"style",
		"border-radius:8px;border-bottom-left-radius:7px!important",
	);
	expect(radiusValues(styles, id())).toEqual(["6px", "4px", "2px", "7px"]);
	tree.setTextContent(
		id("style"),
		"#target{border-radius:3px;border-top-right-radius:5px}",
	);
	tree.removeAttribute(id(), "style");
	expect(radiusValues(styles, id())).toEqual(["3px", "5px", "3px", "3px"]);
});

it("substitutes variables across both axes and resets invalid computed values", () => {
	const { tree, styles, id } = fixture(
		"#target{border-radius:9px;border-radius:var(--radius, 2px 4px / 6px)}",
	);
	expect(radiusValues(styles, id())).toEqual([
		"2px 6px",
		"4px 6px",
		"2px 6px",
		"4px 6px",
	]);
	tree.setAttribute(id("#host"), "style", "--radius:25% / 3px 5px");
	expect(radiusValues(styles, id())).toEqual([
		"25% 3px",
		"25% 5px",
		"25% 3px",
		"25% 5px",
	]);
	tree.setAttribute(id("#host"), "style", "--radius:-2px");
	expect(radiusValues(styles, id())).toEqual(Array(4).fill("0px"));
	tree.setAttribute(id("#host"), "style", "--radius:var(--radius)");
	expect(radiusValues(styles, id())).toEqual([
		"2px 6px",
		"4px 6px",
		"2px 6px",
		"4px 6px",
	]);
});

it.each(["1px solid blue", "none", "initial", "unset", "inherit"])(
	"does not let border:%s reset independent corner radii",
	(border) => {
		const { styles, id } = fixture(
			`#target{border-radius:2px 4px / 6px 8px;border:${border}}`,
		);
		expect(radiusValues(styles, id())).toEqual([
			"2px 6px",
			"4px 8px",
			"2px 6px",
			"4px 8px",
		]);
	},
);

it("exposes live inline and read-only computed radius CSSOM without layout", () => {
	const { tree, styles, id } = fixture();
	const target = id();
	const inline = new InlineStyles(tree, factory).get(
		target,
	) as RadiusDeclaration;
	const computed = new ComputedStyles(tree, factory).get(
		target,
	) as RadiusDeclaration;
	inline.setProperty("BORDER-RADIUS", "2px 4px / 6px 8px", "important");
	const names = Array.from({ length: inline.length }, (_value, index) =>
		inline.item(index),
	);
	for (const property of properties) {
		expect(names).toContain(property);
		expect(computedStyleProperties).toContain(property);
		expect(inline.getPropertyPriority(property)).toBe("important");
		expect(computed.getPropertyValue(property)).toBe(
			styles.radius(target)[property],
		);
		expect(resolvedStyleValue(tree, target, property)).toBe(
			styles.radius(target)[property],
		);
	}
	expect(inline.borderRadius).toBe("2px 4px / 6px 8px");
	expect(computed.borderRadius).toBe("2px 4px / 6px 8px");
	inline.borderTopLeftRadius = "10px 12px";
	expect(computed.borderTopLeftRadius).toBe("10px 12px");
	inline.borderTopLeftRadius = "-1px";
	expect(computed.borderTopLeftRadius).toBe("10px 12px");
	expect(inline.removeProperty("border-top-left-radius")).toBe("10px 12px");
	expect(computed.borderTopLeftRadius).toBe("0px");
	inline.borderRadius = "5px";
	expect(inline.borderRadius).toBe("5px");
	expect(computed.borderRadius).toBe("5px");
	expect(inline.removeProperty("border-radius")).toBe("5px");
	expect(radiusValues(styles, target)).toEqual(Array(4).fill("0px"));
	expect(() => computed.setProperty("border-radius", "7px")).toThrow();
	expect(documentGeometry(tree).metrics().builds).toBe(0);
});

it.each([
	{ width: 8, height: 8, radius: "50%" },
	{ width: 8, height: 8, radius: "999px" },
	{ width: 16, height: 8, radius: "50%" },
	{ width: 16, height: 8, radius: "8px / 4px" },
])(
	"shares pixel-center ellipse coverage with native hits for $width x $height, $radius",
	({ width, height, radius }) => {
		const { tree, hits, id } = fixture(
			`#target{width:${width}px;height:${height}px;background-color:red;border-radius:${radius}}`,
		);
		const { image } = rasterizeDocument(tree);
		for (let row = 0; row < height; row++) {
			for (let column = 0; column < width; column++) {
				const inside = insideEllipse(column + 0.5, row + 0.5, width, height);
				expect(pixel(image, column, row)).toEqual(inside ? red : white);
				expect(
					hits.elementsFromPoint(column + 0.5, row + 0.5).includes(id()),
				).toBe(inside);
			}
		}
		expect(pixel(image, width, 0)).toEqual(white);
		expect(hits.elementFromPoint(width, height / 2)).not.toBe(id());
	},
);

it("resolves percentages against the padded border box rather than its containing block", () => {
	const { tree, id } = fixture(
		"#target{width:12px;height:4px;padding:2px;border:2px solid red;background-color:red;border-radius:50%}",
	);
	expect(documentGeometry(tree).getBoundingClientRect(id())).toMatchObject({
		x: 0,
		y: 0,
		width: 20,
		height: 12,
	});
	const { image } = rasterizeDocument(tree);
	for (let row = 0; row < 12; row++)
		for (let column = 0; column < 20; column++)
			expect(pixel(image, column, row)).toEqual(
				insideEllipse(column + 0.5, row + 0.5, 20, 12) ? red : white,
			);
});

it("keeps asymmetric physical corners independent", () => {
	const { tree, hits, id } = fixture(
		"#target{width:16px;height:16px;background-color:red;border-radius:8px 0 4px 0}",
	);
	const { image } = rasterizeDocument(tree);
	for (const [column, row, inside] of [
		[0, 0, false],
		[15, 0, true],
		[15, 15, false],
		[0, 15, true],
	] as const) {
		expect(pixel(image, column, row)).toEqual(inside ? red : white);
		expect(hits.elementsFromPoint(column + 0.5, row + 0.5).includes(id())).toBe(
			inside,
		);
	}
});

it("paints a border ring between the outer and inset inner curves", () => {
	const { tree } = fixture(
		"#target{box-sizing:border-box;width:20px;height:20px;border:4px solid blue;background-color:red;border-radius:10px}",
	);
	const { image } = rasterizeDocument(tree);
	for (let row = 0; row < 20; row++) {
		for (let column = 0; column < 20; column++) {
			const distance = (column + 0.5 - 10) ** 2 + (row + 0.5 - 10) ** 2;
			expect(pixel(image, column, row)).toEqual(
				distance > 100 ? white : distance > 36 ? blue : red,
			);
		}
	}
});

it("does not let a rounded owner's own glyph regions restore cut-corner hits", () => {
	const { tree, hits, id } = fixture(
		"#target{border-radius:50%;color:transparent}",
		'<div id="target">AAA</div>',
	);
	const glyphs = layoutDocument(tree).text.contexts.flatMap(
		(context) => context.glyphs,
	);
	expect(glyphs).toHaveLength(3);
	expect(glyphs[0]).toMatchObject({ x: 0, y: 0 });
	expect(hits.elementsFromPoint(0.5, 0.5)).not.toContain(id());
	expect(hits.elementFromPoint(10, 3)).toBe(id());
	expect(hits.elementFromPoint(10, 0.5)).toBe(id());
	expect(hits.elementFromPoint(20, 10)).not.toBe(id());
});

it("leaves ordinary descendants visible and hittable outside the owner's curve and box", () => {
	const { tree, hits, id } = fixture(
		"#target{border-radius:50%;background-color:red}#corner,#overflow{width:4px;height:4px;background-color:blue}#overflow{margin-left:24px}",
		'<div id="target"><div id="corner"></div><div id="overflow"></div></div>',
	);
	const { image } = rasterizeDocument(tree);
	expect(pixel(image, 0, 0)).toEqual(blue);
	expect(pixel(image, 24, 4)).toEqual(blue);
	expect(hits.elementFromPoint(0.5, 0.5)).toBe(id("#corner"));
	expect(hits.elementFromPoint(24.5, 4.5)).toBe(id("#overflow"));
	expect(hits.elementsFromPoint(0.5, 0.5)).not.toContain(id());
});

it.each(["block", "inline"])(
	"clips %s decoded replaced pixels to the inset content curve without clipping its padding background",
	async (display) => {
		const { tree, hits, id } = fixture(
			`#target{display:${display};width:12px;height:12px;padding:2px;border:2px solid blue;background-color:red;border-radius:10px}`,
			'<img id="target" src="/pixels.png">',
		);
		const body = encodePng(createRaster(2, 2, [0, 255, 0, 255]));
		const images = documentImages(tree, {
			fetch: async (url) => ({
				url,
				status: 200,
				headers: { "content-type": ["image/png"] },
				body,
				encodedBytes: body.length,
				redirects: [],
				elapsedMs: 0,
			}),
		});
		await images.settle();
		expect(images.get(id())).toMatchObject({
			state: "complete",
			naturalWidth: 2,
			naturalHeight: 2,
		});
		const { image } = rasterizeDocument(tree);
		expect(pixel(image, 0, 0)).toEqual(white);
		expect(pixel(image, 10, 0)).toEqual(blue);
		expect(pixel(image, 10, 2)).toEqual(red);
		expect(pixel(image, 4, 4)).toEqual(red);
		expect(pixel(image, 6, 6)).toEqual([0, 255, 0, 255]);
		expect(pixel(image, 10, 4)).toEqual([0, 255, 0, 255]);
		expect(hits.elementsFromPoint(0.5, 0.5)).not.toContain(id());
		expect(hits.elementFromPoint(10, 2)).toBe(id());
	},
);

it.each(["block", "inline"])(
	"clips %s SVG paint and shape hits to the rounded replaced content curve",
	(display) => {
		const { tree, hits, id } = fixture(
			`#target{display:${display};width:12px;height:12px;padding:2px;border:2px solid blue;background-color:red;border-radius:10px}`,
			'<svg id="target" viewBox="0 0 12 12"><rect id="shape" width="12" height="12" fill="green"/></svg>',
		);
		const bounds = documentGeometry(tree).getBoundingClientRect(id());
		const { image } = rasterizeDocument(tree);
		expect(pixel(image, bounds.x, bounds.y)).toEqual(white);
		expect(pixel(image, bounds.x + 4, bounds.y + 4)).toEqual(red);
		expect(pixel(image, bounds.x + 10, bounds.y + 10)).toEqual([
			0, 128, 0, 255,
		]);
		expect(
			hits.elementsFromPoint(bounds.x + 4.5, bounds.y + 4.5),
		).not.toContain(id("#shape"));
		expect(hits.elementFromPoint(bounds.x + 10, bounds.y + 10)).toBe(
			id("#shape"),
		);
	},
);

it("invalidates cached radius and hit regions after style, class and dimension changes", () => {
	const { tree, styles, hits, id } = fixture(
		"#target{width:40px;border-radius:50%;background-color:red}#target.square{border-radius:0}",
	);
	const target = id();
	expect(hits.elementsFromPoint(5.5, 2.5)).not.toContain(target);
	const before = hits.metrics();
	const cascadeBuilds = styles.metrics().cascadeBuilds;
	for (let index = 0; index < 8; index++) {
		expect(radiusValues(styles, target)).toEqual(Array(4).fill("50%"));
		expect(hits.elementsFromPoint(5.5, 2.5)).not.toContain(target);
	}
	expect(hits.metrics().builds).toBe(before.builds);
	expect(styles.metrics().cascadeBuilds).toBe(cascadeBuilds);
	tree.setAttribute(target, "style", "width:20px");
	expect(hits.elementFromPoint(5.5, 2.5)).toBe(target);
	expect(pixel(rasterizeDocument(tree).image, 5, 2)).toEqual(red);
	expect(hits.metrics().builds).toBe(before.builds + 1);
	tree.setAttribute(target, "class", "square");
	expect(hits.elementFromPoint(0.5, 0.5)).toBe(target);
	expect(radiusValues(styles, target)).toEqual(Array(4).fill("0px"));
	tree.removeAttribute(target, "class");
	expect(hits.elementsFromPoint(0.5, 0.5)).not.toContain(target);
	tree.setAttribute(target, "style", "width:20px;border-radius:0");
	expect(pixel(rasterizeDocument(tree).image, 0, 0)).toEqual(red);
	expect(hits.elementFromPoint(0.5, 0.5)).toBe(target);
});

it("recomputes used percentage radii when viewport-relative dimensions change", () => {
	const { tree, styles, hits, id } = fixture(
		"#target{width:50vw;border-radius:50%;background-color:red}",
	);
	expect(pixel(rasterizeDocument(tree).image, 5, 2)).toEqual(white);
	expect(hits.elementsFromPoint(5.5, 2.5)).not.toContain(id());
	styles.setViewport(40, 80);
	expect(radiusValues(styles, id())).toEqual(Array(4).fill("50%"));
	expect(pixel(rasterizeDocument(tree).image, 5, 2)).toEqual(red);
	expect(hits.elementFromPoint(5.5, 2.5)).toBe(id());
});

it("refreshes explicit radius inheritance after reparenting and rejects detached nodes", () => {
	const { tree, styles, id } = fixture(
		"#first{border-radius:3px}#second{border-radius:7px / 9px}#target{border-radius:inherit}",
		'<div id="first"><div id="target"></div></div><div id="second"></div>',
	);
	const target = id();
	expect(radiusValues(styles, target)).toEqual(Array(4).fill("3px"));
	tree.append(id("#second"), target);
	expect(radiusValues(styles, target)).toEqual(Array(4).fill("7px 9px"));
	tree.remove(target);
	expect(() => styles.radius(target)).toThrow(
		expect.objectContaining({ code: "not-found" }),
	);
	expect(resolvedStyleValue(tree, target, properties[0])).toBe("");
	tree.append(id("#first"), target);
	expect(radiusValues(styles, target)).toEqual(Array(4).fill("3px"));
});

it("keeps generated radii independent unless explicitly inherited and invalidates cached metadata", () => {
	const { tree, styles, id } = fixture(
		'#target{border-radius:8px / 4px}#target::before{content:"B"}#target::after{content:"A";border-radius:inherit}',
	);
	const before = styles.generatedContent(id(), "before");
	const after = styles.generatedContent(id(), "after");
	expect(before).toBeDefined();
	expect(after).toBeDefined();
	expect(before?.radius).toBeUndefined();
	expect(after?.radius).toEqual(styles.radius(id()));
	expect(styles.generatedContent(id(), "after")).toBe(after);
	tree.setAttribute(id(), "style", "border-radius:6px");
	expect(styles.generatedContent(id(), "after")?.radius).toEqual(
		styles.radius(id()),
	);
	expect(styles.generatedContent(id(), "after")).not.toBe(after);
	expect(styles.generatedContent(id(), "before")?.radius).toBeUndefined();
});

it("paints independent rounded before and square after generated boxes", () => {
	const { tree } = fixture(
		'#target::before,#target::after{content:"";display:block;width:8px;height:8px}#target::before{background-color:red;border-radius:50%}#target::after{background-color:blue}',
	);
	const { image } = rasterizeDocument(tree);
	expect(pixel(image, 0, 0)).toEqual(white);
	expect(pixel(image, 4, 0)).toEqual(red);
	expect(pixel(image, 0, 8)).toEqual(blue);
	expect(pixel(image, 7, 15)).toEqual(blue);
});

it("slices equal-height LTR inline radius over the concatenated width, not each fragment", () => {
	const { tree, hits, id } = fixture(
		"main{width:18px;line-height:12px}#target{background-color:red;color:transparent;border-radius:50%}",
		'<span id="target">ab cd ef</span>',
	);
	const fragments = documentGeometry(tree).getClientRects(id());
	expect(fragments).toHaveLength(3);
	expect(new Set(fragments.map((fragment) => fragment.height)).size).toBe(1);
	const width = fragments.reduce(
		(total, fragment) => total + fragment.width,
		0,
	);
	const height = fragments[0].height;
	const { image } = rasterizeDocument(tree);
	let offset = 0;
	for (const fragment of fragments) {
		for (let row = 0; row < height; row++) {
			for (let column = 0; column < fragment.width; column++) {
				const inside = insideEllipse(
					offset + column + 0.5,
					row + 0.5,
					width,
					height,
				);
				expect(pixel(image, fragment.x + column, fragment.y + row)).toEqual(
					inside ? red : white,
				);
				expect(
					hits
						.elementsFromPoint(
							fragment.x + column + 0.5,
							fragment.y + row + 0.5,
						)
						.includes(id()),
				).toBe(inside);
			}
		}
		offset += fragment.width;
	}
});

it("keeps the unbroken dashed-border phase across rounded inline slices", () => {
	const { tree, styles, id } = fixture(
		"main{width:18px;line-height:14px}#target{border:1px dashed blue;border-radius:4px;color:transparent}",
		'<span id="target">ab cd ef</span>',
	);
	const fragments = documentGeometry(tree).getClientRects(id());
	expect(fragments.length).toBeGreaterThan(1);
	const width = fragments.reduce(
		(total, fragment) => total + fragment.width,
		0,
	);
	const expected = createRaster(80, 80, [255, 255, 255, 255]);
	const box = styles.box(id());
	const paint = styles.paint(id());
	let offset = 0;
	for (const fragment of fragments) {
		const corner = { horizontal: 4, vertical: 4 };
		const outer = createRoundedBox(
			fragment.x - offset,
			fragment.y,
			width,
			fragment.height,
			[corner, corner, corner, corner],
		);
		paintBorders(
			expected,
			outer.x,
			outer.y,
			outer.width,
			outer.height,
			resolveBorders(box),
			paint,
			box,
			() => {},
			0,
			undefined,
			outer,
			fragment,
		);
		offset += fragment.width;
	}
	expect(rasterizeDocument(tree).image.pixels).toEqual(expected.pixels);
});

it.each(["flex", "grid", "inline-block"])(
	"retains radius through %s display decomposition",
	(display) => {
		const { tree, hits, id } = fixture(
			`#target{display:${display};border-radius:50%;background-color:red}`,
		);
		expect(pixel(rasterizeDocument(tree).image, 0, 0)).toEqual(white);
		expect(pixel(rasterizeDocument(tree).image, 10, 10)).toEqual(red);
		expect(hits.elementsFromPoint(0.5, 0.5)).not.toContain(id());
		expect(hits.elementFromPoint(10, 10)).toBe(id());
	},
);

it.each(["separate", "collapse"])(
	"%s table borders retain the intended radius policy",
	(collapse) => {
		const { tree, styles, hits, id } = fixture(
			`#target{width:16px;height:16px;border-collapse:${collapse};border-spacing:0;background-color:red;border-radius:8px}td{padding:0;height:16px}`,
			'<table id="target"><tr><td></td></tr></table>',
		);
		expect(radiusValues(styles, id())).toEqual(Array(4).fill("8px"));
		const bounds = documentGeometry(tree).getBoundingClientRect(id());
		expect(bounds).toMatchObject({ width: 16, height: 16 });
		const { image } = rasterizeDocument(tree);
		expect(pixel(image, bounds.x, bounds.y)).toEqual(
			collapse === "collapse" ? red : white,
		);
		expect(
			hits.elementsFromPoint(bounds.x + 0.5, bounds.y + 0.5).includes(id()),
		).toBe(collapse === "collapse");
		expect(pixel(image, bounds.x + 8, bounds.y + 8)).toEqual(red);
	},
);

it("reports radius on a fieldset with a rendered legend as unsupported", () => {
	const { tree } = fixture(
		"#target{border:1px solid blue;border-radius:4px}",
		'<fieldset id="target"><legend>Title</legend></fieldset>',
	);
	expect(
		buildFormattingTree(tree).issues["rounded-fieldset-legend-not-supported"],
	).toBeGreaterThan(0);
});

it("releases retained rounded style and hit readers on document close", () => {
	const { tree, styles, hits, id } = fixture(
		'#target{border-radius:50%}#target::before{content:"B";border-radius:inherit}',
	);
	const target = id();
	const computedStyles = new ComputedStyles(tree, factory);
	const computed = computedStyles.get(target) as RadiusDeclaration;
	expect(computed.borderTopLeftRadius).toBe("50%");
	expect(styles.generatedContent(target, "before")).toBeDefined();
	expect(hits.elementFromPoint(10, 10)).toBe(target);
	tree.close();
	tree.close();
	for (const read of [
		() => styles.radius(target),
		() => computed.borderTopLeftRadius,
		() => styles.generatedContent(target, "before"),
		() => hits.elementFromPoint(10, 10),
	])
		expect(read).toThrow(expect.objectContaining({ code: "closed" }));
	expect(computedStyles.metrics().closed).toBe(true);
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
});
