import { afterEach, expect, it, vi } from "vitest";
import {
	type DocumentScriptCspLimits,
	bindDocumentScriptCsp,
	documentScriptCsp,
} from "./document-script-csp.js";
import { documentBaseUrl } from "./document-url.js";
import { DocumentTree } from "./document.js";
import { svgNamespace } from "./dom-namespaces.js";
import { parseHtmlDocumentAsync } from "./html-parser.js";
import { initializeScriptElement } from "./script-element-state.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://example.com/document/page");
	trees.push(tree);
	return tree;
}

function headers(...values: string[]) {
	return { "content-security-policy": values };
}

function script(
	tree: DocumentTree,
	attributes: Record<string, string> = {},
	origin: "dynamic" | "parser" | "inert" = "dynamic",
) {
	const id = tree.createElement("script", attributes);
	initializeScriptElement(tree, id, origin);
	tree.append(tree.root, id);
	return id;
}

async function parsedScripts(
	source: string,
	policy = "script-src 'nonce-native' 'strict-dynamic'",
) {
	const decisions: boolean[] = [];
	let owner: ReturnType<typeof bindDocumentScriptCsp> | undefined;
	const tree = await parseHtmlDocumentAsync(
		source,
		"https://example.com/document/page",
		{
			initializeDocument(document) {
				owner = bindDocumentScriptCsp(document, headers(policy));
			},
		},
		{
			start() {},
			async script(document, id) {
				if (!owner) throw new Error("Missing owner");
				decisions.push(owner.allowsScript(id));
			},
			async finish() {},
		},
	);
	trees.push(tree);
	if (!owner) throw new Error("Missing owner");
	return { tree, owner, decisions };
}

it.each([
	['<script nonce="native"></script>', true],
	['<script src="/synthetic.js" nonce="native"></script>', true],
	['<script src="/synthetic.js"></script>', false],
	["<script></script>", false],
	['<script nonce="wrong"></script>', false],
	['<script nonce="native" NONCE="discarded"></script>', false],
	['<script nonce="native" title="safe" TITLE="discarded"></script>', false],
	['<script nonce="native" title="safe" TITLE="<SCRIPT"></script>', false],
	['<script nonce="native" data-<StYle="x"></script>', false],
	['<script nonce="native" title="&lt;script"></script>', false],
	['<script nonce="native" type="module"></script>', true],
])("uses trusted parser nonceability for %s", async (source, allowed) => {
	const { decisions } = await parsedScripts(source);
	expect(decisions).toEqual([allowed]);
});

it.each(["", ' src="https://cdn.example/root.js"'])(
	"carries a module nonce into descendant fetch checks: %s",
	async (external) => {
		const { tree, owner } = await parsedScripts(
			`<script type="module" nonce="native"${external}></script>`,
			"script-src 'nonce-native'",
		);
		const entry = [...tree.walk()].find(
			({ node }) => node.tagName === "script",
		);
		if (!entry) throw new Error("Missing module element");
		const admission = owner.prepareScript(entry.node.id);
		if (!admission) throw new Error("Missing module admission");
		expect(
			owner.allowsRequest(admission, "https://cdn.example/child.js", 0),
		).toBe(true);
		expect(
			owner.allowsRequest(admission, "https://other.example/final.js", 1),
		).toBe(true);
		owner.close();
		expect(
			owner.allowsRequest(admission, "https://cdn.example/child.js", 0),
		).toBe(false);
	},
);

it("keeps host restrictions for module graphs without an authorized nonce", async () => {
	const { tree, owner } = await parsedScripts(
		'<script type="module" src="/root.js"></script>',
		"script-src 'self'",
	);
	const entry = [...tree.walk()].find(({ node }) => node.tagName === "script");
	if (!entry) throw new Error("Missing module element");
	const admission = owner.prepareScript(entry.node.id);
	if (!admission) throw new Error("Missing module admission");
	expect(
		owner.allowsRequest(admission, "https://example.com/child.js", 0),
	).toBe(true);
	expect(
		owner.allowsRequest(admission, "https://other.example/child.js", 0),
	).toBe(false);
});

it("keeps parse-time refusal sticky and rechecks current attributes and connection", async () => {
	const { tree, owner, decisions } = await parsedScripts(
		'<script nonce="native"></script><script nonce="native" title="first" title="duplicate"></script>',
	);
	const ids = [...tree.walk()]
		.filter(({ node }) => node.tagName === "script")
		.map(({ node }) => node.id);
	expect(decisions).toEqual([true, false]);
	tree.removeAttribute(ids[1], "title");
	tree.setAttribute(ids[1], "nonce", "native");
	expect(owner.allowsScript(ids[1])).toBe(false);
	tree.setAttribute(ids[0], "title", "<STYLE");
	expect(owner.allowsScript(ids[0])).toBe(false);
	tree.removeAttribute(ids[0], "title");
	expect(owner.allowsScript(ids[0])).toBe(true);
	tree.setAttribute(ids[0], "nonce", "wrong");
	expect(owner.allowsScript(ids[0])).toBe(false);
	tree.setAttribute(ids[0], "nonce", "native");
	const clone = tree.clone(ids[0]);
	tree.append(tree.root, clone);
	expect(owner.allowsScript(clone)).toBe(false);
	tree.remove(ids[0]);
	expect(owner.allowsScript(ids[0])).toBe(false);
});

