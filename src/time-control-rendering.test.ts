import { afterEach, expect, it, vi } from "vitest";
import { prepareControlPointer } from "./control-pointer.js";
import {
	controlRenderingCapabilities,
	describeControl,
	rasterizeControl,
} from "./control-rendering.js";
import { controlTextState } from "./control-text-state.js";
import { controlValidity } from "./control-validity.js";
import {
	controlShowsPlaceholder,
	controlValue,
	inputType,
	isTextControl,
} from "./controls.js";
import { initialPaintStyle } from "./css-paint.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { prepareFormSubmission } from "./forms.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { readNativeControlSelection } from "./native-control-caret.js";
import type { RasterImage, Rgba } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(attributes = "", css = "") {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}input{font-size:8px}${css}</style><form id="form"><input id="time" name="delivery" type="time" ${attributes}></form>`,
		"https://fixture.invalid/time-control-rendering",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(320, 80);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#time") as number;
	const form = queries.querySelector("#form") as number;
	const descriptor = (fontSize = 8) => {
		const control = describeControl(tree, id, fontSize);
		if (!control) throw new Error("Missing time control");
		return control;
	};
	const paint = (width = 84, height = 16) =>
		rasterizeControl(descriptor(), width, height, initialPaintStyle, () => {});
	const submittedValue = () =>
		new URL(
			prepareFormSubmission(tree, tree.reference(form)).request.url,
		).searchParams.get("delivery");
	return {
		tree,
		id,
		form,
		queries,
		descriptor,
		paint,
		submittedValue,
		actions: documentInteractions(tree),
	};
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function expectedPixels(text: string, focused = false, disabled = false) {
	const glyphs: Record<string, readonly number[]> = {
		"-": [0, 0, 0, 31, 0, 0, 0, 0],
		".": [0, 0, 0, 0, 0, 0, 4, 0],
		":": [0, 4, 4, 0, 4, 4, 0, 0],
		"0": [14, 17, 19, 21, 25, 17, 14, 0],
		"1": [4, 12, 4, 4, 4, 4, 14, 0],
		"2": [14, 17, 1, 2, 4, 8, 31, 0],
		"3": [30, 1, 1, 14, 1, 1, 30, 0],
		"4": [2, 6, 10, 18, 31, 2, 2, 0],
		"5": [31, 16, 16, 30, 1, 1, 30, 0],
		"6": [6, 8, 16, 30, 17, 17, 14, 0],
		"7": [31, 1, 2, 4, 8, 8, 8, 0],
		"8": [14, 17, 17, 14, 17, 17, 14, 0],
		"9": [14, 17, 17, 15, 1, 2, 12, 0],
	};
	const pixels = new Uint8Array(84 * 16 * 4);
	const edge: Rgba = focused ? [0, 96, 192, 255] : [96, 96, 96, 255];
	const background: Rgba = disabled
		? [224, 224, 224, 255]
		: [255, 255, 255, 255];
	const foreground: Rgba = disabled ? [128, 128, 128, 255] : [0, 0, 0, 255];
	for (let row = 0; row < 16; row++)
		for (let column = 0; column < 84; column++)
			pixels.set(
				row === 0 || row === 15 || column === 0 || column === 83
					? edge
					: background,
				(row * 84 + column) * 4,
			);
	for (let index = 0; index < text.length; index++) {
		const glyph = glyphs[text[index]];
		if (!glyph) throw new Error("Missing expected glyph");
		for (let row = 0; row < 8; row++)
			for (let column = 0; column < 5; column++)
				if ((glyph[row] & (16 >> column)) !== 0)
					pixels.set(foreground, ((row + 4) * 84 + 6 + index * 6 + column) * 4);
	}
	return pixels;
}

it("exposes a distinct value-display profile without claiming time UI editing", () => {
	const { tree, id, descriptor, submittedValue } = fixture();
	expect(descriptor()).toMatchObject({
		kind: "time",
		text: "--:--",
		width: 84,
		height: 16,
		placeholder: false,
		focused: false,
		disabled: false,
		checked: false,
		indeterminate: false,
	});
	expect(Object.isFrozen(descriptor())).toBe(true);
	expect(descriptor().selection).toBeUndefined();
	expect(descriptor().buttonText).toBeUndefined();
	expect(inputType(tree.get(id))).toBe("time");
	expect(isTextControl(tree.get(id))).toBe(false);
	expect(controlValue(tree, id)).toBe("");
	expect(submittedValue()).toBe("");
	expect(controlRenderingCapabilities).toMatchObject({
		profile: "agent-mono-software-controls",
		platformAppearance: false,
		popup: false,
		timeValueDisplay: "sanitized-24-hour-value-or-empty-marker",
		timeEditing: "native-agent-fill-only",
		timePicker: false,
		timeSegmentedKeyboardEditing: false,
		textCaret: "collapsed-focused-native-selection",
		placeholderState: "attribute-present-and-empty-api-value",
	});
});

it.each([
	["", "--:--"],
	["00:00", "00:00"],
	["12:30", "12:30"],
	["12:30:05", "12:30:05"],
	["12:30:05.1", "12:30:05.1"],
	["12:30:05.12", "12:30:05.12"],
	["12:30:05.123", "12:30:05.123"],
	["12:30:00.000", "12:30:00.000"],
	["23:59:59.999", "23:59:59.999"],
])("paints independent Agent Mono pixels for the value %j", (value, text) => {
	const { tree, id, descriptor, paint, submittedValue } = fixture(
		`value="${value}"`,
	);
	expect(descriptor()).toMatchObject({ text, width: 84, height: 16 });
	expect(paint().pixels).toEqual(expectedPixels(text));
	expect(controlValue(tree, id)).toBe(value);
	expect(submittedValue()).toBe(value);
	expect(buildFormattingTree(tree).issues).toEqual({});
	expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject({
		width: 84,
		height: 16,
	});
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		paintedControls: 1,
		paintedImages: 0,
	});
});

it.each([
	"24:00",
	"12:60",
	"12:30:60",
	"12:30:05.1234",
	"1:30",
	"12:30Z",
	"12:\n30",
	" 12:30 ",
	"１２:３０",
])("displays a sanitized empty state for invalid stored time %j", (value) => {
	const { tree, id, descriptor, paint, submittedValue } = fixture();
	tree.setAttribute(id, "value", value);
	expect(descriptor().text).toBe("--:--");
	expect(paint().pixels).toEqual(expectedPixels("--:--"));
	tree.setControl(id, { value });
	expect(descriptor().text).toBe("--:--");
	expect(controlValue(tree, id)).toBe("");
	expect(submittedValue()).toBe("");
});

it("composites the exact time raster at independently specified document coordinates", () => {
	const { tree, id } = fixture(
		'value="12:30"',
		"input{position:absolute;left:12px;top:8px}",
	);
	expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject({
		x: 12,
		y: 8,
		width: 84,
		height: 16,
	});
	const { image } = rasterizeDocument(tree);
	const expected = expectedPixels("12:30");
	for (let row = 0; row < 16; row++) {
		const offset = ((8 + row) * image.width + 12) * 4;
		expect(image.pixels.slice(offset, offset + 84 * 4)).toEqual(
			expected.slice(row * 84 * 4, (row + 1) * 84 * 4),
		);
	}
});

it("fills and clears the observed time constraints without placeholder or caret state", () => {
	const { tree, id, actions, descriptor, paint, queries, submittedValue } =
		fixture('min="11:00" max="21:00" step="900" placeholder="Pick a time"');
	const attributes = { ...tree.get(id).attributes };
	const events: string[] = [];
	for (const type of ["beforeinput", "input", "change"])
		actions.events.addEventListener(id, type, () => events.push(type));
	expect(descriptor().text).toBe("--:--");
	actions.fill(tree.reference(id), " 12:30 ");
	expect(events).toEqual(["input", "change"]);
	expect(descriptor()).toMatchObject({ text: "12:30", focused: true });
	expect(paint().pixels).toEqual(expectedPixels("12:30", true));
	expect(controlValidity(tree, id).valid).toBe(true);
	expect(submittedValue()).toBe("12:30");
	expect(tree.wasUserEditedValue(id)).toBe(true);
	expect(tree.get(id).attributes).toEqual(attributes);
	expect(controlShowsPlaceholder(tree, id)).toBe(false);
	expect(queries.matches(id, ":placeholder-shown")).toBe(false);
	expect(descriptor().selection).toBeUndefined();
	expect(readNativeControlSelection(tree, id)).toBeUndefined();
	expect(controlTextState(tree, id)).toBeUndefined();
	expect(prepareControlPointer(tree, id, { x: 20, y: 8 })).toBeUndefined();
	expect(() => actions.keyboard.type("1")).toThrow("not implemented");
	expect(controlValue(tree, id)).toBe("12:30");
	actions.fill(tree.reference(id), "");
	expect(descriptor().text).toBe("--:--");
	expect(paint().pixels).toEqual(expectedPixels("--:--", true));
	expect(submittedValue()).toBe("");
	actions.focus.focus(null);
	expect(events).toEqual(["input", "change", "input", "change"]);
});

it("renders out-of-range and off-step actual values without inventing a clamped value", () => {
	const { tree, id, actions, descriptor } = fixture(
		'min="11:00" max="21:00" step="900"',
	);
	actions.fill(tree.reference(id), "22:01:00.001");
	expect(descriptor()).toMatchObject({ text: "22:01:00.001", width: 84 });
	expect(controlValidity(tree, id)).toMatchObject({
		rangeOverflow: true,
		stepMismatch: true,
		valid: false,
	});
	expect(() => actions.fill(tree.reference(id), "24:00")).toThrow();
	expect(descriptor().text).toBe("22:01:00.001");
});

it.each(["1", "20", "999999999999999999999", "0", "invalid"])(
	"ignores inapplicable size %j, rows, columns and oversized placeholder text",
	(size) => {
		const { tree, id, descriptor, paint } = fixture(
			`size="${size}" cols="999999" rows="999999" placeholder="${"X".repeat(4097)}"`,
		);
		expect(descriptor()).toMatchObject({
			text: "--:--",
			width: 84,
			height: 16,
			placeholder: false,
		});
		expect(paint().pixels).toEqual(expectedPixels("--:--"));
		expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject({
			width: 84,
			height: 16,
		});
		expect(buildFormattingTree(tree, { maxTextCodeUnits: 5 }).issues).toEqual(
			{},
		);
	},
);

it.each(["width", "height"])(
	"keeps the document-level unsupported HTML %s hint explicit",
	(attribute) => {
		const { tree, id, descriptor, paint } = fixture(`${attribute}="999999"`);
		expect(descriptor()).toMatchObject({
			text: "--:--",
			width: 84,
			height: 16,
		});
		expect(paint().pixels).toEqual(expectedPixels("--:--"));
		expect(buildFormattingTree(tree).issues).toEqual({
			"html-presentation-hint-not-supported": 1,
		});
		expect(() => documentGeometry(tree).getBoundingClientRect(id)).toThrow(
			"html-presentation-hint-not-supported",
		);
	},
);

it.each([
	["input{width:100px}", 100, 16],
	["input{height:28px}", 84, 28],
	[
		"input{width:50%;max-width:80px;height:30px;padding:3px;box-sizing:border-box}",
		80,
		30,
	],
	["input{width:20px;min-width:90px}", 90, 16],
])("retains CSS geometry for %s", (css, width, height) => {
	const { tree, id, descriptor } = fixture('value="23:59:59.999"', css);
	expect(descriptor()).toMatchObject({ width: 84, height: 16 });
	expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject({
		width,
		height,
	});
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
});

it("uses the painted rectangle for pointer targeting and focus, not character selection", () => {
	const { tree, id, actions, descriptor, paint } = fixture('value="12:30"');
	const rect = documentGeometry(tree).getBoundingClientRect(id);
	for (const offset of [3, 40, 80]) {
		expect(actions.mouse.move(rect.x + offset, rect.y + 8).reference).toBe(
			tree.reference(id),
		);
		actions.mouse.down();
		actions.mouse.up();
		expect(actions.focus.active()).toBe(id);
		expect(descriptor().selection).toBeUndefined();
		expect(readNativeControlSelection(tree, id)).toBeUndefined();
	}
	expect(paint().pixels).toEqual(expectedPixels("12:30", true));
	expect(controlValue(tree, id)).toBe("12:30");
});

it("keeps readonly time visible and focusable but rejects agent fill", () => {
	const { tree, id, actions, descriptor, paint } = fixture(
		'readonly value="12:30"',
	);
	const rect = documentGeometry(tree).getBoundingClientRect(id);
	actions.mouse.move(rect.x + 4, rect.y + 8);
	actions.mouse.down();
	actions.mouse.up();
	expect(actions.focus.active()).toBe(id);
	expect(descriptor()).toMatchObject({ disabled: false, focused: true });
	expect(paint().pixels).toEqual(expectedPixels("12:30", true));
	expect(() => actions.fill(tree.reference(id), "13:30")).toThrow();
	expect(controlValue(tree, id)).toBe("12:30");
});

it("paints disabled state and retains inherited fieldset disability", () => {
	const { tree, id, form, actions, descriptor, paint, submittedValue } =
		fixture('disabled value="12:30"');
	expect(descriptor().disabled).toBe(true);
	expect(paint().pixels).toEqual(expectedPixels("12:30", false, true));
	actions.focus.focusElement(id);
	expect(actions.focus.active()).not.toBe(id);
	expect(() => actions.fill(tree.reference(id), "13:30")).toThrow();
	expect(submittedValue()).toBeNull();
	tree.removeAttribute(id, "disabled");
	const fieldset = tree.createElement("fieldset", { disabled: "" });
	tree.append(form, fieldset);
	tree.append(fieldset, id);
	expect(descriptor().disabled).toBe(true);
	expect(paint().pixels).toEqual(expectedPixels("12:30", false, true));
	expect(() => actions.fill(tree.reference(id), "13:30")).toThrow();
});

it.each(["control", "ancestor"])(
	"does not turn inert %s painting into an actionable control",
	(scope) => {
		const { tree, id, form, actions, descriptor, paint } =
			fixture('value="12:30"');
		tree.setAttribute(scope === "control" ? id : form, "inert", "");
		expect(paint().pixels).toEqual(expectedPixels("12:30"));
		expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
		const rect = documentGeometry(tree).getBoundingClientRect(id);
		expect(actions.mouse.move(rect.x + 4, rect.y + 8).reference).not.toBe(
			tree.reference(id),
		);
		actions.focus.focusElement(id);
		expect(actions.focus.active()).not.toBe(id);
		expect(() => actions.fill(tree.reference(id), "13:30")).toThrow();
		expect(descriptor().selection).toBeUndefined();
		expect(controlTextState(tree, id)).toBeUndefined();
		expect(controlValue(tree, id)).toBe("12:30");
	},
);

it("repaints defaults, dirty values and reset without changing intrinsic geometry", () => {
	const { tree, id, form, actions, descriptor, paint, submittedValue } =
		fixture('value="11:00"');
	const rect = documentGeometry(tree).getBoundingClientRect(id);
	tree.setAttribute(id, "value", "12:30");
	expect(paint().pixels).toEqual(expectedPixels("12:30"));
	const before = rasterizeDocument(tree).image.pixels;
	actions.fill(tree.reference(id), "23:59:59.999");
	actions.focus.focus(null);
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
	tree.setAttribute(id, "value", "13:00");
	expect(descriptor().text).toBe("23:59:59.999");
	expect(submittedValue()).toBe("23:59:59.999");
	tree.setControl(id, { value: "14:00:00.010" });
	expect(paint().pixels).toEqual(expectedPixels("14:00:00.010"));
	expect(tree.wasUserEditedValue(id)).toBe(false);
	actions.forms.reset(tree.reference(form));
	expect(descriptor().text).toBe("13:00");
	expect(paint().pixels).toEqual(expectedPixels("13:00"));
	expect(submittedValue()).toBe("13:00");
	expect(documentGeometry(tree).getBoundingClientRect(id)).toEqual(rect);
});

it("keeps rendering reads pure and drops text selection across type transitions", () => {
	const { tree, id, actions, descriptor, paint } = fixture('value="12:30"');
	const revision = tree.revision;
	const usage = tree.resourceUsage();
	const state = { ...tree.get(id).control };
	descriptor();
	paint();
	expect(tree.revision).toBe(revision);
	expect(tree.resourceUsage()).toEqual(usage);
	expect(tree.get(id).control).toEqual(state);
	tree.setAttribute(id, "type", "text");
	actions.fill(tree.reference(id), "12:30");
	expect(descriptor()).toMatchObject({ kind: "text", text: "12:30" });
	expect(descriptor().selection).toBeDefined();
	tree.setAttribute(id, "type", "time");
	expect(descriptor()).toMatchObject({ kind: "time", text: "12:30" });
	expect(descriptor().selection).toBeUndefined();
	expect(paint().pixels).toEqual(expectedPixels("12:30", true));
	tree.setAttribute(id, "type", "text");
	actions.fill(tree.reference(id), "not a time");
	tree.setAttribute(id, "type", "time");
	expect(descriptor().text).toBe("--:--");
});

it.each(["hidden", "display:none"])(
	"omits hidden time controls with %s while retaining their semantic value",
	(mode) => {
		const { tree, id, descriptor } = fixture('value="12:30"');
		tree.setAttribute(id, mode === "hidden" ? "hidden" : "style", mode);
		expect(descriptor().text).toBe("12:30");
		expect(rasterizeDocument(tree).metrics.paintedControls).toBe(0);
	},
);

it("retains detached values without painting and isolates document lifetimes", () => {
	const first = fixture('value="12:30"');
	const second = fixture();
	first.tree.remove(first.id);
	expect(first.descriptor().text).toBe("12:30");
	expect(rasterizeDocument(first.tree).metrics.paintedControls).toBe(0);
	expect(() =>
		first.actions.fill(first.tree.reference(first.id), "13:30"),
	).toThrow();
	expect(second.descriptor().text).toBe("--:--");
	first.tree.append(first.form, first.id);
	expect(rasterizeDocument(first.tree).metrics.paintedControls).toBe(1);
	first.tree.close();
	expect(() => first.descriptor()).toThrow(/closed/);
});

it.each([svgNamespace, mathmlNamespace])(
	"does not describe a foreign time-named input in %s",
	(namespace) => {
		const { tree } = fixture();
		const foreign = tree.createParserElement(
			"input",
			{ type: "time", value: "12:30" },
			namespace,
		);
		tree.append(tree.root, foreign);
		expect(describeControl(tree, foreign, 8)).toBeUndefined();
	},
);

it.each(["date", "month", "week", "datetime-local", "range", "color"])(
	"does not admit the unsupported %s appearance",
	(type) => {
		const { tree, id } = fixture();
		tree.setAttribute(id, "type", type);
		expect(describeControl(tree, id, 8)).toBeUndefined();
		expect(() => rasterizeDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it.each([
	[1, 1],
	[2, 2],
	[18, 16],
	[83, 16],
	[84.5, 16.5],
])("bounds and clips raster geometry at %s by %s", (width, height) => {
	const { paint } = fixture('value="23:59:59.999"');
	const image = paint(width, height);
	expect(image.width).toBe(Math.ceil(width));
	expect(image.height).toBe(Math.ceil(height));
	expect(image.pixels.length).toBe(image.width * image.height * 4);
	for (let column = 0; column < image.width; column++) {
		expect(pixel(image, column, 0)).toEqual([96, 96, 96, 255]);
		expect(pixel(image, column, image.height - 1)).toEqual([96, 96, 96, 255]);
	}
	for (let row = 0; row < image.height; row++) {
		expect(pixel(image, 0, row)).toEqual([96, 96, 96, 255]);
		expect(pixel(image, image.width - 1, row)).toEqual([96, 96, 96, 255]);
	}
});

it("uses existing CSS paint without drawing caret or picker affordances", () => {
	const { tree, id, actions, descriptor } = fixture('value="12:30"');
	actions.focus.focus(tree.reference(id));
	const image = rasterizeControl(
		descriptor(),
		84,
		16,
		{
			...initialPaintStyle,
			color: [255, 0, 0, 255],
			"background-color": [255, 255, 0, 255],
			"caret-color": [0, 255, 0, 255],
		},
		() => {},
	);
	expect(pixel(image, 0, 0)).toEqual([0, 96, 192, 255]);
	expect(pixel(image, 8, 4)).toEqual([255, 0, 0, 255]);
	for (const column of [36, 72, 78])
		for (let row = 1; row < 15; row++)
			expect(pixel(image, column, row)).toEqual([255, 255, 0, 255]);
});

it("clips whole glyphs in small boxes without modifying the actual value", () => {
	const { tree, id, paint } = fixture('value="23:59:59.999"');
	const narrow = paint(18, 16);
	expect(pixel(narrow, 7, 4)).toEqual([0, 0, 0, 255]);
	for (let column = 12; column < 17; column++)
		for (let row = 1; row < 15; row++)
			expect(pixel(narrow, column, row)).toEqual([255, 255, 255, 255]);
	const short = paint(84, 15);
	for (let column = 1; column < 83; column++)
		for (let row = 1; row < 14; row++)
			expect(pixel(short, column, row)).toEqual([255, 255, 255, 255]);
	expect(controlValue(tree, id)).toBe("23:59:59.999");
});

it("bounds intrinsic font geometry independently of the current time precision", () => {
	const { descriptor } = fixture();
	expect(descriptor(0)).toMatchObject({ width: 12, height: 9 });
	expect(descriptor(16)).toMatchObject({ width: 156, height: 24 });
	expect(descriptor(453)).toMatchObject({ width: 4089, height: 461 });
	expect(() => descriptor(454)).toThrow(/intrinsic dimension limit/);
	for (const size of [-1, Number.NaN, Number.POSITIVE_INFINITY, 513])
		expect(() => descriptor(size)).toThrow(/font limit/);
});

it("charges actual displayed text and rejects formatting, pixel and work exhaustion", () => {
	const { tree, descriptor } = fixture('value="23:59:59.999"');
	const charge = vi.fn();
	rasterizeControl(descriptor(), 84, 16, initialPaintStyle, charge);
	expect(charge).toHaveBeenCalledExactlyOnceWith(11_520);
	for (const [width, height] of [
		[0, 16],
		[4097, 1],
		[2048, 2048],
		[Number.NaN, 16],
	])
		expect(() =>
			rasterizeControl(descriptor(), width, height, initialPaintStyle, charge),
		).toThrow(/raster limit/);
	expect(buildFormattingTree(tree, { maxTextCodeUnits: 12 }).issues).toEqual(
		{},
	);
	expect(() => buildFormattingTree(tree, { maxTextCodeUnits: 11 })).toThrow(
		/text limit/,
	);
	expect(() => rasterizeDocument(tree, { maxWork: 1 })).toThrow(/limit/);
	const rejectedCharge = vi.fn(() => {
		throw new Error("work exhausted");
	});
	expect(() =>
		rasterizeControl(descriptor(), 84, 16, initialPaintStyle, rejectedCharge),
	).toThrow("work exhausted");
});

it("charges the empty marker and aggregate time captions to existing text budgets", () => {
	const { tree, form, descriptor } = fixture();
	const charge = vi.fn();
	rasterizeControl(descriptor(), 84, 16, initialPaintStyle, charge);
	expect(charge).toHaveBeenCalledExactlyOnceWith(11_072);
	expect(() => buildFormattingTree(tree, { maxTextCodeUnits: 4 })).toThrow(
		/text limit/,
	);
	const second = tree.createElement("input", { type: "time" });
	tree.append(form, second);
	expect(buildFormattingTree(tree, { maxTextCodeUnits: 10 }).issues).toEqual(
		{},
	);
	expect(() => buildFormattingTree(tree, { maxTextCodeUnits: 9 })).toThrow(
		/text limit/,
	);
});

it("preserves the previous display when retained-text quota rejects a fill", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 20 });
	trees.push(tree);
	const id = tree.createElement("input", { type: "time" });
	tree.append(tree.root, id);
	const actions = documentInteractions(tree);
	actions.fill(tree.reference(id), "12:30");
	const usage = tree.resourceUsage();
	const changed = vi.fn();
	actions.events.addEventListener(id, "input", changed);
	actions.events.addEventListener(id, "change", changed);
	expect(() => actions.fill(tree.reference(id), "23:59:59.999")).toThrow(
		/text limit/,
	);
	expect(describeControl(tree, id, 8)).toMatchObject({
		kind: "time",
		text: "12:30",
		width: 84,
	});
	expect(tree.resourceUsage()).toEqual(usage);
	expect(tree.wasUserEditedValue(id)).toBe(true);
	expect(changed).not.toHaveBeenCalled();
});
