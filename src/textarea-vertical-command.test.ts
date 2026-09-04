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
import { BrowserKeyboardEvent } from "./keyboard.js";
import { readNativeControlSelection } from "./native-control-caret.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

async function fixture(
	markup = '<textarea id="field" cols="20" rows="4"></textarea>',
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
	await host.execute(["open", "https://fixture.invalid/textarea-vertical"]);
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

const basic = "ABCDE\nX\n12345";

async function startAt(
	test: Awaited<ReturnType<typeof fixture>>,
	offset: number,
) {
	await test.host.execute(["press", "Control+A"]);
	await test.host.execute(["press", "ArrowLeft"]);
	for (let step = 0; step < offset; step++)
		await test.host.execute(["press", "ArrowRight"]);
}

function expectSelection(
	test: Awaited<ReturnType<typeof fixture>>,
	focus: number,
	anchor = focus,
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

it("navigates actual textarea rows while retaining the preferred column through a short row", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	const geometry = test.boxes();
	const dom = test.markup();
	const scroll = documentScroll(test.page.document).get();
	const inputs: string[] = [];
	for (const name of ["beforeinput", "input"])
		test.page.interactions.events.addEventListener(test.field, name, () =>
			inputs.push(name),
		);
	for (const [key, offset] of [
		["ArrowUp", 7],
		["ArrowUp", 5],
		["ArrowDown", 7],
		["ArrowDown", 13],
	] as const) {
		const result = await test.host.execute(["press", key]);
		expect(result.data).toMatchObject({
			keyboard: { canceled: false, selection: { start: offset, end: offset } },
		});
		expectSelection(test, offset);
	}
	expect(inputs).toEqual([]);
	expect(test.value()).toBe(basic);
	expect(test.markup()).toBe(dom);
	expect(test.boxes()).toEqual(geometry);
	expect(test.page.interactions.focus.active()).toBe(test.field);
	expect(documentScroll(test.page.document).get()).toEqual(scroll);
});

it("retains anchor13 over actual Shift vertical chords and replaces only the selected interval", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	for (const [key, offset] of [
		["Shift+ArrowUp", 7],
		["Shift+ArrowUp", 5],
		["Shift+ArrowDown", 7],
		["Shift+ArrowDown", 13],
	] as const) {
		await test.host.execute(["press", key]);
		expectSelection(test, offset, 13);
	}
	await test.host.execute(["press", "Shift+ArrowUp"]);
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("ABCDE\nXQ");
	expectSelection(test, 8);
});

it("retains x18 from offset3 across a short row using separate keydown and keyup commands", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	await startAt(test, 3);
	await test.host.execute(["keydown", "ArrowDown"]);
	expectSelection(test, 7);
	await test.host.execute(["keyup", "ArrowDown"]);
	expectSelection(test, 7);
	await test.host.execute(["keydown", "ArrowDown"]);
	expectSelection(test, 11);
	await test.host.execute(["keyup", "ArrowDown"]);
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("ABCDE\nX\n123Q45");
});

it("uses held Shift for separate vertical key commands and deletes the extended selection", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	await test.host.execute(["keydown", "Shift"]);
	try {
		for (const offset of [7, 5]) {
			await test.host.execute(["keydown", "ArrowUp"]);
			expectSelection(test, offset, 13);
			await test.host.execute(["keyup", "ArrowUp"]);
		}
	} finally {
		await test.host.execute(["keyup", "Shift"]);
	}
	await test.host.execute(["press", "Backspace"]);
	expect(test.value()).toBe("ABCDE");
});

it("resets preferred horizontal position after nonvertical Home movement", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	await test.host.execute(["press", "ArrowUp"]);
	expectSelection(test, 7);
	await test.host.execute(["press", "Home"]);
	expectSelection(test, 6);
	await test.host.execute(["press", "ArrowDown"]);
	expectSelection(test, 8);
});

