import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import {
	type DocumentLayoutOptions,
	documentLayoutLimits,
	layoutDocument,
} from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { layoutValueLimits } from "./layout-values.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(content = '<div id="child">AA</div>', css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0;font-size:8px;line-height:8px}html,body{background:white}#container{width:48px;height:32px;align-content:center}#child{width:24px;height:8px}${css}</style><div id="container">${content}</div>`,
		"https://fixture.invalid/block-content-alignment-limits",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(96, 96);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing alignment limit ${selector}`);
		return found;
	};
	return { tree, id };
}

function expectFailure(
	tree: DocumentTree,
	operation: () => unknown,
	code: "unsupported" | "resource-limit" | "invalid-input",
	message?: RegExp,
) {
	const revision = tree.revision;
	const before = snapshotDocument(tree);
	const source = serializeHtml(tree);
	expect(operation).toThrow(
		expect.objectContaining({
			code,
			...(message ? { message: expect.stringMatching(message) } : {}),
		}),
	);
	expect(tree.revision).toBe(revision);
	expect(snapshotDocument(tree)).toEqual(before);
	expect(serializeHtml(tree)).toBe(source);
	expect(tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
}

function expectSimpleRecovery(page: ReturnType<typeof fixture>) {
	expect(
		documentGeometry(page.tree).getBoundingClientRect(page.id("#child")),
	).toMatchObject({ x: 0, y: 12, width: 24, height: 8 });
	expect(layoutDocument(page.tree).metrics.glyphs).toBe(2);
	expect(documentHitTesting(page.tree).elementFromPoint(1, 13)).toBe(
		page.id("#child"),
	);
	expect(rasterizeDocument(page.tree).metrics.paintedGlyphs).toBe(2);
}

it.each<{ name: string; options: DocumentLayoutOptions }>([
	{ name: "document work", options: { maxWork: 1 } },
	{ name: "text work", options: { text: { maxWork: 1 } } },
	{ name: "tokens", options: { text: { maxTokens: 1 } } },
	{ name: "lines", options: { text: { maxLines: 1 } } },
	{ name: "fragments", options: { text: { maxFragments: 1 } } },
	{
		name: "formatting boxes",
		options: { text: { formatting: { maxBoxes: 1 } } },
	},
])(
	"fails closed on $name and recovers without retaining partial aligned output",
	({ options }) => {
		const page = fixture(
			'<div id="child"><span>AA</span><br><span>BB</span></div>',
			"#child{height:auto}",
		);
		const baseline = layoutDocument(page.tree);
		for (let attempt = 0; attempt < 2; attempt++)
			expectFailure(
				page.tree,
				() => layoutDocument(page.tree, options),
				"resource-limit",
			);
		const recovered = layoutDocument(page.tree);
		expect(recovered).toEqual(baseline);
		expect(recovered.metrics).toMatchObject({ glyphs: 4, lines: 2 });
		expect(
			documentGeometry(page.tree).getBoundingClientRect(page.id("#child")),
		).toMatchObject({ y: 8, height: 16 });
		expect(
			recovered.contexts.flatMap((context) => context.glyphs),
		).toMatchObject([
			{ character: "A", x: 0, y: 8 },
			{ character: "A", x: 6, y: 8 },
			{ character: "B", x: 0, y: 16 },
			{ character: "B", x: 6, y: 16 },
		]);
	},
);

it("charges alignment work at the exact admitted budget without increasing the capacity", () => {
	const page = fixture();
	const baseline = layoutDocument(page.tree);
	const required = baseline.metrics.work;
	expect(Number.isSafeInteger(required)).toBe(true);
	expect(required).toBeGreaterThan(1);
	expect(required).toBeLessThanOrEqual(documentLayoutLimits.maxWork);
	expectFailure(
		page.tree,
		() => layoutDocument(page.tree, { maxWork: required - 1 }),
		"resource-limit",
	);
	expect(layoutDocument(page.tree, { maxWork: required })).toEqual(baseline);
	expectFailure(
		page.tree,
		() =>
			layoutDocument(page.tree, {
				maxWork: documentLayoutLimits.maxWork + 1,
			}),
		"invalid-input",
	);
	expectSimpleRecovery(page);
});

it("preserves independent atomic nesting bounds and unwinds after a failing subtree is removed", () => {
	const page = fixture(
		`${'<div class="aligned"><div class="atom">'.repeat(34)}AA${"</div></div>".repeat(34)}`,
		".aligned{width:24px;align-content:center}.atom{display:inline-block;width:24px}",
	);
	expectFailure(
		page.tree,
		() => layoutDocument(page.tree),
		"resource-limit",
		/nesting limit/i,
	);
	page.tree.setTextContent(page.id("#container"), "");
	const child = page.tree.createElement("div", { id: "child" });
	page.tree.append(page.id("#container"), child);
	page.tree.setTextContent(child, "AA");
	expectSimpleRecovery(page);
});

it("retains the configurable formatting depth guard across aligned block owners", () => {
	const page = fixture(
		`${'<div class="aligned">'.repeat(6)}<div id="child">AA</div>${"</div>".repeat(6)}`,
		".aligned{align-content:start}",
	);
	expectFailure(
		page.tree,
		() => layoutDocument(page.tree, { text: { formatting: { maxDepth: 4 } } }),
		"resource-limit",
		/depth limit/i,
	);
	expectSimpleRecovery(page);
});

it("rejects excessive aligned coordinates and recovers after the offending style is removed", () => {
	const page = fixture();
	page.tree.setAttribute(
		page.id("#container"),
		"style",
		`height:${layoutValueLimits.maxAbsoluteLength + 1}px;align-content:end`,
	);
	expectFailure(
		page.tree,
		() => layoutDocument(page.tree),
		"resource-limit",
		/length limit/i,
	);
	page.tree.removeAttribute(page.id("#container"), "style");
	expectSimpleRecovery(page);
});

it("keeps raster and hit work limits fail-closed and releases failed hit owners", () => {
	const page = fixture();
	expectFailure(
		page.tree,
		() => rasterizeDocument(page.tree, { maxWork: 1 }),
		"resource-limit",
	);
	const limited = new DocumentHitTesting(page.tree, { maxWork: 1 });
	try {
		expectFailure(
			page.tree,
			() => limited.elementFromPoint(1, 13),
			"resource-limit",
		);
	} finally {
		limited.close();
	}
	expect(limited.metrics()).toMatchObject({ closed: true, regions: 0 });
	expectSimpleRecovery(page);
	const geometry = documentGeometry(page.tree);
	const hits = documentHitTesting(page.tree);
	page.tree.close();
	expect(page.tree.nodeCount).toBe(0);
	expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
});

it.each(["baseline", "last baseline"])(
	"retains the ordinary block %s alignment diagnostic",
	(alignment) => {
		const page = fixture(undefined, `#container{align-content:${alignment}}`);
		expect(
			buildFormattingTree(page.tree).issues[
				"block-content-alignment-not-supported"
			],
		).toBeGreaterThan(0);
		for (const operation of [
			() => layoutDocument(page.tree),
			() =>
				documentGeometry(page.tree).getBoundingClientRect(page.id("#child")),
			() => rasterizeDocument(page.tree),
			() => documentHitTesting(page.tree).elementFromPoint(1, 1),
		])
			expectFailure(page.tree, operation, "unsupported");
		page.tree.setAttribute(
			page.id("#container"),
			"style",
			"align-content:center",
		);
		expectSimpleRecovery(page);
	},
);

