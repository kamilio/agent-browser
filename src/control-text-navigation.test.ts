import { expect, it } from "vitest";
import {
	type ControlTextLayoutInput,
	layoutControlText,
	moveControlText,
} from "./control-text-layout.js";
import { AgentBrowserError } from "./errors.js";

function selected(text: string, focus: number, anchor = focus) {
	return {
		anchor,
		focus,
		start: Math.min(anchor, focus),
		end: Math.max(anchor, focus),
		valueLength: text.length,
	};
}

function input(
	text = "ABCDE\nX\n12345",
	focus = text.length,
	overrides: Partial<ControlTextLayoutInput> = {},
): ControlTextLayoutInput {
	return {
		kind: "textarea",
		text,
		fontSize: 8,
		columns: 132,
		rows: 24,
		placeholder: false,
		selection: selected(text, focus),
		...overrides,
	};
}

function rejects(
	value: unknown,
	direction: unknown,
	preferred?: unknown,
	code = "invalid-input",
	message?: string,
) {
	let error: unknown;
	try {
		moveControlText(
			value as ControlTextLayoutInput,
			direction as "up",
			preferred as number,
		);
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({
		code,
		...(message === undefined ? {} : { message }),
	});
}

it("retains a preferred column through short rows in the required up/down sequence", () => {
	const text = "ABCDE\nX\n12345";
	let focus = 13;
	let preferred: number | undefined;
	for (const [direction, offset] of [
		["up", 7],
		["up", 5],
		["down", 7],
		["down", 13],
	] as const) {
		const result = moveControlText(input(text, focus), direction, preferred);
		expect(result).toEqual({ offset, horizontal: 30 });
		focus = result?.offset ?? -1;
		preferred = result?.horizontal;
	}
});

it("retains x18 through the short row rather than adopting that row's x6", () => {
	const first = moveControlText(input(undefined, 3), "down");
	expect(first).toEqual({ offset: 7, horizontal: 18 });
	expect(
		moveControlText(input(undefined, 7), "down", first?.horizontal),
	).toEqual({ offset: 11, horizontal: 18 });
	expect(moveControlText(input(undefined, 7), "down")).toEqual({
		offset: 9,
		horizontal: 6,
	});
});

it("reads selection focus, not anchor, and never owns Shift selection state", () => {
	const text = "ABCDE\nX\n12345";
	for (const anchor of [0, 7, 13]) {
		const selection = Object.freeze(selected(text, 7, anchor));
		const value = Object.freeze(input(text, 7, { selection }));
		expect(moveControlText(value, "up", 30)).toEqual({
			offset: 5,
			horizontal: 30,
		});
		expect(selection.anchor).toBe(anchor);
		expect(selection.focus).toBe(7);
	}
});

it("clamps beyond first/last rows while retaining the preferred horizontal", () => {
	expect(moveControlText(input(undefined, 3), "up")).toEqual({
		offset: 0,
		horizontal: 18,
	});
	expect(moveControlText(input(), "down")).toEqual({
		offset: 13,
		horizontal: 30,
	});
	expect(moveControlText(input(undefined, 0), "up", 4096)).toEqual({
		offset: 0,
		horizontal: 4096,
	});
	expect(moveControlText(input("abc", 1), "down", 18)).toEqual({
		offset: 3,
		horizontal: 18,
	});
});

it.each(["up", "down"] as const)(
	"keeps an empty actual value at zero for %s",
	(direction) => {
		expect(moveControlText(input(""), direction)).toEqual({
			offset: 0,
			horizontal: 0,
		});
		expect(moveControlText(input(""), direction, 18)).toEqual({
			offset: 0,
			horizontal: 18,
		});
	},
);

it("includes blank and trailing LF rows without losing preferred horizontal", () => {
	expect(moveControlText(input("a\n\nb\n", 5), "up", 6)).toEqual({
		offset: 4,
		horizontal: 6,
	});
	expect(moveControlText(input("a\n\nb\n", 4), "up", 6)).toEqual({
		offset: 2,
		horizontal: 6,
	});
	expect(moveControlText(input("\n\n", 2), "up", 30)).toEqual({
		offset: 1,
		horizontal: 30,
	});
	expect(moveControlText(input("\n\n", 0), "down", 30)).toEqual({
		offset: 1,
		horizontal: 30,
	});
});

it("uses canonical following-row stops at both source and destination", () => {
	const value = (focus: number) =>
		input("abcd", focus, { columns: 24, rows: 40 });
	expect(moveControlText(value(3), "up", 12)).toEqual({
		offset: 1,
		horizontal: 12,
	});
	expect(moveControlText(value(1), "down", 12)).toEqual({
		offset: 3,
		horizontal: 12,
	});
	expect(moveControlText(value(2), "down")).toEqual({
		offset: 4,
		horizontal: 0,
	});
	expect(moveControlText(value(4), "up")).toEqual({ offset: 2, horizontal: 0 });
	expect(moveControlText(value(4), "up", 6)).toEqual({
		offset: 3,
		horizontal: 6,
	});
});

it("keeps the full-row LF boundary upstream when it is not a soft wrap", () => {
	const value = (focus: number) => input("ab\nc", focus, { columns: 24 });
	expect(moveControlText(value(4), "up", 12)).toEqual({
		offset: 2,
		horizontal: 12,
	});
	expect(moveControlText(value(2), "down")).toEqual({
		offset: 4,
		horizontal: 12,
	});
});

it("chooses the larger offset for a horizontal midpoint tie", () => {
	expect(moveControlText(input("AB\nCD", 4), "up", 3)).toEqual({
		offset: 1,
		horizontal: 3,
	});
	expect(moveControlText(input("AB\nCD", 1), "down", 3)).toEqual({
		offset: 4,
		horizontal: 3,
	});
});

it("preserves surrogate boundaries and ties across two-unit glyphs", () => {
	const text = "A🙂B\nC🙂D";
	expect(moveControlText(input(text, 3), "down")).toEqual({
		offset: 8,
		horizontal: 12,
	});
	expect(moveControlText(input(text, 8), "up")).toEqual({
		offset: 3,
		horizontal: 12,
	});
	expect(moveControlText(input(text, 3), "down", 9)).toEqual({
		offset: 8,
		horizontal: 9,
	});
	rejects(input(text, 2), "up");
	expect(moveControlText(input("\ud800\nX", 3), "up")).toEqual({
		offset: 1,
		horizontal: 6,
	});
});

it("keeps fractional advances, including a clipped pre-LF caret's actual horizontal", () => {
	const first = moveControlText(
		input("abc\nx\n123", 2, { fontSize: 10.5 }),
		"down",
	);
	expect(first).toEqual({ offset: 5, horizontal: 15.75 });
	expect(
		moveControlText(
			input("abc\nx\n123", 5, { fontSize: 10.5 }),
			"down",
			first?.horizontal,
		),
	).toEqual({ offset: 8, horizontal: 15.75 });
	const value = input("ab\nc", 2, { fontSize: 10.5, columns: 28, rows: 40 });
	expect(layoutControlText(value).caret?.x).toBe(21);
	expect(moveControlText(value, "down")).toEqual({
		offset: 4,
		horizontal: 15.75,
	});
});

it("navigates logical visual rows outside the currently scrolled viewport", () => {
	for (const rows of [16, 24, 80])
		expect(moveControlText(input(undefined, 13, { rows }), "up")).toEqual({
			offset: 7,
			horizontal: 30,
		});
	const text = "a\n".repeat(10);
	expect(moveControlText(input(text, text.length, { rows: 16 }), "up")).toEqual(
		{ offset: 18, horizontal: 0 },
	);
});

it.each(["up", "down"] as const)(
	"treats a selected placeholder as logical zero for %s",
	(direction) => {
		const value = input("a long\nplaceholder", 0, {
			placeholder: true,
			selection: selected("", 0),
		});
		expect(moveControlText(value, direction, 30)).toEqual({
			offset: 0,
			horizontal: 0,
		});
		expect(
			moveControlText({ ...value, fontSize: 0 }, direction),
		).toBeUndefined();
	},
);

it.each([
	{ kind: "text" as const },
	{ selection: undefined },
	{ fontSize: 0 },
	{ columns: 17 },
	{ rows: 15 },
	{ columns: 1, rows: 1 },
])(
	"does not invent movement for unsupported or ineligible input %j",
	(overrides) => {
		expect(moveControlText(input("abc", 1, overrides), "up")).toBeUndefined();
		expect(moveControlText(input("abc", 1, overrides), "down")).toBeUndefined();
	},
);

it("returns fresh frozen numeric-only results without modifying input or painting", () => {
	const value = Object.freeze(
		input(undefined, 7, {
			selection: Object.freeze(selected("ABCDE\nX\n12345", 7, 13)),
		}),
	);
	const before = layoutControlText(value);
	const result = moveControlText(value, "up", 30);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.keys(result ?? {}).sort()).toEqual(["horizontal", "offset"]);
	expect(moveControlText(value, "up", 30)).not.toBe(result);
	expect(layoutControlText(value)).toEqual(before);
	expect(value.selection).toEqual(selected("ABCDE\nX\n12345", 7, 13));
});

