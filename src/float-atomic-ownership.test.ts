import { afterEach, expect, it } from "vitest";
import { controlChecked } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import {
	type DocumentLayoutOptions,
	layoutDocument,
} from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const sessions: BrowserSession[] = [];
const pageUrl = "https://fixture.invalid/float-atomic-ownership";
const base =
	"html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:36px}#float{float:left;width:8px;height:24px;background:blue}.atom{display:inline-block;width:12px;background:red}";
const content =
	'<span id="float"></span><span id="atom" class="atom">AA</span>';

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const query of queries.splice(0)) query.close();
	for (const tree of documents.splice(0)) tree.close();
});

function markup(css = "", children = content) {
	return `<!doctype html><style>${base}${css}</style><main id="main">${children}</main>`;
}

function fixture(css = "", children = content) {
	const tree = parseHtmlDocument(markup(css, children), pageUrl);
	documents.push(tree);
	documentStyles(tree).setViewport(64, 48);
	const query = new DocumentQueries(tree);
	queries.push(query);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

function pixel(tree: DocumentTree, horizontal: number, vertical: number) {
	const image = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 64, height: 48 },
	}).image;
	const offset = (vertical * image.width + horizontal) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it("invalidates atomic geometry, raster and hit ownership when a float changes side", () => {
	const { tree, id, rect } = fixture();
	const hits = documentHitTesting(tree);
	const before = rect("#atom");
	expect(before).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
	expect(hits.elementFromPoint(9, 7)).toBe(id("#atom"));
	expect(pixel(tree, 9, 7)).toEqual([255, 0, 0, 255]);
	const builds = hits.metrics().builds;
	tree.setAttribute(id("#float"), "style", "float:right");
	expect(rect("#float")).toMatchObject({ x: 28, y: 0, width: 8, height: 24 });
	expect(rect("#atom")).toMatchObject({ x: 0, y: 0, width: 12, height: 8 });
	expect(hits.elementFromPoint(1, 7)).toBe(id("#atom"));
	expect(hits.elementFromPoint(29, 1)).toBe(id("#float"));
	expect(hits.metrics().builds).toBeGreaterThan(builds);
	expect(pixel(tree, 1, 7)).toEqual([255, 0, 0, 255]);
	expect(pixel(tree, 29, 1)).toEqual([0, 0, 255, 255]);
	expect(before).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
});

it("reflows atomic contents after text and width mutations without changing old layouts", () => {
	const { tree, id, rect } = fixture();
	const original = layoutDocument(tree);
	const originalBox = original.boxes.find(
		(box) => box.ref === tree.reference(id("#atom")),
	);
	expect(originalBox).toMatchObject({
		borderX: 8,
		borderY: 0,
		contentWidth: 12,
		contentHeight: 8,
	});
	tree.setTextContent(id("#atom"), "AA BB");
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 12, height: 16 });
	tree.setAttribute(id("#atom"), "style", "width:30px");
	expect(rect("#atom")).toMatchObject({ x: 0, y: 24, width: 30, height: 8 });
	expect(originalBox).toMatchObject({
		borderX: 8,
		borderY: 0,
		contentWidth: 12,
		contentHeight: 8,
	});
});

it("recomputes atomic placement after viewport narrowing and widening", () => {
	const { tree, rect } = fixture("main{width:auto}");
	const styles = documentStyles(tree);
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
	styles.setViewport(16, 48);
	expect(rect("#atom")).toMatchObject({ x: 0, y: 24, width: 12, height: 8 });
	styles.setViewport(64, 48);
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
});

it("invalidates an internal float without leaking its exclusions into a sibling atom", () => {
	const { tree, id, rect } = fixture(
		"main{width:64px}#atom{width:24px}#inner{float:left;width:8px;height:16px;background:blue}",
		'<span id="float"></span><span id="atom" class="atom"><span id="inner"></span>AA<br>BB</span><span id="sibling" class="atom">CC<br>DD</span>',
	);
	const original = rect("#inner");
	expect(original).toMatchObject({ x: 8, y: 0, width: 8, height: 16 });
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 24, height: 16 });
	expect(rect("#sibling")).toMatchObject({
		x: 32,
		y: 0,
		width: 12,
		height: 16,
	});
	const hits = documentHitTesting(tree);
	expect(hits.elementFromPoint(9, 1)).toBe(id("#inner"));
	tree.setAttribute(id("#inner"), "style", "float:right;height:24px");
	expect(rect("#inner")).toMatchObject({ x: 24, y: 0, width: 8, height: 24 });
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 24, height: 24 });
	expect(rect("#sibling")).toMatchObject({
		x: 32,
		y: 0,
		width: 12,
		height: 16,
	});
	expect(rect("#main").height).toBe(24);
	expect(pixel(tree, 25, 20)).toEqual([0, 0, 255, 255]);
	expect(hits.elementFromPoint(25, 20)).toBe(id("#inner"));
	expect(original).toMatchObject({ x: 8, y: 0, width: 8, height: 16 });
});

it("returns immutable layout, geometry and hit snapshots without mutating DOM evidence", () => {
	const { tree, id, rect } = fixture();
	const revision = tree.revision;
	const before = snapshotDocument(tree);
	const layout = layoutDocument(tree);
	const rectangle = rect("#atom");
	const hit = documentHitTesting(tree).targetFromPoint(9, 7);
	expect(hit).not.toBeNull();
	for (const value of [
		layout,
		layout.boxes,
		layout.contexts,
		layout.boxes[0],
		rectangle,
		hit,
	])
		expect(Object.isFrozen(value)).toBe(true);
	const painted = pixel(tree, 9, 7);
	expect(painted).toEqual([255, 0, 0, 255]);
	expect(tree.revision).toBe(revision);
	expect(snapshotDocument(tree)).toEqual(before);
	tree.setAttribute(id("#atom"), "style", "background:green;width:18px");
	expect(rect("#atom")).toMatchObject({ x: 8, width: 18 });
	expect(pixel(tree, 9, 7)).toEqual([0, 128, 0, 255]);
	expect(rectangle).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
	expect(hit).toMatchObject({ id: id("#atom") });
	expect(painted).toEqual([255, 0, 0, 255]);
});