it("resets the preferred column on pointer placement even at the current short-row endpoint", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	await test.host.execute(["press", "ArrowUp"]);
	expectSelection(test, 7);
	await test.click(glyphPoint(test, 6, 1));
	expectSelection(test, 7);
	await test.host.execute(["press", "ArrowDown"]);
	expectSelection(test, 9);
});

it("recomputes preferred horizontal position after native typing", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	await test.host.execute(["press", "ArrowUp"]);
	expectSelection(test, 7);
	await test.host.execute(["type", "Q"]);
	expect(test.value()).toBe("ABCDE\nXQ\n12345");
	await test.host.execute(["press", "ArrowDown"]);
	expectSelection(test, 11);
});

it("uses canonical following-row wrap stops instead of upstream duplicate offsets", async () => {
	const test = await fixture(
		'<textarea id="field" cols="3" rows="4"></textarea>',
	);
	await test.host.execute(["fill", "#field", "ABCDEF"]);
	await startAt(test, 2);
	for (const [key, offset] of [
		["ArrowDown", 5],
		["ArrowDown", 6],
		["ArrowUp", 5],
		["ArrowUp", 2],
	] as const) {
		await test.host.execute(["press", key]);
		expectSelection(test, offset);
	}
	const before = test.raster().image.pixels;
	await test.host.execute(["press", "ArrowDown"]);
	expect(test.raster().image.pixels).not.toEqual(before);
});

it("retains the preferred column through empty and trailing-newline rows", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", "ABCDE\n\n12345\n"]);
	await startAt(test, 3);
	for (const [key, offset] of [
		["ArrowDown", 6],
		["ArrowDown", 10],
		["ArrowDown", 13],
		["ArrowUp", 10],
	] as const) {
		await test.host.execute(["press", key]);
		expectSelection(test, offset);
	}
});

it("allows readonly vertical selection but keeps edits rejected", async () => {
	const test = await fixture(
		`<textarea id="field" cols="20" rows="4" readonly>${basic}</textarea>`,
	);
	test.page.interactions.focus.focus(test.page.document.reference(test.field));
	await test.host.execute(["press", "Shift+ArrowUp"]);
	expectSelection(test, 7, 13);
	await expect(test.host.execute(["type", "Q"])).rejects.toThrow("readonly");
	expect(test.value()).toBe(basic);
});

it("keeps canceled vertical keydown from moving selection or dispatching input", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	const before = test.selection();
	const pixels = test.raster().image.pixels;
	const inputs: string[] = [];
	for (const name of ["beforeinput", "input"])
		test.page.interactions.events.addEventListener(test.field, name, () =>
			inputs.push(name),
		);
	test.page.interactions.events.addEventListener(
		test.field,
		"keydown",
		(event) => event.preventDefault(),
		{ once: true },
	);
	expect((await test.host.execute(["press", "ArrowUp"])).data).toMatchObject({
		keyboard: { canceled: true },
	});
	expect(test.selection()).toEqual(before);
	expect(test.raster().image.pixels).toEqual(pixels);
	expect(inputs).toEqual([]);
});

it.each([true, false])(
	"uses captured vertical Shift=%s despite keydown-handler modifier changes",
	async (shifted) => {
		const test = await fixture();
		await test.host.execute(["fill", "#field", basic]);
		let captured: BrowserKeyboardEvent | undefined;
		test.page.interactions.events.addEventListener(
			test.field,
			"keydown",
			(event) => {
				if (!(event instanceof BrowserKeyboardEvent) || event.key !== "ArrowUp")
					return;
				captured = event;
				if (shifted) test.page.interactions.keyboard.up("Shift");
				else test.page.interactions.keyboard.down("Shift");
			},
		);
		try {
			if (shifted) await test.host.execute(["keydown", "Shift"]);
			await test.host.execute(["press", "ArrowUp"]);
			expect(captured?.shiftKey).toBe(shifted);
			expectSelection(test, 7, shifted ? 13 : 7);
		} finally {
			await test.host.execute(["keyup", "Shift"]);
		}
	},
);

