import { afterEach, expect, it } from "vitest";
import { parseCssDeclarations } from "./css-parser.js";
import {
	computeTextStyle,
	initialTextStyle,
	parseTextValue,
} from "./css-text.js";
import type { DocumentTree } from "./document.js";
import {
	computeFontWeight,
	matchFontWeight,
	parseFontWeight,
} from "./font-weight.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	css = "",
	markup = '<main id="parent"><span id="target">Text</span></main>',
) {
	const tree = parseHtmlDocument(
		`<style>${css}</style>${markup}`,
		"https://fixture.invalid/font-weight",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const text = (selector = "#target") => styles.text(id(selector));
	return { tree, styles, id, text };
}

function declarations(source: string) {
	const issues: string[] = [];
	const parsed = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 32, maxDeclarations: 64 },
		(issue) => issues.push(issue),
	);
	return { parsed, issues };
}

it.each([
	["normal", "400"],
	["bold", "700"],
	["400", "400"],
	["700", "700"],
] as const)("preserves specified %s while computing %s", (value, expected) => {
	expect(parseFontWeight(value)).toBe(value);
	expect(parseTextValue("font-weight", value)).toBe(value);
	expect(computeFontWeight(value, "400")).toBe(expected);
	expect(declarations(`font-weight:${value}`)).toEqual({
		parsed: [{ property: "font-weight", value, important: false }],
		issues: [],
	});
});

it.each(["bolder", "lighter"] as const)(
	"retains relative %s until computation",
	(value) => {
		expect(parseFontWeight(value)).toBe(value);
		expect(parseTextValue("font-weight", value)).toBe(value);
	},
);

it("shares immutable initial weight with elements and text nodes without adding UA bold defaults", () => {
	const { tree, styles, id, text } = fixture(
		"",
		'<main id="parent"><h1>Heading</h1><b>Bold tag</b><strong>Strong tag</strong><span id="target">Text</span></main>',
	);
	expect(initialTextStyle["font-weight"]).toBe("400");
	expect(text()).toBe(initialTextStyle);
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	for (const selector of ["h1", "b", "strong"])
		expect(text(selector)["font-weight"]).toBe("400");
	expect(Object.isFrozen(text())).toBe(true);
	expect(styles.metrics().issues).toEqual({});
});

it.each(["inherit", "unset", "revert"] as const)(
	"inherits computed weight with %s",
	(keyword) => {
		const { tree, styles, id, text } = fixture(
			`#parent{font-weight:bold}#target{font-weight:${keyword}}`,
		);
		expect(parseTextValue("font-weight", keyword)).toBe(keyword);
		expect(text("#parent")["font-weight"]).toBe("700");
		expect(text()["font-weight"]).toBe("700");
		expect(styles.text(tree.get(id()).children[0])["font-weight"]).toBe("700");
		expect(styles.metrics().issues).toEqual({});
	},
);

it("handles initial, all, importance and live inline mutation through the generic text cascade", () => {
	const { tree, styles, id, text } = fixture(
		"#parent{font-weight:bold}#target{font-weight:normal!important}",
	);
	tree.setAttribute(id(), "style", "font-weight:bold");
	expect(text()["font-weight"]).toBe("400");
	tree.setAttribute(id(), "style", "font-weight:bold!important");
	expect(text()["font-weight"]).toBe("700");
	tree.setAttribute(id(), "style", "font-weight:initial!important");
	expect(text()["font-weight"]).toBe("400");
	tree.setAttribute(id(), "style", "all:inherit!important");
	expect(text()).toEqual(text("#parent"));
	tree.setAttribute(id(), "style", "all:initial!important");
	expect(text()).toEqual(initialTextStyle);
	expect(styles.metrics().issues).toEqual({});
});

it.each([
	"700px",
	"70%",
	"semibold",
	"bold normal",
	"calc(700)",
	"NaN",
	"Infinity",
])(
	"rejects unsupported weight syntax %s instead of treating it as normal",
	(value) => {
		expect(parseFontWeight(value)).toBeUndefined();
		expect(parseTextValue("font-weight", value)).toBeUndefined();
		expect(declarations(`font-weight:${value}`)).toEqual({
			parsed: [],
			issues: ["unimplemented-or-invalid-css-value"],
		});
		const { text, styles } = fixture(
			`#parent{font-weight:bold}#target{font-weight:${value}}`,
		);
		expect(text()["font-weight"]).toBe("700");
		expect(styles.metrics().issues["unimplemented-or-invalid-css-value"]).toBe(
			1,
		);
	},
);

