import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { collectLinkTargets } from "./link-discovery.js";

const trees: DocumentTree[] = [];
const options = {
	maxNodes: 100,
	maxDepth: 20,
	maxEntries: 20,
	maxLabelCodeUnits: 100,
	maxUrlCodeUnits: 1024,
	baseUrl: "https://example.com/base/page?old=1",
	skip: () => false,
	visible: () => true,
	descend: () => true,
};

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function append(
	tree: DocumentTree,
	parent: number,
	tagName: string,
	text?: string,
	attributes: Record<string, string> = {},
) {
	const id = tree.createElement(tagName, attributes);
	tree.append(parent, id);
	if (text !== undefined) tree.append(id, tree.createText(text));
	return id;
}

function fixture() {
	const tree = new DocumentTree("https://document.example/original");
	trees.push(tree);
	const root = append(tree, tree.root, "main");
	return { tree, root };
}

function anchor(
	tree: DocumentTree,
	parent: number,
	text?: string,
	href = "/hit",
) {
	return append(tree, parent, "a", text, { href });
}

it("resolves relative, base, fragment, empty and absolute links in native HTML", () => {
	const tree = parseHtmlDocument(
		'<base href="https://ignored.example/"><main>' +
			'<a href="../Guide">Relative</a><a href="?new=2">Query</a>' +
			'<a href="#Part">Fragment</a><a href="">Empty</a>' +
			'<a href="//cdn.example.com/file">Network</a>' +
			'<a href="HTTPS://EXAMPLE.COM:443/Absolute">Absolute</a>' +
			'<a>No href</a><area href="/area"><link href="/link"></main>',
		"https://document.example/original",
	);
	trees.push(tree);
	const result = collectLinkTargets(tree, "EXAMPLE.COM", options);
	expect(result.entries.map((entry) => entry.url)).toEqual([
		"https://example.com/Guide",
		"https://example.com/base/page?new=2",
		"https://example.com/base/page?old=1#Part",
		"https://example.com/base/page?old=1",
		"https://cdn.example.com/file",
		"https://example.com/Absolute",
	]);
	expect(result.entries.map((entry) => entry.label)).toEqual([
		"Relative",
		"Query",
		"Fragment",
		"Empty",
		"Network",
		"Absolute",
	]);
	expect(result.entries.every((entry) => !entry.labelTruncated)).toBe(true);
	expect(result.truncated).toBe(false);
});

it("matches literal resolved URL substrings, not CSS, labels or attributes", () => {
	const { tree, root } = fixture();
	const target = anchor(tree, root, "Unrelated", "/Docs?x=[a]&next=One");
	anchor(tree, root, "[a]", "/unrelated");
	append(tree, root, "a", "Other", { href: "/other", title: "[a]" });
	for (const query of ["[a]", "/dOcS?X=", "EXAMPLE.COM/Docs"]) {
		const result = collectLinkTargets(tree, query, options);
		expect(result.entries.map((entry) => entry.ref)).toEqual([
			tree.reference(target),
		]);
		expect(result.entries[0].url).toBe(
			"https://example.com/Docs?x=[a]&next=One",
		);
	}
	expect(collectLinkTargets(tree, "a[href]", options).entries).toEqual([]);
});

it.each([
	"javascript:alert('hit')",
	"data:text/plain,hit",
	"mailto:hit@example.com",
	"ftp://example.com/hit",
	"file:///hit",
	"https://user@example.com/hit",
	"https://:password@example.com/hit",
	"//user:password@example.com/hit",
	"https://%75ser@example.com/hit",
	"https://[invalid]/hit",
	"https://example.com:99999/hit",
	"https://exa mple.com/hit",
	"https://example.com/hi\nt",
	"/hit\u0000",
])("ignores invalid, non-network or credential-bearing href %j", (href) => {
	const { tree, root } = fixture();
	anchor(tree, root, "Rejected", href);
	const valid = anchor(tree, root, "Valid");
	const result = collectLinkTargets(tree, "hit", options);
	expect(result.entries.map((entry) => entry.ref)).toEqual([
		tree.reference(valid),
	]);
});