it.each(["Up", "left", "", undefined, null, 1])(
	"rejects invalid direction %# even for a no-op text input",
	(direction) => {
		rejects(
			input("abc", 1, { kind: "text" }),
			direction,
			undefined,
			"invalid-input",
			"Invalid control text navigation direction",
		);
	},
);

it.each([
	null,
	"0",
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	-1,
	4096.01,
])(
	"rejects invalid preferred horizontal %# before a missing-selection return",
	(preferred) => {
		rejects(
			input("abc", 1, { selection: undefined }),
			"down",
			preferred,
			"invalid-input",
			"Invalid control text preferred horizontal",
		);
	},
);

it.each([
	[null, "invalid-input"],
	[[], "invalid-input"],
	[input("abc", 1, { fontSize: Number.NaN }), "invalid-input"],
	[input("abc", 1, { fontSize: -1 }), "invalid-input"],
	[input("abc", 1, { rows: 1.5 }), "invalid-input"],
	[input("abc", 1, { columns: 0 }), "invalid-input"],
	[
		input("abc", 1, { selection: selected("stale", 1), kind: "text" }),
		"invalid-input",
	],
	[input("a\rb", 1), "unsupported"],
	[input("a\nb", 1, { kind: "text" }), "unsupported"],
	[input("a".repeat(4097), 1, { selection: undefined }), "resource-limit"],
	[input("abc", 1, { fontSize: 513 }), "resource-limit"],
	[input("abc", 1, { columns: 4097 }), "resource-limit"],
	[input("abc", 1, { columns: 1025, rows: 1024 }), "resource-limit"],
])(
	"retains checkedInput validation before unsupported return %#",
	(value, code) => {
		rejects(value, "up", undefined, code as string);
	},
);

