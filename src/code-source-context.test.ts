import { afterEach, expect, it, vi } from "vitest";
import {
	type CodeSourceContexts,
	codeSourceContextLimits,
	collectCodeSourceContexts,
	fitCodeSourceContexts,
} from "./code-source-context.js";
import { DocumentTree } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import type { ExtractedNode } from "./extraction.js";

const trees: DocumentTree[] = [];
const encoder = new TextEncoder();
const extractionTypes: Partial<Record<string, ExtractedNode["type"]>> = {
	pre: "pre",
	code: "code",
	strong: "strong",
	b: "strong",
	em: "emphasis",
	i: "emphasis",
	br: "break",
};

function fixture() {
	const tree = new DocumentTree("https://code-context.fixture.invalid/");
	trees.push(tree);
	return tree;
}

function element(
	tree: DocumentTree,
	tag: string,
	children: ExtractedNode[] = [],
	options: {
		className?: string;
		type?: ExtractedNode["type"];
		namespace?: string;
		text?: string;
	} = {},
): ExtractedNode {
	const source = tree.createParserElement(
		tag,
		options.className === undefined ? {} : { class: options.className },
		options.namespace ?? htmlNamespace,
	);
	return {
		ref: tree.reference(source),
		type: options.type ?? extractionTypes[tag] ?? "inline",
		...(options.text === undefined ? {} : { text: options.text }),
		children,
	};
}

function text(tree: DocumentTree, value: string): ExtractedNode {
	return {
		ref: tree.reference(tree.createText(value)),
		type: "text",
		text: value,
	};
}

function selected(
	tree: DocumentTree,
	children: ExtractedNode[],
): ExtractedNode {
	return { ref: tree.reference(tree.root), type: "container", children };
}

function annotated(tree: DocumentTree, value = "x") {
	return element(tree, "pre", [text(tree, value)], {
		className: "programlisting",
	});
}

function collect(tree: DocumentTree, root: ExtractedNode): CodeSourceContexts {
	const result = collectCodeSourceContexts(tree, root);
	expect(result).toBeDefined();
	if (!result) throw new Error("Missing code-source contexts");
	return result;
}

