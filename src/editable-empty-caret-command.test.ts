import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { rangeClientRects } from "./range-geometry.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const host of hosts.splice(0)) host.close();
});

async function fixture(content = "old", css = "") {
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
				`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{width:140px;min-height:20px;color:red;white-space:pre-wrap}p{margin:0}${css}</style><div id="editor" contenteditable>${content}</div><div style="height:600px"></div>`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/empty-caret"]);
	const page = session.page(session.tabs()[0].id);
	const editor = page.queries.querySelector("#editor");
	if (editor === null) throw Error("Missing editor");
	documentStyles(page.document).setViewport(180, 100);
	const owner = domRangeOwner(page.document);
	return {
		host,
		page,
		editor,
		owner,
		html: () => serializeHtml(page.document, editor),
	};
}

function emptyCaret(test: Awaited<ReturnType<typeof fixture>>) {
	const { page, owner, html } = test;
	const range = owner.selection.getRangeAt(0);
	const point = range.start;
	const revision = page.document.revision;
	const markup = html();
	const layout = layoutDocument(page.document);
	expect(range.collapsed).toBe(true);
	expect(rangeClientRects(range)).toEqual([]);
	const result = rasterizeDocument(page.document);
	expect.soft(result.metrics).toMatchObject({
		caretStatus: "painted",
		paintedCarets: 1,
		paintedSelectionGlyphs: 0,
	});
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(owner.selection.rangeCount).toBe(1);
	expect(range.start).toBe(point);
	expect(range.end).toEqual(point);
	expect(rangeClientRects(range)).toEqual([]);
	expect(page.document.revision).toBe(revision);
	expect(html()).toBe(markup);
	expect(layoutDocument(page.document)).toEqual(layout);
	return result;
}

it("paints the empty host after native fill and returns to a source caret on typing", async () => {
	const test = await fixture();
	const { host, page, editor, owner, html } = test;
	await host.execute(["fill", "#editor", ""]);
	expect(html()).toBe("");
	expect(page.document.get(editor).children).toHaveLength(0);
	const range = owner.selection.getRangeAt(0);
	expect(range.start).toEqual({ node: editor, offset: 0 });
	const result = emptyCaret(test);
	expect(result.metrics.paintedGlyphs).toBe(0);
	expect
		.soft(
			result.image.pixels.some(
				(value, offset) => offset % 4 === 1 && value === 0,
			),
		)
		.toBe(true);
	await host.execute(["type", "Q"]);
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(html()).toBe("Q");
	expect(page.document.get(range.start.node).kind).toBe("text");
	expect(rasterizeDocument(page.document).metrics).toMatchObject({
		caretStatus: "painted",
		paintedCarets: 1,
		paintedGlyphs: 1,
	});
});

it.each(["Control+A", "Meta+A"])(
	"keeps a visible empty host after native %s deletion",
	async (key) => {
		const test = await fixture();
		const { host, editor, owner, html } = test;
		await host.execute(["fill", "#editor", "Alpha"]);
		await host.execute(["press", key]);
		const range = owner.selection.getRangeAt(0);
		expect(owner.selection.toString()).toBe("Alpha");
		await host.execute(["press", "Backspace"]);
		expect(html()).toBe("");
		expect(owner.selection.getRangeAt(0)).toBe(range);
		expect(range.start).toEqual({ node: editor, offset: 0 });
		emptyCaret(test);
	},
);

it("keeps empty Range, DOM and pixels when native beforeinput cancels typing and Enter", async () => {
	const test = await fixture();
	const { host, page, editor, owner, html } = test;
	await host.execute(["fill", "#editor", ""]);
	const range = owner.selection.getRangeAt(0);
	const point = range.start;
	const before = emptyCaret(test);
	for (const command of [
		["type", "Q"],
		["press", "Enter"],
	]) {
		page.interactions.events.addEventListener(
			editor,
			"beforeinput",
			(event) => event.preventDefault(),
			{ once: true },
		);
		const canceled = await host.execute(command);
		expect(canceled.data).toMatchObject(
			command[0] === "type"
				? { canceled: true }
				: { keyboard: { canceled: true } },
		);
		expect(owner.selection.getRangeAt(0)).toBe(range);
		expect(range.start).toEqual(point);
		expect(html()).toBe("");
		expect(emptyCaret(test).image.pixels).toEqual(before.image.pixels);
	}
});

it("paints Enter's empty direct paragraph then preserves typing and Backspace merge semantics", async () => {
	const test = await fixture();
	const { host, page, editor, owner, html } = test;
	await host.execute(["fill", "#editor", "Left"]);
	const range = owner.selection.getRangeAt(0);
	await host.execute(["press", "Enter"]);
	expect(html()).toBe("<div>Left</div><div></div>");
	const paragraph = page.document.get(editor).children[1];
	expect(range.start).toEqual({ node: paragraph, offset: 0 });
	emptyCaret(test);
	await host.execute(["type", "Right"]);
	expect(html()).toBe("<div>Left</div><div>Right</div>");
	expect(rasterizeDocument(page.document).metrics.paintedCarets).toBe(1);
	await host.execute(["press", "Home"]);
	await host.execute(["press", "Backspace"]);
	expect(html()).toBe("<div>LeftRight</div>");
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(range.start.offset).toBe(4);
	expect(rasterizeDocument(page.document).metrics.paintedCarets).toBe(1);
});

