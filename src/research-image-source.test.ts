import { afterEach, describe, expect, it } from "vitest";
import {
	hasResearchExtractionContent,
	researchExtractionDiagnosticText,
} from "../scripts/research-content.js";
import type { DocumentTree } from "./document.js";
import {
	type ExtractedNode,
	type ExtractionOptions,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { ImageSourceMetadata } from "./image-source.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

interface ReaderMode {
	name: string;
	profile?: "long-v1";
	rawPolicy?: "separate-omitted-raw-v1";
}

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
const url = "https://image-source.fixture.invalid/article";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const owners: DocumentQueries[] = [];
const limits = {
	maxNodes: 4096,
	maxDepth: 128,
	maxTextCodeUnits: 200_000,
	maxChanges: 1024,
};
const warningTitle = "Experimental. Expect behavior to change in the future.";
const warning = `<span role="img" aria-label="Experimental" title="${warningTitle}"></span>`;
const warningMarkdown =
	'\\[Image source: aria\\-label="Experimental"; title="Experimental\\. Expect behavior to change in the future\\."\\]';

afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
});

function native(source: string) {
	const tree = parseHtmlDocument(source, url, { limits });
	trees.push(tree);
	return tree;
}

function load(source: string, mode: ReaderMode) {
	const body = encoder.encode(source);
	return loadResearchDocument(
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
			tabId: "synthetic-image-source",
			signal: new AbortController().signal,
			limits,
			initializeDocument: (tree) => trees.push(tree),
		},
		mode.profile,
		mode.rawPolicy,
		"source-hidden-inline-v1",
	);
}

function sanitize(
	source: string,
	mode: ReaderMode,
	readerLimits: Partial<ResearchReaderLimits> = {},
) {
	return sanitizeResearchHtml(
		source,
		readerLimits,
		undefined,
		mode.profile,
		mode.rawPolicy,
		"source-hidden-inline-v1",
	);
}

