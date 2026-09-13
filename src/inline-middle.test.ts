import { afterEach, expect, it } from "vitest";
import { findClickPoint } from "./click-target.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];
type MiddleFormattingMetadata = { inlineVerticalAlign?: "middle" };
const simpleBoxes = [
	{ name: "empty image", markup: '<img id="target">' },
	{
		name: "inline-block",
		markup: '<span id="target" style="display:inline-block"></span>',
	},
] as const;

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(markup = 'A<img id="target">Z', css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-family:"Agent Mono";font-size:8px;line-height:8px}main{width:120px}#target{width:12px;height:20px;margin:0;padding:0;border:none;vertical-align:middle}${css}</style><main id="host">${markup}</main><footer id="after"></footer>`,
		"https://fixture.invalid/inline-middle",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	const styles = documentStyles(tree);
	styles.setViewport(160, 160);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const reference = (selector = "#target") => tree.reference(id(selector));
	const rect = (selector = "#target") =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	const context = (selector = "#host", layout = layoutDocument(tree)) => {
		const found = layout.contexts.find(
			(entry) => entry.ref === reference(selector),
		);
		if (!found) throw new Error(`Missing context ${selector}`);
		return found;
	};
	return { tree, queries, styles, id, reference, rect, context };
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each([
	{ name: "empty image", markup: '<img id="target">', kind: "replaced" },
	{
		name: "inline-block",
		markup: '<span id="target" style="display:inline-block"></span>',
		kind: "block",
	},
	{
		name: "inline flow-root",
		markup: '<span id="target" style="display:inline flow-root"></span>',
		kind: "block",
	},
	{
		name: "inline-flex",
		markup: '<span id="target" style="display:inline-flex"></span>',
		kind: "deferred",
	},
	{
		name: "embedded SVG",
		markup:
			'<svg id="target" width="12" height="20"><rect width="12" height="20" fill="blue"/></svg>',
		kind: "replaced",
	},
	{
		name: "native input",
		markup: '<input id="target" value="">',
		kind: "replaced",
	},
])("centers retained $name using the parent x-height", ({ markup, kind }) => {
	const page = fixture(`A${markup}Z`);
	const layout = layoutDocument(page.tree);
	const host = page.context("#host", layout);
	expect(host.lines).toHaveLength(1);
	expect(host.lines[0]).toMatchObject({
		top: 0,
		baseline: 12.5,
		height: 20,
		width: 24,
	});
	expect(page.rect()).toMatchObject({ x: 6, y: 0, width: 12, height: 20 });
	expect(
		host.fragments.filter((fragment) => fragment.ref === page.reference()),
	).toEqual([
		expect.objectContaining({ x: 6, y: 0, width: 12, height: 20, line: 0 }),
	]);
	expect(
		host.glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
	).toEqual([
		["A", 0, 5.5],
		["Z", 18, 5.5],
	]);
	expect(page.rect("#after").y).toBe(20);
	expect(page.styles.table(page.id())["vertical-align"]).toBe("middle");
	const target = layout.text.horizontal.formatting.nodes.find(
		(node) => node.ref === page.reference(),
	);
	expect(target).toMatchObject({ kind, level: "inline" });
	expect(
		(target as MiddleFormattingMetadata | undefined)?.inlineVerticalAlign,
	).toBe("middle");
	expect(layout.text.horizontal.formatting.issues).toEqual(
		kind === "deferred" ? { "display-layout-not-supported": 1 } : {},
	);
	expect(documentGeometry(page.tree).getClientRects(page.id())).toHaveLength(1);
});

for (const box of simpleBoxes) {
	it.each([
		[4, 2, 26, 15.5, 4],
		[2, 4, 26, 15.5, 2],
		[-4, 2, 18, 11.5, -4],
		[4, -2, 22, 13.5, 4],
		[-2, -2, 16, 10.5, -2],
	])(
		`centers the ${box.name} margin box with margins %s/%s`,
		(marginTop, marginBottom, height, baseline, borderY) => {
			const page = fixture(
				`A${box.markup}Z`,
				`#target{margin-top:${marginTop}px;margin-bottom:${marginBottom}px}`,
			);
			expect(page.context().lines[0]).toMatchObject({ height, baseline });
			expect(page.rect()).toMatchObject({ y: borderY, height: 20 });
			expect(page.rect("#after").y).toBe(height);
			expect(page.context().glyphs[0].y).toBe(baseline - 7);
		},
	);
}

