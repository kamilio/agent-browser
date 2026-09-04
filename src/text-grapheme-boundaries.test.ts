import { afterEach, expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { textGraphemeBoundaries } from "./text-grapheme-boundaries.js";

const HostSegmenter = Intl.Segmenter;

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.resetModules();
});

const fixtures: [string, string, number[]][] = [
	["empty", "", [0]],
	["ASCII", "a b!?~", [0, 1, 2, 3, 4, 5, 6]],
	["CRLF", "\r\n", [0, 2]],
	["embedded CRLF", "a\r\nb", [0, 1, 3, 4]],
	["carriage return", "\r", [0, 1]],
	["line feed", "\n", [0, 1]],
	["control characters", "\u0000\t\u007f", [0, 1, 2, 3]],
	["lone high surrogate", "\ud800", [0, 1]],
	["lone low surrogate", "\udc00", [0, 1]],
	["separated lone surrogates", "\ud800x\udc00", [0, 1, 2, 3]],
	["astral pair", "🙂", [0, 2]],
	["embedded astral pair", "A🙂B", [0, 1, 3, 4]],
	["combining mark", "e\u0301", [0, 2]],
	["stacked combining marks", "a\u0301\u0327b", [0, 3, 4]],
	["leading combining marks", "\u0301\u0327a", [0, 2, 3]],
	["variation selector", "✈\ufe0f", [0, 2]],
	["supplementary variation selector", "漢\u{e0100}", [0, 3]],
	["emoji modifier", "👍🏽", [0, 4]],
	["emoji ZWJ", "👩‍💻", [0, 5]],
	["emoji family", "👨‍👩‍👧‍👦", [0, 11]],
	["emoji keycap", "1\ufe0f\u20e3", [0, 3]],
	["flag", "🇺🇸", [0, 4]],
	["two flags", "🇺🇸🇨🇦", [0, 4, 8]],
	["odd regional indicator run", "🇺🇸🇨", [0, 4, 6]],
	["Hangul jamo", "\u1100\u1161\u11a8", [0, 3]],
	["Hangul syllables", "한글", [0, 1, 2]],
	["mixed runs", "Ae\u0301🙂\r\n👩‍💻Z", [0, 1, 3, 5, 7, 12, 13]],
];

it.each(fixtures)(
	"returns UTF-16 boundaries for %s",
	(_name, text, expected) => {
		const result = textGraphemeBoundaries(text, () => {});
		expect(result).toBeInstanceOf(Set);
		expect([...result]).toEqual(expected);
		expect([...result].every(Number.isSafeInteger)).toBe(true);
		expect(Reflect.ownKeys(result)).toEqual([]);
	},
);

it("returns every printable ASCII boundary", () => {
	const text = Array.from({ length: 95 }, (_, offset) =>
		String.fromCharCode(32 + offset),
	).join("");
	expect([...textGraphemeBoundaries(text, () => {})]).toEqual(
		Array.from({ length: 96 }, (_, offset) => offset),
	);
});

it("does not mutate frozen input holders or callbacks", () => {
	const input = Object.freeze({ text: "e\u0301🙂" });
	const charge = Object.freeze(() => {});
	expect([...textGraphemeBoundaries(input.text, charge)]).toEqual([0, 2, 4]);
	expect(input).toEqual({ text: "e\u0301🙂" });
	expect(Object.isFrozen(input)).toBe(true);
	expect(Object.isFrozen(charge)).toBe(true);
});

it.each(["", "abc", "e\u0301🙂"])(
	"returns isolated mutable Sets for %j",
	(text) => {
		const first = textGraphemeBoundaries(text, () => {});
		const second = textGraphemeBoundaries(text, () => {});
		const expected = [...second];
		expect(first).not.toBe(second);
		first.clear();
		first.add(999);
		expect([...second]).toEqual(expected);
		expect([...textGraphemeBoundaries(text, () => {})]).toEqual(expected);
	},
);

