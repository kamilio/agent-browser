import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	type HeadingTarget,
	collectHeadingTargets,
} from "./heading-discovery.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const options = {
	maxNodes: 100,
	maxDepth: 20,
	maxEntries: 20,
	maxTitleCodeUnits: 100,
	maxSelectorCodeUnits: 1024,
	skip: () => false,
	visible: () => true,
	descend: () => true,
};

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://example.com/headings");
	trees.push(tree);
	const root = append(tree, tree.root, "main");
	return { tree, root };
}

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

function verifySelectors(
	tree: DocumentTree,
	entries: HeadingTarget[],
	targets: number[],
) {
	expect(entries).toHaveLength(targets.length);
	const queries = new DocumentQueries(tree);
	try {
		for (const [index, entry] of entries.entries()) {
			if (entry.selector === null) throw new Error("Missing fixture selector");
			expect(queries.querySelectorAll(entry.selector)).toEqual([
				targets[index],
			]);
			expect(entry.ref).toBe(tree.reference(targets[index]));
		}
	} finally {
		queries.close();
	}
}

it("discovers only native h1 through h6 in preorder without changing the tree", () => {
	const { tree, root } = fixture();
	const targets = [1, 2, 3, 4, 5, 6].map((level) =>
		append(tree, root, `h${level}`, `Title ${level}`),
	);
	append(tree, root, "h7", "Not native");
	append(tree, root, "div", "ARIA only", {
		role: "heading",
		"aria-level": "2",
	});
	const detached = tree.createElement("h2");
	const revision = tree.revision;
	const references = targets.map((target) => tree.reference(target));
	const textContent = vi.spyOn(tree, "textContent").mockImplementation(() => {
		throw new Error("Whole-node text extraction is forbidden");
	});
	const result = collectHeadingTargets(tree, options);
	expect(result.scannedNodes).toBe(18);
	expect(result.truncated).toBe(false);
	expect(result.entries.map((entry) => entry.level)).toEqual([
		1, 2, 3, 4, 5, 6,
	]);
	expect(result.entries.map((entry) => entry.title)).toEqual([
		"Title 1",
		"Title 2",
		"Title 3",
		"Title 4",
		"Title 5",
		"Title 6",
	]);
	expect(result.entries.every((entry) => !entry.titleTruncated)).toBe(true);
	expect(result.entries.every((entry) => !entry.selectorUnavailable)).toBe(
		true,
	);
	expect(result.entries.map((entry) => entry.ref)).toEqual(references);
	expect(
		result.entries.some((entry) => entry.ref === tree.reference(detached)),
	).toBe(false);
	expect(tree.revision).toBe(revision);
	expect(tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
	expect(
		targets.map((target) => tree.resolve(tree.reference(target)).id),
	).toEqual(targets);
	expect(textContent).not.toHaveBeenCalled();
	verifySelectors(tree, result.entries, targets);
});

it("prunes omitted subtrees but permits visibility-restored descendants", () => {
	const { tree, root } = fixture();
	const omitted = append(tree, root, "section");
	const unreachable = append(tree, omitted, "h1", "Omitted");
	const hidden = append(tree, root, "h2", "Invisible");
	const hiddenText = tree.get(hidden).children[0];
	const restored = append(tree, hidden, "h3", "Restored");
	const heading = append(tree, root, "h4", "Visible");
	const hiddenSpan = append(tree, heading, "span", "Hidden text");
	const invisibleText = tree.get(hiddenSpan).children[0];
	append(tree, hiddenSpan, "b", " restored text");
	const excluded = append(tree, heading, "script", "Ignored");
	const invisible = new Set([hidden, hiddenText, hiddenSpan, invisibleText]);
	const get = vi.spyOn(tree, "get");
	const result = collectHeadingTargets(tree, {
		...options,
		skip: (node) => node.id === omitted || node.id === excluded,
		visible: (id) => !invisible.has(id),
	});
	expect(result.entries.map((entry) => entry.title)).toEqual([
		"Restored",
		"Visible restored text",
	]);
	expect(get).not.toHaveBeenCalledWith(unreachable);
	get.mockRestore();
	verifySelectors(tree, result.entries, [restored, heading]);
});

it("prunes leaf children while still admitting a leaf heading", () => {
	const { tree, root } = fixture();
	const leaf = append(tree, root, "img", undefined, { alt: "Not a title" });
	const excluded = append(tree, leaf, "h1", "Unreachable");
	const heading = append(tree, root, "h2", "Also unreachable");
	const after = append(tree, root, "h3", "After");
	const get = vi.spyOn(tree, "get");
	const result = collectHeadingTargets(tree, {
		...options,
		descend: (node) => node.id !== leaf && node.id !== heading,
	});
	expect(result.scannedNodes).toBe(6);
	expect(result.entries.map((entry) => entry.title)).toEqual(["", "After"]);
	expect(result.entries.map((entry) => entry.titleTruncated)).toEqual([
		false,
		false,
	]);
	expect(get).not.toHaveBeenCalledWith(excluded);
	get.mockRestore();
	verifySelectors(tree, result.entries, [heading, after]);
});

it("accumulates ordered raw descendant text for every active nested heading", () => {
	const { tree, root } = fixture();
	const outer = append(tree, root, "h1", " A\t");
	append(tree, outer, "em", "B\n");
	const inner = append(tree, outer, "h2", "C");
	append(tree, inner, "span", "\u0001😀");
	tree.append(outer, tree.createText(" D "));
	const sibling = append(tree, root, "h3", "E");
	const result = collectHeadingTargets(tree, options);
	expect(result.entries.map((entry) => entry.title)).toEqual([
		" A\tB\nC\u0001😀 D ",
		"C\u0001😀",
		"E",
	]);
	verifySelectors(tree, result.entries, [outer, inner, sibling]);
});

it("never uses image alt, attributes, comments, or control values as titles", () => {
	const { tree, root } = fixture();
	const heading = append(tree, root, "h2", "Text", {
		title: "Attribute title",
		"aria-label": "Accessible label",
	});
	append(tree, heading, "img", undefined, { alt: "Alternative" });
	const input = append(tree, heading, "input", undefined, {
		value: "Attribute",
	});
	tree.setControl(input, { value: "Control value" });
	tree.append(heading, tree.createComment("Comment"));
	const result = collectHeadingTargets(tree, options);
	expect(result.entries[0].title).toBe("Text");
	verifySelectors(tree, result.entries, [heading]);
});

it.each([
	{ chunks: ["abcd"], cap: 4, title: "abcd", truncated: false },
	{ chunks: ["ab", "cd", ""], cap: 4, title: "abcd", truncated: false },
	{ chunks: ["abcd", "", "e"], cap: 4, title: "abcd", truncated: true },
	{ chunks: ["abcde"], cap: 4, title: "abcd", truncated: true },
	{ chunks: ["😀x"], cap: 1, title: "\ud83d", truncated: true },
	{ chunks: [""], cap: 0, title: "", truncated: false },
	{ chunks: ["x"], cap: 0, title: "", truncated: true },
])("retains a raw UTF-16 prefix: $chunks at $cap", (sample) => {
	const { tree, root } = fixture();
	const heading = append(tree, root, "h2");
	for (const chunk of sample.chunks)
		tree.append(heading, tree.createText(chunk));
	const result = collectHeadingTargets(tree, {
		...options,
		maxTitleCodeUnits: sample.cap,
	});
	expect(result.entries[0].title).toBe(sample.title);
	expect(result.entries[0].titleTruncated).toBe(sample.truncated);
	expect(result.truncated).toBe(false);
	verifySelectors(tree, result.entries, [heading]);
});

it("does not truncate an exact title for later invisible or omitted text", () => {
	const { tree, root } = fixture();
	const heading = append(tree, root, "h2", "Exact");
	const invisible = tree.createText("Invisible");
	tree.append(heading, invisible);
	const omitted = append(tree, heading, "span", "Omitted");
	const result = collectHeadingTargets(tree, {
		...options,
		maxTitleCodeUnits: 5,
		skip: (node) => node.id === omitted,
		visible: (id) => id !== invisible,
	});
	expect(result.entries[0].title).toBe("Exact");
	expect(result.entries[0].titleTruncated).toBe(false);
	verifySelectors(tree, result.entries, [heading]);
});

it("bounds large text without losing later nested headings or their own titles", () => {
	const { tree, root } = fixture();
	const outer = append(tree, root, "h1", "a".repeat(100_000));
	const inner = append(tree, outer, "h2", "Inner");
	tree.append(outer, tree.createText("z".repeat(100_000)));
	const result = collectHeadingTargets(tree, {
		...options,
		maxTitleCodeUnits: 5,
	});
	expect(result.entries.map((entry) => entry.title)).toEqual([
		"aaaaa",
		"Inner",
	]);
	expect(result.entries.map((entry) => entry.titleTruncated)).toEqual([
		true,
		false,
	]);
	verifySelectors(tree, result.entries, [outer, inner]);
});

it("only truncates on an extra visible admitted heading, not excluded headings", () => {
	const { tree, root } = fixture();
	const heading = append(tree, root, "h1", "Complete");
	const omitted = append(tree, root, "h2", "Omitted");
	const invisible = append(tree, root, "h3", "Invisible");
	append(tree, root, "p", "Trailing prose");
	const result = collectHeadingTargets(tree, {
		...options,
		maxEntries: 1,
		skip: (node) => node.id === omitted,
		visible: (id) => id !== invisible,
	});
	expect(result.truncated).toBe(false);
	expect(result.scannedNodes).toBe(9);
	expect(result.entries[0].titleTruncated).toBe(false);
	verifySelectors(tree, result.entries, [heading]);
});

it("marks only still-active included headings when the entry limit stops traversal", () => {
	const { tree, root } = fixture();
	const completed = append(tree, root, "h1", "Done");
	const outer = append(tree, root, "h2", "Outer");
	const inner = append(tree, outer, "h3", "Inner");
	append(tree, inner, "h4", "Excluded");
	const result = collectHeadingTargets(tree, {
		...options,
		maxEntries: 3,
	});
	expect(result.truncated).toBe(true);
	expect(result.scannedNodes).toBe(9);
	expect(result.entries.map((entry) => entry.title)).toEqual([
		"Done",
		"OuterInner",
		"Inner",
	]);
	expect(result.entries.map((entry) => entry.titleTruncated)).toEqual([
		false,
		true,
		true,
	]);
	verifySelectors(tree, result.entries, [completed, outer, inner]);
});

it("handles a zero-entry budget without stopping before a real heading", () => {
	const { tree, root } = fixture();
	append(tree, root, "p", "No heading");
	expect(collectHeadingTargets(tree, { ...options, maxEntries: 0 })).toEqual({
		entries: [],
		scannedNodes: 4,
		truncated: false,
	});
	append(tree, root, "h2", "Heading");
	expect(collectHeadingTargets(tree, { ...options, maxEntries: 0 })).toEqual({
		entries: [],
		scannedNodes: 5,
		truncated: true,
	});
});

it("does not fetch or enumerate excluded later siblings after the entry boundary", () => {
	const { tree, root } = fixture();
	const heading = append(tree, root, "h1", "First");
	const headingText = tree.get(heading).children[0];
	const boundary = append(tree, root, "h2");
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
	const result = collectHeadingTargets(tree, {
		...options,
		maxEntries: 1,
		maxNodes: 5,
	});
	expect(result.truncated).toBe(true);
	expect(result.scannedNodes).toBe(5);
	expect(result.entries[0].titleTruncated).toBe(false);
	expect(get.mock.calls.map(([id]) => id)).toEqual([
		tree.root,
		root,
		heading,
		headingText,
		boundary,
	]);
	get.mockRestore();
	verifySelectors(tree, result.entries, [heading]);
});

it("still enforces scan budgets on long prefixes and tails after filling entries", () => {
	for (const placement of ["prefix", "tail"] as const) {
		const { tree, root } = fixture();
		if (placement === "tail") append(tree, root, "h1", "First");
		for (let index = 0; index < 1_000; index++) append(tree, root, "div");
		if (placement === "prefix") append(tree, root, "h1", "First");
		const skip = vi.fn(() => false);
		expect(() =>
			collectHeadingTargets(tree, {
				...options,
				maxNodes: 12,
				maxEntries: 1,
				skip,
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(skip).toHaveBeenCalledTimes(12);
	}
});

it("counts nodes before skip and enforces exact root-relative depth and node caps", () => {
	const { tree, root } = fixture();
	const heading = append(tree, root, "h1", "Title");
	expect(
		collectHeadingTargets(tree, { ...options, maxNodes: 4, maxDepth: 3 })
			.scannedNodes,
	).toBe(4);
	for (const budget of [{ maxNodes: 3 }, { maxDepth: 2 }]) {
		expect(() =>
			collectHeadingTargets(tree, { ...options, ...budget }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
	expect(
		collectHeadingTargets(tree, {
			...options,
			maxDepth: 0,
			skip: (node) => node.id === tree.root,
		}),
	).toEqual({ entries: [], scannedNodes: 1, truncated: false });
	expect(() =>
		collectHeadingTargets(tree, {
			...options,
			maxNodes: 2,
			skip: (node) => node.id === heading,
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		collectHeadingTargets(tree, {
			...options,
			maxDepth: 1,
			skip: (node) => node.id === heading,
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("enforces scan depth even after a selector or title budget is exhausted", () => {
	const { tree, root } = fixture();
	let parent = append(tree, root, "h1", "Full title");
	for (let depth = 0; depth < 100; depth++)
		parent = append(tree, parent, "section");
	expect(() =>
		collectHeadingTargets(tree, {
			...options,
			maxNodes: 200,
			maxDepth: 50,
			maxTitleCodeUnits: 1,
			maxSelectorCodeUnits: 1,
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("uses real wrapper and element sibling positions, not allocation order", () => {
	const tree = parseHtmlDocument(
		"<!doctype html><!--before--><title>Fixture</title><main></main>",
		"https://example.com/headings",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const main = queries.querySelector("main");
	if (main === null) throw new Error("Missing main fixture");
	queries.close();
	const second = tree.createElement("h2");
	const first = tree.createElement("h1");
	tree.append(main, tree.createComment("Before"));
	tree.append(main, tree.createText("Prefix"));
	const skipped = append(tree, main, "aside");
	tree.append(main, first);
	tree.append(main, tree.createComment("Between"));
	const hidden = append(tree, main, "div");
	tree.append(main, second);
	expect(second).toBeLessThan(first);
	const result = collectHeadingTargets(tree, {
		...options,
		skip: (node) => node.id === skipped,
		visible: (id) => id !== hidden,
	});
	expect(result.entries.map((entry) => entry.selector)).toEqual([
		"html:root:nth-child(1) > body:nth-child(2) > main:nth-child(1) > h1:nth-child(2)",
		"html:root:nth-child(1) > body:nth-child(2) > main:nth-child(1) > h2:nth-child(4)",
	]);
	verifySelectors(tree, result.entries, [first, second]);
});

it.each([
	{ name: "namespace", tagName: "svg:foreign" },
	{ name: "65 code units", tagName: "a".repeat(65) },
	{ name: "large tag", tagName: "a".repeat(100_000) },
])(
	"reports an unsupported ancestor without suppressing the heading: $name",
	({ tagName }) => {
		const { tree, root } = fixture();
		const unsupported = append(tree, root, tagName);
		const wrapper = append(tree, unsupported, "section");
		const heading = append(tree, wrapper, "h2", "Found");
		const after = append(tree, root, "h3", "Safe");
		const result = collectHeadingTargets(tree, options);
		expect(result.entries[0]).toEqual({
			ref: tree.reference(heading),
			level: 2,
			title: "Found",
			titleTruncated: false,
			selector: null,
			selectorUnavailable: "unsupported-ancestor",
		});
		verifySelectors(tree, [result.entries[1]], [after]);
	},
);

it("accepts 64-code-unit ancestor tags with safe hyphens and underscores", () => {
	const { tree, root } = fixture();
	const ancestor = append(tree, root, `a_-${"b".repeat(61)}`);
	const heading = append(tree, ancestor, "h2", "Safe");
	verifySelectors(tree, collectHeadingTargets(tree, options).entries, [
		heading,
	]);
});

it("reports unsafe ancestry even when an earlier segment exhausted the path cap", () => {
	const { tree, root } = fixture();
	const ancestor = append(tree, root, "svg:foreign");
	append(tree, ancestor, "h2", "Found");
	const result = collectHeadingTargets(tree, {
		...options,
		maxSelectorCodeUnits: 1,
	});
	expect(result.entries[0].selector).toBeNull();
	expect(result.entries[0].selectorUnavailable).toBe("unsupported-ancestor");
});

it("honors exact selector caps and resets path state for later siblings", () => {
	const { tree, root } = fixture();
	const heading = append(tree, root, "h2", "Title");
	const expected = "main:root:nth-child(1) > h2:nth-child(1)";
	const exact = collectHeadingTargets(tree, {
		...options,
		maxSelectorCodeUnits: expected.length,
	});
	expect(exact.entries[0].selector).toBe(expected);
	verifySelectors(tree, exact.entries, [heading]);
	for (const maxSelectorCodeUnits of [0, 1, expected.length - 1]) {
		const limited = collectHeadingTargets(tree, {
			...options,
			maxSelectorCodeUnits,
		});
		expect(limited.entries[0].selector).toBeNull();
		expect(limited.entries[0].selectorUnavailable).toBe("selector-limit");
		expect(limited.entries[0].title).toBe("Title");
		expect(limited.truncated).toBe(false);
	}
	const wrapper = append(tree, root, "section");
	append(tree, wrapper, "h3", "Too deep for selector");
	const after = append(tree, root, "h4", "After");
	const result = collectHeadingTargets(tree, {
		...options,
		maxSelectorCodeUnits: expected.length,
	});
	expect(result.entries[1].selectorUnavailable).toBe("selector-limit");
	verifySelectors(
		tree,
		[result.entries[0], result.entries[2]],
		[heading, after],
	);
});

it("counts multi-digit sibling positions in the selector budget", () => {
	const { tree, root } = fixture();
	for (let index = 0; index < 9; index++) append(tree, root, "div");
	const heading = append(tree, root, "h2", "Tenth");
	const expected = "main:root:nth-child(1) > h2:nth-child(10)";
	const result = collectHeadingTargets(tree, {
		...options,
		maxSelectorCodeUnits: expected.length,
	});
	expect(result.entries[0].selector).toBe(expected);
	verifySelectors(tree, result.entries, [heading]);
	expect(
		collectHeadingTargets(tree, {
			...options,
			maxSelectorCodeUnits: expected.length - 1,
		}).entries[0].selectorUnavailable,
	).toBe("selector-limit");
});

it("distinguishes a direct-root heading from a nested first-child heading", () => {
	const tree = new DocumentTree("https://example.com/headings");
	trees.push(tree);
	const outer = append(tree, tree.root, "h2", "Outer");
	const wrapper = append(tree, tree.root, "div");
	const inner = append(tree, wrapper, "h2", "Inner");
	const result = collectHeadingTargets(tree, options);
	expect(result.entries.map((entry) => entry.selector)).toEqual([
		"h2:root:nth-child(1)",
		":root ~ div:nth-child(2) > h2:nth-child(1)",
	]);
	verifySelectors(tree, result.entries, [outer, inner]);
});

it("anchors paths above repeated descendant subtrees", () => {
	const { tree, root } = fixture();
	const outer = append(tree, root, "h2", "Outer");
	const wrapper = append(tree, root, "section");
	const repeated = append(tree, wrapper, "main");
	const inner = append(tree, repeated, "h2", "Inner");
	const result = collectHeadingTargets(tree, options);
	expect(result.entries.map((entry) => entry.selector)).toEqual([
		"main:root:nth-child(1) > h2:nth-child(1)",
		"main:root:nth-child(1) > section:nth-child(2) > main:nth-child(1) > h2:nth-child(1)",
	]);
	verifySelectors(tree, result.entries, [outer, inner]);
});

it("anchors later document elements even when the first element is skipped", () => {
	const tree = new DocumentTree("https://example.com/headings");
	trees.push(tree);
	tree.append(tree.root, tree.createComment("Before the first element"));
	tree.append(tree.root, tree.createText("Document text"));
	const skipped = append(tree, tree.root, "svg:foreign");
	append(tree, skipped, "h1", "Excluded");
	tree.append(tree.root, tree.createComment("Between elements"));
	const second = append(tree, tree.root, "h2", "Second");
	const wrapper = append(tree, tree.root, "section");
	const third = append(tree, wrapper, "h3", "Third");
	const result = collectHeadingTargets(tree, {
		...options,
		skip: (node) => node.id === skipped,
	});
	expect(result.entries.map((entry) => entry.selector)).toEqual([
		":root ~ h2:nth-child(2)",
		":root ~ section:nth-child(3) > h3:nth-child(1)",
	]);
	verifySelectors(tree, result.entries, [second, third]);
});

it.each([
	{ position: 1, selector: "h2:root:nth-child(1)", codeUnits: 20 },
	{ position: 2, selector: ":root ~ h2:nth-child(2)", codeUnits: 23 },
	{ position: 10, selector: ":root ~ h2:nth-child(10)", codeUnits: 24 },
])("charges the exact root anchor length at position $position", (sample) => {
	const tree = new DocumentTree("https://example.com/headings");
	trees.push(tree);
	for (let index = 1; index < sample.position; index++)
		append(tree, tree.root, "aside");
	const heading = append(tree, tree.root, "h2", "Heading");
	const exact = collectHeadingTargets(tree, {
		...options,
		maxSelectorCodeUnits: sample.codeUnits,
	});
	expect(sample.selector.length).toBe(sample.codeUnits);
	expect(exact.entries[0].selector).toBe(sample.selector);
	verifySelectors(tree, exact.entries, [heading]);
	const limited = collectHeadingTargets(tree, {
		...options,
		maxSelectorCodeUnits: sample.codeUnits - 1,
	});
	expect(limited.entries[0].selector).toBeNull();
	expect(limited.entries[0].selectorUnavailable).toBe("selector-limit");
	expect(limited.entries[0].title).toBe("Heading");
	expect(limited.entries[0].titleTruncated).toBe(false);
	expect(limited.scannedNodes).toBe(exact.scannedNodes);
	expect(limited.truncated).toBe(false);
});

it.each([false, true])(
	"admits 127 segments but rejects 128 against the native component cap, later root: %s",
	(laterRoot) => {
		const tree = new DocumentTree("https://example.com/headings");
		trees.push(tree);
		if (laterRoot) append(tree, tree.root, "aside");
		let parent = tree.root;
		for (let depth = 0; depth < 126; depth++)
			parent = append(tree, parent, "section");
		const boundary = append(tree, parent, "h2", "Boundary");
		const beyond = append(tree, boundary, "h3", "Beyond");
		const after = append(tree, tree.root, "h4", "After");
		const result = collectHeadingTargets(tree, {
			...options,
			maxNodes: 200,
			maxDepth: 130,
			maxSelectorCodeUnits: 4096,
		});
		expect(result.entries[0].selector?.split(" > ")).toHaveLength(127);
		expect(result.entries[1]).toEqual({
			ref: tree.reference(beyond),
			level: 3,
			title: "Beyond",
			titleTruncated: false,
			selector: null,
			selectorUnavailable: "selector-limit",
		});
		expect(result.entries[0].title).toBe("BoundaryBeyond");
		expect(result.truncated).toBe(false);
		verifySelectors(
			tree,
			[result.entries[0], result.entries[2]],
			[boundary, after],
		);
	},
);

it("rejects paths beyond the native length cap even with a larger caller cap", () => {
	const { tree, root } = fixture();
	let parent = root;
	for (let depth = 0; depth < 110; depth++)
		parent = append(tree, parent, "a".repeat(64));
	append(tree, parent, "h2", "Found");
	const result = collectHeadingTargets(tree, {
		...options,
		maxNodes: 200,
		maxDepth: 120,
		maxSelectorCodeUnits: 20_000,
	});
	expect(result.entries[0].selector).toBeNull();
	expect(result.entries[0].selectorUnavailable).toBe("selector-limit");
	expect(result.entries[0].title).toBe("Found");
});

it.each(["fragment", "element"] as const)(
	"does not emit an ambiguous path for a non-document traversal root: %s",
	(kind) => {
		const { tree, root } = fixture();
		append(tree, root, "h2", "Found");
		const originalGet = tree.get.bind(tree);
		vi.spyOn(tree, "get").mockImplementation((id) => {
			const node = originalGet(id);
			return id === tree.root ? { ...node, kind, tagName: "main" } : node;
		});
		const result = collectHeadingTargets(tree, options);
		expect(result.entries[0].selector).toBeNull();
		expect(result.entries[0].selectorUnavailable).toBe("unsupported-ancestor");
		expect(result.entries[0].title).toBe("Found");
	},
);
