import { afterEach, expect, it, vi } from "vitest";
import * as nativeLayout from "./document-layout.js";
import { DocumentTree } from "./document.js";
import {
	DocumentHitTesting,
	documentHitTesting,
	hitTestLimits,
} from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { documentGeometry } from "./document-geometry.js";
import { documentElementScroll } from "./element-scroll.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentImages } from "./document-images.js";
import { createRaster } from "./raster.js";
import { encodePng } from "./png.js";

const documents: DocumentTree[] = [];
function fixture(
	html = '<main><div id="target"></div></main>',
	css = "#target{width:40px;height:30px}",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}main{width:100px;font-size:8px;line-height:12px}${css}</style>${html}`,
		"https://fixture.invalid/hit-testing",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error(`Missing ${selector}`);
		return result;
	};
	const hits = documentHitTesting(tree);
	return { tree, id, hits };
}
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of documents.splice(0)) tree.close();
});

function inertRegionFixture(target: string, prefix = "") {
	const result = fixture(
		`<main><select>${prefix}<button><span>Choice</span></button><option>One</option></select></main>`,
		"select{display:block;width:40px;height:30px}",
	);
	const layout = nativeLayout.layoutDocument(result.tree);
	const selectRef = result.tree.reference(result.id("select"));
	const targetRef = result.tree.reference(result.id(target));
	const formatting = layout.text.horizontal.formatting;
	vi.spyOn(nativeLayout, "layoutDocument").mockReturnValue({
		...layout,
		text: {
			...layout.text,
			horizontal: {
				...layout.text.horizontal,
				formatting: {
					...formatting,
					nodes: formatting.nodes.map((node) =>
						node.ref === selectRef ? { ...node, ref: targetRef } : node,
					),
				},
			},
		},
	});
	return result;
}

it.each(["button", "span"])(
	"filters injected native boxes for implicitly inert %s",
	(target) => {
		const { hits, id } = inertRegionFixture(target);
		expect(hits.elementsFromPoint(5, 5)).not.toContain(id(target));
		expect(hits.elementFromPoint(5, 5)).toBe(id("main"));
	},
);

it("does not filter the select's own native box", () => {
	const { hits, id } = inertRegionFixture("select");
	expect(hits.elementFromPoint(5, 5)).toBe(id("select"));
});

it("invalidates injected-box inert eligibility after prefix insertion/removal", () => {
	const { tree, hits, id } = inertRegionFixture("span");
	expect(hits.elementFromPoint(5, 5)).toBe(id("main"));
	const prefix = tree.createElement("div");
	tree.insert(id("select"), prefix, id("button"));
	expect(hits.elementFromPoint(5, 5)).toBe(id("span"));
	tree.remove(prefix);
	expect(hits.elementFromPoint(5, 5)).toBe(id("main"));
	expect(hits.metrics().builds).toBe(3);
});

it("does not classify later select buttons as implicitly inert", () => {
	const { hits, id } = inertRegionFixture("button", "<div hidden></div>");
	expect(hits.elementFromPoint(5, 5)).toBe(id("button"));
});

it("does not let descendant pointer-events override implicit inertness", () => {
	const { tree, hits, id } = inertRegionFixture("span");
	tree.setAttribute(id("span"), "style", "pointer-events:auto");
	expect(hits.elementsFromPoint(5, 5)).not.toContain(id("span"));
});

it("hits transparent block boxes in reverse paint order and appends the root", () => {
	const { hits, id } = fixture();
	expect(hits.elementFromPoint(5, 5)).toBe(id("#target"));
	expect(hits.elementsFromPoint(5, 5)).toEqual([
		id("#target"),
		id("main"),
		id("body"),
		id("html"),
	]);
	expect(hits.elementFromPoint(75, 5)).toBe(id("main"));
	expect(hits.elementFromPoint(75, 60)).toBe(id("html"));
});

it("uses padding boxes, excludes margins and honors fractional half-open edges", () => {
	const { hits, id } = fixture(
		undefined,
		"#target{margin:5px;width:10.5px;height:10.5px;padding:2px}",
	);
	expect(hits.elementFromPoint(5, 5)).toBe(id("#target"));
	expect(hits.elementFromPoint(19.499, 10)).toBe(id("#target"));
	expect(hits.elementFromPoint(19.5, 10)).not.toBe(id("#target"));
	expect(hits.elementFromPoint(4.99, 10)).not.toBe(id("#target"));
});

it.each([
	[-1, 0],
	[0, -1],
	[100.1, 0],
	[0, 80.1],
])("returns no result outside the viewport at %s,%s", (x, y) => {
	const { hits } = fixture();
	expect(hits.elementFromPoint(x, y)).toBeNull();
	expect(hits.elementsFromPoint(x, y)).toEqual([]);
	expect(hits.metrics().builds).toBe(0);
});

it("returns root fallback at exact viewport boundaries", () => {
	const { hits, id } = fixture();
	expect(hits.elementFromPoint(100, 80)).toBe(id("html"));
});

it.each([
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	"1",
	undefined,
])("rejects invalid native coordinate %s before layout", (value) => {
	const { hits } = fixture();
	expect(() => hits.elementFromPoint(value as number, 1)).toThrow(TypeError);
	expect(hits.metrics().builds).toBe(0);
});

it("returns empty results for a document without a root element", () => {
	const tree = new DocumentTree("https://fixture.invalid/empty");
	documents.push(tree);
	const hits = documentHitTesting(tree);
	expect(hits.elementFromPoint(1, 1)).toBeNull();
	expect(hits.elementsFromPoint(1, 1)).toEqual([]);
});

it.each(["display:none", "visibility:hidden", "width:0", "height:0"])(
	"excludes a target with %s",
	(rule) => {
		const { hits, id } = fixture(
			undefined,
			`#target{width:40px;height:30px;${rule}}`,
		);
		expect(hits.elementsFromPoint(1, 1)).not.toContain(id("#target"));
	},
);

