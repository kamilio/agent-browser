import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument, type DocumentRaster } from "./document-raster.js";
import { AgentBrowserError } from "./errors.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
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
	markup = '<table id="table"><tbody id="group"><tr id="row"><td id="first"></td><td id="second"></td></tr></tbody></table><div id="after"></div>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;background:white;font-size:10px;line-height:10px}table{width:200px;border-collapse:separate;border-spacing:0}td,th{padding:0;vertical-align:top}tr{height:20px}#after{height:5px}${css}</style><body>${markup}`,
		"https://fixture.invalid/table-percentage",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(320, 200);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing percentage fixture ${selector}`);
		return found;
	};
	const rectangle = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	const box = (selector: string) => {
		const found = layoutDocument(tree).boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing percentage box ${selector}`);
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
		throw new Error("Sample outside percentage raster");
	const offset = (row * raster.image.width + column) * 4;
	return [...raster.image.pixels.slice(offset, offset + 4)];
}

function expectUnsupported(run: () => unknown, context = "") {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect((error as AgentBrowserError).code).toBe("unsupported");
		return;
	}
	throw new Error(`Expected unsupported table profile: ${context}`);
}

it.each(["separate", "collapse"])(
	"coordinates fixed-pixel %s percentage cells with geometry, paint and hits",
	(model) => {
		const test = fixture(
			`table{border-collapse:${model}}#first{width:25%;background:red}#second{background:blue}`,
		);
		expect(test.rectangle("#table")).toMatchObject({
			x: 0,
			y: 0,
			width: 200,
			height: 20,
		});
		expect(test.rectangle("#first")).toMatchObject({
			x: 0,
			y: 0,
			width: 50,
			height: 20,
		});
		expect(test.rectangle("#second")).toMatchObject({
			x: 50,
			y: 0,
			width: 150,
			height: 20,
		});
		expect(test.rectangle("#row").width).toBe(200);
		expect(test.rectangle("#group").width).toBe(200);
		expect(test.rectangle("#after").y).toBe(20);
		const raster = rasterizeDocument(test.tree);
		expect(pixel(raster, 25, 10)).toEqual([255, 0, 0, 255]);
		expect(pixel(raster, 100, 10)).toEqual([0, 0, 255, 255]);
		const hits = documentHitTesting(test.tree);
		expect(hits.elementFromPoint(49, 10)).toBe(test.id("#first"));
		expect(hits.elementFromPoint(51, 10)).toBe(test.id("#second"));
	},
);

it.each(["separate", "collapse"])(
	"uses percentage inversion for an auto-width %s table",
	(model) => {
		const test = fixture(
			`table{width:auto;border-collapse:${model}}#first{width:25%}#first-content{width:40px;height:10px}#second-content{width:60px;height:10px}`,
			'<table id="table"><tr><td id="first"><div id="first-content"></div></td><td id="second"><div id="second-content"></div></td></tr></table>',
		);
		expect(test.rectangle("#table").width).toBe(160);
		expect(test.rectangle("#first").width).toBe(40);
		expect(test.rectangle("#second").width).toBe(120);
		expect(test.rectangle("#second-content")).toMatchObject({
			x: 40,
			width: 60,
		});
	},
);

it.each([
	{ model: "separate", sizing: "content-box", edges: 16 },
	{ model: "separate", sizing: "border-box", edges: 16 },
	{ model: "collapse", sizing: "content-box", edges: 12 },
	{ model: "collapse", sizing: "border-box", edges: 12 },
])(
	"uses resolved $model borders and padding for $sizing percentage requests",
	({ model, sizing, edges }) => {
		const test = fixture(
			`table{border-collapse:${model}}td{padding:4px;border:4px solid black}#first{width:50%;box-sizing:${sizing};background:red}`,
		);
		const table = test.box("#table");
		const first = test.box("#first");
		const second = test.rectangle("#second");
		const expected =
			table.contentWidth / 2 + (sizing === "content-box" ? edges : 0);
		expect(table.contentWidth).toBe(200);
		expect(first.borderLeft).toBe(model === "collapse" ? 2 : 4);
		expect(first.borderRight).toBe(model === "collapse" ? 2 : 4);
		expect(first.borderBoxWidth).toBe(expected);
		expect(first.contentWidth).toBe(expected - edges);
		expect(second.width).toBe(200 - expected);
		expect(second.left).toBe(test.rectangle("#first").right);
		const rectangle = test.rectangle("#first");
		expect(
			pixel(
				rasterizeDocument(test.tree),
				rectangle.left + 8,
				rectangle.top + 8,
			),
		).toEqual([255, 0, 0, 255]);
	},
);

