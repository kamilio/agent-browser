import { afterEach, expect, it } from "vitest";
import { capturePng } from "./capture-client.js";
import { BrowserCommandHost } from "./command-host.js";
import { describeControl } from "./control-rendering.js";
import { controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { existingDomRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { decodePng } from "./png-decoder.js";
import type { RasterImage } from "./raster.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

async function fixture(markup = '<input id="field" size="6">') {
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				return {
					url: request.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: 1,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			}),
			close() {},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(
				`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}input,textarea{font-size:8px;color:red}</style>${markup}`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/control-text"]);
	const page = session.page(session.tabs()[0].id);
	documentStyles(page.document).setViewport(180, 100);
	const field = page.queries.querySelector("#field");
	if (field === null) throw Error("Missing control fixture");
	const reference = page.document.reference(field);
	const descriptor = () => {
		const result = describeControl(page.document, field, 8);
		if (!result) throw Error("Missing software control descriptor");
		return result;
	};
	return {
		host,
		page,
		field,
		reference,
		descriptor,
		value: () => controlValue(page.document, field),
		raster: () => rasterizeDocument(page.document, { element: reference }),
		boxes: () => documentGeometry(page.document).getClientRects(field),
		markup: () => serializeHtml(page.document, page.document.root),
	};
}

function interior(image: Readonly<RasterImage>) {
	const pixels: number[] = [];
	for (let row = 1; row < image.height - 1; row++)
		for (let column = 1; column < image.width - 1; column++) {
			const offset = (row * image.width + column) * 4;
			pixels.push(...image.pixels.subarray(offset, offset + 4));
		}
	return pixels;
}

function fieldMarkup(kind: string, attributes = "", text = "") {
	return kind === "input"
		? `<input id="field" size="6" ${attributes}>`
		: `<textarea id="field" cols="6" rows="2" ${attributes}>${text}</textarea>`;
}

it.each(["input", "textarea"])(
	"connects native %s fill, select-all and replacement to numeric descriptors and pixels",
	async (kind) => {
		const { host, page, descriptor, value, raster, boxes, markup } =
			await fixture(fieldMarkup(kind));
		await host.execute(["fill", "#field", "Alpha"]);
		expect(value()).toBe("Alpha");
		expect(descriptor()).toMatchObject({
			selection: { anchor: 5, focus: 5, start: 5, end: 5, valueLength: 5 },
		});
		const before = raster();
		const geometry = boxes();
		const dom = markup();
		await host.execute(["press", "Control+A"]);
		expect(descriptor()).toMatchObject({
			selection: { anchor: 0, focus: 5, start: 0, end: 5, valueLength: 5 },
		});
		expect(interior(raster().image)).not.toEqual(interior(before.image));
		expect(value()).toBe("Alpha");
		expect(boxes()).toEqual(geometry);
		expect(markup()).toBe(dom);
		await host.execute(["type", "Q"]);
		expect(value()).toBe("Q");
		expect(descriptor()).toMatchObject({
			selection: { anchor: 1, focus: 1, start: 1, end: 1, valueLength: 1 },
		});
		expect(raster().metrics).toMatchObject({
			paintedCarets: 0,
			paintedSelectionGlyphs: 0,
		});
		expect(existingDomRangeOwner(page.document)).toBeUndefined();
	},
);

it.each(["input", "textarea"])(
	"preserves reverse %s selection and pixels when native replacement is canceled",
	async (kind) => {
		const { host, page, field, descriptor, value, raster, boxes, markup } =
			await fixture(fieldMarkup(kind));
		await host.execute(["fill", "#field", "Alpha"]);
		await host.execute(["press", "Shift+ArrowLeft"]);
		await host.execute(["press", "Shift+ArrowLeft"]);
		const before = descriptor();
		expect(before).toMatchObject({
			selection: { anchor: 5, focus: 3, start: 3, end: 5, valueLength: 5 },
		});
		const image = raster().image.pixels;
		const geometry = boxes();
		const dom = markup();
		page.interactions.events.addEventListener(
			field,
			"beforeinput",
			(event) => event.preventDefault(),
			{ once: true },
		);
		expect((await host.execute(["type", "Z"])).data).toMatchObject({
			canceled: true,
		});
		expect(value()).toBe("Alpha");
		expect(descriptor()).toEqual(before);
		expect(raster().image.pixels).toEqual(image);
		expect(boxes()).toEqual(geometry);
		expect(markup()).toBe(dom);
		await host.execute(["type", "Z"]);
		expect(value()).toBe("AlpZ");
		expect(descriptor()).toMatchObject({
			selection: { anchor: 4, focus: 4, start: 4, end: 4, valueLength: 4 },
		});
	},
);

it.each(["input", "textarea"])(
	"paints a logical empty %s caret without selecting placeholder text",
	async (kind) => {
		const { host, descriptor, value, raster, boxes } = await fixture(
			fieldMarkup(kind, 'placeholder="Hint"'),
		);
		const before = raster();
		const geometry = boxes();
		await host.execute(["click", "#field"]);
		expect(descriptor()).toMatchObject({
			text: "Hint",
			placeholder: true,
			selection: { anchor: 0, focus: 0, start: 0, end: 0, valueLength: 0 },
		});
		const focused = raster();
		expect(interior(focused.image)).not.toEqual(interior(before.image));
		await host.execute(["press", "Control+A"]);
		expect(descriptor()).toMatchObject({
			selection: { start: 0, end: 0, valueLength: 0 },
		});
		expect(raster().image.pixels).toEqual(focused.image.pixels);
		expect(value()).toBe("");
		expect(boxes()).toEqual(geometry);
		expect(focused.metrics.paintedCarets).toBe(0);
	},
);

it("keeps password values out of control descriptors, layouts and screenshot metadata", async () => {
	const { host, descriptor, value, raster } = await fixture(
		'<input id="field" type="password" size="12">',
	);
	const secret = "private-🙂-value";
	await host.execute(["fill", "#field", secret]);
	expect(value()).toBe(secret);
	expect(descriptor()).toMatchObject({
		text: "*".repeat(secret.length),
		selection: {
			anchor: secret.length,
			focus: secret.length,
			start: secret.length,
			end: secret.length,
			valueLength: secret.length,
		},
	});
	await host.execute(["press", "Control+A"]);
	expect(JSON.stringify(descriptor())).not.toContain(secret);
	const result = raster();
	expect(JSON.stringify(result.layout)).not.toContain(secret);
	expect(JSON.stringify(result.metrics)).not.toContain(secret);
	const captured = await capturePng((argv) => host.execute(argv), "#field");
	expect(JSON.stringify(captured.artifact)).not.toContain(secret);
	expect(decodePng(captured.bytes).image.pixels).toEqual(result.image.pixels);
	expect(captured.released).toBe(true);
	expect((await host.execute(["artifact-list"])).data).toEqual([]);
});

it.each(["input", "textarea"])(
	"scrolls native %s texture after Home/End without moving the document or control box",
	async (kind) => {
		const { host, page, descriptor, value, raster, boxes, markup } =
			await fixture(fieldMarkup(kind));
		const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
		await host.execute(["fill", "#field", text]);
		const end = raster();
		const geometry = boxes();
		const dom = markup();
		const scroll = documentScroll(page.document).get();
		await host.execute(["press", "Home"]);
		expect(descriptor()).toMatchObject({
			selection: {
				anchor: 0,
				focus: 0,
				start: 0,
				end: 0,
				valueLength: text.length,
			},
		});
		const home = raster();
		expect(interior(home.image)).not.toEqual(interior(end.image));
		await host.execute(["press", "End"]);
		expect(descriptor()).toMatchObject({
			selection: {
				anchor: text.length,
				focus: text.length,
				start: text.length,
				end: text.length,
				valueLength: text.length,
			},
		});
		expect(raster().image.pixels).toEqual(end.image.pixels);
		expect(value()).toBe(text);
		expect(boxes()).toEqual(geometry);
		expect(markup()).toBe(dom);
		expect(documentScroll(page.document).get()).toEqual(scroll);
	},
);

it.each(["input", "textarea"])(
	"allows readonly %s selection visuals but keeps native editing rejected",
	async (kind) => {
		const { host, value, descriptor, raster } = await fixture(
			fieldMarkup(kind, 'readonly value="fixed"', "fixed"),
		);
		await host.execute(["click", "#field"]);
		const before = raster();
		await host.execute(["press", "Control+A"]);
		expect(value()).toBe("fixed");
		expect(descriptor()).toMatchObject({
			selection: { anchor: 0, focus: 5, start: 0, end: 5, valueLength: 5 },
		});
		expect(interior(raster().image)).not.toEqual(interior(before.image));
		const selected = raster().image.pixels;
		await expect(host.execute(["type", "Q"])).rejects.toThrow("readonly");
		expect(value()).toBe("fixed");
		expect(raster().image.pixels).toEqual(selected);
	},
);

it.each(["disabled", "inert"])(
	"does not expose text selection or permit native filling of a %s control",
	async (attribute) => {
		const { host, descriptor, value, raster } = await fixture(
			`<input id="field" ${attribute} value="fixed">`,
		);
		const before = raster().image.pixels;
		await expect(
			host.execute(["fill", "#field", "Q", "--timeout=1"]),
		).rejects.toThrow();
		expect(value()).toBe("fixed");
		expect(Reflect.get(descriptor(), "selection")).toBeUndefined();
		expect(raster().image.pixels).toEqual(before);
	},
);

it("invalidates prepared control layout on selection-only movement, not a repeated no-op", async () => {
	const { host, page, descriptor, value, raster, boxes, markup } =
		await fixture();
	await host.execute(["fill", "#field", "Alpha"]);
	const prepared = prepareDocumentRaster(page.document);
	const before = raster();
	const geometry = boxes();
	const dom = markup();
	const revision = page.document.revision;
	const frozen = descriptor();
	await host.execute(["press", "Home"]);
	expect(page.document.revision).toBeGreaterThan(revision);
	expect(() => prepared.rasterize()).toThrow("stale");
	expect(interior(raster().image)).not.toEqual(interior(before.image));
	expect(frozen).toMatchObject({ selection: { start: 5, end: 5 } });
	expect(descriptor()).toMatchObject({ selection: { start: 0, end: 0 } });
	expect(value()).toBe("Alpha");
	expect(boxes()).toEqual(geometry);
	expect(markup()).toBe(dom);
	const homeRevision = page.document.revision;
	await host.execute(["press", "Home"]);
	expect(page.document.revision).toBe(homeRevision);
});

it("exports native selected control pixels and releases screenshot artifacts on success and read failure", async () => {
	const { host, raster } = await fixture();
	await host.execute(["fill", "#field", "Alpha"]);
	const before = await capturePng((argv) => host.execute(argv), "#field");
	await host.execute(["press", "Control+A"]);
	const selected = await capturePng((argv) => host.execute(argv), "#field");
	expect(decodePng(selected.bytes).image.pixels).toEqual(raster().image.pixels);
	expect(interior(decodePng(selected.bytes).image)).not.toEqual(
		interior(decodePng(before.bytes).image),
	);
	expect(selected.artifact.paint.paintedCarets).toBe(0);
	expect(before.released && selected.released).toBe(true);
	expect((await host.execute(["artifact-list"])).data).toEqual([]);
	await expect(
		capturePng(async (argv) => {
			if (argv[0] === "artifact-read")
				throw Error("Injected artifact read failure");
			return host.execute(argv);
		}, "#field"),
	).rejects.toThrow("Injected artifact read failure");
	expect((await host.execute(["artifact-list"])).data).toEqual([]);
	expect(host.metrics().captureArtifacts.artifacts).toBe(0);
});
