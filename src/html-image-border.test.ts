import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { borderSides } from "./css-border.js";
import type { DocumentTree } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import {
	imageBorderWidth,
	supportsImageBorderHint,
} from "./html-image-border.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const imageElements: {
	tagName: string;
	attributes: Record<string, string>;
}[] = [
	{ tagName: "img", attributes: {} },
	{ tagName: "object", attributes: {} },
	{ tagName: "input", attributes: { type: "image" } },
	{ tagName: "input", attributes: { type: "ImAgE" } },
];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(html = '<img id="target">', css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style><body>${html}`,
		"https://fixture.invalid/",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing ${selector}`);
		return target;
	};
	return { tree, styles: documentStyles(tree), id };
}

function expectBorders(
	styles: DocumentStyles,
	id: number,
	width: string,
	line = "solid",
) {
	const box = styles.box(id);
	for (const side of borderSides) {
		expect(box[`border-${side}-width`]).toBe(width);
		expect(box[`border-${side}-style`]).toBe(line);
	}
}

function expectResourceLimit(action: () => unknown) {
	expect(action).toThrow(AgentBrowserError);
	expect(action).toThrow(expect.objectContaining({ code: "resource-limit" }));
}

it.each([
	["1", "1px"],
	["00003", "3px"],
	["+3", "3px"],
	["+00003", "3px"],
	[" 3", "3px"],
	["\t3", "3px"],
	["\n3", "3px"],
	["\f3", "3px"],
	["\r3", "3px"],
	[" \t\n\f\r+03", "3px"],
	["3px", "3px"],
	["3junk", "3px"],
	["3.99", "3px"],
	["3%", "3px"],
	["3e10", "3px"],
	["3 99", "3px"],
	["3\u00a0", "3px"],
	["3\u0000", "3px"],
	["3-99", "3px"],
	["3+99", "3px"],
	["2147483648", "2147483648px"],
	["4294967296", "4294967296px"],
	["9007199254740991", "9007199254740991px"],
	["+0009007199254740991.99", "9007199254740991px"],
])("parses positive HTML border integer prefix %j", (value, expected) => {
	expect(imageBorderWidth(value)).toBe(expected);
});

it.each([
	undefined,
	"",
	" \t\n\f\r",
	"0",
	"000",
	"+0",
	"-0",
	"0.9",
	"0x10",
	"-1",
	" \t-03junk",
	"-0.9",
	"+",
	"-",
	"++3",
	"--3",
	"+-3",
	"-+3",
	"+ 3",
	"- 3",
	".3",
	"NaN",
	"Infinity",
	"three",
	"\u00003",
	"\v3",
	"\u00a03",
	"\u20033",
	"\u20283",
	"\ufeff3",
	"\uff133",
	"\u0663",
	"\u22123",
	"\uff0b3",
])("produces no border hint for zero or invalid prefix %j", (value) => {
	expect(imageBorderWidth(value)).toBeUndefined();
});

it("accepts exactly 4096 code units without confusing scan and numeric bounds", () => {
	expect(imageBorderWidth(`${" ".repeat(4095)}1`)).toBe("1px");
	expect(imageBorderWidth(`${"0".repeat(4095)}1`)).toBe("1px");
	expect(imageBorderWidth(`1${"x".repeat(4095)}`)).toBe("1px");
	expect(imageBorderWidth("0".repeat(4096))).toBeUndefined();
	expect(imageBorderWidth("x".repeat(4096))).toBeUndefined();
	expect(imageBorderWidth(`1${"\ud83d\ude00".repeat(2047)}x`)).toBe("1px");
});

it.each([
	" ".repeat(4097),
	"0".repeat(4097),
	"x".repeat(4097),
	`1${"x".repeat(4096)}`,
	`1${"\ud83d\ude00".repeat(2048)}`,
])("rejects oversized border sources before parsing %#", (value) => {
	expectResourceLimit(() => imageBorderWidth(value));
});