it("accepts HTTP and rejects credentials inherited from the supplied base", () => {
	const { tree, root } = fixture();
	anchor(tree, root, "Relative");
	const absolute = anchor(tree, root, "Absolute", "http://example.com/hit");
	expect(collectLinkTargets(tree, "hit", options).entries).toHaveLength(2);
	const result = collectLinkTargets(tree, "hit", {
		...options,
		baseUrl: "https://user:secret@example.com/page",
	});
	expect(result.entries.map((entry) => entry.ref)).toEqual([
		tree.reference(absolute),
	]);
});

it("rejects overlong raw and resolved URLs instead of truncating them", () => {
	const { tree, root } = fixture();
	const url = "https://example.com/hit";
	const exact = anchor(tree, root, "Exact", url);
	const relative = anchor(tree, root, "Relative", "/hit");
	anchor(tree, root, "Raw", `${"./".repeat(100)}hit`);
	anchor(tree, root, "Long", `${url}x`);
	anchor(tree, root, "Resolved", "/hit-long");
	anchor(tree, root, "Encoded", "/hit/😀");
	const result = collectLinkTargets(tree, "hit", {
		...options,
		maxUrlCodeUnits: url.length,
	});
	expect(result.entries.map((entry) => entry.ref)).toEqual([
		tree.reference(exact),
		tree.reference(relative),
	]);
	expect(result.entries.map((entry) => entry.url)).toEqual([url, url]);
	expect(result.truncated).toBe(false);
});

it("keeps the native network URL ceiling even with a larger caller cap", () => {
	const { tree, root } = fixture();
	anchor(tree, root, "Too long", `/hit${"x".repeat(16_384)}`);
	expect(
		collectLinkTargets(tree, "hit", { ...options, maxUrlCodeUnits: 20_000 })
			.entries,
	).toEqual([]);
});

it("prunes skipped subtrees while allowing visibility-restored descendants", () => {
	const { tree, root } = fixture();
	const omitted = append(tree, root, "section");
	const unreachable = anchor(tree, omitted, "Omitted");
	const hidden = anchor(tree, root, "Hidden");
	const hiddenText = tree.get(hidden).children[0];
	const restored = anchor(tree, hidden, "Restored");
	const target = anchor(tree, root, "Visible");
	const hiddenSpan = append(tree, target, "span", "Invisible text");
	const invisibleText = tree.get(hiddenSpan).children[0];
	append(tree, hiddenSpan, "b", " restored text");
	const excluded = append(tree, target, "script", "Ignored");
	const invisible = new Set([hidden, hiddenText, hiddenSpan, invisibleText]);
	const get = vi.spyOn(tree, "get");
	const result = collectLinkTargets(tree, "hit", {
		...options,
		skip: (node) => node.id === omitted || node.id === excluded,
		visible: (id) => !invisible.has(id),
	});
	expect(result.entries.map((entry) => entry.ref)).toEqual([
		tree.reference(restored),
		tree.reference(target),
	]);
	expect(result.entries.map((entry) => entry.label)).toEqual([
		"Restored",
		"Visible restored text",
	]);
	expect(get).not.toHaveBeenCalledWith(unreachable);
});

it("honors descend without losing a link on the pruned node", () => {
	const { tree, root } = fixture();
	const leaf = append(tree, root, "img");
	const excluded = anchor(tree, leaf, "Unreachable");
	const target = anchor(tree, root, "Unreachable label");
	anchor(tree, root, "After");
	const get = vi.spyOn(tree, "get");
	const result = collectLinkTargets(tree, "hit", {
		...options,
		descend: (node) => node.id !== leaf && node.id !== target,
	});
	expect(result.scannedNodes).toBe(6);
	expect(result.entries.map((entry) => entry.label)).toEqual(["", "After"]);
	expect(result.entries.every((entry) => !entry.labelTruncated)).toBe(true);
	expect(get).not.toHaveBeenCalledWith(excluded);
});