function element(tree: DocumentTree, selector: string) {
	const owner = new DocumentQueries(tree);
	owners.push(owner);
	const id = owner.querySelector(selector);
	if (id === null) throw new Error(`Missing image-source fixture: ${selector}`);
	return id;
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function structured(tree: DocumentTree, options: ExtractionOptions = {}) {
	const result = extractDocument(tree, { ...options, format: "json" });
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	return result;
}

function markdown(tree: DocumentTree, options: ExtractionOptions = {}) {
	const result = extractDocument(tree, { ...options, format: "markdown" });
	if (result.format !== "markdown")
		throw new Error("Expected Markdown extraction");
	return result;
}

function sources(root: ExtractedNode) {
	return flattened(root).flatMap((node) =>
		node.imageSource === undefined ? [] : [node.imageSource],
	);
}

function expected(
	attributes: ImageSourceMetadata["attributes"],
): ImageSourceMetadata {
	return { kind: "native-image-source-v1", role: "img", attributes };
}

function originalContent(root: ExtractedNode) {
	return JSON.parse(
		JSON.stringify(root, (key, value) =>
			key === "ref" || key === "imageSource" ? undefined : value,
		),
	);
}

function domSnapshot(tree: DocumentTree) {
	const nodes = [];
	const pending = [tree.root];
	while (pending.length) {
		const id = pending.pop();
		if (id === undefined) break;
		const node = tree.get(id);
		nodes.push(node);
		pending.push(...node.children);
	}
	return JSON.stringify({ revision: tree.revision, nodes });
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected image-source resource limit");
}

describe.each(readerModes)("image-source reader: $name", (mode) => {
	it("recovers both empty MDN warning spans without replacing ordinary content", () => {
		const source = `<main><h1>Reference</h1><p>First ${warning} feature.</p><p>Second ${warning} feature.</p><pre><code>const value = 1 &lt; 2;</code></pre></main>`;
		const tree = load(source, mode);
		const baseline = load(source.replaceAll(warning, "<span></span>"), mode);
		const snapshot = domSnapshot(tree);
		const result = structured(tree);
		expect(sources(result.content)).toEqual([
			expected({ "aria-label": "Experimental", title: warningTitle }),
			expected({ "aria-label": "Experimental", title: warningTitle }),
		]);
		const warnings = flattened(result.content).filter(
			(node) => node.imageSource !== undefined,
		);
		for (const node of warnings) {
			expect(node.type).toBe("inline");
			expect(node.children).toEqual([]);
			expect(node).not.toHaveProperty("text");
		}
		const content = markdown(tree).content;
		expect(content.split(warningMarkdown)).toHaveLength(3);
		expect(content.replaceAll(warningMarkdown, "").replace(/ +/g, " ")).toBe(
			markdown(baseline).content.replace(/ +/g, " "),
		);
		expect(content).toContain("```\nconst value = 1 < 2;\n```");
		expect(originalContent(result.content)).toEqual(
			originalContent(structured(baseline).content),
		);
		expect(tree.textContent(tree.root)).toBe(
			baseline.textContent(baseline.root),
		);
		expect(domSnapshot(tree)).toBe(snapshot);
	});

	it.each(["img", " \timg\r\n\f"])(
		"retains title only for the exact matching role %j",
		(role) => {
			const source = `<span role="${role}" aria-label="Label" title="Qualification" data-extra="ignored">Text</span>`;
			const result = sanitize(source, mode);
			expect(result.html).toContain('title="Qualification"');
			expect(result.report.ignoredAttributes).toBe(1);
			const tree = load(source, mode);
			expect(tree.get(element(tree, "span")).attributes.title).toBe(
				"Qualification",
			);
			expect(sources(structured(tree).content)).toEqual([
				expected({ "aria-label": "Label", title: "Qualification" }),
			]);
		},
	);

	it.each([undefined, "IMG", "image", "img button", "button img", "\u00a0img"])(
		"does not broaden title retention for role %j",
		(role) => {
			const source = `<span${role === undefined ? "" : ` role="${role}"`} title="Not retained">Text</span>`;
			const result = sanitize(source, mode);
			expect(result.html).not.toContain("title=");
			expect(result.report.ignoredAttributes).toBe(1);
			expect(sources(structured(load(source, mode)).content)).toEqual([]);
		},
	);

	it("preserves the existing anchor-title exception without annotating it", () => {
		const source = '<a href="/next" title="Existing title">Next</a>';
		expect(sanitize(source, mode).html).toBe(source);
		expect(sanitize(source, mode).report.ignoredAttributes).toBe(0);
		const tree = load(source, mode);
		expect(sources(structured(tree).content)).toEqual([]);
		expect(markdown(tree).content).not.toContain("Existing title");
	});

	it("does not transfer image titles from replaced or unwrapped elements", () => {
		const source =
			'<form role="img" title="Form source"><button role="img" title="Button source">Public</button></form>';
		const sanitized = sanitize(source, mode);
		expect(sanitized.html).not.toContain("title=");
		const tree = load(source, mode);
		expect(sources(structured(tree).content)).toEqual([]);
		expect(markdown(tree).content).toContain("Public");
	});

	it("bounds decoded selected attributes and counts oversized omissions", () => {
		for (const length of [8192, 8193]) {
			const source = `<span role="img" aria-label="${"&amp;".repeat(length)}" title="${"&amp;".repeat(length)}"></span>`;
			const sanitized = sanitize(source, mode);
			const tree = load(source, mode);
			const attributes = tree.get(element(tree, "span")).attributes;
			if (length === 8192) {
				expect(attributes["aria-label"]).toBe("&".repeat(length));
				expect(attributes.title).toBe("&".repeat(length));
				expect(sanitized.report.ignoredAttributes).toBe(0);
				expect(sources(structured(tree).content)).toEqual([
					expected({
						"aria-label": "&".repeat(length),
						title: "&".repeat(length),
					}),
				]);
			} else {
				expect(attributes).not.toHaveProperty("aria-label");
				expect(attributes).not.toHaveProperty("title");
				expect(sanitized.report.ignoredAttributes).toBe(2);
				expect(sources(structured(tree).content)).toEqual([]);
			}
		}
	});

	it("charges newly retained escaped titles to source and output budgets", () => {
		const source = `<span role="img" title='${'"'.repeat(200)}'>Text</span>`;
		const result = sanitize(source, mode);
		expect(result.report.sourceCodeUnits).toBe(source.length);
		expect(result.report.outputCodeUnits).toBe(result.html.length);
		expect(result.html.length).toBeGreaterThan(source.length);
		expect(
			sanitize(source, mode, {
				maxSourceCodeUnits: source.length,
				maxOutputCodeUnits: result.html.length,
			}).html,
		).toBe(result.html);
		for (const [readerLimits, kind, observed] of [
			[
				{ maxSourceCodeUnits: source.length - 1 },
				"reader.source",
				source.length,
			],
			[
				{ maxOutputCodeUnits: result.html.length - 1 },
				"reader.output",
				result.html.length,
			],
		] as const) {
			const error = failure(() => sanitize(source, mode, readerLimits));
			expect(error).toMatchObject({ code: "resource-limit" });
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind,
				unit: "code-units",
				limit: observed - 1,
				observed,
			});
		}
	});

	it("leaves hidden, omitted, template and foreign source exclusions intact", () => {
		const source = `<main><p>Public</p><span hidden role="img" title="Hidden"></span><span aria-hidden="true" role="img" title="Aria hidden"></span><span style="display:none" role="img" title="Inline hidden"></span><template>${warning}</template><script role="img" title="Script">ignored</script><iframe role="img" title="Frame"></iframe><svg role="img" aria-label="SVG" title="Foreign"><g role="img" title="Group"></g></svg><math role="img" title="Math"></math>${warning}</main>`;
		const tree = load(source, mode);
		expect(sources(structured(tree).content)).toEqual([
			expected({ "aria-label": "Experimental", title: warningTitle }),
		]);
		const content = markdown(tree).content;
		expect(content).toContain("Public");
		expect(content.split(warningMarkdown)).toHaveLength(2);
		for (const excluded of [
			"Hidden",
			"Aria hidden",
			"Inline hidden",
			"Script",
			"Frame",
			"Foreign",
			"Group",
			"Math",
		])
			expect(content).not.toContain(excluded);
	});
});

