import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { documentScroll } from "./document-scroll.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { BrowserCommandHost } from "./command-host.js";
import { atomicInlineCapabilities } from "./index.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
function fixture(css = "", children = "aa<br>bb", content?: string) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{width:60px}#atom{display:inline-block}${css}</style><main id="host">${content ?? `A<span id="atom">${children}</span>Z`}</main><footer id="after"></footer>`,
		"https://fixture.invalid/inline-block",
	);
	documents.push(document);
	documentStyles(document).setViewport(160, 160);
	const query = new DocumentQueries(document);
	const id = (selector: string) => {
		const value = query.querySelector(selector);
		if (value === null) throw Error(selector);
		return value;
	};
	const reference = (selector: string) => document.reference(id(selector));
	const box = (selector: string, layout = layoutDocument(document)) => {
		const value = layout.boxes.find(
			(entry) => entry.ref === reference(selector),
		);
		if (!value) throw Error(selector);
		return value;
	};
	const context = (selector: string, layout = layoutDocument(document)) => {
		const value = layout.contexts.find(
			(entry) => entry.ref === reference(selector),
		);
		if (!value) throw Error(selector);
		return value;
	};
	const intrinsic = (selector = "#atom") => {
		const value = measureIntrinsicWidths(document).widths.find(
			(entry) => entry.ref === reference(selector),
		);
		if (!value) throw Error(selector);
		return value;
	};
	return { document, id, reference, box, context, intrinsic };
}

it.each(["inline-block", "inline flow-root"])(
	"retains a complete independent %s formatting subtree",
	(display) => {
		const { document, reference } = fixture(
			`#atom{display:${display}}`,
			'<div id="child">B</div>',
		);
		const formatting = buildFormattingTree(document);
		const atom = formatting.nodes.find(
			(node) => node.ref === reference("#atom"),
		);
		expect(atom).toMatchObject({
			kind: "block",
			level: "inline",
			independentContext: true,
			contentMode: "blocks",
			display,
		});
		expect(formatting.issues).toEqual({});
		expect(
			formatting.nodes.some((node) => node.ref === reference("#child")),
		).toBe(true);
	},
);

it("aligns surrounding text with the last line, not the first line or bottom edge", () => {
	const { document, box, context } = fixture();
	const layout = layoutDocument(document);
	expect(box("#atom", layout)).toMatchObject({
		borderX: 6,
		borderY: 0,
		contentWidth: 12,
		contentHeight: 20,
	});
	expect(context("#host", layout).lines[0]).toMatchObject({
		baseline: 18,
		height: 20,
		width: 24,
	});
	expect(
		context("#host", layout).glyphs.map((glyph) => [
			glyph.character,
			glyph.x,
			glyph.y,
		]),
	).toEqual([
		["A", 0, 11],
		["Z", 18, 11],
	]);
	expect(context("#atom", layout).lines.map((line) => line.baseline)).toEqual([
		8, 18,
	]);
	expect(box("#after", layout).borderY).toBe(20);
	expect(layout.text.horizontal.atomicLayouts).toBeUndefined();
});

it.each([1, 2, 5])(
	"matches the WPT-derived plain-inline reference at line-height %s",
	(lineHeight) => {
		const css = `html{font-size:15px}main{white-space:nowrap;line-height:${lineHeight};width:auto}#atom{overflow:visible}`;
		const atomic = fixture(css, "test");
		const reference = fixture(`${css}#atom{display:inline}`, "test");
		const glyphs = (document: DocumentTree) =>
			[...layoutContentItems(layoutDocument(document), () => {})].flatMap(
				(item) =>
					item.kind === "glyph"
						? [
								{
									character: item.glyph.character,
									x: item.glyph.x,
									y: item.glyph.y + item.contentY,
									fontSize: item.glyph.fontSize,
								},
							]
						: [],
			);
		expect(glyphs(atomic.document)).toEqual(glyphs(reference.document));
		expect(rasterizeDocument(atomic.document).image.pixels).toEqual(
			rasterizeDocument(reference.document).image.pixels,
		);
	},
);

it("places the WPT-derived empty blue square on the baseline", () => {
	const { document, box, context } = fixture(
		"html{font-size:15px}main{line-height:5;white-space:nowrap}#atom{width:1em;height:1em;background:blue;overflow:visible}",
		"",
	);
	const square = box("#atom");
	expect(square.borderBoxWidth).toBe(15);
	expect(square.borderBoxHeight).toBe(15);
	expect(square.borderY + square.borderBoxHeight).toBe(
		context("#host").lines[0].baseline,
	);
	const image = rasterizeDocument(document).image;
	const start =
		((Math.ceil(square.borderY) + 1) * image.width +
			Math.ceil(square.borderX) +
			1) *
		4;
	expect([...image.pixels.slice(start, start + 4)]).toEqual([0, 0, 255, 255]);
});