it.each([
	[8, 400, 24, 700, 12.5],
	[8, 700, 16, 400, 12.5],
	[16, 400, 8, 700, 15],
	[16, 700, 24, 400, 15],
])(
	"uses parent font %spx/%s rather than child font %spx/%s",
	(parentSize, parentWeight, childSize, childWeight, baseline) => {
		const page = fixture(
			'A<span id="target" style="display:inline-block"></span>Z',
			`main{font-size:${parentSize}px;line-height:${parentSize}px;font-weight:${parentWeight}}#target{font-size:${childSize}px;font-weight:${childWeight}}`,
		);
		expect(page.context().lines[0]).toMatchObject({ height: 20, baseline });
		expect(page.rect()).toMatchObject({ y: 0, height: 20 });
		expect(page.rect("#after").y).toBe(20);
	},
);

it.each(["", ' style="font-size:8px;font-weight:700"'])(
	"takes x-height from the immediate nested inline parent: %s",
	(childStyle) => {
		const page = fixture(
			`A<span id="parent"><img id="target"${childStyle}></span>Z`,
			"#parent{font-size:16px;line-height:16px}",
		);
		expect(page.context().lines[0]).toMatchObject({ height: 20, baseline: 15 });
		expect(page.rect()).toMatchObject({ x: 6, y: 0, height: 20 });
		expect(page.context().glyphs[0].y).toBe(8);
	},
);

it.each([
	["8px", 20, 12.5, 0],
	["normal", 20, 12.5, 0],
	["40px", 40, 23, 10.5],
])(
	"unions middle extents with the parent %s strut",
	(lineHeight, height, baseline, borderY) => {
		const page = fixture(undefined, `main{line-height:${lineHeight}}`);
		expect(page.context().lines[0]).toMatchObject({ height, baseline });
		expect(page.rect()).toMatchObject({ y: borderY, height: 20 });
		expect(page.rect("#after").y).toBe(height);
	},
);

it.each(["inline-block", "inline flow-root"])(
	"ignores the internal last baseline of a middle-aligned %s",
	(display) => {
		const page = fixture(
			'A<span id="target">a<br>b</span>Z',
			`#target{display:${display};line-height:10px}`,
		);
		expect(page.context().lines[0]).toMatchObject({
			baseline: 12.5,
			height: 20,
		});
		expect(page.context("#target").lines.map((line) => line.baseline)).toEqual([
			8, 18,
		]);
		expect(page.context("#target").glyphs.map((glyph) => glyph.y)).toEqual([
			1, 11,
		]);
		expect(page.rect()).toMatchObject({ y: 0, height: 20 });
		expect(page.context().glyphs.map((glyph) => glyph.y)).toEqual([5.5, 5.5]);
	},
);

it.each(simpleBoxes)(
	"includes percentage padding and borders inside the $name middle box",
	({ markup }) => {
		const page = fixture(
			`A${markup}Z`,
			"main{width:100px}#target{height:10px;padding:5% 2%;border:1px solid red;margin:4px 0 2px}",
		);
		expect(page.rect()).toMatchObject({ x: 6, y: 4, width: 18, height: 22 });
		expect(page.context().lines[0]).toMatchObject({
			height: 28,
			baseline: 16.5,
			width: 30,
		});
		expect(page.rect("#after").y).toBe(28);
	},
);

it.each(simpleBoxes)(
	"allocates distinct middle extents when a $name wraps",
	({ markup }) => {
		const page = fixture(`A${markup}B`, "main{width:12px}");
		const host = page.context();
		expect(
			host.lines.map((line) => [line.top, line.height, line.baseline]),
		).toEqual([
			[0, 8, 7],
			[8, 20, 20.5],
			[28, 8, 35],
		]);
		expect(page.rect()).toMatchObject({ x: 0, y: 8, width: 12, height: 20 });
		expect(page.rect("#after").y).toBe(36);
		expect(
			host.fragments.find((fragment) => fragment.ref === page.reference()),
		).toMatchObject({ y: 8, height: 20, line: 1 });
	},
);

it("unions differently sized middle boxes with a baseline-aligned sibling", () => {
	const page = fixture(
		'A<img id="target"><span id="small"></span><img id="baseline">Z',
		"#small{display:inline-block;vertical-align:middle;width:8px;height:10px}#baseline{vertical-align:baseline;width:4px;height:16px}",
	);
	expect(page.context().lines[0]).toMatchObject({ baseline: 16, height: 23.5 });
	expect(page.rect()).toMatchObject({ x: 6, y: 3.5, height: 20 });
	expect(page.rect("#small")).toMatchObject({ x: 18, y: 8.5, height: 10 });
	expect(page.rect("#baseline")).toMatchObject({ x: 26, y: 0, height: 16 });
	expect(page.rect("#after").y).toBe(23.5);
});

