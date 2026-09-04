import { expect, it } from "vitest";
import {
	type ControlTextLayoutInput,
	type NativeControlSelection,
	layoutControlText,
} from "./control-text-layout.js";
import { AgentBrowserError } from "./errors.js";

const defaults: ControlTextLayoutInput = {
	kind: "text",
	text: "abc",
	fontSize: 8,
	columns: 30,
	rows: 24,
	placeholder: false,
};

function selection(
	text: string,
	anchor: number,
	focus = anchor,
): NativeControlSelection {
	return {
		anchor,
		focus,
		start: Math.min(anchor, focus),
		end: Math.max(anchor, focus),
		valueLength: text.length,
	};
}

function layout(input: Partial<ControlTextLayoutInput> = {}) {
	return layoutControlText({ ...defaults, ...input });
}

function rejects(input: unknown, code: string) {
	let error: unknown;
	try {
		layoutControlText(input as ControlTextLayoutInput);
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code });
}

it.each(["text", "textarea"] as const)(
	"keeps an empty %s viewport with an optional start caret",
	(kind) => {
		const empty = layout({ kind, text: "" });
		expect(empty).toEqual({
			clip: { x: 6, y: 4, width: 18, height: 16 },
			glyphs: [],
			selectionRectangles: [],
			scroll: { x: 0, y: 0 },
		});
		expect(
			layout({ kind, text: "", selection: selection("", 0) }).caret,
		).toEqual({ x: 6, y: kind === "text" ? 8 : 4, width: 1, height: 8 });
	},
);

it("preserves single-line origin, cells, source offsets and initial clipping", () => {
	const result = layout({ text: "abcdef", columns: 31 });
	expect(result.scroll).toEqual({ x: 0, y: 0 });
	expect(result.caret).toBeUndefined();
	expect(result.selectionRectangles).toEqual([]);
	expect(result.glyphs).toEqual([
		{
			character: "a",
			offset: 0,
			codeUnits: 1,
			x: 6,
			y: 8,
			width: 6,
			height: 8,
		},
		{
			character: "b",
			offset: 1,
			codeUnits: 1,
			x: 12,
			y: 8,
			width: 6,
			height: 8,
		},
		{
			character: "c",
			offset: 2,
			codeUnits: 1,
			x: 18,
			y: 8,
			width: 6,
			height: 8,
		},
		{
			character: "d",
			offset: 3,
			codeUnits: 1,
			x: 24,
			y: 8,
			width: 6,
			height: 8,
		},
	]);
});

it.each([
	[0, 0, 6],
	[2, 0, 18],
	[3, 1, 23],
	[4, 7, 23],
	[6, 19, 23],
])("minimally reveals single-line focus %s", (focus, scroll, caretX) => {
	const result = layout({
		text: "abcdef",
		selection: selection("abcdef", focus),
	});
	expect(result.scroll).toEqual({ x: scroll, y: 0 });
	expect(result.caret).toEqual({ x: caretX, y: 8, width: 1, height: 8 });
});

it("uses focus orientation for visibility without a noncollapsed caret", () => {
	const forward = layout({
		text: "abcdef",
		selection: selection("abcdef", 0, 6),
	});
	const reverse = layout({
		text: "abcdef",
		selection: selection("abcdef", 6, 0),
	});
	expect(forward.scroll.x).toBe(19);
	expect(reverse.scroll.x).toBe(0);
	expect(forward.caret).toBeUndefined();
	expect(reverse.caret).toBeUndefined();
	expect(forward.selectionRectangles.map((cell) => cell.x)).toEqual([
		5, 11, 17,
	]);
	expect(reverse.selectionRectangles.map((cell) => cell.x)).toEqual([
		6, 12, 18,
	]);
});

it("selects only cells inside the half-open UTF-16 range", () => {
	expect(
		layout({ selection: selection("abc", 1, 2) }).selectionRectangles,
	).toEqual([{ x: 12, y: 8, width: 6, height: 8 }]);
});

it("wraps textarea characters with following-line affinity at a soft boundary", () => {
	const result = layout({
		kind: "textarea",
		columns: 24,
		selection: selection("abc", 2),
	});
	expect(result.glyphs.map(({ offset, x, y }) => [offset, x, y])).toEqual([
		[0, 6, 4],
		[1, 12, 4],
		[2, 6, 12],
	]);
	expect(result.caret).toEqual({ x: 6, y: 12, width: 1, height: 8 });
	expect(result.scroll).toEqual({ x: 0, y: 0 });
});

