import { expect, it } from "vitest";
import {
	type ControlTextLayoutInput,
	hitControlText,
	layoutControlText,
} from "./control-text-layout.js";
import { AgentBrowserError } from "./errors.js";

const defaults: ControlTextLayoutInput = {
	kind: "text",
	text: "abcd",
	fontSize: 8,
	columns: 60,
	rows: 24,
	placeholder: false,
};

function selected(text: string, anchor: number, focus = anchor) {
	return {
		anchor,
		focus,
		start: Math.min(anchor, focus),
		end: Math.max(anchor, focus),
		valueLength: text.length,
	};
}

function hit(
	x: number,
	y = 12,
	input: Partial<ControlTextLayoutInput> = {},
	allowed?: readonly number[],
) {
	return hitControlText({ ...defaults, ...input }, { x, y }, allowed);
}

function rejects(
	input: unknown,
	point: unknown,
	allowed: unknown,
	code = "invalid-input",
) {
	let error: unknown;
	try {
		hitControlText(
			input as ControlTextLayoutInput,
			point as { x: number; y: number },
			allowed as readonly number[],
		);
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code });
}

it.each(["text", "textarea"] as const)(
	"hits logical empty %s and clamps every inside frame edge",
	(kind) => {
		for (const x of [0, 6, 30, 59.99])
			for (const y of [0, 4, 12, 23.99])
				expect(hit(x, y, { kind, text: "" })).toBe(0);
	},
);

it.each([
	[0, 0],
	[6, 0],
	[8.999, 0],
	[9, 1],
	[12, 1],
	[15, 2],
	[18, 2],
	[30, 4],
	[59.9, 4],
])(
	"hits x=%s at nearest boundary %s, breaking midpoint ties right",
	(x, offset) => expect(hit(x)).toBe(offset),
);

it.each([
	[-1, 12],
	[60, 12],
	[6, -0.1],
	[6, 24],
	[Number.MAX_VALUE, 12],
])("returns undefined for finite outside point %s,%s", (x, y) => {
	expect(hit(x, y)).toBeUndefined();
});

it("uses the displayed initial viewport for an unselected long input", () => {
	const input = { text: "abcdef", columns: 30 };
	expect(hit(0, 12, input)).toBe(0);
	expect(hit(11, 12, input)).toBe(1);
	expect(hit(29, 12, input)).toBe(3);
});

it("uses the current End-scrolled texture rather than scrolling to its new hit", () => {
	const input = {
		text: "abcdef",
		columns: 30,
		selection: selected("abcdef", 6),
	};
	expect(layoutControlText({ ...defaults, ...input }).scroll.x).toBe(19);
	expect(hit(0, 12, input)).toBe(3);
	expect(hit(11, 12, input)).toBe(4);
	expect(hit(23, 12, input)).toBe(6);
	expect(hit(29, 12, input)).toBe(6);
});

it("shares Home and reverse-selection focus scrolling without changing selection", () => {
	const common = { text: "abcdef", columns: 30 };
	expect(hit(0, 12, { ...common, selection: selected(common.text, 0) })).toBe(
		0,
	);
	expect(
		hit(0, 12, { ...common, selection: selected(common.text, 6, 0) }),
	).toBe(0);
	expect(
		hit(0, 12, { ...common, selection: selected(common.text, 0, 6) }),
	).toBe(3);
});

it("hits a soft-wrap offset on both the preceding and following visual rows", () => {
	const input = { kind: "textarea" as const, text: "abc", columns: 24 };
	expect(hit(23, 8, input)).toBe(2);
	expect(hit(0, 16, input)).toBe(2);
	expect(hit(9, 16, input)).toBe(3);
	const painted = layoutControlText({
		...defaults,
		...input,
		selection: selected(input.text, 2),
	});
	expect(painted.caret).toEqual({ x: 6, y: 12, width: 1, height: 8 });
});

it("keeps a terminal full-row upstream boundary and following empty row", () => {
	const input = { kind: "textarea" as const, text: "ab", columns: 24 };
	expect(hit(23, 8, input)).toBe(2);
	expect(hit(0, 16, input)).toBe(2);
});

it("does not turn full-row hard LF into an extra blank row", () => {
	const input = { kind: "textarea" as const, text: "ab\nc", columns: 24 };
	expect(hit(23, 8, input)).toBe(2);
	expect(hit(0, 16, input)).toBe(3);
	expect(hit(23, 16, input)).toBe(4);
});

it("hits the closest visible row with following-row ties", () => {
	const input = { kind: "textarea" as const, text: "ab\ncd", rows: 32 };
	expect(hit(0, 0, input)).toBe(0);
	expect(hit(0, 11.999, input)).toBe(0);
	expect(hit(0, 12, input)).toBe(3);
	expect(hit(59, 31, input)).toBe(5);
});

