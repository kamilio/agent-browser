import { expect, it } from "vitest";
import { bitmapFont } from "./bitmap-font.js";
import { AgentBrowserError } from "./errors.js";
import {
	normalizeFontFamily,
	parseFontFamily,
	resolveNativeFont,
} from "./font-family.js";

function expectInvalidFamily(value: string) {
	expect(parseFontFamily(value)).toBeUndefined();
	expect(normalizeFontFamily(value)).toBeUndefined();
	expect(() => resolveNativeFont(value)).toThrowError(AgentBrowserError);
	expect(() => resolveNativeFont(value)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
}

it("preserves requested family order and distinguishes quoted generic names", () => {
	const value = 'Missing Face, "Agent Mono", "SeRiF", SeRiF';
	expect(parseFontFamily(value)).toEqual([
		{ name: "Missing Face", generic: false },
		{ name: "Agent Mono", generic: false },
		{ name: "SeRiF", generic: false },
		{ name: "serif", generic: true },
	]);
	expect(normalizeFontFamily(value)).toBe(
		'"Missing Face", "Agent Mono", "SeRiF", serif',
	);
});

it.each([
	["Missing Face, Agent Mono, serif", "Agent Mono", "named"],
	["Missing Face, serif, Agent Mono", "serif", "generic"],
	["Agent Mono, monospace", "Agent Mono", "named"],
	["monospace, Agent Mono", "monospace", "generic"],
	['"serif", Agent Mono', "Agent Mono", "named"],
	['"monospace", serif', "serif", "generic"],
	["Missing Face, Other Face", null, "fallback"],
	['"serif", "monospace"', null, "fallback"],
	["AgentMono", null, "fallback"],
] as const)(
	"selects the first available family in %s",
	(value, family, kind) => {
		const selected = resolveNativeFont(value);
		expect(selected).toEqual({ font: bitmapFont, family, kind });
		expect(selected.font).toBe(bitmapFont);
	},
);

it.each([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
	"math",
	"ui-serif",
	"ui-sans-serif",
	"ui-monospace",
	"ui-rounded",
])("maps the supported %s generic to the actual native font", (family) => {
	const value = family.toUpperCase();
	expect(parseFontFamily(value)).toEqual([{ name: family, generic: true }]);
	expect(normalizeFontFamily(value)).toBe(family);
	const selected = resolveNativeFont(value);
	expect(selected).toEqual({ font: bitmapFont, family, kind: "generic" });
	expect(selected.font).toBe(bitmapFont);
	expect(resolveNativeFont(`"${value}"`)).toEqual({
		font: bitmapFont,
		family: null,
		kind: "fallback",
	});
});

it.each(["agent mono", "AGENT MONO", "aGeNt MoNo"])(
	"matches native names case-insensitively without rewriting %s",
	(name) => {
		for (const value of [name, `"${name}"`]) {
			expect(parseFontFamily(value)).toEqual([{ name, generic: false }]);
			expect(normalizeFontFamily(value)).toBe(`"${name}"`);
			const selected = resolveNativeFont(value);
			expect(selected.kind).toBe("named");
			expect(selected.font).toBe(bitmapFont);
		}
	},
);

it.each([" Agent Mono", "Agent Mono ", "Agent  Mono", "Agent\tMono"])(
	"preserves significant whitespace in the quoted name %j",
	(name) => {
		const value = `"${name}"`;
		const expected = [{ name, generic: false }];
		expect(parseFontFamily(value)).toEqual(expected);
		const normalized = normalizeFontFamily(value);
		expect(normalized).toBeDefined();
		expect(parseFontFamily(normalized ?? "")).toEqual(expected);
		expect(resolveNativeFont(value)).toEqual({
			font: bitmapFont,
			family: null,
			kind: "fallback",
		});
	},
);

it.each([
	[" \tAgent \n\r\f Mono ", "Agent Mono", '"Agent Mono"'],
	[
		"/* before */ Agent /* between */ Mono /* after */",
		"Agent Mono",
		'"Agent Mono"',
	],
	["'Mixed Case Face'", "Mixed Case Face", '"Mixed Case Face"'],
	['"Missing, Face"', "Missing, Face", '"Missing, Face"'],
	[
		'"Missing/*literal*/Face"',
		"Missing/*literal*/Face",
		'"Missing/*literal*/Face"',
	],
	[String.raw`\41 gent \4d ono`, "Agent Mono", '"Agent Mono"'],
	[String.raw`Agent\ Mono`, "Agent Mono", '"Agent Mono"'],
	[String.raw`"Agent \4d ono"`, "Agent Mono", '"Agent Mono"'],
	[String.raw`"Face\"Name"`, 'Face"Name', String.raw`"Face\"Name"`],
	[String.raw`"Face\\Name"`, "Face\\Name", String.raw`"Face\\Name"`],
	["日本語 Face", "日本語 Face", '"日本語 Face"'],
] as const)(
	"parses and semantically normalizes %s",
	(value, name, normalized) => {
		const expected = [{ name, generic: false }];
		expect(parseFontFamily(value)).toEqual(expected);
		expect(normalizeFontFamily(value)).toBe(normalized);
		expect(parseFontFamily(normalized)).toEqual(expected);
		expect(normalizeFontFamily(normalized)).toBe(normalized);
	},
);

it("handles list trivia without splitting quoted commas or escaped identifiers", () => {
	const value = String.raw`/*start*/ "Missing, Face" /*one*/, /*two*/ \41 gent Mono, SeRiF /*end*/`;
	expect(parseFontFamily(value)).toEqual([
		{ name: "Missing, Face", generic: false },
		{ name: "Agent Mono", generic: false },
		{ name: "serif", generic: true },
	]);
	expect(normalizeFontFamily(value)).toBe(
		'"Missing, Face", "Agent Mono", serif',
	);
	expect(resolveNativeFont(value)).toEqual({
		font: bitmapFont,
		family: "Agent Mono",
		kind: "named",
	});
});

it("decodes escaped generic identifiers without reclassifying quoted names", () => {
	const value = String.raw`"\6d onospace", \6d onospace`;
	expect(parseFontFamily(value)).toEqual([
		{ name: "monospace", generic: false },
		{ name: "monospace", generic: true },
	]);
	expect(normalizeFontFamily(value)).toBe('"monospace", monospace');
	expect(resolveNativeFont(value)).toEqual({
		font: bitmapFont,
		family: "monospace",
		kind: "generic",
	});
});

it.each([
	"",
	" \t\n",
	"/* no families */",
	",",
	",Agent Mono",
	"Agent Mono,",
	"Agent Mono,,serif",
	"Agent Mono, /* no family */ , serif",
	'"Agent Mono',
	"'Agent Mono",
	'"Agent\\',
	'"Agent\nMono"',
	'"Agent\rMono"',
	'"Agent\fMono"',
	'"Agent" Mono',
	'Agent "Mono"',
	'"Agent""Mono"',
	"Agent\\",
	"Agent\\\nMono",
	"12",
	"12px",
	"12Face",
	"-12Face",
	"Face 12",
	"-",
	"+Face",
	"Face.Name",
	"Agent Mono;",
	"Agent Mono !important",
	"var(--family)",
	"url(font.woff)",
])("rejects malformed or outside-profile family input %j", (value) => {
	expectInvalidFamily(value);
});

it.each(["initial", "inherit", "unset", "revert"])(
	"normalizes the standalone CSS-wide value %s but rejects it in lists",
	(keyword) => {
		expect(normalizeFontFamily(keyword)).toBe(keyword);
		expect(normalizeFontFamily(` \t${keyword.toUpperCase()} `)).toBe(keyword);
		expectInvalidFamily(`${keyword}, serif`);
		expectInvalidFamily(`Agent Mono, ${keyword}`);
		expect(parseFontFamily(`"${keyword}"`)).toEqual([
			{ name: keyword, generic: false },
		]);
		expect(normalizeFontFamily(`"${keyword}"`)).toBe(`"${keyword}"`);
		expect(resolveNativeFont(`"${keyword}"`)).toEqual({
			font: bitmapFont,
			family: null,
			kind: "fallback",
		});
	},
);

it("rejects unsupported revert-layer without reserving its quoted family name", () => {
	expectInvalidFamily("revert-layer");
	expectInvalidFamily("revert-layer, serif");
	expect(parseFontFamily('"revert-layer"')).toEqual([
		{ name: "revert-layer", generic: false },
	]);
	expect(normalizeFontFamily('"revert-layer"')).toBe('"revert-layer"');
});

it.each([
	"default",
	"caption",
	"icon",
	"menu",
	"message-box",
	"small-caption",
	"status-bar",
	"serif",
	"inherit",
])("requires quoting reserved tokens inside a family name: %s", (keyword) => {
	expectInvalidFamily(`Some ${keyword}`);
	expectInvalidFamily(`${keyword} Name`);
	expect(parseFontFamily(`"Some ${keyword}"`)).toEqual([
		{ name: `Some ${keyword}`, generic: false },
	]);
});

it("does not invent support for generic functions or treat bare fangsong as generic", () => {
	expectInvalidFamily("generic(fangsong)");
	expect(resolveNativeFont("fangsong")).toEqual({
		font: bitmapFont,
		family: null,
		kind: "fallback",
	});
});

it.each([
	['"A\\\r\nB"', "AB"],
	['"A\\\fB"', "AB"],
	['"A\u0000B"', "A\ufffdB"],
	['"A\ud800B"', "A\ufffdB"],
	[String.raw`"A\0 B"`, "A\ufffdB"],
	[String.raw`"A\d800 B"`, "A\ufffdB"],
	[String.raw`"A\110000 B"`, "A\ufffdB"],
])("preprocesses and safely round trips family %j", (value, name) => {
	const expected = [{ name, generic: false }];
	expect(parseFontFamily(value)).toEqual(expected);
	expect(parseFontFamily(normalizeFontFamily(value) ?? "")).toEqual(expected);
});

it("rejects canonical expansion beyond the same bounded parser profile", () => {
	expectInvalidFamily("A".repeat(4095));
	expectInvalidFamily(`"${"\t".repeat(1365)}"`);
	expect(normalizeFontFamily("A".repeat(4094))).toHaveLength(4096);
});

it("accepts 64 families and rejects a 65th even after an available font", () => {
	const families = Array.from({ length: 63 }, (_, index) => `Missing${index}`);
	const value = [...families, "Agent Mono"].join(", ");
	expect(parseFontFamily(value)).toEqual([
		...families.map((name) => ({ name, generic: false })),
		{ name: "Agent Mono", generic: false },
	]);
	expect(normalizeFontFamily(value)).toBe(
		[...families, "Agent Mono"].map((name) => `"${name}"`).join(", "),
	);
	expect(resolveNativeFont(value)).toEqual({
		font: bitmapFont,
		family: "Agent Mono",
		kind: "named",
	});
	expectInvalidFamily(`${value}, serif`);
	expectInvalidFamily(["Agent Mono", ...families, "serif"].join(", "));
});

it.each(["A".repeat(4094), "𐐀".repeat(2047)])(
	"bounds quoted source length at 4096 UTF-16 code units (%#)",
	(name) => {
		const value = `"${name}"`;
		expect(value.length).toBe(4096);
		expect(parseFontFamily(value)).toEqual([{ name, generic: false }]);
		expect(normalizeFontFamily(value)).toBe(value);
		expect(resolveNativeFont(value)).toEqual({
			font: bitmapFont,
			family: null,
			kind: "fallback",
		});
		expectInvalidFamily(`"${name}A"`);
	},
);

it("counts leading and trailing trivia toward the source length bound", () => {
	const value = `${" ".repeat(4086)}Agent Mono`;
	expect(value.length).toBe(4096);
	expect(parseFontFamily(value)).toEqual([
		{ name: "Agent Mono", generic: false },
	]);
	expect(normalizeFontFamily(value)).toBe('"Agent Mono"');
	expect(resolveNativeFont(value)).toEqual({
		font: bitmapFont,
		family: "Agent Mono",
		kind: "named",
	});
	expectInvalidFamily(`${value} `);
});