it("keeps existing size, line-height and whitespace computation stable alongside weight", () => {
	const computed = computeTextStyle(
		{
			"font-weight": "bold",
			"font-size": "2em",
			"line-height": "150%",
			"white-space": "pre-wrap",
		},
		initialTextStyle,
		{ width: 800, height: 600 },
		16,
	);
	expect(computed).toEqual({
		...initialTextStyle,
		"font-weight": "700",
		"font-size": "32px",
		"line-height": "48px",
		"white-space": "pre-wrap",
	});
	expect(Object.isFrozen(computed)).toBe(true);
	expect(computeTextStyle({}, computed, { width: 800, height: 600 }, 16)).toBe(
		computed,
	);
});

it("does not add font shorthand or external-family support implicitly", () => {
	expect(declarations('font:bold 16px "agent mono"').issues).toEqual([
		"unimplemented-css-property",
	]);
	expect(declarations("font-family:serif;font-weight:bold")).toEqual({
		parsed: [{ property: "font-weight", value: "bold", important: false }],
		issues: ["unimplemented-or-invalid-css-value"],
	});
});

it.each([
	["NORMAL", "normal"],
	[" BoLd ", "bold"],
	["BOLDER", "bolder"],
	["\tLiGhTeR\n", "lighter"],
])(
	"canonicalizes keyword case without resolving specified %s",
	(value, expected) => {
		expect(parseFontWeight(value)).toBe(expected);
		expect(declarations(`font-weight:${value}!important`)).toEqual({
			parsed: [{ property: "font-weight", value: expected, important: true }],
			issues: [],
		});
	},
);

it.each([
	["1", "1"],
	["1000", "1000"],
	["1.25", "1.25"],
	["50.125", "50.125"],
	["450.123456789", "450.123456789"],
	["500.0000000001", "500.0000000001"],
	["950.125", "950.125"],
	["0999.7500", "999.75"],
	["+0400.5000", "400.5"],
	["4e2", "400"],
	["7E+2", "700"],
	[".4e3", "400"],
	[".125e2", "12.5"],
	["10e-1", "1"],
	["1e+3", "1000"],
])(
	"canonicalizes numeric CSS weight %s without rounding it to a face",
	(value, expected) => {
		expect(parseFontWeight(value)).toBe(expected);
		expect(parseTextValue("font-weight", value)).toBe(expected);
		expect(computeFontWeight(value, "700")).toBe(expected);
		expect(declarations(`font-weight:${value}`)).toEqual({
			parsed: [{ property: "font-weight", value: expected, important: false }],
			issues: [],
		});
	},
);

it.each([
	"0",
	"-0",
	"-1",
	"0.999999",
	"1000.000001",
	"1e309",
	"1e-999",
	"",
	".",
	"400.",
	"4e",
	"4e+",
	"4e-",
	"0x190",
	"0o620",
	"0b110010000",
	"1_000",
	"+ 400",
	"4 e2",
	"400 700",
])("rejects invalid or out-of-range numeric syntax %j", (value) => {
	expect(parseFontWeight(value)).toBeUndefined();
	expect(parseTextValue("font-weight", value)).toBeUndefined();
	expect(() => computeFontWeight(value, "400")).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(declarations(`font-weight:${value}`)).toEqual({
		parsed: [],
		issues: ["unimplemented-or-invalid-css-value"],
	});
});

it.each([
	["1", "400", "1"],
	["50", "400", "50"],
	["50.125", "400", "50.125"],
	["99.999", "400", "99.999"],
	["100", "400", "100"],
	["100.001", "400", "100"],
	["349.999", "400", "100"],
	["350", "700", "100"],
	["350.001", "700", "100"],
	["400", "700", "100"],
	["500.1", "700", "100"],
	["549.999", "700", "100"],
	["550", "900", "400"],
	["550.001", "900", "400"],
	["700", "900", "400"],
	["749.999", "900", "400"],
	["750", "900", "700"],
	["750.001", "900", "700"],
	["899.999", "900", "700"],
	["900", "900", "700"],
	["900.001", "900.001", "700"],
	["950", "950", "700"],
	["950.125", "950.125", "700"],
	["1000", "1000", "700"],
])(
	"computes relative boundaries from inherited weight %s",
	(parent, bolder, lighter) => {
		expect(computeFontWeight("bolder", parent)).toBe(bolder);
		expect(computeFontWeight("lighter", parent)).toBe(lighter);
		const inherited = { ...initialTextStyle, "font-weight": parent };
		for (const [value, expected] of [
			["bolder", bolder],
			["lighter", lighter],
		]) {
			const computed = computeTextStyle(
				{ "font-weight": value },
				inherited,
				{ width: 800, height: 600 },
				16,
			);
			expect(computed["font-weight"]).toBe(expected);
		}
	},
);