it("accumulates nested anchor text in order and collapses whitespace at completion", () => {
	const { tree, root } = fixture();
	anchor(tree, root, " Done ");
	const outer = anchor(tree, root, " A\t");
	append(tree, outer, "em", "B\n");
	const inner = anchor(tree, outer, " C ");
	append(tree, inner, "span", "\tD\u00a0");
	tree.append(outer, tree.createText(" E "));
	anchor(tree, root, " F ");
	const result = collectLinkTargets(tree, "hit", options);
	expect(result.entries.map((entry) => entry.label)).toEqual([
		"Done",
		"A B C D E",
		"C D",
		"F",
	]);
	expect(result.entries.every((entry) => !entry.labelTruncated)).toBe(true);
});

it("uses text only, not alt, title, aria-label, comments or control values", () => {
	const { tree, root } = fixture();
	const target = append(tree, root, "a", "Text", {
		href: "/hit",
		title: "Title",
		"aria-label": "Accessible label",
	});
	append(tree, target, "img", undefined, { alt: "Alternative" });
	const input = append(tree, target, "input", undefined, {
		value: "Attribute",
	});
	tree.setControl(input, { value: "Control value" });
	tree.append(target, tree.createComment("Comment"));
	expect(collectLinkTargets(tree, "hit", options).entries[0].label).toBe(
		"Text",
	);
});

it.each([
	{ chunks: ["abcd"], cap: 4, label: "abcd", truncated: false },
	{ chunks: ["ab", "cd", ""], cap: 4, label: "abcd", truncated: false },
	{ chunks: ["abcd", "", "e"], cap: 4, label: "abcd", truncated: true },
	{ chunks: ["abcde"], cap: 4, label: "abcd", truncated: true },
	{ chunks: [" A\t", " B "], cap: 4, label: "A", truncated: true },
	{ chunks: ["😀x"], cap: 1, label: "\ud83d", truncated: true },
	{ chunks: [""], cap: 0, label: "", truncated: false },
	{ chunks: ["x"], cap: 0, label: "", truncated: true },
])(
	"caps raw UTF-16 text before collapsing whitespace: $chunks at $cap",
	(sample) => {
		const { tree, root } = fixture();
		const target = anchor(tree, root);
		for (const chunk of sample.chunks)
			tree.append(target, tree.createText(chunk));
		const result = collectLinkTargets(tree, "hit", {
			...options,
			maxLabelCodeUnits: sample.cap,
		});
		expect(result.entries[0].label).toBe(sample.label);
		expect(result.entries[0].labelTruncated).toBe(sample.truncated);
		expect(result.truncated).toBe(false);
	},
);

it("does not mark exact labels truncated for later invisible or omitted text", () => {
	const { tree, root } = fixture();
	const target = anchor(tree, root, "Exact");
	const invisible = tree.createText("Invisible");
	tree.append(target, invisible);
	const omitted = append(tree, target, "span", "Omitted");
	const result = collectLinkTargets(tree, "hit", {
		...options,
		maxLabelCodeUnits: 5,
		skip: (node) => node.id === omitted,
		visible: (id) => id !== invisible,
	});
	expect(result.entries[0].label).toBe("Exact");
	expect(result.entries[0].labelTruncated).toBe(false);
});

