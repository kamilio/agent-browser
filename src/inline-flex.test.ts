import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { documentScroll } from "./document-scroll.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { createRaster } from "./raster.js";
import { encodePng } from "./png.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
function fixture(
	css = "",
	children = '<div id="first">aa</div><div id="second">bb</div>',
	content?: string,
) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{width:60px}#atom{display:inline-flex;gap:3px}${css}</style><main id="host">${content ?? `A<span id="atom">${children}</span>Z`}</main><footer id="after"></footer>`,
		"https://fixture.invalid/inline-flex",
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
	return { document, id, reference, box };
}

it("uses real shrink-to-fit dimensions and a shared text baseline", () => {
	const { document, box, reference } = fixture();
	const layout = layoutDocument(document);
	expect(box("#atom", layout)).toMatchObject({
		contentWidth: 27,
		borderX: 6,
		borderY: 0,
		borderBoxHeight: 10,
	});
	expect(box("#first", layout)).toMatchObject({
		borderX: 6,
		borderY: 0,
		contentWidth: 12,
	});
	expect(box("#second", layout).borderX).toBe(21);
	expect(box("#after", layout).borderY).toBe(10);
	const host = layout.contexts.find(
		(context) => context.ref === reference("#host"),
	);
	expect(host?.glyphs.map((glyph) => [glyph.character, glyph.x])).toEqual([
		["A", 0],
		["Z", 33],
	]);
	expect(host?.lines[0]).toMatchObject({ baseline: 8, height: 10, width: 39 });
	expect(layout.text.horizontal.atomicLayouts).toBeUndefined();
	expect(new Set(layout.boxes.map((entry) => entry.id)).size).toBe(
		layout.boxes.length,
	);
});

it.each([
	[60, 45, 10],
	[35, 35, 20],
	[20, 27, 20],
])(
	"fits intrinsic widths in a %spx containing block",
	(width, used, height) => {
		const { box } = fixture(
			`main{width:${width}px}`,
			'<div id="first">bb cc</div><div id="second">dd</div>',
		);
		expect(box("#atom")).toMatchObject({
			contentWidth: used,
			borderBoxHeight: height,
		});
	},
);

it("fits against the whole containing width, not remaining line space", () => {
	const { document, box, reference } = fixture("main{width:30px}");
	expect(box("#atom")).toMatchObject({
		contentWidth: 27,
		borderX: 0,
		borderY: 10,
	});
	const host = layoutDocument(document).contexts.find(
		(context) => context.ref === reference("#host"),
	);
	expect(host?.lines).toHaveLength(3);
	expect(host?.glyphs[1]).toMatchObject({ x: 0, y: 21 });
});

it.each([
	["width:50%", 30],
	["width:calc(50% - 5px)", 25],
	["min-width:40px", 40],
	["max-width:20px", 20],
	["min-width:40px;max-width:20px", 40],
	["width:20px;padding:2px;border:1px solid red", 26],
	["width:20px;padding:2px;border:1px solid red;box-sizing:border-box", 20],
	["width:1px;padding:2px;border:1px solid red;box-sizing:border-box", 6],
	["padding-left:10%;padding-right:10%", 39],
] as const)("resolves used outer sizes: %s", (style, width) => {
	const { box } = fixture(`#atom{${style}}`);
	expect(box("#atom").borderBoxWidth).toBe(width);
});

it("preserves margins without block overconstraint balancing", () => {
	const { box } = fixture("#atom{width:20px;margin-left:3px;margin-right:4px}");
	expect(box("#atom")).toMatchObject({
		borderX: 9,
		marginLeft: 3,
		marginRight: 4,
		contentWidth: 20,
	});
});

it("resolves auto inline margins to zero", () => {
	const { box } = fixture("#atom{margin-left:auto;margin-right:auto}");
	expect(box("#atom")).toMatchObject({
		borderX: 6,
		marginLeft: 0,
		marginRight: 0,
	});
});

