import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentImages } from "./document-images.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import {
	flexMainLimits,
	resolveFlexMainSizes,
	resolveFormattingFlexMainSizes,
	type FlexMainConstraints,
	type FlexMainOptions,
} from "./flex-main.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	measureFormattingFlexItemWidths,
	measureIntrinsicWidths,
} from "./intrinsic-widths.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	css = "",
	content = '<span id="first">aa bbbb</span><span id="second">cc</span>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}#container{display:flex}#first,#second{flex-grow:1}${css}</style><main id="container">${content}</main>`,
		"https://fixture.invalid/flex-main",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#container") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing fixture target");
		return found;
	};
	const ref = (selector = "#container") => tree.reference(id(selector));
	const resolve = (
		contentWidth = 120,
		contentHeight: number | null = null,
		options?: FlexMainOptions,
	) =>
		resolveFlexMainSizes(tree, ref(), { contentWidth, contentHeight }, options);
	return { tree, id, ref, resolve };
}
async function image(css = "", dimensions: [number, number] = [20, 10]) {
	const result = fixture(css, '<img id="image" src="/image.png">');
	const bytes = encodePng(
		createRaster(dimensions[0], dimensions[1], [0, 255, 0, 255]),
	);
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
	return { ...result, requests: () => requests };
}

