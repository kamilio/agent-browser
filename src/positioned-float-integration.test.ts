import { afterEach, expect, it } from "vitest";
import { controlChecked } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { documentElementScroll } from "./element-scroll.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const sessions: BrowserSession[] = [];
const documents: DocumentTree[] = [];
const baseCss = "html,body{margin:0;padding:0;font-size:8px;line-height:8px}";

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string, css: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${baseCss}${css}</style>${markup}`,
		"https://fixture.invalid/positioned-float",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(96, 64);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

it.each(["absolute", "fixed"])(
	"preserves %s geometry, paint and hit ownership despite authored float",
	(position) => {
		const test = fixture(
			"<main><span id=target></span><div id=after></div></main>",
			`main{position:relative;width:80px;height:48px}#target{position:${position};left:12px;top:8px;width:24px;height:16px;background:red}#after{width:8px;height:8px;background:blue}`,
		);
		const before = test.rect("#target");
		expect(before).toMatchObject({ x: 12, y: 8, width: 24, height: 16 });
		const following = test.rect("#after");
		const pixels = rasterizeDocument(test.tree).image.pixels;
		for (const side of ["left", "right", "inline-start", "inline-end"]) {
			test.tree.setAttribute(test.id("#target"), "style", `float:${side}`);
			expect(test.styles.flow(test.id("#target")).float).toBe("none");
			expect(test.rect("#target")).toEqual(before);
			expect(test.rect("#after")).toEqual(following);
			expect(rasterizeDocument(test.tree).image.pixels).toEqual(pixels);
			expect(documentHitTesting(test.tree).elementFromPoint(20, 12)).toBe(
				test.id("#target"),
			);
			expect(
				buildFormattingTree(test.tree).issues["float-layout-not-supported"],
			).toBeUndefined();
		}
	},
);

it("keeps fixed float-free geometry attached to the viewport while scrolling", () => {
	const test = fixture(
		"<div id=target></div><div id=long></div>",
		"#target{position:fixed;float:right;right:8px;top:4px;width:16px;height:8px;background:red}#long{height:200px}",
	);
	const before = test.rect("#target");
	expect(before).toMatchObject({ x: 72, y: 4, width: 16, height: 8 });
	documentScroll(test.tree).to(0, 64);
	expect(test.rect("#target")).toEqual(before);
	expect(documentHitTesting(test.tree).elementFromPoint(76, 6)).toBe(
		test.id("#target"),
	);
});

it("retains a positioned descendant's actual containing block and stacking", () => {
	const test = fixture(
		"<main><div id=target><div id=inner></div></div><div id=front></div></main>",
		"main{position:relative;left:8px;top:8px;width:64px;height:40px}#target{position:absolute;float:left;left:4px;top:4px;width:24px;height:24px;z-index:1;background:red}#inner{position:absolute;float:right;left:4px;top:4px;width:8px;height:8px;background:blue}#front{position:absolute;left:8px;top:8px;width:8px;height:8px;z-index:2;background:green}",
	);
	expect(test.rect("#target")).toMatchObject({ x: 12, y: 12 });
	expect(test.rect("#inner")).toMatchObject({ x: 16, y: 16 });
	expect(documentHitTesting(test.tree).elementFromPoint(18, 18)).toBe(
		test.id("#front"),
	);
	const image = rasterizeDocument(test.tree).image;
	const offset = (18 * image.width + 18) * 4;
	expect([...image.pixels.slice(offset, offset + 4)]).toEqual([0, 128, 0, 255]);
});

it.each(["static", "relative"])(
	"switches to real float geometry when position becomes %s",
	(position) => {
		const test = fixture(
			"<div id=target></div>",
			"#target{position:absolute;float:right;width:24px;height:16px}",
		);
		expect(() => layoutDocument(test.tree)).not.toThrow();
		test.tree.setAttribute(test.id("#target"), "style", `position:${position}`);
		expect(test.styles.flow(test.id("#target")).float).toBe("right");
		expect(
			buildFormattingTree(test.tree).issues["float-layout-not-supported"],
		).toBe(1);
		expect(test.rect("#target")).toMatchObject({
			x: 72,
			y: 0,
			width: 24,
			height: 16,
		});
	},
);

it("positions an absolute sibling without hiding an independent real float", () => {
	const test = fixture(
		"<div id=target></div><div id=other></div>",
		"#target{position:absolute;float:right;width:24px;height:16px}#other{float:left;width:8px;height:8px}",
	);
	expect(test.styles.flow(test.id("#target")).float).toBe("none");
	expect(
		buildFormattingTree(test.tree).issues["float-layout-not-supported"],
	).toBe(1);
	expect(test.rect("#target")).toMatchObject({
		x: 0,
		y: 0,
		width: 24,
		height: 16,
	});
	expect(test.rect("#other")).toMatchObject({
		x: 0,
		y: 0,
		width: 8,
		height: 8,
	});
});

it("scrolls an absolute box without activating its authored float", () => {
	const test = fixture(
		"<div id=target><div id=child></div></div>",
		"#target{position:absolute;left:0;top:0;float:right;overflow:auto;width:24px;height:16px}#child{width:48px;height:40px}",
	);
	const issues = buildFormattingTree(test.tree).issues;
	expect(issues["float-layout-not-supported"]).toBeUndefined();
	expect(issues["overflow-layout-not-supported"]).toBeUndefined();
	const before = test.rect("#target");
	expect(before).toMatchObject({ x: 0, y: 0, width: 24, height: 16 });
	const scroll = documentElementScroll(test.tree);
	expect(scroll.bounds(test.id("#target"))).toEqual({ x: 24, y: 24 });
	expect(scroll.to(test.id("#target"), 8, 10)).toBe(true);
	expect(scroll.get(test.id("#target"))).toMatchObject({
		scrollLeft: 8,
		scrollTop: 10,
	});
	expect(test.rect("#target")).toEqual(before);
	expect(test.rect("#child")).toMatchObject({
		x: -8,
		y: -10,
		width: 48,
		height: 40,
	});
});

it("does not invent clearance for a following block from a positioned box", () => {
	const test = fixture(
		"<div id=target></div><div id=after></div>",
		"#target{position:absolute;float:left;width:24px;height:40px}#after{clear:both;width:8px;height:8px}",
	);
	expect(test.rect("#after")).toMatchObject({
		x: 0,
		y: 0,
		width: 8,
		height: 8,
	});
	expect(
		buildFormattingTree(test.tree).issues["clear-layout-not-supported"],
	).toBeUndefined();
});

it("baseline: positioned float permits native checkbox activation", async () => {
	const url = "https://fixture.invalid/positioned-float-click";
	const body = new TextEncoder().encode(
		`<!doctype html><style>${baseCss}#target{position:absolute;float:right;left:12px;top:8px}</style><input id=target type=checkbox>`,
	);
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				if (request.url !== url)
					throw new Error("Unexpected in-memory request");
				return {
					url,
					status: 200,
					headers: { "content-type": ["text/html"] },
					body,
					redirects: [],
					encodedBytes: body.byteLength,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: body.byteLength,
				decodedBytes: body.byteLength,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, url);
	const page = session.page(tab.id);
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing checkbox");
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			events.push(type),
		);
	expect(controlChecked(page.document, target)).toBe(false);
	await session.click(tab.id, page.document.reference(target));
	expect(controlChecked(page.document, target)).toBe(true);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(page.styles.flow(target).float).toBe("none");
	expect(page.styles.flow(target).position).toBe("absolute");
	expect(page.styles.metrics().applicableIssues).toEqual({});
	expect(requests.map((request) => request.url)).toEqual([url]);
});