it("synthesizes an empty atomic baseline at its under margin edge", () => {
	const { document, box, reference } = fixture(
		"#atom{width:20px;height:20px;margin-top:3px;margin-bottom:4px}",
		"",
	);
	expect(box("#atom")).toMatchObject({
		borderY: 3,
		borderBoxHeight: 20,
		flexBaselines: { first: null },
	});
	const host = layoutDocument(document).contexts.find(
		(context) => context.ref === reference("#host"),
	);
	expect(host?.lines[0]).toMatchObject({ baseline: 27, height: 29 });
});

it.each(["row", "row-reverse", "column", "column-reverse"])(
	"places %s internals within the atomic border box",
	(direction) => {
		const { document, box } = fixture(
			`#atom{flex-direction:${direction};padding:2px;border:1px solid red}`,
		);
		const layout = layoutDocument(document);
		const atom = box("#atom", layout);
		for (const selector of ["#first", "#second"]) {
			const child = box(selector, layout);
			expect(child.borderX).toBeGreaterThanOrEqual(atom.contentX);
			expect(child.borderY).toBeGreaterThanOrEqual(atom.contentY);
			expect(child.borderX + child.borderBoxWidth).toBeLessThanOrEqual(
				atom.contentX + atom.contentWidth,
			);
			expect(child.borderY + child.borderBoxHeight).toBeLessThanOrEqual(
				atom.contentY + atom.contentHeight,
			);
		}
		expect(atom.borderBoxWidth).toBe(direction.startsWith("row") ? 33 : 18);
		expect(atom.borderBoxHeight).toBe(direction.startsWith("row") ? 16 : 29);
	},
);

it.each(["wrap", "wrap-reverse"])(
	"uses actual wrapped column sizing for %s",
	(wrap) => {
		const { box } = fixture(
			`#atom{flex-direction:column;flex-wrap:${wrap};height:10px}`,
			'<div id="first">aa</div><div id="second">bbbb</div>',
		);
		expect(box("#atom")).toMatchObject({ contentWidth: 39, contentHeight: 10 });
		expect(box("#first").borderY).toBe(box("#second").borderY);
	},
);

it("recursively places nested atoms under real flex-item ownership", () => {
	const { document, box } = fixture(
		"#inner{display:inline-flex;gap:2px}",
		'<div id="first">x<span id="inner"><div id="leaf">B</div><div>C</div></span>y</div><div id="second">d</div>',
	);
	const layout = layoutDocument(document);
	expect(box("#atom", layout).contentWidth).toBe(35);
	expect(box("#inner", layout)).toMatchObject({
		borderX: 12,
		borderY: 0,
		contentWidth: 14,
		containingBlock: box("#first", layout).id,
	});
	expect(box("#leaf", layout)).toMatchObject({ borderX: 12, borderY: 0 });
	expect(layout.text.horizontal.atomics).toHaveLength(2);
	expect(new Set(layout.boxes.map((entry) => entry.id)).size).toBe(
		layout.boxes.length,
	);
});

it.each(["row", "column"])(
	"supports inline atoms inside a page-level %s flex item",
	(direction) => {
		const { document, box } = fixture(
			`main{display:flex;flex-direction:${direction}}#wrapper{padding:3px}`,
			undefined,
			'<section id="wrapper">A<span id="atom"><div id="first">aa</div><div id="second">bb</div></span>Z</section>',
		);
		const layout = layoutDocument(document);
		expect(box("#atom", layout).borderX).toBe(
			box("#wrapper", layout).contentX + 6,
		);
		expect(box("#first", layout).borderX).toBe(box("#atom", layout).contentX);
		expect(layout.text.horizontal.atomics).toHaveLength(1);
	},
);