it("adds a whitelist snapshot without replacing text, children, types or DOM", () => {
	const source =
		'<main><p role="img" aria-label="Literal label" title="Raw title" aria-labelledby="reference" data-extra="ignored">Before <strong>child</strong> after.</p><span id="reference">Referenced label</span></main>';
	const tree = native(source);
	const baseline = native(source.replace(' role="img"', ""));
	const snapshot = domSnapshot(tree);
	const result = structured(tree);
	const metadata = sources(result.content);
	expect(metadata).toEqual([
		expected({ "aria-label": "Literal label", title: "Raw title" }),
	]);
	expect(Object.isFrozen(metadata[0])).toBe(true);
	expect(Object.isFrozen(metadata[0].attributes)).toBe(true);
	expect(originalContent(result.content)).toEqual(
		originalContent(structured(baseline).content),
	);
	const content = markdown(tree).content;
	expect(content).toContain(
		'\\[Image source: aria\\-label="Literal label"; title="Raw title"\\]',
	);
	expect(content).toContain("Before child after\\.");
	expect(content).not.toContain('aria\\-label="Referenced label"');
	expect(content).not.toContain("data-extra");
	expect(tree.textContent(tree.root)).toBe(baseline.textContent(baseline.root));
	expect(domSnapshot(tree)).toBe(snapshot);
});

it.each([
	{
		attributes: 'aria-label="" title="Title only"',
		expected: { "aria-label": "", title: "Title only" },
	},
	{
		attributes: 'aria-label="Label only" title=" \t "',
		expected: { "aria-label": "Label only", title: " \t " },
	},
	{ attributes: 'title="Title only"', expected: { title: "Title only" } },
	{
		attributes: 'aria-label="Label only"',
		expected: { "aria-label": "Label only" },
	},
])("keeps provided blank companion fields: $attributes", (fixture) => {
	const tree = native(`<span role="img" ${fixture.attributes}></span>`);
	expect(sources(structured(tree).content)).toEqual([
		expected(fixture.expected),
	]);
	expect(hasResearchExtractionContent(structured(tree))).toBe(true);
	expect(hasResearchExtractionContent(markdown(tree))).toBe(true);
});

it.each(["", 'aria-label="" title=" \t "', 'aria-labelledby="reference"'])(
	"does not invent source content from absent or blank fields: %s",
	(attributes) => {
		const tree = native(`<span role="img" ${attributes}></span>`);
		const result = structured(tree);
		expect(sources(result.content)).toEqual([]);
		expect(hasResearchExtractionContent(result)).toBe(false);
		expect(hasResearchExtractionContent(markdown(tree))).toBe(false);
		expect(researchExtractionDiagnosticText(result)).toBe("");
	},
);