it.each([
	[60, 30, 10],
	[20, 20, 20],
	[8, 12, 20],
])("uses shrink-to-fit in a %spx containing block", (width, used, height) => {
	const { box } = fixture(`main{width:${width}px}`, "aa bb");
	expect(box("#atom")).toMatchObject({
		contentWidth: used,
		contentHeight: height,
	});
});

it.each([
	["width:50%", 30],
	["width:calc(50% - 5px)", 25],
	["min-width:40px", 40],
	["max-width:8px", 8],
	["min-width:40px;max-width:8px", 40],
	["width:20px;padding:2px;border:1px solid red", 26],
	["width:20px;padding:2px;border:1px solid red;box-sizing:border-box", 20],
	["padding-left:10%;padding-right:10%", 24],
] as const)("resolves used sizes and edges: %s", (style, width) => {
	const { box } = fixture(`#atom{${style}}`);
	expect(box("#atom").borderBoxWidth).toBe(width);
});

it("resolves automatic margins to zero without balancing the trailing margin", () => {
	const { box } = fixture("#atom{margin-left:auto;margin-right:auto}");
	expect(box("#atom")).toMatchObject({
		borderX: 6,
		marginLeft: 0,
		marginRight: 0,
	});
});

it("keeps signed horizontal margins outside the border box", () => {
	const { box } = fixture("#atom{margin-left:-3px;margin-right:4px}");
	expect(box("#atom")).toMatchObject({
		borderX: 3,
		marginLeft: -3,
		marginRight: 4,
		borderBoxWidth: 12,
	});
});

it("synthesizes a baseline for an empty atom at its under margin edge", () => {
	const { box, context } = fixture(
		"#atom{width:20px;height:20px;margin-top:3px;margin-bottom:4px}",
		"",
	);
	expect(box("#atom")).toMatchObject({ borderY: 3, borderBoxHeight: 20 });
	expect(context("#host").lines[0]).toMatchObject({ baseline: 27, height: 29 });
});

it("uses the last contributing descendant when a trailing block has no line boxes", () => {
	const { box, context } = fixture(
		"#empty{height:20px}",
		'<div id="child">bb</div><div id="empty"></div>',
	);
	expect(box("#atom").contentHeight).toBe(30);
	expect(context("#host").lines[0]).toMatchObject({ baseline: 8, height: 30 });
});

it("contains child margins at its independent formatting-context edges", () => {
	const { box, context } = fixture(
		"#child{margin-top:3px;margin-bottom:4px}",
		'<div id="child">bb</div>',
	);
	expect(box("#atom")).toMatchObject({ borderY: 0, contentHeight: 17 });
	expect(box("#child").borderY).toBe(3);
	expect(context("#host").lines[0].baseline).toBe(11);
});

it("synthesizes a baseline when all block children are empty", () => {
	const { box, context } = fixture(
		"#child{height:20px;margin-top:3px;margin-bottom:4px}",
		'<div id="child"></div>',
	);
	expect(box("#atom").contentHeight).toBe(27);
	expect(context("#host").lines[0]).toMatchObject({ baseline: 27, height: 29 });
});

it.each([
	["min-height:40px", 40, 18, 40],
	["height:10px", 10, 18, 20],
])(
	"does not replace content baselines with used height: %s",
	(style, height, baseline, lineHeight) => {
		const { box, context } = fixture(`#atom{${style}}`);
		expect(box("#atom").contentHeight).toBe(height);
		expect(context("#host").lines[0]).toMatchObject({
			baseline,
			height: lineHeight,
		});
	},
);

it("passes real definite height to percentage-sized descendants", () => {
	const { box } = fixture(
		"main{height:80px}#atom{height:50%}#child{height:50%}",
		'<div id="child">B</div>',
	);
	expect(box("#atom")).toMatchObject({ contentHeight: 40, definiteHeight: 40 });
	expect(box("#child")).toMatchObject({
		contentHeight: 20,
		definiteHeight: 20,
	});
});

it("retains indefinite percentage height rather than using the viewport", () => {
	const { box } = fixture(
		"#atom{height:50%}#child{height:50%}",
		'<div id="child">B</div>',
	);
	expect(box("#atom")).toMatchObject({
		contentHeight: 10,
		definiteHeight: null,
	});
	expect(box("#child")).toMatchObject({
		contentHeight: 10,
		definiteHeight: null,
	});
});

