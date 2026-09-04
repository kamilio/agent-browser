import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserInputEvent } from "./input-events.js";
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
				'<div id="editor" contenteditable><b id="child">Old</b><i>Keep</i></div>',
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/editable-keyboard"]);
	const page = session.page(session.tabs()[0].id);
	const editor = page.queries.querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	return {
		host,
		page,
		editor,
		selection: domRangeOwner(page.document).selection,
	};
}

it("executes fill/type/press through the actual native command path with injected transport", async () => {
	const { host, page, editor, selection } = await fixture();
	await host.execute(["fill", "#child", "Hello"]);
	await host.execute(["type", " 😀"]);
	expect(page.document.textContent(editor)).toBe("Hello 😀Keep");
	await host.execute(["press", "Shift+ArrowLeft"]);
	expect(selection.toString()).toBe("😀");
	await host.execute(["type", "X"]);
	expect(page.document.textContent(editor)).toBe("Hello XKeep");
	await host.execute(["press", "Backspace"]);
	expect(page.document.textContent(editor)).toBe("Hello Keep");
	const output = await host.execute(["press", "Home"]);
	expect(output.command).toBe("press");
	expect(selection.focusOffset).toBe(0);
});

it("honors beforeinput cancellation through the native command path", async () => {
	const { host, page, editor } = await fixture();
	await host.execute(["fill", "#editor", "safe"]);
	page.interactions.events.addEventListener(editor, "beforeinput", (event) =>
		event.preventDefault(),
	);
	const result = await host.execute(["type", "x"]);
	expect(result.data).toMatchObject({ canceled: true, characters: 1 });
	expect(page.document.textContent(editor)).toBe("safe");
});

it.each(["beforeinput", "input"])(
	"aborts command typing at %s without later characters",
	async (phase) => {
		const { host, page, editor } = await fixture();
		await host.execute(["fill", "#editor", ""]);
		const controller = new AbortController();
		const seen: unknown[] = [];
		page.interactions.events.addEventListener(
			editor,
			phase,
			(event) => {
				if (event instanceof BrowserInputEvent) seen.push(event.data);
				controller.abort();
			},
			{ once: true },
		);
		await expect(
			host.execute(["type", "ab"], { signal: controller.signal }),
		).rejects.toMatchObject({ code: "aborted" });
		expect(page.document.textContent(editor)).toBe(
			phase === "input" ? "a" : "",
		);
		expect(seen).toEqual(["a"]);
		expect(page.interactions.events.metrics().activeDispatches).toBe(0);
	},
);