it("allocates the full height of an oversized middle box before a forced break", () => {
	const page = fixture(
		'A<img id="target"><br>B',
		"main{width:24px}#target{height:100px}",
	);
	expect(
		page.context().lines.map((line) => [line.top, line.height, line.baseline]),
	).toEqual([
		[0, 100, 52.5],
		[100, 8, 107],
	]);
	expect(page.rect()).toMatchObject({ y: 0, height: 100 });
	expect(page.rect("#after").y).toBe(108);
});

it.each(simpleBoxes)(
	"paints and hit-tests the shifted $name border box, not its margins",
	({ markup }) => {
		const page = fixture(
			`A${markup}Z`,
			"main{line-height:40px}#target{background:blue;margin:4px 0 2px}",
		);
		expect(page.context().lines[0]).toMatchObject({ height: 40, baseline: 23 });
		expect(page.rect()).toMatchObject({ x: 6, y: 11.5, width: 12, height: 20 });
		const { image } = rasterizeDocument(page.tree);
		expect(pixel(image, 10, 13)).toEqual([0, 0, 255, 255]);
		expect(pixel(image, 10, 30)).toEqual([0, 0, 255, 255]);
		expect(pixel(image, 10, 9)).toEqual([255, 255, 255, 255]);
		expect(pixel(image, 10, 34)).toEqual([255, 255, 255, 255]);
		const hits = documentHitTesting(page.tree);
		expect(hits.elementFromPoint(10, 13)).toBe(page.id());
		expect(hits.elementFromPoint(10, 30)).toBe(page.id());
		expect(hits.elementFromPoint(10, 9)).not.toBe(page.id());
		expect(hits.elementFromPoint(10, 34)).not.toBe(page.id());
		expect(findClickPoint(page.tree, page.id()).point).toEqual({
			x: 12,
			y: 21.5,
		});
	},
);

it.each([
	[0, 0, 20, 12.5, 0],
	[4, 2, 26, 15.5, 4],
])(
	"centers an in-memory decoded PNG with margins %s/%s",
	async (marginTop, marginBottom, height, baseline, borderY) => {
		const page = fixture(
			'A<img id="target" src="/middle.png">Z',
			`#target{width:auto;height:auto;margin-top:${marginTop}px;margin-bottom:${marginBottom}px}`,
		);
		const body = encodePng(createRaster(12, 20, [0, 255, 0, 255]));
		const requested: string[] = [];
		const images = documentImages(page.tree, {
			fetch: async (url) => {
				requested.push(url);
				return {
					url,
					status: 200,
					headers: { "content-type": ["image/png"] },
					body,
					redirects: [],
					encodedBytes: body.length,
					elapsedMs: 0,
				};
			},
		});
		await images.settle();
		expect(requested).toEqual(["https://fixture.invalid/middle.png"]);
		expect(images.decoded(page.id())).toBeDefined();
		expect(page.context().lines[0]).toMatchObject({ height, baseline });
		expect(page.rect()).toMatchObject({
			x: 6,
			y: borderY,
			width: 12,
			height: 20,
		});
		const rendered = rasterizeDocument(page.tree);
		expect(rendered.metrics.paintedImages).toBe(1);
		expect(pixel(rendered.image, 10, borderY + 1)).toEqual([0, 255, 0, 255]);
		expect(pixel(rendered.image, 10, borderY + 18)).toEqual([0, 255, 0, 255]);
		expect(page.rect("#after").y).toBe(height);
	},
);

