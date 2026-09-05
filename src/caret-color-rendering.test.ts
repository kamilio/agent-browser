import { afterEach, expect, it } from "vitest";
import { describeControl } from "./control-rendering.js";
import {
	type ControlTextRectangle,
	layoutControlText,
} from "./control-text-layout.js";
import { controlValue } from "./controls.js";
import {
	type DocumentRaster,
	prepareDocumentRaster,
	rasterizeDocument,
} from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { prepareEditableCaret } from "./editable-caret.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { nativeControlCaret } from "./native-control-caret.js";
import { rangeClientRects } from "./range-geometry.js";
import type { RasterImage, Rgba } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const controlKinds = [
	"input",
	"textarea",
	"readonly",
	"password",
	"placeholder",
] as const;
const editableKinds = ["glyph", "break", "empty", "paragraph"] as const;
const kinds = [...controlKinds, ...editableKinds] as const;
type Kind = (typeof kinds)[number];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(kind: Kind) {
	const control = (controlKinds as readonly string[]).includes(kind);
	const content =
		kind === "glyph"
			? '<span id="source">ABCD</span>'
			: kind === "break"
				? '<span id="source">AB\n</span>'
				: kind === "paragraph"
					? '<p id="source"></p>'
					: "";
	const markup = control
		? kind === "textarea"
			? '<textarea id="field"></textarea>'
			: `<input id="field" type="${kind === "password" ? "password" : "text"}" placeholder="Hint">`
		: `<div id="field" contenteditable>${content}</div>`;
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}#scope{color:red}input,textarea{display:block;font-size:8px;color:inherit;width:72px;height:20px}textarea{height:32px}div[contenteditable]{color:inherit;width:120px;min-height:40px;padding:4px;border:1px solid blue;background:white;white-space:pre-wrap}p{margin:0}</style><div id="scope">${markup}</div><div style="height:500px"></div>`,
		"https://fixture.invalid/caret-color-rendering",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(180, 100);
	const queries = new DocumentQueries(tree);
	const required = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const field = required("#field");
	const source = queries.querySelector("#source") ?? field;
	const scope = required("#scope");
	const actions = documentInteractions(tree);
	if (control) {
		actions.fill(
			tree.reference(field),
			kind === "placeholder" ? "" : kind === "textarea" ? "AB\nCD" : "ABCD",
		);
		if (kind === "readonly") tree.setAttribute(field, "readonly", "");
	} else {
		actions.focus.focus(tree.reference(field));
		const node =
			kind === "glyph" || kind === "break"
				? tree.get(source).children[0]
				: source;
		const offset = kind === "glyph" ? 4 : kind === "break" ? 3 : 0;
		domRangeOwner(tree).selection.collapse(node, offset);
	}
	const capture = () => rasterizeDocument(tree);
	const style = (value: string, target = field) =>
		tree.setAttribute(target, "style", value);
	const state = () => {
		if (control)
			return {
				value: controlValue(tree, field),
				descriptor: describeControl(tree, field, 8),
			};
		const range = domRangeOwner(tree).selection.getRangeAt(0);
		return {
			value: tree.textContent(field),
			start: range.start,
			end: range.end,
			rectangles: rangeClientRects(range),
		};
	};
	const rectangle = (result: DocumentRaster): ControlTextRectangle => {
		if (!control) {
			const prepared = prepareEditableCaret(tree, result.layout);
			expect(prepared.status).toBe("ready");
			if (!prepared.anchor) throw new Error("Missing editable caret anchor");
			const anchor = prepared.anchor;
			return {
				x: anchor.x - result.clip.x,
				y: anchor.y - result.clip.y,
				width: 1,
				height: anchor.height,
			};
		}
		const descriptor = describeControl(tree, field, 8);
		const box = result.layout.boxes.find(
			(candidate) => candidate.ref === tree.reference(field),
		);
		if (
			!descriptor ||
			!box ||
			(descriptor.kind !== "text" && descriptor.kind !== "textarea")
		)
			throw new Error("Missing native control geometry");
		const layout = layoutControlText({
			kind: descriptor.kind,
			text: descriptor.text,
			fontSize: descriptor.fontSize,
			columns: Math.ceil(box.contentWidth),
			rows: Math.ceil(box.contentHeight),
			placeholder: descriptor.placeholder,
			selection: descriptor.selection,
		});
		if (!layout.caret) throw new Error("Missing native control caret");
		return {
			...layout.caret,
			x: box.contentX + layout.caret.x - result.clip.x,
			y: box.contentY + layout.caret.y - result.clip.y,
		};
	};
	return {
		tree,
		field,
		source,
		scope,
		actions,
		control,
		capture,
		style,
		state,
		rectangle,
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

function inside(
	rectangle: ControlTextRectangle,
	horizontal: number,
	vertical: number,
) {
	return (
		horizontal + 0.5 >= rectangle.x &&
		horizontal + 0.5 < rectangle.x + rectangle.width &&
		vertical + 0.5 >= rectangle.y &&
		vertical + 0.5 < rectangle.y + rectangle.height
	);
}

function onlyCaretChanges(
	before: DocumentRaster,
	after: DocumentRaster,
	rectangle: ControlTextRectangle,
) {
	expect(after.image.width).toBe(before.image.width);
	expect(after.image.height).toBe(before.image.height);
	expect(after.layout.boxes).toEqual(before.layout.boxes);
	let changed = 0;
	for (let vertical = 0; vertical < before.image.height; vertical++) {
		for (let horizontal = 0; horizontal < before.image.width; horizontal++) {
			const beforePixel = pixel(before.image, horizontal, vertical);
			const afterPixel = pixel(after.image, horizontal, vertical);
			if (beforePixel.every((channel, index) => channel === afterPixel[index]))
				continue;
			expect(
				inside(rectangle, horizontal, vertical),
				`changed pixel ${horizontal},${vertical}`,
			).toBe(true);
			changed++;
		}
	}
	expect(changed).toBeGreaterThan(0);
	expect(changed).toBeLessThanOrEqual(rectangle.width * rectangle.height);
}

function caretPixels(
	result: DocumentRaster,
	rectangle: ControlTextRectangle,
	expected: Rgba,
	underlay?: DocumentRaster,
) {
	let checked = 0;
	for (let vertical = 0; vertical < result.image.height; vertical++) {
		for (let horizontal = 0; horizontal < result.image.width; horizontal++) {
			if (!inside(rectangle, horizontal, vertical)) continue;
			const background = underlay
				? pixel(underlay.image, horizontal, vertical)
				: [255, 255, 255, 255];
			const alpha = expected[3] / 255;
			const blended = expected
				.slice(0, 3)
				.map((channel, index) =>
					Math.round(channel * alpha + background[index] * (1 - alpha)),
				);
			expect(pixel(result.image, horizontal, vertical)).toEqual([
				...blended,
				255,
			]);
			checked++;
		}
	}
	expect(checked).toBe(rectangle.width * rectangle.height);
}

it.each(kinds)("preserves the supported default %s caret lineage", (kind) => {
	const scene = fixture(kind);
	const state = scene.state();
	const result = scene.capture();
	const rectangle = scene.rectangle(result);
	expect(rectangle).toMatchObject({ width: 1, height: 8 });
	caretPixels(result, rectangle, [255, 0, 0, 255]);
	expect(scene.capture().image.pixels).toEqual(result.image.pixels);
	expect(scene.state()).toEqual(state);
	if (scene.control) expect(result.metrics.paintedControls).toBe(1);
	else
		expect(result.metrics).toMatchObject({
			paintedCarets: 1,
			caretStatus: "painted",
		});
});

it.each(kinds)(
	"keeps default, auto and currentcolor %s pixels identical",
	(kind) => {
		const scene = fixture(kind);
		const before = scene.capture();
		const state = scene.state();
		for (const value of ["auto", "currentcolor"]) {
			scene.style(`caret-color:${value}`);
			const after = scene.capture();
			expect(after.image.pixels).toEqual(before.image.pixels);
			expect(after.layout.boxes).toEqual(before.layout.boxes);
			expect(scene.state()).toEqual(state);
		}
	},
);

it.each(kinds)(
	"confines opaque and partial-alpha %s changes to its actual caret",
	(kind) => {
		const scene = fixture(kind);
		const state = scene.state();
		const before = scene.capture();
		const rectangle = scene.rectangle(before);
		scene.style("caret-color:transparent");
		const clear = scene.capture();
		onlyCaretChanges(before, clear, rectangle);
		for (const [css, color] of [
			["blue", [0, 0, 255, 255]],
			["rgba(0,0,255,0.5)", [0, 0, 255, 128]],
		] as const) {
			scene.style(`caret-color:${css}`);
			const colored = scene.capture();
			expect(scene.rectangle(colored)).toEqual(rectangle);
			onlyCaretChanges(before, colored, rectangle);
			onlyCaretChanges(clear, colored, rectangle);
			caretPixels(colored, rectangle, color, clear);
			expect(scene.state()).toEqual(state);
		}
	},
);

it.each(kinds)(
	"makes transparent %s match actual absent-caret painting",
	(kind) => {
		const scene = fixture(kind);
		const before = scene.capture();
		const rectangle = scene.rectangle(before);
		const state = scene.state();
		scene.style("caret-color:transparent");
		const transparent = scene.capture();
		onlyCaretChanges(before, transparent, rectangle);
		expect(scene.state()).toEqual(state);
		if (scene.control) nativeControlCaret(scene.tree).close();
		else {
			expect(transparent.metrics).toMatchObject({
				caretStatus: "transparent",
				paintedCarets: 0,
			});
			domRangeOwner(scene.tree).selection.removeAllRanges();
		}
		expect(scene.capture().image.pixels).toEqual(transparent.image.pixels);
	},
);

it.each(kinds)(
	"resolves inherited %s caret color at the receiving source",
	(kind) => {
		const scene = fixture(kind);
		scene.style("color:green", scene.source);
		const green = scene.capture();
		const rectangle = scene.rectangle(green);
		const state = scene.state();
		caretPixels(green, rectangle, [0, 128, 0, 255]);
		scene.style("color:red;caret-color:currentcolor", scene.scope);
		expect(scene.capture().image.pixels).toEqual(green.image.pixels);
		scene.style("color:red;caret-color:blue", scene.scope);
		const blue = scene.capture();
		onlyCaretChanges(green, blue, rectangle);
		caretPixels(blue, rectangle, [0, 0, 255, 255]);
		expect(scene.state()).toEqual(state);
		for (const reset of ["auto", "initial"]) {
			scene.style(`color:green;caret-color:${reset}`, scene.source);
			expect(scene.capture().image.pixels).toEqual(green.image.pixels);
		}
	},
);

it.each([
	"input",
	"textarea",
	"readonly",
	"password",
	"glyph",
	"break",
] as const)("does not recolor noncollapsed %s selection or text", (kind) => {
	const scene = fixture(kind);
	if (scene.control) scene.actions.keyboard.press("Control+A");
	else {
		const text = scene.tree.get(scene.source).children[0];
		domRangeOwner(scene.tree).selection.setBaseAndExtent(text, 0, text, 2);
	}
	const state = scene.state();
	const before = scene.capture();
	const selectionColor = scene.control ? [181, 213, 255] : [179, 215, 255];
	expect(
		Array.from(before.image.pixels).some(
			(_, offset) =>
				offset % 4 === 0 &&
				selectionColor.every(
					(channel, index) => before.image.pixels[offset + index] === channel,
				),
		),
	).toBe(true);
	for (const color of ["blue", "transparent", "rgba(0,0,255,0.5)"]) {
		scene.style(`caret-color:${color}`);
		expect(scene.capture().image.pixels).toEqual(before.image.pixels);
		expect(scene.state()).toEqual(state);
	}
});

it.each(["input", "glyph", "break", "empty", "paragraph"] as const)(
	"updates and removes %s caret color without stale raster state",
	(kind) => {
		const scene = fixture(kind);
		const before = scene.capture();
		const rectangle = scene.rectangle(before);
		const state = scene.state();
		scene.style("caret-color:blue");
		onlyCaretChanges(before, scene.capture(), rectangle);
		scene.style("caret-color:lime");
		caretPixels(scene.capture(), rectangle, [0, 255, 0, 255]);
		scene.tree.removeAttribute(scene.field, "style");
		expect(scene.capture().image.pixels).toEqual(before.image.pixels);
		expect(scene.state()).toEqual(state);
	},
);

it.each(["input", "textarea"] as const)(
	"keeps scrolled %s active edges and values stable",
	(kind) => {
		const scene = fixture(kind);
		scene.actions.fill(
			scene.tree.reference(scene.field),
			kind === "input" ? "ABCDEFGHIJKLMNO" : "one\ntwo\nthree\nfour\nfive",
		);
		const state = scene.state();
		const before = scene.capture();
		const end = scene.rectangle(before);
		scene.style("caret-color:blue");
		const colored = scene.capture();
		onlyCaretChanges(before, colored, end);
		caretPixels(colored, end, [0, 0, 255, 255]);
		expect(scene.state()).toEqual(state);
		scene.actions.keyboard.press("Control+A");
		scene.actions.keyboard.press("ArrowLeft");
		const start = scene.capture();
		expect(scene.rectangle(start)).not.toEqual(end);
		expect(scene.state().value).toBe(state.value);
		scene.style("caret-color:auto");
		onlyCaretChanges(start, scene.capture(), scene.rectangle(start));
	},
);

it.each(editableKinds)("uses existing %s anchors after root scroll", (kind) => {
	const scene = fixture(kind);
	scene.style("margin-top:30px");
	documentScroll(scene.tree).to(0, 20);
	const before = scene.capture();
	const rectangle = scene.rectangle(before);
	expect(before.clip.y).toBe(20);
	const state = scene.state();
	scene.style("margin-top:30px;caret-color:blue");
	const after = scene.capture();
	onlyCaretChanges(before, after, rectangle);
	caretPixels(after, rectangle, [0, 0, 255, 255]);
	expect(scene.state()).toEqual(state);
});

it.each(["input", "glyph", "empty", "paragraph"] as const)(
	"retains %s focus and closure ownership",
	(kind) => {
		const scene = fixture(kind);
		scene.style("caret-color:blue");
		const focused = scene.capture();
		scene.actions.focus.focus(null);
		const blurred = scene.capture();
		if (scene.control)
			expect(
				describeControl(scene.tree, scene.field, 8)?.selection,
			).toBeUndefined();
		else
			expect(blurred.metrics).toMatchObject({
				paintedCarets: 0,
				caretStatus: "unfocused",
			});
		scene.style("caret-color:transparent");
		expect(scene.capture().image.pixels).toEqual(blurred.image.pixels);
		scene.style("caret-color:blue");
		scene.actions.focus.focus(scene.tree.reference(scene.field));
		if (scene.control) scene.actions.keyboard.press("End");
		expect(scene.capture().image.pixels).toEqual(focused.image.pixels);
		const prepared = prepareDocumentRaster(scene.tree);
		scene.tree.close();
		expect(() => prepared.rasterize()).toThrow(/closed/);
	},
);

it("does not expose password text when caret color changes", () => {
	const scene = fixture("password");
	scene.actions.fill(scene.tree.reference(scene.field), "a🙂b");
	const before = describeControl(scene.tree, scene.field, 8);
	expect(before).toMatchObject({
		text: "****",
		selection: { anchor: 4, focus: 4, start: 4, end: 4, valueLength: 4 },
	});
	scene.style("caret-color:blue");
	scene.capture();
	expect(describeControl(scene.tree, scene.field, 8)).toEqual(before);
	expect(JSON.stringify(before)).not.toContain("a🙂b");
});