it("measures atomic intrinsic contributions without duplicated child tokens", () => {
	const { document, intrinsic } = fixture("", "aa bb");
	expect(intrinsic()).toMatchObject({ minContent: 12, maxContent: 30 });
	expect(intrinsic("#host")).toMatchObject({ minContent: 12, maxContent: 42 });
	const measured = measureIntrinsicWidths(document);
	expect(new Set(measured.widths.map((width) => width.id)).size).toBe(
		measured.widths.length,
	);
	expect(measured.metrics.minText.glyphs).toBe(0);
	expect(layoutDocument(document).metrics.glyphs).toBe(7);
});

it("resolves block and inline mixed content through anonymous blocks", () => {
	const { document, box, context } = fixture(
		"",
		'aa<div id="child">bbbb</div>cc',
	);
	expect(box("#atom")).toMatchObject({ contentWidth: 24, contentHeight: 30 });
	expect(context("#host").lines[0].baseline).toBe(28);
	expect(layoutDocument(document).metrics.glyphs).toBe(10);
});

it.each(["inline-block", "inline-flex"])(
	"nests a real %s subtree inside an inline block",
	(display) => {
		const { document, box } = fixture(
			`#inner{display:${display}}`,
			'x<span id="inner"><div id="leaf">B</div></span>y',
		);
		const layout = layoutDocument(document);
		expect(box("#atom", layout).contentWidth).toBe(18);
		expect(box("#inner", layout)).toMatchObject({
			borderX: 12,
			borderY: 0,
			contentWidth: 6,
			containingBlock: box("#atom", layout).id,
		});
		expect(box("#leaf", layout).borderX).toBe(12);
		expect(layout.text.horizontal.atomics).toHaveLength(2);
	},
);

it.each(["row", "column"])(
	"supports inline blocks within a %s flex-item flow",
	(direction) => {
		const { document, box } = fixture(
			`main{display:flex;flex-direction:${direction}}#wrapper{padding:3px}`,
			undefined,
			'<section id="wrapper">A<span id="atom">B<br>C</span>Z</section>',
		);
		const layout = layoutDocument(document);
		expect(box("#atom", layout).borderX).toBe(
			box("#wrapper", layout).contentX + 6,
		);
		expect(box("#atom", layout).contentHeight).toBe(20);
	},
);

it("blockifies an inline-block flex item without introducing an extra atom", () => {
	const { document, reference } = fixture(
		"main{display:flex}",
		"",
		'<span id="atom">aa bb</span>',
	);
	const layout = layoutDocument(document);
	expect(
		layout.text.horizontal.formatting.nodes.find(
			(node) => node.ref === reference("#atom"),
		),
	).toMatchObject({
		kind: "block",
		level: "block",
		flexItem: true,
		independentContext: true,
	});
	expect(layout.text.horizontal.atomics ?? []).toHaveLength(0);
});

it("uses the last baseline of a contained flex block", () => {
	const { context } = fixture(
		"#child{display:flex;flex-direction:column}",
		'<div id="child"><div>B</div><div>C</div></div>',
	);
	expect(context("#host").lines[0]).toMatchObject({ baseline: 18, height: 20 });
});

it("inserts the entire atomic paint subtree between surrounding glyphs", () => {
	const { document, reference } = fixture();
	const items = [...layoutContentItems(layoutDocument(document), () => {})];
	expect(
		items
			.filter((item) => item.kind === "glyph")
			.map((item) => (item.kind === "glyph" ? item.glyph.character : ""))
			.join(""),
	).toBe("AaabbZ");
	expect(
		items.filter(
			(item) => item.kind === "box" && item.box.ref === reference("#atom"),
		),
	).toHaveLength(1);
	expect(renderDocumentPdf(document).metrics.glyphs).toBe(6);
});

it("shares overlap paint order and hit testing across atomic siblings", () => {
	const { document, id } = fixture(
		".atom{display:inline-block;width:20px;height:20px;margin-right:-20px}#atom{background:red}#peer{background:blue}",
		"",
		'<span id="atom" class="atom"><div>X</div></span><span id="peer" class="atom"></span>',
	);
	const image = rasterizeDocument(document).image;
	const start = (5 * image.width + 15) * 4;
	expect([...image.pixels.slice(start, start + 4)]).toEqual([0, 0, 255, 255]);
	expect(documentHitTesting(document).elementFromPoint(15, 5)).toBe(
		id("#peer"),
	);
});