it("retains a ref-less generated middle atomic with its original owner", () => {
	const page = fixture(
		"Z",
		'#host::before{content:"";display:inline-block;vertical-align:middle;width:12px;height:20px;background:blue}',
	);
	const revision = page.tree.revision;
	const nodeCount = page.tree.nodeCount;
	const rendered = rasterizeDocument(page.tree);
	const formatting = rendered.layout.text.horizontal.formatting;
	const generated = formatting.nodes.find(
		(node) =>
			node.generatedContent?.owner === page.id("#host") &&
			node.generatedContent.name === "before" &&
			node.kind !== "text",
	);
	expect(generated).toMatchObject({
		kind: "block",
		level: "inline",
		independentContext: true,
	});
	expect(generated?.ref).toBeUndefined();
	expect(
		(generated as MiddleFormattingMetadata | undefined)?.inlineVerticalAlign,
	).toBe("middle");
	expect(
		rendered.layout.boxes.find((box) => box.id === generated?.id),
	).toMatchObject({
		borderX: 0,
		borderY: 0,
		borderBoxWidth: 12,
		borderBoxHeight: 20,
	});
	expect(page.context("#host", rendered.layout).lines[0]).toMatchObject({
		baseline: 12.5,
		height: 20,
	});
	expect(page.context("#host", rendered.layout).glyphs[0]).toMatchObject({
		character: "Z",
		x: 12,
		y: 5.5,
	});
	expect(pixel(rendered.image, 3, 3)).toEqual([0, 0, 255, 255]);
	expect(formatting.issues).toEqual({});
	expect(page.queries.querySelectorAll("#host::before")).toEqual([]);
	expect(page.tree.revision).toBe(revision);
	expect(page.tree.nodeCount).toBe(nodeCount);
});

it("preserves middle placement after table whitespace formatting IDs are remapped", () => {
	const page = fixture(
		'<table> \n<tbody> \n<tr> \n<td id="cell">A<img id="target">Z</td> \n</tr> \n</tbody> \n</table>',
		"table{width:80px;border-collapse:separate;border-spacing:0}td{padding:0;vertical-align:top}",
	);
	const layout = layoutDocument(page.tree);
	const cell = page.context("#cell", layout);
	expect(cell.lines[0]).toMatchObject({ baseline: 12.5, height: 20 });
	expect(page.rect()).toMatchObject({ x: 6, y: 0, width: 12, height: 20 });
	const fragment = cell.fragments.find(
		(entry) => entry.ref === page.reference(),
	);
	expect(fragment).toMatchObject({ y: 0, height: 20 });
	if (!fragment) throw new Error("Missing remapped middle fragment");
	const owner = layout.text.horizontal.formatting.nodes[fragment.formattingId];
	expect(owner).toMatchObject({
		ref: page.reference(),
		kind: "replaced",
	});
	expect((owner as MiddleFormattingMetadata).inlineVerticalAlign).toBe(
		"middle",
	);
	expect(page.rect("#after").y).toBe(20);
});

it.each([
	["block", "#target{display:block}"],
	["float", "#target{float:left}"],
	["flex item", "main{display:flex;align-items:flex-start}"],
])("does not apply inline middle displacement to a %s", (_name, css) => {
	const middle = fixture('<img id="target">', css);
	const baseline = fixture(
		'<img id="target">',
		`${css}#target{vertical-align:baseline}`,
	);
	expect(middle.rect()).toEqual(baseline.rect());
	expect(middle.rect()).toMatchObject({ y: 0, width: 12, height: 20 });
	expect(middle.styles.table(middle.id())["vertical-align"]).toBe("middle");
	expect(buildFormattingTree(middle.tree).issues).toEqual(
		buildFormattingTree(baseline.tree).issues,
	);
});

