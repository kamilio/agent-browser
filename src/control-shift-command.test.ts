import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { describeControl } from "./control-rendering.js";
import { layoutControlText } from "./control-text-layout.js";
import { controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { existingDomRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { BrowserMouseEvent } from "./mouse.js";
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
	await host.execute(["open", "https://fixture.invalid/control-shift"]);
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

async function shiftClick(
	test: Awaited<ReturnType<typeof fixture>>,
	point: Readonly<{ x: number; y: number }>,
	button = "left",
) {
	await test.host.execute(["keydown", "Shift"]);
	try {
		return await test.click(point, button);
	} finally {
		await test.host.execute(["keyup", "Shift"]);
	}
}

function expectSelection(
	test: Awaited<ReturnType<typeof fixture>>,
	anchor: number,
	focus: number,
) {
	const expected = {
		anchor,
		focus,
		start: Math.min(anchor, focus),
		end: Math.max(anchor, focus),
		valueLength: test.value().length,
	};
	expect(test.selection()).toEqual(expected);
	expect(test.descriptor().selection).toEqual(expected);
	expect(existingDomRangeOwner(test.page.document)).toBeUndefined();
	expect(test.raster().metrics).toMatchObject({
		paintedCarets: 0,
		paintedSelectionGlyphs: 0,
	});
}

function markup(kind: string, attributes = "", value = "") {
	return kind === "input"
		? `<input id="field" size="10" ${attributes} value="${value}">`
		: `<textarea id="field" cols="10" rows="3" ${attributes}>${value}</textarea>`;
}

it.each(["input", "textarea"])(
	"extends focused %s forward from its anchor and replaces the selected value",
	async (kind) => {
		const test = await fixture(markup(kind));
		await test.host.execute(["fill", "#field", "ABCDE"]);
		await test.host.execute(["press", "Home"]);
		for (let step = 0; step < 3; step++)
			await test.host.execute(["press", "Shift+ArrowRight"]);
		const keyboardPixels = test.raster().image.pixels;
		await test.host.execute(["press", "Home"]);
		const geometry = test.boxes();
		const dom = test.markup();
		const scroll = documentScroll(test.page.document).get();
		const result = await shiftClick(test, glyphPoint(test, 3));
		expect(result.down.data).toMatchObject({
			mouse: { canceled: false, buttons: 1 },
		});
		expect(result.up.data).toMatchObject({
			mouse: { canceled: false, buttons: 0 },
		});
		expectSelection(test, 0, 3);
		expect(test.value()).toBe("ABCDE");
		expect(test.raster().image.pixels).toEqual(keyboardPixels);
		expect(test.boxes()).toEqual(geometry);
		expect(test.markup()).toBe(dom);
		expect(documentScroll(test.page.document).get()).toEqual(scroll);
		await test.host.execute(["type", "Q"]);
		expect(test.value()).toBe("QDE");
		expectSelection(test, 1, 1);
	},
);

it.each(["input", "textarea"])(
	"extends focused %s backward from its anchor and deletes only that interval",
	async (kind) => {
		const test = await fixture(markup(kind));
		await test.host.execute(["fill", "#field", "ABCDE"]);
		await shiftClick(test, glyphPoint(test, 2));
		expectSelection(test, 5, 2);
		expect(test.value()).toBe("ABCDE");
		await test.host.execute(["press", "Backspace"]);
		expect(test.value()).toBe("AB");
		expectSelection(test, 2, 2);
	},
);

it.each([false, true])(
	"preserves an existing noncollapsed anchor when reverse=%s",
	async (reverse) => {
		const test = await fixture();
		await test.host.execute(["fill", "#field", "ABCDE"]);
		if (!reverse) await test.host.execute(["press", "Home"]);
		for (let step = 0; step < 2; step++)
			await test.host.execute([
				"press",
				reverse ? "Shift+ArrowLeft" : "Shift+ArrowRight",
			]);
		expectSelection(test, reverse ? 5 : 0, reverse ? 3 : 2);
		await shiftClick(test, glyphPoint(test, reverse ? 1 : 4));
		expectSelection(test, reverse ? 5 : 0, reverse ? 1 : 4);
	},
);

it("crosses a reverse selection's anchor without replacing that anchor", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", "ABCDE"]);
	await test.click(glyphPoint(test, 3));
	await test.host.execute(["press", "Shift+ArrowLeft"]);
	await test.host.execute(["press", "Shift+ArrowLeft"]);
	expectSelection(test, 3, 1);
	await shiftClick(test, glyphPoint(test, 4));
	expectSelection(test, 3, 4);
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("ABCQE");
});

it("keeps unmodified pointer placement collapsed even when a selection exists", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", "ABCDE"]);
	await test.host.execute(["press", "Control+A"]);
	await test.click(glyphPoint(test, 2));
	expectSelection(test, 2, 2);
});

it("does not fabricate an anchor for a blurred control on Shift-click", async () => {
	const test = await fixture(markup("input", "", "ABCDE"));
	expect(test.descriptor().focused).toBe(false);
	await shiftClick(test, glyphPoint(test, 2));
	expectSelection(test, 2, 2);
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("ABQCDE");
});

it("keeps focused placeholder Shift-click at logical empty value offsets", async () => {
	const test = await fixture(markup("input", 'placeholder="Long hint"'));
	await test.click(glyphPoint(test, 0));
	await shiftClick(test, glyphPoint(test, 4));
	expectSelection(test, 0, 0);
	expect(test.value()).toBe("");
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("Q");
});