it("does not navigate the original textarea after a keydown-handler focus redirect", async () => {
	const test = await fixture(
		'<textarea id="field" cols="20" rows="4"></textarea><input id="other" value="Other">',
	);
	await test.host.execute(["fill", "#field", basic]);
	const other = test.page.queries.querySelector("#other");
	if (other === null) throw Error("Missing other input");
	test.page.interactions.events.addEventListener(
		test.field,
		"keydown",
		() =>
			test.page.interactions.focus.focus(test.page.document.reference(other)),
		{ once: true },
	);
	await test.host.execute(["press", "ArrowUp"]);
	expect(test.page.interactions.focus.active()).toBe(other);
	expect(test.value()).toBe(basic);
	await test.host.execute(["type", "Q"]);
	expect(controlValue(test.page.document, other)).toBe("OtherQ");
});

it("does not apply a stale preferred column after relevant value replacement", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	await test.host.execute(["press", "ArrowUp"]);
	expectSelection(test, 7);
	test.page.document.setControl(test.field, { value: "AB\nC" });
	await test.host.execute(["press", "ArrowUp"]);
	expectSelection(test, 1);
	expect(test.value()).toBe("AB\nC");
});

it("recomputes row geometry and preferred column after textarea width changes", async () => {
	const test = await fixture();
	await test.host.execute(["fill", "#field", basic]);
	await test.host.execute(["press", "ArrowUp"]);
	expectSelection(test, 7);
	test.page.document.setAttribute(test.field, "style", "width:30px");
	await test.host.execute(["press", "ArrowDown"]);
	expectSelection(test, 9);
});

it("keeps root scroll and fixed textarea geometry unchanged during vertical selection", async () => {
	const test = await fixture(
		undefined,
		"#field{position:fixed;left:20px;top:30px}",
	);
	await test.host.execute(["fill", "#field", basic]);
	documentScroll(test.page.document).to(0, 80);
	const geometry = test.boxes();
	await test.host.execute(["press", "Shift+ArrowUp"]);
	expectSelection(test, 7, 13);
	expect(documentScroll(test.page.document).get()).toEqual({ x: 0, y: 80 });
	expect(test.boxes()).toEqual(geometry);
});

it.each(["ArrowUp", "ArrowDown", "Shift+ArrowUp", "Shift+ArrowDown"])(
	"retains input vertical no-op behavior for %s",
	async (key) => {
		const test = await fixture('<input id="field" value="ABCDE">');
		await test.host.execute(["fill", "#field", "ABCDE"]);
		const before = test.selection();
		await test.host.execute(["press", key]);
		expect(test.selection()).toEqual(before);
		expect(test.value()).toBe("ABCDE");
	},
);

it.each(["Control", "Meta", "Alt"])(
	"does not broaden %s-modified vertical textarea commands",
	async (modifier) => {
		const test = await fixture();
		await test.host.execute(["fill", "#field", basic]);
		const before = test.selection();
		await test.host.execute(["press", `${modifier}+ArrowUp`]);
		expect(test.selection()).toEqual(before);
		expect(test.value()).toBe(basic);
	},
);

it("drops closed textarea ownership and does not leak navigation state into a new host", async () => {
	const first = await fixture();
	await first.host.execute(["fill", "#field", basic]);
	await first.host.execute(["press", "ArrowUp"]);
	first.host.close();
	expect(first.selection()).toBeUndefined();
	await expect(first.host.execute(["press", "ArrowDown"])).rejects.toThrow(
		"closed",
	);
	const second = await fixture();
	await second.host.execute(["fill", "#field", "AB\nC"]);
	await second.host.execute(["press", "ArrowUp"]);
	expectSelection(second, 1);
});
