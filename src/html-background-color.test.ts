import { expect, it } from "vitest";
import { cssNamedColors } from "./css-color.js";
import type { DocumentNode } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
	xmlNamespace,
} from "./dom-namespaces.js";
import {
	legacyColor,
	supportsBackgroundColorHint,
} from "./html-background-color.js";

const supportedTags = [
	"body",
	"table",
	"thead",
	"tbody",
	"tfoot",
	"tr",
	"td",
	"th",
	"marquee",
];

function node(overrides: Partial<DocumentNode> = {}): Readonly<DocumentNode> {
	return {
		id: 1,
		kind: "element",
		tagName: "body",
		attributes: {},
		data: "",
		parent: null,
		children: [],
		control: {},
		...overrides,
	};
}

it.each(supportedTags)("supports only HTML %s background hints", (tagName) => {
	for (const namespaceURI of [undefined, htmlNamespace]) {
		const target = node({ tagName, namespaceURI });
		expect(supportsBackgroundColorHint(target)).toBe(true);
		for (const bgcolor of ["", "transparent", "red", "junk"])
			expect(
				supportsBackgroundColorHint({ ...target, attributes: { bgcolor } }),
			).toBe(true);
	}
});

it.each([
	"html",
	"head",
	"div",
	"span",
	"p",
	"a",
	"caption",
	"col",
	"colgroup",
	"img",
	"input",
	"object",
	"iframe",
	"frameset",
	"font",
	"hr",
	"template",
	"constructor",
	"__proto__",
	"BODY",
	"Table",
	"x:body",
	"",
])("does not support background hints on %j", (tagName) => {
	expect(
		supportsBackgroundColorHint(
			node({ tagName, attributes: { bgcolor: "red", role: "table" } }),
		),
	).toBe(false);
});

it.each([svgNamespace, mathmlNamespace, xmlNamespace, "", "urn:custom"])(
	"excludes otherwise supported names in namespace %j",
	(namespaceURI) => {
		for (const tagName of supportedTags)
			expect(supportsBackgroundColorHint(node({ tagName, namespaceURI }))).toBe(
				false,
			);
	},
);

it("excludes all non-element node kinds", () => {
	const kinds: DocumentNode["kind"][] = [
		"document",
		"fragment",
		"text",
		"comment",
		"doctype",
	];
	for (const kind of kinds)
		for (const tagName of supportedTags)
			expect(supportsBackgroundColorHint(node({ kind, tagName }))).toBe(false);
});

it("reuses every named color with ASCII case-insensitive matching", () => {
	for (const [name, color] of Object.entries(cssNamedColors)) {
		const expected = `#${color
			.slice(0, 3)
			.map((component) => component.toString(16).padStart(2, "0"))
			.join("")}`;
		expect(legacyColor(name)).toBe(expected);
		expect(legacyColor(name.toUpperCase())).toBe(expected);
		expect(legacyColor(` \t\n\f\r${name}\r\f\n\t `)).toBe(expected);
	}
});

it.each([
	["ReBeCcApUrPlE", "#663399"],
	["green", "#008000"],
	["lime", "#00ff00"],
	["gray", "#808080"],
	["grey", "#808080"],
	["constructor", "#c00000"],
	["toString", "#000000"],
	["__proto__", "#000000"],
	["hasOwnProperty", "#0a00e0"],
	["prototype", "#00000e"],
	["ButtonFace", "#b000ce"],
	["Window", "#000d00"],
	["Menu", "#0e0000"],
	["ActiveBorder", "#ac0e0d"],
	["Canvas", "#ca00a0"],
	["BLAC\u212a", "#b0ac00"],
	["\u017fienna", "#00e00a"],
	["\u0130ndigo", "#00d000"],
])("handles names and non-name lookalikes %j", (value, expected) => {
	expect(legacyColor(value)).toBe(expected);
});

it.each([undefined, "", "transparent", "TrAnSpArEnT", " \ttransparent\n\f\r"])(
	"returns failure only for absent, empty or transparent input %j",
	(value) => {
		expect(legacyColor(value)).toBeUndefined();
	},
);

it.each([" ", "\t", "\n", "\f", "\r", " \t\n\f\r"])(
	"turns whitespace-only input %j into black after the empty-input check",
	(value) => {
		expect(legacyColor(value)).toBe("#000000");
	},
);

it.each(["\v", "\u00a0", "\u2003", "\u2028", "\ufeff", "\u0000"])(
	"does not trim non-ASCII-whitespace character %j",
	(character) => {
		expect(legacyColor(`${character}red${character}`)).toBe("#00ed00");
		expect(legacyColor(`${character}transparent${character}`)).toBeDefined();
	},
);

