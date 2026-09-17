import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import {
	type SourceHeadingPolicy,
	documentHeading,
	extractSourceHeading,
	validateSourceHeadingPolicy,
} from "./source-headings.js";

const policy = "source-aria-heading-v1";
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("validates only the explicit policy without coercing or echoing input", () => {
	expect(validateSourceHeadingPolicy(undefined)).toBeUndefined();
	expect(validateSourceHeadingPolicy(policy)).toBe(policy);
	for (const value of [null, false, 2, "secret-policy", [], {}, Symbol()]) {
		expect(() => validateSourceHeadingPolicy(value)).toThrow(
			expect.objectContaining({
				code: "invalid-input",
				message: "Invalid source heading policy",
			}),
		);
	}
});

it.each([
	"div",
	"span",
	"p",
	"section",
	"article",
	"header",
	"footer",
	"main",
	"aside",
	"hgroup",
])("admits only own source heading attributes on %s", (tagName) => {
	expect(extractSourceHeading(tagName, { role: "\t\n\f\r heading " })).toEqual({
		policy,
		level: 2,
		levelBasis: "missing-level-default",
		rendered: false,
		verified: false,
	});
	expect(
		extractSourceHeading(tagName, {
			role: "heading",
			"aria-level": " \t7\r\n",
		}),
	).toEqual({
		policy,
		level: 7,
		levelBasis: "aria-level",
		rendered: false,
		verified: false,
	});
});

it.each([
	"",
	"Heading",
	"HEADING",
	"heading button",
	"button heading",
	"heading heading",
	"heading\u00a0",
	"\u000bheading",
	"heading\u0000",
	`${" ".repeat(58)}heading`,
])("rejects non-exact or oversized role %j", (role) => {
	expect(extractSourceHeading("div", { role })).toBeUndefined();
});

it.each([
	"",
	" ",
	"0",
	"01",
	"+1",
	"-1",
	"1.0",
	"1e2",
	"Infinity",
	"NaN",
	"0x10",
	"1 2",
	"1\u00a0",
	"\u000b1",
	"١",
	"2147483648",
	"9999999999999999999999999",
	`${" ".repeat(64)}1`,
])("rejects explicit malformed level %j instead of defaulting", (level) => {
	expect(
		extractSourceHeading("span", { role: "heading", "aria-level": level }),
	).toBeUndefined();
});

it("accepts the level range and exactly 64 raw code units", () => {
	for (const level of [1, 2, 6, 7, 2_147_483_647]) {
		expect(
			extractSourceHeading("span", {
				role: `${" ".repeat(57)}heading`,
				"aria-level": String(level).padStart(64, " "),
			}),
		).toMatchObject({ level, levelBasis: "aria-level" });
	}
});

it.each([
	"a",
	"table",
	"tr",
	"td",
	"th",
	"input",
	"button",
	"select",
	"textarea",
	"option",
	"pre",
	"code",
	"ul",
	"ol",
	"li",
	"img",
	"svg",
	"h1",
	"h6",
	"h7",
	"DIV",
	"constructor",
	"__proto__",
])("does not retype unsupported role tag %s", (tagName) => {
	expect(extractSourceHeading(tagName, { role: "heading" })).toBeUndefined();
});

it("ignores prototype attributes and never evaluates accessors", () => {
	expect(
		extractSourceHeading("div", Object.create({ role: "heading" })),
	).toBeUndefined();
	const attributes = Object.assign(Object.create({ "aria-level": "8" }), {
		role: "heading",
	});
	expect(extractSourceHeading("div", attributes)).toMatchObject({
		level: 2,
		levelBasis: "missing-level-default",
	});
	for (const name of ["role", "aria-level"]) {
		const accessor = Object.defineProperty({ role: "heading" }, name, {
			get() {
				throw new Error("Accessor must not run");
			},
		});
		expect(extractSourceHeading("div", accessor)).toBeUndefined();
	}
	const secret = { role: "heading" };
	for (const name of ["aria-label", "title", "value", "alt"])
		Object.defineProperty(secret, name, {
			get() {
				throw new Error("Secret must not be read");
			},
		});
	expect(extractSourceHeading("div", secret)).toMatchObject({ level: 2 });
	expect(
		extractSourceHeading(
			"div",
			new Proxy(
				{},
				{
					getOwnPropertyDescriptor() {
						throw new Error("No");
					},
				},
			),
		),
	).toBeUndefined();
});

it("does not coerce invalid runtime attribute values", () => {
	for (const value of [undefined, null, 2, {}, []]) {
		expect(
			extractSourceHeading("div", { role: value } as Record<string, string>),
		).toBeUndefined();
		expect(
			extractSourceHeading("div", {
				role: "heading",
				"aria-level": value,
			} as Record<string, string>),
		).toBeUndefined();
	}
});

it("preserves native precedence and confines source roles to HTML elements", () => {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	for (const tagName of ["h1", "h2", "h6"]) {
		const node = tree.get(
			tree.createElement(tagName, {
				role: "heading",
				"aria-level": "99",
			}),
		);
		expect(documentHeading(node)).toEqual({ level: Number(tagName.slice(1)) });
		expect(documentHeading(node, policy)).toEqual(documentHeading(node));
	}
	const source = tree.get(tree.createElement("span", { role: "heading" }));
	expect(documentHeading(source)).toBeUndefined();
	expect(documentHeading(source, policy)).toMatchObject({
		level: 2,
		sourceHeading: { policy },
	});
	for (const namespace of [svgNamespace, mathmlNamespace]) {
		const foreign = tree.get(
			tree.createParserElement(
				"span",
				{
					role: "heading",
				},
				namespace,
			),
		);
		expect(documentHeading(foreign, policy)).toBeUndefined();
	}
	expect(
		documentHeading(tree.get(tree.createText("heading")), policy),
	).toBeUndefined();
	expect(() =>
		documentHeading(source, "secret" as SourceHeadingPolicy),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});