it("preserves paired relative and positioned text across nested translations", () => {
	const { document } = fixture(
		"body{padding:5px}#atom{padding:3px}#inner{display:inline-flex;padding:2px}",
		'<div>x<span id="inner"><div>B</div></span>y</div>',
	);
	const layout = layoutDocument(document);
	for (const [index, context] of layout.contexts.entries()) {
		const relative = layout.text.contexts[index];
		expect(relative.id).toBe(context.id);
		for (const [glyphIndex, glyph] of context.glyphs.entries())
			expect(glyph.y).toBe(relative.glyphs[glyphIndex].y + context.contentY);
		for (const [lineIndex, line] of context.lines.entries())
			expect(line.baseline).toBe(
				relative.lines[lineIndex].baseline + context.contentY,
			);
	}
	expect(renderDocumentPdf(document).metrics.glyphs).toBe(5);
});

it("inserts an atomic subtree between its preceding and following text", () => {
	const { document, reference } = fixture();
	const items = [...layoutContentItems(layoutDocument(document), () => {})];
	const atomIndex = items.findIndex(
		(item) => item.kind === "box" && item.box.ref === reference("#atom"),
	);
	const before = items.findIndex(
		(item) => item.kind === "glyph" && item.glyph.character === "A",
	);
	const after = items.findIndex(
		(item) => item.kind === "glyph" && item.glyph.character === "Z",
	);
	expect(before).toBeLessThan(atomIndex);
	expect(atomIndex).toBeLessThan(after);
	expect(
		items.filter(
			(item) => item.kind === "box" && item.box.ref === reference("#atom"),
		),
	).toHaveLength(1);
	expect(
		items
			.filter((item) => item.kind === "glyph")
			.map((item) => (item.kind === "glyph" ? item.glyph.character : ""))
			.join(""),
	).toBe("AaabbZ");
});

