import { expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { cssSupportsDeclaration } from "./css-parser.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { decodeImage } from "./image-decoder.js";
import { InlineStyles } from "./inline-styles.js";
import type { RasterImage } from "./raster.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles, type DocumentStyles } from "./styles.js";
import { SvgLinearGradient } from "./svg-linear-gradient.js";
import { rasterizeSvgScene } from "./svg-projection.js";
import { documentSvgScene } from "./svg-scene.js";

interface InlineStyle {
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

interface Fixture {
	tree: DocumentTree;
	root: number;
	target: number;
	parent: number;
	styles: DocumentStyles;
	value(name: string): string;
	style(id?: number): InlineStyle;
	scene(): ReturnType<typeof documentSvgScene>;
}

interface FixtureOptions {
	content?: string;
	rootAttributes?: string;
	allowIssues?: boolean;
}

const noCharge = () => {};
const line = `<path id="target" d="M1 4H7" fill="none"/>`;
const rectangle = `<rect id="target" x="2" y="2" width="4" height="4"/>`;
const gradient = `<defs><linearGradient id="PaintServer" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="8" y2="0"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs>`;
const properties = [
	"stroke",
	"stroke-width",
	"stroke-opacity",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-miterlimit",
] as const;
const inherited =
	"stroke:red;stroke-width:2;stroke-opacity:25%;stroke-linecap:square;stroke-linejoin:bevel;stroke-miterlimit:.5";
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

function withFixture(
	css: string,
	inspect: (fixture: Fixture) => void,
	options: FixtureOptions = {},
) {
	const attributes =
		options.rootAttributes ?? `width="8" height="8" viewBox="0 0 8 8"`;
	const tree = parseHtmlDocument(
		`<style>${css}</style><main><svg ${attributes}><g id="parent">${options.content ?? line}</g></svg></main>`,
		"https://fixture.invalid/svg-stroke-cascade",
	);
	let queries: DocumentQueries | undefined;
	let inline: InlineStyles | undefined;
	try {
		queries = new DocumentQueries(tree);
		const root = queries.querySelector("svg");
		const target = queries.querySelector("#target");
		const parent = queries.querySelector("#parent");
		if (root === null || target === null || parent === null)
			throw new Error("Missing stroke cascade fixture");
		const styles = documentStyles(tree);
		const owner = new InlineStyles(tree, factory);
		inline = owner;
		inspect({
			tree,
			root,
			target,
			parent,
			styles,
			value: (name) => resolvedStyleValue(tree, target, name),
			style: (id = target) => owner.get(id) as InlineStyle,
			scene: () => documentSvgScene(tree, root, noCharge),
		});
		if (!options.allowIssues) expect(styles.metrics().issues).toEqual({});
	} finally {
		inline?.close();
		queries?.close();
		tree.close();
	}
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("exposes initial stroke values and omits a none stroke from the scene", () => {
	withFixture("", ({ value, scene }) => {
		expect(properties.map(value)).toEqual([
			"none",
			"1px",
			"1",
			"butt",
			"miter",
			"4",
		]);
		expect(scene().shapes[0].stroke).toBeUndefined();
	});
});

it("uses default stroke geometry when only stroke paint is specified", () => {
	withFixture("path{stroke:red}", ({ scene }) => {
		expect(scene().shapes[0].stroke).toEqual({
			paint: [255, 0, 0, 255],
			width: 1,
			lineCap: "butt",
			lineJoin: "miter",
			miterLimit: 4,
		});
	});
});

it("inherits every stroke component without multiplying opacity through groups", () => {
	withFixture(
		`#parent{${inherited}}`,
		({ value, scene }) => {
			expect(properties.map(value)).toEqual([
				"rgb(255, 0, 0)",
				"2px",
				"0.25",
				"square",
				"bevel",
				"0.5",
			]);
			expect(scene().shapes[0].stroke).toEqual({
				paint: [255, 0, 0, 64],
				width: 2,
				lineCap: "square",
				lineJoin: "bevel",
				miterLimit: 0.5,
			});
		},
		{ content: `<g><g>${line}</g></g>` },
	);
});

it.each(["inherit", "unset", "revert"])(
	"restores inherited stroke components with %s",
	(keyword) => {
		const declarations = properties
			.map((property) => `${property}:${keyword}`)
			.join(";");
		withFixture(
			`#parent{${inherited}}#target{${declarations}}`,
			({ scene }) => {
				expect(scene().shapes[0].stroke).toEqual({
					paint: [255, 0, 0, 64],
					width: 2,
					lineCap: "square",
					lineJoin: "bevel",
					miterLimit: 0.5,
				});
			},
		);
	},
);

it.each([
	properties.map((property) => `${property}:initial`).join(";"),
	"all:initial",
])("resets inherited stroke components with %s", (declarations) => {
	withFixture(
		`#parent{${inherited}}#target{${declarations}}`,
		({ value, scene }) => {
			expect(properties.map(value)).toEqual([
				"none",
				"1px",
				"1",
				"butt",
				"miter",
				"4",
			]);
			expect(scene().shapes[0].stroke).toBeUndefined();
		},
	);
});

it.each([
	["path{stroke:blue;stroke-width:2}", "", [0, 0, 255, 255], 2],
	[
		"#target{stroke:green;stroke-width:3}",
		"stroke:blue;stroke-width:2",
		[0, 0, 255, 255],
		2,
	],
	[
		"path{stroke:green!important;stroke-width:3!important}",
		"stroke:blue;stroke-width:2",
		[0, 128, 0, 255],
		3,
	],
	[
		"#target{stroke:green!important;stroke-width:3!important}",
		"stroke:blue!important;stroke-width:2!important",
		[0, 0, 255, 255],
		2,
	],
] as const)(
	"cascades stroke paint and width for %s over inline %s",
	(css, inline, paint, width) => {
		withFixture(
			css,
			({ scene }) => {
				expect(scene().shapes[0].stroke).toMatchObject({ paint, width });
			},
			{
				content: `<path id="target" d="M1 4H7" fill="none" stroke="red" stroke-width="1" style="${inline}"/>`,
			},
		);
	},
);

it("applies author opacity and cap/join declarations above presentation attributes", () => {
	withFixture(
		"path{stroke:red;stroke-opacity:50%;stroke-linecap:round;stroke-linejoin:bevel;stroke-miterlimit:.5}",
		({ scene }) => {
			expect(scene().shapes[0].stroke).toMatchObject({
				paint: [255, 0, 0, 128],
				lineCap: "round",
				lineJoin: "bevel",
				miterLimit: 0.5,
			});
		},
		{
			content: `<path id="target" d="M1 4H7" fill="none" stroke-opacity="1" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="4"/>`,
		},
	);
});

it("resolves inherited stroke currentColor using the painting element color", () => {
	withFixture(
		"#parent{color:red;stroke:currentColor;stroke-opacity:.5}#target{color:blue}",
		({ value, scene }) => {
			expect(value("stroke")).toBe("rgb(0, 0, 255)");
			expect(scene().shapes[0].stroke?.paint).toEqual([0, 0, 255, 128]);
		},
	);
});

it.each([
	["2", 2],
	["2px", 2],
	["1e1px", 10],
	[".5in", 48],
	["2.54cm", 96],
	["25.4mm", 96],
	["101.6q", 96],
	["72pt", 96],
	["6pc", 96],
] as const)(
	"computes stroke-width %s as an absolute pixel length",
	(width, expected) => {
		withFixture(
			`path{stroke:red;stroke-width:${width}}`,
			({ value, scene }) => {
				expect(value("stroke-width").endsWith("px")).toBe(true);
				expect(Number.parseFloat(value("stroke-width"))).toBeCloseTo(
					expected,
					10,
				);
				expect(scene().shapes[0].stroke?.width).toBeCloseTo(expected, 10);
			},
		);
	},
);

it.each([
	`width="300" height="400" viewBox="0 0 30 40"`,
	`width="30" height="40"`,
	`style="width:30px;height:40px"`,
	"",
	`width="100%" height="100%"`,
])(
	"preserves percentage stroke metadata before projection for %s",
	(rootAttributes) => {
		withFixture(
			"path{stroke:red;stroke-width:10%}",
			({ value, scene }) => {
				expect(value("stroke-width")).toBe("10%");
				expect(scene().shapes[0].stroke).toMatchObject({
					width: 10,
					widthPercentage: true,
				});
			},
			{ rootAttributes },
		);
	},
);

it("resolves percentage strokes again when the supplied used viewport changes", () => {
	withFixture(
		"path{stroke:red;stroke-width:10%}",
		({ scene }) => {
			const result = scene();
			const small = rasterizeSvgScene(result, 20, 20, noCharge);
			const large = rasterizeSvgScene(result, 40, 40, noCharge);
			expect(pixel(small, 10, 8)).toEqual([0, 0, 0, 0]);
			expect(pixel(large, 10, 8)).toEqual([255, 0, 0, 255]);
			expect(pixel(small, 10, 9)).toEqual([255, 0, 0, 255]);
			expect(result.shapes[0].stroke).toMatchObject({
				width: 10,
				widthPercentage: true,
			});
		},
		{
			rootAttributes: `width="100" height="100"`,
			content: `<path id="target" d="M2 10H18" fill="none"/>`,
		},
	);
});

it("keeps the percentage basis in viewBox units when projection size changes", () => {
	withFixture("path{stroke:red;stroke-width:25%}", ({ scene }) => {
		const result = scene();
		const small = rasterizeSvgScene(result, 8, 8, noCharge);
		const large = rasterizeSvgScene(result, 16, 16, noCharge);
		expect(pixel(small, 3, 2)).toEqual([0, 0, 0, 0]);
		expect(pixel(small, 3, 3)).toEqual([255, 0, 0, 255]);
		expect(pixel(large, 6, 5)).toEqual([0, 0, 0, 0]);
		expect(pixel(large, 6, 7)).toEqual([255, 0, 0, 255]);
		expect(result.shapes[0].stroke).toMatchObject({
			width: 25,
			widthPercentage: true,
		});
	});
});

it.each([
	["max-width:50px;max-height:50px", 50, 25, 21, 25, 24],
	["box-sizing:border-box;border:25px solid blue", 100, 50, 46, 50, 49],
] as const)(
	"uses the actual SVG content viewport after %s",
	(sizing, outerSize, outsideColumn, outsideRow, insideColumn, insideRow) => {
		withFixture(
			`html,body{margin:0;background:white}svg{display:block;${sizing}}path{stroke:red;stroke-width:10%}`,
			({ tree, root, scene, styles }) => {
				styles.setViewport(200, 200);
				expect(buildFormattingTree(tree).issues).toEqual({});
				expect(
					documentGeometry(tree).getBoundingClientRect(root),
				).toMatchObject({
					x: 0,
					y: 0,
					width: outerSize,
					height: outerSize,
				});
				const image = rasterizeDocument(tree, {
					clip: { x: 0, y: 0, width: 100, height: 100 },
				}).image;
				expect(pixel(image, outsideColumn, outsideRow)).toEqual([
					255, 255, 255, 255,
				]);
				expect(pixel(image, insideColumn, insideRow)).toEqual([255, 0, 0, 255]);
				expect(scene().shapes[0].stroke).toMatchObject({
					width: 10,
					widthPercentage: true,
				});
			},
			{
				rootAttributes: `width="100" height="100"`,
				content: `<path id="target" d="M10 25H40" fill="none"/>`,
			},
		);
	},
);

it.each([
	["-1", 0, 0],
	["0", 0, 0],
	["25%", 0.25, 64],
	["5e-1", 0.5, 128],
	["150%", 1, 255],
	["2", 1, 255],
] as const)(
	"clamps computed and scene stroke-opacity %s",
	(opacity, computed, alpha) => {
		withFixture(
			`path{stroke:red;stroke-opacity:${opacity}}`,
			({ value, scene }) => {
				expect(value("stroke-opacity")).toBe(String(computed));
				expect(scene().shapes[0].stroke?.paint).toEqual([255, 0, 0, alpha]);
			},
		);
	},
);

it("multiplies stroke color alpha by inherited stroke-opacity only once", () => {
	withFixture(
		"#parent{stroke:rgba(255,0,0,.5);stroke-opacity:50%;stroke-width:2}",
		({ scene }) => {
			const result = scene();
			expect(result.shapes[0].stroke?.paint).toEqual([255, 0, 0, 64]);
			expect(pixel(rasterizeSvgScene(result, 8, 8, noCharge), 3, 3)).toEqual([
				255, 0, 0, 64,
			]);
		},
		{ content: `<g><g>${line}</g></g>` },
	);
});

it.each([0, 0.5, 1, 4, 10])(
	"accepts nonnegative stroke-miterlimit %s",
	(limit) => {
		withFixture(
			`path{stroke:red;stroke-miterlimit:${limit}}`,
			({ value, scene }) => {
				expect(value("stroke-miterlimit")).toBe(String(limit));
				expect(scene().shapes[0].stroke?.miterLimit).toBe(limit);
			},
		);
	},
);

it.each(["butt", "round", "square"] as const)(
	"cascades supported stroke-linecap %s",
	(cap) => {
		withFixture(
			`path{stroke:red;stroke-linecap:${cap}}`,
			({ value, scene }) => {
				expect(value("stroke-linecap")).toBe(cap);
				expect(scene().shapes[0].stroke?.lineCap).toBe(cap);
			},
		);
	},
);

it.each(["miter", "round", "bevel"] as const)(
	"cascades supported stroke-linejoin %s",
	(join) => {
		withFixture(
			`path{stroke:red;stroke-linejoin:${join}}`,
			({ value, scene }) => {
				expect(value("stroke-linejoin")).toBe(join);
				expect(scene().shapes[0].stroke?.lineJoin).toBe(join);
			},
		);
	},
);

it.each([
	["url(#Missing)", undefined],
	["url(#Missing) none", undefined],
	["url(#Missing) blue", [0, 0, 255, 255]],
	["url(#Missing) currentColor", [0, 128, 0, 255]],
] as const)(
	"uses fallback or no stroke for unresolved paint %s",
	(stroke, paint) => {
		withFixture(`path{color:green;stroke:${stroke}}`, ({ scene }) => {
			const result = scene().shapes[0].stroke;
			if (paint === undefined) expect(result).toBeUndefined();
			else expect(result?.paint).toEqual(paint);
		});
	},
);

it("uses stroke fallback when a local ID does not identify a paint server", () => {
	withFixture(
		"path{stroke:url(#NotPaint) blue}",
		({ scene }) => {
			expect(scene().shapes[0].stroke?.paint).toEqual([0, 0, 255, 255]);
		},
		{ content: `<g id="NotPaint"/>${line}` },
	);
});

it.each(["radialGradient", "pattern"])(
	"does not hide a valid unsupported %s stroke server behind fallback",
	(tag) => {
		withFixture(
			"path{stroke:url(#Paint) blue}",
			({ scene }) => {
				expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
			},
			{ content: `<defs><${tag} id="Paint"/></defs>${line}` },
		);
	},
);

it.each(["author", "inline", "variable"])(
	"preserves a case-sensitive gradient stroke through %s declarations",
	(route) => {
		const declarations = `stroke:URL("#PaintServer") red;stroke-width:2;stroke-opacity:50%`;
		const css =
			route === "author"
				? `path{${declarations}}`
				: route === "variable"
					? `#parent{--Paint:URL("#PaintServer") red}path{stroke:var(--Paint);stroke-width:2;stroke-opacity:50%}`
					: "";
		const target =
			route === "inline"
				? `<path id="target" d="M1 4H7" fill="none" style="${declarations.replaceAll('"', "&quot;")}"/>`
				: line;
		withFixture(
			css,
			({ value, scene }) => {
				expect(value("stroke")).toBe(`url("#PaintServer") rgb(255, 0, 0)`);
				const result = scene();
				expect(result.shapes[0].stroke?.paint).toBeInstanceOf(
					SvgLinearGradient,
				);
				expect(pixel(rasterizeSvgScene(result, 8, 8, noCharge), 3, 3)).toEqual([
					143, 0, 112, 128,
				]);
			},
			{ content: gradient + target },
		);
	},
);

it("does not match a gradient ID with different case", () => {
	withFixture(
		"path{stroke:url(#paintserver) blue}",
		({ scene }) => {
			expect(scene().shapes[0].stroke?.paint).toEqual([0, 0, 255, 255]);
		},
		{ content: gradient + line },
	);
});

it("invalidates stroke caches after CSSOM changes and removal without mutating old scenes", () => {
	withFixture(
		"path{stroke:red!important;stroke-width:2}",
		({ tree, target, value, style, scene, styles }) => {
			const before = scene();
			const cached = styles.paint(target);
			const declaration = style();
			const revision = tree.revision;
			for (const [name, next] of [
				["stroke", "blue"],
				["stroke-width", "4"],
				["stroke-opacity", "50%"],
				["stroke-linecap", "square"],
				["stroke-linejoin", "bevel"],
				["stroke-miterlimit", ".5"],
			])
				declaration.setProperty(name, next, "important");
			expect(tree.revision).toBeGreaterThan(revision);
			expect(declaration.getPropertyValue("stroke")).toBe("blue");
			expect(declaration.getPropertyPriority("stroke")).toBe("important");
			expect(value("stroke-width")).toBe("4px");
			expect(styles.paint(target)).not.toBe(cached);
			const after = scene();
			expect(after.shapes[0].stroke).toEqual({
				paint: [0, 0, 255, 128],
				width: 4,
				lineCap: "square",
				lineJoin: "bevel",
				miterLimit: 0.5,
			});
			expect(Object.isFrozen(after.shapes[0].stroke)).toBe(true);
			expect(Object.isFrozen(after.shapes[0].stroke?.paint)).toBe(true);
			expect(before.shapes[0].stroke).toMatchObject({
				paint: [255, 0, 0, 255],
				width: 2,
			});
			for (const property of properties) declaration.removeProperty(property);
			expect(scene().shapes[0].stroke).toMatchObject({
				paint: [255, 0, 0, 255],
				width: 2,
				lineCap: "butt",
				lineJoin: "miter",
				miterLimit: 4,
			});
		},
	);
});

it("recomputes stroke variables after ancestor CSSOM mutation", () => {
	withFixture(
		"#parent{--Paint:red;--Width:2;--Alpha:1}path{stroke:var(--Paint);stroke-width:var(--Width);stroke-opacity:var(--Alpha)}",
		({ parent, style, scene }) => {
			expect(scene().shapes[0].stroke?.paint).toEqual([255, 0, 0, 255]);
			const declaration = style(parent);
			declaration.setProperty("--Paint", "blue");
			declaration.setProperty("--Width", "4");
			declaration.setProperty("--Alpha", "25%");
			expect(scene().shapes[0].stroke).toMatchObject({
				paint: [0, 0, 255, 64],
				width: 4,
			});
		},
	);
});

it("invalidates inherited stroke after presentation attribute mutation", () => {
	withFixture("", ({ tree, parent, value, scene }) => {
		tree.setAttribute(parent, "stroke", "red");
		tree.setAttribute(parent, "stroke-width", "2");
		const before = scene();
		tree.setAttribute(parent, "stroke", "blue");
		tree.setAttribute(parent, "stroke-width", "4");
		tree.setAttribute(parent, "stroke-opacity", "50%");
		tree.setAttribute(parent, "stroke-linecap", "round");
		tree.setAttribute(parent, "stroke-linejoin", "bevel");
		tree.setAttribute(parent, "stroke-miterlimit", "0");
		expect(value("stroke")).toBe("rgb(0, 0, 255)");
		expect(scene().shapes[0].stroke).toEqual({
			paint: [0, 0, 255, 128],
			width: 4,
			lineCap: "round",
			lineJoin: "bevel",
			miterLimit: 0,
		});
		expect(before.shapes[0].stroke?.paint).toEqual([255, 0, 0, 255]);
	});
});

it("leaves valid CSSOM stroke values intact when unsupported replacements are rejected", () => {
	withFixture("", ({ style, value, scene }) => {
		const declaration = style();
		declaration.setProperty("stroke", "blue");
		declaration.setProperty("stroke-width", "2px");
		declaration.setProperty("stroke-miterlimit", "0.5");
		declaration.setProperty("stroke-width", "1em");
		declaration.setProperty("stroke-miterlimit", "-1");
		expect(value("stroke-width")).toBe("2px");
		expect(value("stroke-miterlimit")).toBe("0.5");
		expect(scene().shapes[0].stroke?.paint).toEqual([0, 0, 255, 255]);
	});
});

it.each([
	["stroke-width", "7px", "1.px", "7px"],
	["stroke-width", "7px", "2.e1", "7px"],
	["stroke-width", "7px", "1.%", "7px"],
	["stroke-miterlimit", "4", "2.e1", "4"],
	["stroke-miterlimit", "4", "1.", "4"],
	["stroke-opacity", ".5", "1.%", "0.5"],
	["stroke-opacity", ".5", "2.e1", "0.5"],
] as const)(
	"rejects malformed CSS %s:%s followed by %s without replacing valid values",
	(property, valid, invalid, expected) => {
		expect(cssSupportsDeclaration(property, valid)).toBe(true);
		expect(cssSupportsDeclaration(property, invalid)).toBe(false);
		withFixture(
			`path{stroke:red;${property}:${valid};${property}:${invalid}}`,
			({ value, styles }) => {
				expect(value(property)).toBe(expected);
				expect(
					styles.metrics().issues["unimplemented-or-invalid-css-value"],
				).toBeGreaterThan(0);
			},
			{ allowIssues: true },
		);
		withFixture("path{stroke:red}", ({ style, value }) => {
			const declaration = style();
			declaration.setProperty(property, valid);
			const before = declaration.getPropertyValue(property);
			declaration.setProperty(property, invalid);
			expect(declaration.getPropertyValue(property)).toBe(before);
			expect(value(property)).toBe(expected);
		});
	},
);

it("stores shared shape opacity separately from fill and stroke opacity", () => {
	withFixture(
		"rect{fill:red;fill-opacity:.5;stroke:blue;stroke-opacity:.5;stroke-width:2}",
		({ scene }) => {
			expect(scene().shapes[0]).toMatchObject({
				fill: [255, 0, 0, 128],
				stroke: { paint: [0, 0, 255, 128] },
				opacity: 0.5,
			});
		},
		{ content: rectangle.replace("/>", ` opacity=".5"/>`) },
	);
});

it("paints stroke above fill and applies shared opacity once to their overlap", () => {
	withFixture(
		"rect{fill:red;stroke:blue;stroke-width:2}",
		({ scene }) => {
			const image = rasterizeSvgScene(scene(), 8, 8, noCharge);
			expect(pixel(image, 2, 3)).toEqual([0, 0, 255, 128]);
			expect(pixel(image, 4, 4)).toEqual([255, 0, 0, 128]);
		},
		{ content: rectangle.replace("/>", ` opacity=".5"/>`) },
	);
});

it.each(["stroke:none", "stroke:blue;stroke-width:0"])(
	"preserves legacy fill-only alpha when stroke is omitted by %s",
	(stroke) => {
		withFixture(
			`rect{fill:red;fill-opacity:.5;${stroke}}`,
			({ scene }) => {
				const shape = scene().shapes[0];
				expect(shape.stroke).toBeUndefined();
				expect(shape.opacity).toBeUndefined();
				expect(shape.fill).toEqual([255, 0, 0, 64]);
			},
			{ content: rectangle.replace("/>", ` opacity=".5"/>`) },
		);
	},
);

it.each([
	`<g display="none" stroke="url(external)" stroke-width="1em"><use href="external"/></g>`,
	`<defs><path stroke="url(external)" stroke-opacity="bogus"/></defs>`,
])(
	"does not consume unsupported stroke attributes in inactive content %s",
	(content) => {
		withFixture(
			"#target{stroke:red}",
			({ scene }) => {
				expect(scene().shapes).toHaveLength(1);
				expect(scene().shapes[0].stroke?.paint).toEqual([255, 0, 0, 255]);
			},
			{ content: content + line },
		);
	},
);

it("lets author stroke declarations replace unsupported presentation values", () => {
	withFixture(
		"path{stroke:blue;stroke-width:2;stroke-miterlimit:0}",
		({ scene }) => {
			expect(scene().shapes[0].stroke).toMatchObject({
				paint: [0, 0, 255, 255],
				width: 2,
				miterLimit: 0,
			});
		},
		{
			content: `<path id="target" d="M1 4H7" fill="none" stroke="url(external)" stroke-width="1em" stroke-miterlimit="-1"/>`,
		},
	);
});

it.each([
	["stroke-width", "-1"],
	["stroke-width", "1em"],
	["stroke-width", "calc(1px + 1px)"],
	["stroke-miterlimit", "-1"],
	["stroke-linecap", "triangle"],
	["stroke-linejoin", "arcs"],
	["stroke-linejoin", "miter-clip"],
	["stroke-opacity", "bogus"],
	["stroke-dasharray", "2 1"],
	["stroke-dashoffset", "1"],
	["marker-start", "url(#Marker)"],
	["marker-mid", "url(#Marker)"],
	["marker-end", "url(#Marker)"],
	["paint-order", "stroke"],
	["vector-effect", "non-scaling-stroke"],
] as const)(
	"keeps active presentation %s=%s unsupported",
	(property, value) => {
		withFixture(
			"path{stroke:red}",
			({ scene }) => {
				expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
			},
			{ content: line.replace("/>", ` ${property}="${value}"/>`) },
		);
	},
);

it.each([
	"stroke-width:-1",
	"stroke-width:1em",
	"stroke-width:2rem",
	"stroke-width:1vw",
	"stroke-width:calc(1px + 1px)",
	"stroke-miterlimit:-1",
	"stroke-linejoin:arcs",
	"stroke-linejoin:miter-clip",
	"stroke-dasharray:2 1",
	"marker-end:url(#Marker)",
	"paint-order:stroke",
	"vector-effect:non-scaling-stroke",
])(
	"retains CSS diagnostics and image rejection for unsupported %s",
	(declaration) => {
		const css = `path{stroke:red;${declaration}}`;
		withFixture(
			css,
			({ styles }) => {
				expect(Object.keys(styles.metrics().issues).length).toBeGreaterThan(0);
			},
			{ allowIssues: true },
		);
		const source = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><style>${css}</style>${line}</svg>`;
		expect(() =>
			decodeImage(new TextEncoder().encode(source), "image/svg+xml"),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
	},
);
