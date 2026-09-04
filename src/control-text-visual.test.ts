import { afterEach, expect, it, vi } from "vitest";
import { describeControl, rasterizeControl } from "./control-rendering.js";
import { controlValue } from "./controls.js";
import { initialPaintStyle } from "./css-paint.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import * as raster from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(markup = '<input id="field" size="6">', css = "") {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}input,textarea{font-size:8px;color:red}${css}</style>${markup}`,
		"https://fixture.invalid/control-text-visual",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(180, 100);
	const field = new DocumentQueries(tree).querySelector("#field");
	if (field === null) throw new Error("Missing field");
	const actions = documentInteractions(tree);
	return {
		tree,
		field,
		actions,
		fill: (value: string) => actions.fill(tree.reference(field), value),
		value: () => controlValue(tree, field),
		descriptor: () => describeControl(tree, field, 8),
		capture: () => rasterizeDocument(tree),
	};
}

function pixel(
	image: { width: number; pixels: Uint8Array },
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function selectedPixels(image: { pixels: Uint8Array }) {
	let count = 0;
	for (let offset = 0; offset < image.pixels.length; offset += 4)
		if (
			image.pixels[offset] === 181 &&
			image.pixels[offset + 1] === 213 &&
			image.pixels[offset + 2] === 255
		)
			count++;
	return count;
}

it("publishes and paints the native input caret without a document text glyph", () => {
	const test = fixture();
	test.fill("ABCD");
	expect(test.descriptor()).toMatchObject({
		selection: { anchor: 4, focus: 4, start: 4, end: 4, valueLength: 4 },
	});
	const result = test.capture();
	for (let vertical = 4; vertical < 12; vertical++)
		expect(pixel(result.image, 30, vertical)).toEqual([255, 0, 0, 255]);
	expect(result.metrics.paintedGlyphs).toBe(0);
	expect(test.value()).toBe("ABCD");
});

it("renders native select-all and replacement through the same control state", () => {
	const test = fixture();
	test.fill("ABCD");
	const before = test.capture();
	const revision = test.tree.revision;
	test.actions.keyboard.press("Control+A");
	expect(test.tree.revision).toBeGreaterThan(revision);
	const selected = test.capture();
	expect(selectedPixels(selected.image)).toBeGreaterThan(0);
	expect(selected.image.pixels).not.toEqual(before.image.pixels);
	expect(test.value()).toBe("ABCD");
	test.actions.keyboard.type("Q");
	expect(test.value()).toBe("Q");
	expect(selectedPixels(test.capture().image)).toBe(0);
	expect(test.descriptor()).toMatchObject({
		selection: { anchor: 1, focus: 1, start: 1, end: 1, valueLength: 1 },
	});
});

it("preserves reverse selection and canceled replacement pixels", () => {
	const test = fixture();
	test.fill("ABCD");
	test.actions.keyboard.press("Shift+ArrowLeft");
	test.actions.keyboard.press("Shift+ArrowLeft");
	expect(test.descriptor()).toMatchObject({
		selection: { anchor: 4, focus: 2, start: 2, end: 4, valueLength: 4 },
	});
	const before = test.capture();
	expect(selectedPixels(before.image)).toBeGreaterThan(0);
	test.actions.events.addEventListener(
		test.field,
		"beforeinput",
		(event) => event.preventDefault(),
		{ once: true },
	);
	expect(test.actions.keyboard.type("Q").canceled).toBe(true);
	expect(test.capture().image.pixels).toEqual(before.image.pixels);
	expect(test.value()).toBe("ABCD");
});

it("keeps an empty placeholder unselected and paints the value caret at its start", () => {
	const test = fixture('<input id="field" size="6" placeholder="Hint">');
	test.fill("");
	expect(test.descriptor()).toMatchObject({
		text: "Hint",
		placeholder: true,
		selection: { anchor: 0, focus: 0, start: 0, end: 0, valueLength: 0 },
	});
	const result = test.capture();
	expect(selectedPixels(result.image)).toBe(0);
	for (let vertical = 4; vertical < 12; vertical++)
		expect(pixel(result.image, 6, vertical)).toEqual([255, 0, 0, 255]);
	expect(test.value()).toBe("");
});

it("keeps selection metadata numeric for masked surrogate-containing passwords", () => {
	const test = fixture('<input id="field" type="password" size="6">');
	test.fill("a🙂b");
	test.actions.keyboard.press("Shift+ArrowLeft");
	test.actions.keyboard.press("Shift+ArrowLeft");
	expect(test.descriptor()).toMatchObject({
		text: "****",
		selection: { anchor: 4, focus: 1, start: 1, end: 4, valueLength: 4 },
	});
	expect(JSON.stringify(test.descriptor())).not.toContain("a🙂b");
	expect(JSON.stringify(test.capture().layout)).not.toContain("a🙂b");
	expect(selectedPixels(test.capture().image)).toBeGreaterThan(0);
});

it("makes the active edge of a long input visible and restores the start on Home", () => {
	const test = fixture('<input id="field" size="4">');
	test.fill("ABCDEFGHIJKLM");
	const end = test.capture();
	test.actions.keyboard.press("Home");
	const start = test.capture();
	expect(start.image.pixels).not.toEqual(end.image.pixels);
	expect(test.descriptor()).toMatchObject({ selection: { focus: 0 } });
	test.actions.keyboard.press("End");
	expect(test.capture().image.pixels).toEqual(end.image.pixels);
	expect(test.value()).toBe("ABCDEFGHIJKLM");
});

it("keeps the active textarea row visible without changing the value or box", () => {
	const test = fixture('<textarea id="field" cols="8" rows="2"></textarea>');
	test.fill("one\ntwo\nthree");
	const end = test.capture();
	test.actions.keyboard.press("Control+A");
	test.actions.keyboard.press("ArrowLeft");
	const start = test.capture();
	expect(start.image.pixels).not.toEqual(end.image.pixels);
	expect(start.layout.boxes).toEqual(end.layout.boxes);
	expect(test.descriptor()).toMatchObject({ selection: { focus: 0 } });
	expect(test.value()).toBe("one\ntwo\nthree");
});

it("does not overwrite a tiny textarea frame with caption or caret pixels", () => {
	const test = fixture(
		'<textarea id="field" rows="3"></textarea>',
		"textarea{width:10px;height:32px}",
	);
	test.fill("A");
	const result = test.capture();
	for (let offset = 0; offset < result.image.pixels.length; offset += 4)
		expect(
			result.image.pixels[offset] === 255 &&
				result.image.pixels[offset + 1] === 0 &&
				result.image.pixels[offset + 2] === 0,
		).toBe(false);
});

it("suppresses visual selection on blur and disability while retaining readonly selection", () => {
	const test = fixture();
	test.fill("ABCD");
	test.tree.setAttribute(test.field, "readonly", "");
	test.actions.keyboard.press("Control+A");
	expect(selectedPixels(test.capture().image)).toBeGreaterThan(0);
	test.actions.focus.blurElement(test.field);
	expect(test.descriptor()).not.toHaveProperty("selection");
	expect(selectedPixels(test.capture().image)).toBe(0);
	test.actions.focus.focus(test.tree.reference(test.field));
	test.tree.setAttribute(test.field, "disabled", "");
	expect(test.descriptor()).not.toHaveProperty("selection");
	expect(selectedPixels(test.capture().image)).toBe(0);
});

it("derives a current end caret after external value mutation without restoring stale selection", () => {
	const test = fixture();
	test.fill("ABCD");
	test.actions.keyboard.press("Control+A");
	test.tree.setControl(test.field, { value: "Q" });
	const revision = test.tree.revision;
	expect(test.descriptor()).toMatchObject({
		selection: { anchor: 1, focus: 1, start: 1, end: 1, valueLength: 1 },
	});
	expect(selectedPixels(test.capture().image)).toBe(0);
	expect(test.tree.revision).toBe(revision);
});

it("suppresses selection when the focused control becomes inert", () => {
	const test = fixture();
	test.fill("ABCD");
	test.actions.keyboard.press("Control+A");
	test.tree.setAttribute(test.field, "inert", "");
	expect(test.descriptor()).not.toHaveProperty("selection");
	expect(selectedPixels(test.capture().image)).toBe(0);
});

it.each(["email", "number"])(
	"does not promise native visual editing for %s",
	(type) => {
		const test = fixture(`<input id="field" type="${type}">`);
		test.actions.focus.focus(test.tree.reference(test.field));
		expect(test.descriptor()).not.toHaveProperty("selection");
	},
);

it("preserves translucent padding while clipping selected text", () => {
	const test = fixture();
	test.fill("ABCDEFGHIJKLM");
	test.actions.keyboard.press("Control+A");
	const control = test.descriptor();
	if (!control) throw new Error("Missing control");
	const image = rasterizeControl(
		control,
		24,
		16,
		{
			...initialPaintStyle,
			"background-color": [12, 34, 56, 128],
		},
		() => {},
	);
	expect(pixel(image, 2, 6)).toEqual([12, 34, 56, 128]);
	expect(pixel(image, 0, 6)).toEqual([0, 96, 192, 255]);
	expect(selectedPixels(image)).toBeGreaterThan(0);
});

it("rejects malformed selection after charging but before raster allocation", () => {
	const test = fixture();
	test.fill("AB");
	const control = test.descriptor();
	if (!control) throw new Error("Missing control");
	const charges: number[] = [];
	const allocate = vi.spyOn(raster, "createRaster");
	expect(() =>
		rasterizeControl(
			{
				...control,
				selection: { anchor: 0, focus: 1, start: 0, end: 2, valueLength: 2 },
			},
			24,
			16,
			initialPaintStyle,
			(amount) => charges.push(amount),
		),
	).toThrow();
	expect(charges).toEqual([24 * 16 * 8 + 2 * 64]);
	expect(allocate).not.toHaveBeenCalled();
});

it("does not paint hidden unsupported characters but rejects visible unsupported glyphs", () => {
	const test = fixture();
	test.fill("ABCD🙂");
	test.actions.keyboard.press("Home");
	const control = test.descriptor();
	if (!control) throw new Error("Missing control");
	expect(() =>
		rasterizeControl(control, 24, 16, initialPaintStyle, () => {}),
	).not.toThrow();
	test.actions.keyboard.press("End");
	const endControl = test.descriptor();
	if (!endControl) throw new Error("Missing control");
	expect(() =>
		rasterizeControl(endControl, 24, 16, initialPaintStyle, () => {}),
	).toThrow("glyph is not supported");
});

it("clips a partially visible unfocused textarea row instead of dropping its visible ink", () => {
	const test = fixture('<textarea id="field" cols="6" rows="4"></textarea>');
	test.fill("AA\nBB\nCC\nDD");
	test.actions.focus.blurElement(test.field);
	const control = test.descriptor();
	if (!control) throw new Error("Missing control");
	expect(control).not.toHaveProperty("selection");
	const image = rasterizeControl(
		control,
		48,
		36,
		{ ...initialPaintStyle, color: [255, 0, 0, 255] },
		() => {},
	);
	let partialInk = 0;
	for (let vertical = 28; vertical < 32; vertical++)
		for (let horizontal = 6; horizontal < 18; horizontal++)
			if (pixel(image, horizontal, vertical).join(",") === "255,0,0,255")
				partialInk++;
	expect(partialInk).toBeGreaterThan(0);
	for (let vertical = 32; vertical < 35; vertical++)
		for (let horizontal = 6; horizontal < 18; horizontal++)
			expect(pixel(image, horizontal, vertical)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 8, 35)).toEqual([96, 96, 96, 255]);
});
