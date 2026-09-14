import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText } from "./text-layout.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	const errors: unknown[] = [];
	for (const tree of trees.splice(0)) {
		try {
			tree.close();
			expect(tree.nodeCount).toBe(0);
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length) throw new AggregateError(errors, "Fixture cleanup failed");
});

function fixture(
	content: string,
	css = "word-break:break-word;overflow-wrap:normal",
	width = 6,
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0}body{font-family:'Agent Mono';font-size:8px;line-height:10px}main{width:${width}px;${css}}</style><main id="target">${content}</main>`,
		"https://fixture.invalid/hyphen-emergency",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const identifier = queries.querySelector("#target");
	if (identifier === null) throw new Error("Missing min-content fixture");
	documentStyles(tree).setViewport(120, 160);
	const ref = tree.reference(identifier);
	const intrinsic = () => {
		const measurement = measureIntrinsicWidths(tree);
		const width = measurement.widths.find((entry) => entry.ref === ref);
		if (!width) throw new Error("Missing intrinsic width");
		return { ...width, metrics: measurement.metrics };
	};
	const context = () => {
		const result = layoutDocumentText(tree).contexts.find(
			(entry) => entry.ref === ref,
		);
		if (!result) throw new Error("Missing text context");
		return result;
	};
	const lines = () => {
		const result = context();
		return result.lines.map((line) =>
			result.glyphs
				.slice(line.glyphStart, line.glyphEnd)
				.map((glyph) => glyph.character)
				.join(""),
		);
	};
	return { tree, identifier, intrinsic, context, lines };
}

for (const policy of [
	"word-break:break-word;overflow-wrap:normal",
	"word-break:break-word;overflow-wrap:break-word",
	"word-break:normal;overflow-wrap:anywhere",
	"word-break:normal;word-wrap:anywhere",
]) {
	it.each([
		"ab\u00adcd",
		"ab\u00adcd\u00adef",
		"a\u00adbcdefgh",
		"abcd\u00adef",
	])(
		`combines discretionary and emergency minima for ${policy} in %j`,
		(source) => {
			const page = fixture(source, policy);
			const visible = source.replaceAll("\u00ad", "");
			expect(page.lines()).toEqual(Array.from(visible));
			expect(page.intrinsic()).toMatchObject({
				minContent: 6,
				maxContent: visible.length * 6,
			});
			expect(page.tree.textContent(page.identifier)).toBe(source);
		},
	);
}

it.each([
	["normal", ["ab-", "cd"]],
	["break-word", ["a", "b", "c", "d"]],
] as const)(
	"retains the independent overflow-wrap:%s minimum",
	(policy, lines) => {
		const page = fixture("ab\u00adcd", `overflow-wrap:${policy}`);
		expect(page.intrinsic()).toMatchObject({ minContent: 18, maxContent: 24 });
		expect(page.lines()).toEqual(lines);
	},
);

it.each(["none", "manual", "auto"])(
	"retains source offsets and emergency minima under hyphens:%s",
	(policy) => {
		const page = fixture(
			"ab\u00adcd",
			`overflow-wrap:anywhere;hyphens:${policy}`,
		);
		expect(page.intrinsic()).toMatchObject({ minContent: 6, maxContent: 24 });
		expect(page.lines()).toEqual(["a", "b", "c", "d"]);
		expect(
			page
				.context()
				.glyphs.filter((glyph) => glyph.character)
				.map((glyph) => glyph.offset),
		).toEqual([0, 1, 3, 4]);
	},
);

it.each([
	[6, ["a", "b", "c", "d"]],
	[12, ["ab", "cd"]],
	[18, ["ab-", "cd"]],
	[24, ["abcd"]],
] as const)(
	"preserves actual used-layout hyphen priority at %ipx",
	(width, lines) => {
		const page = fixture("ab\u00adcd", undefined, width);
		expect(page.lines()).toEqual(lines);
		expect(page.intrinsic()).toMatchObject({ minContent: 6, maxContent: 24 });
	},
);

it("keeps leading and trailing markers invisible without empty minimum lines", () => {
	const page = fixture("\u00adab\u00ad");
	expect(page.lines()).toEqual(["a", "b"]);
	expect(page.intrinsic()).toMatchObject({ minContent: 6, maxContent: 12 });
});

it("keeps repeated discretionary emergency measurement work bounded", () => {
	const short = fixture(`${"ab\u00ad".repeat(128)}z`);
	const long = fixture(`${"ab\u00ad".repeat(256)}z`);
	const smaller = short.intrinsic();
	const larger = long.intrinsic();
	expect(larger.metrics.minText.work).toBeLessThan(
		smaller.metrics.minText.work * 2.6,
	);
	expect(smaller).toMatchObject({ minContent: 6, maxContent: 1542 });
	expect(larger).toMatchObject({ minContent: 6, maxContent: 3078 });
	for (const text of [{ maxTokens: 3 }, { maxLines: 3 }, { maxWork: 40 }])
		expect(() => measureIntrinsicWidths(long.tree, { text })).toThrow(
			/limit exceeded/,
		);
	expect(long.intrinsic().minContent).toBe(6);
});

it("retains manual islands and their work rejection inside an emergency word", () => {
	const page = fixture(
		`<span style="overflow-wrap:normal">${"ab\u00ad".repeat(32)}z</span>x\u00ady`,
		"word-break:normal;overflow-wrap:anywhere",
	);
	const measured = page.intrinsic();
	expect(measured).toMatchObject({ minContent: 18, maxContent: 402 });
	expect(() =>
		measureIntrinsicWidths(page.tree, {
			text: { maxWork: measured.metrics.minText.work - 1 },
		}),
	).toThrow(/limit exceeded/);
	expect(page.intrinsic()).toMatchObject({ minContent: 18, maxContent: 402 });
});