it("connects actual item measurements and style factors to the native line kernel", () => {
	const result = fixture().resolve();
	expect(
		result.items.map((item) => [
			item.minContent,
			item.maxContent,
			item.baseSize,
			item.minSize,
		]),
	).toEqual([
		[24, 42, 42, 24],
		[12, 12, 12, 12],
	]);
	expect(
		result.resolved.lines[0].items.map((item) => item.contentSize),
	).toEqual([75, 45]);
	expect(result.items.map((item) => item.baseSource)).toEqual([
		"max-content",
		"max-content",
	]);
});
it("retains content-based overflow rather than guessing zero automatic minima", () => {
	const result = fixture().resolve(20);
	expect(
		result.resolved.lines[0].items.map((item) => item.contentSize),
	).toEqual([24, 12]);
	expect(result.resolved.lines[0].remainingFreeSpace).toBe(-16);
});
it.each([
	["flex-basis:30px", 30],
	["flex-basis:25%", 30],
	["flex-basis:calc(25% + 3px)", 33],
	["flex-basis:2em", 16],
	["flex-basis:3rem", 24],
	["width:50px", 50],
	["width:50px;flex-basis:content", 42],
	["flex-basis:min-content", 24],
	["flex-basis:max-content", 42],
	["flex-basis:fit-content", 42],
	["min-width:60px;max-width:70px", 42],
	["flex-basis:100px;max-width:10px", 100],
	["flex:1", 0],
	["flex:0 0 auto", 42],
])(
	"resolves the flex base without main-axis clamping for %s",
	(css, expected) => {
		expect(fixture(`#first{${css}}`).resolve().items[0].baseSize).toBe(
			expected,
		);
	},
);
it.each([
	[10, 24],
	[30, 30],
	[60, 42],
])("fit-content applies actual available width %s", (width, expected) => {
	expect(
		fixture("#first{flex-basis:fit-content}").resolve(width).items[0].baseSize,
	).toBe(expected);
});
it("fit-content subtracts physical border/padding and margins but not auto margins", () => {
	const item = fixture(
		"#first{flex-basis:fit-content;padding:3px;border:1px solid red;margin-left:5px;margin-right:auto}",
	).resolve(45).items[0];
	expect(item).toMatchObject({
		baseSize: 32,
		minSize: 24,
		borderPadding: 8,
		marginStart: 5,
		marginEnd: "auto",
	});
});
it.each([
	["", 24],
	["width:10px", 10],
	["width:10px;flex-basis:100px", 10],
	["flex-basis:10px", 24],
	["max-width:15px", 15],
	["width:30px;max-width:15px", 15],
	["min-width:0", 0],
	["min-width:50%;max-width:10px", 60],
	["min-width:calc(1em + 2px)", 10],
])("resolves the effective minimum for %s", (css, expected) => {
	expect(fixture(`#first{${css}}`).resolve().items[0].minSize).toBe(expected);
});
it.each([
	["width:50px", 50],
	["width:50px;max-width:120px", 50],
	["width:calc(10% + 50px)", 50.1],
	["width:100px;max-width:50px", 50],
	["flex-basis:100px;max-width:50px", 50],
	["flex-basis:10px;max-width:50px", 50],
	["width:100px", 80],
	["flex-basis:100px", 80],
	["flex-basis:10px", 80],
])(
	"matches the WPT auto-minimum sizing case %s with native solid borders",
	(css, expected) => {
		const result = fixture(
			`#first{flex-grow:0;border:2px solid purple;${css}}#first>div{width:80px;height:10px}`,
			'<div id="first"><div></div></div>',
		).resolve(1);
		expect(result.items[0].minSize).toBe(expected);
		expect(result.resolved.lines[0].items[0].contentSize).toBe(expected);
	},
);
it("preserves negative content bases for zero border-box bases", () => {
	const result = fixture(
		"#first{box-sizing:border-box;flex:0 1 0px;min-width:0;padding:8px;border:2px solid red}",
	).resolve();
	expect(result.items[0]).toMatchObject({
		baseSize: -20,
		minSize: 0,
		borderPadding: 20,
	});
	expect(result.resolved.lines[0].items[0]).toMatchObject({
		contentSize: 0,
		borderBoxSize: 20,
	});
});
it("floors border-box minimums, preserves signed margins and resolves percentage edges against container width", () => {
	const item = fixture(
		"#first{box-sizing:border-box;width:10px;min-width:5px;max-width:20px;padding:10%;margin-left:-5%;margin-right:2px}",
	).resolve().items[0];
	expect(item).toMatchObject({
		baseSize: -14,
		minSize: 0,
		maxSize: 0,
		borderPadding: 24,
		marginStart: -6,
		marginEnd: 2,
	});
});
it("keeps minimum-over-maximum precedence in the actual line result", () => {
	const result = fixture("#first{min-width:60px;max-width:10px}").resolve(20);
	expect(result.resolved.lines[0].items[0].contentSize).toBe(60);
});
it.each(["wrap", "wrap-reverse"])(
	"uses resolved percentage gaps for %s line collection",
	(wrap) => {
		const result = fixture(
			`#container{flex-wrap:${wrap};gap:5px calc(10% + 2px)}span{flex:0 0 40px}`,
			"<span>a</span><span>b</span><span>c</span>",
		).resolve();
		expect(result.resolved.gap).toBe(14);
		expect(result.resolved.lines.map((line) => line.items.length)).toEqual([
			2, 1,
		]);
		expect(
			result.resolved.lines[0].items.map((item) => item.mainOffset),
		).toEqual([0, 54]);
	},
);
it("maps reverse-row main-start margins without reordering source items", () => {
	const result = fixture(
		"#container{flex-direction:row-reverse}#first{margin-left:3px;margin-right:9px}",
	).resolve();
	expect(result.items[0]).toMatchObject({ marginStart: 9, marginEnd: 3 });
	expect(result.direction).toBe("row-reverse");
	expect(result.resolved.lines[0].items[0].index).toBe(0);
});
it.each([
	["normal", "row", 0],
	["stretch", "row", 0],
	["end", "row", 96],
	["left", "row-reverse", 96],
	["start", "row-reverse", 96],
	["right", "row-reverse", 0],
	["unsafe center", "row", 48],
])(
	"maps justify-content:%s with %s to logical placement",
	(align, direction, expected) => {
		const result = fixture(
			`#container{justify-content:${align};flex-direction:${direction}}span{flex:0 0 24px}`,
			"<span>a</span>",
		).resolve();
		expect(result.resolved.lines[0].items[0].mainOffset).toBe(expected);
	},
);
it("allocates main-axis auto margins before justification", () => {
	const result = fixture(
		"#first{flex:0 0 24px;margin-left:auto}",
		'<span id="first">aa</span>',
	).resolve();
	expect(result.resolved.lines[0].items[0]).toMatchObject({
		marginStart: 96,
		mainOffset: 96,
	});
});
it("measures anonymous text and preserves source identity separately from order", () => {
	const { tree, ref, resolve } = fixture(
		"#first{order:2}#second{order:-1}",
		'a b<span id="first">aa bbbb</span><span style="display:contents"><span id="second">cc</span></span>',
	);
	const revision = tree.revision;
	const result = resolve();
	expect(result.items.map((item) => item.ref ?? "anonymous")).toEqual([
		"anonymous",
		ref("#first"),
		ref("#second"),
	]);
	expect(result.items[0]).toMatchObject({
		minContent: 6,
		maxContent: 18,
		grow: 0,
		order: 0,
	});
	expect(result.resolved.lines[0].items.map((item) => item.index)).toEqual([
		2, 0, 1,
	]);
	expect(tree.revision).toBe(revision);
});
it("measures a blockified item as one independent context with real block descendants", () => {
	const result = fixture(
		"#first{flex-grow:0}#first>div{width:70px}",
		'<span id="first">aa<div>x</div>bbbb</span>',
	).resolve();
	expect(result.items).toHaveLength(1);
	expect(result.items[0]).toMatchObject({
		minContent: 70,
		maxContent: 70,
		baseSize: 70,
		minSize: 70,
	});
});
it("does not let unrelated normal-flow content contaminate item measurements", () => {
	const { tree, id, resolve } = fixture();
	tree.append(
		tree.get(id()).parent as number,
		tree.createElement("div", { style: "width:10000px" }),
	);
	expect(resolve().items.map((item) => item.maxContent)).toEqual([42, 12]);
});
it("follows custom properties, CSSOM revisions, fonts, text and viewport changes", () => {
	const { tree, id, resolve } = fixture(
		"#first{--base:2em;flex-basis:var(--base)}",
	);
	const first = resolve();
	tree.setAttribute(id("#first"), "style", "font-size:16px;--base:10vw");
	tree.setTextContent(id("#second"), "longerword");
	documentStyles(tree).setViewport(500, 200);
	const second = resolve();
	expect(first.items[0].baseSize).toBe(16);
	expect(second.items[0]).toMatchObject({ baseSize: 50, minSize: 48 });
	expect(second.items[1].minSize).toBe(60);
	expect(second.revision).toBe(tree.revision);
});
it("reuses the same formatting snapshot without rebuilding or mutating document state", () => {
	const { tree, ref, resolve } = fixture();
	const formatting = buildFormattingTree(tree);
	const container = formatting.nodes.find((node) => node.ref === ref());
	const result = resolveFormattingFlexMainSizes(
		formatting,
		container?.id as number,
		{ contentWidth: 120, contentHeight: null },
	);
	expect(result).toEqual(resolve());
	expect(Object.isFrozen(result.items)).toBe(true);
	expect(Object.isFrozen(result.items[0])).toBe(true);
	expect(Object.isFrozen(result.constraints)).toBe(true);
	expect(Object.isFrozen(result.resolved.lines[0])).toBe(true);
});
it("retains the width-only guard while allowing supported full-document intrinsic measurement", () => {
	const { tree, resolve } = fixture();
	expect(resolve().items).toHaveLength(2);
	expect(() => resolveDocumentBlockWidths(tree)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(measureIntrinsicWidths(tree).widths.length).toBeGreaterThan(2);
});
it.each([
	"#container{flex-direction:column}",
	"#first{display:flex;flex-direction:column;flex-wrap:wrap;position:absolute}",
	"#first{display:table}",
	"#first{overflow:hidden}",
	"#first{writing-mode:vertical-rl}",
	"#first{align-content:center}",
])(
	"rejects an unsupported prerequisite rather than fabricating sizes: %s",
	(css) => {
		expect(() => fixture(css).resolve()).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);
it("does not hide an unrelated unsupported layout issue during scoped measurement", () => {
	const { tree, id, resolve } = fixture();
	tree.append(
		tree.get(id()).parent as number,
		tree.createElement("div", { style: "display:inline-table" }),
	);
	expect(resolve).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});
it("measures Grid tracks as the intrinsic contribution of a Flex item", () => {
	const { resolve } = fixture(
		"#first{display:grid;grid-template-columns:20px 30px}",
		'<div id="first"><span>A</span><span>B</span></div><span id="second">cc</span>',
	);
	expect(resolve().items[0]).toMatchObject({
		minContent: 50,
		maxContent: 50,
		baseSize: 50,
		minSize: 50,
	});
});
it("rejects unavailable or non-flex targets", () => {
	const { tree, ref } = fixture();
	expect(() =>
		resolveFlexMainSizes(tree, "e99999", {
			contentWidth: 120,
			contentHeight: null,
		}),
	).toThrowError(expect.objectContaining({ code: "stale-reference" }));
	expect(() =>
		resolveFlexMainSizes(tree, ref("#first"), {
			contentWidth: 120,
			contentHeight: null,
		}),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it.each([
	null,
	{},
	{ contentWidth: 120 },
	{ contentWidth: -1, contentHeight: null },
	{ contentWidth: Number.NaN, contentHeight: null },
	{ contentWidth: 120, contentHeight: -1 },
	{ contentWidth: 120, contentHeight: null, guessed: true },
])("rejects invalid or missing definite constraints %#", (constraints) => {
	const { tree, ref } = fixture();
	expect(() =>
		resolveFlexMainSizes(tree, ref(), constraints as FlexMainConstraints),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it.each([
	null,
	{ maxWork: 0 },
	{ maxWork: flexMainLimits.maxWork + 1 },
	{ maxWork: 1.5 },
	{ unknown: true },
	{ intrinsic: null },
	{ intrinsic: { maxWork: 0 } },
	{ intrinsic: { formatting: { maxDepth: 0 } } },
])("validates budgets before clamping phase allowances %#", (options) => {
	expect(() =>
		fixture().resolve(120, null, options as FlexMainOptions),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it("enforces the aggregate work boundary and nested measurement limits", () => {
	const { resolve } = fixture();
	const result = resolve();
	expect(
		resolve(120, null, { maxWork: result.metrics.work }).metrics.work,
	).toBe(result.metrics.work);
	expect(() =>
		resolve(120, null, { maxWork: result.metrics.work - 1 }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	expect(() => resolve(120, null, { maxWork: 1 })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() =>
		resolve(120, null, { intrinsic: { text: { maxTokens: 1 } } }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		resolve(120, null, { intrinsic: { formatting: { maxDepth: 1 } } }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});
it("rejects oversized factors instead of silently clamping them", () => {
	expect(() => fixture("#first{flex-grow:1e10}").resolve()).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});
it("measures an empty flex container without inventing an item", () => {
	const result = fixture("", "   ").resolve();
	expect(result.items).toEqual([]);
	expect(result.resolved.lines).toEqual([]);
});
it("requires supported retained container identity for internal measurement", () => {
	const { tree } = fixture();
	const formatting = buildFormattingTree(tree);
	expect(() =>
		measureFormattingFlexItemWidths(formatting, -1, null),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it.each([
	["", null, 20, 20],
	["height:30px", null, 60, 60],
	["height:30px;width:100px", null, 100, 60],
	["height:30px;flex-basis:10px", null, 10, 60],
	["height:30px;min-width:0;flex:none", null, 60, 0],
	["min-height:15px", null, 30, 30],
	["max-height:5px", null, 10, 10],
	["", 30, 60, 20],
	["align-self:flex-start", 30, 20, 20],
	["margin-top:auto", 30, 20, 20],
	["height:50%", 40, 40, 40],
	["height:50%", null, 20, 20],
])(
	"uses decoded image aspect ratio for %s with definite cross size %s",
	async (css, height, base, minimum) => {
		const { resolve, requests } = await image(`#image{${css}}`);
		const result = resolve(120, height as number | null);
		expect(result.items[0]).toMatchObject({ baseSize: base, minSize: minimum });
		expect(requests()).toBe(1);
	},
);
it("does not treat wrapped lines as having the container's definite stretch height", async () => {
	expect(
		(await image("#container{flex-wrap:wrap}")).resolve(120, 30).items[0]
			.baseSize,
	).toBe(20);
});
it.each(["width:100px", "flex-basis:100px", "flex-basis:10px"])(
	"matches the WPT replaced automatic-minimum pattern for %s",
	async (css) => {
		const result = (
			await image(
				`#image{height:30px;border:2px solid purple;${css}}`,
				[100, 100],
			)
		).resolve(0);
		expect(result.items[0].minSize).toBe(30);
		expect(result.resolved.lines[0].items[0].contentSize).toBe(30);
	},
);
it("keeps the WPT non-shrinking image pattern at its ratio-derived base", async () => {
	const result = (
		await image(
			"#image{min-width:0;min-height:0;flex:none;height:100px}",
			[100, 100],
		)
	).resolve(10);
	expect(result.items[0]).toMatchObject({ baseSize: 100, minSize: 0 });
	expect(result.resolved.lines[0].items[0].contentSize).toBe(100);
	expect(result.resolved.lines[0].remainingFreeSpace).toBe(-90);
});
it("resolves image border-box cross constraints using actual percentage padding basis", async () => {
	const result = (
		await image("#image{height:40px;box-sizing:border-box;padding:10%}")
	).resolve(100);
	expect(result.items[0]).toMatchObject({
		baseSize: 40,
		minSize: 40,
		borderPadding: 20,
	});
});
it("transfers stretched cross size after subtracting margins and cross edges", async () => {
	const result = (
		await image("#image{padding:2px;border:1px solid red;margin:3px 0}")
	).resolve(120, 40);
	expect(result.items[0]).toMatchObject({
		baseSize: 56,
		minSize: 20,
		borderPadding: 6,
	});
});
it("uses native control content without transferring an invented aspect ratio", () => {
	const result = fixture("input{height:30px}", '<input value="abc">').resolve(
		120,
		100,
	);
	expect(result.items[0].baseSource).toBe("max-content");
	expect(result.items[0].minContent).toBe(result.items[0].maxContent);
	expect(result.items[0].minContent).toBeGreaterThan(0);
});
it("does not invent image dimensions before the image owner has decoded data", () => {
	expect(() => fixture("", '<img src="/missing.png">').resolve()).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});
it.each([
	["stretch", 30, 60],
	["flex-start", 30, 20],
	["stretch", 0, 0],
])(
	"propagates definite %s cross size %s into an item's percentage-height descendants",
	async (align, height, expected) => {
		const { tree, id, resolve, requests } = await image(
			`#first{align-self:${align}}#image{height:100%}`,
		);
		const item = tree.createElement("span", { id: "first" });
		tree.append(id(), item);
		tree.append(item, id("#image"));
		expect(resolve(120, height as number).items[0].baseSize).toBe(expected);
		expect(requests()).toBe(1);
	},
);
it("accepts the maximum item count with real measured inputs and rejects one more", () => {
	const { tree, id, resolve } = fixture(
		"span{flex:1 1 auto}",
		"<span>a b</span>".repeat(4096),
	);
	const result = resolve(4096 * 18);
	expect(result.items).toHaveLength(4096);
	expect(
		result.items.every((item) => item.baseSize === 18 && item.minSize === 6),
	).toBe(true);
	expect(
		result.resolved.lines[0].items.every((item) => item.contentSize === 18),
	).toBe(true);
	tree.append(id(), tree.createElement("span"));
	expect(resolve).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});