it("uses a following row for an exact-width terminal caret", () => {
	const result = layout({
		kind: "textarea",
		text: "ab",
		columns: 24,
		selection: selection("ab", 2),
	});
	expect(result.caret).toEqual({ x: 6, y: 12, width: 1, height: 8 });
	expect(result.glyphs).toHaveLength(2);
});

it("uses only whole-row scroll and returns home without retaining scroll state", () => {
	const input = { kind: "textarea" as const, text: "abcdef", columns: 24 };
	const end = layout({ ...input, selection: selection(input.text, 6) });
	expect(end.scroll).toEqual({ x: 0, y: 16 });
	expect(end.caret).toEqual({ x: 6, y: 12, width: 1, height: 8 });
	expect(end.glyphs.map((glyph) => glyph.offset)).toEqual([4, 5]);
	const home = layout({ ...input, selection: selection(input.text, 0) });
	expect(home.scroll).toEqual({ x: 0, y: 0 });
	expect(home.glyphs.map((glyph) => glyph.offset)).toEqual([0, 1, 2, 3]);
	expect(layout(input).scroll).toEqual({ x: 0, y: 0 });
});

it("positions normalized LF, blank rows and trailing LF without exposing LF glyphs", () => {
	const text = "a\n\nb\n";
	const result = layout({
		kind: "textarea",
		text,
		rows: 40,
		selection: selection(text, text.length),
	});
	expect(
		result.glyphs.map(({ character, offset, x, y }) => [
			character,
			offset,
			x,
			y,
		]),
	).toEqual([
		["a", 0, 6, 4],
		["b", 3, 6, 20],
	]);
	expect(result.caret).toEqual({ x: 6, y: 28, width: 1, height: 8 });
	expect(result.scroll.y).toBe(0);
	const trailing = layout({
		kind: "textarea",
		text: "\n\n",
		selection: selection("\n\n", 2),
	});
	expect(trailing.glyphs).toEqual([]);
	expect(trailing.scroll.y).toBe(8);
	expect(trailing.caret).toEqual({ x: 6, y: 12, width: 1, height: 8 });
});

it.each([
	[1, 2],
	[2, 1],
])("paints a one-advance LF-only selection %s to %s", (anchor, focus) => {
	const result = layout({
		kind: "textarea",
		text: "a\nb",
		selection: selection("a\nb", anchor, focus),
	});
	expect(result.selectionRectangles).toEqual([
		{ x: 12, y: 4, width: 6, height: 8 },
	]);
	expect(result.caret).toBeUndefined();
});

it("does not invent a blank wrapped row before a hard LF", () => {
	const result = layout({
		kind: "textarea",
		text: "ab\nc",
		columns: 24,
		selection: selection("ab\nc", 2),
	});
	expect(result.glyphs.map(({ character, y }) => [character, y])).toEqual([
		["a", 4],
		["b", 4],
		["c", 12],
	]);
	expect(result.caret).toEqual({ x: 17, y: 4, width: 1, height: 8 });
});

it.each(["text", "textarea"] as const)(
	"keeps %s placeholder text unselected at logical zero",
	(kind) => {
		const result = layout({
			kind,
			text: "a long hint",
			placeholder: true,
			selection: selection("", 0),
		});
		expect(result.scroll).toEqual({ x: 0, y: 0 });
		expect(result.selectionRectangles).toEqual([]);
		expect(result.caret).toEqual({
			x: 6,
			y: kind === "text" ? 8 : 4,
			width: 1,
			height: 8,
		});
		expect(result.glyphs.length).toBeGreaterThan(0);
		expect(layout({ kind, placeholder: true }).caret).toBeUndefined();
	},
);

it("treats masked stars as independent code units without retaining a raw value", () => {
	const result = layout({
		text: "****",
		columns: 60,
		selection: selection("****", 1, 3),
	});
	expect(
		result.glyphs.map(({ character, offset, codeUnits }) => [
			character,
			offset,
			codeUnits,
		]),
	).toEqual([
		["*", 0, 1],
		["*", 1, 1],
		["*", 2, 1],
		["*", 3, 1],
	]);
	expect(result.selectionRectangles).toHaveLength(2);
	expect(Object.keys(result).sort()).toEqual([
		"clip",
		"glyphs",
		"scroll",
		"selectionRectangles",
	]);
});

