import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const owners: { close(): void }[] = [];
const controlPolicy = "word-break:normal;overflow-wrap:break-word";
const narrowLines = ["a", "b", "c", "d"];
const wideLines = ["ab-", "cd"];

afterEach(() => {
	const failures: unknown[] = [];
	for (const owner of owners.splice(0).reverse()) {
		try {
			owner.close();
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length)
		throw new AggregateError(failures, "Hyphen interaction cleanup failed");
});

function fixture(policy: string, content = "ab&shy;cd") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0;box-sizing:content-box;font-family:'Agent Mono';font-size:8px;font-weight:400;line-height:10px}html,body{height:60px;background:white;color:black}main{width:6px;height:50px}#target{display:inline-block;hyphens:manual;${policy}}</style><main id="host"><span id="target">${content}</span></main>`,
		"https://fixture.invalid/hyphen-emergency-interaction",
	);
	owners.push(tree);
	const queries = new DocumentQueries(tree);
	owners.push(queries);
	documentStyles(tree).setViewport(36, 60);
	const target = queries.querySelector("#target");
	const host = queries.querySelector("#host");
	const body = queries.querySelector("body");
	if (target === null || host === null || body === null)
		throw new Error("Missing native hyphen interaction fixture");
	return { tree, target, host, body };
}

type Fixture = ReturnType<typeof fixture>;

function expectLayout(current: Fixture, width: number, lines: string[]) {
	const { tree, target, host } = current;
	const reference = tree.reference(target);
	const layout = layoutDocument(tree);
	const box = layout.boxes.find((entry) => entry.ref === reference);
	const context = layout.contexts.find((entry) => entry.ref === reference);
	if (!box || !context) throw new Error("Missing native inline-block layout");
	expect(box).toMatchObject({
		contentWidth: width,
		borderBoxWidth: width,
		contentHeight: lines.length * 10,
		borderBoxHeight: lines.length * 10,
	});
	expect(
		context.lines.map((line) =>
			context.glyphs
				.slice(line.glyphStart, line.glyphEnd)
				.filter((glyph) => glyph.visible && glyph.advance > 0)
				.map((glyph) => glyph.character)
				.join(""),
		),
	).toEqual(lines);
	expect(context.lines.map((line) => [line.width, line.overflow])).toEqual(
		lines.map((line) => [line.length * 6, 0]),
	);
	const geometry = documentGeometry(tree);
	expect(geometry.getBoundingClientRect(host)).toMatchObject({
		x: 0,
		y: 0,
		width: 6,
		height: 50,
	});
	const rectangle = geometry.getBoundingClientRect(target);
	expect(rectangle).toMatchObject({
		x: 0,
		y: 0,
		width,
		height: lines.length * 10,
	});
	const rectangles = geometry.getClientRects(target);
	const raster = rasterizeDocument(tree);
	expect(raster.image).toMatchObject({ width: 36, height: 60 });
	expect(raster.metrics.paintedGlyphs).toBe(lines.join("").length);
	return { box, context, rectangle, rectangles, image: raster.image };
}

function fixedReference(width: number, lines: string[]) {
	const current = fixture(
		`width:${width}px;white-space:pre;hyphens:none;word-break:normal;overflow-wrap:normal`,
		lines.join("\n"),
	);
	return expectLayout(current, width, lines);
}

function expectMinimum(current: Fixture, minimum: number) {
	const { tree, target } = current;
	expect(
		measureIntrinsicWidths(tree).widths.find(
			(entry) => entry.ref === tree.reference(target),
		),
	).toMatchObject({ minContent: minimum, maxContent: 24 });
	expect(tree.textContent(target)).toBe("ab\u00adcd");
	expect(resolvedStyleValue(tree, target, "hyphens")).toBe("manual");
}

it.each([
	["break-word", "normal"],
	["normal", "anywhere"],
])(
	"reflows a real soft-hyphen inline-block under word-break:%s and overflow-wrap:%s",
	(wordBreak, overflowWrap) => {
		const narrowReference = fixedReference(6, narrowLines);
		const wideReference = fixedReference(18, wideLines);
		const current = fixture(
			`word-break:${wordBreak};overflow-wrap:${overflowWrap}`,
		);
		const { tree, target, host, body } = current;
		const hit = documentHitTesting(tree);
		const before = expectLayout(current, 6, narrowLines);
		const retainedBefore = structuredClone(before);
		expectMinimum(current, 6);
		expect(before.image).toEqual(narrowReference.image);
		expect(hit.elementFromPoint(9, 5)).toBe(body);
		expect(hit.elementFromPoint(3, 35)).toBe(target);
		const beforeHits = hit.elementsFromPoint(9, 5);
		const retainedHits = [...beforeHits];
		expect(resolvedStyleValue(tree, target, "word-break")).toBe(wordBreak);
		expect(resolvedStyleValue(tree, target, "overflow-wrap")).toBe(
			overflowWrap,
		);

		tree.setAttribute(target, "style", controlPolicy);
		const control = expectLayout(current, 18, wideLines);
		const retainedControl = structuredClone(control);
		expectMinimum(current, 18);
		expect(control.image).toEqual(wideReference.image);
		expect(control.image.pixels).not.toEqual(before.image.pixels);
		expect(hit.elementFromPoint(9, 5)).toBe(target);
		expect(hit.elementFromPoint(3, 35)).toBe(host);
		expect(resolvedStyleValue(tree, target, "word-break")).toBe("normal");
		expect(resolvedStyleValue(tree, target, "overflow-wrap")).toBe(
			"break-word",
		);
		expect(before).toEqual(retainedBefore);
		expect(beforeHits).toEqual(retainedHits);

		tree.removeAttribute(target, "style");
		const restored = expectLayout(current, 6, narrowLines);
		expectMinimum(current, 6);
		expect(restored.image).toEqual(narrowReference.image);
		expect(restored.rectangle).toEqual(before.rectangle);
		expect(hit.elementFromPoint(9, 5)).toBe(body);
		expect(hit.elementFromPoint(3, 35)).toBe(target);
		expect(resolvedStyleValue(tree, target, "word-break")).toBe(wordBreak);
		expect(resolvedStyleValue(tree, target, "overflow-wrap")).toBe(
			overflowWrap,
		);
		expect(before).toEqual(retainedBefore);
		expect(control).toEqual(retainedControl);
		expect(beforeHits).toEqual(retainedHits);
	},
);

it("keeps overflow-wrap:break-word's minimum independent of its used emergency wrapping", () => {
	const current = fixture(controlPolicy);
	const wideReference = fixedReference(18, wideLines);
	const narrowReference = fixedReference(6, narrowLines);
	const hit = documentHitTesting(current.tree);
	const before = expectLayout(current, 18, wideLines);
	const retainedBefore = structuredClone(before);
	expectMinimum(current, 18);
	expect(before.image).toEqual(wideReference.image);
	expect(hit.elementFromPoint(9, 5)).toBe(current.target);

	current.tree.setAttribute(current.target, "style", "width:6px");
	const constrained = expectLayout(current, 6, narrowLines);
	expectMinimum(current, 18);
	expect(constrained.image).toEqual(narrowReference.image);
	expect(hit.elementFromPoint(9, 5)).toBe(current.body);
	expect(hit.elementFromPoint(3, 35)).toBe(current.target);

	current.tree.removeAttribute(current.target, "style");
	expect(expectLayout(current, 18, wideLines).image).toEqual(
		wideReference.image,
	);
	expectMinimum(current, 18);
	expect(hit.elementFromPoint(9, 5)).toBe(current.target);
	expect(before).toEqual(retainedBefore);
});
