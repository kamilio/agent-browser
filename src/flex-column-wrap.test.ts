import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { layoutFlexContainer } from "./flex-layout.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { documentImages } from "./document-images.js";
import { createRaster } from "./raster.js";
import { encodePng } from "./png.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
function fixture(
	css = "",
	content = '<div id="first">A</div><div id="second">B</div><div id="third">C</div>',
	outer = false,
) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{display:flex;flex-direction:column;flex-wrap:wrap;width:100px;height:45px;gap:5px;align-content:flex-start}main>div{width:15px;height:20px;flex:none}${css}</style>${outer ? '<article id="outer">' : ""}<main id="container">${content}</main>${outer ? '<aside id="peer">Z</aside></article>' : '<footer id="after"></footer>'}`,
		"https://fixture.invalid/flex-column-wrap",
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
	const intrinsic = () => {
		const value = measureIntrinsicWidths(document).widths.find(
			(entry) => entry.ref === reference("#container"),
		);
		if (!value) throw Error("Missing intrinsic container");
		return value;
	};
	const local = () =>
		layoutFlexContainer(document, reference("#container"), {
			contentWidth: 100,
			containingWidth: 160,
			containingHeight: null,
		});
	return { document, id, reference, box, intrinsic, local };
}

it.each([
	["column", "wrap", 0, 0, 25, 20, 0],
	["column-reverse", "wrap", 0, 25, 0, 20, 25],
	["column", "wrap-reverse", 85, 0, 25, 65, 0],
	["column-reverse", "wrap-reverse", 85, 25, 0, 65, 25],
])(
	"places both axes: %s %s",
	(direction, wrap, firstX, firstY, secondY, thirdX, thirdY) => {
		const { box, document, local } = fixture(
			`main{flex-direction:${direction};flex-wrap:${wrap}}`,
		);
		const layout = layoutDocument(document);
		expect(box("#first", layout)).toMatchObject({
			borderX: firstX,
			borderY: firstY,
			contentHeight: 20,
		});
		expect(box("#second", layout).borderY).toBe(secondY);
		expect(box("#third", layout)).toMatchObject({
			borderX: thirdX,
			borderY: thirdY,
		});
		expect(local().items.map((item) => item.line)).toEqual([0, 0, 1]);
		expect(box("#after", layout).borderY).toBe(45);
	},
);

it.each([
	["flex-start", 0, 20],
	["start", 0, 20],
	["flex-end", 65, 85],
	["end", 65, 85],
	["center", 32.5, 52.5],
	["space-between", 0, 85],
	["space-around", 16.25, 68.75],
	["space-evenly", 65 / 3, 20 + 130 / 3],
	["stretch", 0, 52.5],
	["normal", 0, 52.5],
])("distributes real column widths with %s", (mode, first, third) => {
	const { box } = fixture(`main{align-content:${mode}}`);
	expect(box("#first").borderX).toBeCloseTo(first);
	expect(box("#third").borderX).toBeCloseTo(third);
});

it.each([
	["flex-start", 85, 65],
	["start", 20, 0],
	["flex-end", 20, 0],
	["end", 85, 65],
	["center", 52.5, 32.5],
	["space-between", 85, 0],
])("maps reversed column distribution %s physically", (mode, first, third) => {
	const { box } = fixture(`main{flex-wrap:wrap-reverse;align-content:${mode}}`);
	expect(box("#first").borderX).toBe(first);
	expect(box("#third").borderX).toBe(third);
});

it("stretches each line and then reflows its auto-width items", () => {
	const { box, document, local } = fixture(
		"main{align-content:stretch}main>div{width:auto}",
	);
	const result = layoutDocument(document);
	for (const selector of ["#first", "#second", "#third"])
		expect(box(selector, result).contentWidth).toBe(47.5);
	expect(box("#third", result).borderX).toBe(52.5);
	expect(local().lines.map((line) => line.crossSize)).toEqual([47.5, 47.5]);
});

it("uses hypothetical fit-content widths before stretching wrapped lines", () => {
	const { local, box } = fixture("main>div{width:auto}#second{min-width:30px}");
	expect(local().lines.map((line) => line.crossSize)).toEqual([30, 6]);
	expect(box("#first").contentWidth).toBe(30);
	expect(box("#third").borderX).toBe(35);
});

it.each([
	["flex-start", "wrap", 0],
	["center", "wrap", 10],
	["flex-end", "wrap", 20],
	["flex-start", "wrap-reverse", 90],
	["start", "wrap-reverse", 70],
	["flex-end", "wrap-reverse", 70],
	["end", "wrap-reverse", 90],
])("aligns items within their own line: %s %s", (align, wrap, firstX) => {
	const { box } = fixture(
		`main{flex-wrap:${wrap};align-items:${align}}#first{width:10px}#second{width:30px}`,
	);
	expect(box("#first").borderX).toBe(firstX);
});

