import { afterEach, expect, it } from "vitest";
import { bitmapGlyph } from "./bitmap-font.js";
import { resolvedStyleValue } from "./computed-styles.js";
import { describeControl, rasterizeControl } from "./control-rendering.js";
import { controlChecked } from "./controls.js";
import { initialPaintStyle } from "./css-paint.js";
import {
	disclosureMarkerExtent,
	rasterizeDisclosureMarker,
} from "./disclosure-marker.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { NetworkRequest } from "./network.js";
import { createRaster, paintBitmapGlyph } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const sessions: BrowserSession[] = [];
const baseCss = "html,body{margin:0;padding:0;font-size:8px;line-height:8px}";

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${baseCss}${css}</style>${markup}`,
		"https://fixture.invalid/font-weight",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(48, 32);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, styles, id };
}

it("paints the bold face once per occupied cell without alpha overpainting", () => {
	const image = createRaster(6, 8);
	const color = [20, 40, 60, 128] as const;
	expect(paintBitmapGlyph(image, "I", 0, 0, 8, color, 700)).toBe(true);
	const rows = bitmapGlyph("I", 700).rows;
	for (let row = 0; row < 8; row++)
		for (let column = 0; column < 6; column++) {
			const offset = (row * 6 + column) * 4;
			const occupied = column < 5 && (rows[row] & (16 >> column)) !== 0;
			expect([...image.pixels.slice(offset, offset + 4)]).toEqual(
				occupied ? color : [0, 0, 0, 0],
			);
		}
});

it("preserves default regular raster output and rejects unavailable face requests", () => {
	const defaultImage = createRaster(8, 10);
	const regularImage = createRaster(8, 10);
	const boldImage = createRaster(8, 10);
	paintBitmapGlyph(defaultImage, "I", 1, 1, 8);
	paintBitmapGlyph(regularImage, "I", 1, 1, 8, [0, 0, 0, 255], 400);
	paintBitmapGlyph(boldImage, "I", 1, 1, 8, [0, 0, 0, 255], 700);
	expect(defaultImage.pixels).toEqual(regularImage.pixels);
	expect(boldImage.pixels).not.toEqual(regularImage.pixels);
	const untouched = createRaster(8, 10);
	expect(() =>
		paintBitmapGlyph(untouched, "I", 0, 0, 8, [0, 0, 0, 255], 500 as never),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(untouched.pixels.every((value) => value === 0)).toBe(true);
});

it.each(["normal", "400", "bold", "700"])(
	"uses authored %s for actual document glyph pixels",
	(weight) => {
		const { tree, styles } = fixture(
			`<div id=target style="font-weight:${weight}">I</div>`,
		);
		const result = rasterizeDocument(tree);
		const glyph = result.layout.text.contexts.flatMap(
			(context) => context.glyphs,
		)[0];
		expect(glyph.character).toBe("I");
		expect(glyph.x).toBe(0);
		expect(glyph.y).toBe(0);
		const face = weight === "bold" || weight === "700" ? 700 : 400;
		const expected = createRaster(48, 32, [255, 255, 255, 255]);
		paintBitmapGlyph(expected, "I", glyph.x, glyph.y, 8, [0, 0, 0, 255], face);
		expect(result.image.pixels).toEqual(expected.pixels);
		expect(styles.metrics().applicableIssues).toEqual({});
		expect(styles.metrics().textFontWeights).toEqual([400, 700]);
		expect(Object.isFrozen(styles.metrics().textFontWeights)).toBe(true);
	},
);

it("changes glyph ink after a weight mutation without changing monospace advances", () => {
	const { tree, styles, id } = fixture(
		'<div id=target style="font-weight:400">III</div>',
	);
	const before = rasterizeDocument(tree);
	const original = styles.text(id());
	tree.setAttribute(id(), "style", "font-weight:700");
	const after = rasterizeDocument(tree);
	expect(styles.text(id())).not.toBe(original);
	expect(after.image.pixels).not.toEqual(before.image.pixels);
	expect(
		after.layout.text.contexts
			.flatMap((context) => context.glyphs)
			.map((glyph) => ({
				x: glyph.x,
				y: glyph.y,
				advance: glyph.advance,
			})),
	).toEqual(
		before.layout.text.contexts
			.flatMap((context) => context.glyphs)
			.map((glyph) => ({
				x: glyph.x,
				y: glyph.y,
				advance: glyph.advance,
			})),
	);
	expect(after.layout.flowHeight).toBe(before.layout.flowHeight);
	tree.setAttribute(id(), "style", "font-weight:normal");
	expect(rasterizeDocument(tree).image.pixels).toEqual(before.image.pixels);
});

it("keeps inherited computed weight distinct from the selected bitmap face", () => {
	const { tree, styles, id } = fixture(
		'<section style="font-weight:650"><span id=target>I</span></section>',
	);
	expect(styles.text(id())["font-weight"]).toBe("650");
	expect(resolvedStyleValue(tree, id(), "font-weight")).toBe("650");
	const inherited = rasterizeDocument(tree);
	tree.setAttribute(id(), "style", "font-weight:700");
	expect(rasterizeDocument(tree).image.pixels).toEqual(inherited.image.pixels);
	tree.setAttribute(id(), "style", "font-weight:normal");
	expect(resolvedStyleValue(tree, id(), "font-weight")).toBe("400");
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(
		inherited.image.pixels,
	);
});

it("supports stylesheet weight cascade and preserves existing native UA defaults", () => {
	const { tree, styles, id } = fixture(
		'<div id=target style="font-weight:normal">I</div><b id=native>I</b>',
		"#target{font-weight:bold!important}",
	);
	expect(styles.text(id())["font-weight"]).toBe("700");
	expect(styles.text(id("#native"))["font-weight"]).toBe("400");
	tree.setAttribute(id(), "style", "font-weight:normal!important");
	expect(styles.text(id())["font-weight"]).toBe("400");
	expect(styles.metrics().issues).toEqual({});
});

it("keeps invalid weight declarations visible and blocks their applicable layout", () => {
	const { tree, styles } = fixture(
		"<div id=target>I</div>",
		"#target{font-weight:2000}",
	);
	expect(styles.metrics().issues["unimplemented-or-invalid-css-value"]).toBe(1);
	expect(
		styles.metrics().applicableIssues["unimplemented-or-invalid-css-value"],
	).toBe(1);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("preserves bold glyph clipping and existing work bounds", () => {
	const { tree } = fixture('<div id=target style="font-weight:bold">III</div>');
	const full = rasterizeDocument(tree);
	const clipped = rasterizeDocument(tree, {
		clip: { x: 2, y: 1, width: 9, height: 5 },
	});
	for (let row = 0; row < 5; row++)
		expect(clipped.image.pixels.slice(row * 9 * 4, (row + 1) * 9 * 4)).toEqual(
			full.image.pixels.slice(
				((row + 1) * 48 + 2) * 4,
				((row + 1) * 48 + 11) * 4,
			),
		);
	expect(() => rasterizeDocument(tree, { maxWork: 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([
	"<button id=target>I</button>",
	"<input id=target value=I>",
	"<textarea id=target>I</textarea>",
	"<select id=target><option>I</option></select>",
	"<input id=target type=file>",
])("applies the inherited face to native control captions: %s", (markup) => {
	const { tree, id } = fixture(markup, "#target{font-weight:400}");
	const normal = rasterizeDocument(tree);
	expect(normal.metrics.paintedControls).toBeGreaterThan(0);
	tree.setAttribute(id(), "style", "font-weight:700");
	const bold = rasterizeDocument(tree);
	expect(bold.image.pixels).not.toEqual(normal.image.pixels);
	expect(bold.layout.flowHeight).toBe(normal.layout.flowHeight);
	tree.setAttribute(id(), "style", "font-weight:400");
	expect(rasterizeDocument(tree).image.pixels).toEqual(normal.image.pixels);
});

it.each(["inside", "outside"])(
	"changes the %s numeric marker while its text remains regular",
	(position) => {
		const { tree, styles, id } = fixture(
			`<ol style="margin:0;padding-left:18px"><li id=target style="font-weight:400;list-style-position:${position}"><span style="font-weight:400">I</span></li></ol>`,
		);
		const normal = rasterizeDocument(tree);
		expect(styles.text(id("#target span"))["font-weight"]).toBe("400");
		tree.setAttribute(
			id(),
			"style",
			`font-weight:700;list-style-position:${position}`,
		);
		const bold = rasterizeDocument(tree);
		expect(styles.text(id("#target span"))["font-weight"]).toBe("400");
		expect(bold.image.pixels).not.toEqual(normal.image.pixels);
		expect(bold.layout.flowHeight).toBe(normal.layout.flowHeight);
	},
);

it("keeps unavailable face validation and marker bounds in the direct raster APIs", () => {
	const { tree, id } = fixture("<button id=target>I</button>");
	const control = describeControl(tree, id(), 8);
	if (!control) throw new Error("Missing software control");
	expect(() =>
		rasterizeControl(
			control,
			24,
			16,
			initialPaintStyle,
			() => {},
			500 as never,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	const marker = { type: "decimal", ordinal: 1 };
	const extent = disclosureMarkerExtent(marker, 8);
	const regular = rasterizeDisclosureMarker(
		marker,
		extent.width,
		extent.height,
		[0, 0, 0, 255],
		() => {},
		400,
	);
	const bold = rasterizeDisclosureMarker(
		marker,
		extent.width,
		extent.height,
		[0, 0, 0, 255],
		() => {},
		700,
	);
	expect(bold.pixels).not.toEqual(regular.pixels);
	expect(bold.width).toBe(regular.width);
	expect(bold.height).toBe(regular.height);
	expect(() =>
		rasterizeDisclosureMarker(
			marker,
			extent.width,
			extent.height,
			[0, 0, 0, 255],
			() => {},
			500 as never,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(() =>
		rasterizeDisclosureMarker(
			marker,
			extent.width - 1,
			extent.height,
			[0, 0, 0, 255],
			() => {},
			700,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("preserves authored inline keywords while exposing numeric computed weights", () => {
	const { tree, styles, id } = fixture(
		'<div id=target style="font-weight:normal">I</div>',
	);
	const inline = new InlineStyles(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	});
	const declaration = inline.get(id()) as {
		fontWeight: string;
		getPropertyValue(name: string): string;
		setProperty(name: string, value: string): void;
	};
	expect(declaration.fontWeight).toBe("normal");
	expect(resolvedStyleValue(tree, id(), "font-weight")).toBe("400");
	declaration.fontWeight = "bold";
	expect(declaration.getPropertyValue("font-weight")).toBe("bold");
	expect(resolvedStyleValue(tree, id(), "font-weight")).toBe("700");
	declaration.setProperty("font-weight", "650");
	expect(declaration.fontWeight).toBe("650");
	expect(styles.text(id())["font-weight"]).toBe("650");
	declaration.fontWeight = "inherit";
	expect(declaration.fontWeight).toBe("inherit");
	expect(resolvedStyleValue(tree, id(), "font-weight")).toBe("400");
	declaration.fontWeight = "1001";
	expect(declaration.fontWeight).toBe("inherit");
	inline.close();
});

it("baseline: normal font weight permits native checkbox activation", async () => {
	const url = "https://fixture.invalid/font-weight-click";
	const body = new TextEncoder().encode(
		`<!doctype html><style>${baseCss}#target{font-weight:normal}</style><input id=target type=checkbox>`,
	);
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				if (request.url !== url)
					throw new Error("Unexpected in-memory request");
				return {
					url,
					status: 200,
					headers: { "content-type": ["text/html"] },
					body,
					redirects: [],
					encodedBytes: body.byteLength,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: body.byteLength,
				decodedBytes: body.byteLength,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, url);
	const page = session.page(tab.id);
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing checkbox");
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			events.push(type),
		);
	expect(controlChecked(page.document, target)).toBe(false);
	await session.click(tab.id, page.document.reference(target));
	expect(controlChecked(page.document, target)).toBe(true);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(page.styles.text(target)["font-weight"]).toBe("400");
	expect(page.styles.metrics().applicableIssues).toEqual({});
	expect(requests.map((request) => request.url)).toEqual([url]);
});