it.each([
	["500.1", "bolder", "700"],
	["500.1", "lighter", "100"],
	["750.1", "lighter", "700"],
	["50.125", "lighter", "50.125"],
	["950.125", "bolder", "950.125"],
])(
	"inherits numeric %s through %s without substituting a selected face",
	(parent, relative, expected) => {
		const { tree, styles, id, text } = fixture(
			`#parent{font-weight:${parent}}#target{font-weight:${relative}}`,
			'<main id="parent"><span id="target"><span id="leaf">Text</span></span></main>',
		);
		expect(text("#parent")["font-weight"]).toBe(parent);
		expect(text()["font-weight"]).toBe(expected);
		expect(text("#leaf")["font-weight"]).toBe(expected);
		expect(styles.text(tree.get(id("#leaf")).children[0])["font-weight"]).toBe(
			expected,
		);
		expect(styles.metrics().issues).toEqual({});
	},
);

it.each([
	["initial", "400"],
	["inherit", "550.125"],
	["unset", "550.125"],
	["revert", "550.125"],
])(
	"resolves CSS-wide %s outside the helper while preserving inherited precision",
	(keyword, expected) => {
		expect(parseFontWeight(keyword)).toBeUndefined();
		expect(parseTextValue("font-weight", keyword)).toBe(keyword);
		const { text } = fixture(
			`#parent{font-weight:550.125}#target{font-weight:${keyword}}`,
		);
		expect(text()["font-weight"]).toBe(expected);
	},
);

it("retains high-precision computed weights across inheritance and mutation", () => {
	const { tree, styles, id, text } = fixture(
		"#parent{font-weight:450.123456789}",
	);
	expect(text()["font-weight"]).toBe("450.123456789");
	expect(text()).toBe(text("#parent"));
	expect(matchFontWeight(Number(text()["font-weight"]))).toBe(400);
	const before = text();
	tree.setAttribute(id("#parent"), "style", "font-weight:500.0000000001");
	expect(text()["font-weight"]).toBe("500.0000000001");
	expect(text()).not.toBe(before);
	expect(matchFontWeight(Number(text()["font-weight"]))).toBe(700);
	styles.setViewport(500, 400);
	expect(text()["font-weight"]).toBe("500.0000000001");
	expect(styles.metrics().issues).toEqual({});
});

it.each([
	[1, 400],
	[99.5, 400],
	[100, 400],
	[399.999, 400],
	[400, 400],
	[400.1, 400],
	[450, 400],
	[499.999, 400],
	[500, 400],
	[500.0000000001, 700],
	[500.1, 700],
	[549.999, 700],
	[550, 700],
	[699.999, 700],
	[700, 700],
	[700.001, 700],
	[900, 700],
	[1000, 700],
])("selects the actual native face for target %s as %s", (weight, expected) => {
	expect(matchFontWeight(weight)).toBe(expected);
	expect(computeFontWeight(String(weight), "400")).toBe(String(weight));
});

it.each([
	0,
	-1,
	0.999,
	1000.001,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	"400",
	null,
	undefined,
	true,
	{},
])(
	"rejects invalid face-selection input %j without numeric coercion",
	(value) => {
		expect(() => matchFontWeight(value as never)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it("never invokes caller coercion while parsing or matching a weight", () => {
	let coerced = false;
	const value = {
		toString() {
			coerced = true;
			return "400";
		},
		valueOf() {
			coerced = true;
			return 400;
		},
	};
	expect(parseFontWeight(value as never)).toBeUndefined();
	expect(() => matchFontWeight(value as never)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(() => matchFontWeight([400] as never)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(coerced).toBe(false);
});

it.each(["", "normal", "bolder", "0", "1001", "NaN", "Infinity", "400px"])(
	"rejects noncomputed or invalid inherited weight %j for relative computation",
	(parent) => {
		for (const relative of ["bolder", "lighter"])
			expect(() => computeFontWeight(relative, parent)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
	},
);

it("retains a preceding valid declaration and diagnoses an invalid later value", () => {
	expect(declarations("font-weight:bold;font-weight:1001")).toEqual({
		parsed: [{ property: "font-weight", value: "bold", important: false }],
		issues: ["unimplemented-or-invalid-css-value"],
	});
	const { text, styles } = fixture(
		"#target{font-weight:bold;font-weight:1001}",
	);
	expect(text()["font-weight"]).toBe("700");
	expect(
		styles.metrics().applicableIssues["unimplemented-or-invalid-css-value"],
	).toBe(1);
});