it.each([
	"9007199254740992",
	"9007199254740993",
	"+9007199254740992px",
	"0009007199254740992%",
	"9".repeat(400),
])("rejects unsafe or nonfinite border magnitudes %#", (value) => {
	expectResourceLimit(() => imageBorderWidth(value));
});

it.each(imageElements)(
	"supports HTML $tagName with attributes $attributes independently of border presence",
	({ tagName, attributes }) => {
		const { tree } = fixture();
		const target = tree.createElement(tagName, attributes);
		expect(supportsImageBorderHint(tree.get(target))).toBe(true);
		tree.setAttribute(target, "border", "invalid");
		expect(supportsImageBorderHint(tree.get(target))).toBe(true);
		expect(
			supportsImageBorderHint({
				...tree.get(target),
				namespaceURI: htmlNamespace,
			}),
		).toBe(true);
	},
);

it.each([
	undefined,
	"",
	"text",
	"button",
	"submit",
	"hidden",
	"checkbox",
	" image",
	"image ",
	"\timage",
	"image\n",
	"\u0130mage",
	"\u0131mage",
])("does not recognize input type %j as the image state", (type) => {
	const { tree, styles, id } = fixture();
	const target = tree.createElement("input");
	if (type !== undefined) tree.setAttribute(target, "type", type);
	tree.append(id("body"), target);
	const before = styles.box(target);
	tree.setAttribute(target, "border", "5");
	expect(supportsImageBorderHint(tree.get(target))).toBe(false);
	expect(styles.box(target)).toEqual(before);
});

it.each(["div", "span", "a", "embed", "iframe", "video", "canvas", "table"])(
	"does not enable embedded-image border hints on %s",
	(tagName) => {
		const { tree } = fixture();
		const target = tree.createElement(tagName, { border: "3", type: "image" });
		expect(supportsImageBorderHint(tree.get(target))).toBe(false);
	},
);

it("excludes document, text and comment nodes", () => {
	const { tree } = fixture();
	for (const target of [
		tree.root,
		tree.createText("img"),
		tree.createComment("object"),
	])
		expect(supportsImageBorderHint(tree.get(target))).toBe(false);
});

it.each([svgNamespace, mathmlNamespace])(
	"does not recognize or parse border hints in namespace %s",
	(namespace) => {
		const { tree, styles, id } = fixture();
		for (const { tagName, attributes } of imageElements) {
			const target = tree.createParserElement(tagName, attributes, namespace);
			tree.append(id("body"), target);
			const before = styles.box(target);
			const work = styles.metrics().work;
			tree.setAttribute(target, "border", "9".repeat(4097));
			expect(supportsImageBorderHint(tree.get(target))).toBe(false);
			expect(styles.box(target)).toEqual(before);
			expect(styles.metrics().work).toBe(work);
		}
	},
);

it.each(imageElements)(
	"gives $tagName four solid pixel borders without declaring a color",
	({ tagName, attributes }) => {
		const { tree, styles, id } = fixture('<div id="target"></div>');
		tree.setAttribute(id(), "style", "color:rgb(12,34,56)");
		const target = tree.createElement(tagName, {
			...attributes,
			border: " \t+0003.75%junk",
		});
		tree.append(id(), target);
		expectBorders(styles, target, "3px");
		for (const side of borderSides) {
			expect(styles.paint(target)[`border-${side}-color`]).toBeUndefined();
			expect(resolvedStyleValue(tree, target, `border-${side}-color`)).toBe(
				"rgb(12, 34, 56)",
			);
		}
	},
);

it.each(["0", "-0", "+0", "0.9", "-5", "invalid", "", "\u00a03"])(
	"leaves author and default styles unchanged for border %j",
	(value) => {
		for (const { tagName, attributes } of imageElements) {
			const { tree, styles, id } = fixture();
			const target = tree.createElement(tagName, attributes);
			tree.append(id("body"), target);
			const before = styles.box(target);
			tree.setAttribute(target, "border", value);
			expect(styles.box(target)).toEqual(before);
			tree.setAttribute(target, "style", "border:5px solid red");
			expectBorders(styles, target, "5px", "solid");
			for (const side of borderSides)
				expect(resolvedStyleValue(tree, target, `border-${side}-color`)).toBe(
					"rgb(255, 0, 0)",
				);
		}
	},
);

