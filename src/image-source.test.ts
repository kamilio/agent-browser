import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	extractImageSource,
	imageSourceRole,
	imageSourceText,
	type ImageSourceMetadata,
} from "./image-source.js";

function source(attributes: Readonly<Record<string, string>>) {
	const metadata = extractImageSource(attributes);
	expect(metadata).toBeDefined();
	if (!metadata) throw new Error("Expected image source metadata");
	return metadata;
}

it.each(["", " ", "\t", "\n", "\r", "\f", " \t\n\r\f "])(
	"accepts exact img with optional HTML whitespace %j",
	(whitespace) => {
		for (const role of [
			`${whitespace}img`,
			`img${whitespace}`,
			`${whitespace}img${whitespace}`,
		]) {
			expect(imageSourceRole({ role })).toBe(true);
			expect(source({ role, title: "Warning" }).role).toBe("img");
		}
	},
);

it.each([
	"",
	" \t\r\n\f",
	"IMG",
	"Img",
	"image",
	"imgx",
	"ximg",
	"img img",
	"img presentation",
	"presentation img",
	"img\tbutton",
	"img\nbutton",
	"i mg",
	"im\tg",
	"img\0",
	"\vimg",
	"img\v",
	"\u00a0img",
	"img\u00a0",
	"\u2003img",
	"img\u2003",
	"\u2028img",
	"img\u2028",
	"img \u2028",
	"img\u2029",
	"img \u2029",
	"\ufeffimg",
	"img\ufeff",
	"img\u200b",
])("rejects nonexact role %j", (role) => {
	expect(imageSourceRole({ role })).toBe(false);
	expect(extractImageSource({ role, title: "Warning" })).toBeUndefined();
});

it("requires an own lowercase role attribute", () => {
	const inherited = Object.create({ role: "img" });
	inherited.title = "Warning";
	for (const attributes of [{}, { ROLE: "img" }, inherited]) {
		expect(imageSourceRole(attributes)).toBe(false);
		expect(extractImageSource(attributes)).toBeUndefined();
	}
	inherited.role = "button";
	expect(imageSourceRole(inherited)).toBe(false);
});

it("snapshots only own selected attributes, including nonenumerable values", () => {
	const attributes = Object.create({
		"aria-label": "Inherited label",
		title: "Inherited title",
	});
	attributes.role = "img";
	expect(extractImageSource(attributes)).toBeUndefined();
	Object.defineProperty(attributes, "title", { value: "Own title" });
	attributes["ARIA-LABEL"] = "Wrong case";
	attributes["aria-labelledby"] = "other-node";
	attributes.alt = "Not selected";
	attributes["data-source"] = "Not selected";
	Object.defineProperty(attributes, "unrelated", {
		get() {
			throw new Error("Unrelated attributes must not be read");
		},
	});
	expect(source(attributes)).toEqual({
		kind: "native-image-source-v1",
		role: "img",
		attributes: { title: "Own title" },
	});
	const ownLabel = Object.assign(Object.create({ title: "Inherited" }), {
		role: "img",
		"aria-label": "Own label",
	});
	expect(source(ownLabel).attributes).toEqual({ "aria-label": "Own label" });
});

it("supports frozen null-prototype attribute maps without mutating them", () => {
	const attributes = Object.freeze(
		Object.assign(Object.create(null), {
			role: "img",
			"aria-label": " Experimental ",
			title: "Experimental. Expect behavior to change in the future.",
		}),
	);
	const before = Object.getOwnPropertyDescriptors(attributes);
	expect(source(attributes).attributes).toEqual({
		"aria-label": " Experimental ",
		title: "Experimental. Expect behavior to change in the future.",
	});
	expect(Object.getOwnPropertyDescriptors(attributes)).toEqual(before);
});

it.each<Record<string, string>>([
	{},
	{ "aria-label": "" },
	{ title: "" },
	{ "aria-label": "", title: "" },
	{ "aria-label": " \t\r\n\f", title: "\u00a0\u2003\ufeff" },
])("omits missing or entirely blank selected attributes %j", (attributes) => {
	expect(extractImageSource({ role: "img", ...attributes })).toBeUndefined();
});

it.each(["", " \t\r\n", "\u00a0"])(
	"retains a provided blank companion exactly: %j",
	(blank) => {
		for (const attributes of [
			{ "aria-label": "Warning", title: blank },
			{ "aria-label": blank, title: "Warning" },
		]) {
			expect(source({ role: "img", ...attributes }).attributes).toEqual(
				attributes,
			);
		}
	},
);

it.each(["aria-label", "title"] as const)(
	"enforces the UTF-16 bound on %s without clipping",
	(name) => {
		for (const value of [
			"x".repeat(8191),
			"x".repeat(8192),
			"😀".repeat(4096),
		]) {
			expect(source({ role: "img", [name]: value }).attributes[name]).toBe(
				value,
			);
		}
		for (const value of [
			"x".repeat(8193),
			`${"😀".repeat(4096)}x`,
			" ".repeat(8193),
		]) {
			const attributes = Object.freeze({ role: "img", [name]: value });
			expect(() => extractImageSource(attributes)).toThrow(AgentBrowserError);
			expect(() => extractImageSource(attributes)).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
			expect(attributes[name]).toBe(value);
		}
	},
);