it.each([
	["#abc", "#aabbcc"],
	["#AbC", "#aabbcc"],
	[" \t#0F8\n", "#00ff88"],
	["#000", "#000000"],
	["#fff", "#ffffff"],
	["#123456", "#123456"],
	["#aBcDeF", "#abcdef"],
	["123456", "#123456"],
	["abc", "#0a0b0c"],
	["#", "#000000"],
	["##abc", "#0abc00"],
	["#1", "#010000"],
	["#12", "#010200"],
	["#12g", "#010200"],
	["#abcd", "#abcd00"],
	["#abcde", "#abcde0"],
	["#12345678", "#124578"],
	["chucknorris", "#c00000"],
	["red!", "#0ed000"],
	["rgb(1, 2, 3)", "#001000"],
	["hsl(0, 0%, 0%)", "#000000"],
	["var(--red)", "#0a00d0"],
	["inherit", "#00e000"],
	["unset", "#000e00"],
	["#\uff11\uff12\uff13", "#000000"],
])("parses legacy syntax rather than CSS syntax %j", (value, expected) => {
	expect(legacyColor(value)).toBe(expected);
});

it.each([
	["\ud83d\ude00", "#000000"],
	["\ud83d\ude00abc", "#00abc0"],
	["#\ud83d\ude00abc", "#00abc0"],
	["\ud800\udc00abc", "#00abc0"],
	["\udbff\udfffabc", "#00abc0"],
	["\ud800abc", "#0abc00"],
	["\udfffabc", "#0abc00"],
	["\udfff\ud800abc", "#00abc0"],
	["\uffffabc", "#0abc00"],
])(
	"replaces astral points and lone surrogates correctly %j",
	(value, expected) => {
		expect(legacyColor(value)).toBe(expected);
	},
);

it.each([
	["012034056", "#123456"],
	["012034a56", "#0103a5"],
	["00123400005600789a", "#120078"],
	["000001000002000003", "#010203"],
	["000000000000000000", "#000000"],
	["123456789abcdef0fedcba98", "#129afe"],
	["a12345678b9abcdef0cfedcba98", "#129afe"],
	["f00001234e00005678d00009abc", "#12569a"],
])("reduces channels in the specified order for %j", (value, expected) => {
	expect(legacyColor(value)).toBe(expected);
});

it("truncates the normalized input at 128 characters before removing #", () => {
	const prefix = ["12abcdef", "34abcdef", "56abcdef"]
		.map((component) => "x".repeat(34) + component)
		.join("");
	expect(prefix).toHaveLength(126);
	expect(legacyColor(prefix)).toBe("#123456");
	expect(legacyColor(`${prefix}7`)).toBe("#2aabbc");
	expect(legacyColor(`${prefix}78`)).toBe("#2aabbc");
	expect(legacyColor(`${prefix}789`)).toBe("#2aabbc");
	expect(legacyColor(`#${prefix}`)).toBe("#123456");
	expect(legacyColor(`#${prefix}7`)).toBe("#2aabbc");
	expect(legacyColor(`#${"0".repeat(127)}f`)).toBe("#000000");
	expect(legacyColor(`${"0".repeat(127)}f`)).toBe("#0000f0");
});

it("counts both replacement zeroes before the 128-character boundary", () => {
	expect(legacyColor(`${"\ud83d\ude00".repeat(63)}f`)).toBe("#0000f0");
	expect(legacyColor(`${"\ud83d\ude00".repeat(63)}f12`)).toBe("#0000f1");
	expect(legacyColor(`${"\ud83d\ude00".repeat(64)}f`)).toBe("#000000");
	expect(legacyColor(`${"0".repeat(127)}\ud83d\ude00f`)).toBe("#000000");
	expect(legacyColor(`${"0".repeat(127)}\ud800f`)).toBe("#000000");
});

it("accepts long DOM-bounded values without a separate parser length cap", () => {
	const padding = " ".repeat(100_000);
	expect(legacyColor(`${padding}ReD${padding}`)).toBe("#ff0000");
	expect(legacyColor(`${padding}#abc${padding}`)).toBe("#aabbcc");
	expect(legacyColor(`${padding}transparent${padding}`)).toBeUndefined();
	expect(legacyColor(padding)).toBe("#000000");
	expect(legacyColor(`red${padding}x`)).toBe("#000000");
	expect(legacyColor(`transparent${padding}x`)).toBeDefined();
	expect(legacyColor(`f${"0".repeat(100_000)}`)).toBe("#000000");
});
