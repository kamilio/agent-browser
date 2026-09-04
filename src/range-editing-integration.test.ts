import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { rangeBoundingClientRect, rangeClientRects } from "./range-geometry.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

async function fixture(plaintext = false) {
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
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
				requests: 1,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			}),
			close() {},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(
				`<!doctype html><style>html,body{margin:0;padding:0}body{font-size:8px;line-height:10px}#editor{position:fixed;left:24px;top:30px;width:180px;height:100px;white-space:pre-wrap}#flow{height:600px}</style><div id="editor" contenteditable="${plaintext ? "plaintext-only" : "true"}">old</div><div id="flow">flow</div>`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/range-editing"]);
	const page = session.page(session.tabs()[0].id);
	documentStyles(page.document).setViewport(240, 180);
	const editor = page.queries.querySelector("#editor");
	const flow = page.queries.querySelector("#flow");
	if (editor === null || flow === null) throw new Error("Missing fixture");
	const owner = domRangeOwner(page.document);
	return { host, page, editor, flow, owner, selection: owner.selection };
}

it("maps terminal plaintext Enter and later typing through the shared live Range", async () => {
	const { host, page, editor, selection } = await fixture(true);
	await host.execute(["fill", "#editor", "Alpha"]);
	const range = selection.getRangeAt(0);
	const before = rangeBoundingClientRect(range);
	expect(rasterizeDocument(page.document).metrics.paintedCarets).toBe(1);
	await host.execute(["press", "Enter"]);
	expect(selection.getRangeAt(0)).toBe(range);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 24,
		y: before.y + 10,
		width: 0,
	});
	expect(rasterizeDocument(page.document).metrics).toMatchObject({
		paintedCarets: 0,
		caretStatus: "unsupported",
	});
	await host.execute(["type", "Beta"]);
	expect(rasterizeDocument(page.document).metrics.paintedCarets).toBe(1);
	expect(selection.getRangeAt(0)).toBe(range);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 48,
		y: before.y + 10,
		width: 0,
	});
	expect(before).toMatchObject({ x: 54, width: 0 });
	const text = page.document.get(editor).children[0];
	range.setStart(text, 0);
	range.setEnd(text, 10);
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 24, y: before.y, width: 30 },
		{ x: 24, y: before.y + 10, width: 24 },
	]);
});

it("keeps fixed editable geometry stable while flow geometry follows root scrolling", async () => {
	const { host, page, editor, flow, owner, selection } = await fixture(true);
	await host.execute(["fill", "#editor", "A\nB\n"]);
	const fixedRange = selection.getRangeAt(0);
	const flowRange = owner.createRange();
	flowRange.selectNodeContents(page.document.get(flow).children[0]);
	const fixedBefore = rangeBoundingClientRect(fixedRange);
	const flowBefore = rangeBoundingClientRect(flowRange);
	const crop = { element: page.document.reference(editor) };
	const beforeRaster = rasterizeDocument(page.document, crop);
	expect(beforeRaster.metrics).toMatchObject({
		paintedCarets: 0,
		caretStatus: "unsupported",
	});
	documentScroll(page.document).to(0, 80);
	expect(rasterizeDocument(page.document, crop).image.pixels).toEqual(
		beforeRaster.image.pixels,
	);
	expect(rangeBoundingClientRect(fixedRange)).toEqual(fixedBefore);
	expect(rangeBoundingClientRect(flowRange).y).toBe(flowBefore.y - 80);
	await host.execute(["type", "C"]);
	expect(documentScroll(page.document).get()).toEqual({ x: 0, y: 80 });
	expect(rangeBoundingClientRect(fixedRange)).toMatchObject({
		x: fixedBefore.x + 6,
		y: fixedBefore.y,
	});
	const afterRaster = rasterizeDocument(page.document, crop);
	expect(afterRaster.metrics.paintedCarets).toBe(1);
	documentScroll(page.document).to(0, 120);
	expect(rasterizeDocument(page.document, crop).image.pixels).toEqual(
		afterRaster.image.pixels,
	);
});

it("preserves Range identity and immutable geometry across rich paragraph split and merge", async () => {
	const { host, page, editor, selection } = await fixture();
	await host.execute(["fill", "#editor", "Left"]);
	const originalText = page.document.get(editor).children[0];
	const range = selection.getRangeAt(0);
	const original = rangeBoundingClientRect(range);
	expect(rasterizeDocument(page.document).metrics.paintedCarets).toBe(1);
	await host.execute(["press", "Enter"]);
	await host.execute(["type", "Right"]);
	const split = rangeBoundingClientRect(range);
	expect(split.y).toBe(original.y + 10);
	await host.execute(["press", "Home"]);
	await host.execute(["press", "Backspace"]);
	expect(selection.getRangeAt(0)).toBe(range);
	expect(selection.focusNode).toBe(originalText);
	expect(rangeBoundingClientRect(range)).toEqual(original);
	expect(rasterizeDocument(page.document).metrics.paintedCarets).toBe(1);
	await host.execute(["type", "!"]);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: original.x + 6,
		y: original.y,
	});
	expect(split.y).toBe(original.y + 10);
	expect(Object.isFrozen(original)).toBe(true);
});