it.each([
	["margin-left:auto", 20],
	["margin-right:auto", 0],
	["margin-left:auto;margin-right:auto", 10],
])("resolves cross auto margins per column: %s", (margins, firstX) => {
	const { box } = fixture(`#first{width:10px;${margins}}#second{width:30px}`);
	expect(box("#first").borderX).toBe(firstX);
});

it.each([
	["space-between", 0],
	["center", 12.5],
	["flex-end", 25],
])("justifies each column independently: %s", (mode, thirdY) => {
	const { box } = fixture(`main{justify-content:${mode}}`);
	expect(box("#third").borderY).toBe(thirdY);
});

it.each([
	["height:auto", 70, [0, 25, 50]],
	["height:auto;max-height:50px", 45, [0, 25, 0]],
	["height:auto;max-height:30px", 20, [0, 0, 0]],
	["height:auto;max-height:30px;min-height:25px", 25, [0, 0, 0]],
])(
	"derives automatic height from collected columns: %s",
	(css, height, positions) => {
		const { box, document } = fixture(`main{${css}}`);
		const layout = layoutDocument(document);
		expect(box("#container", layout).contentHeight).toBe(height);
		expect(
			["#first", "#second", "#third"].map(
				(selector) => box(selector, layout).borderY,
			),
		).toEqual(positions);
		expect(box("#after", layout).borderY).toBe(height);
	},
);

it("keeps zero and oversized hypothetical items on valid lines", () => {
	const { local, box } = fixture(
		"main{height:0}main>div{height:0}#second{height:20px}",
	);
	expect(local().lines).toHaveLength(3);
	expect(box("#second").contentHeight).toBe(20);
});

it("uses definite percentage main gaps and actual cross gaps", () => {
	const { box } = fixture("main{row-gap:10%;column-gap:10%}");
	expect(box("#second").borderY).toBe(24.5);
	expect(box("#third").borderX).toBe(25);
});

it("measures wrapped intrinsic width as line widths plus gaps, with a one-line minimum", () => {
	const { intrinsic } = fixture();
	expect(intrinsic()).toMatchObject({
		minContent: 15,
		maxContent: 35,
		minContribution: 100,
		maxContribution: 100,
	});
});

it.each([
	["wrap", 35],
	["wrap-reverse", 35],
	["nowrap", 15],
])("measures intrinsic cross sizes for %s", (wrap, maximum) => {
	const { intrinsic } = fixture(`main{width:auto;flex-wrap:${wrap}}`);
	expect(intrinsic()).toMatchObject({
		minContent: 15,
		maxContent: maximum,
		maxContribution: maximum,
	});
});

it("treats cyclic intrinsic percentages as indefinite while retaining gap constants", () => {
	const { intrinsic } = fixture(
		"main{width:auto;column-gap:calc(10% + 2px)}main>div{width:50%;padding-left:10%;margin-right:10%}",
	);
	expect(intrinsic()).toMatchObject({ minContent: 6, maxContent: 14 });
});

it("feeds measured multi-column width into an outer row allocation", () => {
	const { box } = fixture(
		"article{display:flex;width:100px;align-items:flex-start}main{width:auto;flex:0 0 auto}aside{width:10px}",
		undefined,
		true,
	);
	expect(box("#container").contentWidth).toBe(35);
	expect(box("#third").borderX).toBe(20);
	expect(box("#peer").borderX).toBe(35);
});