it("paints and hit-tests overlapping atomic siblings in inline order", () => {
	const { document, id } = fixture(
		".atom{display:inline-flex;width:20px;height:20px;margin-right:-20px}#atom{background:red}#peer{background:blue}",
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

it("does not duplicate atomic border rectangles", () => {
	const { document, id } = fixture("#atom{padding:2px;border:1px solid red}");
	const geometry = documentGeometry(document);
	expect(geometry.getClientRects(id("#atom"))).toHaveLength(1);
	expect(geometry.getBoundingClientRect(id("#atom"))).toMatchObject({
		x: 6,
		width: 33,
		height: 16,
	});
});

it("invalidates layout and keeps previous immutable output after style mutation", () => {
	const { document, id, box } = fixture();
	const original = layoutDocument(document);
	document.setAttribute(
		id("#atom"),
		"style",
		"width:40px;flex-direction:column",
	);
	expect(box("#atom").contentWidth).toBe(40);
	expect(box("#second").borderY).toBe(13);
	expect(box("#atom", original).contentWidth).toBe(27);
	expect(Object.isFrozen(original.contexts[0].fragments)).toBe(true);
});

it("includes atomic overflow in root scrolling and client geometry", () => {
	const { document, id } = fixture("#atom{width:100px;height:60px}", "");
	documentStyles(document).setViewport(30, 20);
	const scroll = documentScroll(document);
	expect(scroll.bounds().y).toBeGreaterThanOrEqual(40);
	expect(scroll.to(0, 20)).toBe(true);
	expect(documentGeometry(document).getBoundingClientRect(id("#atom")).y).toBe(
		-10,
	);
});

it("shares the page work limit with sizing and placement", () => {
	const { document } = fixture();
	const result = layoutDocument(document);
	expect(
		layoutDocument(document, { maxWork: result.metrics.work }).metrics.work,
	).toBe(result.metrics.work);
	expect(() =>
		layoutDocument(document, { maxWork: result.metrics.work - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("charges document validation once rather than once per atomic container", () => {
	const work = (count: number) => {
		const { document } = fixture(
			".atom{display:inline-flex;gap:3px}",
			"",
			'<span class="atom"><div>aa</div><div>bb</div></span>'.repeat(count),
		);
		return layoutDocument(document).metrics.work;
	};
	expect(work(32)).toBeLessThan(work(16) * 2.1);
});

it.each(["maxTokens", "maxLines", "maxFragments"] as const)(
	"aggregates %s across separate atomic subtrees",
	(limit) => {
		const { document } = fixture(
			".atom{display:inline-flex}",
			"",
			'<span id="atom"><div><b>a</b></div></span><span class="atom"><div><b>b</b></div></span>',
		);
		expect(() => layoutDocument(document, { text: { [limit]: 1 } })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("bounds recursive used atomic layout", () => {
	let content = "X";
	for (let depth = 0; depth < 33; depth++)
		content = `<span class="atom"><div>${content}</div></span>`;
	const { document } = fixture(
		".atom{display:inline-flex;width:20px}",
		"",
		content,
	);
	expect(() => layoutDocument(document)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("paints both flex-item and inline images inside an atomic subtree", async () => {
	const { document, id, box } = fixture(
		"#atom{padding:2px}img{width:10px;height:6px}",
		'<img id="first" src="/image.png"><div id="second"><img id="inline" src="/image.png"></div>',
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
	const result = rasterizeDocument(document);
	expect(result.metrics.paintedImages).toBe(2);
	expect(box("#first", result.layout).borderX).toBe(8);
	for (const selector of ["#first", "#inline"]) {
		const rect = documentGeometry(document).getBoundingClientRect(id(selector));
		const start = ((rect.y + 1) * result.image.width + rect.x + 1) * 4;
		expect([...result.image.pixels.slice(start, start + 4)]).toEqual([
			0, 255, 0, 255,
		]);
		expect(
			documentHitTesting(document).elementFromPoint(rect.x + 1, rect.y + 1),
		).toBe(id(selector));
	}
});

it.each(["row", "column"])(
	"uses the real percentage height basis for inline %s containers",
	(direction) => {
		const { box } = fixture(
			`main{height:80px}#atom{height:50%;flex-direction:${direction}}`,
		);
		expect(box("#atom")).toMatchObject({
			contentHeight: 40,
			definiteHeight: 40,
		});
	},
);

it("preserves inline ancestor fragments without painting the atom twice", () => {
	const { document, id, reference } = fixture(
		"#outer{padding:2px;background:red}",
		"",
		'<span id="outer">A<span id="atom"><div>B</div></span>Z</span>',
	);
	const layout = layoutDocument(document);
	const items = [...layoutContentItems(layout, () => {})];
	expect(
		items.filter(
			(item) => item.kind === "box" && item.box.ref === reference("#atom"),
		),
	).toHaveLength(1);
	expect(documentGeometry(document).getClientRects(id("#outer"))).toHaveLength(
		1,
	);
	expect(items.filter((item) => item.kind === "glyph")).toHaveLength(3);
});

it("does not leak the atomic root font into an otherwise empty parent strut", () => {
	const { document, reference } = fixture(
		"#atom{font-size:40px;width:10px;height:10px}",
		"",
		'<span id="atom"></span>',
	);
	const parent = layoutDocument(document).contexts.find(
		(context) => context.ref === reference("#host"),
	);
	expect(parent?.lines[0]).toMatchObject({ height: 12, baseline: 10 });
});

it("keeps parent nowrap independent of the atomic internal wrapping mode", () => {
	const { document, box, reference } = fixture(
		"main{width:30px;white-space:nowrap}#atom{white-space:normal}",
	);
	const layout = layoutDocument(document);
	expect(box("#atom", layout)).toMatchObject({ borderX: 6, borderY: 0 });
	expect(
		layout.contexts.find((context) => context.ref === reference("#host"))
			?.lines,
	).toHaveLength(1);
});

it("rejects atomic baseline dependencies whose control baseline is unknown", () => {
	const { document } = fixture("", "<button>Go</button>");
	expect(() => layoutDocument(document)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each([
	"#atom{display:grid}",
	"#atom{position:absolute}",
	"#host{writing-mode:vertical-rl}",
])("retains unsupported checks: %s", (css) => {
	const { document } = fixture(css);
	expect(() => layoutDocument(document)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});