it("does not grant parser trust to unterminated, template or foreign scripts", async () => {
	const { tree, owner, decisions } = await parsedScripts(
		'<template><script nonce="native"></script></template><svg><script nonce="native"></script></svg><script nonce="native">unfinished',
	);
	expect(decisions).toEqual([]);
	for (const entry of tree.walkIncludingTemplateContents())
		if (entry.node.tagName === "script")
			expect(owner.allowsScript(entry.node.id)).toBe(false);
});

it("captures headers once and cannot be rebound to a weaker policy", () => {
	const tree = fixture();
	const input = headers("script-src 'nonce-native'");
	const owner = bindDocumentScriptCsp(tree, input);
	const accepted = script(tree, { nonce: "native" });
	const refused = script(tree, { nonce: "wrong" });
	input["content-security-policy"][0] = "script-src 'unsafe-inline'";
	expect(documentScriptCsp(tree)).toBe(owner);
	expect(owner.allowsScript(accepted)).toBe(true);
	expect(owner.allowsScript(refused)).toBe(false);
	expect(() => bindDocumentScriptCsp(tree, {})).toThrow(/already/);
	expect(Object.isFrozen(owner)).toBe(true);
});

it("binds exactly one document and never interprets guest metadata as eligibility", () => {
	const first = fixture();
	const second = fixture();
	const owner = bindDocumentScriptCsp(
		first,
		headers("script-src 'nonce-native' 'strict-dynamic'"),
	);
	const local = script(first, { nonce: "native" });
	const foreign = script(second, { nonce: "native" });
	const read = vi.fn(() => local);
	for (const value of [
		foreign,
		-1,
		Number.NaN,
		"1",
		null,
		undefined,
		{},
		Object.defineProperty({}, "id", { get: read }),
		{ id: local, nonce: "native", parserInserted: false, nonceable: true },
	])
		expect(owner.allowsScript(value as number)).toBe(false);
	expect(read).not.toHaveBeenCalled();
	expect(owner.allowsScript(local)).toBe(true);
});

it("derives external/inline and nonceability from native state without relaxing strict-dynamic", () => {
	const tree = fixture();
	const owner = bindDocumentScriptCsp(
		tree,
		headers("script-src 'nonce-native' 'strict-dynamic' 'unsafe-inline'"),
	);
	expect(owner.allowsScript(script(tree, { src: "/dynamic.js" }))).toBe(true);
	expect(owner.allowsScript(script(tree))).toBe(false);
	expect(owner.allowsScript(script(tree, { nonce: "wrong" }))).toBe(false);
	expect(owner.allowsScript(script(tree, { nonce: "native" }))).toBe(true);
	expect(
		owner.allowsScript(
			script(tree, { nonce: "native", "data-source": "<SCRIPT suspicious" }),
		),
	).toBe(false);
	expect(
		owner.allowsScript(
			script(tree, { nonce: "native", "data-source": "<style suspicious" }),
		),
	).toBe(false);
	expect(
		owner.allowsScript(script(tree, { nonce: "native", type: "module" })),
	).toBe(true);
});

it("refuses unknown, parser, inert, foreign and detached eligibility rather than trusting missing parser evidence", () => {
	const tree = fixture();
	const owner = bindDocumentScriptCsp(
		tree,
		headers("script-src 'nonce-native' 'strict-dynamic'"),
	);
	for (const origin of ["parser", "inert"] as const)
		expect(
			owner.allowsScript(
				script(tree, { nonce: "native", src: "/script.js" }, origin),
			),
		).toBe(false);
	const unknown = tree.createElement("script", { nonce: "native" });
	tree.append(tree.root, unknown);
	expect(owner.allowsScript(unknown)).toBe(false);
	const detached = tree.createElement("script", { nonce: "native" });
	initializeScriptElement(tree, detached, "dynamic");
	expect(owner.allowsScript(detached)).toBe(false);
	const foreign = tree.createParserElement(
		"script",
		{ nonce: "native" },
		svgNamespace,
	);
	tree.append(tree.root, foreign);
	expect(owner.allowsScript(foreign)).toBe(false);
});