it("keeps raw JSON values while cleaning and escaping Markdown source prose", () => {
	const tree = native(
		'<span role="img" aria-label="A&amp;&lt;*[x]&#13;&#10;&#9;&#1;&#x202e;" title="&quot;quoted&quot;"></span>',
	);
	expect(sources(structured(tree).content)).toEqual([
		expected({ "aria-label": "A&<*[x]\r\n\t\u0001\u202e", title: '"quoted"' }),
	]);
	const content = markdown(tree).content;
	expect(content).toContain("A&amp;&lt;\\*\\[x\\]");
	expect(content).toContain("\\\\n\\\\t");
	expect(content).toContain("u\\{1\\}");
	expect(content).toContain("u\\{202e\\}");
	expect(content).not.toContain("\r");
	expect(content).not.toContain("\u0001");
	expect(content).not.toContain("\u202e");
});

it("excludes native hidden and foreign sources, including directly selected roots", () => {
	const tree = native(
		'<main><span id="hidden" hidden role="img" title="Hidden"></span><span id="invisible" style="visibility:hidden" role="img" title="Invisible"></span><template id="template" role="img" title="Template"></template><svg id="foreign" role="img" title="Foreign"></svg><p>Public</p></main>',
	);
	expect(sources(structured(tree).content)).toEqual([]);
	for (const selector of ["#hidden", "#invisible", "#template", "#foreign"]) {
		const root = tree.reference(element(tree, selector));
		expect(sources(structured(tree, { root }).content)).toEqual([]);
		expect(markdown(tree, { root }).content).not.toContain("Image source");
	}
});

it("annotates selected content but not heading-section context or excluded siblings", () => {
	const tree = native(
		'<main><div id="context" role="img" title="Context"><p>Excluded prefix</p><h2 id="start" role="img" title="Heading">Start</h2><p id="included" role="img" title="Included">Kept</p></div><h2>Stop</h2><span role="img" title="Excluded"></span></main>',
	);
	const section = tree.reference(element(tree, "#start"));
	const result = structured(tree, { section });
	expect(sources(result.content)).toEqual([
		expected({ title: "Heading" }),
		expected({ title: "Included" }),
	]);
	const contextRef = tree.reference(element(tree, "#context"));
	const context = flattened(result.content).find(
		(node) => node.ref === contextRef,
	);
	expect(context).toMatchObject({ type: "container" });
	expect(context).not.toHaveProperty("imageSource");
	const content = markdown(tree, { section }).content;
	expect(content).toContain('title="Heading"');
	expect(content).toContain('title="Included"');
	expect(content).not.toContain("Context");
	expect(content).not.toContain("Excluded");
	const root = tree.reference(element(tree, "#included"));
	expect(sources(structured(tree, { root }).content)).toEqual([
		expected({ title: "Included" }),
	]);
	expect(markdown(tree, { root }).content).toContain('title="Included"');
});

it("keeps annotations and labels in nested lists and links", () => {
	const tree = native(
		'<ul><li role="img" title="Outer">First <a href="/next" role="img" title="Link">Next <span role="img" title="Inline">label</span></a><ul><li role="img" title="Inner">Second</li></ul></li></ul>',
	);
	expect(sources(structured(tree).content)).toEqual([
		expected({ title: "Outer" }),
		expected({ title: "Link" }),
		expected({ title: "Inline" }),
		expected({ title: "Inner" }),
	]);
	const content = markdown(tree).content;
	for (const title of ["Outer", "Link", "Inline", "Inner"])
		expect(content.split(`title="${title}"`)).toHaveLength(2);
	expect(content).toContain("- ");
	expect(content).toContain("First");
	expect(content).toContain("Next");
	expect(content).toContain("label");
	expect(content).toContain("Second");
	expect(content).toContain(`](<${new URL("/next", url).href}>)`);
	expect(content.indexOf('title="Outer"')).toBeLessThan(
		content.indexOf("First"),
	);
	expect(content.indexOf('title="Inner"')).toBeLessThan(
		content.indexOf("Second"),
	);
});

