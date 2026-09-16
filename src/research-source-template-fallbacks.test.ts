import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { type HtmlToken, HtmlTokenizer } from "./html-tokenizer.js";
import {
	ResearchSourceTemplateFallbackCollector,
	fitResearchSourceTemplateFallbacks,
	researchSourceTemplateFallbacks,
	setResearchSourceTemplateFallbacks,
	sourceTemplateFallbackHidden,
	type ResearchSourceTemplateFallbacks,
} from "./research-source-template-fallbacks.js";

const trees: DocumentTree[] = [];
const voidTags = new Set(
	"area base br col embed frame hr img input keygen link meta param source track wbr".split(
		" ",
	),
);
const rawTags = new Set(
	"script style xmp iframe noembed noframes title textarea".split(" "),
);
const forbiddenTags =
	"template noscript svg math script style xmp iframe object embed canvas noembed noframes input textarea select datalist audio video".split(
		" ",
	);

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function required<Value>(value: Value | undefined): Value {
	expect(value).toBeDefined();
	if (value === undefined)
		throw new Error("Missing template fallback metadata");
	return value;
}

function bytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function expectFrozen(data: ResearchSourceTemplateFallbacks): void {
	expect(Object.isFrozen(data)).toBe(true);
	expect(Object.isFrozen(data.entries)).toBe(true);
	for (const entry of data.entries) {
		expect(Object.isFrozen(entry)).toBe(true);
		expect(Object.isFrozen(entry.template)).toBe(true);
		expect(Object.isFrozen(entry.template.attributes)).toBe(true);
		expect(Object.isFrozen(entry.source)).toBe(true);
	}
}

function collect(source: string): ResearchSourceTemplateFallbacks | undefined {
	const collector = new ResearchSourceTemplateFallbackCollector(source);
	const tokenizer = new HtmlTokenizer(source, () => {});
	const parents: string[] = [];
	for (;;) {
		const offset = tokenizer.position;
		const token = tokenizer.next();
		if (!token) break;
		if (!parents.length) {
			if (
				token.kind === "start" &&
				token.name === "template" &&
				!token.selfClosing
			) {
				collector.begin(token.attributes, offset);
				parents.push(token.name);
			}
			continue;
		}
		collector.observe(token, offset, tokenizer.position, parents);
		if (token.kind === "end") {
			expect(parents.pop()).toBe(token.name);
		} else if (
			token.kind === "start" &&
			!token.selfClosing &&
			!voidTags.has(token.name)
		) {
			parents.push(token.name);
			if (rawTags.has(token.name)) {
				tokenizer.raw(token.name);
			}
		}
	}
	return collector.finish();
}

function fallback(html: string, attributes = ""): string {
	return `<template${attributes}><noscript>${html}</noscript></template>`;
}

function tag(name: string, kind: "start" | "end" = "start"): HtmlToken {
	return { kind, name, attributes: {}, selfClosing: false };
}

describe("shared source-hidden predicate", () => {
	const hidden: Record<string, string>[] = [
		{ hidden: "" },
		{ hidden: "false" },
		{ inert: "" },
		{ inert: "false" },
		{ "aria-hidden": "TrUe" },
		{ style: "display: NoNe !important;display:block" },
		{ style: "color:red;display:none" },
	];
	it.each(hidden)("recognizes own hidden declarations: %j", (attributes) => {
		expect(sourceTemplateFallbackHidden(attributes)).toBe(true);
	});

	const visible: Record<string, string>[] = [
		{},
		{ "aria-hidden": "false" },
		{ style: "display:none;display:block" },
		{ style: "display:block!important;display:none" },
		{ style: "visibility:hidden" },
		{ style: 'content:"display:none"' },
	];
	it.each(visible)(
		"does not infer additional visibility policies: %j",
		(attributes) => {
			expect(sourceTemplateFallbackHidden(attributes)).toBe(false);
		},
	);

	it("ignores inherited declarations and supports null-prototype attributes", () => {
		const inherited = Object.create({
			hidden: "",
			inert: "",
			"aria-hidden": "true",
			style: "display:none",
		});
		expect(sourceTemplateFallbackHidden(inherited)).toBe(false);
		const attributes = Object.assign(Object.create(null), { inert: "" });
		expect(sourceTemplateFallbackHidden(attributes)).toBe(true);
	});
});