it.each([undefined, null, 3, true, {}, [], Symbol("private"), Object("abc")])(
	"rejects nonstring input %j without coercion or charge",
	(value) => {
		const charge = vi.fn();
		expect(() => textGraphemeBoundaries(value as string, charge)).toThrow(
			new AgentBrowserError("invalid-input", "Invalid grapheme boundary input"),
		);
		expect(charge).not.toHaveBeenCalled();
	},
);

it.each([undefined, null, 3, "callback", {}, []])(
	"rejects nonfunction charge %j",
	(value) => {
		expect(() =>
			textGraphemeBoundaries("private", value as () => void),
		).toThrow(
			new AgentBrowserError("invalid-input", "Invalid grapheme boundary input"),
		);
	},
);

it("never coerces hostile nonstring input", () => {
	const stringify = vi.fn(() => {
		throw new Error("must not coerce");
	});
	expect(() =>
		textGraphemeBoundaries(
			{ toString: stringify } as unknown as string,
			() => {},
		),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(stringify).not.toHaveBeenCalled();
});

it("accepts the inclusive UTF-16 length limit with bounded ASCII work", () => {
	let units = 0;
	const result = textGraphemeBoundaries("a".repeat(500000), (amount = 1) => {
		units += amount;
	});
	expect(result.size).toBe(500001);
	expect(result.has(0)).toBe(true);
	expect(result.has(500000)).toBe(true);
	expect(units).toBe(1000001);
});

it.each(["a".repeat(500001), "🙂".repeat(250001)])(
	"rejects oversized input before charging or segmentation (%#)",
	(text) => {
		const charge = vi.fn();
		const segment = vi.spyOn(HostSegmenter.prototype, "segment");
		expect(() => textGraphemeBoundaries(text, charge)).toThrowError(
			expect.objectContaining({
				code: "resource-limit",
				message: "Grapheme text length limit exceeded",
			}),
		);
		expect(charge).not.toHaveBeenCalled();
		expect(segment).not.toHaveBeenCalled();
	},
);

it.each(["", "abc", "e\u0301🙂"])(
	"propagates precharge rejection before traversal for %j",
	(text) => {
		const failure = new Error("budget");
		const segment = vi.spyOn(HostSegmenter.prototype, "segment");
		const traversal = vi.spyOn(RegExp.prototype, "test");
		const charge = vi.fn(() => {
			throw failure;
		});
		let caught: unknown;
		try {
			textGraphemeBoundaries(text, charge);
		} catch (error) {
			caught = error;
		}
		const traversalCalls = traversal.mock.calls.length;
		traversal.mockRestore();
		expect(caught).toBe(failure);
		expect(charge.mock.calls).toEqual([[text.length || 1]]);
		expect(segment).not.toHaveBeenCalled();
		expect(traversalCalls).toBe(0);
	},
);

it("charges each ASCII boundary before insertion", () => {
	const events: string[] = [];
	const add = Set.prototype.add;
	vi.spyOn(Set.prototype, "add").mockImplementation(function (
		this: Set<unknown>,
		value: unknown,
	) {
		events.push(`add:${value}`);
		return add.call(this, value);
	});
	textGraphemeBoundaries("ab", (units = 1) => events.push(`charge:${units}`));
	vi.restoreAllMocks();
	expect(events).toEqual([
		"charge:2",
		"charge:1",
		"add:0",
		"charge:1",
		"add:1",
		"charge:1",
		"add:2",
	]);
});

it.each([2, 3, 4, 5])(
	"propagates ASCII charge rejection on call %i without continuing",
	(rejectAt) => {
		let calls = 0;
		const failure = Object.freeze({ budget: "exhausted" });
		let caught: unknown;
		try {
			textGraphemeBoundaries("abcd", () => {
				calls++;
				if (calls === rejectAt) throw failure;
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(failure);
		expect(calls).toBe(rejectAt);
	},
);

async function instrumentNative() {
	const native = new HostSegmenter(undefined, { granularity: "grapheme" });
	const next = vi.fn();
	const segment = vi.fn((text: string) => {
		const iterator = native.segment(text)[Symbol.iterator]();
		return {
			[Symbol.iterator]() {
				return {
					next() {
						next();
						return iterator.next();
					},
				};
			},
		};
	});
	const construct = vi.fn();
	vi.stubGlobal("Intl", {
		Segmenter: class {
			constructor(...args: unknown[]) {
				construct(...args);
			}
			segment = segment;
		},
	});
	vi.resetModules();
	const { textGraphemeBoundaries: boundaries } = await import(
		"./text-grapheme-boundaries.js"
	);
	return { boundaries, construct, segment, next };
}

it("lazily caches only the native segmenter and segments each call anew", async () => {
	const { boundaries, construct, segment, next } = await instrumentNative();
	boundaries("ASCII", () => {});
	boundaries("", () => {});
	expect(construct).not.toHaveBeenCalled();
	expect([...boundaries("e\u0301🙂", () => {})]).toEqual([0, 2, 4]);
	expect([...boundaries("\r\n", () => {})]).toEqual([0, 2]);
	expect(construct.mock.calls).toEqual([
		[undefined, { granularity: "grapheme" }],
	]);
	expect(segment.mock.calls).toEqual([["e\u0301🙂"], ["\r\n"]]);
	expect(next).toHaveBeenCalledTimes(5);
});

it("charges native setup, segment traversal and every boundary", async () => {
	const { boundaries, construct, segment, next } = await instrumentNative();
	const snapshots: number[][] = [];
	expect([
		...boundaries("e\u0301🙂", (units = 1) => {
			snapshots.push([
				units,
				construct.mock.calls.length,
				segment.mock.calls.length,
				next.mock.calls.length,
			]);
		}),
	]).toEqual([0, 2, 4]);
	expect(snapshots).toEqual([
		[4, 0, 0, 0],
		[1, 0, 0, 0],
		[1, 0, 0, 0],
		[1, 1, 1, 0],
		[1, 1, 1, 1],
		[1, 1, 1, 1],
		[1, 1, 1, 2],
		[1, 1, 1, 2],
	]);
});

it.each([
	[1, 0, 0],
	[2, 0, 0],
	[3, 0, 0],
	[4, 1, 0],
	[5, 1, 1],
	[6, 1, 1],
	[7, 1, 2],
	[8, 1, 2],
])(
	"stops native processing on charge call %i with no fallback",
	async (rejectAt, setups, advances) => {
		const { boundaries, construct, segment, next } = await instrumentNative();
		const failure = new Error("budget");
		let calls = 0;
		let caught: unknown;
		try {
			boundaries("e\u0301🙂", () => {
				calls++;
				if (calls === rejectAt) throw failure;
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(failure);
		expect(calls).toBe(rejectAt);
		expect(construct).toHaveBeenCalledTimes(setups);
		expect(segment).toHaveBeenCalledTimes(setups);
		expect(next).toHaveBeenCalledTimes(advances);
	},
);

it.each([undefined, {}, { Segmenter: undefined }, { Segmenter: {} }])(
	"keeps ASCII usable without native segmentation (%#)",
	async (host) => {
		vi.stubGlobal("Intl", host);
		const { textGraphemeBoundaries: boundaries } = await import(
			"./text-grapheme-boundaries.js"
		);
		expect([...boundaries("", () => {})]).toEqual([0]);
		expect([...boundaries("ab", () => {})]).toEqual([0, 1, 2]);
		for (const text of ["e\u0301", "🙂", "\r\n"]) {
			expect(() => boundaries(text, () => {})).toThrowError(
				expect.objectContaining({
					code: "unsupported",
					message: "Native grapheme segmentation is unavailable",
				}),
			);
		}
	},
);

it("propagates native constructor failures instead of falling back", async () => {
	const failure = new Error("native constructor failure");
	vi.stubGlobal("Intl", {
		Segmenter: class {
			constructor() {
				throw failure;
			}
		},
	});
	const { textGraphemeBoundaries: boundaries } = await import(
		"./text-grapheme-boundaries.js"
	);
	let caught: unknown;
	try {
		boundaries("🙂", () => {});
	} catch (error) {
		caught = error;
	}
	expect(caught).toBe(failure);
	expect([...boundaries("ab", () => {})]).toEqual([0, 1, 2]);
});
