import { afterEach, describe, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import type { ResearchReaderVisibilityPolicy } from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";

const profiles = ["default", "long-v1"] as const;
const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];
const inlinePolicy = "source-hidden-inline-v1";
const rawPolicy = "separate-omitted-raw-v1";

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function response(source: string): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url: "https://reader.invalid/names",
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected bounded reader failure");
}

describe.each(profiles)("authored reader names in %s", (profile) => {
	function sanitize(
		source: string,
		limits: Partial<ResearchReaderLimits> = {},
		visibilityPolicy: ResearchReaderVisibilityPolicy | undefined = inlinePolicy,
	) {
		return sanitizeResearchHtml(
			source,
			limits,
			undefined,
			profile,
			rawPolicy,
			visibilityPolicy,
		);
	}

	function reader(
		source: string,
		visibilityPolicy: ResearchReaderVisibilityPolicy | undefined = inlinePolicy,
	) {
		const tree = loadResearchDocument(
			response(source),
			{
				tabId: "synthetic-reader-names",
				signal: new AbortController().signal,
				limits: {
					maxNodes: 50_000,
					maxDepth: 128,
					maxTextCodeUnits: 2_000_000,
					maxChanges: 1024,
				},
				initializeDocument: (document) => documents.push(document),
			},
			profile,
			rawPolicy,
			visibilityPolicy,
		);
		const queries = new DocumentQueries(tree);
		queryOwners.push(queries);
		const id = (selector: string) => {
			const found = queries.querySelector(selector);
			if (found === null) throw new Error(`Missing reader node: ${selector}`);
			return found;
		};
		const entry = (selector: string) => {
			const ref = tree.reference(id(selector));
			return snapshotDocument(tree).entries.find((item) => item.ref === ref);
		};
		return { tree, queries, id, entry };
	}

	it("names the existing role node while omitting its hidden child label", () => {
		const source =
			'<div id="chart" role="button" aria-label="Top free"><span aria-hidden="true">Hidden chart label</span></div><p>Visible chart prose.</p>';
		const { tree, queries, id, entry } = reader(source);
		expect(sanitize(source).html).toBe(
			'<div id="chart" role="button" aria-label="Top free"></div><p>Visible chart prose.</p>',
		);
		expect(entry("#chart")).toMatchObject({
			ref: tree.reference(id("#chart")),
			role: "button",
			name: "Top free",
		});
		expect(tree.get(id("#chart")).children).toEqual([]);
		expect(queries.querySelector("button, input, span")).toBeNull();
		expect(
			snapshotDocument(tree).entries.filter((item) => item.role === "button"),
		).toHaveLength(1);
		expect(tree.textContent(tree.root)).toBe("Visible chart prose.");
		expect(researchReaderInfo(tree)).toMatchObject({
			scripting: false,
			styling: false,
			visibilityPolicy: inlinePolicy,
			sourceHiddenSubtrees: 1,
		});
	});

	it.each([
		["first", "Visible first"],
		["missing", "Literal fallback"],
		["hidden", "Literal fallback"],
		["inline-hidden", "Literal fallback"],
		["empty", "Literal fallback"],
		["second missing first", "Visible second Visible first"],
		["hidden first inline-hidden", "Visible first"],
		["\tsecond  first\n", "Visible second Visible first"],
	])("resolves references %j before the literal label", (references, name) => {
		const { tree, id, entry } = reader(
			`<div id="named" role="button" aria-label="Literal fallback" aria-labelledby="${references}">Child fallback</div><span id="first">Visible <b>first</b></span><span id="second">Visible second</span><span id="hidden" aria-hidden="true">Hidden reference</span><span id="inline-hidden" style="display:none">Inline reference</span><span id="empty"></span>`,
		);
		expect(tree.get(id("#named")).attributes["aria-labelledby"]).toBe(
			references,
		);
		expect(entry("#named")).toMatchObject({ role: "button", name });
	});

	it.each([
		['aria-label="Literal name"', "Literal name"],
		['aria-label=""', "Child fallback"],
		['aria-label="  "', ""],
		['aria-labelledby="missing"', "Child fallback"],
		['aria-label="" aria-labelledby=""', "Child fallback"],
	])(
		"keeps existing empty-name and content fallback behavior for %s",
		(attributes, name) => {
			const { entry } = reader(
				`<div id="named" role="button" ${attributes}>Child fallback</div>`,
			);
			expect(entry("#named")).toMatchObject({ role: "button", name });
		},
	);

	it.each(["div", "span", "p", "abbr", "dfn", "main", "h2", "a"])(
		"retains both naming attributes on preserved %s with its own role",
		(tag) => {
			const source = `<${tag} id="named" role="button" aria-label="Literal" aria-labelledby="label">Text</${tag}><span id="label">Referenced</span>`;
			expect(sanitize(source).html).toBe(source);
			const { tree, id, entry } = reader(source);
			expect(tree.get(id("#named"))).toMatchObject({
				tagName: tag,
				attributes: {
					role: "button",
					"aria-label": "Literal",
					"aria-labelledby": "label",
				},
			});
			expect(entry("#named")).toMatchObject({
				role: "button",
				name: "Referenced",
			});
		},
	);

	it.each(["", ' role=""', ' role=" \t\n "'])(
		"does not use a missing or blank own role %j to retain names",
		(role) => {
			const source = `<div role="button"><span id="passive"${role} aria-label="Dropped literal" aria-labelledby="label">Visible</span></div>`;
			expect(sanitize(source).html).toBe(
				`<div role="button"><span id="passive"${role}>Visible</span></div>`,
			);
			const { tree, id, entry } = reader(source);
			expect(tree.get(id("#passive")).attributes).not.toHaveProperty(
				"aria-label",
			);
			expect(tree.get(id("#passive")).attributes).not.toHaveProperty(
				"aria-labelledby",
			);
			expect(entry("#passive")).toBeUndefined();
		},
	);

	it.each(["div", "span", "p", "abbr", "dfn", "h2", "main", "img"])(
		"does not add naming metadata to passive non-anchor %s without a role",
		(tag) => {
			const { tree, id } = reader(
				`<${tag} id="passive" aria-label="Dropped" aria-labelledby="label">`,
			);
			expect(tree.get(id("#passive")).attributes).toEqual({ id: "passive" });
		},
	);

	it.each([
		["unknown", undefined],
		["BUTTON", undefined],
		["none", undefined],
		["presentation", undefined],
		["unknown button", "button"],
		["\tunknown  button\nlink ", "button"],
		["link button", "link"],
	])(
		"retains literal role %j without changing snapshot role resolution",
		(role, expectedRole) => {
			const source = `<div id="named" role="${role}" aria-label="Authored" aria-labelledby="missing">Visible</div>`;
			expect(sanitize(source).html).toBe(source);
			const { tree, id, entry } = reader(source);
			expect(tree.get(id("#named")).attributes).toEqual({
				id: "named",
				role,
				"aria-label": "Authored",
				"aria-labelledby": "missing",
			});
			if (expectedRole === undefined) expect(entry("#named")).toBeUndefined();
			else
				expect(entry("#named")).toMatchObject({
					role: expectedRole,
					name: "Authored",
				});
		},
	);

	it("preserves legacy anchor labels and new references without inventing links", () => {
		const { tree, id, entry } = reader(
			'<a id="legacy" href="/legacy" aria-label="Legacy label">Link text</a><a id="referenced" href="/next" role="" aria-label="Fallback" aria-labelledby="label">Next</a><a id="inert" aria-label="Inert label" aria-labelledby="label">Passive</a><span id="label">Referenced link</span>',
		);
		expect(entry("#legacy")).toMatchObject({
			role: "link",
			name: "Legacy label",
		});
		expect(entry("#referenced")).toMatchObject({
			role: "link",
			name: "Referenced link",
		});
		expect(tree.get(id("#inert")).attributes).toEqual({
			id: "inert",
			"aria-label": "Inert label",
			"aria-labelledby": "label",
		});
		expect(entry("#inert")).toBeUndefined();
	});

	it.each(["button", "x-widget", "label", "form", "details", "summary"])(
		"does not transfer names or roles from unwrapped/replaced %s",
		(tag) => {
			const source = `<${tag} id="original" role="button" aria-label="Dropped" aria-labelledby="label"><em>Visible</em></${tag}>`;
			const baseline = `<${tag} id="original"><em>Visible</em></${tag}>`;
			expect(sanitize(source).html).toBe(sanitize(baseline).html);
			const { tree, queries, id } = reader(source);
			expect(tree.get(id("#original")).attributes).toEqual({ id: "original" });
			expect(
				queries.querySelector("[role], [aria-label], [aria-labelledby]"),
			).toBeNull();
			expect(tree.textContent(tree.root)).toBe("Visible");
			expect(
				snapshotDocument(tree).entries.some((item) => item.role === "button"),
			).toBe(false);
		},
	);

	it.each([
		"script",
		"style",
		"iframe",
		"noembed",
		"noframes",
		"template",
		"svg",
	])(
		"does not restore roles or descendant names from omitted %s subtrees",
		(tag) => {
			const source = `<${tag} id="omitted" role="button" aria-label="Omitted name" aria-labelledby="label">Omitted text</${tag}><p>Kept</p>`;
			const annotation =
				tag === "svg" ? "SVG source aria-label: Omitted name" : "";
			expect(sanitize(source).html).toBe(
				`${annotation ? `<code>${annotation}</code>` : ""}<p>Kept</p>`,
			);
			const { tree, queries } = reader(source);
			expect(
				queries.querySelector("#omitted, [aria-label], [aria-labelledby]"),
			).toBeNull();
			expect(tree.textContent(tree.root)).toBe(`${annotation}Kept`);
			expect(
				snapshotDocument(tree).entries.some((item) => item.role === "button"),
			).toBe(false);
		},
	);

	it("keeps xmp literal text without transferring its role or name", () => {
		const source =
			'<xmp id="literal" role="button" aria-label="Dropped" aria-labelledby="label">Literal text</xmp>';
		expect(sanitize(source).html).toBe('<pre id="literal">Literal text</pre>');
		const { tree, queries } = reader(source);
		expect(
			queries.querySelector("[role], [aria-label], [aria-labelledby]"),
		).toBeNull();
		expect(tree.textContent(tree.root)).toBe("Literal text");
	});

	it.each(["hidden", 'aria-hidden="true"', 'style="display:none"'])(
		"omits the named node itself when source-hidden via %s",
		(hidden) => {
			const source = `<div id="omitted" role="button" aria-label="Omitted name" aria-labelledby="label" ${hidden}><span role="button" aria-label="Nested name">Omitted text</span></div><p>Kept</p>`;
			expect(sanitize(source).html).toBe("<p>Kept</p>");
			const { tree, queries } = reader(source);
			expect(
				queries.querySelector(
					"#omitted, [role], [aria-label], [aria-labelledby]",
				),
			).toBeNull();
			expect(tree.textContent(tree.root)).toBe("Kept");
		},
	);

	it("keeps visibility policy selection independent of naming preservation", () => {
		const source =
			'<div role="button" aria-label="Authored" style="display:none">Visible in legacy</div>';
		expect(
			sanitizeResearchHtml(source, {}, undefined, profile, rawPolicy).html,
		).toBe('<div role="button" aria-label="Authored">Visible in legacy</div>');
		expect(sanitize(source, {}, "source-hidden-v1").html).toBe(
			'<div role="button" aria-label="Authored">Visible in legacy</div>',
		);
		expect(sanitize(source).html).toBe("");
	});

	it("round-trips escaped labels and reference IDs without active metadata", () => {
		const source =
			'<div id="named" role="button" aria-label="Literal &quot; &amp; &lt;tag&gt;" aria-labelledby="ref&amp;&quot;&lt;" onclick="ignored" style="color:red" src="/never" data-extra="drop" aria-describedby="drop" aria-owns="drop">Child</div><span id="ref&amp;&quot;&lt;">Named &quot; &amp; &lt;tag&gt;</span>';
		const { tree, queries, id, entry } = reader(source);
		expect(tree.get(id("#named")).attributes).toEqual({
			id: "named",
			role: "button",
			"aria-label": 'Literal " & <tag>',
			"aria-labelledby": 'ref&"<',
		});
		expect(entry("#named")).toMatchObject({ name: 'Named " & <tag>' });
		expect(
			queries.querySelector(
				"[onclick], [style], [src], [data-extra], [aria-describedby], [aria-owns], tag",
			),
		).toBeNull();
		expect(sanitize(source).report.ignoredAttributes).toBe(6);
		expect(sanitize(source).html).toContain(
			'aria-label="Literal &quot; &amp; &lt;tag&gt;"',
		);
		expect(sanitize(source).html).toContain(
			'aria-labelledby="ref&amp;&quot;&lt;"',
		);
	});

	it.each(["a", "div"])(
		"bounds both names independently on %s in UTF-16 units",
		(tag) => {
			const exact = "😀".repeat(4096);
			const oversized = `${exact}x`;
			expect(exact.length).toBe(8192);
			for (const [label, references, keptLabel, keptReferences] of [
				[exact, exact, true, true],
				[oversized, exact, false, true],
				[exact, oversized, true, false],
				[oversized, oversized, false, false],
				["", "", true, true],
				[" \t ", " \t ", true, true],
			] as const) {
				const role = tag === "div" ? ' role="button"' : "";
				const source = `<${tag} id="named"${role} aria-label="${label}" aria-labelledby="${references}">Text</${tag}>`;
				const { tree, id } = reader(source);
				expect(tree.get(id("#named")).attributes).toEqual({
					id: "named",
					...(tag === "div" ? { role: "button" } : {}),
					...(keptLabel ? { "aria-label": label } : {}),
					...(keptReferences ? { "aria-labelledby": references } : {}),
				});
				expect(sanitize(source).report.ignoredAttributes).toBe(
					Number(!keptLabel) + Number(!keptReferences),
				);
			}
		},
	);

	it.each(["aria-label", "aria-labelledby"])(
		"bounds decoded %s rather than its escaped HTML representation",
		(attribute) => {
			const source = `<div role="button" ${attribute}="${"&amp;".repeat(8192)}"></div>`;
			const { tree, id } = reader(source);
			expect(sanitize(source).html).toBe(source);
			expect(tree.get(id("div")).attributes[attribute]).toBe("&".repeat(8192));
		},
	);

	it.each(["table", "rowgroup", "row", "cell", "columnheader", "rowheader"])(
		"leaves the existing ARIA-table %s retention exception unchanged",
		(role) => {
			const oversized = "x".repeat(8193);
			const source = `<div role="${role}" aria-label="${oversized}" aria-labelledby="${oversized}" aria-describedby="description" aria-owns="owned">Text</div>`;
			expect(sanitize(source).html).toBe(source);
			expect(sanitize(source).report.ignoredAttributes).toBe(0);
			const { tree, id } = reader(source);
			expect(tree.get(id("div")).attributes).toEqual({
				role,
				"aria-label": oversized,
				"aria-labelledby": oversized,
				"aria-describedby": "description",
				"aria-owns": "owned",
			});
		},
	);

	it("keeps Markdown and visible text unchanged without inventing naming prose", () => {
		const content =
			'<span id="label">Visible reference</span><p>Ordinary <em>prose</em>.</p>';
		const named = reader(
			`<div role="button" aria-label="Metadata only" aria-labelledby="missing">Visible control</div><a href="/next" aria-label="Link metadata only">Visible link</a>${content}`,
		);
		const baseline = reader(
			`<div role="button">Visible control</div><a href="/next">Visible link</a>${content}`,
		);
		const markdown = extractDocument(named.tree, {
			format: "markdown",
		}).content;
		expect(markdown).toBe(
			extractDocument(baseline.tree, { format: "markdown" }).content,
		);
		expect(markdown).toContain("Visible control");
		expect(markdown).toContain("Visible link");
		expect(markdown).not.toContain("Metadata only");
		expect(markdown).not.toContain("Link metadata only");
		expect(named.tree.textContent(named.tree.root)).toBe(
			baseline.tree.textContent(baseline.tree.root),
		);
		expect(named.tree.textContent(named.tree.root)).not.toContain(
			"Metadata only",
		);
		expect(named.entry("div")).toMatchObject({
			role: "button",
			name: "Metadata only",
		});
	});

	it.each(["aria-label", "aria-labelledby"])(
		"charges retained and escaped %s to source/output budgets",
		(attribute) => {
			const source = `<div role="button" ${attribute}='${'"'.repeat(200)}'>Text</div>`;
			const result = sanitize(source);
			expect(result.report.sourceCodeUnits).toBe(source.length);
			expect(result.report.outputCodeUnits).toBe(result.html.length);
			expect(result.html.length).toBeGreaterThan(source.length);
			expect(
				sanitize(source, {
					maxSourceCodeUnits: source.length,
					maxOutputCodeUnits: result.html.length,
				}).html,
			).toBe(result.html);
			for (const [limits, kind, observed] of [
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
				const error = failure(() => sanitize(source, limits));
				expect(error).toMatchObject({ code: "resource-limit" });
				expect(resourceLimitDiagnostic(error)).toEqual({
					kind,
					unit: "code-units",
					limit: observed - 1,
					observed,
				});
			}
		},
	);

	it("does not expose retained names through a closed document", () => {
		const { tree, queries, id, entry } = reader(
			'<div id="named" role="button" aria-label="Authored">Text</div>',
		);
		const ref = tree.reference(id("#named"));
		expect(entry("#named")).toMatchObject({ name: "Authored" });
		queries.close();
		tree.close();
		expect(queries.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
		expect(tree.nodeCount).toBe(0);
		expect(researchReaderInfo(tree)).toBeUndefined();
		expect(() => snapshotDocument(tree)).toThrow("closed");
		expect(() => snapshotDocument(tree, { root: ref })).toThrow("closed");
	});
});
