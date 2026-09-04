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

async function fixture() {
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
				'<div id="editor" contenteditable></div>',
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/merge"]);
	const page = session.page(session.tabs()[0].id);
	const editor = page.queries.querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	return {
		host,
		page,
		editor,
		selection: domRangeOwner(page.document).selection,
		html: () => serializeHtml(page.document, editor),
	};
}

it.each(["Backspace", "Delete"])(
	"splits, types, merges with %s and types at the join through native commands",
	async (key) => {
		const { host, page, editor, selection, html } = await fixture();
		await host.execute(["fill", "#editor", "left"]);
		await host.execute(["press", "Enter"]);
		await host.execute(["type", "right"]);
		if (key === "Backspace") await host.execute(["press", "Home"]);
		else {
			const left = page.document.get(editor).children[0];
			selection.collapse(left, page.document.get(left).children.length);
		}
		await host.execute(["press", key]);
		expect(html()).toBe("<div>leftright</div>");
		await host.execute(["type", "!"]);
		expect(html()).toBe("<div>left!right</div>");
	},
);

it("cancels a command-backed merge and then applies a later permitted merge", async () => {
	const { host, page, editor, html } = await fixture();
	await host.execute(["fill", "#editor", "left"]);
	await host.execute(["press", "Enter"]);
	page.interactions.events.addEventListener(
		editor,
		"beforeinput",
		(event) => event.preventDefault(),
		{ once: true },
	);
	const result = await host.execute(["press", "Backspace"]);
	expect(result.data).toMatchObject({ keyboard: { canceled: true } });
	expect(html()).toBe("<div>left</div><div></div>");
	await host.execute(["press", "Backspace"]);
	await host.execute(["type", "!"]);
	expect(html()).toBe("<div>left!</div>");
});

it.each(["beforeinput", "input"])(
	"aborts command-backed merging at %s",
	async (phase) => {
		const { host, page, editor, html } = await fixture();
		await host.execute(["fill", "#editor", "left"]);
		await host.execute(["press", "Enter"]);
		const controller = new AbortController();
		page.interactions.events.addEventListener(
			editor,
			phase,
			() => controller.abort(),
			{ once: true },
		);
		await expect(
			host.execute(["press", "Backspace"], { signal: controller.signal }),
		).rejects.toMatchObject({ code: "aborted" });
		expect(html()).toBe(
			phase === "input" ? "<div>left</div>" : "<div>left</div><div></div>",
		);
	},
);