it.each(["div", "p", "h2", "blockquote", "ul"])(
	"emits block-level %s source annotations before original content",
	(tag) => {
		const child = tag === "ul" ? "<li>Original</li>" : "Original";
		const tree = native(`<${tag} role="img" title="Block">${child}</${tag}>`);
		const content = markdown(tree).content;
		expect(content).toContain('\\[Image source: title="Block"\\]');
		expect(content.indexOf('title="Block"')).toBeLessThan(
			content.indexOf("Original"),
		);
		expect(sources(structured(tree).content)).toEqual([
			expected({ title: "Block" }),
		]);
	},
);

it.each([
	{ tag: "img", type: "image", attributes: ' alt="Original label"' },
	{ tag: "br", type: "break", attributes: "" },
	{ tag: "hr", type: "separator", attributes: "" },
])(
	"retains leaf $tag type and text alongside its source annotation",
	(fixture) => {
		const source = `<${fixture.tag} role="img" title="Leaf"${fixture.attributes}>`;
		const tree = native(source);
		const baseline = native(source.replace(' role="img"', ""));
		const result = structured(tree);
		const node = flattened(result.content).find(
			(entry) => entry.imageSource !== undefined,
		);
		expect(node).toMatchObject({
			type: fixture.type,
			imageSource: expected({ title: "Leaf" }),
		});
		expect(originalContent(result.content)).toEqual(
			originalContent(structured(baseline).content),
		);
		const content = markdown(tree).content;
		expect(content).toContain('\\[Image source: title="Leaf"\\]');
		if (fixture.tag === "img") {
			expect(node?.text).toBe("Original label");
			expect(content.indexOf('title="Leaf"')).toBeLessThan(
				content.indexOf("Original label"),
			);
		}
	},
);

it.each(["tbody", "tr", "td", "span"])(
	"preserves %s annotations and labels, falling back from compact rows when needed",
	(tag) => {
		const source =
			"<table><tbody><tr><td><span>Cell label</span></td></tr></tbody></table>";
		const tree = native(
			source.replace(`<${tag}>`, `<${tag} role="img" title="Table source">`),
		);
		for (const compactTables of [false, true]) {
			const content = markdown(tree, {
				tableRows: true,
				compactTables,
			}).content;
			expect(content.split('title="Table source"')).toHaveLength(2);
			expect(content.split("Cell label")).toHaveLength(2);
			if (tag !== "span") {
				expect(content).toContain("Native row begin");
				expect(content).toContain("Native cell begin");
				expect(content).not.toContain("- Row 1");
			}
		}
		expect(sources(structured(tree).content)).toEqual([
			expected({ title: "Table source" }),
		]);
	},
);

it("preserves literal pre/code strings while retaining nested source metadata in JSON", () => {
	const source =
		'<main><pre><code>const value = <span role="img" title="Pre source">1 &lt; 2;</span>\n  next();</code></pre><p>Inline <code>call(<span role="img" title="Code source">value</span>)</code>.</p></main>';
	const tree = native(source);
	const baseline = native(source.replaceAll(' role="img"', ""));
	expect(sources(structured(tree).content)).toEqual([
		expected({ title: "Pre source" }),
		expected({ title: "Code source" }),
	]);
	expect(markdown(tree).content).toBe(markdown(baseline).content);
	expect(markdown(tree).content).toContain("const value = 1 < 2;\n  next();");
	expect(originalContent(structured(tree).content)).toEqual(
		originalContent(structured(baseline).content),
	);
});

it("emits one annotation for a directly selected inline wrapper with block content", () => {
	const tree = native(
		'<div id="target" style="display:inline" role="img" title="Once"><p>Original</p></div>',
	);
	const result = markdown(tree, {
		root: tree.reference(element(tree, "#target")),
	});
	expect(result.content.split('title="Once"')).toHaveLength(2);
	expect(result.content.split("Original")).toHaveLength(2);
	expect(result.content.indexOf('title="Once"')).toBeLessThan(
		result.content.indexOf("Original"),
	);
});

it("does not insert source annotations into pre text flattened through an inline wrapper", () => {
	const source =
		'<div style="display:inline"><pre>before <span role="img" title="Not code">after</span></pre></div>';
	const tree = native(source);
	const baseline = native(source.replace(' role="img"', ""));
	expect(sources(structured(tree).content)).toEqual([
		expected({ title: "Not code" }),
	]);
	expect(markdown(tree).content).toBe(markdown(baseline).content);
	expect(markdown(tree).content).toBe("before after\n");
});