it("keeps unsupported headers denied and ignores report-only getters without invocation", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected header read");
	});
	for (const input of [
		headers("script-src 'nonce-native'; img-src *"),
		headers("script-src 'nonce-native'; connect-src *"),
		Object.defineProperty({}, "content-security-policy", { get: read }),
		null,
	]) {
		const tree = fixture();
		const owner = bindDocumentScriptCsp(tree, input);
		expect(owner.unsupported).toBe(true);
		expect(owner.allowsScript(script(tree, { nonce: "native" }))).toBe(false);
		expect(owner.allowsBase("https://example.com/base/")).toBe(false);
	}
	const tree = fixture();
	const owner = bindDocumentScriptCsp(
		tree,
		Object.defineProperty({}, "Content-Security-Policy-Report-Only", {
			get: read,
		}),
	);
	expect(owner.unsupported).toBe(false);
	expect(owner.allowsScript(script(tree))).toBe(true);
	expect(read).not.toHaveBeenCalled();
});

it("revokes the owner with document or explicit closure without allowing rebinding", () => {
	for (const closeDocument of [false, true]) {
		const tree = fixture();
		const owner = bindDocumentScriptCsp(tree, {});
		const id = script(tree);
		expect(owner.allowsScript(id)).toBe(true);
		if (closeDocument) tree.close();
		else owner.close();
		expect(owner.allowsScript(id)).toBe(false);
		expect(owner.allowsBase("https://example.com/")).toBe(false);
		expect(() => bindDocumentScriptCsp(tree, {})).toThrow();
		owner.close();
	}
});

it("ignores disallowed first bases without selecting a later base, and invalidates a warmed unbound cache", () => {
	const tree = fixture();
	const first = tree.createElement("base", {
		href: "https://foreign.example/base/",
	});
	const second = tree.createElement("base", { href: "/allowed/" });
	tree.append(tree.root, first);
	tree.append(tree.root, second);
	expect(documentBaseUrl(tree)).toBe("https://foreign.example/base/");
	const owner = bindDocumentScriptCsp(tree, headers("base-uri 'self'"));
	expect(documentBaseUrl(tree)).toBe(tree.url);
	tree.remove(first);
	expect(documentBaseUrl(tree)).toBe("https://example.com/allowed/");
	owner.close();
	expect(documentBaseUrl(tree)).toBe(tree.url);
});

it("applies base none/self/intersection independently from script fallback and leaves unbound selection unchanged", () => {
	for (const policies of [
		["base-uri 'none'"],
		["base-uri 'self'", "base-uri 'none'"],
		["script-src 'nonce-native'; img-src *"],
	]) {
		const tree = fixture();
		bindDocumentScriptCsp(tree, headers(...policies));
		tree.append(tree.root, tree.createElement("base", { href: "/blocked/" }));
		expect(documentBaseUrl(tree)).toBe(tree.url);
	}
	for (const bound of [false, true]) {
		const tree = fixture();
		if (bound) bindDocumentScriptCsp(tree, headers("default-src 'none'"));
		tree.append(
			tree.root,
			tree.createElement("base", { href: "https://other.example/base/" }),
		);
		expect(documentBaseUrl(tree)).toBe("https://other.example/base/");
	}
});

it("keeps meta policy changes sticky across edits/removal, including inserted subtrees", () => {
	const tree = fixture();
	const owner = bindDocumentScriptCsp(tree, {});
	const container = tree.createElement("div");
	const meta = tree.createElement("meta", {
		"http-equiv": "Content-Security-Policy",
		content: "script-src 'none'",
	});
	tree.append(container, meta);
	expect(owner.unsupported).toBe(false);
	tree.append(tree.root, container);
	tree.removeAttribute(meta, "http-equiv");
	tree.remove(container);
	expect(owner.unsupported).toBe(true);
	expect(owner.allowsScript(script(tree))).toBe(false);
});

it("detects initial and mutated meta policies but not foreign, detached or report-only metadata", () => {
	const initial = fixture();
	initial.append(
		initial.root,
		initial.createElement("meta", { "http-equiv": "content-security-policy" }),
	);
	expect(bindDocumentScriptCsp(initial, {}).unsupported).toBe(true);
	const tree = fixture();
	const owner = bindDocumentScriptCsp(tree, {});
	tree.createElement("meta", { "http-equiv": "content-security-policy" });
	tree.append(
		tree.root,
		tree.createParserElement(
			"meta",
			{ "http-equiv": "content-security-policy" },
			svgNamespace,
		),
	);
	const meta = tree.createElement("meta", {
		"http-equiv": "content-security-policy-report-only",
	});
	tree.append(tree.root, meta);
	expect(owner.unsupported).toBe(false);
	tree.setAttribute(meta, "http-equiv", " content-security-policy ");
	tree.removeAttribute(meta, "http-equiv");
	expect(owner.unsupported).toBe(true);
});