it.each(["hidden", "auto"])(
	"does not silently add overflow:%s layout or scrolling",
	(overflow) => {
		const page = fixture(undefined, `#container{overflow:${overflow}}`);
		expect(
			buildFormattingTree(page.tree).issues["overflow-layout-not-supported"],
		).toBeGreaterThan(0);
		expectFailure(page.tree, () => layoutDocument(page.tree), "unsupported");
		page.tree.setAttribute(page.id("#container"), "style", "overflow:visible");
		expectSimpleRecovery(page);
	},
);

it("does not hide the unsupported writing-mode diagnostic inside aligned content", () => {
	const page = fixture(undefined, "#child{writing-mode:vertical-rl}");
	expect(
		buildFormattingTree(page.tree).issues["css:unimplemented-css-property"],
	).toBeGreaterThan(0);
	expectFailure(page.tree, () => layoutDocument(page.tree), "unsupported");
});

it("does not invent a table-cell baseline for a replaced input inside aligned content", () => {
	const page = fixture(
		'<table><tr><td><input value="A"></td></tr></table>',
		"table{width:40px;border-spacing:0}td{vertical-align:baseline}",
	);
	expectFailure(
		page.tree,
		() => layoutDocument(page.tree),
		"unsupported",
		/Table baseline alignment requires supported cell content baselines/,
	);
});

it("guards table-cell align-content independently of the ordinary aligned block foundation", () => {
	const page = fixture(
		'<table><tr><td id="cell"><div id="child">AA</div></td></tr></table>',
		"table{width:40px;border-spacing:0}td{vertical-align:top}#cell{align-content:center}",
	);
	expect(
		buildFormattingTree(page.tree).issues[
			"block-content-alignment-not-supported"
		],
	).toBeGreaterThan(0);
	for (const operation of [
		() => layoutDocument(page.tree),
		() => documentGeometry(page.tree).getBoundingClientRect(page.id("#cell")),
		() => rasterizeDocument(page.tree),
		() => documentHitTesting(page.tree).elementFromPoint(1, 1),
	])
		expectFailure(page.tree, operation, "unsupported");
	page.tree.setAttribute(page.id("#cell"), "style", "align-content:normal");
	expectSimpleRecovery(page);
});

it("keeps real HTML button descendants guarded rather than substituting a flattened caption", () => {
	const page = fixture(
		'<button id="button" type="button"><span id="child">AA</span></button>',
		"#button{display:inline-block;width:24px;height:16px;align-content:center}",
	);
	for (const operation of [
		() => buildFormattingTree(page.tree),
		() => layoutDocument(page.tree),
		() => documentGeometry(page.tree).getBoundingClientRect(page.id("#button")),
		() => rasterizeDocument(page.tree),
		() => documentHitTesting(page.tree).elementFromPoint(1, 1),
	])
		expectFailure(
			page.tree,
			operation,
			"unsupported",
			/Rich button content layout is not implemented/,
		);
	expect(page.tree.get(page.id("#button")).children).toContain(
		page.id("#child"),
	);
	page.tree.remove(page.id("#button"));
	const child = page.tree.createElement("div", { id: "child" });
	page.tree.append(page.id("#container"), child);
	page.tree.setTextContent(child, "AA");
	expectSimpleRecovery(page);
});