it("excludes outer and intercell spacing from the definite percentage base", () => {
	const test = fixture(
		"table{width:230px;border-spacing:10px}#first{width:50%}",
	);
	expect(test.rectangle("#table")).toMatchObject({ width: 230, height: 40 });
	expect(test.rectangle("#first")).toMatchObject({ x: 10, y: 10, width: 100 });
	expect(test.rectangle("#second")).toMatchObject({
		x: 120,
		y: 10,
		width: 100,
	});
	expect(test.rectangle("#after").y).toBe(40);
	expect(documentHitTesting(test.tree).elementFromPoint(115, 15)).toBe(
		test.id("#row"),
	);
});

it("coordinates percentage colspans, rowspans and separated internal spacing", () => {
	const test = fixture(
		"table{width:240px;border-spacing:10px}#wide{width:60%;background:red}",
		'<table id="table"><tr><td id="wide" colspan="2" rowspan="2"></td><td id="upper"></td></tr><tr><td id="lower"></td></tr><tr><td id="first"></td><td id="second"></td><td id="third"></td></tr></table>',
	);
	expect(test.rectangle("#wide")).toMatchObject({
		x: 10,
		y: 10,
		width: 120,
		height: 50,
	});
	expect(test.rectangle("#first")).toMatchObject({ x: 10, y: 70, width: 55 });
	expect(test.rectangle("#second")).toMatchObject({ x: 75, y: 70, width: 55 });
	expect(test.rectangle("#third")).toMatchObject({ x: 140, y: 70, width: 90 });
	expect(test.rectangle("#lower")).toMatchObject({ x: 140, y: 40, width: 90 });
	expect(documentHitTesting(test.tree).elementFromPoint(70, 45)).toBe(
		test.id("#wide"),
	);
	expect(pixel(rasterizeDocument(test.tree), 70, 45)).toEqual([255, 0, 0, 255]);
});

it("takes the greatest request across unequal rows including header cells", () => {
	const test = fixture(
		"#first{width:25%}#strong{width:50%}#third{width:25%}",
		'<table id="table"><tr><th id="first"></th><th id="second"></th></tr><tr><td id="strong"></td></tr><tr><td id="third"></td><td id="last"></td></tr></table>',
	);
	for (const selector of ["#first", "#strong", "#third"])
		expect(test.rectangle(selector).width).toBe(100);
	expect(test.rectangle("#second")).toMatchObject({ x: 100, width: 100 });
	expect(test.rectangle("#last")).toMatchObject({ x: 100, y: 40, width: 100 });
	expect(test.rectangle("#table").width).toBe(200);
});

it.each([
	{ percentage: 0, firstWidth: 20, secondWidth: 180 },
	{ percentage: 150, firstWidth: 180, secondWidth: 20 },
])(
	"keeps intrinsic minima for $percentage percent without percentage-only overflow",
	({ percentage, firstWidth, secondWidth }) => {
		const test = fixture(
			`#first{width:${percentage}%}td>div{width:20px;height:10px}`,
			'<table id="table"><tr><td id="first"><div></div></td><td id="second"><div></div></td></tr></table>',
		);
		expect(test.rectangle("#first").width).toBe(firstWidth);
		expect(test.rectangle("#second").width).toBe(secondWidth);
		expect(test.rectangle("#table").width).toBe(200);
	},
);

it("reflows a nested percentage table against its assigned outer cell width", () => {
	const test = fixture(
		"#first{width:50%}#nested{width:auto;border-collapse:collapse}#inner{width:25%;background:red}#content{width:20px;height:10px}",
		'<table id="table"><tr><td id="first"><table id="nested"><tr><td id="inner"><div id="content"></div></td><td id="inner-auto"></td></tr></table></td><td id="second"></td></tr></table>',
	);
	expect(test.rectangle("#first").width).toBe(100);
	expect(test.rectangle("#second")).toMatchObject({ x: 100, width: 100 });
	expect(test.rectangle("#nested")).toMatchObject({ x: 0, width: 80 });
	expect(test.rectangle("#inner").width).toBe(20);
	expect(test.rectangle("#inner-auto")).toMatchObject({ x: 20, width: 60 });
	expect(documentHitTesting(test.tree).elementFromPoint(5, 15)).toBe(
		test.id("#inner"),
	);
	expect(pixel(rasterizeDocument(test.tree), 5, 15)).toEqual([255, 0, 0, 255]);
});

