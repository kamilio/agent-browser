import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
	vi.resetModules();
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function fixture() {
	const cssVariables = await import("./css-variables.js");
	const fontFamily = await import("./font-family.js");
	const { bitmapFont } = await import("./bitmap-font.js");
	const { AgentBrowserError } = await import("./errors.js");
	const identifierReader = vi.spyOn(cssVariables, "readCssIdentifier");
	return { ...fontFamily, bitmapFont, AgentBrowserError, identifierReader };
}

it("skips identifier parsing only for repeated exact raw strings", async () => {
	const { resolveNativeFont, identifierReader } = await fixture();
	const values = [
		"serif",
		"SERIF",
		" serif ",
		"/*font*/serif",
		String.raw`\73 erif`,
	];
	for (const value of values) {
		identifierReader.mockClear();
		const first = resolveNativeFont(value);
		expect(identifierReader).toHaveBeenCalledTimes(1);
		const second = resolveNativeFont(value);
		expect(identifierReader).toHaveBeenCalledTimes(1);
		expect(second).toEqual(first);
		expect(second).not.toBe(first);
	}
	identifierReader.mockClear();
	for (const value of values) resolveNativeFont(value);
	expect(identifierReader).not.toHaveBeenCalled();
});

it("retains 64 entries and evicts in FIFO order without refreshing hits", async () => {
	const { resolveNativeFont, identifierReader } = await fixture();
	const values = Array.from({ length: 64 }, (_, index) => `CacheFace${index}`);
	for (const value of values) resolveNativeFont(value);
	expect(identifierReader).toHaveBeenCalledTimes(64);
	identifierReader.mockClear();
	for (const value of values) resolveNativeFont(value);
	resolveNativeFont(values[0]);
	expect(identifierReader).not.toHaveBeenCalled();
	resolveNativeFont("CacheOverflow");
	expect(identifierReader).toHaveBeenCalledTimes(1);
	identifierReader.mockClear();
	for (const value of values.slice(1)) resolveNativeFont(value);
	resolveNativeFont("CacheOverflow");
	expect(identifierReader).not.toHaveBeenCalled();
	resolveNativeFont(values[0]);
	expect(identifierReader).toHaveBeenCalledTimes(1);
	resolveNativeFont(values[1]);
	expect(identifierReader).toHaveBeenCalledTimes(2);
});

it.each([
	["Missing Face, Agent Mono, serif", "Agent Mono", "named"],
	['Missing Face, "aGeNt MoNo", serif', "Agent Mono", "named"],
	["Missing Face, SeRiF, Agent Mono", "serif", "generic"],
	[String.raw`\6d onospace, Agent Mono`, "monospace", "generic"],
	['"serif", Agent Mono', "Agent Mono", "named"],
	['"serif", "monospace"', null, "fallback"],
	["Missing Face, Other Face", null, "fallback"],
] as const)(
	"preserves cold and cached selection for %s",
	async (value, family, kind) => {
		const { resolveNativeFont, bitmapFont, identifierReader } = await fixture();
		const expected = { font: bitmapFont, family, kind };
		const first = resolveNativeFont(value);
		const parsed = identifierReader.mock.calls.length;
		const second = resolveNativeFont(value);
		expect(first).toEqual(expected);
		expect(second).toEqual(expected);
		expect(second).not.toBe(first);
		expect(first.font).toBe(bitmapFont);
		expect(second.font).toBe(bitmapFont);
		expect(identifierReader).toHaveBeenCalledTimes(parsed);
	},
);

it.each(["initial", "inherit", "unset", "revert"])(
	"keeps CSS-wide %s normalization separate from resolution errors",
	async (keyword) => {
		const {
			parseFontFamily,
			normalizeFontFamily,
			resolveNativeFont,
			identifierReader,
			bitmapFont,
		} = await fixture();
		const value = ` ${keyword.toUpperCase()} `;
		expect(parseFontFamily(value)).toBeUndefined();
		expect(normalizeFontFamily(value)).toBe(keyword);
		identifierReader.mockClear();
		for (let attempt = 0; attempt < 2; attempt++) {
			expect(() => resolveNativeFont(value)).toThrowError(
				expect.objectContaining({ code: "unsupported" }),
			);
			expect(identifierReader).toHaveBeenCalledTimes(attempt + 1);
		}
		for (let attempt = 0; attempt < 2; attempt++)
			expect(resolveNativeFont(`"${keyword}"`)).toEqual({
				font: bitmapFont,
				family: null,
				kind: "fallback",
			});
	},
);