it("includes blank and trailing LF rows without hitting the LF as a glyph", () => {
	const input = { kind: "textarea" as const, text: "\n\n", rows: 40 };
	expect(hit(59, 8, input)).toBe(0);
	expect(hit(59, 16, input)).toBe(1);
	expect(hit(59, 24, input)).toBe(2);
	expect(hit(59, 39, input)).toBe(2);
	expect(hit(59, 8, { ...input, text: "a\nb" })).toBe(1);
	expect(hit(0, 16, { ...input, text: "a\n" })).toBe(2);
});

it("uses whole-row End scrolling, including the visible final empty row", () => {
	const input = {
		kind: "textarea" as const,
		text: "abcdef",
		columns: 24,
		selection: selected("abcdef", 6),
	};
	expect(layoutControlText({ ...defaults, ...input }).scroll.y).toBe(16);
	expect(hit(0, 0, input)).toBe(4);
	expect(hit(23, 8, input)).toBe(6);
	expect(hit(0, 23, input)).toBe(6);
	expect(hit(0, 0, { ...input, selection: selected(input.text, 6, 0) })).toBe(
		0,
	);
});

it("uses partial right cells without adding a hidden horizontal target", () => {
	expect(hit(24.9, 12, { columns: 31 })).toBe(3);
	expect(hit(30, 12, { columns: 31 })).toBe(3);
	expect(hit(32, 12, { columns: 33 })).toBe(4);
});

it("uses a partial bottom row but does not admit a hidden row through bottom padding", () => {
	const input = {
		kind: "textarea" as const,
		text: "abc",
		columns: 18,
		rows: 21,
	};
	expect(hit(0, 16, input)).toBe(1);
	expect(hit(0, 20, input)).toBe(1);
	expect(hit(17, 20, input)).toBe(2);
	const exact = { ...input, text: "abcdef", columns: 24, rows: 24 };
	expect(hit(0, 23, exact)).toBe(2);
	expect(hit(23, 23, exact)).toBe(4);
});

it.each(["text", "textarea"] as const)(
	"never uses displayed %s placeholder offsets",
	(kind) => {
		const input = {
			kind,
			text: "a long hint",
			placeholder: true,
			selection: selected("", 0),
		};
		expect(hit(59, 23, input)).toBe(0);
		expect(hit(59, 23, input, [0])).toBe(0);
		expect(hit(59, 23, { ...input, selection: undefined })).toBe(0);
	},
);

it("maps surrogate pairs to source code-unit boundaries with midpoint ties", () => {
	const input = { text: "A🙂B" };
	expect(hit(12, 12, input)).toBe(1);
	expect(hit(14.999, 12, input)).toBe(1);
	expect(hit(15, 12, input)).toBe(3);
	expect(hit(18, 12, input)).toBe(3);
	expect(hit(21, 12, input)).toBe(4);
	for (let position = 0; position < 60; position += 0.5)
		expect([0, 1, 3, 4]).toContain(hit(position, 12, input));
	expect(hit(0, 16, { kind: "textarea", text: "🙂\nX" })).toBe(3);
});

it("restricts password stars to the supplied native boundary set", () => {
	const allowed = Object.freeze([0, 1, 3, 4]);
	const input = { text: "****" };
	expect(hit(17.999, 12, input, allowed)).toBe(1);
	expect(hit(18, 12, input, allowed)).toBe(3);
	for (let position = 0; position < 60; position += 0.5)
		expect(allowed).toContain(hit(position, 12, input, allowed));
	expect(hit(23, 8, { ...input, kind: "textarea", columns: 24 }, allowed)).toBe(
		1,
	);
	expect(hit(0, 16, { ...input, kind: "textarea", columns: 24 }, allowed)).toBe(
		3,
	);
});

it("does not reach a hidden row when a restrictive filter removes visible stops", () => {
	const input = {
		kind: "textarea" as const,
		text: "abcdef",
		columns: 18,
		rows: 16,
		selection: selected("abcdef", 3),
	};
	expect(hit(6, 8, input, [0, 6])).toBeUndefined();
});

it("uses fractional advances and row spacing without rounding the point", () => {
	const input = { fontSize: 10.5 };
	expect(hit(9.9374, 12, input)).toBe(0);
	expect(hit(9.9375, 12, input)).toBe(1);
	expect(
		hit(0, 14.5, {
			...input,
			kind: "textarea",
			text: "abc",
			columns: 28,
			rows: 40,
		}),
	).toBe(2);
});