it("exposes one client rect and coherent placed/relative text coordinates", () => {
	const { document, id } = fixture(
		"body{padding:5px}#atom{padding:3px;border:1px solid red}",
	);
	expect(documentGeometry(document).getClientRects(id("#atom"))).toHaveLength(
		1,
	);
	const layout = layoutDocument(document);
	for (const [index, context] of layout.contexts.entries())
		for (const [glyphIndex, glyph] of context.glyphs.entries())
			expect(glyph.y).toBe(
				layout.text.contexts[index].glyphs[glyphIndex].y + context.contentY,
			);
});

it("reflows on text, style and viewport revisions without mutating previous layouts", () => {
	const { document, id, box } = fixture("main{width:auto}", "aa bb");
	const original = layoutDocument(document);
	documentStyles(document).setViewport(20, 100);
	expect(box("#atom").contentHeight).toBe(20);
	document.setAttribute(id("#atom"), "style", "display:inline-flex");
	expect(box("#atom").contentWidth).toBe(20);
	expect(box("#atom", original).contentHeight).toBe(10);
});

it("includes overflow descendants in scrollable bounds", () => {
	const { document, id } = fixture("#atom{width:100px;height:60px}", "");
	documentStyles(document).setViewport(30, 20);
	expect(documentScroll(document).bounds().y).toBeGreaterThanOrEqual(40);
	expect(documentScroll(document).to(0, 20)).toBe(true);
	expect(documentGeometry(document).getBoundingClientRect(id("#atom")).y).toBe(
		-10,
	);
});

it("paints decoded inline images through the existing image owner", async () => {
	const { document, id } = fixture(
		"#atom{padding:2px}",
		'<img id="image" src="/image.png">',
	);
	const bytes = encodePng(createRaster(10, 6, [0, 255, 0, 255]));
	await documentImages(document, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body: bytes,
			redirects: [],
			encodedBytes: bytes.length,
			elapsedMs: 0,
		}),
	}).settle();
	const rect = documentGeometry(document).getBoundingClientRect(id("#image"));
	const rendered = rasterizeDocument(document);
	expect(rendered.metrics.paintedImages).toBe(1);
	const start = ((rect.y + 1) * rendered.image.width + rect.x + 1) * 4;
	expect([...rendered.image.pixels.slice(start, start + 4)]).toEqual([
		0, 255, 0, 255,
	]);
});

it("retains the unsupported width-only consumer guard", () => {
	const { document } = fixture();
	expect(() => resolveDocumentBlockWidths(document)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("publishes the qualified atomic inline layout capability", async () => {
	expect(atomicInlineCapabilities.inlineBlock).toBe(true);
	const host = new BrowserCommandHost({
		createSession: () => {
			throw Error("No session expected");
		},
	});
	try {
		expect((await host.execute(["capabilities"])).data).toMatchObject({
			atomicInlineLayout: {
				partial: true,
				inlineBlock: true,
				inlineFlex: true,
				inlineBlockBaseline: "last-in-flow",
				overflow: "visible-only",
			},
		});
	} finally {
		host.close();
	}
});

it("charges used sizing and placement to the one page work budget", () => {
	const { document } = fixture();
	const result = layoutDocument(document);
	expect(
		layoutDocument(document, { maxWork: result.metrics.work }).metrics.work,
	).toBe(result.metrics.work);
	expect(() =>
		layoutDocument(document, { maxWork: result.metrics.work - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it.each(["maxTokens", "maxLines", "maxFragments"] as const)(
	"aggregates %s across separate atomic scopes",
	(limit) => {
		const { document } = fixture(
			".atom{display:inline-block}",
			"",
			'<span id="atom"><b>a</b></span><span class="atom"><b>b</b></span>',
		);
		expect(() => layoutDocument(document, { text: { [limit]: 1 } })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("bounds recursive intrinsic and used inline-block layout", () => {
	let content = "X";
	for (let depth = 0; depth < 33; depth++)
		content = `<span class="atom">${content}</span>`;
	const { document } = fixture(
		".atom{display:inline-block;width:20px}",
		"",
		content,
	);
	expect(() => layoutDocument(document)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => measureIntrinsicWidths(document)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([
	"#atom{display:inline-table}",
	"#atom{overflow:hidden}",
	"#atom{position:absolute}",
	"#atom{writing-mode:vertical-rl}",
	"#atom{align-content:center}",
])("retains explicit unsupported prerequisites: %s", (css) => {
	const { document } = fixture(css);
	expect(() => layoutDocument(document)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});
