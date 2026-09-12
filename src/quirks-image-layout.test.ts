import { afterEach, expect, it } from "vitest";
import { bitmapFont } from "./bitmap-font.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { documentMode } from "./document-mode.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentElementSizes } from "./element-sizes.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { layoutValueLimits } from "./layout-values.js";
import { encodePng } from "./png.js";
import { createRaster, paintBitmapGlyph } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const blockedSource = "http://blocked.invalid/badge.png";
const limitedQuirks =
	'<!doctype html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';
const fontSize = 8;
const badgeWidth =
	(bitmapFont.advance * fontSize * "Badge".length) / bitmapFont.unitsPerEm;

it.each([
	[4.1, 8, 0, 0],
	[4.4, 7.4, 0.2, 0.2],
	[4.8, 7.8, 0.6, 0.6],
	[7.1, 5.1, 0.2, 0.6],
])(
	"clips fractional alternative boxes without scaling native glyphs: %s/%s at %s/%s",
	async (width, height, horizontal, vertical) => {
		const actual = await fixture(
			`<img id="photo" src="${blockedSource}" alt="A">`,
			`#photo{display:block;width:${width}px;height:${height}px;margin-left:${horizontal}px;margin-top:${vertical}px;color:red}`,
		);
		const rectangle = actual.rect();
		const image = rasterizeDocument(actual.tree).image;
		const expected = createRaster(
			image.width,
			image.height,
			[255, 255, 255, 255],
		);
		paintBitmapGlyph(
			expected,
			"A",
			rectangle.x,
			rectangle.y,
			8,
			[255, 0, 0, 255],
		);
		for (let row = 0; row < expected.height; row++)
			for (let column = 0; column < expected.width; column++)
				if (
					column + 0.5 < rectangle.x ||
					column + 0.5 >= rectangle.right ||
					row + 0.5 < rectangle.y ||
					row + 0.5 >= rectangle.bottom
				)
					expected.pixels.set(
						[255, 255, 255, 255],
						(row * expected.width + column) * 4,
					);
		expect(image.pixels).toEqual(expected.pixels);
		expect(actual.requests).toEqual([]);
	},
);

afterEach(() => {
	for (const query of queries.splice(0)) query.close();
	for (const tree of trees.splice(0)) tree.close();
});