it.each([
	{ fontSize: 0 },
	{ columns: 17 },
	{ rows: 15 },
	{ columns: 1, rows: 1 },
])("returns undefined for the existing empty viewport policy %j", (input) => {
	expect(hit(0, 0, input)).toBeUndefined();
});

it.each([
	null,
	undefined,
	[],
	{ x: "6", y: 12 },
	{ x: 6 },
	{ x: Number.NaN, y: 0 },
	{ x: 0, y: Number.POSITIVE_INFINITY },
])("rejects invalid points before a zero-font return %#", (point) => {
	rejects({ ...defaults, fontSize: 0 }, point, undefined);
});

it.each([
	null,
	[],
	[1, 4],
	[0, 3],
	[0, 1, 1, 4],
	[0, 3, 1, 4],
	[0, 1.5, 4],
	[0, -1, 4],
	[0, 5],
	[0, Number.NaN, 4],
	[0, Number.MAX_SAFE_INTEGER + 1],
	new Uint32Array([0, 4]),
])(
	"rejects invalid allowed lists before an outside-point return %#",
	(allowed) => {
		rejects(defaults, { x: -1, y: 0 }, allowed);
	},
);

it("rejects displayed surrogate interiors and incorrect placeholder endpoints", () => {
	rejects({ ...defaults, text: "A🙂B" }, { x: 6, y: 12 }, [0, 1, 2, 3, 4]);
	rejects({ ...defaults, placeholder: true }, { x: 6, y: 12 }, [0, 4]);
	rejects({ ...defaults, text: "" }, { x: 6, y: 12 }, [0, 0]);
	expect(hit(6, 12, { text: "" }, [0])).toBe(0);
});

it.each([
	[null, "invalid-input"],
	[{ ...defaults, columns: 0 }, "invalid-input"],
	[{ ...defaults, rows: 1.5 }, "invalid-input"],
	[{ ...defaults, fontSize: -1 }, "invalid-input"],
	[{ ...defaults, text: "a\nb" }, "unsupported"],
	[{ ...defaults, kind: "textarea", text: "a\r\nb" }, "unsupported"],
	[{ ...defaults, selection: selected("stale", 0) }, "invalid-input"],
	[{ ...defaults, text: "a".repeat(4097) }, "resource-limit"],
	[{ ...defaults, fontSize: 513 }, "resource-limit"],
	[{ ...defaults, columns: 4097 }, "resource-limit"],
	[{ ...defaults, columns: 1025, rows: 1024 }, "resource-limit"],
])("keeps layout input validation and resource limits %#", (input, code) => {
	rejects(input, { x: -1, y: 0 }, undefined, code as string);
});

it("bounds filters before walking them and accepts the exact 4097-stop ceiling", () => {
	rejects(defaults, { x: 6, y: 12 }, new Array(4098).fill(0), "resource-limit");
	const allowed = Array.from({ length: 4097 }, (_, index) => index);
	expect(
		hit(4095, 8, { text: "a".repeat(4096), columns: 4096, rows: 16 }, allowed),
	).toBe(681);
});

it("does not mutate input, selection, allowed offsets or the rendered snapshot", () => {
	const input = Object.freeze({
		...defaults,
		selection: Object.freeze(selected("abcd", 4)),
	});
	const point = Object.freeze({ x: 9, y: 12 });
	const allowed = Object.freeze([0, 1, 3, 4]);
	const before = layoutControlText(input);
	expect(hitControlText(input, point, allowed)).toBe(1);
	expect(layoutControlText(input)).toEqual(before);
	expect(input.selection.focus).toBe(4);
	expect(point).toEqual({ x: 9, y: 12 });
	expect(allowed).toEqual([0, 1, 3, 4]);
});

it("agrees with visible glyph centers using the same displayed scroll", () => {
	for (const kind of ["text", "textarea"] as const)
		for (const text of ["ab", "abcdef", "A🙂B", "a\n\nb\n", "ab\nc"])
			for (const fontSize of [8, 10.5])
				for (const columns of [24, 31])
					for (const focus of [undefined, 0, text.length]) {
						if (kind === "text" && text.includes("\n")) continue;
						const input = {
							...defaults,
							kind,
							text,
							fontSize,
							columns,
							rows: 40,
							selection:
								focus === undefined ? undefined : selected(text, focus),
						};
						const output = layoutControlText(input);
						for (const glyph of output.glyphs) {
							const point = {
								x: glyph.x + glyph.width / 2,
								y: glyph.y + glyph.height / 2,
							};
							if (
								point.x < output.clip.x ||
								point.x >= output.clip.x + output.clip.width ||
								point.y < output.clip.y ||
								point.y >= output.clip.y + output.clip.height
							)
								continue;
							expect(hitControlText(input, point)).toBe(
								glyph.offset + glyph.codeUnits,
							);
						}
					}
});