it("allows visible descendants of hidden ancestors without hitting the hidden box", () => {
	const { hits, id } = fixture(
		'<main><div id="outer"><div id="inner"></div></div></main>',
		"#outer{width:30px;height:30px;visibility:hidden}#inner{width:10px;height:10px;visibility:visible}",
	);
	expect(hits.elementFromPoint(1, 1)).toBe(id("#inner"));
	expect(hits.elementsFromPoint(1, 1)).not.toContain(id("#outer"));
});

it("does not invent a display:contents box but keeps its source text parent as the text target", () => {
	const { hits, id } = fixture(
		'<main><span id="contents">ABC</span></main>',
		"#contents{display:contents}",
	);
	expect(hits.elementFromPoint(1, 3)).toBe(id("#contents"));
	expect(hits.elementsFromPoint(1, 3)[0]).toBe(id("#contents"));
	expect(hits.elementsFromPoint(50, 3)).not.toContain(id("#contents"));
});

it("uses actual overlap order for negative-margin blocks", () => {
	const { tree, hits, id } = fixture(
		'<main><div id="first"></div><div id="last"></div></main>',
		"#first,#last{width:30px;height:20px}#first{background:red}#last{margin-top:-10px;background:blue}",
	);
	expect(hits.elementsFromPoint(5, 15)).toEqual([
		id("#last"),
		id("#first"),
		id("main"),
		id("body"),
		id("html"),
	]);
	const raster = rasterizeDocument(tree).image;
	const offset = (15 * raster.width + 5) * 4;
	expect([...raster.pixels.slice(offset, offset + 4)]).toEqual([
		0, 0, 255, 255,
	]);
});

it("ranks earlier text content over later block backgrounds rather than reversing DOM order", () => {
	const { hits, id } = fixture(
		'<main><div id="first">A</div><div id="last"></div></main>',
		"#first,#last{width:30px;height:20px}#last{margin-top:-20px;background:blue}",
	);
	expect(hits.elementFromPoint(1, 3)).toBe(id("#first"));
	expect(hits.elementFromPoint(20, 3)).toBe(id("#last"));
});