it("bounds huge text without full textContent or subtree rescans", () => {
	const { tree, root } = fixture();
	const outer = anchor(tree, root, "a".repeat(100_000));
	anchor(tree, outer, "Inner");
	tree.append(outer, tree.createText("z".repeat(100_000)));
	const textContent = vi.spyOn(tree, "textContent").mockImplementation(() => {
		throw new Error("Full textContent is forbidden");
	});
	const get = vi.spyOn(tree, "get");
	const result = collectLinkTargets(tree, "hit", {
		...options,
		maxLabelCodeUnits: 5,
	});
	expect(result.entries.map((entry) => entry.label)).toEqual([
		"aaaaa",
		"Inner",
	]);
	expect(result.entries.map((entry) => entry.labelTruncated)).toEqual([
		true,
		false,
	]);
	expect(textContent).not.toHaveBeenCalled();
	expect(get).toHaveBeenCalledTimes(result.scannedNodes);
	expect(new Set(get.mock.calls.map(([id]) => id)).size).toBe(
		result.scannedNodes,
	);
});

it("does not truncate at an exact entry limit or for excluded later anchors", () => {
	const { tree, root } = fixture();
	const target = anchor(tree, root, "Complete");
	const omitted = anchor(tree, root, "Omitted");
	const invisible = anchor(tree, root, "Invisible");
	anchor(tree, root, "No match", "/other");
	anchor(tree, root, "Invalid", "javascript:hit");
	anchor(tree, root, "Too long", `/hit${"x".repeat(1024)}`);
	append(tree, root, "a", "No href");
	const result = collectLinkTargets(tree, "hit", {
		...options,
		maxEntries: 1,
		skip: (node) => node.id === omitted,
		visible: (id) => id !== invisible,
	});
	expect(result.truncated).toBe(false);
	expect(result.entries).toEqual([
		{
			ref: tree.reference(target),
			url: "https://example.com/hit",
			label: "Complete",
			labelTruncated: false,
		},
	]);
});

it("marks only active labels truncated on an additional matching link", () => {
	const { tree, root } = fixture();
	anchor(tree, root, " Done ");
	const outer = anchor(tree, root, " Outer ");
	const inner = anchor(tree, outer, " Inner ");
	anchor(tree, inner, "Excluded");
	const result = collectLinkTargets(tree, "hit", { ...options, maxEntries: 3 });
	expect(result.truncated).toBe(true);
	expect(result.scannedNodes).toBe(9);
	expect(result.entries.map((entry) => entry.label)).toEqual([
		"Done",
		"Outer Inner",
		"Inner",
	]);
	expect(result.entries.map((entry) => entry.labelTruncated)).toEqual([
		false,
		true,
		true,
	]);
});

it("allows zero entries and truncates only after a matching link is found", () => {
	const { tree, root } = fixture();
	anchor(tree, root, "No match", "/other");
	expect(
		collectLinkTargets(tree, "hit", { ...options, maxEntries: 0 }),
	).toEqual({
		entries: [],
		scannedNodes: 4,
		truncated: false,
	});
	anchor(tree, root, "Match");
	expect(
		collectLinkTargets(tree, "hit", { ...options, maxEntries: 0 }),
	).toEqual({
		entries: [],
		scannedNodes: 5,
		truncated: true,
	});
});

it("does not fetch or enumerate later siblings after the entry boundary", () => {
	const { tree, root } = fixture();
	const target = anchor(tree, root, "First");
	const text = tree.get(target).children[0];
	const boundary = anchor(tree, root);
	for (let index = 0; index < 2_000; index++) append(tree, root, "div");
	const rootNode = tree.get(root);
	const children = new Proxy(rootNode.children, {
		get(target, property, receiver) {
			if (typeof property === "string" && /^[0-9]+$/.test(property)) {
				if (Number(property) >= 2) throw new Error("Excluded tail enumerated");
			}
			return Reflect.get(target, property, receiver);
		},
	});
	const originalGet = tree.get.bind(tree);
	const get = vi
		.spyOn(tree, "get")
		.mockImplementation((id) =>
			id === root ? { ...rootNode, children } : originalGet(id),
		);
	const result = collectLinkTargets(tree, "hit", {
		...options,
		maxEntries: 1,
		maxNodes: 5,
	});
	expect(result.truncated).toBe(true);
	expect(result.entries[0].labelTruncated).toBe(false);
	expect(get.mock.calls.map(([id]) => id)).toEqual([
		tree.root,
		root,
		target,
		text,
		boundary,
	]);
});