it("maps surrogate pairs as one glyph while retaining source code-unit offsets", () => {
	const result = layout({
		text: "A🙂B",
		columns: 60,
		selection: selection("A🙂B", 1, 3),
	});
	expect(
		result.glyphs.map(({ character, offset, codeUnits }) => [
			character,
			offset,
			codeUnits,
		]),
	).toEqual([
		["A", 0, 1],
		["🙂", 1, 2],
		["B", 3, 1],
	]);
	expect(result.selectionRectangles).toEqual([
		{ x: 12, y: 8, width: 6, height: 8 },
	]);
	expect(
		layout({ text: "A🙂B", columns: 60, selection: selection("A🙂B", 3) }).caret
			?.x,
	).toBe(18);
	const multiline = layout({ kind: "textarea", text: "🙂\nX" });
	expect(multiline.glyphs.map((glyph) => glyph.offset)).toEqual([0, 3]);
});

it.each([
	selection("A🙂B", 2),
	selection("A🙂B", 0, 2),
	selection("A🙂B", 2, 4),
])("rejects an interior surrogate boundary %j", (selected) => {
	rejects({ ...defaults, text: "A🙂B", selection: selected }, "invalid-input");
});

it("leaves unsupported and unpaired glyph policy to the renderer", () => {
	const result = layout({ text: "\ud800\t中", columns: 60 });
	expect(result.glyphs.map((glyph) => glyph.character)).toEqual([
		"\ud800",
		"\t",
		"中",
	]);
});

it("retains fractional font metrics, row spacing and centered origins", () => {
	const text = "ab";
	const result = layout({
		text,
		fontSize: 10.5,
		columns: 40,
		selection: selection(text, 2),
	});
	expect(
		result.glyphs.map(({ x, y, width, height }) => [x, y, width, height]),
	).toEqual([
		[6, 6.75, 7.875, 10.5],
		[13.875, 6.75, 7.875, 10.5],
	]);
	expect(result.caret).toEqual({ x: 21.75, y: 6.75, width: 1, height: 10.5 });
	const wrapped = layout({
		kind: "textarea",
		fontSize: 10.5,
		columns: 28,
		rows: 40,
		selection: selection("abc", 2),
	});
	expect(wrapped.caret).toEqual({ x: 6, y: 14.5, width: 1, height: 10.5 });
});

it("returns partially visible bottom glyphs but scrolls focus by complete rows", () => {
	const initial = layout({ kind: "textarea", text: "a\nb", rows: 21 });
	expect(initial.glyphs.map((glyph) => glyph.y)).toEqual([4, 12]);
	const focused = layout({
		kind: "textarea",
		text: "a\nb",
		rows: 21,
		selection: selection("a\nb", 2),
	});
	expect(focused.scroll.y).toBe(8);
	expect(focused.caret?.y).toBe(4);
});

it.each([
	{ fontSize: 0 },
	{ columns: 17 },
	{ rows: 15 },
	{ columns: 1, rows: 1 },
])("omits text and caret when a glyph row cannot fit: %j", (input) => {
	const result = layout({ ...input, selection: selection("abc", 1) });
	expect(result.glyphs).toEqual([]);
	expect(result.selectionRectangles).toEqual([]);
	expect(result.caret).toBeUndefined();
	expect(result.scroll).toEqual({ x: 0, y: 0 });
	expect(result.clip.width).toBeGreaterThanOrEqual(0);
	expect(result.clip.height).toBeGreaterThanOrEqual(0);
});

it("deeply freezes results without freezing or retaining caller-owned objects", () => {
	const selected = selection("abc", 0, 2);
	const input = { ...defaults, selection: selected };
	const result = layoutControlText(input);
	for (const value of [
		result,
		result.clip,
		result.scroll,
		result.glyphs,
		result.selectionRectangles,
		...result.glyphs,
		...result.selectionRectangles,
	])
		expect(Object.isFrozen(value)).toBe(true);
	expect(Object.isFrozen(input)).toBe(false);
	expect(Object.isFrozen(selected)).toBe(false);
	input.text = "xyz";
	expect(result.glyphs.map((glyph) => glyph.character).join("")).toBe("abc");
	expect(
		Object.isFrozen(layout({ selection: selection("abc", 0) }).caret),
	).toBe(true);
});

