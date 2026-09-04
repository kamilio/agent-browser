import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { buildFormattingTree } from "./formatting-tree.js";
import {
	intrinsicWidthLimits,
	measureIntrinsicWidths,
	measureFormattingIntrinsicWidths,
	type IntrinsicWidthOptions,
} from "./intrinsic-widths.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText } from "./text-layout.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(content: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}html,body{margin:0;padding:0}${css}</style><main id="target">${content}</main>`,
		"https://fixture.invalid/intrinsic",
	);
	trees.push(tree);
	const query = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error("Missing fixture node");
		return found;
	};
	const measure = (selector = "#target", options?: IntrinsicWidthOptions) => {
		const ref = tree.reference(id(selector));
		const result = measureIntrinsicWidths(tree, options).widths.find(
			(entry) => entry.ref === ref,
		);
		if (!result) throw new Error("Missing intrinsic measurement");
		return result;
	};
	return { tree, id, measure, styles: documentStyles(tree) };
}
async function imageFixture(
	css = "",
	content = '<img id="image" src="/image.png">',
) {
	const result = fixture(content, css);
	const bytes = encodePng(createRaster(20, 10, [255, 0, 0, 255]));
	let requests = 0;
	const images = documentImages(result.tree, {
		fetch: async (url) => {
			requests++;
			return {
				url,
				status: 200,
				headers: { "content-type": ["image/png"] },
				body: bytes,
				redirects: [],
				encodedBytes: bytes.length,
				elapsedMs: 0,
			};
		},
	});
	await images.settle();
	expect(requests).toBe(1);
	return { ...result, requests: () => requests };
}

it.each([
	["aa bbbb", 24, 42],
	["  aa \t\n bbbb  ", 24, 42],
	["", 0, 0],
	["   ", 0, 0],
	["a&nbsp;b c", 18, 30],
	["a😀 b", 12, 24],
	["a<br>bbbb cc", 24, 42],
	["<br><br>", 0, 0],
])(
	"measures native break opportunities for %s",
	(content, minContent, maxContent) => {
		expect(fixture(content as string).measure()).toMatchObject({
			minContent,
			maxContent,
			minContribution: minContent,
			maxContribution: maxContent,
		});
	},
);
it.each([
	["normal", 12, 48],
	["nowrap", 48, 48],
	["pre", 60, 60],
	["pre-line", 12, 30],
])("shares %s whitespace and tab behavior", (mode, minimum, maximum) => {
	expect(
		fixture("aa\tbb\ncc", `main{white-space:${mode}}`).measure(),
	).toMatchObject({ minContent: minimum, maxContent: maximum });
});
it("preserves authored spaces and forced empty lines in preformatted text", () => {
	expect(
		fixture("  a\n\nb  ", "main{white-space:pre}").measure(),
	).toMatchObject({ minContent: 18, maxContent: 18 });
});
it("collapses adjacent text-node whitespace and CRLF across inline boundaries", () => {
	const { tree, id, measure } = fixture(
		"a<span id=part></span>b",
		"main{white-space:pre-line}",
	);
	const main = id();
	const children = tree.get(main).children;
	tree.setTextContent(children[0], "aa\r");
	tree.setTextContent(children[2], "\nbbbb");
	expect(measure()).toMatchObject({ minContent: 24, maxContent: 24 });
});
it("uses mixed computed fonts rather than character-count estimates", () => {
	expect(
		fixture("a<span>bb</span> c", "span{font-size:16px}").measure(),
	).toMatchObject({ minContent: 30, maxContent: 42 });
});
it("keeps nowrap descendants unbreakable inside wrapping text", () => {
	expect(
		fixture("a <span>bb cc</span> d", "span{white-space:nowrap}").measure(),
	).toMatchObject({ minContent: 30, maxContent: 54 });
});
it("includes nested inline edge slices without duplicating them at soft breaks", () => {
	expect(
		fixture(
			"a<span>bb cc</span>d",
			"span{padding:2px;border:1px solid red;margin-left:3px;margin-right:4px}",
		).measure(),
	).toMatchObject({ minContent: 25, maxContent: 55 });
});
it("uses the computed math constants when cyclic inline padding resolves against zero", () => {
	expect(
		fixture(
			"<span>aa</span>",
			"span{padding:calc(10% + 2px);margin-left:calc(20% - 3px)}",
		).measure(),
	).toMatchObject({ minContent: 13, maxContent: 13 });
});
it("preserves inline fragmentation across block descendants", () => {
	expect(
		fixture(
			"<span>a<div>long word</div>b</span>",
			"span{padding-left:10px;padding-right:10px}",
		).measure(),
	).toMatchObject({ minContent: 24, maxContent: 54 });
});
it("ignores alignment when measuring content and produces no paint records", () => {
	const { tree, measure } = fixture(
		"aa bbbb",
		"main{text-align:right;width:5px}",
	);
	expect(measure()).toMatchObject({
		minContent: 24,
		maxContent: 42,
		minContribution: 5,
		maxContribution: 5,
	});
	const result = measureIntrinsicWidths(tree);
	for (const metric of [result.metrics.minText, result.metrics.maxText])
		expect(metric).toMatchObject({ glyphs: 0, fragments: 0 });
});
it.each([
	[
		"main{padding:3px;border:2px solid blue;margin-left:4px;margin-right:5px}",
		43,
		61,
	],
	["main{width:30px;padding:3px;border:2px solid blue}", 40, 40],
	[
		"main{width:30px;padding:3px;border:2px solid blue;box-sizing:border-box}",
		30,
		30,
	],
	["main{min-width:50px;max-width:30px}", 50, 50],
	["main{max-width:30px}", 24, 30],
	["main{min-width:30px}", 30, 42],
	["main{width:2px;box-sizing:border-box;padding:3px}", 6, 6],
	["main{margin-left:-50px}", -26, -8],
])(
	"applies box contributions separately from natural content: %s",
	(css, minimum, maximum) => {
		expect(fixture("aa bbbb", css as string).measure()).toMatchObject({
			minContent: 24,
			maxContent: 42,
			minContribution: minimum,
			maxContribution: maximum,
		});
	},
);
it("takes the largest child block contribution instead of summing vertical siblings", () => {
	expect(
		fixture(
			'<div style="width:50px">a</div><div style="padding:10px">aa bbbb</div>',
		).measure(),
	).toMatchObject({ minContent: 50, maxContent: 62 });
});
it("ignores a whole cyclic non-replaced preferred or maximum value, even zero percentages", () => {
	expect(
		fixture(
			"aa bbbb",
			"main{width:calc(100px + 0%);max-width:calc(1px + 0%)}",
		).measure(),
	).toMatchObject({
		minContent: 24,
		maxContent: 42,
		minContribution: 24,
		maxContribution: 42,
	});
});
it("resolves cyclic min-width, margins and padding against zero, retaining constants", () => {
	expect(
		fixture(
			"aa bbbb",
			"main{min-width:calc(30px + 10%);padding:calc(2px + 5%);margin:auto}",
		).measure(),
	).toMatchObject({ minContribution: 34, maxContribution: 46 });
});
it("floors effective max-content widths when signed inline edges make them smaller", () => {
	const { measure } = fixture(
		"aa <span>bbbb</span>",
		"span{margin-left:-40px}",
	);
	const result = measure();
	expect(result.maxContent).toBeGreaterThanOrEqual(result.minContent);
});
it("does not measure display:none descendants but retains visibility:hidden geometry", () => {
	expect(
		fixture("aa<span>longestword</span> bb", "span{display:none}").measure(),
	).toMatchObject({ minContent: 12, maxContent: 30 });
	expect(
		fixture(
			"aa<span>longestword</span> bb",
			"span{visibility:hidden}",
		).measure(),
	).toMatchObject({ minContent: 78, maxContent: 96 });
});
it("does not mutate layout width, DOM revision, geometry or paint while measuring", () => {
	const { tree, id, measure } = fixture(
		"aa bbbb",
		"main{width:30px;background:blue}",
	);
	const before = rasterizeDocument(tree).image.pixels.slice();
	const rectangle = documentGeometry(tree).getBoundingClientRect(id());
	const revision = tree.revision;
	expect(measure().maxContent).toBe(42);
	expect(tree.revision).toBe(revision);
	expect(documentGeometry(tree).getBoundingClientRect(id())).toEqual(rectangle);
	const after = rasterizeDocument(tree).image.pixels;
	expect(after.length).toBe(before.length);
	expect(after.every((value, index) => value === before[index])).toBe(true);
});
it("recomputes text, font and variable changes through the existing owners", () => {
	const { tree, id, measure } = fixture(
		"aa bbbb",
		"main{--pad:1px;padding:var(--pad)}",
	);
	expect(measure().maxContribution).toBe(44);
	tree.setAttribute(id(), "style", "font-size:16px;--pad:3px");
	expect(measure().maxContribution).toBe(90);
	tree.setTextContent(tree.get(id()).children[0], "x");
	expect(measure().maxContribution).toBe(18);
});
it("resolves viewport terms without using viewport width as a cyclic percentage basis", () => {
	const { styles, measure } = fixture(
		"aa",
		"main{padding-left:calc(10% + 1vw)}",
	);
	styles.setViewport(200, 100);
	expect(measure().minContribution).toBe(14);
	styles.setViewport(400, 100);
	expect(measure().minContribution).toBe(16);
});
it("returns immutable snapshot numbers and rejects new reads after owner close", () => {
	const { tree } = fixture("aa");
	const result = measureIntrinsicWidths(tree);
	for (const value of [result, result.widths, result.widths[0], result.metrics])
		expect(Object.isFrozen(value)).toBe(true);
	tree.close();
	expect(result.widths.length).toBeGreaterThan(0);
	expect(() => measureIntrinsicWidths(tree)).toThrow();
});
it("can measure an existing immutable formatting snapshot without another document traversal", () => {
	const { tree } = fixture("aa bbbb");
	const formatting = buildFormattingTree(tree);
	expect(measureFormattingIntrinsicWidths(formatting)).toEqual(
		measureIntrinsicWidths(tree),
	);
});
it("measures decoded inline images with real intrinsic sizes and break opportunities", async () => {
	const { measure, requests } = await imageFixture(
		"",
		'aa<img id="image" src="/image.png">bb',
	);
	expect(measure()).toMatchObject({ minContent: 20, maxContent: 44 });
	expect(measure("#image")).toMatchObject({
		minContent: 20,
		maxContent: 20,
		minContribution: 20,
		maxContribution: 20,
	});
	expect(requests()).toBe(1);
});
it("honors nowrap around replaced content", async () => {
	expect(
		(
			await imageFixture(
				"main{white-space:nowrap}",
				'aa<img id="image" src="/image.png">bb',
			)
		).measure(),
	).toMatchObject({ minContent: 44, maxContent: 44 });
});
it.each([
	["img{width:50%}", 0, 20],
	["img{width:calc(50% + 10px)}", 10, 20],
	["img{width:calc(50% + 50px)}", 50, 50],
	["img{max-width:50%}", 0, 20],
	["img{width:50%;min-width:5px;padding:2px;border:1px solid red}", 11, 26],
	["img{width:50%;min-height:20px}", 40, 40],
	["img{width:50%;min-height:calc(20px + 10%)}", 40, 40],
	["img{width:50%;box-sizing:border-box;padding:2px;min-height:20px}", 36, 36],
])(
	"handles cyclic replaced contributions: %s",
	async (css, minimum, maximum) => {
		const { measure } = await imageFixture(css as string);
		expect(measure()).toMatchObject({
			minContent: minimum,
			maxContent: maximum,
		});
	},
);
it("resolves definite containing heights for aspect-ratio contributions", async () => {
	const { measure } = await imageFixture("main{height:40px}img{height:50%}");
	expect(measure()).toMatchObject({ minContent: 40, maxContent: 40 });
	expect(measure("#image")).toMatchObject({ minContent: 40, maxContent: 40 });
});
it.each([
	["height:40px", 80],
	["min-height:40px", 80],
	["max-height:5px", 10],
])(
	"transfers opposite-axis constraints into intrinsic content sizes: %s",
	async (declaration, expected) => {
		const { measure } = await imageFixture(
			`img{${declaration};width:100px;min-width:90px}`,
		);
		expect(measure("#image")).toMatchObject({
			minContent: expected,
			maxContent: expected,
			minContribution: 100,
			maxContribution: 100,
		});
	},
);
it("uses image dimension hints without pretending they change its natural decoded width", async () => {
	const { measure } = await imageFixture(
		"",
		'<img id="image" width="60" src="/image.png">',
	);
	expect(measure("#image")).toMatchObject({
		minContent: 20,
		maxContent: 20,
		minContribution: 60,
		maxContribution: 60,
	});
});
it("distinguishes compressible input controls from button-like controls", () => {
	const input = fixture('<input id="field" style="width:calc(50% + 50px)">');
	expect(input.measure("#field").minContribution).toBe(50);
	const button = fixture(
		'<button id="button" style="width:calc(50% + 50px)">abcdef</button>',
	);
	const result = button.measure("#button");
	expect(result.minContribution).toBe(result.minContent);
	expect(result.maxContribution).toBe(result.minContribution);
});
it.each([
	"main{display:flex;flex-direction:column;flex-wrap:wrap;position:absolute}",
	"main{display:grid}",
	"main{position:absolute}",
])("does not guess intrinsic sizes for unsupported formatting: %s", (css) => {
	expect(() => fixture("aa", css).measure()).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});
it("does not invent dimensions for an undecoded image without a configured loader", () => {
	expect(() =>
		fixture('<img src="https://fixture.invalid/not-loaded">').measure(),
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
});
it.each([
	{ maxWork: 0 },
	{ maxWork: intrinsicWidthLimits.maxWork + 1 },
	{ text: null },
	{ formatting: null },
	{ text: { maxWork: 2_000_001 } },
	{ formatting: { maxWork: 2_000_001 } },
	{ text: { unknown: 1 } },
	{ unknown: 1 },
])("rejects invalid options %j", (options) => {
	expect(() =>
		fixture("aa").measure("#target", options as IntrinsicWidthOptions),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it("bounds aggregate and phase work and permits a corrected retry without stale state", () => {
	const { tree, measure } = fixture("aa bbbb cc");
	for (const options of [
		{ maxWork: 1 },
		{ formatting: { maxBoxes: 1 } },
		{ text: { maxTokens: 1 } },
		{ text: { maxLines: 1 } },
	])
		expect(() => measure("#target", options)).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	const result = measureIntrinsicWidths(tree);
	expect(
		measureIntrinsicWidths(tree, { maxWork: result.metrics.work }),
	).toEqual(result);
	expect(() =>
		measureIntrinsicWidths(tree, { maxWork: result.metrics.work - 1 }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	expect(measure().maxContent).toBe(60);
});
it.each(Array.from({ length: 30 }, (_, seed) => seed))(
	"matches ordinary native line widths at intrinsic extremes for fixture %i",
	(seed) => {
		const words = Array.from({ length: 2 + (seed % 7) }, (_, index) =>
			"x".repeat(1 + ((seed + index * 3) % 9)),
		);
		const { tree, id, measure } = fixture(words.join(" "));
		const intrinsic = measure();
		const ref = tree.reference(id());
		for (const [width, expected] of [
			[0, intrinsic.minContent],
			[10000, intrinsic.maxContent],
		]) {
			tree.setAttribute(id(), "style", `width:${width}px`);
			const context = layoutDocumentText(tree).contexts.find(
				(entry) => entry.ref === ref,
			);
			expect(
				Math.max(0, ...(context?.lines.map((line) => line.width) ?? [])),
			).toBe(expected);
		}
		expect(intrinsic.minContent).toBe(
			Math.max(...words.map((word) => word.length * 6)),
		);
		expect(intrinsic.maxContent).toBe(words.join(" ").length * 6);
	},
);
