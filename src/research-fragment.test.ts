import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type ResearchFragmentIdentity,
	researchFragmentReport,
} from "../scripts/research-fragment.js";
import { selectDocumentFragmentTarget } from "./document-url.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

const baseUrl = "https://example.com/document";
const semantics = "native-dom-target-no-scroll-or-script";
const trees: DocumentTree[] = [];

function identity(serialized: string): ResearchFragmentIdentity {
	return {
		codeUnits: serialized.length,
		sha256: createHash("sha256").update(serialized, "utf8").digest("hex"),
		digestEncoding: "utf8-serialized-fragment",
	};
}

function document(html = "<main>Full document</main>", suffix = "") {
	const tree = parseHtmlDocument(html, `${baseUrl}${suffix}`);
	trees.push(tree);
	tree.setTargetElement(selectDocumentFragmentTarget(tree));
	return tree;
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

describe("research fragment identity", () => {
	it("omits metadata for ordinary fragmentless requests", () => {
		expect(researchFragmentReport(baseUrl)).toBeUndefined();
		expect(
			researchFragmentReport(baseUrl, `${baseUrl}?query=value`),
		).toBeUndefined();
		expect(
			researchFragmentReport(baseUrl, baseUrl, document()),
		).toBeUndefined();
	});

	it("distinguishes an explicit empty fragment from an absent fragment", () => {
		expect(researchFragmentReport(`${baseUrl}#`)).toEqual({
			schemaVersion: 1,
			requested: {
				codeUnits: 0,
				sha256:
					"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
				digestEncoding: "utf8-serialized-fragment",
			},
			resolution: "pending",
			semantics,
		});
	});

	it.each([
		["fragment", "fragment"],
		["日", "%E6%97%A5"],
		["😀", "%F0%9F%98%80"],
		["%e6%97%a5", "%e6%97%a5"],
		["a+b", "a+b"],
		["a%20b", "a%20b"],
		["a b", "a%20b"],
		["a&b=c", "a&b=c"],
		["part#nested", "part#nested"],
		["%23nested", "%23nested"],
		["%E9", "%E9"],
		["%", "%"],
	])(
		"hashes serialized fragment %s without decoding",
		(fragment, serialized) => {
			expect(
				researchFragmentReport(`${baseUrl}#${fragment}`)?.requested,
			).toEqual(identity(serialized));
		},
	);

	it.each([
		["a+b", "a%20b"],
		["a+b", "a%2Bb"],
		["%74op", "top"],
		["%e6%97%a5", "%E6%97%A5"],
		["part#nested", "part%23nested"],
	])("keeps serialized identities distinct for %s and %s", (first, second) => {
		expect(
			researchFragmentReport(`${baseUrl}#${first}`)?.requested,
		).not.toEqual(researchFragmentReport(`${baseUrl}#${second}`)?.requested);
	});

	it("does not hash the URL, query or leading fragment marker", () => {
		expect(
			researchFragmentReport(`${baseUrl}?private=query#same`)?.requested,
		).toEqual(
			researchFragmentReport("https://other.example/path#same")?.requested,
		);
		expect(researchFragmentReport(`${baseUrl}#same`)?.requested).toEqual(
			identity("same"),
		);
	});

	it("returns only digests and an opaque reference for private target names", () => {
		const fragment = "SYNTHETIC_PRIVATE_FRAGMENT_7f8d";
		const namedId = "SYNTHETIC_PRIVATE_NAMED_ID_5b2a";
		const url = `${baseUrl}#${fragment}`;
		const tree = document(
			`<a id="${namedId}" name="${fragment}">Visible</a>`,
			`#${fragment}`,
		);
		const report = researchFragmentReport(url, url, tree);
		expect(report).toEqual({
			schemaVersion: 1,
			requested: identity(fragment),
			effective: identity(fragment),
			resolution: "element",
			target: tree.reference(tree.targetElement as number),
			semantics,
		});
		expect(report?.target).toMatch(/^e[1-9][0-9]*$/);
		const serialized = JSON.stringify(report);
		for (const privateValue of [fragment, namedId, baseUrl, "Visible"])
			expect(serialized).not.toContain(privateValue);
	});
});

describe("research fragment resolution", () => {
	it("omits unknown effective identity even if a tree has a URL and target", () => {
		const tree = document('<p id="target">Target</p>', "#target");
		const report = researchFragmentReport(
			`${baseUrl}#requested`,
			undefined,
			tree,
		);
		expect(report?.resolution).toBe("pending");
		expect(report).not.toHaveProperty("effective");
		expect(report).not.toHaveProperty("target");
	});

	it.each(["", "#", "#top", "#target", "#:~:text=private"])(
		"remains pending without a tree for effective suffix %s",
		(suffix) => {
			const report = researchFragmentReport(
				`${baseUrl}#requested`,
				`${baseUrl}${suffix}`,
			);
			expect(report?.resolution).toBe("pending");
			expect(report).toHaveProperty(
				"effective",
				suffix === "" ? null : identity(suffix.slice(1)),
			);
			expect(report).not.toHaveProperty("target");
		},
	);

	it("reports a redirect that drops the requested fragment as absent", () => {
		const tree = document('<p id="old">Old target</p>', "#old");
		expect(researchFragmentReport(`${baseUrl}#old`, baseUrl, tree)).toEqual({
			schemaVersion: 1,
			requested: identity("old"),
			effective: null,
			resolution: "absent",
			semantics,
		});
	});

	it("reports a redirect that introduces a fragment", () => {
		const tree = document('<p id="added">Added target</p>', "#added");
		expect(researchFragmentReport(baseUrl, tree.url, tree)).toEqual({
			schemaVersion: 1,
			requested: null,
			effective: identity("added"),
			resolution: "element",
			target: tree.reference(tree.targetElement as number),
			semantics,
		});
	});

	it("uses the effective identity and selected target when a redirect replaces a fragment", () => {
		const tree = document(
			'<p id="first">First</p><p id="second">Second</p>',
			"#second",
		);
		expect(
			researchFragmentReport(`${baseUrl}#first`, tree.url, tree),
		).toMatchObject({
			requested: identity("first"),
			effective: identity("second"),
			resolution: "element",
			target: tree.reference(tree.targetElement as number),
		});
	});

	it.each(["", "top", "TOP", "tOp", "%74%6F%70", "%54oP"])(
		"reports unmatched top fragment %s as document-top",
		(fragment) => {
			const tree = document(undefined, `#${fragment}`);
			expect(researchFragmentReport(tree.url, tree.url, tree)).toMatchObject({
				resolution: "document-top",
			});
			expect(
				researchFragmentReport(tree.url, tree.url, tree),
			).not.toHaveProperty("target");
		},
	);

	it("gives a selected top ID priority over the document-top fallback", () => {
		const tree = document('<p id="TOP">Actual element</p>', "#TOP");
		expect(researchFragmentReport(tree.url, tree.url, tree)?.resolution).toBe(
			"element",
		);
	});

	it.each(["missing", "%20top", "top%20", "top+", "töp", "TOP/", "%2574op"])(
		"reports non-top unmatched fragment %s without a target",
		(fragment) => {
			const tree = document(undefined, `#${fragment}`);
			const report = researchFragmentReport(tree.url, tree.url, tree);
			expect(report?.resolution).toBe("unmatched");
			expect(report).not.toHaveProperty("target");
		},
	);

	it.each([
		":~:text=private",
		"top:~:text=private",
		"target:~:",
		"before#after:~:text=private",
	])(
		"does not claim directive matching for %s even with a selected ID",
		(fragment) => {
			const tree = document(
				`<p id="${fragment}">Existing ID</p>`,
				`#${fragment}`,
			);
			expect(tree.targetElement).not.toBeNull();
			const report = researchFragmentReport(tree.url, tree.url, tree);
			expect(report?.resolution).toBe("unsupported-directive");
			expect(report).not.toHaveProperty("target");
			expect(JSON.stringify(report)).not.toContain(fragment);
		},
	);

	it("does not reinterpret percent-encoded directive punctuation as a serialized directive", () => {
		const tree = document(
			'<p id=":~:text=private">ID</p>',
			"#%3A~%3Atext=private",
		);
		expect(researchFragmentReport(tree.url, tree.url, tree)?.resolution).toBe(
			"element",
		);
	});
});

describe("existing native target selection", () => {
	it.each([
		[
			'<p id="a b">Decoded first</p><p id="a%20b">Raw later</p>',
			"a%20b",
			"Raw later",
		],
		[
			'<p id="a b">Decoded first</p><a name="a%20b">Raw name later</a>',
			"a%20b",
			"Raw name later",
		],
		[
			'<a name="a b">Decoded name first</a><p id="a b">Decoded ID later</p>',
			"a%20b",
			"Decoded ID later",
		],
		[
			'<a name="legacy">First named anchor</a><a name="legacy">Duplicate</a>',
			"legacy",
			"First named anchor",
		],
		[
			'<a name="same">Named first</a><p id="same">First ID</p><p id="same">Duplicate ID</p>',
			"same",
			"First ID",
		],
		[
			'<div name="legacy">Not an anchor</div><a name="legacy">Anchor</a>',
			"legacy",
			"Anchor",
		],
		['<p id="a b">Space</p><p id="a+b">Plus</p>', "a+b", "Plus"],
		[
			'<p id="a b">Space</p><p id="a+b">Encoded plus</p>',
			"a%2Bb",
			"Encoded plus",
		],
		['<p id="日">Unicode</p>', "%E6%97%A5", "Unicode"],
		['<p id="�">Replacement</p>', "%E9", "Replacement"],
	])("preserves core matching for %s", (html, fragment, expectedText) => {
		const tree = document(html, `#${fragment}`);
		const queries = new DocumentQueries(tree);
		try {
			const selected = queries.querySelector(":target");
			expect(selected).not.toBeNull();
			expect(tree.textContent(selected as number)).toBe(expectedText);
			const report = researchFragmentReport(tree.url, tree.url, tree);
			expect(report?.resolution).toBe("element");
			expect(report?.target).toBe(tree.reference(selected as number));
		} finally {
			queries.close();
		}
	});

	it("does not independently match an ID when the session has not selected it", () => {
		const tree = document('<p id="target">Potential target</p>', "#target");
		tree.setTargetElement(null);
		expect(researchFragmentReport(tree.url, tree.url, tree)?.resolution).toBe(
			"unmatched",
		);
		expect(tree.targetElement).toBeNull();
	});

	it("does not rescan, read target content, mutate, navigate or close the document", () => {
		const tree = document(
			'<main><p id="target">Target</p><p>Other content</p></main>',
			"#target",
		);
		const selected = tree.targetElement as number;
		const targetReference = tree.reference(selected);
		const revision = tree.revision;
		const url = tree.url;
		const content = tree.textContent(tree.root);
		const fail = () => {
			throw new Error("Unexpected DOM operation");
		};
		const forbidden = [
			vi.spyOn(tree, "walk").mockImplementation(fail),
			vi.spyOn(tree, "get").mockImplementation(fail),
			vi.spyOn(tree, "textContent").mockImplementation(fail),
			vi.spyOn(tree, "setTargetElement").mockImplementation(fail),
			vi.spyOn(tree, "setUrl").mockImplementation(fail),
			vi.spyOn(tree, "close").mockImplementation(fail),
		];
		try {
			expect(researchFragmentReport(url, url, tree)?.target).toBe(
				targetReference,
			);
			for (const spy of forbidden) expect(spy).not.toHaveBeenCalled();
			expect(tree.revision).toBe(revision);
			expect(tree.url).toBe(url);
			expect(tree.targetElement).toBe(selected);
		} finally {
			for (const spy of forbidden) spy.mockRestore();
		}
		expect(tree.textContent(tree.root)).toBe(content);
		expect(tree.resolve(targetReference).id).toBe(selected);
	});

	it.each([undefined, "", "#", "#missing", "#:~:text=private"])(
		"rejects a closed tree rather than claiming resolution for effective suffix %s",
		(suffix) => {
			const tree = document(undefined, "#requested");
			tree.close();
			expect(() =>
				researchFragmentReport(
					`${baseUrl}#requested`,
					suffix === undefined ? undefined : `${baseUrl}${suffix}`,
					tree,
				),
			).toThrow("closed");
		},
	);
});

describe("bounded generic URL validation", () => {
	it.each([
		"",
		"#SYNTHETIC_PRIVATE_FRAGMENT",
		"not a URL SYNTHETIC_PRIVATE_FRAGMENT",
		"https://[invalid]/#SYNTHETIC_PRIVATE_FRAGMENT",
		`${baseUrl}#${"a".repeat(16_384)}`,
		`${baseUrl}#${"日".repeat(2_000)}`,
		null,
		42,
		{},
	])(
		"rejects invalid or oversized URL case %# without exposing its value",
		(value) => {
			for (const invoke of [
				() => researchFragmentReport(value as string),
				() => researchFragmentReport(`${baseUrl}#valid`, value as string),
				() => researchFragmentReport(baseUrl, value as string),
			]) {
				try {
					invoke();
					expect.unreachable("Invalid URL accepted");
				} catch (error) {
					expect(error).toBeInstanceOf(AgentBrowserError);
					expect(error).toMatchObject({
						code: "invalid-input",
						message: "Invalid research fragment URL",
					});
					expect(error).not.toHaveProperty("cause");
					expect(String(error)).not.toContain("SYNTHETIC_PRIVATE_FRAGMENT");
				}
			}
		},
	);

	it("accepts the exact serialized URL limit and rejects one code unit beyond", () => {
		const fragment = "a".repeat(16_384 - baseUrl.length - 1);
		const url = `${baseUrl}#${fragment}`;
		expect(url).toHaveLength(16_384);
		expect(researchFragmentReport(url, url)?.effective).toEqual(
			identity(fragment),
		);
		expect(() => researchFragmentReport(`${url}a`)).toThrow(
			"Invalid research fragment URL",
		);
	});

	it("validates requested input even when effective input is valid", () => {
		expect(() => researchFragmentReport("invalid", baseUrl)).toThrow(
			"Invalid research fragment URL",
		);
	});

	it("does not coerce hostile non-string URL inputs", () => {
		const coercion = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE_FRAGMENT");
		});
		const value = { toString: coercion } as unknown as string;
		expect(() => researchFragmentReport(value)).toThrow(
			"Invalid research fragment URL",
		);
		expect(() => researchFragmentReport(`${baseUrl}#valid`, value)).toThrow(
			"Invalid research fragment URL",
		);
		expect(coercion).not.toHaveBeenCalled();
	});
});