it("accepts exact input/preference ceilings and positive subnormal fonts", () => {
	const text = "a\n".repeat(2048);
	expect(moveControlText(input(text), "up")).toEqual({
		offset: 4094,
		horizontal: 0,
	});
	expect(moveControlText(input(text), "up", 4096)).toEqual({
		offset: 4095,
		horizontal: 4096,
	});
	expect(
		moveControlText(
			input("a\nb", 3, { fontSize: 512, columns: 512, rows: 1024 }),
			"up",
		),
	).toEqual({ offset: 1, horizontal: 384 });
	expect(
		moveControlText(input("a\nb", 3, { fontSize: Number.MIN_VALUE }), "up"),
	).toEqual({ offset: 1, horizontal: Number.MIN_VALUE });
});

function paintedStop(value: ControlTextLayoutInput, offset: number) {
	const layout = layoutControlText({
		...value,
		selection: selected(value.text, offset),
	});
	const caret = layout.caret;
	if (!caret) throw new Error("Missing oracle caret");
	const next = layout.glyphs.find(
		(glyph) => glyph.offset === offset && glyph.y === caret.y,
	);
	const previous = layout.glyphs.find(
		(glyph) => glyph.offset + glyph.codeUnits === offset && glyph.y === caret.y,
	);
	const horizontal = next
		? next.x + layout.scroll.x - layout.clip.x
		: previous
			? previous.x + previous.width + layout.scroll.x - layout.clip.x
			: 0;
	return {
		offset,
		horizontal,
		row: (caret.y + layout.scroll.y - 4) / value.fontSize,
	};
}

it("exhaustively agrees with painted canonical rows for all short four-symbol strings", () => {
	const strings = [""];
	let level = [""];
	for (let depth = 0; depth < 3; depth++) {
		level = level.flatMap((prefix) =>
			["a", "b", "\n", "🙂"].map((symbol) => prefix + symbol),
		);
		strings.push(...level);
	}
	let fixtures = 0;
	let comparisons = 0;
	for (const text of strings)
		for (const fontSize of [8, 10.5])
			for (const capacity of [1, 2, 3]) {
				const advance = fontSize * 0.75;
				const value = input(text, 0, {
					fontSize,
					columns: 12 + Math.ceil(capacity * advance),
					rows: 80,
				});
				const offsets = [0];
				for (const character of text)
					offsets.push(offsets[offsets.length - 1] + character.length);
				const stops = offsets.map((offset) => paintedStop(value, offset));
				fixtures++;
				for (const source of stops)
					for (const direction of ["up", "down"] as const)
						for (const preferred of [undefined, 0, advance / 2, 30]) {
							const horizontal = preferred ?? source.horizontal;
							const row = source.row + (direction === "up" ? -1 : 1);
							const candidates = stops
								.filter((stop) => stop.row === row)
								.sort(
									(first, second) =>
										Math.abs(horizontal - first.horizontal) -
											Math.abs(horizontal - second.horizontal) ||
										second.offset - first.offset,
								);
							const offset =
								candidates[0]?.offset ?? (direction === "up" ? 0 : text.length);
							expect(
								moveControlText(
									{ ...value, selection: selected(text, source.offset) },
									direction,
									preferred,
								),
							).toEqual({ offset, horizontal });
							comparisons++;
						}
			}
	expect(fixtures).toBe(510);
	expect(comparisons).toBe(15024);
});