it.each([
	["flex", "", '<div style="display:flex"><span>A</span></div>'],
	["grid", "", '<div style="display:grid"><span>A</span></div>'],
	["table", "", "<table><tr><td>A</td></tr></table>"],
	["inline flex", "#atom{display:inline-flex}", ""],
	["nonfloating clearance", "", '<div style="clear:both">A</div>'],
	["clipped overflow", "#atom{overflow:hidden}", ""],
	["unsupported property", "#atom{animation-name:spin}", ""],
])(
	"preserves the independent %s guard with atomic and float content present",
	(_name, css, extra) => {
		const { tree } = fixture(css, content + extra);
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		expect(() => layoutDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => rasterizeDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => documentHitTesting(tree).elementFromPoint(9, 7)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	},
);

it("preserves the existing absolute-positioned blockification path beside a float", () => {
	const { tree, id, rect } = fixture(
		"#atom{position:absolute;left:20px;top:16px;height:8px}",
	);
	expect(documentStyles(tree).get(id("#atom")).display).toBe("block");
	expect(rect("#atom")).toMatchObject({ x: 20, y: 16, width: 12, height: 8 });
	expect(rect("#float")).toMatchObject({ x: 0, y: 0, width: 8, height: 24 });
	expect(documentHitTesting(tree).elementFromPoint(21, 17)).toBe(id("#atom"));
	expect(pixel(tree, 21, 17)).toEqual([255, 0, 0, 255]);
});

it.each<{ name: string; options: DocumentLayoutOptions }>([
	{ name: "document work", options: { maxWork: 1 } },
	{ name: "text work", options: { text: { maxWork: 1 } } },
	{ name: "tokens", options: { text: { maxTokens: 1 } } },
	{ name: "combined lines", options: { text: { maxLines: 1 } } },
	{ name: "fragments", options: { text: { maxFragments: 1 } } },
	{
		name: "formatting boxes",
		options: { text: { formatting: { maxBoxes: 1 } } },
	},
])(
	"enforces shared $name bounds across atomic and float ownership",
	({ options }) => {
		const { tree, rect } = fixture(
			"",
			'<span id="float">AA</span><span id="atom" class="atom"><b>AA</b><br><b>BB</b></span>CC',
		);
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		expect(() => layoutDocument(tree, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
		expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 12, height: 16 });
	},
);

it("retains the recursive atomic nesting bound when floats activate coordination", () => {
	const nested = `${'<span class="atom">'.repeat(33)}AA${"</span>".repeat(33)}`;
	const { tree } = fixture("", `<span id="float"></span>${nested}`);
	const before = snapshotDocument(tree);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(snapshotDocument(tree)).toEqual(before);
});

it("retains finite layout length bounds for an atomic box beside a float", () => {
	const { tree } = fixture("#atom{width:16777217px}");
	const before = snapshotDocument(tree);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(snapshotDocument(tree)).toEqual(before);
});

it.each(["float-first", "atom-first"])(
	"does not reset recursive nesting across alternating %s owners",
	(order) => {
		const wrappers =
			order === "float-first"
				? '<div class="nested-float"><div class="atom">'
				: '<div class="atom"><div class="nested-float">';
		const children = `${wrappers.repeat(17)}AA${"</div></div>".repeat(17)}`;
		const { tree } = fixture(".nested-float{float:left;width:12px}", children);
		const revision = tree.revision;
		const before = snapshotDocument(tree);
		expect(() => layoutDocument(tree)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	},
);

it("clicks a native control inside an inline-block beside a float and closes its owners", async () => {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				if (request.url !== pageUrl)
					throw new Error(`Unexpected in-memory request: ${request.url}`);
				requests.push(request);
				return {
					url: request.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(
				markup(
					"#atom{width:16px}#target{width:12px;height:8px;margin:0;padding:0;border:0}",
					'<span id="float"></span><span id="atom" class="atom"><input id="target" type="checkbox"></span>',
				),
				response.url,
			),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, pageUrl);
	const page = session.page(tab.id);
	const tree = page.document;
	const styles = documentStyles(tree);
	styles.setViewport(64, 48);
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing checkbox");
	const hits = documentHitTesting(tree);
	const geometry = documentGeometry(tree);
	const rectangle = geometry.getBoundingClientRect(target);
	expect(rectangle).toMatchObject({ x: 8, width: 12, height: 8 });
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			events.push(type),
		);
	expect(controlChecked(tree, target)).toBe(false);
	await session.click(tab.id, tree.reference(target));
	expect(controlChecked(tree, target)).toBe(true);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(requests.map((request) => request.url)).toEqual([pageUrl]);
	expect(closed).toBe(false);
	session.close();
	expect(closed).toBe(true);
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(() => geometry.getBoundingClientRect(target)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => styles.metrics()).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => tree.get(target)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(Object.isFrozen(rectangle)).toBe(true);
	expect(rectangle).toMatchObject({ x: 8, width: 12, height: 8 });
	expect(requests).toHaveLength(1);
});