it.each([
	[null, "invalid-input"],
	[[], "invalid-input"],
	[{ ...defaults, kind: "select" }, "unsupported"],
	[{ ...defaults, text: null }, "invalid-input"],
	[{ ...defaults, placeholder: 1 }, "invalid-input"],
	[{ ...defaults, fontSize: Number.NaN }, "invalid-input"],
	[{ ...defaults, fontSize: Number.POSITIVE_INFINITY }, "invalid-input"],
	[{ ...defaults, fontSize: -1 }, "invalid-input"],
	[{ ...defaults, fontSize: 513 }, "resource-limit"],
	[{ ...defaults, columns: 0 }, "invalid-input"],
	[{ ...defaults, columns: 1.5 }, "invalid-input"],
	[{ ...defaults, columns: "30" }, "invalid-input"],
	[{ ...defaults, columns: 4097 }, "resource-limit"],
	[{ ...defaults, rows: -1 }, "invalid-input"],
	[{ ...defaults, rows: Number.POSITIVE_INFINITY }, "invalid-input"],
	[{ ...defaults, rows: Number.MAX_SAFE_INTEGER + 1 }, "invalid-input"],
	[{ ...defaults, rows: 4097 }, "resource-limit"],
	[{ ...defaults, columns: 1025, rows: 1024 }, "resource-limit"],
	[{ ...defaults, text: "a".repeat(4097), fontSize: 0 }, "resource-limit"],
	[{ ...defaults, text: "a\nb" }, "unsupported"],
	[{ ...defaults, kind: "textarea", text: "a\r\nb" }, "unsupported"],
	[{ ...defaults, kind: "textarea", text: "a\rb" }, "unsupported"],
])("rejects invalid or out-of-budget input %#", (input, code) => {
	rejects(input, code as string);
});

it.each([
	null,
	{},
	[],
	{ ...selection("abc", 1), focus: 1.5 },
	{ ...selection("abc", 1), anchor: -1 },
	{ ...selection("abc", 1), focus: 4 },
	{ ...selection("abc", 1), start: 0 },
	{ ...selection("abc", 1), end: 2 },
	{ ...selection("abc", 1), valueLength: 2 },
	{ ...selection("abc", 1), valueLength: Number.POSITIVE_INFINITY },
	{ ...selection("abc", 1), focus: Number.MAX_SAFE_INTEGER + 1 },
])(
	"rejects invalid selection before even a zero-font early return %#",
	(selected) => {
		rejects({ ...defaults, fontSize: 0, selection: selected }, "invalid-input");
	},
);

it("rejects placeholder selection based on displayed hint length", () => {
	rejects(
		{ ...defaults, placeholder: true, selection: selection("abc", 0) },
		"invalid-input",
	);
});

it("accepts exact text, font, axis and pixel ceilings with bounded output", () => {
	const maximum = layout({ text: "a".repeat(4096), columns: 1024, rows: 1024 });
	expect(maximum.glyphs.length).toBeLessThanOrEqual(4096);
	expect(maximum.glyphs.length).toBeGreaterThan(0);
	expect(
		layout({ fontSize: 512, columns: 512, rows: 1024 }).glyphs,
	).toHaveLength(2);
	expect(layout({ columns: 4096, rows: 1 }).glyphs).toEqual([]);
	expect(layout({ columns: 1, rows: 4096 }).glyphs).toEqual([]);
	expect(layout({ fontSize: Number.MIN_VALUE }).glyphs).toHaveLength(3);
});

it("keeps every returned cell intersecting the clip and every eligible caret inside it", () => {
	for (const kind of ["text", "textarea"] as const)
		for (const text of ["", "ab", "abcde", "a\n\nb\n", "🙂a"])
			for (const fontSize of [8, 10.5])
				for (const columns of [18, 25])
					for (const rows of [16, 24]) {
						if (kind === "text" && text.includes("\n")) continue;
						let focus = 0;
						for (const character of ["", ...text]) {
							focus += character.length;
							const result = layout({
								kind,
								text,
								fontSize,
								columns,
								rows,
								selection: selection(text, focus),
							});
							const { clip, caret } = result;
							for (const cell of [
								...result.glyphs,
								...result.selectionRectangles,
								...(caret ? [caret] : []),
							]) {
								expect(cell.x).toBeLessThan(clip.x + clip.width);
								expect(cell.x + cell.width).toBeGreaterThan(clip.x);
								expect(cell.y).toBeLessThan(clip.y + clip.height);
								expect(cell.y + cell.height).toBeGreaterThan(clip.y);
							}
							if (clip.width >= fontSize * 0.75 && clip.height >= fontSize) {
								expect(caret).toBeDefined();
								expect(caret?.x).toBeGreaterThanOrEqual(clip.x);
								expect((caret?.x ?? 0) + 1).toBeLessThanOrEqual(
									clip.x + clip.width,
								);
								expect(caret?.y).toBeGreaterThanOrEqual(clip.y);
								expect((caret?.y ?? 0) + fontSize).toBeLessThanOrEqual(
									clip.y + clip.height,
								);
							}
						}
					}
});