describe("bounded template noscript collection", () => {
	it("preserves exact authored HTML and normalized UTF16 source offsets", () => {
		const html =
			'\n<p>Compatibility &amp; <a href="/notice?q=&quot;x&quot;">界😀 notice</a></p>\n';
		const source = `😀\n${fallback(html, ' id="notice" shadowrootmode="not-a-mode" src="ignored"')}`;
		const data = required(collect(source));
		expect(data).toEqual({
			kind: "html-template-noscript-source-v1",
			scope: "document-source",
			partial: true,
			rendered: false,
			verified: false,
			textFormat: "html-source",
			truncated: false,
			entries: [
				{
					template: {
						offset: 3,
						attributes: { id: "notice", shadowrootmode: "not-a-mode" },
					},
					source: {
						offset: source.indexOf("<noscript>"),
						offsetBasis: "lf-normalized-utf16",
					},
					html,
				},
			],
		});
		expectFrozen(data);
	});

	it("collects sibling fallbacks in plain and declarative root templates", () => {
		const source = `<template><section><noscript>first</noscript></section><noscript>second</noscript></template>${fallback("third", ' shadowrootmode="closed"')}`;
		const data = required(collect(source));
		expect(data.entries.map((entry) => entry.html)).toEqual([
			"first",
			"second",
			"third",
		]);
		expect(data.entries[0].template.attributes).toEqual({});
		expect(data.entries[1].template.offset).toBe(0);
		expect(data.entries[2].template.offset).toBe(
			source.lastIndexOf("<template"),
		);
	});

	it("copies only bounded own template attributes at begin", () => {
		const source = "<noscript>notice</noscript>";
		const collector = new ResearchSourceTemplateFallbackCollector(source);
		const attributes = Object.assign(
			Object.create({ shadowrootmode: "open" }),
			{
				id: "😀".repeat(128),
			},
		);
		Object.defineProperty(attributes, "src", {
			enumerable: true,
			get() {
				throw new Error("Unrelated attribute accessed");
			},
		});
		collector.begin(attributes, 0);
		attributes.id = "changed";
		collector.observe(tag("noscript"), 0, 10, ["template"]);
		collector.observe({ kind: "text", data: "notice" }, 10, 16, [
			"template",
			"noscript",
		]);
		collector.observe(tag("noscript", "end"), 16, source.length, [
			"template",
			"noscript",
		]);
		expect(required(collector.finish()).entries[0].template.attributes).toEqual(
			{
				id: "😀".repeat(128),
			},
		);
		const oversized = required(
			collect(
				fallback(
					"notice",
					` id="${"x".repeat(257)}" shadowrootmode="${"x".repeat(257)}"`,
				),
			),
		);
		expect(oversized.entries[0].template.attributes).toEqual({});
		expect(oversized.truncated).toBe(false);
	});

	it.each([
		"",
		" \n\t ",
		"&nbsp;&#32;",
		"<!-- notice -->",
		'<img src="/tracking" alt="notice">',
		"<span title='notice'></span>",
		"<script>notice</script>",
		"<style>notice</style>",
		"<title>notice</title>",
	])("requires a nonblank observed text token: %j", (html) => {
		expect(collect(fallback(html))).toBeUndefined();
	});

	it.each(forbiddenTags)("does not mine a %s ancestor", (name) => {
		const collector = new ResearchSourceTemplateFallbackCollector("x");
		collector.begin({}, 0);
		const parents = ["template", name];
		collector.observe(tag("noscript"), 0, 0, parents);
		parents.push("noscript");
		collector.observe({ kind: "text", data: "x" }, 0, 1, parents);
		collector.observe(tag("noscript", "end"), 1, 1, parents);
		expect(collector.finish()).toBeUndefined();
	});

	it.each(forbiddenTags)("rejects the entire capture containing %s", (name) => {
		const subtree = voidTags.has(name)
			? `<${name}>`
			: `<${name}>nested</${name}>`;
		const source = fallback(`before${subtree}after`) + fallback("retained");
		const data = required(collect(source));
		expect(data.entries.map((entry) => entry.html)).toEqual(["retained"]);
		expect(data.truncated).toBe(false);
	});

	it.each([
		"hidden",
		'inert="false"',
		'aria-hidden="TRUE"',
		'style="display:none!important;display:block"',
	])(
		"ignores hidden roots, ancestors and noscript starts: %s",
		(attributes) => {
			const source = `${fallback("root", ` ${attributes}`)}<template><div ${attributes}><section><noscript>descendant</noscript></section></div><noscript ${attributes}>own</noscript><noscript>retained</noscript></template>`;
			expect(
				required(collect(source)).entries.map((entry) => entry.html),
			).toEqual(["retained"]);
		},
	);

	it.each([
		"<span hidden>secret</span>",
		"<span inert>secret</span>",
		'<span aria-hidden="true">secret</span>',
		'<span style="display:none">secret</span>',
		"<img hidden>",
		"<span hidden/>",
	])("rejects rather than splices hidden capture HTML: %s", (subtree) => {
		expect(collect(fallback(`before${subtree}after`))).toBeUndefined();
	});

	it("clears blocked depth after void, self-closing and consumed raw tokens", () => {
		const source =
			"<template><img hidden><span hidden/><script hidden>ignored</script><noscript>notice</noscript></template>";
		expect(required(collect(source)).entries[0].html).toBe("notice");
	});

	it.each(["p", "li"])(
		"clears hidden depth at the reader's implicit %s sibling boundary",
		(name) => {
			const collector = new ResearchSourceTemplateFallbackCollector("x");
			collector.begin({}, 0);
			const parents = name === "li" ? ["template", "ul"] : ["template"];
			collector.observe(
				{ kind: "start", name, attributes: { hidden: "" }, selfClosing: false },
				0,
				0,
				parents,
			);
			parents.push(name);
			collector.observe(tag(name), 0, 0, parents);
			collector.observe(tag("noscript"), 0, 0, parents);
			parents.push("noscript");
			collector.observe({ kind: "text", data: "x" }, 0, 1, parents);
			collector.observe(tag("noscript", "end"), 1, 1, parents);
			expect(required(collector.finish()).entries[0].html).toBe("x");
		},
	);

	it("uses existing inline display precedence without decoding the captured HTML", () => {
		const html =
			'<span style="display:none;display:block">&lt;notice&gt;</span>';
		expect(required(collect(fallback(html))).entries[0].html).toBe(html);
	});

	it("ignores incomplete captures without marking capacity truncation", () => {
		expect(collect("<template><noscript>notice")).toBeUndefined();
		expect(collect(`<template><noscript>${"x".repeat(8193)}`)).toBeUndefined();
		const data = required(
			collect(`${fallback("complete")}<template><noscript>unfinished`),
		);
		expect(data.entries.map((entry) => entry.html)).toEqual(["complete"]);
		expect(data.truncated).toBe(false);
	});

	it("closes only at matching noscript depth and resets on root closure", () => {
		const collector = new ResearchSourceTemplateFallbackCollector("x");
		collector.begin({}, 0);
		collector.observe(tag("noscript"), 0, 0, ["template"]);
		collector.observe({ kind: "text", data: "x" }, 0, 1, [
			"template",
			"noscript",
		]);
		collector.observe(tag("noscript", "end"), 1, 1, [
			"template",
			"noscript",
			"div",
		]);
		expect(collector.finish()).toBeUndefined();
		collector.observe(tag("template", "end"), 1, 1, ["template"]);
		collector.observe(tag("noscript", "end"), 1, 1, ["template", "noscript"]);
		expect(collector.finish()).toBeUndefined();
		collector.begin({}, 0);
		collector.observe(tag("noscript"), 0, 0, ["template"]);
		collector.observe({ kind: "text", data: "x" }, 0, 1, [
			"template",
			"noscript",
		]);
		collector.observe(tag("noscript", "end"), 1, 1, ["template", "noscript"]);
		expect(required(collector.finish()).entries[0].html).toBe("x");
	});

	it("bounds HTML in UTF16 units, dropping oversized captures whole", () => {
		const html = "😀".repeat(4096);
		const data = required(
			collect(fallback(html) + fallback(`${html}x`) + fallback("last")),
		);
		expect(data.entries.map((entry) => entry.html)).toEqual([html, "last"]);
		expect(data.truncated).toBe(true);
		const marker = required(collect(fallback("x".repeat(8193))));
		expect(marker.entries).toEqual([]);
		expect(marker.truncated).toBe(true);
	});

	it("counts only accepted captures toward the sixteen-entry bound", () => {
		const sixteen = Array.from({ length: 16 }, (_, index) =>
			fallback(`notice ${index}`),
		).join("");
		expect(required(collect(sixteen)).truncated).toBe(false);
		const data = required(
			collect(fallback("<!-- ignored -->") + sixteen + fallback("extra")),
		);
		expect(data.entries).toHaveLength(16);
		expect(data.entries[15].html).toBe("notice 15");
		expect(data.truncated).toBe(true);
	});
});

