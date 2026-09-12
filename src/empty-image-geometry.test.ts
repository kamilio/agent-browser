import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(content: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}body{width:100px}</style>${content}`,
		"https://fixture.invalid/empty-image",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 60);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#photo");
	queries.close();
	if (id === null) throw new Error("Missing image fixture");
	return { tree, id };
}

it("retains a source-less image as a zero-size replaced box without pixels", () => {
	const page = fixture('<img id="photo">');
	const control = fixture(
		'<span id="photo" style="display:inline-block;width:0;height:0"></span>',
	);
	const before = snapshotDocument(page.tree);
	const formatting = buildFormattingTree(page.tree);
	expect(formatting.issues).toEqual({});
	expect(
		formatting.nodes.find((node) => node.ref === page.tree.reference(page.id)),
	).toMatchObject({
		kind: "replaced",
		intrinsic: { width: 0, height: 0 },
		intrinsicRatio: false,
	});
	expect(documentGeometry(page.tree).getBoundingClientRect(page.id)).toEqual(
		documentGeometry(control.tree).getBoundingClientRect(control.id),
	);
	expect(
		documentGeometry(page.tree).getBoundingClientRect(page.id),
	).toMatchObject({ width: 0, height: 0 });
	expect(rasterizeDocument(page.tree).image.pixels).toEqual(
		rasterizeDocument(control.tree).image.pixels,
	);
	expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(0);
	expect(documentImages(page.tree).get(page.id)).toMatchObject({
		state: "empty",
		complete: true,
		currentSrc: "",
		naturalWidth: 0,
		naturalHeight: 0,
	});
	expect(snapshotDocument(page.tree)).toEqual(before);
});

it("preserves authored dimensions, painted edges and hit identity without image data", () => {
	const style = "padding:2px;border:1px solid red;background:blue";
	const page = fixture(
		`<img id="photo" width="20" height="10" style="${style}">`,
	);
	const control = fixture(
		`<span id="photo" style="display:inline-block;width:20px;height:10px;${style}"></span>`,
	);
	const before = snapshotDocument(page.tree);
	expect(documentGeometry(page.tree).getBoundingClientRect(page.id)).toEqual(
		documentGeometry(control.tree).getBoundingClientRect(control.id),
	);
	expect(
		documentGeometry(page.tree).getBoundingClientRect(page.id),
	).toMatchObject({ width: 26, height: 16 });
	expect(documentGeometry(page.tree).getUsedStyle(page.id)).toMatchObject({
		width: 20,
		height: 10,
	});
	expect(rasterizeDocument(page.tree).image.pixels).toEqual(
		rasterizeDocument(control.tree).image.pixels,
	);
	expect(documentHitTesting(page.tree).elementFromPoint(4, 4)).toBe(page.id);
	expect(documentImages(page.tree).metrics().requests).toBe(0);
	expect(snapshotDocument(page.tree)).toEqual(before);
});

it("navigates a genuine native link beside a source-less image using only memory routes", async () => {
	const session = new BrowserSession({
		createTransport: () => ({
			request: async () => {
				throw new Error("Unexpected outbound transport");
			},
			metrics: () => ({
				requests: 0,
				active: 0,
				closed: false,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
			}),
			close: () => {},
		}),
		loadDocument: loadBrowserDocument,
	});
	try {
		session.routes.add("**/start", {
			body: '<!doctype html><a id="link" href="/next">Go</a><img id="photo">',
			contentType: "text/html",
		});
		session.routes.add("**/next", {
			body: "<!doctype html><h1>Destination</h1>",
			contentType: "text/html",
		});
		const tab = session.createTab().id;
		await session.navigate(tab, "https://fixture.invalid/start");
		const page = session.page(tab);
		const link = page.queries.querySelector("#link");
		if (link === null) throw new Error("Missing link fixture");
		const result = await session.click(tab, page.document.reference(link));
		expect(result.navigation).toBeDefined();
		expect(session.page(tab).document.url).toBe("https://fixture.invalid/next");
		expect(session.metrics().routes.fulfilled).toBe(2);
	} finally {
		session.close();
	}
});
