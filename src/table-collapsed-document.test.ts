import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument, type DocumentRaster } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutContentItems } from "./layout-paint-order.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const sessions: BrowserSession[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	css = "",
	markup = '<table id="table"><tbody id="group"><tr id="row"><td id="first">A</td><td id="second">B</td></tr></tbody></table>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;background:white;font-size:8px;line-height:8px}table{border-collapse:collapse;width:60px}td{padding:0;height:12px;vertical-align:top;border:2px solid red}${css}</style><body>${markup}`,
		"https://fixture.invalid/collapsed-document",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(128, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const rectangle = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	const box = (selector: string) => {
		const found = layoutDocument(tree).boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing layout ${selector}`);
		return found;
	};
	return { tree, id, rectangle, box };
}

function pixel(raster: DocumentRaster, horizontal: number, vertical: number) {
	const column = Math.floor(horizontal - raster.clip.x);
	const row = Math.floor(vertical - raster.clip.y);
	if (
		column < 0 ||
		column >= raster.image.width ||
		row < 0 ||
		row >= raster.image.height
	)
		throw new Error("Sample outside raster");
	const offset = (row * raster.image.width + column) * 4;
	return [...raster.image.pixels.slice(offset, offset + 4)];
}

it.each([
	{ border: "6px solid blue", color: [0, 0, 255, 255], half: 3 },
	{
		border: "6px solid rgba(0,0,255,0.5)",
		color: [127, 127, 255, 255],
		half: 3,
	},
	{ border: "6px solid transparent", color: [255, 255, 255, 255], half: 3 },
	{ border: "6px hidden blue", color: [255, 255, 255, 255], half: 0 },
])(
	"paints the winning shared $border once above cell backgrounds",
	({ border, color, half }) => {
		const test = fixture(
			`table{background:green}tr{background:yellow}td{background:white}#second{border-left:${border}}`,
			'<table id="table"><tr><td id="first"></td><td id="second"></td></tr></table>',
		);
		const first = test.rectangle("#first");
		const second = test.rectangle("#second");
		expect(first.right).toBe(second.left);
		expect(test.box("#first").borderRight).toBe(half);
		expect(test.box("#second").borderLeft).toBe(half);
		expect(
			pixel(
				rasterizeDocument(test.tree),
				first.right,
				first.top + first.height / 2,
			),
		).toEqual(color);
	},
);

it("retains physical hit ownership on each half of a shared winning border", () => {
	const test = fixture("#second{border-left:8px solid blue}");
	const first = test.rectangle("#first");
	const second = test.rectangle("#second");
	const vertical = first.top + first.height / 2;
	const hits = documentHitTesting(test.tree);
	expect(hits.elementFromPoint(first.right - 0.25, vertical)).toBe(
		test.id("#first"),
	);
	expect(hits.elementFromPoint(second.left + 0.25, vertical)).toBe(
		test.id("#second"),
	);
	expect(
		pixel(rasterizeDocument(test.tree), first.right - 1, vertical),
	).toEqual([0, 0, 255, 255]);
});

it("paints the outer half inside the table bounds without stealing cell hits", () => {
	const test = fixture();
	const table = test.rectangle("#table");
	const first = test.rectangle("#first");
	expect(first.left - table.left).toBe(1);
	expect(
		documentHitTesting(test.tree).elementFromPoint(
			table.left + 0.25,
			first.top + 6,
		),
	).toBe(test.id("#table"));
	expect(
		pixel(rasterizeDocument(test.tree), table.left, first.top + 6),
	).toEqual([255, 0, 0, 255]);
});

it("paints colspan borders without drawing a line through the spanning cell", () => {
	const test = fixture(
		"td{background:yellow}",
		'<table id="table"><tr><td id="wide" colspan="2">A</td></tr><tr><td id="first">B</td><td id="second">C</td></tr></table>',
	);
	const wide = test.rectangle("#wide");
	const first = test.rectangle("#first");
	const raster = rasterizeDocument(test.tree);
	expect(pixel(raster, first.right, wide.top + wide.height / 2)).toEqual([
		255, 255, 0, 255,
	]);
	expect(pixel(raster, first.right, first.top + first.height / 2)).toEqual([
		255, 0, 0, 255,
	]);
});