async function fixture(
	markup = `<img id="photo" src="${blockedSource}" alt="Badge">`,
	css = "",
	doctype = "",
	settle = true,
) {
	const tree = parseHtmlDocument(
		`${doctype}<style>html,body{margin:0;padding:0}main{width:160px;font-size:8px;line-height:8px}${css}</style><main>${markup}</main>`,
		"https://fixture.invalid/quirks-image",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(192, 128);
	const requests: string[] = [];
	const body = encodePng(createRaster(4, 2, [0, 128, 0, 255]));
	const images = documentImages(tree, {
		fetch: async (url) => {
			requests.push(url);
			if (url !== "https://fixture.invalid/loaded.png")
				throw new Error(`Unexpected in-memory image request: ${url}`);
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
	if (settle) await images.settle();
	const query = new DocumentQueries(tree);
	queries.push(query);
	const id = (selector = "#photo") => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	const rect = (selector = "#photo") =>
		geometry.getBoundingClientRect(id(selector));
	const node = () =>
		buildFormattingTree(tree).nodes.find(
			(entry) => entry.ref === tree.reference(id()) && entry.kind !== "text",
		);
	return { tree, query, images, requests, id, geometry, rect, node };
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each(["inline", "block", "inline-block"])(
	"keeps quirks both-auto %s alternatives equivalent to native spans",
	async (display) => {
		const css = `#photo{display:${display};width:auto;height:auto;min-width:12px;padding:1px;border:1px solid blue;color:red}main{width:48px}`;
		const actual = await fixture(
			`A<img id="photo" src="${blockedSource}" alt="Read  more&#10;now" width="80" height="15">B`,
			css,
		);
		const reference = await fixture(
			'A<span id="photo">Read  more\nnow</span>B',
			css,
		);
		expect(documentMode(actual.tree)).toBe("quirks");
		expect(buildFormattingTree(actual.tree).issues).toEqual({});
		expect(actual.node()?.kind).toBe(display === "inline" ? "inline" : "block");
		expect(actual.rect()).toEqual(reference.rect());
		expect(actual.geometry.getClientRects(actual.id())).toEqual(
			reference.geometry.getClientRects(reference.id()),
		);
		const raster = rasterizeDocument(actual.tree);
		expect(raster.image.pixels).toEqual(
			rasterizeDocument(reference.tree).image.pixels,
		);
		expect(raster.metrics.paintedImages).toBe(0);
		expect(raster.metrics.paintedGlyphs).toBeGreaterThan(0);
		expect(actual.requests).toEqual([]);
	},
);

it.each([
	["width only", "width:80px", "", 80, fontSize],
	["height only", "height:15px", "", badgeWidth, 15],
	["both dimensions", "width:80px;height:15px", "", 80, 15],
	["zero width", "width:0px", "", 0, fontSize],
	["zero height", "height:0px", "", badgeWidth, 0],
	["both zero", "width:0px;height:0px", "", 0, 0],
	["independent minmax", "width:10px;min-width:20px;max-height:6px", "", 20, 6],
	[
		"minimum wins",
		"width:40px;min-width:20px;max-width:12px;height:4px;min-height:10px;max-height:6px",
		"",
		20,
		10,
	],
	["definite percentages", "width:50%;height:25%", "main{height:80px}", 80, 20],
	["indefinite percentage", "height:25%", "", badgeWidth, fontSize],
	[
		"percentage constraints",
		"width:100%;max-width:50%;height:1px;min-height:25%",
		"main{height:80px}",
		80,
		20,
	],
] as const)(
	"uses independent replaced dimensions for quirks %s",
	async (_label, declarations, containerCss, width, height) => {
		const actual = await fixture(
			undefined,
			`${containerCss}#photo{display:block;${declarations}}`,
		);
		const reference = await fixture(
			'<img id="photo" src="/loaded.png">',
			`${containerCss}#photo{display:block;width:${width}px;height:${height}px}`,
		);
		expect(buildFormattingTree(actual.tree).issues).toEqual({});
		expect(actual.node()).toMatchObject({
			kind: "replaced",
			intrinsicRatio: false,
			intrinsic: { width: badgeWidth, height: fontSize },
			imageAlternative: {
				text: "Badge",
				fontSize,
				width: badgeWidth,
				height: fontSize,
			},
		});
		expect(actual.rect()).toEqual(reference.rect());
		expect(actual.rect()).toMatchObject({ width, height });
		expect(actual.geometry.getUsedStyle(actual.id())).toMatchObject({
			width,
			height,
		});
		expect(actual.images.get(actual.id())).toMatchObject({
			state: "broken",
			complete: true,
			currentSrc: blockedSource,
			error: "policy-denied",
			naturalWidth: 0,
			naturalHeight: 0,
		});
		expect(actual.images.decoded(actual.id())).toBeUndefined();
		expect(actual.requests).toEqual([]);
		if (width === 0 || height === 0) {
			const raster = rasterizeDocument(actual.tree);
			expect(raster.metrics.paintedImages).toBe(0);
			expect(raster.metrics.paintedGlyphs).toBe(0);
			expect(raster.image.pixels.every((value) => value === 255)).toBe(true);
		}
	},
);

it.each([
	'width="80"',
	'height="15"',
	'width="80" height="15"',
	'width="50%" height="25%"',
])("uses computed HTML dimension hints in quirks: %s", async (attributes) => {
	const actual = await fixture(
		`<img id="photo" src="${blockedSource}" alt="Badge" ${attributes}>`,
		"main{height:80px}",
	);
	const width = attributes.includes("width=") ? 80 : badgeWidth;
	const height = attributes.includes('height="25%"')
		? 20
		: attributes.includes("height=")
			? 15
			: fontSize;
	expect(actual.node()).toMatchObject({
		kind: "replaced",
		intrinsicRatio: false,
	});
	expect(actual.rect()).toMatchObject({ width, height });
	expect(actual.requests).toEqual([]);
});

it.each(["content-box", "border-box"])(
	"uses ordinary replaced edges and hit regions with %s sizing",
	async (sizing) => {
		const css = `#photo{display:block;width:40px;height:24px;padding:2px 3px;border:2px solid blue;margin:3px 5px;box-sizing:${sizing};background:yellow;color:red}`;
		const actual = await fixture(undefined, css);
		const reference = await fixture('<img id="photo" src="/loaded.png">', css);
		expect(actual.rect()).toEqual(reference.rect());
		expect(documentElementSizes(actual.tree).get(actual.id())).toEqual(
			documentElementSizes(reference.tree).get(reference.id()),
		);
		expect(actual.geometry.getUsedStyle(actual.id())).toEqual(
			reference.geometry.getUsedStyle(reference.id()),
		);
		const rectangle = actual.rect();
		const hits = documentHitTesting(actual.tree);
		const raster = rasterizeDocument(actual.tree);
		for (const [column, row] of [
			[rectangle.left, rectangle.top],
			[rectangle.right - 1, rectangle.top],
			[rectangle.left, rectangle.bottom - 1],
			[rectangle.right - 1, rectangle.bottom - 1],
		]) {
			expect(pixel(raster.image, column, row)).toEqual([0, 0, 255, 255]);
			expect(hits.elementFromPoint(column + 0.5, row + 0.5)).toBe(actual.id());
		}
		expect(pixel(raster.image, rectangle.left + 2, rectangle.top + 2)).toEqual([
			255, 255, 0, 255,
		]);
		expect(
			hits.elementFromPoint(rectangle.right + 0.5, rectangle.top + 0.5),
		).not.toBe(actual.id());
		expect(
			hits.elementFromPoint(rectangle.left - 0.5, rectangle.top + 0.5),
		).not.toBe(actual.id());
		expect(raster.metrics.paintedImages).toBe(1);
	},
);

it.each([
	["inline", ""],
	["block", "#photo{display:block}"],
	["float", "#photo{float:left}"],
	["flex", "main{display:flex}"],
	["grid", "main{display:grid;grid-template-columns:40px 50px 40px}"],
	[
		"absolute",
		"main{position:relative;height:40px}#photo{position:absolute;left:20px;top:10px}",
	],
] as const)(
	"shares loaded replaced placement for %s alternatives",
	async (_label, placement) => {
		const css = `#photo{width:24px;height:12px;padding:1px;border:1px solid blue;margin:2px}${placement}`;
		const actual = await fixture(
			`<span>A</span><img id="photo" src="${blockedSource}" alt="Badge"><span id="after">B</span>`,
			css,
		);
		const reference = await fixture(
			'<span>A</span><img id="photo" src="/loaded.png"><span id="after">B</span>',
			css,
		);
		expect(buildFormattingTree(actual.tree).issues).toEqual(
			buildFormattingTree(reference.tree).issues,
		);
		expect(actual.rect()).toEqual(reference.rect());
		expect(actual.rect("#after")).toEqual(reference.rect("#after"));
		const actualLayout = layoutDocument(actual.tree);
		const referenceLayout = layoutDocument(reference.tree);
		expect(actualLayout.contexts.map((context) => context.lines)).toEqual(
			referenceLayout.contexts.map((context) => context.lines),
		);
		expect(
			actualLayout.contexts
				.flatMap((context) => context.glyphs)
				.map(({ character, x, y }) => [character, x, y]),
		).toEqual(
			referenceLayout.contexts
				.flatMap((context) => context.glyphs)
				.map(({ character, x, y }) => [character, x, y]),
		);
		expect(
			actualLayout.contexts
				.flatMap((context) => context.glyphs)
				.some((glyph) => glyph.ref === actual.tree.reference(actual.id())),
		).toBe(false);
		expect(rasterizeDocument(actual.tree).metrics.paintedImages).toBe(1);
	},
);

it.each([400, 700])(
	"paints normalized alternatives with inherited current color and native weight %s",
	async (weight) => {
		const css = `main{color:rgb(120,30,200);font-weight:${weight}}#photo{display:block;width:80px;height:16px;padding:2px;border:1px solid currentcolor;background:yellow}`;
		const actual = await fixture(
			`<img id="photo" src="${blockedSource}" alt=" &#9;Badge&#10;  text&#13;&#12; ">`,
			`${css}#photo{white-space:pre-wrap;line-height:32px;text-align:right}`,
		);
		const reference = await fixture(
			'<span id="photo">Badge text</span>',
			`${css}#photo{white-space:nowrap}`,
		);
		expect(actual.rect()).toEqual(reference.rect());
		const raster = rasterizeDocument(actual.tree);
		expect(raster.image.pixels).toEqual(
			rasterizeDocument(reference.tree).image.pixels,
		);
		expect(raster.metrics.paintedImages).toBe(1);
		expect(raster.metrics.paintedGlyphs).toBe(0);
		expect(actual.node()).toMatchObject({
			imageAlternative: { text: "Badge text", fontSize },
		});
		expect(actual.images.metrics()).toMatchObject({
			requests: 0,
			resources: 0,
			decodedBytes: 0,
			decodeWork: 0,
		});
	},
);

it("clips one-line ink to the content box without wrapping or scaling", async () => {
	const markup = `<img id="photo" src="${blockedSource}" alt="Badge Badge Badge">`;
	const actual = await fixture(
		markup,
		"#photo{display:block;width:11px;height:4px;padding:2px;border:1px solid blue}",
	);
	const reference = await fixture(
		markup,
		"#photo{display:block;width:140px;height:16px;padding:2px;border:1px solid blue}",
	);
	const raster = rasterizeDocument(actual.tree).image;
	const full = rasterizeDocument(reference.tree).image;
	const rectangle = actual.rect();
	const contentLeft = rectangle.left + 3;
	const contentTop = rectangle.top + 3;
	for (let row = 0; row < 4; row++)
		for (let column = 0; column < 11; column++)
			expect(pixel(raster, contentLeft + column, contentTop + row)).toEqual(
				pixel(full, contentLeft + column, contentTop + row),
			);
	for (let row = 0; row < 4; row++)
		expect(pixel(raster, contentLeft + 11, contentTop + row)).toEqual([
			255, 255, 255, 255,
		]);
	for (let column = 0; column < 11; column++)
		expect(pixel(raster, contentLeft + column, contentTop + 4)).toEqual([
			255, 255, 255, 255,
		]);
});

it("keeps a zero-font alternative's positive intrinsic minimum without ink", async () => {
	const actual = await fixture(
		undefined,
		"#photo{display:block;width:12px;font-size:0px}",
	);
	expect(actual.node()).toMatchObject({
		intrinsic: { width: 1, height: 1 },
		intrinsicRatio: false,
	});
	expect(actual.rect()).toMatchObject({ width: 12, height: 1 });
	expect(
		rasterizeDocument(actual.tree).image.pixels.every((value) => value === 255),
	).toBe(true);
});

it("owns the whole blocked 80x15 badge hit region and activates only its real link", async () => {
	const source =
		"http://sflogo.sourceforge.net/sflogo.php?group_id=32355&type=9";
	const actual = await fixture(
		'<a id="link" href="/next"><IMG id="photo" WIDTH=80 HEIGHT=15 SRC="http://sflogo.sourceforge.net/sflogo.php?group_id=32355&amp;type=9" ALT="[primary site hosted by SourceForge]" BORDER=0></a>',
	);
	const before = snapshotDocument(actual.tree);
	const count = actual.tree.nodeCount;
	const rectangle = actual.rect();
	expect(rectangle).toMatchObject({ width: 80, height: 15 });
	expect(actual.geometry.getClientRects(actual.id())).toHaveLength(1);
	const hits = documentHitTesting(actual.tree);
	const point = { x: rectangle.right - 0.5, y: rectangle.bottom - 0.5 };
	expect(hits.elementFromPoint(point.x, point.y)).toBe(actual.id());
	const actions = documentInteractions(actual.tree);
	let target: number | null = null;
	actions.events.addEventListener(actual.id("#link"), "click", (event) => {
		target = event.target;
	});
	actions.mouse.move(point.x, point.y);
	actions.mouse.down();
	expect(actions.mouse.up().interaction?.defaultAction).toEqual({
		kind: "navigate",
		url: "https://fixture.invalid/next",
		target: "_self",
	});
	expect(target).toBe(actual.id());
	expect(
		actions.click(actual.tree.reference(actual.id())).defaultAction,
	).toEqual({
		kind: "navigate",
		url: "https://fixture.invalid/next",
		target: "_self",
	});
	expect(rasterizeDocument(actual.tree).metrics.paintedImages).toBe(1);
	expect(actual.tree.get(actual.id()).attributes.src).toBe(source);
	expect(actual.tree.get(actual.id()).children).toEqual([]);
	expect(actual.tree.textContent(actual.id())).toBe("");
	expect(actual.tree.nodeCount).toBe(count);
	expect(snapshotDocument(actual.tree).entries).toEqual(
		before.entries.map((entry) =>
			entry.ref === actual.tree.reference(actual.id("#link"))
				? { ...entry, focused: true }
				: entry,
		),
	);
	expect(actual.images.get(actual.id())).toMatchObject({
		state: "broken",
		complete: true,
		currentSrc: source,
		error: "policy-denied",
	});
	expect(actual.requests).toEqual([]);
});

it("invalidates native alternative dimensions, styles, sources and prepared paints", async () => {
	const actual = await fixture(undefined, "#photo{height:15px}");
	expect(actual.rect().width).toBe(badgeWidth);
	let prepared = prepareDocumentRaster(actual.tree);
	actual.tree.setAttribute(actual.id(), "alt", "Badge Badge");
	expect(() => prepared.rasterize()).toThrow(/stale/i);
	expect(actual.rect().width).toBe(
		(bitmapFont.advance * fontSize * 11) / bitmapFont.unitsPerEm,
	);
	prepared = prepareDocumentRaster(actual.tree);
	actual.tree.setAttribute(
		actual.id(),
		"style",
		"width:80px;height:auto;color:red;font-weight:700",
	);
	expect(() => prepared.rasterize()).toThrow(/stale/i);
	expect(actual.rect()).toMatchObject({ width: 80, height: fontSize });
	prepared = prepareDocumentRaster(actual.tree);
	actual.tree.setAttribute(actual.id(), "style", "width:auto;height:auto");
	expect(() => prepared.rasterize()).toThrow(/stale/i);
	expect(actual.node()?.kind).toBe("inline");
	expect(rasterizeDocument(actual.tree).metrics.paintedImages).toBe(0);
	prepared = prepareDocumentRaster(actual.tree);
	actual.tree.setAttribute(actual.id(), "style", "width:80px;height:15px");
	expect(() => prepared.rasterize()).toThrow(/stale/i);
	expect(actual.node()?.kind).toBe("replaced");
	prepared = prepareDocumentRaster(actual.tree);
	actual.tree.setAttribute(actual.id(), "src", "/loaded.png");
	expect(() => prepared.rasterize()).toThrow(/stale/i);
	expect(actual.images.get(actual.id()).state).toBe("loading");
	expect(() => actual.rect()).toThrow(/supported formatting/i);
	await actual.images.settle();
	expect(actual.images.get(actual.id()).state).toBe("complete");
	expect(actual.node()).not.toHaveProperty("imageAlternative");
	expect(actual.rect()).toMatchObject({ width: 80, height: 15 });
	prepared = prepareDocumentRaster(actual.tree);
	actual.tree.setAttribute(actual.id(), "src", blockedSource);
	expect(() => prepared.rasterize()).toThrow(/stale/i);
	await actual.images.settle();
	expect(actual.node()).toMatchObject({
		kind: "replaced",
		imageAlternative: { text: "Badge Badge" },
	});
	prepared = prepareDocumentRaster(actual.tree);
	actual.tree.removeAttribute(actual.id(), "alt");
	expect(() => prepared.rasterize()).toThrow(/stale/i);
	expect(() => actual.rect()).toThrow(/supported formatting/i);
	actual.tree.setAttribute(actual.id(), "alt", "");
	expect(() => rasterizeDocument(actual.tree)).toThrow(/supported formatting/i);
	actual.tree.setAttribute(actual.id(), "alt", "Badge");
	expect(actual.rect()).toMatchObject({ width: 80, height: 15 });
	expect(actual.requests).toEqual(["https://fixture.invalid/loaded.png"]);
});

it("invalidates HTML width and height hint mutations", async () => {
	const actual = await fixture();
	expect(actual.node()?.kind).toBe("inline");
	for (const [name, value, width, height] of [
		["width", "80", 80, fontSize],
		["height", "15", 80, 15],
	] as const) {
		const prepared = prepareDocumentRaster(actual.tree);
		actual.tree.setAttribute(actual.id(), name, value);
		expect(() => prepared.rasterize()).toThrow(/stale/i);
		expect(actual.node()?.kind).toBe("replaced");
		expect(actual.rect()).toMatchObject({ width, height });
	}
	actual.tree.removeAttribute(actual.id(), "width");
	expect(actual.rect()).toMatchObject({ width: badgeWidth, height: 15 });
	actual.tree.removeAttribute(actual.id(), "height");
	expect(actual.node()?.kind).toBe("inline");
	expect(actual.requests).toEqual([]);
});

it("invalidates inherited font size, weight and current color without decoding", async () => {
	const actual = await fixture(undefined, "#photo{display:block;height:24px}");
	const before = rasterizeDocument(actual.tree);
	const prepared = prepareDocumentRaster(actual.tree);
	actual.tree.setAttribute(
		actual.id("main"),
		"style",
		"font-size:16px;font-weight:700;color:red",
	);
	expect(() => prepared.rasterize()).toThrow(/stale/i);
	expect(actual.rect()).toMatchObject({ width: badgeWidth * 2, height: 24 });
	const reference = await fixture(
		'<span id="photo">Badge</span>',
		"main{font-size:16px;line-height:16px;font-weight:700;color:red}#photo{display:block;width:60px;height:24px}",
	);
	const after = rasterizeDocument(actual.tree);
	expect(after.image.pixels).not.toEqual(before.image.pixels);
	expect(after.image.pixels).toEqual(
		rasterizeDocument(reference.tree).image.pixels,
	);
	expect(actual.images.metrics()).toMatchObject({
		requests: 0,
		resources: 0,
		decodedBytes: 0,
	});
});

it("keeps broken completion, decode rejection and event delivery independent of painting", async () => {
	const actual = await fixture(undefined, "#photo{width:80px;height:15px}");
	const before = actual.images.get(actual.id());
	const delivered = actual.images.metrics().delivered;
	const events: string[] = [];
	for (const type of ["load", "error"])
		documentInteractions(actual.tree).events.addEventListener(
			actual.id(),
			type,
			() => events.push(type),
		);
	for (let iteration = 0; iteration < 2; iteration++) {
		buildFormattingTree(actual.tree);
		actual.rect();
		rasterizeDocument(actual.tree);
	}
	await expect(actual.images.decode(actual.id())).rejects.toMatchObject({
		name: "EncodingError",
	});
	expect(actual.images.get(actual.id())).toEqual(before);
	expect(actual.images.metrics().delivered).toBe(delivered);
	expect(events).toEqual([]);
	expect(actual.requests).toEqual([]);
});

it("leaves pending and loaded owners unchanged by alternative text", async () => {
	const actual = await fixture(
		'<img id="photo" src="/loaded.png" alt="Badge" width="24">',
		"",
		"",
		false,
	);
	expect(actual.images.get(actual.id()).state).toBe("loading");
	expect(actual.node()).toMatchObject({
		kind: "deferred",
		deferredReason: "element-layout-not-supported",
	});
	expect(() => rasterizeDocument(actual.tree)).toThrow(/supported formatting/i);
	await actual.images.settle();
	const decoded = actual.images.decoded(actual.id());
	expect(decoded).toBeDefined();
	expect(actual.rect()).toMatchObject({ width: 24, height: 12 });
	expect(actual.node()).not.toHaveProperty("imageAlternative");
	const before = rasterizeDocument(actual.tree);
	actual.tree.setAttribute(actual.id(), "alt", "Must not paint");
	expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
		before.image.pixels,
	);
	expect(before.metrics.paintedGlyphs).toBe(0);
	expect(before.metrics.paintedImages).toBe(1);
	expect(actual.images.decoded(actual.id())).toBe(decoded);
	expect(actual.requests).toEqual(["https://fixture.invalid/loaded.png"]);
});

it.each([
	`src="${blockedSource}"`,
	`src="${blockedSource}" alt=""`,
	'alt="Badge"',
	'src="" alt="Badge"',
	'src="   " alt="Badge"',
	`src="${blockedSource}" alt="Badge" srcset=""`,
	`src="${blockedSource}" alt="Badge" srcset="/other.png 2x"`,
	`src="${blockedSource}" alt="Badge" crossorigin="anonymous"`,
	`src="${blockedSource}" alt="Badge" referrerpolicy="no-referrer"`,
])("does not promote ineligible quirks sources: %s", async (attributes) => {
	const actual = await fixture(
		`<img id="photo" width="80" height="15" ${attributes}>`,
	);
	expect(actual.node()).toMatchObject({
		kind: "deferred",
		deferredReason: "element-layout-not-supported",
	});
	expect(() => rasterizeDocument(actual.tree)).toThrow(/supported formatting/i);
	expect(actual.images.decoded(actual.id())).toBeUndefined();
	expect(actual.requests).toEqual([]);
});

it("does not promote a picture child into a quirks alternative", async () => {
	const actual = await fixture(
		`<picture><img id="photo" src="${blockedSource}" alt="Badge" width="80" height="15"></picture>`,
	);
	expect(
		buildFormattingTree(actual.tree).issues["element-layout-not-supported"],
	).toBeGreaterThan(0);
	expect(() => rasterizeDocument(actual.tree)).toThrow(/supported formatting/i);
	expect(actual.images.decoded(actual.id())).toBeUndefined();
	expect(actual.requests).toEqual([]);
});

it.each([
	["no-quirks", "<!doctype html>"],
	["limited-quirks", limitedQuirks],
] as const)(
	"keeps dimensioned %s alternatives non-replaced",
	async (mode, doctype) => {
		const css =
			"#photo{color:red;padding:1px;border:1px solid blue}main{width:48px}";
		const actual = await fixture(
			`<img id="photo" src="${blockedSource}" alt="Read more now" width="80" height="15">`,
			css,
			doctype,
		);
		const reference = await fixture(
			'<span id="photo">Read more now</span>',
			css,
			doctype,
		);
		expect(documentMode(actual.tree)).toBe(mode);
		expect(actual.node()?.kind).toBe("inline");
		expect(actual.rect()).toEqual(reference.rect());
		expect(actual.geometry.getClientRects(actual.id())).toEqual(
			reference.geometry.getClientRects(reference.id()),
		);
		const raster = rasterizeDocument(actual.tree);
		expect(raster.image.pixels).toEqual(
			rasterizeDocument(reference.tree).image.pixels,
		);
		expect(raster.metrics.paintedImages).toBe(0);
		expect(actual.requests).toEqual([]);
	},
);

it.each(['align="left"', 'hspace="2"', 'vspace="2"', 'valign="top"'])(
	"retains unrelated presentation guards on replaced alternatives: %s",
	async (attribute) => {
		const actual = await fixture(
			`<img id="photo" src="${blockedSource}" alt="Badge" width="80" height="15" border="0" ${attribute}>`,
		);
		expect(
			buildFormattingTree(actual.tree).issues[
				"html-presentation-hint-not-supported"
			],
		).toBe(1);
		expect(() => rasterizeDocument(actual.tree)).toThrow(
			/supported formatting/i,
		);
	},
);

it("aligns auto-height non-replaced alternatives as ordinary block text", async () => {
	const actual = await fixture(
		undefined,
		"#photo{display:block;width:auto;height:auto;align-content:center}",
	);
	const reference = await fixture(
		'<span id="photo">Badge</span>',
		"#photo{display:block;width:auto;height:auto}",
	);
	const formatting = buildFormattingTree(actual.tree);
	const ref = actual.tree.reference(actual.id());
	const node = actual.node();
	expect(documentMode(actual.tree)).toBe("quirks");
	expect(formatting.issues).toEqual({});
	expect(node).toMatchObject({
		kind: "block",
		independentContext: true,
		blockContentAlignment: { position: "center", overflow: "safe" },
	});
	expect(node?.children.map((child) => formatting.nodes[child])).toMatchObject([
		{ kind: "text", parent: node?.id, ref, text: "Badge" },
	]);
	const layout = layoutDocument(actual.tree);
	expect(layout.boxes.find((box) => box.ref === ref)).toMatchObject({
		borderY: 0,
		contentY: 0,
		naturalContentHeight: 8,
		contentHeight: 8,
		contentAlignmentOffset: 0,
	});
	expect(actual.rect()).toMatchObject({ x: 0, y: 0, width: 160, height: 8 });
	expect(actual.rect()).toEqual(reference.rect());
	const context = layout.contexts.find((entry) => entry.ref === ref);
	expect(context?.lines).toMatchObject([{ top: 0, height: 8 }]);
	expect(
		context?.glyphs.map((glyph) => [
			glyph.character,
			glyph.x,
			glyph.y,
			glyph.ref,
		]),
	).toEqual([
		["B", 0, 0, ref],
		["a", 6, 0, ref],
		["d", 12, 0, ref],
		["g", 18, 0, ref],
		["e", 24, 0, ref],
	]);
	const raster = rasterizeDocument(actual.tree);
	expect(raster.image.pixels).toEqual(
		rasterizeDocument(reference.tree).image.pixels,
	);
	expect(raster.metrics).toMatchObject({ paintedGlyphs: 5, paintedImages: 0 });
	expect(actual.images.decoded(actual.id())).toBeUndefined();
	expect(actual.requests).toEqual([]);
});

it("ignores block content alignment on replaced alternatives like loaded images", async () => {
	const actual = await fixture(
		undefined,
		"#photo{display:block;width:80px;height:15px;align-content:center}",
	);
	expect(buildFormattingTree(actual.tree).issues).toEqual({});
	expect(actual.rect()).toMatchObject({ width: 80, height: 15 });
	expect(rasterizeDocument(actual.tree).metrics.paintedImages).toBe(1);
});

it("paints a bounded viewport of a large alternative without a content-sized scratch image", async () => {
	const actual = await fixture(
		`<img id="photo" src="${blockedSource}" alt="A">`,
		"#photo{display:block;width:5000px;height:5000px;color:red}",
	);
	const image = rasterizeDocument(actual.tree, {
		clip: { x: 0, y: 0, width: 16, height: 16 },
	}).image;
	const expected = createRaster(16, 16, [255, 255, 255, 255]);
	paintBitmapGlyph(expected, "A", 0, 0, 8, [255, 0, 0, 255]);
	expect(image.pixels).toEqual(expected.pixels);
	expect(actual.requests).toEqual([]);
});

it.each([
	"vertical-align:top",
	"filter:blur(1px)",
	"display:table-cell",
	"font-family:unregistered",
])(
	"does not bypass independent layout or font guards: %s",
	async (declaration) => {
		const actual = await fixture(
			undefined,
			`#photo{width:80px;height:15px;${declaration}}`,
		);
		expect(() => rasterizeDocument(actual.tree)).toThrow();
		expect(actual.requests).toEqual([]);
	},
);

it("retains independent table presentation guards beside an eligible badge", async () => {
	const actual = await fixture(
		`<table cellspacing="2"><tr><td><img id="photo" src="${blockedSource}" alt="Badge" width="80" height="15"></td></tr></table>`,
	);
	expect(
		buildFormattingTree(actual.tree).issues[
			"html-table-presentation-hint-not-supported"
		],
	).toBe(1);
	expect(() => rasterizeDocument(actual.tree)).toThrow(/supported formatting/i);
});

it("keeps visibility and display suppression for replaced alternatives", async () => {
	const actual = await fixture(
		`<img id="photo" src="${blockedSource}" alt="Badge" width="80" height="15"><img id="gone" src="${blockedSource}" alt="Badge" width="80" height="15">`,
		"#photo{visibility:hidden}#gone{display:none}",
	);
	const rectangle = actual.rect();
	expect(rectangle).toMatchObject({ width: 80, height: 15 });
	expect(actual.rect("#gone")).toMatchObject({ width: 0, height: 0 });
	expect(
		documentHitTesting(actual.tree).elementFromPoint(
			rectangle.left + 1,
			rectangle.top + 1,
		),
	).not.toBe(actual.id());
	expect(
		rasterizeDocument(actual.tree).image.pixels.every((value) => value === 255),
	).toBe(true);
	expect(
		buildFormattingTree(actual.tree).nodes.some(
			(node) => node.ref === actual.tree.reference(actual.id("#gone")),
		),
	).toBe(false);
	expect(actual.requests).toEqual([]);
});

it("charges unnormalized alternative text, formatting and paint work without DOM changes", async () => {
	const text = "  Badge\t\n Badge  ";
	const actual = await fixture(
		`<img id="photo" src="${blockedSource}" alt="${text}" width="80" height="15">`,
	);
	const before = snapshotDocument(actual.tree);
	const formatting = buildFormattingTree(actual.tree);
	expect(formatting.metrics.textCodeUnits).toBe(text.length);
	for (const options of [
		{ maxTextCodeUnits: text.length - 1 },
		{ maxBoxes: formatting.metrics.boxes - 1 },
		{ maxWork: formatting.metrics.work - 1 },
	])
		expect(() => buildFormattingTree(actual.tree, options)).toThrow(/limit/i);
	expect(
		buildFormattingTree(actual.tree, {
			maxTextCodeUnits: text.length,
			maxBoxes: formatting.metrics.boxes,
			maxWork: formatting.metrics.work,
		}),
	).toEqual(formatting);
	expect(() => layoutDocument(actual.tree, { maxWork: 1 })).toThrow(
		/work limit/i,
	);
	expect(() => rasterizeDocument(actual.tree, { maxWork: 1 })).toThrow(
		/work limit/i,
	);
	const raster = rasterizeDocument(actual.tree);
	expect(() =>
		rasterizeDocument(actual.tree, { maxWork: raster.metrics.work - 1 }),
	).toThrow(/work limit/i);
	expect(
		rasterizeDocument(actual.tree, { maxWork: raster.metrics.work }).image
			.pixels,
	).toEqual(raster.image.pixels);
	expect(snapshotDocument(actual.tree)).toEqual(before);
	expect(actual.images.metrics()).toMatchObject({
		requests: 0,
		decodedBytes: 0,
	});
});

it.each(["width", "height"])(
	"retains the native geometry magnitude cap for %s",
	async (dimension) => {
		const actual = await fixture(
			undefined,
			`#photo{display:block;${dimension}:${layoutValueLimits.maxAbsoluteLength + 1}px}`,
		);
		expect(() => actual.rect()).toThrow(/limit/i);
		expect(() => rasterizeDocument(actual.tree)).toThrow(/limit/i);
	},
);

it("enforces the bitmap font ceiling on an independently sized alternative", async () => {
	const actual = await fixture(
		undefined,
		`#photo{display:block;width:80px;height:15px;font-size:${bitmapFont.maxFontSize + 1}px}`,
	);
	expect(() => buildFormattingTree(actual.tree)).toThrow(/font.*limit/i);
	expect(() => rasterizeDocument(actual.tree)).toThrow(/font.*limit/i);
});

it("releases geometry, hit regions and image ownership after native teardown", async () => {
	const actual = await fixture(undefined, "#photo{width:80px;height:15px}");
	const hits = documentHitTesting(actual.tree);
	const rectangle = actual.rect();
	hits.elementFromPoint(rectangle.left + 1, rectangle.top + 1);
	const prepared = prepareDocumentRaster(actual.tree);
	prepared.rasterize();
	expect(actual.geometry.metrics().rectangles).toBeGreaterThan(0);
	expect(hits.metrics().regions).toBeGreaterThan(0);
	actual.query.close();
	actual.tree.close();
	expect(actual.tree.nodeCount).toBe(0);
	expect(actual.images.metrics()).toMatchObject({
		closed: true,
		resources: 0,
		decodedBytes: 0,
	});
	expect(actual.geometry.metrics()).toMatchObject({
		closed: true,
		rectangles: 0,
	});
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(() => prepared.rasterize()).toThrow(/closed|stale/i);
});