it("retains real text wrapping during vertical allocation", () => {
	const { document, box } = fixture(
		"main{height:45px}main>div{width:18px;height:auto}",
		'<div id="first">ab cd</div><div id="second">ef gh</div><div id="third">ij kl</div>',
	);
	const layout = layoutDocument(document);
	expect(box("#first", layout).contentHeight).toBe(20);
	expect(box("#second", layout).borderY).toBe(25);
	expect(box("#third", layout).borderX).toBe(23);
	expect(layout.metrics.glyphs).toBe(12);
});

it("grows each line independently and resolves nested percentage heights", () => {
	const { box } = fixture(
		"main{height:50px}main>div{flex:1 0 20px;min-height:0}section{height:50%}",
		'<div id="first"><section id="nested">A</section></div><div id="second">B</div><div id="third">C</div>',
	);
	expect(box("#first").contentHeight).toBe(22.5);
	expect(box("#nested").contentHeight).toBe(11.25);
	expect(box("#third").contentHeight).toBe(50);
});

it("invalidates column collection and shared geometry after height mutation", () => {
	const { document, id, box } = fixture();
	const original = documentGeometry(document).getBoundingClientRect(
		id("#third"),
	);
	document.setAttribute(id("#container"), "style", "height:70px");
	expect(box("#third")).toMatchObject({ borderX: 0, borderY: 50 });
	expect(original.x).toBe(20);
});

it("shares order-modified paint and hit ownership across overlapping columns", () => {
	const { document, id, box } = fixture(
		"main{height:20px;column-gap:0}main>div{width:30px}#first{background:red}#second{background:blue;margin-left:-15px}#third{display:none}",
	);
	expect(box("#second").borderX).toBe(15);
	const image = rasterizeDocument(document).image;
	const offset = (12 * image.width + 20) * 4;
	expect([...image.pixels.subarray(offset, offset + 4)]).toEqual([
		0, 0, 255, 255,
	]);
	expect(documentHitTesting(document).elementFromPoint(20, 12)).toBe(
		id("#second"),
	);
});

it("reproduces the WPT column-reverse authored heights and physical margins", () => {
	const { box } = fixture(
		"main{width:300px;height:300px;gap:0;flex-direction:column-reverse;align-content:normal}main>div{width:auto;height:90px;flex:none;margin-top:10px;margin-right:10px}#item3,#item4{height:140px}#item5{height:290px}",
		Array.from(
			{ length: 6 },
			(_, index) => `<div id="item${index}">${index + 1}-x</div>`,
		).join(""),
	);
	for (const [index, x, y, height] of [
		[0, 0, 210, 90],
		[1, 0, 110, 90],
		[2, 0, 10, 90],
		[3, 100, 160, 140],
		[4, 100, 10, 140],
		[5, 200, 10, 290],
	])
		expect(box(`#item${index}`)).toMatchObject({
			borderX: x,
			borderY: y,
			contentWidth: 90,
			contentHeight: height,
		});
});

