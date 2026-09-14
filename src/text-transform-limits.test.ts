import { afterEach, describe, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { documentElementScroll } from "./element-scroll.js";
import { prepareEditableCaret } from "./editable-caret.js";
import {
	editableSelectionLimits,
	prepareEditableSelection,
} from "./editable-selection.js";
import { AgentBrowserError } from "./errors.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { documentInteractions } from "./interactions.js";
import { rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText } from "./text-layout.js";
import { consolidateSourceGlyphs } from "./text-source-glyphs.js";
import {
	planTextTransforms,
	textTransformLimits,
	type TextTransformInput,
} from "./text-transform.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(content = "ßﬃ", css = "", attributes = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0}html,body{font-size:8px;line-height:8px;background:white}#editor{width:120px;white-space:pre-wrap;text-transform:uppercase;${css}}</style><div id="editor" contenteditable ${attributes}>${content}</div>`,
		"https://fixture.invalid/text-transform-limits",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(160, 96);
	const editor = queries.querySelector("#editor");
	if (editor === null) throw new Error("Missing casing limits editor");
	const text = tree.get(editor).children[0];
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	const select = (start: number, end = start) => {
		documentInteractions(tree).focus.focusElement(editor, {
			preventScroll: true,
		});
		owner.selection.setBaseAndExtent(text, start, text, end);
	};
	return { tree, editor, text, owner, range, select };
}