it.each([
	["a trailing comma", "InvalidFace,"],
	["a reserved keyword", "revert-layer"],
	["a CSS-wide list member", "serif, inherit"],
	["an oversized raw input", "Face".repeat(1365)],
	["an oversized normalized input", `${"Face".repeat(1023)}End`],
	[
		"too many families",
		Array.from({ length: 65 }, (_, index) => `Face${index}`).join(","),
	],
])("does not cache errors for %s", async (_description, value) => {
	const { resolveNativeFont, identifierReader, AgentBrowserError } =
		await fixture();
	const resolve = vi.fn(() => resolveNativeFont(value));
	expect(resolve).toThrowError(AgentBrowserError);
	const parsed = identifierReader.mock.calls.length;
	if (value.length <= 4096) expect(parsed).toBeGreaterThan(0);
	expect(resolve).toThrowError(
		expect.objectContaining({
			code: "unsupported",
			message: "Unsupported or unresolved native font-family value",
		}),
	);
	expect(identifierReader).toHaveBeenCalledTimes(parsed * 2);
	expect(resolve.mock.results[1].value).not.toBe(resolve.mock.results[0].value);
});

it("does not let rejected inputs consume cache capacity", async () => {
	const { resolveNativeFont, identifierReader } = await fixture();
	const values = Array.from(
		{ length: 64 },
		(_, index) => `RetainedFace${index}`,
	);
	for (const value of values) resolveNativeFont(value);
	for (let index = 0; index < 65; index++)
		expect(() => resolveNativeFont(`InvalidFace${index},`)).toThrowError();
	identifierReader.mockClear();
	for (const value of values) resolveNativeFont(value);
	expect(identifierReader).not.toHaveBeenCalled();
});

it("preserves the 4096-code-unit input boundary before lexing", async () => {
	const { resolveNativeFont, identifierReader } = await fixture();
	const value = `${" ".repeat(4091)}serif`;
	expect(resolveNativeFont(value).family).toBe("serif");
	expect(identifierReader).toHaveBeenCalledTimes(1);
	resolveNativeFont(value);
	expect(identifierReader).toHaveBeenCalledTimes(1);
	for (let attempt = 0; attempt < 2; attempt++)
		expect(() => resolveNativeFont(` ${value}`)).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
	expect(identifierReader).toHaveBeenCalledTimes(1);
});

it("rejects nonprimitive and nonstring inputs without coercion or lexing", async () => {
	const { resolveNativeFont, identifierReader } = await fixture();
	const stringify = vi.fn(() => "serif");
	const values: unknown[] = [
		Object("serif"),
		{ toString: stringify },
		["serif"],
		null,
		undefined,
		42,
		true,
		Symbol("serif"),
	];
	resolveNativeFont("serif");
	identifierReader.mockClear();
	for (const value of values)
		for (let attempt = 0; attempt < 2; attempt++)
			expect(() => resolveNativeFont(value as string)).toThrowError(
				expect.objectContaining({ code: "unsupported" }),
			);
	expect(identifierReader).not.toHaveBeenCalled();
	expect(stringify).not.toHaveBeenCalled();
});

it.each(["Agent Mono", "serif", "Missing Face"])(
	"isolates the cached snapshot from caller mutations for %s",
	async (value) => {
		const { resolveNativeFont, bitmapFont, identifierReader } = await fixture();
		const first = resolveNativeFont(value);
		const expected = { ...first };
		expect(Object.isFrozen(first)).toBe(false);
		Object.assign(first, {
			font: null,
			family: "Corrupted",
			kind: "corrupted",
		});
		identifierReader.mockClear();
		const second = resolveNativeFont(value);
		expect(second).toEqual(expected);
		expect(second.font).toBe(bitmapFont);
		expect(second).not.toBe(first);
		expect(Object.isFrozen(second)).toBe(false);
		Object.assign(second, { font: null, family: "Changed", kind: "changed" });
		const third = resolveNativeFont(value);
		expect(third).toEqual(expected);
		expect(third.font).toBe(bitmapFont);
		expect(third).not.toBe(second);
		expect(identifierReader).not.toHaveBeenCalled();
	},
);

it("keeps parser arrays fresh and normalization independent of the cache", async () => {
	const {
		resolveNativeFont,
		parseFontFamily,
		normalizeFontFamily,
		identifierReader,
	} = await fixture();
	const value = "Agent Mono, serif";
	const selected = resolveNativeFont(value);
	identifierReader.mockClear();
	const first = parseFontFamily(value);
	const second = parseFontFamily(value);
	expect(identifierReader).toHaveBeenCalledTimes(6);
	expect(first).toEqual(second);
	expect(first).not.toBe(second);
	expect(first?.[0]).not.toBe(second?.[0]);
	expect(Object.isFrozen(first)).toBe(false);
	expect(Object.isFrozen(first?.[0])).toBe(false);
	Object.assign(first?.[0] ?? {}, { name: "Changed", generic: true });
	Object.assign(first ?? [], { length: 0 });
	expect(parseFontFamily(value)).toEqual(second);
	expect(identifierReader).toHaveBeenCalledTimes(9);
	expect(normalizeFontFamily(value)).toBe('"Agent Mono", serif');
	expect(normalizeFontFamily(value)).toBe('"Agent Mono", serif');
	expect(identifierReader).toHaveBeenCalledTimes(15);
	expect(resolveNativeFont(value)).toEqual(selected);
	expect(identifierReader).toHaveBeenCalledTimes(15);
});