it.each(["input", "textarea"])(
	"allows readonly %s anchored selection but rejects value editing",
	async (kind) => {
		const test = await fixture(markup(kind, "readonly", "ABCDE"));
		await test.click(glyphPoint(test, 1));
		await shiftClick(test, glyphPoint(test, 4));
		expectSelection(test, 1, 4);
		const pixels = test.raster().image.pixels;
		await expect(test.host.execute(["type", "Q"])).rejects.toThrow("readonly");
		expect(test.value()).toBe("ABCDE");
		expect(test.raster().image.pixels).toEqual(pixels);
	},
);

it.each(["disabled", "inert"])(
	"does not publish anchored selection for a %s control",
	async (attribute) => {
		const test = await fixture(markup("input", attribute, "ABCDE"));
		await shiftClick(test, glyphPoint(test, 2));
		expect(test.selection()).toBeUndefined();
		expect(test.descriptor().selection).toBeUndefined();
		expect(test.value()).toBe("ABCDE");
	},
);

it("keeps existing selection on canceled shifted primary mousedown and preserves click cancellation semantics", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", "ABCDE"]);
	await test.host.execute(["press", "Shift+ArrowLeft"]);
	const before = test.selection();
	const pixels = test.raster().image.pixels;
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
	const result = await shiftClick(test, glyphPoint(test, 1));
	expect(result.down.data).toMatchObject({
		mouse: { canceled: true, buttons: 1 },
	});
	expect(result.up.data).toMatchObject({
		mouse: { canceled: false, buttons: 0 },
	});
	expect(clicks).toBe(1);
	expect(test.selection()).toEqual(before);
	expect(test.raster().image.pixels).toEqual(pixels);
});

it.each(["middle", "right"])(
	"does not extend selection on shifted %s mousedown",
	async (button) => {
		const test = await fixture();
		await test.host.execute(["fill", "#field", "ABCDE"]);
		await test.host.execute(["press", "Shift+ArrowLeft"]);
		const before = test.selection();
		await shiftClick(test, glyphPoint(test, 1), button);
		expect(test.selection()).toEqual(before);
		expect(test.value()).toBe("ABCDE");
	},
);

it("uses captured Shift even when a mousedown handler releases the held modifier", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", "ABCDE"]);
	let captured: BrowserMouseEvent | undefined;
	test.page.interactions.events.addEventListener(
		test.field,
		"mousedown",
		(event) => {
			if (!(event instanceof BrowserMouseEvent))
				throw Error("Expected native mouse event");
			captured = event;
			test.page.interactions.keyboard.up("Shift");
		},
		{ once: true },
	);
	await shiftClick(test, glyphPoint(test, 2));
	expect(captured?.shiftKey).toBe(true);
	expect(test.page.interactions.keyboard.modifiers().shift).toBe(false);
	expectSelection(test, 5, 2);
});

it("does not retroactively extend when a mousedown handler presses Shift", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", "ABCDE"]);
	let captured: BrowserMouseEvent | undefined;
	test.page.interactions.events.addEventListener(
		test.field,
		"mousedown",
		(event) => {
			if (!(event instanceof BrowserMouseEvent))
				throw Error("Expected native mouse event");
			captured = event;
			test.page.interactions.keyboard.down("Shift");
		},
		{ once: true },
	);
	try {
		await test.click(glyphPoint(test, 2));
		expect(captured?.shiftKey).toBe(false);
		expect(test.page.interactions.keyboard.modifiers().shift).toBe(true);
		expectSelection(test, 2, 2);
	} finally {
		await test.host.execute(["keyup", "Shift"]);
	}
});

it.each(["input", "textarea"])(
	"extends a scrolled %s from the pre-placement texture without freezing internal scroll",
	async (kind) => {
		const test = await fixture(
			kind === "input"
				? '<input id="field" size="4">'
				: '<textarea id="field" cols="4" rows="2"></textarea>',
		);
		const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
		await test.host.execute(["fill", "#field", text]);
		const displayed = test.texture();
		expect(
			displayed.layout.scroll.x + displayed.layout.scroll.y,
		).toBeGreaterThan(0);
		const glyph = displayed.layout.glyphs.find(
			(entry) =>
				entry.x >= displayed.layout.clip.x &&
				entry.y >= displayed.layout.clip.y,
		);
		if (!glyph) throw Error("Missing displayed scrolled glyph");
		const point = displayed.point(glyph.x, glyph.y + glyph.height / 2);
		const scroll = documentScroll(test.page.document).get();
		const boxes = test.boxes();
		await shiftClick(test, point);
		expectSelection(test, text.length, glyph.offset);
		expect(test.texture().layout.caret).toBeUndefined();
		expect(test.texture().layout.selectionRectangles.length).toBeGreaterThan(0);
		expect(documentScroll(test.page.document).get()).toEqual(scroll);
		expect(test.boxes()).toEqual(boxes);
		await test.host.execute(["type", "Q"]);
		expect(test.value()).toBe(`${text.slice(0, glyph.offset)}Q`);
	},
);

it("extends masked password selection only between native surrogate-safe numeric boundaries", async () => {
	const test = await fixture(markup("input", 'type="password"'));
	const secret = "A🙂B";
	await test.host.execute(["fill", "#field", secret]);
	const result = await shiftClick(test, glyphPoint(test, 2));
	expectSelection(test, 4, 3);
	expect(test.descriptor().text).toBe("****");
	expect(
		JSON.stringify([
			result,
			test.selection(),
			test.descriptor(),
			test.raster().layout,
			test.raster().metrics,
		]),
	).not.toContain(secret);
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("A🙂Q");
});