it("invalidates percentage geometry, raster and hit caches without mutating snapshots", () => {
	const test = fixture(
		"#first{width:25%;background:red}#second{background:blue}",
	);
	const geometry = documentGeometry(test.tree);
	const before = test.rectangle("#first");
	const oldLayout = layoutDocument(test.tree);
	const oldRaster = rasterizeDocument(test.tree);
	const oldPixels = oldRaster.image.pixels.slice();
	const hits = documentHitTesting(test.tree);
	expect(hits.elementFromPoint(75, 10)).toBe(test.id("#second"));
	const builds = {
		geometry: geometry.metrics().builds,
		hits: hits.metrics().builds,
	};
	test.tree.setAttribute(test.id("#first"), "style", "width:75%");
	expect(test.rectangle("#first").width).toBe(150);
	expect(test.rectangle("#second")).toMatchObject({ x: 150, width: 50 });
	expect(hits.elementFromPoint(75, 10)).toBe(test.id("#first"));
	expect(pixel(rasterizeDocument(test.tree), 75, 10)).toEqual([255, 0, 0, 255]);
	expect(pixel(oldRaster, 75, 10)).toEqual([0, 0, 255, 255]);
	expect(before.width).toBe(50);
	expect(
		oldLayout.boxes.find(
			(box) => box.ref === test.tree.reference(test.id("#first")),
		)?.borderBoxWidth,
	).toBe(50);
	expect(geometry.metrics().builds).toBeGreaterThan(builds.geometry);
	expect(hits.metrics().builds).toBeGreaterThan(builds.hits);
	expect(oldRaster.image.pixels).toEqual(oldPixels);
	test.tree.setAttribute(test.id("#first"), "style", "width:0%");
	expect(test.rectangle("#first").width).toBe(0);
	expect(test.rectangle("#second")).toMatchObject({ x: 0, width: 200 });
	expect(hits.elementFromPoint(75, 10)).toBe(test.id("#second"));
	expect(pixel(rasterizeDocument(test.tree), 75, 10)).toEqual([0, 0, 255, 255]);
});

it("completes a native percentage-cell link click using only mocked transport", async () => {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				const source = request.url.endsWith("/destination")
					? "<!doctype html><h1>Destination</h1>"
					: '<!doctype html><style>html,body{margin:0}table{width:200px;border-collapse:collapse}td{padding:0;height:40px;vertical-align:top}#first{width:25%}</style><table><tr><td id="first"></td><td id="second"><a id="target" href="/destination">Next</a></td></tr></table>';
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
	const first = page.queries.querySelector("#first");
	const second = page.queries.querySelector("#second");
	if (target === null || first === null || second === null)
		throw new Error("Missing percentage link fixture");
	expect(
		documentGeometry(page.document).getBoundingClientRect(first).width,
	).toBe(50);
	expect(
		documentGeometry(page.document).getBoundingClientRect(second),
	).toMatchObject({ x: 50, width: 150 });
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

it("retains the existing ignored cell max-width behavior with percentage widths", () => {
	const test = fixture("#first{width:50%;max-width:10%}");
	expect(documentStyles(test.tree).box(test.id("#first"))["max-width"]).toBe(
		"10%",
	);
	expect(test.rectangle("#first").width).toBe(100);
	expect(test.rectangle("#second").width).toBe(100);
});

it("keeps percentage padding, minimum widths, heights and mixed math unsupported", () => {
	for (const model of ["separate", "collapse"])
		for (const declaration of [
			"padding-left:10%",
			"padding-right:10%",
			"padding-top:10%",
			"padding-bottom:10%",
			"min-width:10%",
			"height:10%",
			"min-height:10%",
			"max-height:90%",
			"width:calc(50% + 10px)",
		]) {
			const test = fixture(
				`table{border-collapse:${model}}#first{width:50%;${declaration}}`,
			);
			expectUnsupported(
				() => layoutDocument(test.tree),
				`${model}: ${declaration}`,
			);
		}
});

it("keeps root, row and group percentage sizing guards independent of cell support", () => {
	for (const model of ["separate", "collapse"])
		for (const selector of ["#table", "#row", "#group"]) {
			const test = fixture(
				`table{border-collapse:${model}}#first{width:50%}${selector}{width:50%}`,
			);
			expectUnsupported(() => layoutDocument(test.tree));
		}
});

it("does not admit fixed layout or positioned table roles through percentage support", () => {
	for (const css of [
		"table{table-layout:fixed}",
		"#first{position:relative}",
	]) {
		const test = fixture(`#first{width:50%}${css}`);
		expectUnsupported(() => layoutDocument(test.tree));
	}
});

it("still rejects HTML table width attributes rather than treating them as CSS widths", () => {
	for (const width of ["200", "100%"])
		for (const model of ["separate", "collapse"]) {
			const test = fixture(
				`table{border-collapse:${model}}#first{width:50%}`,
				`<table id="table" width="${width}"><tr><td id="first"></td><td id="second"></td></tr></table>`,
			);
			expect(
				buildFormattingTree(test.tree).issues[
					"html-presentation-hint-not-supported"
				],
			).toBeGreaterThan(0);
			expectUnsupported(() => layoutDocument(test.tree));
		}
});
