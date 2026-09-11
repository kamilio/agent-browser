import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const documents: ReturnType<typeof parseHtmlDocument>[] = [];
const sessions: BrowserSession[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	markup = '<table id="table"><tbody id="group"><tr id="row"><td id="first"></td><td id="second"></td></tr></tbody></table><div id="after"></div>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;font-size:10px;line-height:10px}table{width:100px;border-spacing:2px}td,th{padding:0}tr{height:20px}#after{height:5px}${css}</style>${markup}`,
		"https://fixture.invalid/table",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(160, 140);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing table fixture ${selector}`);
		return found;
	};
	const box = (selector: string) => {
		const found = layoutDocument(tree).boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing table box ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		box,
		rectangle: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

it("coordinates table, row, group and cell client rectangles with following flow", () => {
	const test = fixture();
	expect(test.rectangle("#table")).toMatchObject({
		x: 0,
		y: 0,
		width: 100,
		height: 24,
	});
	expect(test.rectangle("#first")).toMatchObject({
		x: 2,
		y: 2,
		width: 47,
		height: 20,
	});
	expect(test.rectangle("#second")).toMatchObject({
		x: 51,
		y: 2,
		width: 47,
		height: 20,
	});
	expect(test.rectangle("#row")).toMatchObject({
		x: 2,
		y: 2,
		width: 96,
		height: 20,
	});
	expect(test.rectangle("#group")).toMatchObject({
		x: 2,
		y: 2,
		width: 96,
		height: 20,
	});
	expect(test.rectangle("#after")).toMatchObject({ y: 24, height: 5 });
});

it("retains table ownership in spacing and cell ownership inside cells", () => {
	const test = fixture();
	expect(documentHitTesting(test.tree).elementFromPoint(1, 1)).toBe(
		test.id("#table"),
	);
	expect(documentHitTesting(test.tree).elementFromPoint(10, 10)).toBe(
		test.id("#first"),
	);
	expect(documentHitTesting(test.tree).elementFromPoint(70, 10)).toBe(
		test.id("#second"),
	);
});

it("paints row layers beneath a cell spanning into the following row", () => {
	const test = fixture(
		'<table id="table"><tbody><tr><td id="first" rowspan="2"></td><td></td></tr><tr id="last"><td></td></tr></tbody></table>',
		"#first{background:red}#last{background:blue}",
	);
	const first = test.rectangle("#first");
	expect(first).toMatchObject({ y: 2, height: 42 });
	const image = rasterizeDocument(test.tree).image;
	const offset = (30 * image.width + 10) * 4;
	expect([...image.pixels.slice(offset, offset + 4)]).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(test.tree).elementFromPoint(10, 30)).toBe(
		test.id("#first"),
	);
});

it("keeps zero row spans inside their group and honors column spans", () => {
	const test = fixture(
		'<table id="table"><tbody><tr><td id="first" rowspan="0"></td><td></td></tr><tr><td></td></tr></tbody><tbody><tr><td id="last" colspan="2"></td></tr></tbody></table>',
	);
	expect(test.rectangle("#first")).toMatchObject({ y: 2, height: 42 });
	expect(test.rectangle("#last")).toMatchObject({
		x: 2,
		y: 46,
		width: 96,
		height: 20,
	});
});

it.each(["top", "middle", "bottom"])(
	"shifts %s cell content without shifting its border",
	(alignment) => {
		const test = fixture(
			'<table id="table"><tr><td id="first"><span id="text">A</span></td></tr></table>',
			`tr{height:40px}td{padding:2px;vertical-align:${alignment}}`,
		);
		const cell = test.box("#first");
		const text = test.rectangle("#text");
		expect(cell).toMatchObject({ borderY: 2, borderBoxHeight: 40 });
		const offset = alignment === "top" ? 0 : alignment === "middle" ? 13 : 26;
		expect(text.y).toBeGreaterThanOrEqual(4 + offset);
		expect(text.bottom).toBeLessThanOrEqual(14 + offset);
	},
);

it("uses actual min-content cell widths instead of squashing wide content", () => {
	const test = fixture(
		'<table id="table"><tr><td id="first">Unbreakablelongword</td><td>B</td></tr></table>',
		"table{width:1px}td{width:1px}",
	);
	const measured = measureIntrinsicWidths(test.tree);
	const cell = measured.widths.find(
		(entry) => entry.ref === test.tree.reference(test.id("#first")),
	);
	expect(cell).toBeDefined();
	expect(test.rectangle("#first").width).toBeGreaterThanOrEqual(
		cell!.minContent,
	);
	expect(test.rectangle("#table").width).toBeGreaterThan(1);
});

it("reflows and hit-tests a table whose HTML table element is display:block", () => {
	const test = fixture(undefined, "table{display:block}td{padding:2px}");
	const formatting = buildFormattingTree(test.tree);
	expect(
		formatting.nodes.filter((node) => node.contentMode === "table"),
	).toHaveLength(1);
	expect(test.rectangle("#first").height).toBe(20);
	const rectangle = test.rectangle("#first");
	expect(
		documentHitTesting(test.tree).elementFromPoint(
			rectangle.x + 0.5,
			rectangle.y + 1,
		),
	).toBe(test.id("#first"));
});

it("reorders header and footer groups without changing their retained refs", () => {
	const test = fixture(
		'<table id="table"><tfoot id="footer"><tr><td>F</td></tr></tfoot><tbody id="body"><tr><td>B</td></tr></tbody><thead id="header"><tr><td>H</td></tr></thead></table>',
	);
	expect(test.rectangle("#header").y).toBe(2);
	expect(test.rectangle("#body").y).toBe(24);
	expect(test.rectangle("#footer").y).toBe(46);
});

it("invalidates geometry after a row-span mutation", () => {
	const test = fixture(
		'<table id="table"><tbody><tr><td id="first"></td><td></td></tr><tr><td></td></tr></tbody></table>',
	);
	expect(test.rectangle("#first").height).toBe(20);
	test.tree.setAttribute(test.id("#first"), "rowspan", "2");
	expect(test.rectangle("#first").height).toBe(42);
});

it("uses the same cell max-width and margin policy in intrinsic and final layout", () => {
	const test = fixture(
		'<table id="table"><tr><td id="first">A</td></tr></table>',
		"table{width:auto}td{width:100px;max-width:10px;margin:50px}",
	);
	expect(test.rectangle("#table").width).toBe(104);
	expect(test.rectangle("#first")).toMatchObject({ x: 2, width: 100 });
});

it("retains empty real row geometry and background across an explicit table width", () => {
	const test = fixture(
		'<table id="table"><tbody id="group"><tr id="row"></tr></tbody></table>',
		"tr{height:30px;background:red}",
	);
	expect(test.rectangle("#row")).toMatchObject({
		x: 0,
		y: 2,
		width: 100,
		height: 30,
	});
	expect(test.rectangle("#group")).toMatchObject({
		x: 0,
		y: 2,
		width: 100,
		height: 30,
	});
	const image = rasterizeDocument(test.tree).image;
	const offset = (10 * image.width + 50) * 4;
	expect([...image.pixels.slice(offset, offset + 4)]).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(test.tree).elementFromPoint(50, 10)).toBe(
		test.id("#row"),
	);
});

it("completes a real native table-cell anchor click through pointer events", async () => {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				const markup = request.url.endsWith("/destination")
					? "<!doctype html><h1>Destination</h1>"
					: '<!doctype html><style>html,body{margin:0}table{width:200px}td{height:40px;vertical-align:top}</style><table><tbody><tr><td>First</td><td><a id="target" href="/destination">Next</a></td></tr></tbody></table>';
				return {
					url: request.url,
					status: 200,
					headers: { "content-type": ["text/html; charset=utf-8"] },
					body: new TextEncoder().encode(markup),
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
	expect(target).not.toBeNull();
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target!, type, () =>
			events.push(type),
		);
	await session.click(tab.id, page.document.reference(target!));
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(requests.map((request) => request.url)).toEqual([
		"https://fixture.invalid/start",
		"https://fixture.invalid/destination",
	]);
	expect(session.page(tab.id).queries.querySelector("h1")).not.toBeNull();
	session.close();
	expect(session.metrics()).toMatchObject({
		closed: true,
		tabs: 0,
		pendingLoads: 0,
		cleanupErrors: 0,
	});
});
