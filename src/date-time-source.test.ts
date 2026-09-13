import { afterEach, expect, it, vi } from "vitest";
import {
	hasResearchExtractionContent,
	researchDocumentDiagnosticText,
	researchExtractionDiagnosticText,
} from "../scripts/research-content.js";
import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import {
	type ExtractedNode,
	type ExtractionOptions,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

type DateTimeTag = "time" | "ins" | "del";
interface DateTimeSource {
	kind: "native-date-time-source-v1";
	tag: DateTimeTag;
	value: string;
}
type DateTimeNode = ExtractedNode & { dateTimeSource?: DateTimeSource };
interface ReaderMode {
	name: string;
	profile?: "long-v1";
	rawPolicy?: "separate-omitted-raw-v1";
}

const url = "https://date-time.fixture.invalid/synthetic";
const trees: DocumentTree[] = [];
const owners: DocumentQueries[] = [];
const tags: DateTimeTag[] = ["time", "ins", "del"];
const readerModes: ReaderMode[] = [
	{ name: "default" },
	{ name: "long", profile: "long-v1" },
	{ name: "default raw", rawPolicy: "separate-omitted-raw-v1" },
	{
		name: "long raw",
		profile: "long-v1",
		rawPolicy: "separate-omitted-raw-v1",
	},
];
const limits = {
	maxNodes: 1024,
	maxDepth: 64,
	maxTextCodeUnits: 100_000,
	maxChanges: 1024,
};

afterEach(() => {
	vi.restoreAllMocks();
	for (const owner of owners.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
});

function native(source: string, maxTextCodeUnits = limits.maxTextCodeUnits) {
	const tree = parseHtmlDocument(source, url, {
		limits: { ...limits, maxTextCodeUnits },
	});
	trees.push(tree);
	return tree;
}

function load(source: string, mode: Partial<ReaderMode> = {}) {
	const body = new TextEncoder().encode(source);
	const tree = loadResearchDocument(
		{
			url,
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.byteLength,
			redirects: [],
			elapsedMs: 0,
		},
		{
			tabId: "date-time-source",
			signal: new AbortController().signal,
			limits,
		},
		mode.profile,
		mode.rawPolicy,
	);
	trees.push(tree);
	return tree;
}

function query(tree: DocumentTree) {
	const owner = new DocumentQueries(tree);
	owners.push(owner);
	return owner;
}

function element(owner: DocumentQueries, selector: string) {
	const id = owner.querySelector(selector);
	if (id === null) throw new Error(`Missing fixture element: ${selector}`);
	return id;
}

function flattened(node: ExtractedNode): DateTimeNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function structured(tree: DocumentTree, options: ExtractionOptions = {}) {
	const result = extractDocument(tree, { ...options, format: "json" });
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	return result;
}

function record(root: ExtractedNode, tree: DocumentTree, id: number) {
	const node = flattened(root).find(
		(entry) => entry.ref === tree.reference(id),
	);
	if (!node) throw new Error(`Missing extracted fixture node: ${id}`);
	return node;
}

function sources(root: ExtractedNode) {
	return flattened(root).flatMap((node) =>
		node.dateTimeSource === undefined ? [] : [node.dateTimeSource],
	);
}

function expected(tag: DateTimeTag, value: string): DateTimeSource {
	return { kind: "native-date-time-source-v1", tag, value };
}

function append(
	tree: DocumentTree,
	parent: number,
	tag: string,
	attributes: Record<string, string> = {},
	text?: string,
) {
	const id = tree.createElement(tag, attributes);
	tree.append(parent, id);
	if (text !== undefined) tree.setTextContent(id, text);
	return id;
}

it.each(readerModes.flatMap((mode) => tags.map((tag) => ({ ...mode, tag }))))(
	"retains $tag datetime through the $name reader",
	(mode) => {
		const value = "2026-09-13T08:15:00+05:45";
		const source = `<${mode.tag} id="date" datetime="${value}" onclick="discard()" class="discarded">Public label</${mode.tag}>`;
		const sanitized = sanitizeResearchHtml(
			source,
			{},
			undefined,
			mode.profile,
			mode.rawPolicy,
		);
		expect(sanitized.html).toBe(
			`<${mode.tag} id="date" datetime="${value}">Public label</${mode.tag}>`,
		);
		expect(sanitized.report.ignoredAttributes).toBe(2);
		const tree = load(source, mode);
		const id = element(query(tree), "#date");
		expect(tree.get(id).tagName).toBe(mode.tag);
		expect(tree.get(id).attributes).toEqual({ id: "date", datetime: value });
		const result = structured(tree);
		expect(record(result.content, tree, id).dateTimeSource).toEqual(
			expected(mode.tag, value),
		);
		expect(structured(tree, { tableMetadata: false })).toEqual(result);
		expect(researchReaderInfo(tree)?.hiddenContentSemantics).toBe(false);
		expect(researchReaderInfo(tree)?.rawTextPolicy).toBe(mode.rawPolicy);
		expect(researchExtractionDiagnosticText(result)).toBe("Public label");
	},
);

it.each([
	{ name: "invalid calendar", value: "2026-99-72T25:61:99" },
	{ name: "literal prose", value: "not a date at all" },
	{ name: "surrounding whitespace", value: " \t2026-09-13\n " },
	{ name: "empty attribute", value: "" },
	{ name: "date without timezone", value: "2026-09-13" },
	{ name: "duration", value: "P3DT4H" },
])("keeps $name verbatim without interpreting labels", ({ value }) => {
	const source = tags
		.map((tag) => `<${tag} datetime="${value}">Tomorrow</${tag}>`)
		.join("");
	for (const tree of [native(source), load(source, { profile: "long-v1" })]) {
		const owner = query(tree);
		const result = structured(tree);
		expect(sources(result.content)).toEqual(
			tags.map((tag) => expected(tag, value)),
		);
		for (const tag of tags) {
			const node = tree.get(element(owner, tag));
			expect(Object.hasOwn(node.attributes, "datetime")).toBe(true);
			expect(node.attributes.datetime).toBe(value);
		}
	}
});

it.each([
	{ source: "\r", value: "\n" },
	{ source: "\r\n", value: "\n" },
	{ source: "\r\r\n", value: "\n\n" },
	{ source: "&#13;", value: "\r" },
	{ source: "&#xD;", value: "\r" },
	{ source: "&#13;\n", value: "\r\n" },
	{ source: "\r&#10;", value: "\n\n" },
])(
	"matches native attribute newline preprocessing for $source",
	({ source: newline, value }) => {
		const source = `<time datetime="a${newline}b&amp;&quot;&lt;&gt;😀">Label</time>`;
		const original = native(source);
		const originalId = element(query(original), "time");
		const decoded = `a${value}b&"<>😀`;
		expect(original.get(originalId).attributes.datetime).toBe(decoded);
		const sanitized = sanitizeResearchHtml(source);
		const reparsed = native(sanitized.html);
		for (const tree of [reparsed, load(source)]) {
			const id = element(query(tree), "time");
			expect(tree.get(id).attributes).toEqual(
				original.get(originalId).attributes,
			);
			expect(record(structured(tree).content, tree, id).dateTimeSource).toEqual(
				expected("time", decoded),
			);
		}
		expect(sanitized.report.sourceCodeUnits).toBe(source.length);
		expect(sanitized.report.outputCodeUnits).toBe(sanitized.html.length);
	},
);

it.each([
	{ name: "unrelated span", source: '<span datetime="LEAK">Public</span>' },
	{ name: "rewritten form", source: '<form datetime="LEAK">Public</form>' },
	{ name: "rewritten xmp", source: '<xmp datetime="LEAK">Public</xmp>' },
	{
		name: "script subtree",
		source:
			'<script datetime="LEAK"><time datetime="LEAK">Secret</time></script>',
	},
	{
		name: "template subtree",
		source: '<template><ins datetime="LEAK">Secret</ins></template>',
	},
	{
		name: "SVG subtree",
		source: '<svg><time datetime="LEAK">Secret</time></svg>',
	},
	{
		name: "MathML subtree",
		source: '<math><del datetime="LEAK">Secret</del></math>',
	},
])("does not introduce reader metadata from $name", ({ source }) => {
	for (const mode of readerModes) {
		const input = `${source}<p>Retained</p>`;
		const sanitized = sanitizeResearchHtml(
			input,
			{},
			undefined,
			mode.profile,
			mode.rawPolicy,
		);
		expect(sanitized.html).not.toContain("datetime=");
		expect(sanitized.html).not.toContain("LEAK");
		const tree = load(input, mode);
		expect(query(tree).querySelectorAll("[datetime]")).toHaveLength(0);
		expect(sources(structured(tree).content)).toEqual([]);
	}
});

it("safely re-escapes datetime and charges the reader output boundary", () => {
	const source =
		'<time datetime="&quot;&gt;&lt;script&gt;&amp;&#13;">Label</time>';
	const sanitized = sanitizeResearchHtml(source);
	expect(sanitized.html).toBe(source);
	expect(sanitized.report.outputCodeUnits).toBe(source.length);
	expect(
		sanitizeResearchHtml(source, { maxOutputCodeUnits: source.length }).html,
	).toBe(source);
	expect(() =>
		sanitizeResearchHtml(source, { maxOutputCodeUnits: source.length - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	const tree = load(source);
	expect(query(tree).querySelectorAll("script")).toHaveLength(0);
	expect(sources(structured(tree).content)).toEqual([
		expected("time", '"><script>&\r'),
	]);
});

it.each([
	{ wrapper: "svg", namespace: "http://www.w3.org/2000/svg" },
	{ wrapper: "math", namespace: "http://www.w3.org/1998/Math/MathML" },
])(
	"excludes native $wrapper namesakes from HTML metadata",
	({ wrapper, namespace }) => {
		const value = "x".repeat(4097);
		const source = tags
			.map((tag) => `<${tag} id="${tag}" datetime="${value}">Foreign</${tag}>`)
			.join("");
		const tree = native(`<${wrapper}>${source}</${wrapper}><p>Public</p>`);
		const owner = query(tree);
		for (const tag of tags) {
			const node = tree.get(element(owner, `#${tag}`));
			expect(node.namespaceURI).toBe(namespace);
			expect(node.attributes.datetime).toBe(value);
		}
		expect(sources(structured(tree).content)).toEqual([]);
	},
);

it.each([
	{ name: "hidden", attributes: "hidden" },
	{ name: "inert", attributes: "inert" },
	{ name: "ARIA hidden", attributes: 'aria-hidden="true"' },
	{ name: "display none", attributes: 'style="display:none"' },
	{ name: "visibility hidden", attributes: 'style="visibility:hidden"' },
])(
	"excludes native $name datetime without charging its limit",
	({ attributes }) => {
		const value = "x".repeat(4097);
		const source = tags
			.map((tag) => `<${tag} datetime="${value}" ${attributes}>Secret</${tag}>`)
			.join("");
		const tree = native(`${source}<p>Public</p>`);
		const owner = query(tree);
		expect(owner.querySelectorAll("[datetime]")).toHaveLength(3);
		const result = structured(tree);
		expect(sources(result.content)).toEqual([]);
		expect(researchExtractionDiagnosticText(result)).toBe("Public");
		expect(researchDocumentDiagnosticText(tree).trim()).toBe("Public");
		for (const tag of tags) {
			const root = tree.reference(element(owner, tag));
			expect(sources(structured(tree, { root }).content)).toEqual([]);
		}
	},
);

it.each(["script", "style", "object", "iframe"])(
	"does not inspect datetime descendants of native omitted %s elements",
	(tag) => {
		const tree = native("<body><p>Public</p></body>");
		const owner = query(tree);
		const wrapper = append(tree, element(owner, "body"), tag);
		const id = append(
			tree,
			wrapper,
			"time",
			{ datetime: "x".repeat(4097) },
			"Secret",
		);
		expect(sources(structured(tree).content)).toEqual([]);
		expect(
			sources(structured(tree, { root: tree.reference(id) }).content),
		).toEqual([]);
		expect(researchExtractionDiagnosticText(structured(tree))).toBe("Public");
	},
);

it("ignores inherited datetime in a native node read view", () => {
	const tree = native("<time>Public</time>");
	const id = element(query(tree), "time");
	const get = tree.get.bind(tree);
	const attributes = Object.create({ datetime: "x".repeat(4097) }) as Record<
		string,
		string
	>;
	vi.spyOn(tree, "get").mockImplementation((nodeId) => {
		const node = get(nodeId);
		return nodeId === id ? { ...node, attributes } : node;
	});
	expect(Object.hasOwn(tree.get(id).attributes, "datetime")).toBe(false);
	expect(record(structured(tree).content, tree, id)).not.toHaveProperty(
		"dateTimeSource",
	);
});

it.each([
	{ name: "ordinary", value: "context date" },
	{ name: "oversized", value: "x".repeat(4097) },
])("omits $name section-context and out-of-section datetime", ({ value }) => {
	const tree = native("<body></body>");
	const body = element(query(tree), "body");
	const wrapper = append(tree, body, "time", { datetime: value });
	append(tree, wrapper, "p", {}, "Excluded prefix");
	const heading = append(tree, wrapper, "h2", {}, "Start");
	const included = append(
		tree,
		wrapper,
		"ins",
		{ datetime: "included" },
		"Kept",
	);
	append(tree, body, "h2", {}, "Stop");
	const excluded = append(
		tree,
		body,
		"del",
		{ datetime: value },
		"Excluded tail",
	);
	const result = structured(tree, { section: tree.reference(heading) });
	const context = record(result.content, tree, wrapper);
	expect(context.type).toBe("container");
	expect(context).not.toHaveProperty("dateTimeSource");
	expect(record(result.content, tree, included).dateTimeSource).toEqual(
		expected("ins", "included"),
	);
	expect(sources(result.content)).toEqual([expected("ins", "included")]);
	expect(
		flattened(result.content).some(
			(node) => node.ref === tree.reference(excluded),
		),
	).toBe(false);
	expect(researchExtractionDiagnosticText(result)).toBe("Start Kept");
});

it.each([
	{ name: "ordinary", value: "outside date" },
	{ name: "oversized", value: "x".repeat(4097) },
])("does not inspect $name out-of-root datetime", ({ value }) => {
	const tree = native(
		`<time datetime="${value}">Outside</time><del id="selected" datetime="raw">Selected</del>`,
	);
	const id = element(query(tree), "#selected");
	const result = structured(tree, { root: tree.reference(id) });
	expect(result.scope).toBe(tree.reference(id));
	expect((result.content as DateTimeNode).dateTimeSource).toEqual(
		expected("del", "raw"),
	);
	expect(sources(result.content)).toEqual([expected("del", "raw")]);
});

it.each(
	tags.flatMap((tag) => [
		{ tag, name: "ASCII", boundary: "x".repeat(4096) },
		{ tag, name: "astral", boundary: "😀".repeat(2048) },
	]),
)("enforces $tag $name UTF-16 limits only for JSON", ({ tag, boundary }) => {
	expect(boundary.length).toBe(4096);
	const oversized = `${boundary}x`;
	const source = `<${tag} datetime="${oversized}">Public</${tag}>`;
	expect(sanitizeResearchHtml(source).html).toBe(source);
	for (const tree of [native(source), load(source, { profile: "long-v1" })]) {
		const id = element(query(tree), tag);
		const revision = tree.revision;
		expect(tree.get(id).attributes.datetime).toBe(oversized);
		const markdown = extractDocument(tree);
		expect(markdown.content).toBe("Public\n");
		expect(() => structured(tree)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(tree.revision).toBe(revision);
		expect(tree.get(id).attributes.datetime).toBe(oversized);
		tree.setAttribute(id, "datetime", boundary);
		expect(record(structured(tree).content, tree, id).dateTimeSource).toEqual(
			expected(tag, boundary),
		);
		expect(extractDocument(tree).content).toBe(markdown.content);
	}
});

it("charges automatic metadata to the exact serialized JSON byte boundary", () => {
	const tree = native('<time datetime="😀&quot;&#13;é">Public</time>');
	const result = structured(tree);
	expect(sources(result.content)).toEqual([expected("time", '😀"\ré')]);
	const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
	const withoutMetadata = JSON.stringify(result, (key, value) =>
		key === "dateTimeSource" ? undefined : value,
	);
	const withoutBytes = new TextEncoder().encode(withoutMetadata).byteLength;
	expect(bytes).toBeGreaterThan(withoutBytes);
	expect(withoutBytes).toBeGreaterThanOrEqual(256);
	expect(structured(tree, { maxBytes: bytes })).toEqual(result);
	for (const maxBytes of [bytes - 1, withoutBytes])
		expect(() => structured(tree, { maxBytes })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});

it("charges JSON-escaped datetime to the existing intermediate byte cap", () => {
	const tree = native("<body></body>", 1_000_000);
	const body = element(query(tree), "body");
	const value = "\u0001".repeat(4096);
	for (let index = 0; index < 172; index++)
		append(tree, body, "time", { datetime: value });
	const revision = tree.revision;
	expect(() => structured(tree, { maxBytes: 1_048_576 })).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "Extraction intermediate limit exceeded",
		}),
	);
	expect(extractDocument(tree).content).toBe("");
	expect(tree.revision).toBe(revision);
});

it.each([
	{ name: "nonempty", value: " literal-source-only ", content: true },
	{ name: "empty", value: "", content: false },
	{ name: "whitespace", value: " \t\n\r\u00a0 ", content: false },
	{ name: "absent", value: undefined, content: false },
])(
	"treats $name metadata-only nodes as research content correctly",
	({ value, content }) => {
		for (const tag of tags) {
			const tree = native(`<${tag}></${tag}>`);
			const id = element(query(tree), tag);
			if (value !== undefined) tree.setAttribute(id, "datetime", value);
			const result = structured(tree);
			const node = record(result.content, tree, id);
			if (value === undefined)
				expect(node).not.toHaveProperty("dateTimeSource");
			else expect(node.dateTimeSource).toEqual(expected(tag, value));
			expect(hasResearchExtractionContent(result)).toBe(content);
			expect(researchExtractionDiagnosticText(result)).toBe("");
			expect(researchDocumentDiagnosticText(tree).trim()).toBe("");
			const markdown = extractDocument(tree);
			expect(markdown.content).toBe("");
			expect(hasResearchExtractionContent(markdown)).toBe(false);
		}
	},
);

it("preserves independent native table and ARIA metadata without Markdown changes", () => {
	const tree = load(
		'<table id="dates"><tr><th id="day" scope="col">Day</th><td headers="day"><time role="cell" aria-colindex="2" datetime="raw-date">Monday</time></td></tr></table>',
	);
	const owner = query(tree);
	const baseline = structured(tree);
	const enriched = structured(tree, { tableMetadata: true });
	const time = element(owner, "time");
	const date = record(enriched.content, tree, time);
	expect(date.dateTimeSource).toEqual(expected("time", "raw-date"));
	expect(date.ariaTableSource).toEqual({
		kind: "native-aria-table-source-v1",
		tag: "time",
		role: "cell",
		attributes: { role: "cell", "aria-colindex": "2" },
	});
	expect(
		record(enriched.content, tree, element(owner, "td")).tableSource,
	).toEqual({
		kind: "native-table-source-v1",
		tag: "td",
		attributes: { headers: "day" },
	});
	expect(
		JSON.stringify(enriched, (key, value) =>
			key === "tableSource" || key === "ariaTableSource" ? undefined : value,
		),
	).toBe(JSON.stringify(baseline));
	const markdown = extractDocument(tree);
	expect(markdown.content).toContain("Native table begin");
	expect(markdown.content).toContain("Monday");
	expect(markdown.content).not.toContain("raw-date");
	tree.removeAttribute(time, "datetime");
	expect(extractDocument(tree).content).toBe(markdown.content);
});

it("refreshes metadata and queries after mutations without changing old snapshots", () => {
	const tree = load('<time id="date" datetime="Before">Public</time>');
	const owner = query(tree);
	const id = element(owner, "#date");
	const revision = tree.revision;
	const first = record(structured(tree).content, tree, id).dateTimeSource;
	const second = record(structured(tree).content, tree, id).dateTimeSource;
	expect(first).toEqual(expected("time", "Before"));
	expect(second).toEqual(first);
	expect(second).not.toBe(first);
	expect(tree.revision).toBe(revision);
	if (!first) throw new Error("Expected datetime metadata");
	first.value = "Result-only mutation";
	expect(second?.value).toBe("Before");
	expect(tree.get(id).attributes.datetime).toBe("Before");
	tree.setAttribute(id, "datetime", "After");
	expect(owner.querySelector('[datetime="After"]')).toBe(id);
	expect(owner.querySelector('[datetime="Before"]')).toBeNull();
	expect(record(structured(tree).content, tree, id).dateTimeSource).toEqual(
		expected("time", "After"),
	);
	tree.removeAttribute(id, "datetime");
	expect(owner.querySelector("[datetime]")).toBeNull();
	expect(record(structured(tree).content, tree, id)).not.toHaveProperty(
		"dateTimeSource",
	);
	tree.setAttribute(id, "datetime", "");
	expect(record(structured(tree).content, tree, id).dateTimeSource).toEqual(
		expected("time", ""),
	);
	tree.setAttribute(id, "hidden", "");
	expect(sources(structured(tree).content)).toEqual([]);
	tree.removeAttribute(id, "hidden");
	expect(sources(structured(tree).content)).toEqual([expected("time", "")]);
	expect(second?.value).toBe("Before");
});

it("releases document nodes, reader metadata and every query owner on close", () => {
	const tree = load('<time datetime="source-only"></time>');
	const first = query(tree);
	const second = query(tree);
	const id = element(first, "time[datetime]");
	expect(element(second, "[datetime]")).toBe(id);
	const snapshot = structured(tree);
	expect(first.metrics().indexedNodes).toBeGreaterThan(0);
	expect(second.metrics().cachedSelectors).toBeGreaterThan(0);
	tree.close();
	expect(tree.resourceUsage()).toEqual({ nodes: 0, textCodeUnits: 0 });
	expect(researchReaderInfo(tree)).toBeUndefined();
	for (const owner of [first, second]) {
		expect(owner.metrics()).toMatchObject({
			closed: true,
			cachedSelectors: 0,
			indexedNodes: 0,
			candidateIndexedEntries: 0,
		});
		expect(() => owner.querySelector("time")).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
	}
	expect(() => tree.get(id)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(sources(snapshot.content)).toEqual([expected("time", "source-only")]);
	expect(hasResearchExtractionContent(snapshot)).toBe(true);
});

it.each([
	{
		name: "uppercase attribute",
		source: '<TIME DATETIME="raw">Label</TIME>',
		value: "raw",
	},
	{
		name: "duplicate attribute",
		source: '<time datetime="first" DATETIME="second">Label</time>',
		value: "first",
	},
])("matches native parsing of $name", ({ source, value }) => {
	for (const tree of [native(source), load(source)])
		expect(sources(structured(tree).content)).toEqual([
			expected("time", value),
		]);
});

it("does not infer absent datetime from visible date text or ancestors", () => {
	const tree = load(
		'<div datetime="ancestor"><time>2026-09-13</time><ins>Tomorrow</ins><del>Yesterday</del></div>',
	);
	const result = structured(tree);
	expect(sources(result.content)).toEqual([]);
	for (const tag of tags)
		expect(
			record(result.content, tree, element(query(tree), tag)),
		).not.toHaveProperty("dateTimeSource");
	expect(hasResearchExtractionContent(result)).toBe(true);
});

it("retains native HTML time inside an SVG HTML integration point", () => {
	const tree = native(
		'<svg><foreignObject><time datetime="html-source">Label</time></foreignObject></svg>',
	);
	const id = element(query(tree), "time");
	expect(isHtmlElement(tree.get(id), "time")).toBe(true);
	expect(record(structured(tree).content, tree, id).dateTimeSource).toEqual(
		expected("time", "html-source"),
	);
});

it("admits a visibility-restored child without metadata from its invisible parent", () => {
	const tree = native(
		`<time datetime="${"x".repeat(4097)}" style="visibility:hidden"><ins datetime="child" style="visibility:visible">Public</ins></time>`,
	);
	const owner = query(tree);
	const result = structured(tree);
	expect(
		record(result.content, tree, element(owner, "time")),
	).not.toHaveProperty("dateTimeSource");
	expect(sources(result.content)).toEqual([expected("ins", "child")]);
	expect(researchExtractionDiagnosticText(result)).toBe("Public");
});

it("ignores datetime on unrelated native elements even when oversized", () => {
	const value = "x".repeat(4097);
	const tree = native(
		`<div datetime="${value}"><span datetime="${value}">Public</span><p datetime="${value}">Paragraph</p></div>`,
	);
	expect(query(tree).querySelectorAll("[datetime]")).toHaveLength(3);
	expect(sources(structured(tree).content)).toEqual([]);
});