it("returns inline elements rather than text nodes and deduplicates wrapped fragments", () => {
	const { tree, hits, id } = fixture(
		'<main><span id="inline">ab cd ef</span></main>',
		"main{width:16px}",
	);
	const rectangles = documentGeometry(tree).getClientRects(id("#inline"));
	expect(rectangles.length).toBeGreaterThan(1);
	for (const rectangle of rectangles) {
		const sequence = hits.elementsFromPoint(
			rectangle.x + 0.5,
			rectangle.y + 0.5,
		);
		expect(sequence[0]).toBe(id("#inline"));
		expect(sequence.filter((value) => value === id("#inline"))).toHaveLength(1);
	}
});

it("hits nested inline padding before its ancestors", () => {
	const { tree, hits, id } = fixture(
		'<main><span id="outer"><span id="inner">A</span></span></main>',
		"#inner{padding:2px}",
	);
	const box = documentGeometry(tree).getClientRects(id("#inner"))[0];
	expect(hits.elementFromPoint(box.left + 0.5, box.top + 0.5)).toBe(
		id("#inner"),
	);
});

it("caches regions but invalidates them for style, viewport, insertion and detach", () => {
	const { tree, hits, id } = fixture(
		undefined,
		"#target{width:50%;height:30px}main{width:100%}",
	);
	expect(documentHitTesting(tree)).toBe(hits);
	expect(hits.elementFromPoint(40, 1)).toBe(id("#target"));
	const before = hits.metrics();
	hits.elementFromPoint(40, 1);
	expect(hits.metrics().builds).toBe(before.builds);
	documentStyles(tree).setViewport(50, 80);
	expect(hits.elementFromPoint(40, 1)).toBe(id("main"));
	tree.setAttribute(id("#target"), "style", "width:45px");
	expect(hits.elementFromPoint(40, 1)).toBe(id("#target"));
	const target = id("#target");
	tree.remove(target);
	expect(hits.elementsFromPoint(1, 1)).not.toContain(target);
	tree.append(id("main"), target);
	expect(hits.elementFromPoint(1, 1)).toBe(target);
	expect(hits.metrics().builds).toBe(before.builds + 4);
});

it.each([
	"position:sticky;transform:translateY(1px)",
	"transform:translateX(1px)",
	"pointer-events:visiblepainted",
	"opacity:0.5",
])("fails closed for unsupported hit-affecting CSS %s", (rule) => {
	const { tree, hits, id } = fixture(
		undefined,
		`#target{width:40px;height:30px;${rule}}`,
	);
	expect(() => hits.elementFromPoint(1, 1)).toThrow();
	expect(hits.metrics().builds).toBe(0);
	expect(hits.metrics().regions).toBe(0);
	tree.setTextContent(id("style"), "#target{width:40px;height:30px}");
	expect(hits.elementFromPoint(1, 1)).toBe(id("#target"));
});

it.each(["hidden", "clip"])(
	"clips descendant hit regions for supported overflow:%s",
	(overflow) => {
		const { tree, hits, id } = fixture(
			'<main><div id="target"><div id="child"></div></div></main>',
			`#target{width:40px;height:30px;overflow:${overflow}}#child{width:60px;height:50px}`,
		);
		expect(hits.elementFromPoint(10, 10)).toBe(id("#child"));
		expect(hits.elementFromPoint(50, 10)).toBe(id("main"));
		expect(documentElementScroll(tree).to(id("#target"), 12, 8)).toBe(
			overflow === "hidden",
		);
		expect(
			documentGeometry(tree).getBoundingClientRect(id("#child")),
		).toMatchObject({
			x: overflow === "hidden" ? -12 : 0,
			y: overflow === "hidden" ? -8 : 0,
			width: 60,
			height: 50,
		});
		expect(hits.elementFromPoint(10, 10)).toBe(id("#child"));
		expect(hits.elementFromPoint(50, 10)).toBe(id("main"));
	},
);

it("bounds query, region, result and cumulative work without partial successes", () => {
	const { tree } = fixture();
	const queries = new DocumentHitTesting(tree, { maxQueries: 1 });
	queries.elementFromPoint(-1, 0);
	expect(() => queries.elementFromPoint(-1, 0)).toThrow("query limit");
	const regions = new DocumentHitTesting(tree, { maxRegions: 1 });
	expect(() => regions.elementFromPoint(1, 1)).toThrow("region limit");
	expect(regions.metrics().regions).toBe(0);
	const results = new DocumentHitTesting(tree, { maxResults: 1 });
	expect(results.elementFromPoint(1, 1)).not.toBeNull();
	expect(() => results.elementsFromPoint(1, 1)).toThrow("result limit");
	const work = new DocumentHitTesting(tree, { maxWork: 1 });
	expect(() => work.elementFromPoint(1, 1)).toThrow("work limit");
	expect(work.metrics().regions).toBe(0);
});

