import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { describeControl } from "./control-rendering.js";
import { layoutControlText } from "./control-text-layout.js";
import { controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { existingDomRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { readNativeControlSelection } from "./native-control-caret.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

async function fixture(
	markup = '<input id="field" size="10">',
	css = "",
	prefix = "",
) {
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
				`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}input,textarea{font-size:8px;color:red}${css}</style>${prefix}${markup}<div style="height:600px"></div>`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/control-pointer"]);
	const page = session.page(session.tabs()[0].id);
	documentStyles(page.document).setViewport(240, 180);
	const field = page.queries.querySelector("#field");
	if (field === null) throw Error("Missing field");
	const geometry = documentGeometry(page.document);
	const descriptor = () => {
		const result = describeControl(page.document, field, 8);
		if (!result) throw Error("Missing software control");
		return result;
	};
	const texture = () => {
		const control = descriptor();
		if (control.kind !== "text" && control.kind !== "textarea")
			throw Error("Not a text control");
		const rect = geometry.getBoundingClientRect(field);
		const used = geometry.getUsedStyle(field);
		if (!used) throw Error("Missing used box edges");
		const edge = (side: string) =>
			(used[`border-${side}-width`] ?? 0) + (used[`padding-${side}`] ?? 0);
		const width = rect.width - edge("left") - edge("right");
		const height = rect.height - edge("top") - edge("bottom");
		const columns = Math.ceil(width);
		const rows = Math.ceil(height);
		const layout = layoutControlText({
			kind: control.kind,
			text: control.text,
			fontSize: control.fontSize,
			columns,
			rows,
			placeholder: control.placeholder,
			selection: control.selection,
		});
		const point = (x: number, y: number) => ({
			x: rect.x + edge("left") + (x * width) / columns,
			y: rect.y + edge("top") + (y * height) / rows,
		});
		return { layout, point, rect };
	};
	const move = (point: Readonly<{ x: number; y: number }>) =>
		host.execute(["mousemove", String(point.x), String(point.y)]);
	const click = async (
		point: Readonly<{ x: number; y: number }>,
		button = "left",
	) => {
		await move(point);
		const down = await host.execute(["mousedown", button]);
		const up = await host.execute(["mouseup", button]);
		return { down, up };
	};
	return {
		host,
		page,
		field,
		descriptor,
		texture,
		move,
		click,
		value: () => controlValue(page.document, field),
		selection: () => readNativeControlSelection(page.document, field),
		raster: () =>
			rasterizeDocument(page.document, {
				element: page.document.reference(field),
			}),
		boxes: () => geometry.getClientRects(field),
		markup: () => serializeHtml(page.document, page.document.root),
	};
}

function glyphPoint(
	test: Awaited<ReturnType<typeof fixture>>,
	offset: number,
	fraction = 0,
) {
	const texture = test.texture();
	const glyph = texture.layout.glyphs.find((entry) => entry.offset === offset);
	if (!glyph) throw Error(`Missing visible source glyph ${offset}`);
	return texture.point(
		glyph.x + fraction * glyph.width,
		glyph.y + glyph.height / 2,
	);
}

function expectSelection(
	test: Awaited<ReturnType<typeof fixture>>,
	offset: number,
) {
	const expected = {
		anchor: offset,
		focus: offset,
		start: offset,
		end: offset,
		valueLength: test.value().length,
	};
	expect(test.selection()).toEqual(expected);
	expect(test.descriptor().selection).toEqual(expected);
	expect(existingDomRangeOwner(test.page.document)).toBeUndefined();
	expect(test.raster().metrics.paintedCarets).toBe(0);
}

it.each(["text", "search", "url", "tel"])(
	"places actual primary mouse input at the left edge of %s before native typing",
	async (type) => {
		const test = await fixture(`<input id="field" type="${type}" size="10">`);
		await test.host.execute(["fill", "#field", "Alpha"]);
		const boxes = test.boxes();
		const markup = test.markup();
		const scroll = documentScroll(test.page.document).get();
		const result = await test.click(glyphPoint(test, 0));
		expect(result.down.data).toMatchObject({
			mouse: { buttons: 1, canceled: false },
		});
		expect(result.up.data).toMatchObject({
			mouse: { buttons: 0, canceled: false },
		});
		expectSelection(test, 0);
		expect(test.value()).toBe("Alpha");
		expect(test.boxes()).toEqual(boxes);
		expect(test.markup()).toBe(markup);
		expect(documentScroll(test.page.document).get()).toEqual(scroll);
		await test.host.execute(["type", "Q"]);
		expect(test.value()).toBe("QAlpha");
		await test.host.execute(["press", "Delete"]);
		expect(test.value()).toBe("Qlpha");
	},
);

it.each([
	[0.25, 2],
	[0.5, 3],
	[0.75, 3],
] as const)(
	"uses nearest glyph boundary with fractional cell position %s",
	async (fraction, expected) => {
		const test = await fixture();
		await test.host.execute(["fill", "#field", "ABCDE"]);
		await test.click(glyphPoint(test, 2, fraction));
		expectSelection(test, expected);
	},
);

it("places the text end at the final visible glyph edge", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", "Alpha"]);
	await test.host.execute(["press", "Home"]);
	await test.click(glyphPoint(test, 4, 1));
	expectSelection(test, 5);
});

it("uses the initially blurred long input's displayed viewport, not its later focused scroll", async () => {
	const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	const test = await fixture(`<input id="field" size="4" value="${text}">`);
	expect(test.descriptor().focused).toBe(false);
	expect(test.texture().layout.scroll.x).toBe(0);
	const point = glyphPoint(test, 1);
	await test.click(point);
	expectSelection(test, 1);
	await test.host.execute(["type", "!"]);
	expect(test.value()).toBe("A!BCDEFGHIJKLMNOPQRSTUVWXYZ");
});

it("hits the displayed scrolled input before recomputing scroll for the selected offset", async () => {
	const test = await fixture('<input id="field" size="4">');
	await test.host.execute(["fill", "#field", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);
	const texture = test.texture();
	expect(texture.layout.scroll.x).toBeGreaterThan(0);
	const glyph = texture.layout.glyphs.find(
		(entry) => entry.x >= texture.layout.clip.x,
	);
	if (!glyph) throw Error("Missing visible scrolled glyph");
	await test.click(texture.point(glyph.x, glyph.y + glyph.height / 2));
	expectSelection(test, glyph.offset);
});

it.each([
	["AB\nCD", 4],
	["ABCDEFGHI", 5],
] as const)(
	"places textarea row/wrap source offsets in %s",
	async (text, offset) => {
		const test = await fixture(
			'<textarea id="field" cols="4" rows="3"></textarea>',
		);
		await test.host.execute(["fill", "#field", text]);
		await test.click(glyphPoint(test, offset));
		expectSelection(test, offset);
		await test.host.execute(["type", "!"]);
		expect(test.value()).toBe(`${text.slice(0, offset)}!${text.slice(offset)}`);
	},
);

it("places the logical empty trailing textarea line", async () => {
	const test = await fixture(
		'<textarea id="field" cols="4" rows="3"></textarea>',
	);
	await test.host.execute(["fill", "#field", "AB\n"]);
	const texture = test.texture();
	const caret = texture.layout.caret;
	if (!caret) throw Error("Missing trailing-line caret");
	const point = texture.point(caret.x, caret.y + caret.height / 2);
	await test.host.execute(["press", "ArrowLeft"]);
	await test.click(point);
	expectSelection(test, 3);
});

it("keeps placeholder clicks at logical zero instead of selecting the hint", async () => {
	const test = await fixture(
		'<input id="field" size="10" placeholder="Long hint">',
	);
	await test.click(glyphPoint(test, 5));
	expectSelection(test, 0);
	expect(test.value()).toBe("");
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("Q");
});

it("places masked passwords only at native surrogate-safe boundaries without raw result metadata", async () => {
	const secret = "A🙂B";
	const test = await fixture('<input id="field" type="password" size="10">');
	await test.host.execute(["fill", "#field", secret]);
	const result = await test.click(glyphPoint(test, 2));
	expectSelection(test, 3);
	expect(test.descriptor().text).toBe("****");
	expect(
		JSON.stringify([
			result,
			test.descriptor(),
			test.raster().metrics,
			test.raster().layout,
		]),
	).not.toContain(secret);
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("A🙂QB");
});

it("allows readonly point placement without permitting native value editing", async () => {
	const test = await fixture(
		'<input id="field" size="10" readonly value="Alpha">',
	);
	await test.click(glyphPoint(test, 2));
	expectSelection(test, 2);
	await expect(test.host.execute(["type", "Q"])).rejects.toThrow("readonly");
	expect(test.value()).toBe("Alpha");
});

it("preserves selection on canceled primary mousedown while retaining the later click event", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", "Alpha"]);
	await test.host.execute(["press", "Home"]);
	const before = test.selection();
	let clicks = 0;
	test.page.interactions.events.addEventListener(
		test.field,
		"mousedown",
		(event) => event.preventDefault(),
		{ once: true },
	);
	test.page.interactions.events.addEventListener(
		test.field,
		"click",
		() => clicks++,
	);
	const result = await test.click(glyphPoint(test, 3));
	expect(result.down.data).toMatchObject({
		mouse: { canceled: true, buttons: 1 },
	});
	expect(result.up.data).toMatchObject({
		mouse: { canceled: false, buttons: 0 },
	});
	expect(clicks).toBe(1);
	expect(test.selection()).toEqual(before);
});

it.each(["middle", "right"])(
	"does not place a text caret on %s mousedown",
	async (button) => {
		const test = await fixture();
		await test.host.execute(["fill", "#field", "Alpha"]);
		await test.host.execute(["press", "Home"]);
		const before = test.selection();
		await test.click(glyphPoint(test, 3), button);
		expect(test.selection()).toEqual(before);
		expect(test.value()).toBe("Alpha");
	},
);

it.each(["disabled", "inert"])(
	"does not establish point selection for a %s control",
	async (attribute) => {
		const test = await fixture(
			`<input id="field" size="10" ${attribute} value="Alpha">`,
		);
		await test.click(glyphPoint(test, 2));
		expect(test.descriptor().selection).toBeUndefined();
		expect(test.selection()).toBeUndefined();
		expect(test.value()).toBe("Alpha");
	},
);

it("invalidates selection-only cached layout and paints the same state as keyboard Home", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", "Alpha"]);
	await test.host.execute(["press", "Home"]);
	const home = test.raster().image.pixels;
	await test.host.execute(["press", "End"]);
	const prepared = prepareDocumentRaster(test.page.document);
	const before = test.selection();
	const geometry = test.boxes();
	await test.click(glyphPoint(test, 0));
	expectSelection(test, 0);
	expect(before).toMatchObject({ start: 5, end: 5 });
	expect(() => prepared.rasterize()).toThrow("stale");
	expect(test.raster().image.pixels).toEqual(home);
	expect(test.boxes()).toEqual(geometry);
});