it("counts skipped nodes and enforces exact root-relative node and depth limits", () => {
	const { tree, root } = fixture();
	const target = anchor(tree, root, "Title");
	expect(
		collectLinkTargets(tree, "hit", { ...options, maxNodes: 4, maxDepth: 3 })
			.scannedNodes,
	).toBe(4);
	for (const budget of [{ maxNodes: 3 }, { maxDepth: 2 }]) {
		expect(() =>
			collectLinkTargets(tree, "hit", { ...options, ...budget }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
	expect(
		collectLinkTargets(tree, "hit", {
			...options,
			maxNodes: 1,
			maxDepth: 0,
			skip: () => true,
		}),
	).toEqual({ entries: [], scannedNodes: 1, truncated: false });
	for (const budget of [{ maxNodes: 2 }, { maxDepth: 1 }]) {
		expect(() =>
			collectLinkTargets(tree, "hit", {
				...options,
				...budget,
				skip: (node) => node.id === target,
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
});

it.each(["prefix", "tail"])(
	"enforces node budgets on a long %s",
	(placement) => {
		const { tree, root } = fixture();
		if (placement === "tail") anchor(tree, root, "First");
		for (let index = 0; index < 1_000; index++) append(tree, root, "div");
		if (placement === "prefix") anchor(tree, root, "First");
		const skip = vi.fn(() => false);
		expect(() =>
			collectLinkTargets(tree, "hit", {
				...options,
				maxNodes: 12,
				maxEntries: 1,
				skip,
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(skip).toHaveBeenCalledTimes(12);
	},
);

it("enforces depth after exhausting the label budget", () => {
	const { tree, root } = fixture();
	let parent = anchor(tree, root, "Full label");
	for (let depth = 0; depth < 100; depth++)
		parent = append(tree, parent, "section");
	expect(() =>
		collectLinkTargets(tree, "hit", {
			...options,
			maxNodes: 200,
			maxDepth: 50,
			maxLabelCodeUnits: 1,
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("invokes checkpoints during traversal and propagates their abort unchanged", () => {
	const { tree, root } = fixture();
	anchor(tree, root, "First");
	anchor(tree, root, "Second");
	const revision = tree.revision;
	const checkpoint = vi.fn();
	const result = collectLinkTargets(tree, "hit", { ...options, checkpoint });
	expect(checkpoint).toHaveBeenCalledTimes(result.scannedNodes);
	const abort = new AgentBrowserError("aborted", "Stop discovery");
	let calls = 0;
	expect(() =>
		collectLinkTargets(tree, "hit", {
			...options,
			checkpoint: () => {
				if (++calls === 4) throw abort;
			},
		}),
	).toThrow(abort);
	expect(calls).toBe(4);
	expect(tree.revision).toBe(revision);
	expect(collectLinkTargets(tree, "hit", options)).toEqual(result);
});

it("preserves native tree identity, duplicate URLs, detached nodes and cleanup", () => {
	const { tree, root } = fixture();
	const first = anchor(tree, root, "First");
	const second = anchor(tree, root, "Second");
	const detached = tree.createElement("a", { href: "/hit" });
	const original = tree.get(first);
	const revision = tree.revision;
	const nodeCount = tree.nodeCount;
	const result = collectLinkTargets(tree, "hit", options);
	expect(result.entries.map((entry) => tree.resolve(entry.ref).id)).toEqual([
		first,
		second,
	]);
	expect(result.entries.map((entry) => entry.url)).toEqual([
		"https://example.com/hit",
		"https://example.com/hit",
	]);
	expect(
		result.entries.some((entry) => entry.ref === tree.reference(detached)),
	).toBe(false);
	expect(tree.get(first)).toBe(original);
	expect(tree.nodeCount).toBe(nodeCount);
	expect(tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
	tree.close();
	expect(() => collectLinkTargets(tree, "hit", options)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});