describe("exact JSON fitting and metadata lifecycle", () => {
	it("fits whole leading records at exact UTF8 and escaped JSON byte boundaries", () => {
		const data = required(
			collect(fallback('"\\😀界') + fallback("middle") + fallback("last")),
		);
		const before = JSON.stringify(data);
		expect(
			required(fitResearchSourceTemplateFallbacks(data, bytes(data))),
		).toEqual(data);
		for (let count = 0; count < data.entries.length; count++) {
			const expected = {
				...data,
				entries: data.entries.slice(0, count),
				truncated: true,
			};
			const limit = bytes(expected);
			const fitted = required(fitResearchSourceTemplateFallbacks(data, limit));
			expect(fitted).toEqual(expected);
			expect(bytes(fitted)).toBe(limit);
			expectFrozen(fitted);
			const smaller = fitResearchSourceTemplateFallbacks(data, limit - 1);
			if (count === 0) expect(smaller).toBeUndefined();
			else expect(required(smaller).entries).toHaveLength(count - 1);
		}
		expect(JSON.stringify(data)).toBe(before);
		expect(fitResearchSourceTemplateFallbacks(data, 0)).toBeUndefined();
	});

	it("caps collector and fitter output at 32768 bytes without skipping large entries", () => {
		const html = "界".repeat(8192);
		const data = required(
			collect(fallback(html) + fallback(html) + fallback("small")),
		);
		expect(data.entries.map((entry) => entry.html)).toEqual([html]);
		expect(data.truncated).toBe(true);
		expect(bytes(data)).toBeLessThanOrEqual(32_768);
		const oversized = {
			...data,
			truncated: false,
			entries: [...data.entries, ...data.entries],
		};
		expect(
			required(
				fitResearchSourceTemplateFallbacks(oversized, Number.MAX_SAFE_INTEGER),
			),
		).toEqual(data);
		const budget = bytes({
			...data,
			entries: [{ ...data.entries[0], html: "small" }],
		});
		expect(
			required(fitResearchSourceTemplateFallbacks(data, budget)).entries,
		).toEqual([]);
	});

	it("returns a truncated empty marker when escaping alone exceeds the byte cap", () => {
		const data = required(collect(fallback("\u0001".repeat(8192))));
		expect(data.entries).toEqual([]);
		expect(data.truncated).toBe(true);
		expectFrozen(data);
	});

	it("bounds externally supplied record counts and HTML without clipping", () => {
		const data = required(collect(fallback("notice")));
		const repeated = {
			...data,
			entries: Array.from({ length: 17 }, () => data.entries[0]),
		};
		const fitted = required(
			fitResearchSourceTemplateFallbacks(repeated, 32_768),
		);
		expect(fitted.entries).toHaveLength(16);
		expect(fitted.truncated).toBe(true);
		const oversized = {
			...data,
			entries: [{ ...data.entries[0], html: "x".repeat(8193) }],
		};
		expect(
			required(fitResearchSourceTemplateFallbacks(oversized, 32_768)).entries,
		).toEqual([]);
	});

	it.each([
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
		"100",
		undefined,
	])(
		"rejects invalid fit limits with the contracted resource error: %j",
		(limit) => {
			expect(() =>
				fitResearchSourceTemplateFallbacks(
					required(collect(fallback("notice"))),
					limit as number,
				),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
		},
	);

	it("snapshots only whitelisted fields without retaining caller-owned objects", () => {
		const expected = required(
			collect(fallback("notice", ' id="original" shadowrootmode="open"')),
		);
		const input = JSON.parse(JSON.stringify(expected));
		for (const target of [
			input,
			input.entries[0],
			input.entries[0].template,
			input.entries[0].template.attributes,
			input.entries[0].source,
		]) {
			Object.defineProperty(target, "unknown", {
				enumerable: true,
				get() {
					throw new Error("Unknown field accessed");
				},
			});
		}
		const copied = required(fitResearchSourceTemplateFallbacks(input, 32_768));
		expect(copied).toEqual(expected);
		expectFrozen(copied);
		input.entries[0].template.attributes.id = "changed";
		input.entries[0].source.offset = 999;
		input.entries[0].html = "changed";
		input.entries.push(input.entries[0]);
		expect(copied).toEqual(expected);
	});

	it("stores independent snapshots, reuses cleanup and removes metadata on close", () => {
		const tree = new DocumentTree("https://example.test/");
		const other = new DocumentTree("https://example.test/");
		trees.push(tree, other);
		const cleanup = vi.spyOn(tree, "onClose");
		const expected = required(collect(fallback("notice", ' id="original"')));
		const input = JSON.parse(JSON.stringify(expected));
		setResearchSourceTemplateFallbacks(tree, input);
		const stored = required(researchSourceTemplateFallbacks(tree));
		expect(stored).toEqual(expected);
		expect(stored).not.toBe(input);
		expectFrozen(stored);
		input.entries[0].template.attributes.id = "changed";
		input.entries[0].html = "changed";
		expect(researchSourceTemplateFallbacks(tree)).toEqual(expected);
		expect(researchSourceTemplateFallbacks(other)).toBeUndefined();
		for (let index = 0; index < 70; index++)
			setResearchSourceTemplateFallbacks(tree, expected);
		expect(cleanup).toHaveBeenCalledTimes(1);
		tree.close();
		expect(researchSourceTemplateFallbacks(tree)).toBeUndefined();
		expect(stored).toEqual(expected);
		expect(() => setResearchSourceTemplateFallbacks(tree, expected)).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
	});

	it("propagates cleanup resource limits without publishing or retaining registration", () => {
		const tree = new DocumentTree("https://example.test/");
		trees.push(tree);
		const release = Array.from({ length: 64 }, () => tree.onClose(() => {}));
		const data = required(collect(fallback("notice")));
		expect(() => setResearchSourceTemplateFallbacks(tree, data)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(researchSourceTemplateFallbacks(tree)).toBeUndefined();
		release[0]();
		setResearchSourceTemplateFallbacks(tree, data);
		expect(researchSourceTemplateFallbacks(tree)).toEqual(data);
	});
});