it.each(["static", "fixed"])(
	"uses actual %s client coordinates after root scroll with decorated fractional content sizing",
	async (position) => {
		const test = await fixture(
			'<input id="field" size="10">',
			`#field{position:${position};left:20px;top:30px;width:83.5px;height:20.5px;padding:3px 5px;border:2px solid blue;box-sizing:content-box}`,
			'<div style="height:100px"></div>',
		);
		await test.host.execute(["fill", "#field", "Alpha"]);
		documentScroll(test.page.document).to(0, 80);
		const geometry = test.boxes();
		await test.click(glyphPoint(test, 2));
		expectSelection(test, 2);
		expect(test.boxes()).toEqual(geometry);
		expect(documentScroll(test.page.document).get()).toEqual({ x: 0, y: 80 });
	},
);

it("clamps a CSS padding click to the text start rather than treating it as texture advance", async () => {
	const test = await fixture(
		undefined,
		"#field{padding:4px 12px;border:2px solid blue}",
	);
	await test.host.execute(["fill", "#field", "Alpha"]);
	const rect = test.texture().rect;
	await test.click({ x: rect.x + 3, y: rect.y + rect.height / 2 });
	expectSelection(test, 0);
});

it("keeps a focus-handler redirect on another control instead of publishing the original pointer offset", async () => {
	const test = await fixture(
		'<input id="field" size="10" value="Alpha"><input id="other" size="10" value="Other">',
	);
	const other = test.page.queries.querySelector("#other");
	if (other === null) throw Error("Missing redirected control");
	const point = glyphPoint(test, 1);
	test.page.interactions.events.addEventListener(
		test.field,
		"focus",
		() =>
			test.page.interactions.focus.focus(test.page.document.reference(other)),
		{ once: true },
	);
	const result = await test.click(point);
	expect(result.down.data).toMatchObject({
		mouse: { canceled: false, buttons: 1 },
	});
	expect(result.up.data).toMatchObject({
		mouse: { canceled: false, buttons: 0 },
	});
	expect(test.page.interactions.focus.active()).toBe(other);
	expect(test.selection()).toBeUndefined();
	expect(test.value()).toBe("Alpha");
	await test.host.execute(["type", "Q"]);
	expect(controlValue(test.page.document, other)).toBe("OtherQ");
	expect(test.value()).toBe("Alpha");
	expect(existingDomRangeOwner(test.page.document)).toBeUndefined();
});

