import { afterEach, expect, it } from "vitest";
import { loadResearchDocument, researchReaderInfo } from "./research-loader.js";
import { BrowserSession } from "./session.js";

const rootUrl = "https://reader-links.fixture.invalid/";
const reviewUrl = `${rootUrl}brooks-revel-9`;
const sessions: BrowserSession[] = [];

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

async function fixture(href = "/brooks-revel-9", base = "") {
	const requests: string[] = [];
	let closed = false;
	const source = [
		"<!doctype html><html><head>",
		base,
		"</head><body><main>",
		`<a id="review" href="${href}"><div><h2>Brooks Revel 9</h2><p>Read the review</p></div></a>`,
		'<p id="note">Independent reader text</p>',
		'<div style="display:none"><a id="hidden" href="/never">Hidden review</a></div>',
		"</main></body></html>",
	].join("");
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
				requests.push(input.url);
				const body = new TextEncoder().encode(
					input.url === rootUrl
						? source
						: "<!doctype html><h1 id=destination>Review destination</h1>",
				);
				return {
					url: input.url,
					status: 200,
					headers: { "content-type": ["text/html; charset=utf-8"] },
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
				encodedBytes: 0,
				decodedBytes: 0,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: (response, context) =>
			loadResearchDocument(
				response,
				context,
				"default",
				"separate-omitted-raw-v1",
				"source-hidden-inline-v1",
			),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, rootUrl);
	const page = session.page(tab.id);
	const id = (selector: string) => {
		const node = page.queries.querySelector(selector);
		if (node === null) throw new Error(`Missing reader target: ${selector}`);
		return node;
	};
	const link = id("#review");
	const reference = page.document.reference(link);
	const events: string[] = [];
	for (const type of [
		"pointerdown",
		"mousedown",
		"pointerup",
		"mouseup",
		"keydown",
		"keypress",
		"click",
		"keyup",
	])
		page.interactions.events.addEventListener(link, type, () =>
			events.push(type),
		);
	return { session, tab, page, id, link, reference, requests, events };
}

it("rejects block-in-inline pointer geometry without navigating, then permits explicit Enter", async () => {
	const { session, tab, page, link, reference, requests, events } =
		await fixture();
	expect(researchReaderInfo(page.document)).toMatchObject({
		rawTextPolicy: "separate-omitted-raw-v1",
		visibilityPolicy: "source-hidden-inline-v1",
		scripting: false,
		styling: false,
	});
	expect(page.queries.querySelector("#hidden")).toBeNull();
	expect(page.queries.querySelector("#review > div > h2")).not.toBeNull();
	expect(page.document.get(link).attributes.href).toBe("/brooks-revel-9");
	await expect(session.click(tab.id, reference)).rejects.toMatchObject({
		code: "unsupported",
		message: expect.stringContaining("block-in-inline"),
	});
	expect(requests).toEqual([rootUrl]);
	expect(session.page(tab.id)).toBe(page);
	expect(events).toEqual([]);

	const result = await session.press(tab.id, "Enter", { target: reference });
	expect(result.keyboard.defaultAction).toMatchObject({
		kind: "navigate",
		url: reviewUrl,
	});
	expect(result.navigation?.kind).toBe("document");
	expect(requests).toEqual([rootUrl, reviewUrl]);
	expect(session.page(tab.id)).not.toBe(page);
	expect(events).toEqual(["keydown", "keypress", "click", "keyup"]);
});

it("activates the block-child anchor directly with targeted Enter", async () => {
	const { session, tab, page, reference, requests, events } = await fixture();
	const result = await session.press(tab.id, "Enter", { target: reference });
	expect(result.navigation?.kind).toBe("document");
	expect(requests).toEqual([rootUrl, reviewUrl]);
	expect(session.page(tab.id)).not.toBe(page);
	expect(
		session.page(tab.id).queries.querySelector("#destination"),
	).not.toBeNull();
	expect(events).toEqual(["keydown", "keypress", "click", "keyup"]);
});

it.each(["keydown", "keypress", "click"])(
	"does not navigate when the reader link's %s default is canceled",
	async (type) => {
		const { session, tab, page, link, reference, requests, events } =
			await fixture();
		const canceled: string[] = [];
		page.interactions.events.addEventListener(link, type, (event) => {
			canceled.push(event.type);
			event.preventDefault();
		});
		const result = await session.press(tab.id, "Enter", { target: reference });
		expect(canceled).toEqual([type]);
		expect(result.keyboard.defaultAction).toBeUndefined();
		expect(result.navigation).toBeUndefined();
		expect(requests).toEqual([rootUrl]);
		expect(session.page(tab.id)).toBe(page);
		expect(events).toEqual(
			type === "keydown"
				? ["keydown", "keyup"]
				: type === "keypress"
					? ["keydown", "keypress", "keyup"]
					: ["keydown", "keypress", "click", "keyup"],
		);
	},
);

it.each([
	{
		name: "document-relative href",
		href: "reviews/revel-9?source=reader",
		base: "",
		expected: `${rootUrl}reviews/revel-9?source=reader`,
	},
	{
		name: "retained base-relative href",
		href: "../brooks-revel-9?source=reader",
		base: '<base href="/catalog/shoes/">',
		expected: `${rootUrl}catalog/brooks-revel-9?source=reader`,
	},
])(
	"resolves $name during keyboard activation",
	async ({ href, base, expected }) => {
		const { session, tab, reference, requests } = await fixture(href, base);
		const result = await session.press(tab.id, "Enter", { target: reference });
		expect(result.keyboard.defaultAction).toMatchObject({
			kind: "navigate",
			url: expected,
		});
		expect(result.navigation?.kind).toBe("document");
		expect(requests).toEqual([rootUrl, expected]);
	},
);

it("rejects targeted Enter on an unfocusable non-link without navigating", async () => {
	const { session, tab, page, id, requests, events } = await fixture();
	await expect(
		session.press(tab.id, "Enter", {
			target: page.document.reference(id("#note")),
		}),
	).rejects.toMatchObject({
		code: "not-actionable",
		message: "Element cannot receive focus",
	});
	expect(requests).toEqual([rootUrl]);
	expect(session.page(tab.id)).toBe(page);
	expect(events).toEqual([]);
});