it.each(["p", "div"])(
	"collapses native select-all at both outer empty %s edges",
	async (tag) => {
		const test = await fixture(
			`<${tag}></${tag}><${tag}>Middle</${tag}><${tag}></${tag}>`,
		);
		const { host, page, editor, owner } = test;
		page.interactions.focus.focus(page.document.reference(editor));
		for (const key of ["ArrowLeft", "ArrowRight"]) {
			await host.execute(["press", "Control+A"]);
			await host.execute(["press", key]);
			expect(owner.selection.getRangeAt(0).start).toEqual({
				node: editor,
				offset: key === "ArrowLeft" ? 0 : 3,
			});
			emptyCaret(test);
		}
	},
);

it("keeps an empty fixed host visible and unchanged after root scrolling", async () => {
	const test = await fixture(
		"old",
		"#editor{position:fixed;left:20px;top:30px;background:white;padding:4px;border:1px solid blue}",
	);
	const { host, page, editor, owner } = test;
	await host.execute(["fill", "#editor", ""]);
	const range = owner.selection.getRangeAt(0);
	emptyCaret(test);
	const crop = { element: page.document.reference(editor) };
	const before = rasterizeDocument(page.document, crop);
	documentScroll(page.document).to(0, 80);
	expect
		.soft(rasterizeDocument(page.document, crop).metrics.paintedCarets)
		.toBe(1);
	expect(rasterizeDocument(page.document, crop).image.pixels).toEqual(
		before.image.pixels,
	);
	expect(owner.selection.getRangeAt(0)).toBe(range);
	await host.execute(["type", "Q"]);
	expect(documentScroll(page.document).get()).toEqual({ x: 0, y: 80 });
	expect(rasterizeDocument(page.document, crop).metrics.paintedCarets).toBe(1);
});

it.each(["#editor", "#paragraph"])(
	"allows an empty text node only when it is the sole child of %s",
	async (selector) => {
		const test = await fixture(
			selector === "#editor" ? "" : '<p id="paragraph"></p>',
		);
		const { host, page, editor, owner } = test;
		const container =
			selector === "#editor" ? editor : page.queries.querySelector(selector);
		if (container === null) throw Error("Missing paragraph");
		const text = page.document.createText("");
		page.document.append(container, text);
		page.interactions.focus.focus(page.document.reference(editor));
		owner.selection.collapse(text, 0);
		const range = owner.selection.getRangeAt(0);
		emptyCaret(test);
		expect(page.document.get(container).children).toEqual([text]);
		await host.execute(["type", "Q"]);
		expect(owner.selection.getRangeAt(0)).toBe(range);
		expect(page.document.get(container).children).toEqual([text]);
		expect(page.document.get(text).data).toBe("Q");
		expect(rasterizeDocument(page.document).metrics.paintedCarets).toBe(1);
	},
);

it.each(["<br>", "<!--empty-->", "<span></span>"])(
	"does not turn native collapse at %s into a guessed empty caret",
	async (content) => {
		const test = await fixture(content);
		const { host, page, editor, owner } = test;
		page.interactions.focus.focus(page.document.reference(editor));
		await host.execute(["press", "Control+A"]);
		await host.execute(["press", "ArrowLeft"]);
		expect(owner.selection.getRangeAt(0).start).toEqual({
			node: editor,
			offset: 0,
		});
		expect(rasterizeDocument(page.document).metrics).toMatchObject({
			caretStatus: "unsupported",
			paintedCarets: 0,
		});
	},
);

it("does not create a caret for an empty text node alongside another child", async () => {
	const { page, editor, owner } = await fixture("<span></span>");
	const text = page.document.createText("");
	page.document.append(editor, text);
	page.interactions.focus.focus(page.document.reference(editor));
	owner.selection.collapse(text, 0);
	expect(rasterizeDocument(page.document).metrics).toMatchObject({
		caretStatus: "unsupported",
		paintedCarets: 0,
	});
});

it("retains native empty host ownership across repeated prepared repaints without persistent Ranges", async () => {
	const test = await fixture();
	const { host, page, owner } = test;
	await host.execute(["fill", "#editor", ""]);
	const range = owner.selection.getRangeAt(0);
	const point = range.start;
	const held: unknown[] = [];
	const createRange = owner.createRange.bind(owner);
	vi.spyOn(owner, "createRange").mockImplementation(() => {
		const temporary = createRange();
		held.push(temporary);
		return temporary;
	});
	const prepared = prepareDocumentRaster(page.document);
	for (let iteration = 0; iteration < 4100; iteration++) {
		const result = prepared.rasterize({
			clip: { x: 0, y: 0, width: 12, height: 12 },
		});
		expect(result.metrics.caretStatus).not.toBe("limited");
	}
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(range.start).toBe(point);
	expect(() => owner.createRange()).not.toThrow();
	expect.soft(prepared.rasterize().metrics.paintedCarets).toBe(1);
});