it("skips point publication when a focus handler removes the original control", async () => {
	const test = await fixture('<input id="field" size="10" value="Alpha">');
	const point = glyphPoint(test, 1);
	test.page.interactions.events.addEventListener(
		test.field,
		"focus",
		() => test.page.document.remove(test.field),
		{ once: true },
	);
	const result = await test.click(point);
	expect(result.down.data).toMatchObject({
		mouse: { canceled: false, buttons: 1 },
	});
	expect(result.up.data).toMatchObject({ mouse: { buttons: 0 } });
	expect(test.page.document.isConnected(test.field)).toBe(false);
	expect(test.page.interactions.focus.active()).toBeNull();
	expect(test.selection()).toBeUndefined();
	expect(test.value()).toBe("Alpha");
	expect(existingDomRangeOwner(test.page.document)).toBeUndefined();
});

it("rejects a focus-handler box change without rolling back layout or applying the stale pointer offset", async () => {
	const test = await fixture('<input id="field" size="10" value="Alpha">');
	const point = glyphPoint(test, 1);
	const before = test.boxes();
	test.page.interactions.events.addEventListener(
		test.field,
		"focus",
		() =>
			test.page.document.setAttribute(test.field, "style", "padding-left:20px"),
		{ once: true },
	);
	await test.move(point);
	await expect(test.host.execute(["mousedown", "left"])).rejects.toMatchObject({
		code: "not-actionable",
		message: "Control pointer target changed during focus",
	});
	await test.host.execute(["mouseup", "left"]);
	expect(test.page.interactions.focus.active()).toBe(test.field);
	expect(test.boxes()).not.toEqual(before);
	expect(test.page.document.get(test.field).attributes.style).toBe(
		"padding-left:20px",
	);
	expect(test.selection()).toBeUndefined();
	expect(test.value()).toBe("Alpha");
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("AlphaQ");
});