it("refuses admission inside an earlier collector before policy mutations are accounted for", () => {
	const tree = fixture();
	let observed: boolean | undefined;
	const id = script(tree);
	tree.onMutation(() => {
		observed = owner.allowsScript(id);
	});
	const owner = bindDocumentScriptCsp(tree, {});
	tree.append(
		tree.root,
		tree.createElement("meta", { "http-equiv": "content-security-policy" }),
	);
	expect(observed).toBe(false);
	expect(owner.unsupported).toBe(true);
});

it("does not lose transient CSP metadata removed by an earlier reentrant collector", () => {
	const tree = fixture();
	const meta = tree.createElement("meta", {
		"http-equiv": "content-security-policy",
	});
	tree.onMutation((record) => {
		if (record.type === "childList" && record.addedNodes.includes(meta))
			tree.remove(meta);
	});
	const owner = bindDocumentScriptCsp(tree, {});
	tree.append(tree.root, meta);
	expect(owner.unsupported).toBe(true);
	expect(owner.allowsBase("https://example.com/base/")).toBe(false);
});

it("bounds initial scanning, ongoing mutations and per-script attribute work", () => {
	const large = fixture();
	large.append(large.root, large.createElement("div"));
	expect(bindDocumentScriptCsp(large, {}, { maxScanWork: 1 }).unsupported).toBe(
		true,
	);
	const noisy = fixture();
	const id = noisy.createElement("div");
	const owner = bindDocumentScriptCsp(noisy, {}, { maxMutationWork: 1 });
	noisy.append(noisy.root, id);
	noisy.setAttribute(id, "data-value", "changed");
	expect(owner.unsupported).toBe(true);
	const attributes = fixture();
	const restricted = bindDocumentScriptCsp(
		attributes,
		headers("script-src 'nonce-native'"),
		{ maxScriptWork: 1 },
	);
	expect(
		restricted.allowsScript(
			script(attributes, { nonce: "native", "data-extra": "bounded" }),
		),
	).toBe(false);
});

it("rejects malformed limit descriptors without invoking accessors or relaxing the owner", () => {
	const read = vi.fn(() => 1);
	for (const limits of [
		null,
		[],
		{ maxScanWork: 0 },
		{ maxScanWork: Number.POSITIVE_INFINITY },
		{ other: 1 },
		Object.defineProperty({}, "maxMutationWork", { get: read }),
		Object.create({ maxScanWork: 1 }),
	]) {
		const owner = bindDocumentScriptCsp(
			fixture(),
			{},
			limits as Partial<DocumentScriptCspLimits>,
		);
		expect(owner.unsupported).toBe(true);
		expect(owner.allowsBase("https://example.com/")).toBe(false);
	}
	expect(read).not.toHaveBeenCalled();
});

it("derives a revocable classic import admission without changing inline entry admission", async () => {
	const { tree, owner } = await parsedScripts(
		'<script nonce="native"></script>',
		"script-src 'nonce-native'",
	);
	const entry = [...tree.walk()].find(({ node }) => node.tagName === "script");
	if (!entry) throw new Error("Missing classic script");
	const admission = owner.prepareScript(entry.node.id);
	if (!admission) throw new Error("Missing classic admission");
	const imports = admission.forImports?.();
	if (!imports) throw new Error("Missing derived import admission");
	expect(admission.allows()).toBe(true);
	expect(admission.allows("https://cdn.example/child.js", 0)).toBe(false);
	expect(admission.forImports?.()).toBe(imports);
	expect(owner.allowsRequest(imports, "https://cdn.example/child.js", 0)).toBe(
		true,
	);
	owner.close();
	expect(admission.allows()).toBe(false);
	expect(imports.allows("https://cdn.example/child.js", 0)).toBe(false);
	expect(admission.forImports?.()).toBeUndefined();
});

it("preserves host restrictions for classic imports admitted by unsafe-inline", async () => {
	const { tree, owner } = await parsedScripts(
		"<script></script>",
		"script-src 'self' 'unsafe-inline'",
	);
	const entry = [...tree.walk()].find(({ node }) => node.tagName === "script");
	if (!entry) throw new Error("Missing classic script");
	const admission = owner.prepareScript(entry.node.id);
	if (!admission) throw new Error("Missing classic admission");
	const imports = admission.forImports?.();
	if (!imports) throw new Error("Missing derived import admission");
	expect(admission.allows()).toBe(true);
	expect(owner.allowsRequest(imports, "https://example.com/child.js", 0)).toBe(
		true,
	);
	expect(
		owner.allowsRequest(imports, "https://other.example/child.js", 0),
	).toBe(false);
});