it("paints rowspan borders without cutting the tall cell at the next row", () => {
	const test = fixture(
		"td{background:yellow}",
		'<table id="table"><tr><td id="tall" rowspan="2">A</td><td id="first">B</td></tr><tr><td id="second">C</td></tr></table>',
	);
	const tall = test.rectangle("#tall");
	const second = test.rectangle("#second");
	const raster = rasterizeDocument(test.tree);
	expect(pixel(raster, tall.left + tall.width / 2, second.top)).toEqual([
		255, 255, 0, 255,
	]);
	expect(pixel(raster, second.left + second.width / 2, second.top)).toEqual([
		255, 0, 0, 255,
	]);
});

it("keeps collapsed and separate nested table ownership independent", () => {
	const test = fixture(
		"#nested{width:20px}#nested td{border:2px solid blue}",
		'<table id="table"><tr><td id="first"><table id="nested"><tr><td id="inner">N</td></tr></table></td><td id="second">B</td></tr></table>',
	);
	const layout = layoutDocument(test.tree);
	expect(
		layout.boxes.filter((box) => box.collapsedTableBorders !== undefined),
	).toHaveLength(2);
	const nested = test.rectangle("#inner");
	expect(
		pixel(
			rasterizeDocument(test.tree),
			nested.left,
			nested.top + nested.height / 2,
		),
	).toEqual([0, 0, 255, 255]);
	expect(
		documentHitTesting(test.tree).elementFromPoint(
			nested.left + nested.width / 2,
			nested.top + nested.height / 2,
		),
	).toBe(test.id("#inner"));
	test.tree.setAttribute(
		test.id("#nested"),
		"style",
		"border-collapse:separate;border-spacing:3px",
	);
	expect(
		layoutDocument(test.tree).boxes.filter(
			(box) => box.collapsedTableBorders !== undefined,
		),
	).toHaveLength(1);
	expect(test.box("#inner").borderLeft).toBe(2);
});

it.each([
	"position:relative;left:7px;top:9px",
	"position:absolute;left:7px;top:9px;width:100px",
	"position:fixed;left:7px;top:9px;width:100px",
])(
	"keeps content-relative border coordinates under an ancestor with %s",
	(position) => {
		const test = fixture(
			"",
			`<div style="${position}"><table id="table"><tr><td id="first">A</td><td id="second">B</td></tr></table></div>`,
		);
		const first = test.rectangle("#first");
		expect(first.left).toBeGreaterThanOrEqual(8);
		expect(first.top).toBeGreaterThanOrEqual(10);
		expect(
			pixel(
				rasterizeDocument(test.tree),
				first.left,
				first.top + first.height / 2,
			),
		).toEqual([255, 0, 0, 255]);
	},
);

it("keeps clipped raster samples equal to the full border rendering", () => {
	const test = fixture("#second{border-left:6px solid blue}");
	const first = test.rectangle("#first");
	const full = rasterizeDocument(test.tree);
	const clip = { x: first.right - 2, y: first.top + 2, width: 5, height: 6 };
	const clipped = rasterizeDocument(test.tree, { clip });
	for (let row = 0; row < clip.height; row++)
		for (let column = 0; column < clip.width; column++)
			expect(pixel(clipped, clip.x + column, clip.y + row)).toEqual(
				pixel(full, clip.x + column, clip.y + row),
			);
});

it("keeps the winning invisible border from exposing a weaker cell border", () => {
	const test = fixture(
		"#first{visibility:hidden;border-right:8px solid green}#second{border-left:4px solid blue}",
	);
	const second = test.rectangle("#second");
	expect(test.box("#second").borderLeft).toBe(4);
	expect(
		pixel(
			rasterizeDocument(test.tree),
			second.left,
			second.top + second.height / 2,
		),
	).toEqual([255, 255, 255, 255]);
});

it("retains the existing table and descendant-float reflow guard", () => {
	const test = fixture(
		"#cover{float:left;width:6px;height:6px;margin-left:-2px;background:blue}",
		'<table id="table"><tr><td id="first"><div id="cover"></div></td><td id="second">B</td></tr></table>',
	);
	expect(() => rasterizeDocument(test.tree)).toThrow(
		"Float content requires coordinated page layout",
	);
});

