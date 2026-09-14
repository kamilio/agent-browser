import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import {
	type DocumentLayoutOptions,
	documentLayoutLimits,
	layoutDocument,
} from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { layoutValueLimits } from "./layout-values.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";
import { textLayoutLimits } from "./text-layout.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(content = '<span id="text">AA BB CC</span>', css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0}html,body{font-size:8px;line-height:8px;background:white}#main{width:24px;text-indent:6px}${css}</style><main id="main">${content}</main>`,
		"https://fixture.invalid/text-indent-limits",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(96, 96);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing indent limit fixture ${selector}`);
		return found;
	};
	return { tree, id };
}

function expectFailure(
	tree: DocumentTree,
	operation: () => unknown,
	code: "unsupported" | "resource-limit" | "invalid-input",
) {
	const revision = tree.revision;
	const before = snapshotDocument(tree);
	const source = serializeHtml(tree);
	expect(operation).toThrow(expect.objectContaining({ code }));
	expect(tree.revision).toBe(revision);
	expect(snapshotDocument(tree)).toEqual(before);
	expect(serializeHtml(tree)).toBe(source);
	expect(tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
}

function expectRecovery(page: ReturnType<typeof fixture>) {
	const result = layoutDocument(page.tree);
	expect(result.metrics).toMatchObject({ glyphs: 6, lines: 3 });
	expect(result.contexts.flatMap((context) => context.glyphs)).toMatchObject([
		{ character: "A", x: 6, y: 0 },
		{ character: "A", x: 12, y: 0 },
		{ character: "B", x: 0, y: 8 },
		{ character: "B", x: 6, y: 8 },
		{ character: "C", x: 0, y: 16 },
		{ character: "C", x: 6, y: 16 },
	]);
	expect(
		documentGeometry(page.tree).getBoundingClientRect(page.id("#main")),
	).toMatchObject({
		x: 0,
		y: 0,
		width: 24,
		height: 24,
	});
	expect(documentHitTesting(page.tree).elementFromPoint(7, 1)).toBe(
		page.id("#text"),
	);
	expect(rasterizeDocument(page.tree).metrics.paintedGlyphs).toBe(6);
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
	"fails closed on $name without retaining partial indentation",
	({ options }) => {
		const page = fixture();
		const baseline = layoutDocument(page.tree);
		for (let attempt = 0; attempt < 2; attempt++)
			expectFailure(
				page.tree,
				() => layoutDocument(page.tree, options),
				"resource-limit",
			);
		expect(layoutDocument(page.tree)).toEqual(baseline);
		expectRecovery(page);
	},
);

it("admits the exact work budget and rejects one less without raising the maximum", () => {
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
			layoutDocument(page.tree, { maxWork: documentLayoutLimits.maxWork + 1 }),
		"invalid-input",
	);
	expectRecovery(page);
});

it("counts the actual indented soft lines and fragments at their exact bounds", () => {
	const page = fixture();
	const baseline = layoutDocument(page.tree);
	expect(baseline.text.metrics).toMatchObject({ lines: 3, fragments: 3 });
	expect(
		layoutDocument(page.tree, { text: { maxLines: 3, maxFragments: 3 } }),
	).toEqual(baseline);
	for (const text of [{ maxLines: 2 }, { maxFragments: 2 }])
		expectFailure(
			page.tree,
			() => layoutDocument(page.tree, { text }),
			"resource-limit",
		);
	expectRecovery(page);
});

it.each([
	{ maxLines: 0 },
	{ maxFragments: textLayoutLimits.maxFragments + 1 },
	{ maxTokens: 1.5 },
	{ maxWork: textLayoutLimits.maxWork + 1 },
])("does not relax text limit validation for indented content: %j", (text) => {
	const page = fixture();
	expectFailure(
		page.tree,
		() => layoutDocument(page.tree, { text }),
		"invalid-input",
	);
	expectRecovery(page);
});

it.each([1, -1])(
	"bounds signed indentation coordinates for sign %s and recovers",
	(sign) => {
		const page = fixture();
		page.tree.setAttribute(
			page.id("#main"),
			"style",
			`text-indent:${sign * (layoutValueLimits.maxAbsoluteLength + 1)}px`,
		);
		for (const operation of [
			() => layoutDocument(page.tree),
			() => documentGeometry(page.tree).getBoundingClientRect(page.id("#text")),
			() => rasterizeDocument(page.tree),
			() => documentHitTesting(page.tree).elementFromPoint(7, 1),
		])
			expectFailure(page.tree, operation, "resource-limit");
		page.tree.removeAttribute(page.id("#main"), "style");
		expectRecovery(page);
	},
);

it("retains the formatting depth guard for inherited indentation", () => {
	const page = fixture(
		`${"<div>".repeat(6)}<span id="text">AA BB CC</span>${"</div>".repeat(6)}`,
	);
	expectFailure(
		page.tree,
		() => layoutDocument(page.tree, { text: { formatting: { maxDepth: 4 } } }),
		"resource-limit",
	);
	expectRecovery(page);
});

it("releases failed hit owners and keeps raster work failure observational", () => {
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
			() => limited.elementFromPoint(7, 1),
			"resource-limit",
		);
	} finally {
		limited.close();
	}
	expect(limited.metrics()).toMatchObject({ closed: true, regions: 0 });
	expectRecovery(page);
});

it("retains immutable source-mapped snapshots while closing all document owners", () => {
	const page = fixture();
	const geometry = documentGeometry(page.tree);
	const hits = documentHitTesting(page.tree);
	expectRecovery(page);
	const first = layoutDocument(page.tree);
	const context = first.contexts.find(
		(entry) => entry.ref === page.tree.reference(page.id("#main")),
	);
	if (!context) throw new Error("Missing retained indentation context");
	const original = context.glyphs.map((glyph) => ({ ...glyph }));
	page.tree.setAttribute(page.id("#main"), "style", "text-indent:12px");
	page.tree.setTextContent(page.id("#text"), "DD");
	const second = layoutDocument(page.tree);
	expect(second.contexts.flatMap((entry) => entry.glyphs)).toMatchObject([
		{ character: "D", x: 12, y: 0 },
		{ character: "D", x: 18, y: 0 },
	]);
	page.tree.close();
	expect(page.tree.nodeCount).toBe(0);
	expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(context.glyphs).toEqual(original);
	expect(Object.isFrozen(first)).toBe(true);
	expect(Object.isFrozen(context.glyphs)).toBe(true);
	expect(context.glyphs.every(Object.isFrozen)).toBe(true);
	expect(first.metrics).toMatchObject({ glyphs: 6, lines: 3 });
	expect(second.metrics).toMatchObject({ glyphs: 2, lines: 1 });
});

it("keeps independent document ownership when another indented document closes", () => {
	const first = fixture();
	const second = fixture();
	expectRecovery(first);
	expectRecovery(second);
	first.tree.close();
	expectRecovery(second);
});

it.each(["hidden", "auto"])(
	"preserves indentation while clipping and scrolling overflow:%s",
	(overflow) => {
		const page = fixture(undefined, `#main{overflow:${overflow}}`);
		expect(
			buildFormattingTree(page.tree).issues["overflow-layout-not-supported"],
		).toBeUndefined();
		expectRecovery(page);
		page.tree.setAttribute(page.id("#main"), "style", "height:8px");
		const scroll = documentElementScroll(page.tree);
		expect(scroll.get(page.id("#main"))).toMatchObject({
			scrollWidth: 24,
			scrollHeight: 24,
		});
		const source = serializeHtml(page.tree);
		scroll.to(page.id("#main"), 0, 8);
		expect(scroll.get(page.id("#main")).scrollTop).toBe(8);
		const geometry = documentGeometry(page.tree);
		expect(geometry.getClientRects(page.id("#text"))[0]).toMatchObject({
			x: 6,
			y: -8,
		});
		expect(geometry.getBoundingClientRect(page.id("#main"))).toMatchObject({
			x: 0,
			y: 0,
			width: 24,
			height: 8,
		});
		expect(documentHitTesting(page.tree).elementFromPoint(1, 1)).toBe(
			page.id("#text"),
		);
		expect(documentHitTesting(page.tree).elementsFromPoint(7, 9)).not.toContain(
			page.id("#text"),
		);
		expect(serializeHtml(page.tree)).toBe(source);
		page.tree.setAttribute(page.id("#main"), "style", "overflow:visible");
		expectRecovery(page);
	},
);

it("keeps the unsupported writing-mode guard on indented content", () => {
	const page = fixture(undefined, "#main{writing-mode:vertical-rl}");
	expect(
		buildFormattingTree(page.tree).issues["css:unimplemented-css-property"],
	).toBeGreaterThan(0);
	expectFailure(page.tree, () => layoutDocument(page.tree), "unsupported");
});

it("keeps the unsupported HTML RTL direction guard rather than assuming an LTR indent", () => {
	const page = fixture();
	page.tree.setAttribute(page.id("#main"), "dir", "rtl");
	expect(
		buildFormattingTree(page.tree).issues["html-direction-not-supported"],
	).toBeGreaterThan(0);
	expectFailure(page.tree, () => layoutDocument(page.tree), "unsupported");
	page.tree.removeAttribute(page.id("#main"), "dir");
	expectRecovery(page);
});