it.each(["aria-label", "title"] as const)(
	"validates oversized %s even with a nonblank companion",
	(name) => {
		const companion = name === "aria-label" ? "title" : "aria-label";
		for (const value of ["x".repeat(8193), " ".repeat(8193)]) {
			expect(() =>
				extractImageSource({
					role: "img",
					[name]: value,
					[companion]: "Warning",
				}),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
		}
		expect(
			source({ role: "img", [name]: " ".repeat(8192), [companion]: "Warning" })
				.attributes[name],
		).toBe(" ".repeat(8192));
	},
);

it("applies independent limits and ignores unrelated or inapplicable values", () => {
	const maximum = "x".repeat(8192);
	expect(
		source({ role: "img", "aria-label": maximum, title: maximum }).attributes,
	).toEqual({ "aria-label": maximum, title: maximum });
	const oversized = "x".repeat(8193);
	const inapplicable: Record<string, string>[] = [
		{ "aria-label": oversized, title: oversized },
		{ role: "IMG", "aria-label": oversized, title: oversized },
		{ role: "img button", "aria-label": oversized, title: oversized },
	];
	for (const attributes of inapplicable) {
		expect(extractImageSource(attributes)).toBeUndefined();
	}
	const inherited = Object.assign(
		Object.create({ "aria-label": oversized, title: oversized }),
		{ role: "img" },
	);
	expect(extractImageSource(inherited)).toBeUndefined();
	inherited.title = "Warning";
	expect(source(inherited).attributes).toEqual({ title: "Warning" });
	expect(
		source({ role: "img", title: "Warning", alt: oversized }).attributes,
	).toEqual({ title: "Warning" });
});

it("returns independent deeply frozen copies without freezing the input", () => {
	const attributes = { role: "img", "aria-label": "Original", title: "Title" };
	const first = source(attributes);
	const second = source(attributes);
	expect(first).toEqual(second);
	expect(first).not.toBe(second);
	expect(first.attributes).not.toBe(second.attributes);
	expect(first.attributes).not.toBe(attributes);
	expect(Object.isFrozen(first)).toBe(true);
	expect(Object.isFrozen(first.attributes)).toBe(true);
	expect(Object.isFrozen(attributes)).toBe(false);
	expect(Reflect.set(first, "role", "button")).toBe(false);
	expect(Reflect.set(first.attributes, "title", "Changed")).toBe(false);
	expect(Reflect.deleteProperty(first.attributes, "aria-label")).toBe(false);
	attributes["aria-label"] = "New label";
	attributes.title = "New title";
	attributes.role = "button";
	expect(first.attributes).toEqual({
		"aria-label": "Original",
		title: "Title",
	});
	expect(second.attributes).toEqual(first.attributes);
});

it("formats selected fields deterministically and omits only absent fields", () => {
	const metadata: ImageSourceMetadata = {
		kind: "native-image-source-v1",
		role: "img",
		attributes: { title: "Details", "aria-label": "Warning" },
	};
	expect(imageSourceText(metadata)).toBe(
		'[Image source: aria-label="Warning"; title="Details"]',
	);
	expect(imageSourceText(source({ role: "img", title: "Details" }))).toBe(
		'[Image source: title="Details"]',
	);
	expect(
		imageSourceText(source({ role: "img", "aria-label": "Warning" })),
	).toBe('[Image source: aria-label="Warning"]');
	expect(
		imageSourceText(
			source({ role: "img", title: "Details", "aria-label": "" }),
		),
	).toBe('[Image source: aria-label=""; title="Details"]');
	expect(
		imageSourceText(
			source({ role: "img", title: "", "aria-label": "Warning" }),
		),
	).toBe('[Image source: aria-label="Warning"; title=""]');
});

it("JSON-quotes delimiters without applying Markdown or HTML escaping", () => {
	const raw = 'A "quote" \\ path; title="fake"] *_[link](target)` <tag>&';
	const metadata = source({ role: "img", title: raw });
	expect(imageSourceText(metadata)).toBe(
		`${String.raw`[Image source: title="A \"quote\" \\ path; title=\"fake\"] *_[link](target)`}\` <tag>&"]`,
	);
	expect(metadata.attributes.title).toBe(raw);
});

it("normalizes line endings and escapes controls while preserving raw fields", () => {
	const raw =
		'First\r\nSecond\rThird\n\t"\\\0\b\v\f\u001b\u007f\u0085\u00ad\u061c\u200b\u200d\u202e\u2066\ufeff\u{e0001}';
	const metadata = source({ role: "img", "aria-label": raw, title: raw });
	const quoted = String.raw`"First\nSecond\nThird\n\t\"\\\\u{0}\\u{8}\\u{b}\\u{c}\\u{1b}\\u{7f}\\u{85}\\u{ad}\\u{61c}\\u{200b}\\u{200d}\\u{202e}\\u{2066}\\u{feff}\\u{e0001}"`;
	const before = JSON.stringify(metadata);
	const text = imageSourceText(metadata);
	expect(text).toBe(`[Image source: aria-label=${quoted}; title=${quoted}]`);
	expect(text).not.toMatch(/[\p{Cc}\p{Cf}]/u);
	expect(imageSourceText(metadata)).toBe(text);
	expect(metadata.attributes).toEqual({ "aria-label": raw, title: raw });
	expect(JSON.stringify(metadata)).toBe(before);
});

it("retains ordinary Unicode and JSON-quotes lone surrogates", () => {
	const raw = "日本語 café e\u0301 😀 \u2028\u2029 \ud800 \udfff";
	const metadata = source({ role: "img", title: raw });
	expect(imageSourceText(metadata)).toBe(
		'[Image source: title="日本語 café e\u0301 😀 \u2028\u2029 \\ud800 \\udfff"]',
	);
	expect(metadata.attributes.title).toBe(raw);
});

it("bounds raw UTF-16 values rather than their escaped representation", () => {
	const raw = "\u202e".repeat(8192);
	const metadata = source({ role: "img", title: raw });
	expect(imageSourceText(metadata)).toBe(
		`[Image source: title="${String.raw`\\u{202e}`.repeat(8192)}"]`,
	);
	expect(metadata.attributes.title).toBe(raw);
});
