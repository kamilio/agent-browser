import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { BrowserSession } from "./session.js";

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
				`<div id="editor" contenteditable="${plaintext ? "plaintext-only" : "true"}">old</div>`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/editable-paragraph"]);
	const page = session.page(session.tabs()[0].id);
	const editor = page.queries.querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	return {
		host,
		page,
		editor,
		html: () => serializeHtml(page.document, editor),
	};
}

it("runs fill, paragraph insertion, typing and line insertion through native commands", async () => {
	const { host, page, html } = await fixture();
	await host.execute(["fill", "#editor", "hello"]);
	await host.execute(["press", "Enter"]);
	await host.execute(["type", "world"]);
	await host.execute(["press", "Shift+Enter"]);
	await host.execute(["type", "!"]);
	expect(html()).toBe("<div>hello</div><div>world<br>!</div>");
	expect(domRangeOwner(page.document).selection.focusOffset).toBe(1);
});

it("inserts plaintext LF for Enter and Shift+Enter through native commands", async () => {
	const { host, html } = await fixture(true);
	await host.execute(["fill", "#editor", "first"]);
	await host.execute(["press", "Enter"]);
	await host.execute(["type", "second"]);
	await host.execute(["press", "Shift+Enter"]);
	await host.execute(["type", "third"]);
	expect(html()).toBe("first\nsecond\nthird");
});

it("preserves a canceled paragraph selection through native commands", async () => {
	const { host, page, editor, html } = await fixture();
	await host.execute(["fill", "#editor", "abcd"]);
	await host.execute(["press", "Shift+ArrowLeft"]);
	page.interactions.events.addEventListener(
		editor,
		"beforeinput",
		(event) => event.preventDefault(),
		{ once: true },
	);
	const result = await host.execute(["press", "Enter"]);
	expect(result.data).toMatchObject({ keyboard: { canceled: true } });
	expect(html()).toBe("abcd");
	expect(domRangeOwner(page.document).selection.toString()).toBe("d");
	await host.execute(["type", "!"]);
	expect(html()).toBe("abc!");
});