it("keeps aggregate intrinsic work bounded across real reflow", () => {
	const { document } = fixture();
	const work = measureIntrinsicWidths(document).metrics.work;
	expect(measureIntrinsicWidths(document, { maxWork: work }).metrics.work).toBe(
		work,
	);
	expect(() => measureIntrinsicWidths(document, { maxWork: work - 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([
	["safe center", "wrap", 0],
	["center", "wrap", -15],
	["safe flex-end", "wrap-reverse", 20],
	["space-between", "wrap-reverse", 20],
	["space-around", "wrap", 0],
	["space-evenly", "wrap-reverse", 20],
])(
	"uses physical safe fallbacks for overflowing line distribution %s %s",
	(align, wrap, firstX) => {
		const { document, id, reference } = fixture(
			`main{width:5px;align-content:${align};flex-wrap:${wrap}}`,
		);
		const layout = layoutFlexContainer(document, reference("#container"), {
			contentWidth: 5,
			containingWidth: 160,
			containingHeight: null,
		});
		expect(
			layout.boxes.find((box) => box.ref === reference("#first"))?.borderX,
		).toBe(firstX);
		expect(id("#container")).toBeGreaterThan(0);
	},
);

it("remeasures nested wrapped columns through the same intrinsic owner", () => {
	const { intrinsic, box } = fixture(
		"main{width:auto;height:20px}#first{display:flex;flex-direction:column;flex-wrap:wrap;width:auto;gap:5px}section{height:20px;width:10px}",
		'<div id="first"><section>X</section><section>Y</section></div><div id="second">B</div><div id="third">C</div>',
	);
	expect(intrinsic()).toMatchObject({ minContent: 15, maxContent: 65 });
	expect(box("#first").contentWidth).toBe(25);
	expect(box("#second").borderX).toBe(30);
});

it("derives a replaced line width after its main allocation", async () => {
	const { document, box, local } = fixture(
		"main{height:40px}img{height:20px;flex:1 0 20px;min-height:0;align-self:start}",
		'<img id="first" src="/image.png"><img id="second" src="/image.png">',
	);
	const body = encodePng(createRaster(20, 10, [0, 255, 0, 255]));
	await documentImages(document, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body,
			redirects: [],
			encodedBytes: body.length,
			elapsedMs: 0,
		}),
	}).settle();
	expect(box("#first")).toMatchObject({ contentWidth: 80, contentHeight: 40 });
	expect(box("#second").borderX).toBe(85);
	expect(local().lines.map((line) => line.crossSize)).toEqual([80, 80]);
	expect(rasterizeDocument(document).metrics.paintedImages).toBe(2);
});

it.each(["wrap", "wrap-reverse"])(
	"retains unknown control baseline dependencies for %s",
	(wrap) => {
		const { document } = fixture(
			`article{display:flex;align-items:baseline}main{flex-wrap:${wrap}}button{height:20px}`,
			"<button>A</button><button>B</button><button>C</button>",
			true,
		);
		expect(() => layoutDocument(document)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("shrinks an oversized item on its own line without moving following items into it", () => {
	const { box, local } = fixture(
		"#first{height:80px;flex-shrink:1;min-height:0}",
	);
	expect(local().items.map((item) => item.line)).toEqual([0, 1, 1]);
	expect(box("#first").contentHeight).toBe(45);
	expect(box("#second")).toMatchObject({ borderX: 20, borderY: 0 });
	expect(box("#third").borderY).toBe(25);
});

it("returns empty wrapped columns without invented lines or height", () => {
	const { intrinsic, local, box } = fixture("main{height:auto;width:auto}", "");
	expect(local().lines).toEqual([]);
	expect(box("#container").contentHeight).toBe(0);
	expect(intrinsic()).toMatchObject({ minContent: 0, maxContent: 0 });
});

it("enforces the exact whole-page budget after column collection", () => {
	const { document } = fixture();
	const work = layoutDocument(document).metrics.work;
	expect(layoutDocument(document, { maxWork: work }).metrics.work).toBe(work);
	expect(() => layoutDocument(document, { maxWork: work - 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("does not charge an unused trailing gap as a physical extent", () => {
	const { local } = fixture("main{height:100px;column-gap:16777216px}");
	expect(local().lines).toHaveLength(1);
	expect(local().lines[0].crossSize).toBe(15);
});

it("does not advertise inline formatting through the container-only API", () => {
	const { local } = fixture("main{display:inline-flex}");
	expect(local).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each([
	["column", "wrap", "baseline", "first"],
	["column-reverse", "wrap", "baseline", "second"],
	["column", "wrap-reverse", "baseline", "third"],
	["column-reverse", "wrap-reverse", "baseline", "third"],
	["column", "wrap", "last baseline", "third"],
	["column-reverse", "wrap", "last baseline", "third"],
	["column", "wrap-reverse", "last baseline", "second"],
	["column-reverse", "wrap-reverse", "last baseline", "first"],
])(
	"exports %s %s %s from the visual line/item order",
	(direction, wrap, alignment, selected) => {
		const { document, reference } = fixture(
			`article{display:flex;width:160px;align-items:${alignment}}main{flex-direction:${direction};flex-wrap:${wrap}}#first{font-size:8px}#second{font-size:12px}#third{font-size:16px}aside{font-size:24px}`,
			undefined,
			true,
		);
		const layout = layoutDocument(document);
		const baseline = (selector: string) =>
			layout.contexts.find((context) => context.ref === reference(selector))
				?.lines[0].baseline;
		expect(baseline("#peer")).toBe(baseline(`#${selected}`));
	},
);