it("paints relative descendants above shared borders with actual hit ownership", () => {
	const test = fixture(
		"#cover{position:relative;left:-2px;width:6px;height:6px;background:blue}",
		'<table id="table"><tr><td id="first"><div id="cover"></div></td><td id="second">B</td></tr></table>',
	);
	const first = test.rectangle("#first");
	const cover = test.rectangle("#cover");
	const horizontal = first.left;
	const vertical = cover.top + 2;
	expect(cover.left).toBeLessThan(first.left);
	expect(pixel(rasterizeDocument(test.tree), horizontal, vertical)).toEqual([
		0, 0, 255, 255,
	]);
	expect(
		documentHitTesting(test.tree).elementFromPoint(horizontal, vertical),
	).toBe(test.id("#cover"));
});

it("orders all collapsed cell backgrounds before borders and glyph content", () => {
	const test = fixture();
	const layout = layoutDocument(test.tree);
	const items = [...layoutContentItems(layout, () => {})];
	const borders = items.findIndex((item) => item.kind === "table-borders");
	expect(borders).toBeGreaterThan(0);
	for (const selector of ["#first", "#second"]) {
		const ref = test.tree.reference(test.id(selector));
		expect(
			items.findIndex((item) => item.kind === "box" && item.box.ref === ref),
		).toBeLessThan(borders);
	}
	expect(items.findIndex((item) => item.kind === "glyph")).toBeGreaterThan(
		borders,
	);
});

it("invalidates geometry, paint and hit caches without changing old snapshots", () => {
	const test = fixture();
	const geometry = documentGeometry(test.tree);
	const before = test.rectangle("#first");
	const oldLayout = layoutDocument(test.tree);
	const oldRaster = rasterizeDocument(test.tree);
	const oldPixels = oldRaster.image.pixels.slice();
	const hits = documentHitTesting(test.tree);
	hits.elementFromPoint(before.left + 2, before.top + 2);
	const builds = {
		geometry: geometry.metrics().builds,
		hits: hits.metrics().builds,
	};
	test.tree.setAttribute(
		test.id("#second"),
		"style",
		"border-left:8px solid blue",
	);
	const after = test.rectangle("#first");
	expect(test.box("#first").borderRight).toBe(4);
	expect(
		oldLayout.boxes.find(
			(box) => box.ref === test.tree.reference(test.id("#first")),
		)?.borderRight,
	).toBe(1);
	expect(
		pixel(
			rasterizeDocument(test.tree),
			after.right,
			after.top + after.height / 2,
		),
	).toEqual([0, 0, 255, 255]);
	hits.elementFromPoint(after.right - 0.25, after.top + after.height / 2);
	expect(geometry.metrics().builds).toBeGreaterThan(builds.geometry);
	expect(hits.metrics().builds).toBeGreaterThan(builds.hits);
	expect(oldRaster.image.pixels).toEqual(oldPixels);
});

it("completes a genuine native collapsed-cell link click with pointer events", async () => {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				const source = request.url.endsWith("/destination")
					? "<!doctype html><h1>Destination</h1>"
					: '<!doctype html><style>html,body{margin:0}table{border-collapse:collapse;width:180px}td{border:3px solid blue;height:40px;vertical-align:top}</style><table><tr><td>First</td><td><a id="target" href="/destination">Next</a></td></tr></table>';
				return {
					url: request.url,
					status: 200,
					headers: { "content-type": ["text/html; charset=utf-8"] },
					body: new TextEncoder().encode(source),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				closed,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
			}),
			close: () => {
				closed = true;
			},
		}),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, "https://fixture.invalid/start");
	const page = session.page(tab.id);
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing link");
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			events.push(type),
		);
	await session.click(tab.id, page.document.reference(target));
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(requests.map((request) => request.url)).toEqual([
		"https://fixture.invalid/start",
		"https://fixture.invalid/destination",
	]);
	expect(session.page(tab.id).queries.querySelector("h1")).not.toBeNull();
	expect(page.document.nodeCount).toBe(0);
	expect(page.interactions.events.metrics()).toMatchObject({
		closed: true,
		listeners: 0,
	});
	session.close();
	expect(closed).toBe(true);
	expect(session.metrics()).toMatchObject({
		closed: true,
		tabs: 0,
		pendingLoads: 0,
		cleanupErrors: 0,
	});
});
