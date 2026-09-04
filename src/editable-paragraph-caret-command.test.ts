import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { rangeClientRects } from "./range-geometry.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
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
				`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{width:140px;color:red;white-space:pre-wrap}p{margin:0}${css}</style><div id="editor" contenteditable>${content}</div><div style="height:600px"></div>`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/paragraph-caret"]);
	const page = session.page(session.tabs()[0].id);
	const editor = page.queries.querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
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

function expectSourceCaret(
	test: Awaited<ReturnType<typeof fixture>>,
	source: number,
	offset: number,
) {
	const { page, owner } = test;
	const range = owner.selection.getRangeAt(0);
	const start = range.start;
	const end = range.end;
	expect(page.document.get(start.node).kind).toBe("element");
	expect(rangeClientRects(range)).toEqual([]);
	const rectangles = owner.withTemporaryRange(range, (temporary) => {
		temporary.update({ node: source, offset }, { node: source, offset });
		return rangeClientRects(temporary);
	});
	expect(rectangles).toHaveLength(1);
	const rect = rectangles[0];
	expect(rect).toMatchObject({ width: 0, height: 8 });
	const rendered = rasterizeDocument(page.document);
	expect(rendered.metrics).toMatchObject({
		caretStatus: "painted",
		paintedCarets: 1,
		paintedSelectionGlyphs: 0,
	});
	const scroll = documentScroll(page.document).get();
	const horizontal = Math.floor(rect.x + scroll.x - rendered.clip.x);
	const vertical = Math.ceil(rect.y + scroll.y - rendered.clip.y);
	const pixel = (vertical * rendered.image.width + horizontal) * 4;
	expect(Array.from(rendered.image.pixels.slice(pixel, pixel + 4))).toEqual([
		255, 0, 0, 255,
	]);
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(owner.selection.rangeCount).toBe(1);
	expect(range.start).toBe(start);
	expect(range.end).toBe(end);
	expect(rangeClientRects(range)).toEqual([]);
	return rendered;
}

it("keeps a visible paragraph-start caret after native split, cancellation and typing", async () => {
	const test = await fixture();
	const { host, page, editor, owner, html } = test;
	await host.execute(["fill", "#editor", "Hello"]);
	await host.execute(["press", "Control+A"]);
	await host.execute(["press", "ArrowLeft"]);
	await host.execute(["press", "Enter"]);
	expect(html()).toBe("<div></div><div>Hello</div>");
	const paragraph = page.document.get(editor).children[1];
	const source = page.document.get(paragraph).children[0];
	expect(owner.selection.focus).toEqual({ node: paragraph, offset: 0 });
	const before = expectSourceCaret(test, source, 0);
	page.interactions.events.addEventListener(
		editor,
		"beforeinput",
		(event) => event.preventDefault(),
		{ once: true },
	);
	const canceled = await host.execute(["press", "Enter"]);
	expect(canceled.data).toMatchObject({ keyboard: { canceled: true } });
	expect(html()).toBe("<div></div><div>Hello</div>");
	const after = expectSourceCaret(test, source, 0);
	expect(after.image.pixels).toEqual(before.image.pixels);
	await host.execute(["type", "!"]);
	expect(html()).toBe("<div></div><div>!Hello</div>");
	expect(rasterizeDocument(page.document).metrics.paintedCarets).toBe(1);
});

it.each([
	["p", "ArrowLeft"],
	["p", "ArrowRight"],
	["div", "ArrowLeft"],
	["div", "ArrowRight"],
])(
	"maps native select-all collapse through direct %s paragraphs with %s",
	async (tag, key) => {
		const test = await fixture(
			`<${tag}><b>Alpha</b></${tag}><${tag}><i>Beta</i></${tag}>`,
		);
		const { host, page, editor, owner } = test;
		page.interactions.focus.focus(page.document.reference(editor));
		await host.execute(["press", "Meta+A"]);
		expect(owner.selection.toString()).toBe("AlphaBeta");
		await host.execute(["press", key]);
		const end = key === "ArrowRight";
		expect(owner.selection.focus).toEqual({
			node: editor,
			offset: end ? 2 : 0,
		});
		const paragraph = page.document.get(editor).children[end ? 1 : 0];
		const inline = page.document.get(paragraph).children[0];
		const source = page.document.get(inline).children[0];
		expectSourceCaret(test, source, end ? 4 : 0);
	},
);

it("keeps repeated native start splits aligned without changing the surviving text", async () => {
	const test = await fixture();
	const { host, page, editor, owner, html } = test;
	await host.execute(["fill", "#editor", "Hello"]);
	await host.execute(["press", "Control+A"]);
	await host.execute(["press", "ArrowLeft"]);
	for (let iteration = 0; iteration < 3; iteration++) {
		await host.execute(["press", "Enter"]);
		const paragraph = page.document.get(editor).children.at(-1);
		if (paragraph === undefined) throw new Error("Missing paragraph");
		expect(owner.selection.focus).toEqual({ node: paragraph, offset: 0 });
		expectSourceCaret(test, page.document.get(paragraph).children[0], 0);
	}
	expect(html()).toBe("<div></div><div></div><div></div><div>Hello</div>");
});

it("does not invent empty paragraph caret geometry before native typing adds source text", async () => {
	const test = await fixture();
	const { host, page, html } = test;
	await host.execute(["fill", "#editor", "Hello"]);
	await host.execute(["press", "Enter"]);
	expect(html()).toBe("<div>Hello</div><div></div>");
	expect(rasterizeDocument(page.document).metrics).toMatchObject({
		caretStatus: "unsupported",
		paintedCarets: 0,
	});
	await host.execute(["type", "World"]);
	expect(html()).toBe("<div>Hello</div><div>World</div>");
	expect(rasterizeDocument(page.document).metrics.paintedCarets).toBe(1);
});

it("uses the same source edge after native split with paragraph boxes and root scrolling", async () => {
	const test = await fixture(
		"old",
		"#editor{margin-top:90px}#editor>div{margin:4px;padding:3px;border:1px solid blue}",
	);
	const { host, page, editor } = test;
	await host.execute(["fill", "#editor", "Hello"]);
	await host.execute(["press", "Control+A"]);
	await host.execute(["press", "ArrowLeft"]);
	await host.execute(["press", "Enter"]);
	documentScroll(page.document).to(0, 80);
	const paragraph = page.document.get(editor).children[1];
	expectSourceCaret(test, page.document.get(paragraph).children[0], 0);
});