it.each([
	{ css: "*{border:2px solid red}", inline: "" },
	{ css: "", inline: "border:2px solid red" },
	{
		css: "*{border:2px solid red!important}",
		inline: "border:7px none blue",
	},
	{
		css: "#target{border:7px hidden blue!important}",
		inline: "border:2px solid red!important",
	},
])("cascades author borders over hints: $css / $inline", ({ css, inline }) => {
	const { tree, styles, id } = fixture(
		`<img id="target" border="9" style="${inline}">`,
		css,
	);
	expectBorders(styles, id(), "2px", "solid");
	for (const side of borderSides)
		expect(resolvedStyleValue(tree, id(), `border-${side}-color`)).toBe(
			"rgb(255, 0, 0)",
		);
});

it.each(["dashed", "dotted"])(
	"retains unsupported %s border declarations without replacing hints",
	(style) => {
		for (const inline of [false, true]) {
			const declaration = `border:2px ${style} red`;
			const { styles, id } = fixture(
				`<img id="target" border="4" style="${inline ? declaration : ""}">`,
				inline ? "" : `img{${declaration}}`,
			);
			expectBorders(styles, id(), "4px", "solid");
			expect(
				styles.metrics().issues["unimplemented-or-invalid-css-value"],
			).toBe(1);
		}
	},
);

it("lets zero-specificity side declarations override only their hint components", () => {
	const { tree, styles, id } = fixture(
		'<img id="target" border="4">',
		"*{border-left-width:7px;border-top-style:none;border-right-color:red}",
	);
	for (const side of borderSides) {
		expect(styles.box(id())[`border-${side}-width`]).toBe(
			side === "left" ? "7px" : "4px",
		);
		expect(styles.box(id())[`border-${side}-style`]).toBe(
			side === "top" ? "none" : "solid",
		);
		expect(resolvedStyleValue(tree, id(), `border-${side}-color`)).toBe(
			side === "right" ? "rgb(255, 0, 0)" : "rgb(0, 0, 0)",
		);
	}
});

it.each(["none", "hidden"])(
	"allows author border-style:%s to suppress every hinted used width",
	(line) => {
		const { tree, styles, id } = fixture(
			'<img id="target" border="4">',
			`*{border-style:${line}}`,
		);
		expectBorders(styles, id(), "4px", line);
		for (const side of borderSides)
			expect(resolvedStyleValue(tree, id(), `border-${side}-width`)).toBe(
				"0px",
			);
	},
);

it("does not inherit hinted borders while still inheriting currentColor", () => {
	const { tree, styles, id } = fixture(
		'<object id="target" border="5"><img id="child"></object>',
		"#target{color:blue;border-color:red}",
	);
	expectBorders(styles, id(), "5px");
	expectBorders(styles, id("#child"), "3px", "none");
	for (const side of borderSides)
		expect(resolvedStyleValue(tree, id("#child"), `border-${side}-color`)).toBe(
			"rgb(0, 0, 255)",
		);
});

it("invalidates cached borders after attribute changes and removal", () => {
	const { tree, styles, id } = fixture('<img id="target" border="2">');
	const target = id();
	expectBorders(styles, target, "2px");
	let previousBuilds = styles.metrics().cascadeBuilds;
	for (const value of ["7", "0", "-3", "invalid", "  +004px", undefined]) {
		if (value === undefined) tree.removeAttribute(target, "border");
		else tree.setAttribute(target, "border", value);
		const expected =
			value === "7" ? "7px" : value === "  +004px" ? "4px" : null;
		expectBorders(
			styles,
			target,
			expected ?? "3px",
			expected ? "solid" : "none",
		);
		const builds = styles.metrics().cascadeBuilds;
		expect(builds).toBe(previousBuilds + 1);
		expect(styles.box(target)).toBe(styles.box(target));
		expect(styles.metrics().cascadeBuilds).toBe(builds);
		previousBuilds = builds;
	}
});