describe.each(readerModes)("image-role anchor title bounds: $name", (mode) => {
	it.each([8192, 8193])("handles a %i-unit image anchor title", (length) => {
		const title = "x".repeat(length);
		const source = `<a href="/next" role="img" aria-label="Warning" title="${title}">Next</a>`;
		const sanitized = sanitize(source, mode);
		expect(sanitized.report.ignoredAttributes).toBe(length > 8192 ? 1 : 0);
		const tree = load(source, mode);
		const attributes = tree.get(element(tree, "a")).attributes;
		expect(attributes.title).toBe(length > 8192 ? undefined : title);
		expect(sources(structured(tree).content)).toEqual([
			expected({
				"aria-label": "Warning",
				...(length <= 8192 ? { title } : {}),
			}),
		]);
		const content = markdown(tree).content;
		expect(content).toContain("Next");
		expect(content).toContain('aria\\-label="Warning"');
		expect(content).toContain(`](<${new URL("/next", url).href}>)`);
	});
});

it("treats metadata-only annotations as image content and retains challenge diagnostic text", () => {
	const tree = native(
		'<span role="img" aria-label="Verify you are human" title="Enable JavaScript"></span>',
	);
	for (const result of [structured(tree), markdown(tree)]) {
		expect(hasResearchExtractionContent(result)).toBe(true);
		const diagnostic = researchExtractionDiagnosticText(result);
		expect(diagnostic).toContain("Image source:");
		expect(diagnostic).toContain("Verify you are human");
		expect(diagnostic).toContain("Enable JavaScript");
	}
	expect(tree.textContent(tree.root)).toBe("");
});

it.each(["aria-label", "title"])(
	"rejects oversized native %s without clipping or mutating the DOM",
	(attribute) => {
		const tree = native(
			`<span role="img" ${attribute}="${"x".repeat(8193)}"></span>`,
		);
		const snapshot = domSnapshot(tree);
		for (const format of ["json", "markdown"] as const)
			expect(failure(() => extractDocument(tree, { format }))).toMatchObject({
				code: "resource-limit",
			});
		expect(domSnapshot(tree)).toBe(snapshot);
	},
);

it.each(["json", "markdown"] as const)(
	"charges source annotations at the exact serialized %s byte boundary",
	(format) => {
		const tree = native(
			'<span role="img" aria-label="😀&quot;&#13;é" title="A source warning long enough to exercise the minimum extraction byte budget."></span>',
		);
		const result = extractDocument(tree, { format });
		const bytes = encoder.encode(JSON.stringify(result)).byteLength;
		expect(bytes).toBeGreaterThanOrEqual(256);
		expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(result);
		const error = failure(() =>
			extractDocument(tree, { format, maxBytes: bytes - 1 }),
		);
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toMatchObject({
			kind: "extraction.output",
			limit: bytes - 1,
			observed: bytes,
		});
		if (result.format === "json") {
			const without = JSON.stringify(result, (key, value) =>
				key === "imageSource" ? undefined : value,
			);
			expect(bytes).toBeGreaterThan(encoder.encode(without).byteLength);
		}
	},
);

it("includes annotations in bounded text prefixes without changing literal code", () => {
	const tree = native(
		`<main><span role="img" aria-label="Experimental" title="Qualification"></span><pre><code>literal <span role="img" title="Never inserted">code</span></code></pre><p>${"Readable tail 😀. ".repeat(2000)}</p></main>`,
	);
	const maxBytes = 2048;
	const error = failure(() => markdown(tree, { maxBytes }));
	expect(error).toMatchObject({ code: "resource-limit" });
	const result = markdown(tree, {
		maxBytes,
		outputLimitPolicy: "text-prefix-v1",
	});
	expect(result.contentFallback).toMatchObject({
		policy: "text-prefix-v1",
		representation: "indented-plain-text",
		truncated: true,
		trigger: resourceLimitDiagnostic(error),
	});
	expect(result.content).toContain(
		'[Image source: aria-label="Experimental"; title="Qualification"]',
	);
	expect(result.content).toContain("literal code");
	expect(result.content).not.toContain("Never inserted");
	expect(result.content).toContain("Readable tail");
	expect(encoder.encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(
		maxBytes,
	);
	expect(hasResearchExtractionContent(result)).toBe(true);
});