function bytes(value: unknown) {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

function expectFrozen(value: CodeSourceContexts) {
	expect(Object.isFrozen(value)).toBe(true);
	expect(Object.isFrozen(value.entries)).toBe(true);
	for (const entry of value.entries) {
		expect(Object.isFrozen(entry)).toBe(true);
		expect(Object.isFrozen(entry.attributes)).toBe(true);
		expect(Object.isFrozen(entry.ranges)).toBe(true);
		for (const record of [...entry.attributes, ...entry.ranges])
			expect(Object.isFrozen(record)).toBe(true);
	}
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

it("exports frozen deterministic work and retention limits", () => {
	expect(codeSourceContextLimits).toEqual({
		maxBlocks: 128,
		maxVisitedNodes: 50_000,
		maxTextCodeUnits: 1_000_000,
		maxClassCodeUnits: 1024,
		maxAttributesPerBlock: 64,
		maxRangesPerBlock: 256,
		maxRecords: 2048,
		maxTotalClassCodeUnits: 65_536,
	});
	expect(Object.isFrozen(codeSourceContextLimits)).toBe(true);
});

it("uses extracted UTF16 offsets and preserves nested source-tag ranges in order", () => {
	const tree = fixture();
	const cleaned = text(tree, "raw source that is not the extracted text");
	cleaned.text = "A😀\u0001\n";
	const pre = element(
		tree,
		"pre",
		[
			cleaned,
			element(
				tree,
				"code",
				[
					text(tree, "x"),
					element(
						tree,
						"span",
						[
							text(tree, "😀"),
							element(tree, "strong", [
								text(tree, "B"),
								element(tree, "em", [text(tree, "é")]),
							]),
							element(tree, "br", [], { type: "break" }),
						],
						{ className: "other\tboring\nsource" },
					),
					element(tree, "b", [text(tree, "C")]),
					element(tree, "i"),
				],
				{ className: "language-rust edition2024 should_panic ignore" },
			),
			text(tree, "tail"),
		],
		{ className: "programlisting" },
	);
	const result = collect(tree, pre);
	expect(result).toEqual({
		kind: "native-code-source-context-v1",
		scope: "selected-extracted-pre-text",
		offsetUnit: "utf-16-code-unit",
		partial: true,
		rendered: false,
		verified: false,
		entries: [
			{
				ref: pre.ref,
				textCodeUnits: 16,
				attributes: [
					{ tag: "pre", class: "programlisting", start: 0, end: 16 },
					{
						tag: "code",
						class: "language-rust edition2024 should_panic ignore",
						start: 5,
						end: 12,
					},
				],
				ranges: [
					{ kind: "class", tag: "span", token: "boring", start: 6, end: 11 },
					{ kind: "emphasis", tag: "strong", start: 8, end: 10 },
					{ kind: "emphasis", tag: "em", start: 9, end: 10 },
					{ kind: "emphasis", tag: "b", start: 11, end: 12 },
					{ kind: "emphasis", tag: "i", start: 12, end: 12 },
				],
				truncated: false,
			},
		],
		truncated: false,
	});
	expectFrozen(result);
});

it("matches plain children semantics for own text, empty text and breaks", () => {
	const tree = fixture();
	const pre = element(
		tree,
		"pre",
		[
			element(tree, "strong", [text(tree, "\ud800")], { text: "😀" }),
			element(tree, "br", [text(tree, "z")], { type: "break", text: "" }),
			element(tree, "br", [], { type: "break" }),
			element(tree, "br", [], { type: "break", text: "XY" }),
		],
		{ className: "", text: "not part of plain(pre.children)" },
	);
	const result = collect(tree, pre);
	expect(result.entries[0]).toEqual({
		ref: pre.ref,
		textCodeUnits: 7,
		attributes: [{ tag: "pre", class: "", start: 0, end: 7 }],
		ranges: [{ kind: "emphasis", tag: "strong", start: 0, end: 3 }],
		truncated: false,
	});
});

it("preserves opaque full class attributes rather than interpreting code behavior", () => {
	const tree = fixture();
	const className =
		" language-rust\tedition2024\nshould_panic ignore does_not_compile noplayground playground programlisting 😀 ";
	const pre = element(
		tree,
		"pre",
		[
			element(tree, "code", [text(tree, "# scaffolding\nmain();")], {
				className,
			}),
		],
		{ className },
	);
	const result = collect(tree, pre);
	expect(
		result.entries[0].attributes.map((attribute) => attribute.class),
	).toEqual([className, className]);
	expect(result.entries[0].textCodeUnits).toBe("# scaffolding\nmain();".length);
	expect(result.truncated).toBe(false);
});

it.each([
	["boring", true],
	[" boring ", true],
	["other\tboring\nmore", true],
	["other\fboring\rmore", true],
	["boring boring", true],
	["boringly", false],
	["notboring", false],
	["boring\u00a0other", false],
	["\vboring", false],
	["boring\v", false],
	["other\u2003boring", false],
	["BORING", false],
] as const)(
	"recognizes only ASCII class-token boundaries in %j",
	(className, matches) => {
		const tree = fixture();
		const pre = element(tree, "pre", [
			element(tree, "span", [], { className, text: "x" }),
		]);
		const result = collectCodeSourceContexts(tree, pre);
		if (!matches) expect(result).toBeUndefined();
		else
			expect(result?.entries[0].ranges).toEqual([
				{ kind: "class", tag: "span", token: "boring", start: 0, end: 1 },
			]);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"rejects foreign pre and qualification tags in %s",
	(namespace) => {
		const tree = fixture();
		const foreignPre = element(tree, "pre", [annotated(tree)], {
			namespace,
			className: "source",
		});
		expect(collectCodeSourceContexts(tree, foreignPre)).toBeUndefined();
		const pre = element(tree, "pre", [
			element(tree, "code", [], {
				namespace,
				className: "language-rust",
				text: "ab",
			}),
			element(tree, "span", [], { namespace, className: "boring", text: "cd" }),
			element(tree, "strong", [], { namespace, text: "ef" }),
			element(tree, "em", [], { text: "g" }),
		]);
		const result = collect(tree, pre);
		expect(result.entries[0].attributes).toEqual([]);
		expect(result.entries[0].textCodeUnits).toBe(7);
		expect(result.entries[0].ranges).toEqual([
			{ kind: "emphasis", tag: "em", start: 6, end: 7 },
		]);
	},
);

it("does not relabel reconstructed div pre blocks or non-pre extracted nodes", () => {
	const tree = fixture();
	const reconstructed = element(tree, "div", [annotated(tree)], {
		type: "pre",
		className: "react-code-file-contents",
	});
	expect(collectCodeSourceContexts(tree, reconstructed)).toBeUndefined();
	const contextOnly = element(tree, "pre", [text(tree, "code")], {
		type: "container",
		className: "programlisting",
	});
	expect(collectCodeSourceContexts(tree, contextOnly)).toBeUndefined();
});

it.each(["paragraph", "heading", "code", "strong", "emphasis"] as const)(
	"stops outer discovery at the %s text sink",
	(type) => {
		const tree = fixture();
		const omitted = annotated(tree, "hidden in a sink");
		const sink = element(tree, "div", [omitted], { type });
		const included = annotated(tree, "selected");
		const get = vi.spyOn(tree, "get");
		const result = collect(tree, selected(tree, [sink, included]));
		expect(result.entries.map((entry) => entry.ref)).toEqual([included.ref]);
		expect(get).not.toHaveBeenCalledWith(Number(omitted.ref.slice(1)));
		expect(result.truncated).toBe(false);
	},
);

it("handles nested pre once while preserving overlapping qualifications", () => {
	const tree = fixture();
	const pre = element(
		tree,
		"pre",
		[
			text(tree, "a"),
			element(
				tree,
				"pre",
				[
					element(
						tree,
						"code",
						[
							element(
								tree,
								"span",
								[
									element(tree, "span", [text(tree, "bc")], {
										className: "boring",
									}),
								],
								{ className: "boring" },
							),
						],
						{ className: "language-rust" },
					),
				],
				{ className: "nested" },
			),
		],
		{ className: "outer" },
	);
	const result = collect(tree, pre);
	expect(result.entries).toHaveLength(1);
	expect(result.entries[0].attributes).toEqual([
		{ tag: "pre", class: "outer", start: 0, end: 3 },
		{ tag: "pre", class: "nested", start: 1, end: 3 },
		{ tag: "code", class: "language-rust", start: 1, end: 3 },
	]);
	expect(result.entries[0].ranges).toEqual([
		{ kind: "class", tag: "span", token: "boring", start: 1, end: 3 },
		{ kind: "class", tag: "span", token: "boring", start: 1, end: 3 },
	]);
});

it("inspects only selected extracted nodes with numeric get and never resolve", () => {
	const tree = fixture();
	const pre = annotated(tree, "selected");
	const omitted = element(tree, "code", [text(tree, "not extracted")], {
		className: "secret",
	});
	tree.append(Number(pre.ref.slice(1)), Number(omitted.ref.slice(1)));
	const nonselected = annotated(tree, "outside selection");
	tree.append(tree.root, Number(nonselected.ref.slice(1)));
	const get = vi.spyOn(tree, "get");
	const resolve = vi.spyOn(tree, "resolve").mockImplementation(() => {
		throw new Error("Ancestor connectivity resolution is not allowed");
	});
	const result = collect(tree, pre);
	expect(result.entries[0].textCodeUnits).toBe(8);
	expect(result.entries[0].attributes).toHaveLength(1);
	expect(get.mock.calls).toEqual([
		[Number(pre.ref.slice(1))],
		[Number(pre.children?.[0].ref.slice(1))],
	]);
	expect(resolve).not.toHaveBeenCalled();
});

it("emits nothing for ordinary code without supported qualifications", () => {
	const tree = fixture();
	const pre = element(tree, "pre", [
		element(tree, "code", [
			element(tree, "span", [text(tree, "fn main() {}")], {
				className: "syntax",
			}),
			element(tree, "div", [], { className: "boring", text: "# scaffold" }),
		]),
	]);
	expect(collectCodeSourceContexts(tree, pre)).toBeUndefined();
});

it.each([0, 1])("bounds source blocks with %i extra block", (extra) => {
	const tree = fixture();
	const blocks = Array.from(
		{ length: codeSourceContextLimits.maxBlocks + extra },
		() => annotated(tree),
	);
	const result = collect(tree, selected(tree, blocks));
	expect(result.entries).toHaveLength(codeSourceContextLimits.maxBlocks);
	expect(result.truncated).toBe(extra > 0);
	expect(result.entries.every((entry) => !entry.truncated)).toBe(true);
});

it("counts unqualified pre blocks against the block work bound", () => {
	const tree = fixture();
	const ordinary = element(tree, "pre", [text(tree, "ordinary")]);
	const root = selected(tree, [
		...Array.from(
			{ length: codeSourceContextLimits.maxBlocks },
			() => ordinary,
		),
		annotated(tree),
	]);
	const result = collect(tree, root);
	expect(result.entries).toEqual([]);
	expect(result.truncated).toBe(true);
});

it("bounds wide outer discovery without visiting omitted children", () => {
	const tree = fixture();
	const empty = selected(tree, []);
	const children = Array.from(
		{ length: codeSourceContextLimits.maxVisitedNodes - 1 },
		() => empty,
	);
	expect(
		collectCodeSourceContexts(tree, selected(tree, children)),
	).toBeUndefined();
	const omitted = annotated(tree);
	const get = vi.spyOn(tree, "get");
	const result = collect(tree, selected(tree, [...children, omitted]));
	expect(result.entries).toEqual([]);
	expect(result.truncated).toBe(true);
	expect(get).not.toHaveBeenCalled();
});

it("handles deeply nested extracted pre text without recursion or rescans", () => {
	const tree = fixture();
	const wrapper = element(tree, "span");
	let descendant = text(tree, "x");
	for (
		let depth = 0;
		depth < codeSourceContextLimits.maxVisitedNodes - 2;
		depth++
	)
		descendant = { ...wrapper, children: [descendant] };
	const pre = element(tree, "pre", [descendant], { className: "deep" });
	const result = collect(tree, pre);
	expect(result.entries[0].textCodeUnits).toBe(1);
	expect(result.entries[0].attributes).toEqual([
		{ tag: "pre", class: "deep", start: 0, end: 1 },
	]);
	expect(result.truncated).toBe(false);
});

it("handles deep outer discovery with the same visited-node budget", () => {
	const tree = fixture();
	const pre = annotated(tree);
	let root = pre;
	for (
		let depth = 0;
		depth < codeSourceContextLimits.maxVisitedNodes - 2;
		depth++
	)
		root = selected(tree, [root]);
	const result = collect(tree, root);
	expect(result.entries.map((entry) => entry.ref)).toEqual([pre.ref]);
	expect(result.truncated).toBe(false);
	const incomplete = collect(tree, selected(tree, [root]));
	expect(incomplete.entries).toEqual([]);
	expect(incomplete.truncated).toBe(true);
});

it.each([0, 1])(
	"retains only completed blocks at the visited-node bound with %i extra node",
	(extra) => {
		const tree = fixture();
		const first = annotated(tree);
		const leaf = text(tree, "");
		const second = element(
			tree,
			"pre",
			Array.from(
				{ length: codeSourceContextLimits.maxVisitedNodes - 4 + extra },
				() => leaf,
			),
			{ className: "second" },
		);
		const result = collect(tree, selected(tree, [first, second]));
		expect(result.entries).toHaveLength(extra ? 1 : 2);
		expect(result.entries[0].attributes[0].end).toBe(1);
		expect(result.truncated).toBe(extra > 0);
	},
);

it.each([0, 1])(
	"bounds total inspected pre text with %i extra UTF16 unit",
	(extra) => {
		const tree = fixture();
		const first = annotated(tree, "x".repeat(600_000));
		const second = annotated(tree, "😀".repeat(200_000) + "x".repeat(extra));
		const result = collect(tree, selected(tree, [first, second]));
		expect(result.entries.map((entry) => entry.textCodeUnits)).toEqual(
			extra ? [600_000] : [600_000, 400_000],
		);
		expect(result.entries[0].attributes[0].end).toBe(600_000);
		expect(result.truncated).toBe(extra > 0);
	},
);

it("counts ordinary pre text in the global text budget and discards incomplete ranges", () => {
	const tree = fixture();
	const ordinary = element(tree, "pre", [
		text(tree, "x".repeat(codeSourceContextLimits.maxTextCodeUnits)),
	]);
	const incomplete = element(
		tree,
		"pre",
		[element(tree, "strong", [text(tree, "x")])],
		{ className: "omitted" },
	);
	const result = collect(tree, selected(tree, [ordinary, incomplete]));
	expect(result.entries).toEqual([]);
	expect(result.truncated).toBe(true);
});

it.each(["pre", "code", "span"])(
	"omits whole overlong %s classes and still completes the text scan",
	(tag) => {
		const tree = fixture();
		const longClass = `boring ${"x".repeat(codeSourceContextLimits.maxClassCodeUnits)}`;
		const child = element(tree, tag, [text(tree, "😀")], {
			className: longClass,
		});
		const pre = tag === "pre" ? child : element(tree, "pre", [child]);
		const result = collect(tree, pre);
		expect(result.entries[0]).toEqual({
			ref: pre.ref,
			textCodeUnits: 2,
			attributes: [],
			ranges: [],
			truncated: true,
		});
		expect(result.truncated).toBe(true);
	},
);

it("accepts the exact per-class UTF16 boundary including astral characters", () => {
	const tree = fixture();
	const className = "😀".repeat(codeSourceContextLimits.maxClassCodeUnits / 2);
	const pre = element(tree, "pre", [text(tree, "x")], { className });
	const result = collect(tree, pre);
	expect(result.entries[0].attributes[0].class).toBe(className);
	expect(result.truncated).toBe(false);
	const span = element(tree, "span", [], {
		className: `boring ${"x".repeat(codeSourceContextLimits.maxClassCodeUnits - 7)}`,
		text: "x",
	});
	expect(collect(tree, element(tree, "pre", [span])).truncated).toBe(false);
});

it.each([0, 1])(
	"bounds attributes per block with %i extra attribute",
	(extra) => {
		const tree = fixture();
		const code = element(tree, "code", [], { className: "source", text: "x" });
		const count = codeSourceContextLimits.maxAttributesPerBlock + extra;
		const pre = element(
			tree,
			"pre",
			Array.from({ length: count }, () => code),
		);
		const result = collect(tree, pre);
		expect(result.entries[0].attributes).toHaveLength(
			codeSourceContextLimits.maxAttributesPerBlock,
		);
		expect(result.entries[0].textCodeUnits).toBe(count);
		expect(result.entries[0].attributes.at(-1)?.end).toBe(
			codeSourceContextLimits.maxAttributesPerBlock,
		);
		expect(result.entries[0].truncated).toBe(extra > 0);
		expect(result.truncated).toBe(extra > 0);
	},
);

it.each([0, 1])("bounds ranges per block with %i extra range", (extra) => {
	const tree = fixture();
	const span = element(tree, "span", [], { className: "boring", text: "x" });
	const count = codeSourceContextLimits.maxRangesPerBlock + extra;
	const pre = element(
		tree,
		"pre",
		Array.from({ length: count }, () => span),
		{ className: "source" },
	);
	const result = collect(tree, pre);
	expect(result.entries[0].ranges).toHaveLength(
		codeSourceContextLimits.maxRangesPerBlock,
	);
	expect(result.entries[0].textCodeUnits).toBe(count);
	expect(result.entries[0].attributes[0].end).toBe(count);
	expect(result.entries[0].truncated).toBe(extra > 0);
	expect(result.truncated).toBe(extra > 0);
});

it("bounds combined attribute and range records across blocks", () => {
	const tree = fixture();
	const code = element(tree, "code", [], { className: "source", text: "a" });
	const span = element(tree, "span", [], { className: "boring", text: "b" });
	const block = element(tree, "pre", [
		...Array.from({ length: 64 }, () => code),
		...Array.from({ length: 192 }, () => span),
	]);
	const blocks = Array.from({ length: 8 }, () => block);
	const exact = collect(tree, selected(tree, blocks));
	expect(exact.truncated).toBe(false);
	expect(
		exact.entries.reduce(
			(total, entry) => total + entry.attributes.length + entry.ranges.length,
			0,
		),
	).toBe(codeSourceContextLimits.maxRecords);
	const result = collect(
		tree,
		selected(tree, [...blocks, element(tree, "pre", [code, span])]),
	);
	expect(result.entries).toHaveLength(9);
	expect(result.entries[8]).toMatchObject({
		attributes: [],
		ranges: [],
		textCodeUnits: 2,
		truncated: true,
	});
	expect(result.truncated).toBe(true);
});

it("bounds total class units without clipping classes or dropping ranges", () => {
	const tree = fixture();
	const className = "😀".repeat(512);
	const code = element(tree, "code", [], { className });
	const first = element(
		tree,
		"pre",
		Array.from({ length: 64 }, () => code),
	);
	const exact = collect(tree, first);
	expect(
		exact.entries[0].attributes.reduce(
			(total, attribute) => total + attribute.class.length,
			0,
		),
	).toBe(codeSourceContextLimits.maxTotalClassCodeUnits);
	expect(exact.truncated).toBe(false);
	const second = element(tree, "pre", [
		element(tree, "code", [], { className: "x", text: "scaffolding" }),
		element(tree, "code", [], { className: "" }),
		element(tree, "span", [], { className: "boring", text: "😀" }),
	]);
	const result = collect(tree, selected(tree, [first, second]));
	expect(result.entries[0]).toEqual(exact.entries[0]);
	expect(result.entries[1]).toEqual({
		ref: second.ref,
		textCodeUnits: 13,
		attributes: [{ tag: "code", class: "", start: 11, end: 11 }],
		ranges: [
			{ kind: "class", tag: "span", token: "boring", start: 11, end: 13 },
		],
		truncated: true,
	});
	expect(result.truncated).toBe(true);
});

it("counts only retained class units and can retain a later fitting whole class", () => {
	const tree = fixture();
	const code = element(tree, "code", [], { className: "x".repeat(1024) });
	const first = element(tree, "pre", [
		...Array.from({ length: 63 }, () => code),
		element(tree, "code", [], { className: "x".repeat(1023) }),
	]);
	const second = element(
		tree,
		"pre",
		[element(tree, "code", [], { className: "x", text: "kept" })],
		{ className: "xx" },
	);
	const result = collect(tree, selected(tree, [first, second]));
	expect(result.entries[1]).toEqual({
		ref: second.ref,
		textCodeUnits: 4,
		attributes: [{ tag: "code", class: "x", start: 0, end: 4 }],
		ranges: [],
		truncated: true,
	});
	expect(
		result.entries.reduce(
			(total, entry) =>
				total +
				entry.attributes.reduce(
					(units, attribute) => units + attribute.class.length,
					0,
				),
			0,
		),
	).toBe(codeSourceContextLimits.maxTotalClassCodeUnits);
});

it("does not mutate native or extracted trees and returns deeply frozen metadata", () => {
	const tree = fixture();
	const pre = element(
		tree,
		"pre",
		[element(tree, "strong", [text(tree, "unchanged")])],
		{ className: "programlisting" },
	);
	const before = JSON.stringify(pre);
	const pending = [pre];
	const sources = [];
	while (pending.length) {
		const node = pending.pop();
		if (!node) break;
		sources.push(tree.get(Number(node.ref.slice(1))));
		pending.push(...(node.children ?? []));
		if (node.children) Object.freeze(node.children);
		Object.freeze(node);
	}
	const revision = tree.revision;
	const usage = tree.resourceUsage();
	const sourceSnapshot = JSON.stringify(sources);
	const result = collect(tree, pre);
	expectFrozen(result);
	expect(JSON.stringify(pre)).toBe(before);
	expect(tree.revision).toBe(revision);
	expect(tree.resourceUsage()).toEqual(usage);
	expect(JSON.stringify(sources.map((source) => tree.get(source.id)))).toBe(
		sourceSnapshot,
	);
});

it.each([
	"plain ASCII",
	"café 中文 😀",
	'quotes " and slash \\ and controls \u0001\n\t',
	"lone \ud800 and \udfff surrogates",
])(
	"fits exact serialized UTF8 budgets for %j without partial entries",
	(className) => {
		const tree = fixture();
		const first = element(
			tree,
			"pre",
			[element(tree, "strong", [text(tree, "😀")])],
			{ className },
		);
		const value = collect(
			tree,
			selected(tree, [first, annotated(tree, "second")]),
		);
		expect(fitCodeSourceContexts(value, bytes(value))).toEqual(value);
		expect(fitCodeSourceContexts(value, Number.MAX_SAFE_INTEGER)).toEqual(
			value,
		);
		const prefix = {
			...value,
			entries: value.entries.slice(0, 1),
			truncated: true,
		};
		expect(fitCodeSourceContexts(value, bytes(value) - 1)).toEqual(prefix);
		expect(fitCodeSourceContexts(value, bytes(prefix))).toEqual(prefix);
		const empty = { ...value, entries: [], truncated: true };
		expect(fitCodeSourceContexts(value, bytes(prefix) - 1)).toEqual(empty);
		expect(fitCodeSourceContexts(value, bytes(empty))).toEqual(empty);
		expect(fitCodeSourceContexts(value, bytes(empty) - 1)).toBeUndefined();
		expect(fitCodeSourceContexts(value, 0)).toBeUndefined();
		for (const budget of [bytes(value), bytes(prefix), bytes(empty)]) {
			const fitted = fitCodeSourceContexts(value, budget);
			expect(bytes(fitted)).toBeLessThanOrEqual(budget);
			if (fitted) expectFrozen(fitted);
		}
	},
);

it("retains existing truncation and does not mutate or freeze fitter input", () => {
	const tree = fixture();
	const value = collect(
		tree,
		element(tree, "pre", [element(tree, "strong", [text(tree, "x")])], {
			className: "source",
		}),
	);
	const input = JSON.parse(JSON.stringify({ ...value, truncated: true }));
	const before = JSON.stringify(input);
	const result = fitCodeSourceContexts(input, bytes(input));
	expect(result).toEqual(input);
	expect(JSON.stringify(input)).toBe(before);
	expect(Object.isFrozen(input)).toBe(false);
	expect(Object.isFrozen(input.entries)).toBe(false);
	input.entries[0].attributes[0].class = "changed";
	input.entries[0].ranges[0].end = 999;
	expect(result?.entries[0].attributes[0].class).toBe("source");
	expect(result?.entries[0].ranges[0].end).toBe(1);
	if (result) expectFrozen(result);
	const empty = { ...value, entries: [], truncated: true };
	expect(fitCodeSourceContexts(empty, bytes(empty))).toEqual(empty);
	expect(fitCodeSourceContexts(empty, bytes(empty) - 1)).toBeUndefined();
});

it.each([
	-1,
	0.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
	"1024",
	null,
	undefined,
])("rejects malformed byte budget %j using resource-limit errors", (budget) => {
	const tree = fixture();
	const value = collect(tree, annotated(tree));
	expect(() => fitCodeSourceContexts(value, budget as number)).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "Invalid code source context byte limit",
		}),
	);
});