it("restores hints after author style removal and tracks inherited color mutations", () => {
	const { tree, styles, id } = fixture(
		'<div id="parent" style="color:blue"><img id="target" border="4"></div>',
	);
	const target = id();
	expectBorders(styles, target, "4px");
	tree.setAttribute(target, "style", "border:2px solid red");
	expectBorders(styles, target, "2px", "solid");
	tree.removeAttribute(target, "style");
	expectBorders(styles, target, "4px");
	for (const side of borderSides)
		expect(resolvedStyleValue(tree, target, `border-${side}-color`)).toBe(
			"rgb(0, 0, 255)",
		);
	tree.setAttribute(id("#parent"), "style", "color:rgb(12,34,56)");
	for (const side of borderSides)
		expect(resolvedStyleValue(tree, target, `border-${side}-color`)).toBe(
			"rgb(12, 34, 56)",
		);
});

it("adds and removes hints as an input enters and leaves the image state", () => {
	const { tree, styles, id } = fixture('<input id="target" border="4">');
	const target = id();
	const before = styles.box(target);
	for (const type of ["image", "text", "IMAGE", " image", "ImAgE", undefined]) {
		if (type === undefined) tree.removeAttribute(target, "type");
		else tree.setAttribute(target, "type", type);
		if (type === "image" || type === "IMAGE" || type === "ImAgE")
			expectBorders(styles, target, "4px");
		else expect(styles.box(target)).toEqual(before);
	}
});

it.each(["", "0", "-3", "invalid", "7", `7${"x".repeat(4095)}`])(
	"charges raw border length plus one exactly once even under author overrides %#",
	(value) => {
		const { tree, styles, id } = fixture(
			'<img id="target" style="border:2px solid red">',
		);
		const baseline = styles.metrics().work;
		tree.setAttribute(id(), "border", value);
		const requiredWork = baseline + value.length + 1;
		expect(styles.metrics().work).toBe(requiredWork);
		expect(styles.metrics().work).toBe(requiredWork);
		const exact = new DocumentStyles(tree, { maxWork: requiredWork });
		expectBorders(exact, id(), "2px");
		expect(exact.metrics().work).toBe(requiredWork);
		const insufficient = new DocumentStyles(tree, {
			maxWork: requiredWork - 1,
		});
		expectResourceLimit(() => insufficient.metrics());
	},
);

it.each(imageElements)(
	"rejects oversized and unsafe $tagName borders and recovers after removal",
	({ tagName, attributes }) => {
		const { tree, styles, id } = fixture();
		const target = tree.createElement(tagName, attributes);
		tree.append(id("body"), target);
		expectBorders(styles, target, "3px", "none");
		for (const value of [
			"x".repeat(4097),
			"9007199254740993",
			"9".repeat(400),
		]) {
			tree.setAttribute(target, "border", value);
			expectResourceLimit(() => styles.box(target));
			tree.setAttribute(target, "border", "4");
			expectBorders(styles, target, "4px");
			tree.removeAttribute(target, "border");
			expectBorders(styles, target, "3px", "none");
		}
	},
);

it("does not bypass border resource validation for hidden or author-overridden images", () => {
	const { tree, styles, id } = fixture(
		'<img id="target" style="display:none;border:0 none!important">',
	);
	tree.setAttribute(id(), "border", "9".repeat(400));
	expectResourceLimit(() => styles.metrics());
});

it.each(["div", "embed", "input"])(
	"does not parse or charge ineligible %s border attributes",
	(tagName) => {
		const { tree, styles, id } = fixture();
		const target = tree.createElement(tagName);
		tree.append(id("body"), target);
		const before = styles.box(target);
		const work = styles.metrics().work;
		tree.setAttribute(target, "border", "9".repeat(4097));
		expect(styles.box(target)).toEqual(before);
		expect(styles.metrics().work).toBe(work);
	},
);
