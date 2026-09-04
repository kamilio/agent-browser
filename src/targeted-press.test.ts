import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { controlValue } from "./controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});
async function fixture() {
	const requests: string[] = [];
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
				requests.push(input.url);
				return {
					url: input.url,
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
				closed: false,
			}),
			close() {},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(
				'<form action="/send"><input id="field" name="value"><input id="other"><input id="readonly" value="abcd" readonly><input id="disabled" disabled><input id="hidden" hidden><select id="pick" name="choice"><option>a</option><option>b</option></select><button id="send">Send</button></form><div id="custom" tabindex="0">Custom</div>',
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	cleanup.push(() => host.close());
	await host.execute(["open", "https://fixture.invalid/"]);
	const tab = session.tabs()[0].id;
	const page = session.page(tab);
	const id = (selector: string) =>
		new DocumentQueries(page.document).querySelector(selector) as number;
	return { host, session, tab, page, id, requests };
}

it("focuses a unique selector before key dispatch without generating a click", async () => {
	const { host, page, id } = await fixture();
	const trace: string[] = [];
	for (const type of [
		"focus",
		"focusin",
		"keydown",
		"keypress",
		"input",
		"keyup",
		"click",
	])
		page.interactions.events.addEventListener(id("#field"), type, () =>
			trace.push(type),
		);
	await host.execute(["press", "x", "--target", "#field"]);
	expect(controlValue(page.document, id("#field"))).toBe("x");
	expect(trace).toEqual([
		"focus",
		"focusin",
		"keydown",
		"keypress",
		"input",
		"keyup",
	]);
});

it("accepts stable references and leaves untargeted press on existing focus", async () => {
	const { host, page, id } = await fixture();
	await host.execute([
		"press",
		"a",
		"--target",
		page.document.reference(id("#field")),
	]);
	await host.execute(["press", "b"]);
	expect(controlValue(page.document, id("#field"))).toBe("ab");
});

it("navigates selects and submits native form values through the same command", async () => {
	const { host, requests } = await fixture();
	await host.execute(["press", "ArrowDown", "--target", "#pick"]);
	await host.execute(["press", "Enter", "--target", "#send"]);
	expect(new URL(requests[1]).searchParams.get("choice")).toBe("b");
});

it("readonly controls permit targeted selection but not text edits", async () => {
	const { host, page, id } = await fixture();
	const result = await host.execute([
		"press",
		"Control+A",
		"--target",
		"#readonly",
	]);
	expect(result.data).toMatchObject({
		keyboard: { selection: { start: 0, end: 4 } },
	});
	await expect(
		host.execute(["press", "x", "--target", "#readonly"]),
	).rejects.toThrow();
	expect(controlValue(page.document, id("#readonly"))).toBe("abcd");
});

it.each(["#disabled", "#hidden", "#absent", "input"])(
	"rejects ineligible or nonunique target %s",
	async (target) => {
		const { host, page } = await fixture();
		await expect(
			host.execute(["press", "x", "--target", target]),
		).rejects.toThrow();
		expect(page.interactions.focus.active()).toBe(null);
	},
);

it("validates the key before moving focus", async () => {
	const { host, page } = await fixture();
	await expect(
		host.execute(["press", "NotAKey", "--target", "#field"]),
	).rejects.toThrow();
	expect(page.interactions.focus.active()).toBe(null);
});

it.each(["redirect", "disable", "remove"])(
	"does not type into another target after focus %s",
	async (mode) => {
		const { host, page, id } = await fixture();
		const field = id("#field");
		page.interactions.events.addEventListener(field, "focus", () => {
			if (mode === "redirect")
				page.interactions.focus.focus(page.document.reference(id("#other")));
			else if (mode === "disable")
				page.document.setAttribute(field, "disabled", "");
			else page.document.remove(field);
		});
		await expect(
			host.execute(["press", "x", "--target", "#field"]),
		).rejects.toThrow("lost focus");
		expect(controlValue(page.document, field)).toBe("");
		expect(controlValue(page.document, id("#other"))).toBe("");
	},
);

it("abort during focus prevents key dispatch", async () => {
	const { host, page, id } = await fixture();
	const controller = new AbortController();
	page.interactions.events.addEventListener(id("#field"), "focus", () =>
		controller.abort(),
	);
	await expect(
		host.execute(["press", "x", "--target", "#field"], {
			signal: controller.signal,
		}),
	).rejects.toThrow();
	expect(controlValue(page.document, id("#field"))).toBe("");
});

it("rejects stale references after navigation", async () => {
	const { host, page, id } = await fixture();
	const target = page.document.reference(id("#field"));
	await host.execute(["goto", "https://fixture.invalid/new"]);
	await expect(
		host.execute(["press", "x", "--target", target]),
	).rejects.toThrow();
});

it("navigation begun during focus aborts key dispatch into the old document", async () => {
	const { host, session, tab, page, id } = await fixture();
	let navigating: Promise<unknown> | undefined;
	let keydowns = 0;
	page.interactions.events.addEventListener(id("#field"), "focus", () => {
		navigating = session.navigate(tab, "https://fixture.invalid/new");
	});
	page.interactions.events.addEventListener(
		id("#field"),
		"keydown",
		() => keydowns++,
	);
	await expect(
		host.execute(["press", "x", "--target", "#field"]),
	).rejects.toThrow();
	await navigating;
	expect(keydowns).toBe(0);
});

it("focusable custom nodes receive canceled key events", async () => {
	const { host, page, id } = await fixture();
	page.interactions.events.addEventListener(id("#custom"), "keydown", (event) =>
		event.preventDefault(),
	);
	const result = await host.execute(["press", "x", "--target", "#custom"]);
	expect(result.data).toMatchObject({ keyboard: { canceled: true } });
});

it("does not refocus an already focused target or reset its caret", async () => {
	const { host, page, id } = await fixture();
	let focuses = 0;
	page.interactions.events.addEventListener(
		id("#field"),
		"focus",
		() => focuses++,
	);
	await host.execute(["press", "a", "--target", "#field"]);
	await host.execute(["press", "b", "--target", "#field"]);
	await host.execute(["press", "ArrowLeft", "--target", "#field"]);
	await host.execute(["press", "c", "--target", "#field"]);
	expect(focuses).toBe(1);
	expect(controlValue(page.document, id("#field"))).toBe("acb");
});

it.each(["keydown", "keyup"])(
	"%s does not accept targeted retargeting",
	async (command) => {
		const { host } = await fixture();
		await expect(
			host.execute([command, "x", "--target", "#field"]),
		).rejects.toThrow();
	},
);

it("session API accepts a reference but rejects nonstring targets", async () => {
	const { session, tab, page, id } = await fixture();
	await session.press(tab, "a", {
		target: page.document.reference(id("#field")),
	});
	expect(controlValue(page.document, id("#field"))).toBe("a");
	await expect(
		session.press(tab, "b", { target: 1 as unknown as string }),
	).rejects.toThrow("target reference");
});
