import { afterEach, expect, it, vi } from "vitest";
import { prepareControlPointer } from "./control-pointer.js";
import {
	type SoftwareControl,
	controlSelectionBackground,
	describeControl,
	rasterizeControl,
} from "./control-rendering.js";
import {
	type ControlTextLayoutInput,
	hitControlText,
	layoutControlText,
	moveControlText,
} from "./control-text-layout.js";
import { initialPaintStyle } from "./css-paint.js";
import { documentFiles } from "./document-files.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { readNativeControlSelection } from "./native-control-caret.js";
import * as raster from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function selected(text: string, anchor: number, focus = anchor) {
	return {
		anchor,
		focus,
		start: Math.min(anchor, focus),
		end: Math.max(anchor, focus),
		valueLength: text.length,
	};
}

function input(
	overrides: Partial<ControlTextLayoutInput> = {},
): ControlTextLayoutInput {
	return {
		kind: "text",
		text: "A B",
		fontSize: 8,
		columns: 80,
		rows: 24,
		placeholder: false,
		...overrides,
	};
}

function fixture(
	markup = '<input id="field" value="A B" size="10">',
	spacing = 0,
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}input,button,select,textarea{font-size:8px;word-spacing:${spacing}px}</style>${markup}`,
		"https://fixture.invalid/word-spacing-controls",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(320, 160);
	const field = new DocumentQueries(tree).querySelector("#field");
	if (field === null) throw new Error("Missing field");
	return {
		tree,
		field,
		actions: documentInteractions(tree),
		descriptor: (wordSpacing = spacing, fontSize = 8) => {
			const control = describeControl(tree, field, fontSize, wordSpacing);
			if (!control) throw new Error("Missing control");
			return control;
		},
		selection: () => readNativeControlSelection(tree, field),
	};
}

function paint(control: SoftwareControl, width = control.width) {
	return rasterizeControl(
		control,
		width,
		control.height,
		initialPaintStyle,
		() => {},
	);
}

function rejects(action: () => unknown, code: string) {
	let error: unknown;
	try {
		action();
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code });
}

it.each([6, -4])(
	"uses %spx advances for spaces and NBSP without changing glyph widths",
	(wordSpacing) => {
		const layout = layoutControlText(
			input({ text: "A B\u00a0C", wordSpacing }),
		);
		expect(layout.glyphs.map(({ x, width }) => [x, width])).toEqual([
			[6, 6],
			[12, 6 + wordSpacing],
			[18 + wordSpacing, 6],
			[24 + wordSpacing, 6 + wordSpacing],
			[30 + 2 * wordSpacing, 6],
		]);
		expect(layout.glyphs.map(({ offset }) => offset)).toEqual([0, 1, 2, 3, 4]);
	},
);

it.each([6, -4])(
	"measures button, option and file captions at %spx",
	(spacing) => {
		const button = fixture('<button id="field">A B</button>', spacing);
		expect(button.descriptor()).toMatchObject({
			width: 30 + spacing,
			wordSpacing: spacing,
		});
		const select = fixture(
			'<select id="field"><option>AAAAA</option><option>A&nbsp;&nbsp;B</option></select>',
			spacing,
		);
		expect(select.descriptor().width).toBe(Math.max(30, 24 + 2 * spacing) + 24);
		const file = fixture('<input id="field" type="file">', spacing);
		expect(file.descriptor().width).toBe(228);
		const text = fixture(undefined, spacing);
		expect(text.descriptor().width).toBe(72);
		const textarea = fixture(
			'<textarea id="field" cols="10">A B</textarea>',
			spacing,
		);
		expect(textarea.descriptor().width).toBe(72);
	},
);

it.each([8, 24])(
	"preserves fixed file capacity at font size %s",
	(fontSize) => {
		const file = fixture('<input id="field" type="file">', 0.001);
		const owner = documentFiles(file.tree);
		owner.replace(owner.capture(file.tree.reference(file.field)), [
			{ name: "a".repeat(255), data: new Uint8Array([1]) },
		]);
		const baseline = file.descriptor(0, fontSize);
		const spaced = file.descriptor(0.001, fontSize);
		expect(baseline.width).toBe(34 * 0.75 * fontSize + 24);
		expect(spaced.width).toBe(baseline.width);
		expect(paint(spaced).width).toBe(baseline.width);
	},
);

it.each([
	'<div id="field">not a control</div>',
	'<button id="field"><span>rich</span></button>',
	'<select id="field" multiple><option>A</option></select>',
	'<select id="field" size="2"><option>A</option></select>',
	'<input id="field" type="range">',
])("ignores invalid metrics for inapplicable %s", (markup) => {
	const control = fixture(markup);
	expect(describeControl(control.tree, control.field, 513)).toBeUndefined();
	expect(
		describeControl(control.tree, control.field, Number.NaN),
	).toBeUndefined();
	expect(
		describeControl(control.tree, control.field, 8, Number.NaN),
	).toBeUndefined();
});

it.each([6, -4])(
	"moves caption ink rather than stretching glyphs at %spx",
	(spacing) => {
		const draw = vi.spyOn(raster, "paintBitmapGlyph");
		for (const markup of [
			'<input id="field" value="A B">',
			'<button id="field">A B</button>',
			'<select id="field"><option>A B</option></select>',
		]) {
			const test = fixture(markup, spacing);
			draw.mockClear();
			const spaced = paint(test.descriptor());
			expect(
				draw.mock.calls.find((call) => call[1] === "B")?.slice(2, 5),
			).toEqual([18 + spacing, 4, 8]);
			const baseline = paint(test.descriptor(0), spaced.width);
			expect(spaced.pixels).not.toEqual(baseline.pixels);
		}
		const file = fixture('<input id="field" type="file">', spacing);
		draw.mockClear();
		paint(file.descriptor());
		expect(draw.mock.calls.find((call) => call[1] === "F")?.[2]).toBe(
			48 + spacing,
		);
		expect(draw.mock.calls.find((call) => call[1] === "N")?.[2]).toBe(
			84 + spacing,
		);
		expect(draw.mock.calls.find((call) => call[1] === "f")?.[2]).toBe(
			102 + 2 * spacing,
		);
	},
);

it.each([6, -4])(
	"uses %spx for wrapping, caret, scrolling and hit stops",
	(wordSpacing) => {
		const wrapped = layoutControlText(
			input({ kind: "textarea", columns: 30, wordSpacing }),
		);
		expect(wrapped.glyphs.map(({ x, y }) => [x, y])).toEqual(
			wordSpacing > 0
				? [
						[6, 4],
						[12, 4],
						[6, 12],
					]
				: [
						[6, 4],
						[12, 4],
						[14, 4],
					],
		);
		const value = input({ wordSpacing, selection: selected("A B", 2) });
		expect(layoutControlText(value).caret).toEqual({
			x: 18 + wordSpacing,
			y: 8,
			width: 1,
			height: 8,
		});
		expect(hitControlText(value, { x: 18 + wordSpacing, y: 12 })).toBe(2);
		expect(
			hitControlText(value, { x: 12 + (6 + wordSpacing) / 2, y: 12 }),
		).toBe(2);
		const scrolled = layoutControlText(
			input({ columns: 30, wordSpacing, selection: selected("A B", 3) }),
		);
		expect(scrolled.scroll.x).toBe(Math.max(0, 1 + wordSpacing));
		expect(scrolled.caret?.x).toBe(24 + wordSpacing - scrolled.scroll.x);
		const vertical = layoutControlText(
			input({
				kind: "textarea",
				columns: 30,
				rows: 16,
				wordSpacing,
				selection: selected("A B", 3),
			}),
		);
		expect(vertical.scroll.y).toBe(wordSpacing > 0 ? 8 : 0);
	},
);

it.each([6, -4])(
	"paints the actual selected separator area at %spx",
	(spacing) => {
		const test = fixture(undefined, spacing);
		const control = {
			...test.descriptor(),
			focused: true,
			selection: selected("A B", 1, 2),
		};
		const result = paint(control);
		let pixels = 0;
		for (let offset = 0; offset < result.pixels.length; offset += 4)
			if (
				controlSelectionBackground.every(
					(channel, index) => result.pixels[offset + index] === channel,
				)
			)
				pixels++;
		expect(pixels).toBe((6 + spacing) * 8);
		expect(
			layoutControlText(
				input({ wordSpacing: spacing, selection: control.selection }),
			).selectionRectangles,
		).toEqual([{ x: 12, y: 8, width: 6 + spacing, height: 8 }]);
	},
);

it.each([6, -4])(
	"navigates by actual horizontal stops at %spx",
	(wordSpacing) => {
		const text = "A B\nABCD\nA B";
		const value = input({
			kind: "textarea",
			text,
			wordSpacing,
			rows: 48,
			selection: selected(text, 2),
		});
		const next = moveControlText(value, "down");
		expect(next).toEqual({
			offset: wordSpacing > 0 ? 7 : 5,
			horizontal: 12 + wordSpacing,
		});
		expect(
			moveControlText(
				{ ...value, selection: selected(text, next?.offset ?? 0) },
				"down",
				next?.horizontal,
			),
		).toEqual({ offset: 11, horizontal: 12 + wordSpacing });
	},
);

it.each([6, -4])(
	"connects native pointer, keyboard and document paint at %spx",
	(spacing) => {
		const test = fixture(
			'<textarea id="field" cols="10" rows="3">A B\nABCD\nA B</textarea>',
			spacing,
		);
		const rectangle = documentGeometry(test.tree).getBoundingClientRect(
			test.field,
		);
		test.actions.mouse.move(rectangle.x + 18 + spacing, rectangle.y + 8);
		test.actions.mouse.down();
		test.actions.mouse.up();
		expect(test.selection()).toMatchObject({ anchor: 2, focus: 2 });
		test.actions.keyboard.press("ArrowDown");
		expect(test.selection()).toMatchObject({ focus: spacing > 0 ? 7 : 5 });
		test.actions.keyboard.press("ArrowDown");
		expect(test.selection()).toMatchObject({ focus: 11 });
		test.actions.keyboard.press("Shift+ArrowLeft");
		expect(test.selection()).toMatchObject({ start: 10, end: 11 });
		expect(rasterizeDocument(test.tree).metrics.paintedControls).toBe(1);
	},
);

it("invalidates remembered keyboard geometry when inherited spacing changes", () => {
	const test = fixture(
		'<div id="parent" style="word-spacing:6px"><textarea id="field" style="word-spacing:inherit" cols="10" rows="3">ABCD\nA B\nABCD</textarea></div>',
		6,
	);
	test.actions.focus.focus(test.tree.reference(test.field));
	test.actions.keyboard.press("Home");
	test.actions.keyboard.press("ArrowRight");
	test.actions.keyboard.press("ArrowRight");
	test.actions.keyboard.press("ArrowRight");
	test.actions.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ focus: 7 });
	const parent = new DocumentQueries(test.tree).querySelector("#parent");
	if (parent === null) throw new Error("Missing parent");
	test.tree.setAttribute(parent, "style", "word-spacing:-4px");
	test.actions.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ focus: 1 });
});

it("leaves tabs and hard newline geometry unchanged", () => {
	const value = input({ kind: "textarea", text: "A\tB\nCD", rows: 40 });
	for (const wordSpacing of [6, -4])
		expect(layoutControlText({ ...value, wordSpacing })).toEqual(
			layoutControlText(value),
		);
});

it("preserves default-zero descriptors, raster pixels and layout records", () => {
	const test = fixture();
	const baseline = describeControl(test.tree, test.field, 8);
	expect(test.descriptor(0)).toEqual(baseline);
	expect(test.descriptor(-0)).not.toHaveProperty("wordSpacing");
	expect(paint(test.descriptor()).pixels).toEqual(
		paint({ ...test.descriptor(), wordSpacing: 0 }).pixels,
	);
	expect(layoutControlText(input())).toEqual(
		layoutControlText(input({ wordSpacing: 0 })),
	);
});

it("accepts zero-width separators and does not insert a leading blank row for oversized cells", () => {
	const collapsed = layoutControlText(input({ wordSpacing: -6 }));
	expect(collapsed.glyphs.map(({ x }) => x)).toEqual([6, 12, 12]);
	expect(hitControlText(input({ wordSpacing: -6 }), { x: 12, y: 12 })).toBe(2);
	const oversized = layoutControlText(
		input({
			kind: "textarea",
			text: " B",
			columns: 30,
			rows: 40,
			wordSpacing: 24,
		}),
	);
	expect(oversized.glyphs.map(({ y }) => y)).toEqual([4, 12]);
});

it.each(
	[NaN, Infinity, -Infinity, null, "6", {}, []].map((spacing) => ({ spacing })),
)("rejects invalid spacing $spacing before raster work", ({ spacing }) => {
	const wordSpacing = spacing as number;
	const test = fixture();
	rejects(() => test.descriptor(wordSpacing), "invalid-input");
	rejects(() => layoutControlText(input({ wordSpacing })), "invalid-input");
	const charge = vi.fn();
	const allocate = vi.spyOn(raster, "createRaster");
	rejects(
		() =>
			rasterizeControl(
				{ ...test.descriptor(), wordSpacing },
				80,
				24,
				initialPaintStyle,
				charge,
			),
		"invalid-input",
	);
	expect(charge).not.toHaveBeenCalled();
	expect(allocate).not.toHaveBeenCalled();
});

it.each([" ", "\u00a0"])(
	"rejects backwards spaced %s even outside the viewport",
	(separator) => {
		const test = fixture(`<input id="field" value="A${separator}B">`);
		rejects(() => test.descriptor(-7), "unsupported");
		for (const wordSpacing of [-7, -8]) {
			const value = input({
				text: `A${separator}B`,
				wordSpacing,
				fontSize: 8,
				columns: 1,
			});
			rejects(() => layoutControlText(value), "unsupported");
			rejects(() => hitControlText(value, { x: -1, y: -1 }), "unsupported");
			rejects(
				() => moveControlText({ ...value, kind: "textarea" }, "down"),
				"unsupported",
			);
		}
	},
);

it.each([" ", "\u00a0"])(
	"does not expand zero-font %j control separators",
	(separator) => {
		const test = fixture(`<input id="field" value="A${separator}B">`);
		expect(test.descriptor(6, 0)).toMatchObject({
			fontSize: 0,
			wordSpacing: 6,
		});
		const value = input({
			text: `A${separator}B`,
			wordSpacing: 6,
			fontSize: 0,
		});
		expect(layoutControlText(value).glyphs).toEqual([]);
		expect(() => hitControlText(value, { x: -1, y: -1 })).not.toThrow();
		expect(() =>
			moveControlText({ ...value, kind: "textarea" }, "down"),
		).not.toThrow();
	},
);

it("keeps text, cell and raster resource limits bounded", () => {
	for (const overrides of [
		{ text: " ".repeat(4097) },
		{ columns: 4097 },
		{ rows: 4097 },
		{ fontSize: 513 },
		{ wordSpacing: 4091 },
		{ wordSpacing: 16_777_217 },
	])
		rejects(() => layoutControlText(input(overrides)), "resource-limit");
	const test = fixture('<button id="field">A B</button>');
	rejects(() => test.descriptor(4096), "resource-limit");
	const charge = vi.fn();
	rejects(
		() =>
			rasterizeControl(
				{ ...test.descriptor(), text: " ".repeat(4097) },
				80,
				24,
				initialPaintStyle,
				charge,
			),
		"resource-limit",
	);
	rejects(
		() =>
			rasterizeControl(
				test.descriptor(),
				4096,
				4096,
				initialPaintStyle,
				charge,
			),
		"resource-limit",
	);
	expect(charge).not.toHaveBeenCalled();
});

it("releases pointer observation and native caret ownership after use", () => {
	const test = fixture(undefined, 6);
	const pending = prepareControlPointer(test.tree, test.field, { x: 24, y: 8 });
	expect(pending?.offset).toBe(2);
	test.actions.focus.focus(test.tree.reference(test.field));
	expect(() => pending?.verify()).not.toThrow();
	pending?.release();
	pending?.release();
	test.tree.close();
	rejects(() => pending?.verify(), "not-actionable");
	expect(readNativeControlSelection(test.tree, test.field)).toBeUndefined();
});

it("rejects a pending pointer placement after inherited spacing changes", () => {
	const test = fixture(
		'<div id="parent" style="word-spacing:6px"><input id="field" value="A B" style="word-spacing:inherit"></div>',
		6,
	);
	const pending = prepareControlPointer(test.tree, test.field, { x: 24, y: 8 });
	expect(pending?.offset).toBe(2);
	const parent = new DocumentQueries(test.tree).querySelector("#parent");
	if (parent === null) throw new Error("Missing parent");
	test.tree.setAttribute(parent, "style", "word-spacing:-4px");
	test.actions.focus.focus(test.tree.reference(test.field));
	rejects(() => pending?.verify(), "not-actionable");
	pending?.release();
});