it.each([
	["ordinary inline middle", '<span id="target">X</span>', "middle"],
	[
		"atomic top",
		'<span id="target" style="display:inline-block">X</span>',
		"top",
	],
	["image bottom", '<img id="target">', "bottom"],
])(
	"keeps the explicit unsupported guard for %s",
	(_name, markup, alignment) => {
		const page = fixture(markup, `#target{vertical-align:${alignment}}`);
		expect(page.styles.table(page.id())["vertical-align"]).toBe(alignment);
		expect(
			buildFormattingTree(page.tree).issues[
				"inline-vertical-align-not-supported"
			],
		).toBeGreaterThan(0);
		expect(() => layoutDocument(page.tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("retains the prior middle value and CSS guard for unsupported text-top", () => {
	const page = fixture(undefined, "#target{vertical-align:text-top}");
	expect(page.styles.table(page.id())["vertical-align"]).toBe("middle");
	expect(
		buildFormattingTree(page.tree).issues[
			"css:unimplemented-or-invalid-css-value"
		],
	).toBeGreaterThan(0);
	expect(() => layoutDocument(page.tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("keeps generated non-atomic middle diagnostics rather than suppressing them", () => {
	const page = fixture("Z", '#host::before{content:"X";vertical-align:middle}');
	const formatting = buildFormattingTree(page.tree);
	expect(
		formatting.issues["inline-vertical-align-not-supported"],
	).toBeGreaterThan(0);
	expect(
		formatting.issues["generated-content-vertical-align-layout-not-supported"],
	).toBeGreaterThan(0);
	expect(() => layoutDocument(page.tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("charges middle placement to the existing page work budget", () => {
	const page = fixture(
		'A<span id="target" style="display:inline-block">a<br>b</span>Z',
	);
	const layout = layoutDocument(page.tree);
	expect(page.context("#host", layout).lines[0].baseline).toBe(12.5);
	expect(
		layoutDocument(page.tree, { maxWork: layout.metrics.work }).metrics.work,
	).toBe(layout.metrics.work);
	expect(() =>
		layoutDocument(page.tree, { maxWork: layout.metrics.work - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("reflows parent font changes without mutating an earlier middle layout", () => {
	const page = fixture();
	const original = layoutDocument(page.tree);
	page.tree.setAttribute(
		page.id("#host"),
		"style",
		"font-size:16px;line-height:16px",
	);
	const changed = layoutDocument(page.tree);
	expect(page.context("#host", original).lines[0]).toMatchObject({
		baseline: 12.5,
		height: 20,
	});
	expect(page.context("#host", changed).lines[0]).toMatchObject({
		baseline: 15,
		height: 20,
	});
	expect(page.rect()).toMatchObject({ x: 12, y: 0, height: 20 });
	expect(Object.isFrozen(page.context("#host", original).fragments)).toBe(true);
});

it.each(["inline-block", "inline-flex"])(
	"does not export an unknown middle %s child baseline through an outer atomic",
	(display) => {
		const page = fixture(
			'A<span id="outer">x<span id="target"><button>Go</button></span>y</span>Z',
			`main{width:200px;white-space:nowrap}#outer{display:inline-block;width:100px}#target{display:${display};width:60px;height:auto}`,
		);
		const layout = layoutDocument(page.tree);
		const outerLine = page.context("#outer", layout).lines.at(-1);
		if (!outerLine) throw new Error("Missing outer line");
		const target = page.rect();
		expect(target.y + target.height / 2).toBe(outerLine.baseline - 2.5);
		expect(page.context("#host", layout).lines[0].baseline).toBe(
			outerLine.baseline,
		);
		expect(page.rect("#after").y).toBeGreaterThanOrEqual(target.bottom);
	},
);

it("still rejects a genuinely baseline-dependent inline-flex with an unknown control baseline", () => {
	const page = fixture(
		'A<span id="outer">x<span id="target"><button>Go</button></span>y</span>Z',
		"main{width:200px;white-space:nowrap}#outer{display:inline-block;width:100px}#target{display:inline-flex;width:60px;height:auto;vertical-align:baseline}",
	);
	expect(() => layoutDocument(page.tree)).toThrow(
		"Atomic inline baseline is not supported",
	);
});

it("retains a known inline-block text baseline through the outer atomic", () => {
	const page = fixture(
		'A<span id="outer">x<span id="target"><button>Go</button></span>y</span>Z',
		"main{width:200px;white-space:nowrap}#outer{display:inline-block;width:100px}#target{display:inline-block;width:60px;height:auto;vertical-align:baseline}",
	);
	const layout = layoutDocument(page.tree);
	const innerLine = page.context("#target", layout).lines.at(-1);
	if (!innerLine) throw new Error("Missing inner line");
	expect(page.context("#outer", layout).lines[0].baseline).toBe(
		innerLine.baseline,
	);
	expect(page.context("#host", layout).lines[0].baseline).toBe(
		innerLine.baseline,
	);
});

it("does not export a middle replaced control's unknown baseline through an atomic", () => {
	const page = fixture(
		'A<span id="outer">x<input id="target" value="">y</span>Z',
		"main{width:200px;white-space:nowrap}#outer{display:inline-block;width:100px}",
	);
	const layout = layoutDocument(page.tree);
	const outerLine = page.context("#outer", layout).lines[0];
	const target = page.rect();
	expect(target.y + target.height / 2).toBe(outerLine.baseline - 2.5);
	expect(page.context("#host", layout).lines[0].baseline).toBe(
		outerLine.baseline,
	);
});

it("preserves the existing baseline fallback for a replaced control in an atomic", () => {
	const page = fixture(
		'A<span id="outer">x<input id="target" value="">y</span>Z',
		"main{width:200px;white-space:nowrap}#outer{display:inline-block;width:100px}#target{vertical-align:baseline}",
	);
	const layout = layoutDocument(page.tree);
	expect(page.rect().bottom).toBe(
		page.context("#outer", layout).lines[0].baseline,
	);
	expect(page.context("#host", layout).lines[0].baseline).toBe(
		page.context("#outer", layout).lines[0].baseline,
	);
});
