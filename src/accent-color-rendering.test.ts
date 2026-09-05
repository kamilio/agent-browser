import { afterEach, expect, it } from "vitest";
import { describeControl, rasterizeControl } from "./control-rendering.js";
import { controlChecked, controlValue } from "./controls.js";
import type { CssColor } from "./css-color.js";
import { type PaintStyle, initialPaintStyle } from "./css-paint.js";
import { documentGeometry } from "./document-geometry.js";
import {
	type DocumentRaster,
	prepareDocumentRaster,
	rasterizeDocument,
} from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import type { RasterImage, Rgba } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const white: Rgba = [255, 255, 255, 255];
const black: Rgba = [0, 0, 0, 255];
const textColor: Rgba = [17, 34, 51, 255];
const widgetKinds = ["checkbox", "indeterminate", "radio"] as const;
type WidgetKind = (typeof widgetKinds)[number];

const masks: Record<WidgetKind, readonly string[]> = {
	checkbox: [
		"EEEEEEEEEE",
		"EFFFFFFFFE",
		"EFMMMMMMFE",
		"EFMMMMMMFE",
		"EFMMMMMMFE",
		"EFMMMMMMFE",
		"EFMMMMMMFE",
		"EFMMMMMMFE",
		"EFFFFFFFFE",
		"EEEEEEEEEE",
	],
	indeterminate: [
		"EEEEEEEEEE",
		"EFFFFFFFFE",
		"EFFFFFFFFE",
		"EFFFFFFFFE",
		"EFFFFFFFFE",
		"EFMMMMMMFE",
		"EFMMMMMMFE",
		"EFFFFFFFFE",
		"EFFFFFFFFE",
		"EEEEEEEEEE",
	],
	radio: [
		"...EEEE...",
		".EEFFFFEE.",
		".EFFFFFFE.",
		"EFFMMMMFFE",
		"EFFMMMMFFE",
		"EFFMMMMFFE",
		"EFFMMMMFFE",
		".EFFFFFFE.",
		".EEFFFFEE.",
		"...EEEE...",
	],
};

const palettes: readonly {
	css: string;
	input: Rgba;
	fill: Rgba;
	mark: Rgba;
}[] = [
	{ css: "red", input: [255, 0, 0, 255], fill: [255, 0, 0, 255], mark: black },
	{ css: "navy", input: [0, 0, 128, 255], fill: [0, 0, 128, 255], mark: white },
	{
		css: "yellow",
		input: [255, 255, 0, 255],
		fill: [255, 255, 0, 255],
		mark: black,
	},
	{
		css: "green",
		input: [0, 128, 0, 255],
		fill: [0, 128, 0, 255],
		mark: white,
	},
	{
		css: "rgba(0,0,255,0.5)",
		input: [0, 0, 255, 128],
		fill: [127, 127, 255, 255],
		mark: black,
	},
	{
		css: "rgba(0,128,0,0.5)",
		input: [0, 128, 0, 128],
		fill: [127, 191, 127, 255],
		mark: black,
	},
	{ css: "transparent", input: [0, 0, 0, 0], fill: white, mark: black },
	{
		css: "#757575",
		input: [117, 117, 117, 255],
		fill: [117, 117, 117, 255],
		mark: white,
	},
	{
		css: "#767676",
		input: [118, 118, 118, 255],
		fill: [118, 118, 118, 255],
		mark: black,
	},
];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function scene(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}#scope{color:#123}input,textarea,button,select{display:block;font-size:8px;color:inherit}input[type=checkbox],input[type=radio]{width:10px;height:10px}${css}</style><div id="scope">${markup}</div><p>ABC</p>`,
		"https://fixture.invalid/accent-color-rendering",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(240, 100);
	const queries = new DocumentQueries(tree);
	const required = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = required("#target");
	const scope = required("#scope");
	const actions = documentInteractions(tree);
	const geometry = documentGeometry(tree);
	const descriptor = () => {
		const result = describeControl(tree, target, 8);
		if (!result) throw new Error("Missing control descriptor");
		return result;
	};
	const capture = () => rasterizeDocument(tree);
	const style = (value: string, node = target) =>
		tree.setAttribute(node, "style", value);
	const state = () => ({
		value: controlValue(tree, target),
		checked: controlChecked(tree, target),
		control: { ...tree.get(target).control },
		descriptor: descriptor(),
		rectangle: geometry.getBoundingClientRect(target),
	});
	return {
		tree,
		target,
		scope,
		actions,
		geometry,
		descriptor,
		capture,
		style,
		state,
		required,
	};
}