it.each([
	{ maxWork: 0 },
	{ maxRegions: -1 },
	{ maxResults: 1.5 },
	{ maxQueries: hitTestLimits.maxQueries + 1 },
	{ unknown: 1 },
])("rejects invalid limit %j", (limits) => {
	const { tree } = fixture();
	expect(() => new DocumentHitTesting(tree, limits)).toThrow(
		"Invalid hit-test limit",
	);
});

it("returns immutable native snapshots and revokes the owner at document closure", () => {
	const { tree, hits } = fixture();
	const sequence = hits.elementsFromPoint(1, 1);
	expect(Object.isFrozen(sequence)).toBe(true);
	tree.close();
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(() => hits.elementFromPoint(-1, 0)).toThrow("closed");
	expect(sequence.length).toBeGreaterThan(0);
});

it.each(["inline", "block"])(
	"hits transparent %s replaced images and invalidates decoded dimensions",
	async (display) => {
		const { tree, hits, id } = fixture(
			'<main><img id="photo" src="/first.png"></main>',
			`#photo{display:${display}}`,
		);
		const images = documentImages(tree, {
			fetch: async (url) => {
				const body = encodePng(
					createRaster(url.endsWith("second.png") ? 12 : 3, 8, [0, 0, 0, 0]),
				);
				return {
					url,
					status: 200,
					headers: { "content-type": ["image/png"] },
					body,
					encodedBytes: body.length,
					redirects: [],
					elapsedMs: 0,
				};
			},
		});
		await images.settle();
		const box = documentGeometry(tree).getClientRects(id("#photo"))[0];
		expect(hits.elementFromPoint(box.x + 1, box.y + 1)).toBe(id("#photo"));
		expect(hits.elementFromPoint(box.x + 5, box.y + 1)).not.toBe(id("#photo"));
		tree.setAttribute(id("#photo"), "src", "/second.png");
		await images.settle();
		expect(hits.elementFromPoint(box.x + 5, box.y + 1)).toBe(id("#photo"));
	},
);

it("keeps native repeated queries bounded without rebuilding or retaining result lists", () => {
	const { hits, id } = fixture();
	const target = id("#target");
	hits.elementFromPoint(1, 1);
	const before = hits.metrics();
	for (let index = 0; index < 256; index++)
		expect(hits.elementFromPoint(1, 1)).toBe(target);
	expect(hits.metrics()).toMatchObject({
		builds: before.builds,
		regions: before.regions,
		queries: before.queries + 256,
	});
});

function hostObject(definition: ScriptHostObjectDefinition) {
	const object: Record<string, unknown> = {};
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(object, name, property);
	Object.assign(object, definition.methods);
	return object;
}
it("exposes identity-preserving document methods with finite argument conversion and facade revocation", () => {
	const { tree, hits, id } = fixture();
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	const document = dom.document as {
		elementFromPoint(...args: unknown[]): object | null;
		elementsFromPoint(...args: unknown[]): object[];
	};
	expect(document.elementFromPoint("1", true)).toBe(dom.node(id("#target")));
	expect(document.elementsFromPoint(1, 1)[0]).toBe(
		document.elementFromPoint(1, 1),
	);
	expect(document.elementFromPoint(-1, 0)).toBeNull();
	expect(() => document.elementFromPoint(1)).toThrow(TypeError);
	expect(() => document.elementFromPoint(Number.NaN, 1)).toThrow(TypeError);
	expect(() => document.elementFromPoint({}, 1)).toThrow(
		"Object-to-coordinate",
	);
	dom.close();
	expect(() => document.elementFromPoint(1, 1)).toThrow("closed");
	expect(hits.elementFromPoint(1, 1)).toBe(id("#target"));
});