function unchanged(tree: DocumentTree, operation: () => void) {
	const revision = tree.revision;
	const source = serializeHtml(tree);
	const snapshot = snapshotDocument(tree);
	operation();
	expect(tree.revision).toBe(revision);
	expect(serializeHtml(tree)).toBe(source);
	expect(snapshotDocument(tree)).toEqual(snapshot);
	expect(tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
}

function failure(
	tree: DocumentTree,
	operation: () => unknown,
	code: "resource-limit" | "unsupported" = "resource-limit",
) {
	unchanged(tree, () => {
		expect(operation).toThrow(expect.objectContaining({ code }));
	});
}

function meter(maxWork = Number.MAX_SAFE_INTEGER) {
	let work = 0;
	return {
		charge(units = 1) {
			if (!Number.isSafeInteger(units) || units < 0)
				throw new Error("Invalid casing work charge");
			work += units;
			if (work > maxWork)
				throw new AgentBrowserError("resource-limit", "Casing test work limit");
		},
		get work() {
			return work;
		},
	};
}

function recovery(page: ReturnType<typeof fixture>, visual = "SSFFI") {
	unchanged(page.tree, () => {
		const layout = layoutDocument(page.tree);
		expect(
			layout.contexts
				.flatMap((context) => context.glyphs)
				.map((glyph) => glyph.character)
				.join(""),
		).toBe(visual);
		expect(rasterizeDocument(page.tree).metrics.paintedGlyphs).toBe(
			visual.length,
		);
		expect(
			documentGeometry(page.tree).getBoundingClientRect(page.editor).width,
		).toBe(120);
		expect(documentHitTesting(page.tree).elementFromPoint(1, 1)).toBe(
			page.editor,
		);
	});
}

describe("transformation admission and work boundaries", () => {
	it("admits exactly 50000 input owners and rejects 50001 without retained state", () => {
		const inputs: Readonly<TextTransformInput>[] = Array.from(
			{ length: textTransformLimits.maxInputs },
			(_, id) =>
				Object.freeze({
					id,
					text: id === 0 ? "ß" : "",
					transform: "uppercase",
				}),
		);
		const before = [...inputs];
		expect([...planTextTransforms(inputs, meter().charge).get(0)!]).toEqual([
			[0, "SS"],
		]);
		expect(() => planTextTransforms([...inputs, null], meter().charge)).toThrow(
			"input limit",
		);
		expect(inputs).toEqual(before);
		expect([...planTextTransforms(inputs, meter().charge).get(0)!]).toEqual([
			[0, "SS"],
		]);
	});

	it("admits 500000 source units expanding to exactly 1500000 output units", () => {
		const input = Object.freeze({
			id: 1,
			text: "ﬃ".repeat(textTransformLimits.maxInputCodeUnits),
			transform: "uppercase",
		});
		const changes = planTextTransforms([input], meter().charge).get(1)!;
		expect(changes.size).toBe(textTransformLimits.maxInputCodeUnits);
		let outputUnits = 0;
		for (const value of changes.values()) outputUnits += value.length;
		expect(outputUnits).toBe(textTransformLimits.maxOutputCodeUnits);
		expect(changes.get(0)).toBe("FFI");
		expect(changes.get(textTransformLimits.maxInputCodeUnits - 1)).toBe("FFI");
		expect(() =>
			planTextTransforms(
				[{ ...input, text: `${input.text}ﬃ` }],
				meter().charge,
			),
		).toThrow("source limit");
		expect(
			planTextTransforms(
				[{ id: 2, text: "ß", transform: "uppercase" }],
				meter().charge,
			)
				.get(2)
				?.get(0),
		).toBe("SS");
		expect(input.text.length).toBe(textTransformLimits.maxInputCodeUnits);
	});

	it("counts astral UTF-16 units and explicit context separators at source admission", () => {
		const input = Object.freeze({
			id: 1,
			text: "𐐨".repeat(textTransformLimits.maxInputCodeUnits / 2),
			transform: "none",
		});
		expect(planTextTransforms([input], meter().charge).size).toBe(0);
		expect(() => planTextTransforms([input, null], meter().charge)).toThrow(
			"source limit",
		);
		expect(
			planTextTransforms(
				[{ ...input, text: input.text.slice(2) }, null, null],
				meter().charge,
			).size,
		).toBe(0);
	});

	it.each([
		["uppercase", "ßﬃ".repeat(128), ""],
		["lowercase", `Ο${"'".repeat(256)}Σ`, ""],
		["lowercase", `I${"\u0323".repeat(256)}\u0307`, "tr"],
		["lowercase", `J${"\u0323".repeat(256)}\u0301`, "lt"],
		["capitalize", "ß ﬃ hello ".repeat(128), ""],
	])(
		"charges complete %s contextual and expanded work before returning",
		(transform, text, language) => {
			const inputs = Object.freeze([
				Object.freeze({ id: 1, text, transform, language }),
			]);
			const measured = meter();
			const baseline = planTextTransforms(inputs, measured.charge);
			expect(measured.work).toBeGreaterThan(text.length);
			for (const budget of [
				1,
				Math.floor(measured.work / 2),
				measured.work - 1,
			]) {
				expect(() => planTextTransforms(inputs, meter(budget).charge)).toThrow(
					"Casing test work limit",
				);
				expect(planTextTransforms(inputs, meter(measured.work).charge)).toEqual(
					baseline,
				);
			}
			expect(inputs[0]).toEqual({ id: 1, text, transform, language });
		},
	);

	it("retains the no-transform fast path without charging transformation character passes", () => {
		const measured = meter();
		expect(
			planTextTransforms(
				[{ id: 1, text: "a".repeat(4096), transform: "none" }],
				measured.charge,
			).size,
		).toBe(0);
		expect(measured.work).toBe(1);
	});
});

describe("native expanded layout budgets and recovery", () => {
	it.each(["maxTokens", "maxLines", "maxFragments", "maxWork"] as const)(
		"admits the exact expanded %s count and rejects one less",
		(limit) => {
			const page = fixture(
				"<span><b>ﬃ</b></span><span><b>ﬃ</b></span><span><b>ﬃ</b></span>",
				"width:18px;overflow-wrap:anywhere;",
			);
			const baseline = layoutDocumentText(page.tree);
			const metric = {
				maxTokens: "tokens",
				maxLines: "lines",
				maxFragments: "fragments",
				maxWork: "work",
			} as const;
			const required = baseline.metrics[metric[limit]];
			expect(required).toBeGreaterThan(1);
			failure(page.tree, () =>
				layoutDocumentText(page.tree, { [limit]: required - 1 }),
			);
			unchanged(page.tree, () =>
				expect(layoutDocumentText(page.tree, { [limit]: required })).toEqual(
					baseline,
				),
			);
			expect(layoutDocumentText(page.tree)).toEqual(baseline);
			expect(
				baseline.metrics,
				JSON.stringify({
					metrics: baseline.metrics,
					fragments: baseline.contexts.flatMap((context) => context.fragments),
				}),
			).toMatchObject({ tokens: 21, glyphs: 9, lines: 3, fragments: 6 });
		},
	);

	it.each([
		{ maxWork: 1 },
		{ text: { maxWork: 1 } },
		{ text: { maxTokens: 4 } },
		{ text: { formatting: { maxWork: 1 } } },
	])(
		"keeps document failures observational and recovers all native consumers: %j",
		(options) => {
			const page = fixture();
			const baseline = layoutDocument(page.tree);
			for (let attempt = 0; attempt < 2; attempt++)
				failure(page.tree, () => layoutDocument(page.tree, options));
			expect(layoutDocument(page.tree)).toEqual(baseline);
			recovery(page);
		},
	);

	it("rejects a real over-budget transformation source and recovers after replacing it", () => {
		const page = fixture("ﬃ".repeat(textTransformLimits.maxInputCodeUnits + 1));
		failure(page.tree, () => layoutDocument(page.tree));
		page.tree.setTextContent(page.editor, "ßﬃ");
		recovery(page);
	});

	it("charges inherited language metadata length and rejects exactly one work unit less", () => {
		const page = fixture("i", "", 'lang="tr"');
		const short = buildFormattingTree(page.tree);
		const language = `tr-${"a".repeat(8192)}`;
		page.tree.setAttribute(page.editor, "lang", language);
		const long = buildFormattingTree(page.tree);
		expect(long.metrics.work - short.metrics.work).toBe(language.length - 2);
		expect(
			long.nodes
				.filter((node) => node.kind === "text")
				.map((node) => node.language),
		).toEqual([""]);
		failure(page.tree, () =>
			buildFormattingTree(page.tree, { maxWork: long.metrics.work - 1 }),
		);
		expect(
			buildFormattingTree(page.tree, { maxWork: long.metrics.work }),
		).toEqual(long);
		page.tree.setAttribute(page.editor, "lang", "tr");
		expect(
			layoutDocument(page.tree)
				.contexts.flatMap((context) => context.glyphs)
				.map((glyph) => glyph.character),
		).toEqual(["İ"]);
	});

	it.each([
		[255, "\u0130"],
		[256, "I"],
	] as const)(
		"bounds actual content-language normalization at %i code units",
		(length, expected) => {
			const language = `tr-aaaaaaaa${"-a".repeat(122)}${length === 256 ? "a" : ""}`;
			expect(language.length).toBe(length);
			const page = fixture("i", "", `lang="${language}"`);
			const formatting = buildFormattingTree(page.tree);
			failure(page.tree, () =>
				buildFormattingTree(page.tree, {
					maxWork: formatting.metrics.work - 1,
				}),
			);
			expect(
				buildFormattingTree(page.tree, { maxWork: formatting.metrics.work }),
			).toEqual(formatting);
			unchanged(page.tree, () => {
				expect(
					layoutDocument(page.tree)
						.contexts.flatMap((context) => context.glyphs)
						.map((glyph) => glyph.character),
				).toEqual([expected]);
			});
		},
	);

	it("bounds attribute and ancestor language lookup with shared inherited metadata", () => {
		const attributes = Array.from(
			{ length: 128 },
			(_, index) => `data-limit-${index}="x"`,
		).join(" ");
		const page = fixture(
			`${`<span ${attributes}>`.repeat(16)}${"<b>i</b>".repeat(64)}${"</span>".repeat(16)}`,
			"",
			'lang="tr"',
		);
		const baseline = buildFormattingTree(page.tree);
		expect(
			baseline.nodes
				.filter((node) => node.kind === "text")
				.map((node) => node.language),
		).toEqual(Array(64).fill("tr"));
		failure(page.tree, () =>
			buildFormattingTree(page.tree, { maxWork: baseline.metrics.work - 1 }),
		);
		expect(
			buildFormattingTree(page.tree, { maxWork: baseline.metrics.work }),
		).toEqual(baseline);
		failure(page.tree, () => buildFormattingTree(page.tree, { maxDepth: 8 }));
		expect(buildFormattingTree(page.tree)).toEqual(baseline);
	});

	it("retains immutable transformed source snapshots across failure, mutation and close", () => {
		const page = fixture();
		page.range.setStart(page.text, 0);
		page.range.setEnd(page.text, 2);
		const first = layoutDocument(page.tree);
		const glyphs = first.contexts.flatMap((context) => context.glyphs);
		const copies = glyphs.map((glyph) => ({ ...glyph }));
		const rects = rangeClientRects(page.range);
		const rectangles = rects.map((rect) => ({ ...rect }));
		const geometry = documentGeometry(page.tree);
		const hits = documentHitTesting(page.tree);
		failure(page.tree, () => rasterizeDocument(page.tree, { maxWork: 1 }));
		expect(page.range.toString()).toBe("ßﬃ");
		page.tree.setTextContent(page.editor, "a");
		recovery(page, "A");
		page.tree.close();
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
		expect(glyphs).toEqual(copies);
		expect(rects).toEqual(rectangles);
		expect(Object.isFrozen(first)).toBe(true);
		expect(
			first.contexts.every((context) => Object.isFrozen(context.glyphs)),
		).toBe(true);
		expect(glyphs.every(Object.isFrozen)).toBe(true);
		expect(Object.isFrozen(rects)).toBe(true);
		expect(rects.every(Object.isFrozen)).toBe(true);
	});
});

describe("bounded source consolidation and editable recovery", () => {
	it("charges every expanded glyph and source key before returning consolidated geometry", () => {
		const page = fixture("ßﬃ".repeat(128));
		const glyphs = layoutDocument(page.tree).contexts.flatMap(
			(context) => context.glyphs,
		);
		const copies = glyphs.map((glyph) => ({ ...glyph }));
		const measured = meter();
		const baseline = [...consolidateSourceGlyphs(glyphs, measured.charge)];
		expect(baseline).toHaveLength(256);
		expect(measured.work).toBe(
			glyphs.length +
				baseline.reduce((work, glyph) => work + glyph.ref.length, 0),
		);
		for (const budget of [1, measured.work - 1]) {
			failure(page.tree, () => [
				...consolidateSourceGlyphs(glyphs, meter(budget).charge),
			]);
			expect([
				...consolidateSourceGlyphs(glyphs, meter(measured.work).charge),
			]).toEqual(baseline);
		}
		expect(glyphs).toEqual(copies);
		expect(baseline.every(Object.isFrozen)).toBe(true);
	});

	it("admits exact expanded range rectangle counts and recovers from source and work caps", () => {
		const page = fixture(Array(32).fill("ﬃ").join("\n"));
		page.range.setStart(page.text, 0);
		page.range.setEnd(page.text, 63);
		const baseline = rangeClientRects(page.range);
		expect(baseline).toHaveLength(32);
		expect(baseline.every((rect) => rect.width === 18)).toBe(true);
		for (const options of [
			{ maxRectangles: 31 },
			{ maxNodes: 1 },
			{ maxWork: 1 },
		]) {
			failure(page.tree, () => rangeClientRects(page.range, options));
			expect(rangeClientRects(page.range, { maxRectangles: 32 })).toEqual(
				baseline,
			);
		}
		expect(page.range.toString()).toBe(Array(32).fill("ﬃ").join("\n"));
	});

	it("clears failed native selection mappings and preserves selection and caret recovery", () => {
		const page = fixture();
		page.select(0, 2);
		const layout = layoutDocument(page.tree);
		const baseline = prepareEditableSelection(page.tree, layout);
		expect(baseline.status).toBe("ready");
		expect(baseline.glyphs.size).toBe(2);
		for (const budget of [1, 16, 128]) {
			unchanged(page.tree, () => {
				const limited = prepareEditableSelection(page.tree, layout, budget);
				expect(limited.status).toBe("limited");
				expect(limited.glyphs.size).toBe(0);
				expect(limited.work).toBeLessThanOrEqual(budget);
			});
			expect(page.owner.selection.toString()).toBe("ßﬃ");
			expect(prepareEditableSelection(page.tree, layout)).toEqual(baseline);
		}
		page.select(2);
		expect(prepareEditableCaret(page.tree, layout, 1).status).toBe("limited");
		expect(prepareEditableCaret(page.tree, layout)).toMatchObject({
			status: "ready",
			anchor: { x: 30 },
		});
	});

	it("admits 4096 consolidated selected sources and clears source 4097 without raising caps", () => {
		const count = editableSelectionLimits.maxGlyphs;
		const page = fixture("ß".repeat(count + 1), "width:60000px;");
		const layout = layoutDocument(page.tree);
		page.select(0, count);
		const admitted = prepareEditableSelection(page.tree, layout);
		expect(admitted.status).toBe("ready");
		expect(admitted.glyphs.size).toBe(count);
		page.select(0, count + 1);
		const limited = prepareEditableSelection(page.tree, layout);
		expect(limited.status).toBe("limited");
		expect(limited.glyphs.size).toBe(0);
		page.select(0, count);
		expect(prepareEditableSelection(page.tree, layout)).toEqual(admitted);
	});
});

describe("unsupported profile guards survive casing", () => {
	it("clips and scrolls expanded uppercase glyphs without changing source text", () => {
		const page = fixture(
			"ßﬃ",
			"width:18px;height:8px;white-space:pre;overflow:hidden;",
		);
		expect(
			buildFormattingTree(page.tree).issues["overflow-layout-not-supported"],
		).toBeUndefined();
		expect(
			layoutDocument(page.tree)
				.contexts.flatMap((context) => context.glyphs)
				.map((glyph) => glyph.character)
				.join(""),
		).toBe("SSFFI");
		page.range.setStart(page.text, 0);
		page.range.setEnd(page.text, 2);
		expect(rangeClientRects(page.range).at(-1)?.right).toBe(30);
		const scroll = documentElementScroll(page.tree);
		expect(scroll.get(page.editor)).toMatchObject({
			scrollWidth: 30,
			scrollHeight: 8,
		});
		const source = serializeHtml(page.tree);
		scroll.to(page.editor, 12, 0);
		expect(scroll.get(page.editor).scrollLeft).toBe(12);
		expect(rangeClientRects(page.range)[0].x).toBe(-12);
		expect(rangeClientRects(page.range).at(-1)?.right).toBe(18);
		expect(
			documentGeometry(page.tree).getBoundingClientRect(page.editor),
		).toMatchObject({ x: 0, y: 0, width: 18, height: 8 });
		expect(documentHitTesting(page.tree).elementFromPoint(1, 1)).toBe(
			page.editor,
		);
		expect(
			documentHitTesting(page.tree).elementsFromPoint(19, 1),
		).not.toContain(page.editor);
		expect(rasterizeDocument(page.tree).image.width).toBe(160);
		expect(page.range.toString()).toBe("ßﬃ");
		expect(page.tree.textContent(page.editor)).toBe("ßﬃ");
		expect(serializeHtml(page.tree)).toBe(source);
		page.tree.setAttribute(
			page.editor,
			"style",
			"width:120px;height:auto;white-space:pre-wrap;overflow:visible",
		);
		recovery(page);
	});

	it.each([
		"text-transform:full-width",
		"text-transform:full-size-kana",
		"text-transform:uppercase full-width",
		"text-transform:capitalize full-size-kana",
		"writing-mode:vertical-rl",
		"direction:rtl",
		"unicode-bidi:bidi-override",
	])("rejects %s across native consumers without mutating source", (style) => {
		const page = fixture();
		page.tree.setAttribute(page.editor, "style", style);
		for (const operation of [
			() => layoutDocument(page.tree),
			() => rasterizeDocument(page.tree),
			() => documentGeometry(page.tree).getBoundingClientRect(page.editor),
			() => documentHitTesting(page.tree).elementFromPoint(1, 1),
		])
			failure(page.tree, operation, "unsupported");
		page.tree.removeAttribute(page.editor, "style");
		recovery(page);
	});

	it.each(["i\u0307", "ß\u200f", "ßא", "ß\u202e", "ß\u2067"])(
		"keeps shaped or bidi source %j out of range and selection geometry",
		(source) => {
			const page = fixture(source);
			page.range.setStart(page.text, 0);
			page.range.setEnd(page.text, source.length);
			failure(page.tree, () => rangeClientRects(page.range), "unsupported");
			page.select(0, source.length);
			const layout = layoutDocument(page.tree);
			const selection = prepareEditableSelection(page.tree, layout);
			expect(selection.status).toBe("unsupported");
			expect(selection.glyphs.size).toBe(0);
			expect(page.range.toString()).toBe(source);
			expect(page.tree.textContent(page.editor)).toBe(source);
			page.tree.setTextContent(page.editor, "ßﬃ");
			recovery(page);
		},
	);
});