function widget(kind: WidgetKind) {
	const result = scene(
		`<input id="target" type="${kind === "radio" ? "radio" : "checkbox"}" value="kept" ${kind === "indeterminate" ? "" : "checked"}>`,
	);
	if (kind === "indeterminate")
		result.tree.setControl(result.target, { indeterminate: true });
	return result;
}

function paint(
	accent?: CssColor | "auto",
): PaintStyle & { readonly "accent-color"?: CssColor | "auto" } {
	return {
		...initialPaintStyle,
		color: textColor,
		...(accent === undefined ? {} : { "accent-color": accent }),
	};
}

function pixel(
	image: Readonly<RasterImage>,
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function matchesMask(
	image: Readonly<RasterImage>,
	kind: WidgetKind,
	fill: Rgba,
	mark: Rgba,
	focused = false,
	exterior: Rgba = white,
) {
	const colors: Record<string, Rgba> = {
		".": exterior,
		E: focused ? [0, 96, 192, 255] : [96, 96, 96, 255],
		F: fill,
		M: mark,
	};
	for (let vertical = 0; vertical < 10; vertical++) {
		for (let horizontal = 0; horizontal < 10; horizontal++) {
			expect(
				pixel(image, horizontal, vertical),
				`${kind} pixel ${horizontal},${vertical}`,
			).toEqual(colors[masks[kind][vertical][horizontal]]);
		}
	}
}

function onlyInteriorChanges(
	before: DocumentRaster,
	after: DocumentRaster,
	kind: WidgetKind,
) {
	expect(after.layout.boxes).toEqual(before.layout.boxes);
	expect(after.image.width).toBe(before.image.width);
	expect(after.image.height).toBe(before.image.height);
	let changed = 0;
	for (let vertical = 0; vertical < before.image.height; vertical++) {
		for (let horizontal = 0; horizontal < before.image.width; horizontal++) {
			const offset = (vertical * before.image.width + horizontal) * 4;
			if (
				before.image.pixels
					.subarray(offset, offset + 4)
					.every(
						(channel, index) => channel === after.image.pixels[offset + index],
					)
			)
				continue;
			const cell = masks[kind][vertical]?.[horizontal];
			expect(
				cell === "F" || cell === "M",
				`outside widget interior ${horizontal},${vertical}`,
			).toBe(true);
			changed++;
		}
	}
	expect(changed).toBeGreaterThan(0);
}

for (const kind of widgetKinds) {
	it.each(palettes)(
		`uses the independent $css native ${kind} palette`,
		({ input, fill, mark }) => {
			const test = widget(kind);
			const before = test.state();
			const result = rasterizeControl(
				test.descriptor(),
				10,
				10,
				paint(input),
				() => {},
			);
			matchesMask(result, kind, fill, mark);
			expect(test.state()).toEqual(before);
		},
	);
}

it.each(widgetKinds)(
	"precomposes %s alpha against white, not the author background",
	(kind) => {
		const test = widget(kind);
		const background: Rgba = [0, 0, 255, 255];
		const styled = {
			...paint(palettes[5].input),
			"background-color": background,
		};
		const result = rasterizeControl(
			test.descriptor(),
			10,
			10,
			styled,
			() => {},
		);
		matchesMask(result, kind, [127, 191, 127, 255], black, false, background);
	},
);

it.each(widgetKinds)(
	"preserves the exact default and auto %s painter",
	(kind) => {
		const test = widget(kind);
		const descriptor = test.descriptor();
		const before = rasterizeControl(descriptor, 10, 10, paint(), () => {});
		matchesMask(before, kind, white, textColor);
		expect(
			rasterizeControl(descriptor, 10, 10, paint("auto"), () => {}).pixels,
		).toEqual(before.pixels);
		const actual = test.capture();
		matchesMask(actual.image, kind, white, textColor);
		expect(test.geometry.getBoundingClientRect(test.target)).toMatchObject({
			x: 0,
			y: 0,
			width: 10,
			height: 10,
		});
	},
);

for (const kind of widgetKinds) {
	it.each([palettes[0], palettes[5], palettes[6]])(
		`paints actual CSS $css ${kind} only within the fixed widget interior`,
		({ css, fill, mark }) => {
			const test = widget(kind);
			const before = test.capture();
			const state = test.state();
			test.style(`accent-color:${css}`);
			const after = test.capture();
			onlyInteriorChanges(before, after, kind);
			matchesMask(after.image, kind, fill, mark);
			expect(test.state()).toEqual(state);
			expect(after.metrics.paintedControls).toBe(1);
		},
	);
}

it.each([
	["checkbox", false, false, false],
	["radio", false, false, false],
	["checkbox", true, false, true],
	["checkbox", false, true, true],
	["radio", true, false, true],
] as const)(
	"leaves %s checked=%s indeterminate=%s disabled=%s unchanged",
	(kind, checked, indeterminate, disabled) => {
		const test = widget(kind);
		test.tree.setControl(test.target, { checked, indeterminate });
		if (disabled) test.tree.setAttribute(test.target, "disabled", "");
		const state = test.state();
		const descriptor = test.descriptor();
		const native = rasterizeControl(descriptor, 10, 10, paint(), () => {});
		for (const accent of [palettes[0].input, palettes[6].input]) {
			expect(
				rasterizeControl(descriptor, 10, 10, paint(accent), () => {}).pixels,
			).toEqual(native.pixels);
		}
		const before = test.capture();
		test.style("accent-color:red");
		expect(test.capture().image.pixels).toEqual(before.image.pixels);
		expect(test.state()).toEqual(state);
	},
);

it.each(widgetKinds)(
	"resolves inherited currentcolor using the receiving %s foreground",
	(kind) => {
		const test = widget(kind);
		test.style("color:navy");
		const before = test.capture();
		const state = test.state();
		test.style("color:red;accent-color:currentcolor", test.scope);
		const current = test.capture();
		matchesMask(current.image, kind, [0, 0, 128, 255], white);
		onlyInteriorChanges(before, current, kind);
		test.style("color:red;accent-color:yellow", test.scope);
		matchesMask(test.capture().image, kind, [255, 255, 0, 255], black);
		expect(test.state()).toEqual(state);
		test.style("color:navy;accent-color:auto");
		expect(test.capture().image.pixels).toEqual(before.image.pixels);
	},
);

it.each(widgetKinds)(
	"invalidates %s palette on live update, auto and removal",
	(kind) => {
		const test = widget(kind);
		const before = test.capture();
		const state = test.state();
		test.style("accent-color:red");
		matchesMask(test.capture().image, kind, [255, 0, 0, 255], black);
		test.style("accent-color:navy");
		matchesMask(test.capture().image, kind, [0, 0, 128, 255], white);
		test.style("accent-color:auto");
		expect(test.capture().image.pixels).toEqual(before.image.pixels);
		test.style("accent-color:red");
		test.capture();
		test.tree.removeAttribute(test.target, "style");
		expect(test.capture().image.pixels).toEqual(before.image.pixels);
		expect(test.state()).toEqual(state);
	},
);

it.each(["checkbox", "radio"] as const)(
	"keeps %s focus edges and mouse actionability unchanged",
	(kind) => {
		const test = widget(kind);
		test.actions.focus.focus(test.tree.reference(test.target));
		const before = test.capture();
		const state = test.state();
		test.style("accent-color:navy");
		const after = test.capture();
		onlyInteriorChanges(before, after, kind);
		matchesMask(after.image, kind, [0, 0, 128, 255], white, true);
		expect(test.state()).toEqual(state);
		expect(test.actions.mouse.move(5, 5).reference).toBe(
			test.tree.reference(test.target),
		);
		test.actions.mouse.down();
		test.actions.mouse.up();
		expect(controlChecked(test.tree, test.target)).toBe(kind === "radio");
		expect(controlValue(test.tree, test.target)).toBe("kept");
		if (kind === "checkbox") {
			const unchecked = test.capture();
			test.style("accent-color:transparent");
			expect(test.capture().image.pixels).toEqual(unchecked.image.pixels);
			test.actions.keyboard.press("Space");
			expect(controlChecked(test.tree, test.target)).toBe(true);
			matchesMask(test.capture().image, kind, white, black, true);
		}
	},
);

it("clears indeterminate through real activation without changing the accent or value", () => {
	const test = widget("indeterminate");
	test.style("accent-color:yellow");
	matchesMask(test.capture().image, "indeterminate", [255, 255, 0, 255], black);
	test.actions.click(test.tree.reference(test.target));
	expect(test.descriptor()).toMatchObject({
		checked: true,
		indeterminate: false,
	});
	expect(controlValue(test.tree, test.target)).toBe("kept");
	matchesMask(
		test.capture().image,
		"checkbox",
		[255, 255, 0, 255],
		black,
		true,
	);
});

it("preserves radio-group state and cancellation through real actions", () => {
	const test = scene(
		'<input id="target" type="radio" name="group"><input id="other" type="radio" name="group" checked>',
	);
	const other = test.required("#other");
	test.style("accent-color:red", test.scope);
	test.actions.events.addEventListener(
		test.target,
		"click",
		(event) => event.preventDefault(),
		{ once: true },
	);
	test.actions.click(test.tree.reference(test.target));
	expect(controlChecked(test.tree, test.target)).toBe(false);
	expect(controlChecked(test.tree, other)).toBe(true);
	test.actions.click(test.tree.reference(test.target));
	expect(controlChecked(test.tree, test.target)).toBe(true);
	expect(controlChecked(test.tree, other)).toBe(false);
	matchesMask(test.capture().image, "radio", [255, 0, 0, 255], black, true);
});

it.each([
	["text", '<input id="target" value="AB">'],
	["textarea", '<textarea id="target">AB</textarea>'],
	["button", '<button id="target">Go</button>'],
	["select", '<select id="target"><option>One</option></select>'],
	["file", '<input id="target" type="file">'],
] as const)(
	"does not recolor the %s control or its ordinary document text",
	(_kind, markup) => {
		const test = scene(markup);
		const before = test.capture();
		const state = test.state();
		const descriptor = test.descriptor();
		const native = rasterizeControl(
			descriptor,
			descriptor.width,
			descriptor.height,
			paint(),
			() => {},
		);
		expect(
			rasterizeControl(
				descriptor,
				descriptor.width,
				descriptor.height,
				paint(palettes[0].input),
				() => {},
			).pixels,
		).toEqual(native.pixels);
		test.style("accent-color:red", test.scope);
		expect(test.capture().image.pixels).toEqual(before.image.pixels);
		expect(test.state()).toEqual(state);
	},
);

it.each(["input", "textarea"] as const)(
	"leaves focused %s caret and selection pixels unchanged",
	(kind) => {
		const test = scene(
			kind === "input"
				? '<input id="target">'
				: '<textarea id="target"></textarea>',
		);
		test.actions.fill(test.tree.reference(test.target), "ABCD");
		const caret = test.capture();
		const caretState = test.state();
		test.style("accent-color:navy");
		expect(test.capture().image.pixels).toEqual(caret.image.pixels);
		expect(test.state()).toEqual(caretState);
		test.actions.keyboard.press("Control+A");
		const selected = test.capture();
		const selectionState = test.state();
		test.style("accent-color:transparent");
		expect(test.capture().image.pixels).toEqual(selected.image.pixels);
		expect(test.state()).toEqual(selectionState);
	},
);

it("does not accent an unchecked radio with contrived indeterminate metadata", () => {
	const test = widget("radio");
	expect(test.descriptor().indeterminate).toBe(false);
	const descriptor = {
		...test.descriptor(),
		checked: false,
		indeterminate: true,
	};
	const before = rasterizeControl(descriptor, 10, 10, paint(), () => {});
	const after = rasterizeControl(
		descriptor,
		10,
		10,
		paint(palettes[0].input),
		() => {},
	);
	expect(after.pixels).toEqual(before.pixels);
});

it("rejects prepared accent capture after its document closes", () => {
	const test = widget("checkbox");
	test.style("accent-color:red");
	const prepared = prepareDocumentRaster(test.tree);
	test.tree.close();
	expect(() => prepared.rasterize()).toThrow(/closed/);
});
