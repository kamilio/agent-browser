import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const sessions: BrowserSession[] = [];

afterEach(() => {
	for (const session of sessions.splice(0)) {
		session.close();
		expect(session.metrics().closed).toBe(true);
	}
});

async function fixture(css = "", attributes = "", extra = "") {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const bodies = new Map([
		[
			"https://fixture.invalid/start",
			`<!doctype html><title>Start</title><style>html,body{margin:0;padding:0;font-family:'Agent Mono';font-size:8px;line-height:8px}main{width:100px;opacity:0}${css}</style><main><a id="target" href="/next" ${attributes}>A B</a></main>${extra}`,
		],
		[
			"https://fixture.invalid/next",
			"<!doctype html><title>Next</title><h1>Done</h1>",
		],
	]);
	const session = new BrowserSession({
		loadDocument: (response) =>
			parseHtmlDocument(new TextDecoder().decode(response.body), response.url),
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				const source = bodies.get(request.url);
				if (source === undefined) throw new Error("Unexpected fixture URL");
				const body = new TextEncoder().encode(source);
				return {
					url: request.url,
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
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, "https://fixture.invalid/start");
	const page = session.page(tab.id);
	documentStyles(page.document).setViewport(100, 80);
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing discovered link");
	const reference = page.document.reference(target);
	return { session, tab, page, target, reference, requests };
}

it("navigates a discovered opacity-grouped link only after receiving pointer events", async () => {
	const current = await fixture();
	const { session, tab, page, target, reference, requests } = current;
	expect(
		documentGeometry(page.document).getBoundingClientRect(target).width,
	).toBe(18);
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () => {
			expect(requests).toHaveLength(1);
			events.push(type);
		});
	await session.click(tab.id, reference);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(requests.map((request) => request.url)).toEqual([
		"https://fixture.invalid/start",
		"https://fixture.invalid/next",
	]);
	expect(session.page(tab.id)).not.toBe(page);
	expect(session.page(tab.id).document.url).toBe(
		"https://fixture.invalid/next",
	);
});

it("does not navigate when a opacity-grouped link cancels its click", async () => {
	const { session, tab, page, target, reference, requests } = await fixture();
	let clicks = 0;
	page.interactions.events.addEventListener(target, "click", (event) => {
		clicks++;
		event.preventDefault();
	});
	await session.click(tab.id, reference);
	expect(clicks).toBe(1);
	expect(requests).toHaveLength(1);
	expect(session.page(tab.id)).toBe(page);
});

it.each([
	["hidden", "", "hidden", ""],
	["inert", "", "inert", ""],
	["ARIA disabled", "", 'aria-disabled="true"', ""],
	[
		"covered",
		"#overlay{position:relative;top:-8px;width:100px;height:8px;z-index:1}",
		"",
		'<div id="overlay"></div>',
	],
])(
	"keeps a %s opacity-grouped link non-actionable",
	async (_name, css, attributes, extra) => {
		const { session, tab, reference, requests } = await fixture(
			css,
			attributes,
			extra,
		);
		await expect(session.click(tab.id, reference)).rejects.toMatchObject({
			code: "not-actionable",
		});
		expect(requests).toHaveLength(1);
	},
);

it("retains whole-document admission for an unrelated unsupported effect", async () => {
	const { session, tab, reference, requests } = await fixture(
		"#other{perspective:10px}",
		"",
		'<div id="other">Unrelated content</div>',
	);
	await expect(session.click(tab.id, reference)).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(requests).toHaveLength(1);
});

it("preserves the existing unmatched-rule exception", async () => {
	const { session, tab, reference, requests } = await fixture(
		"#missing{perspective:10px}",
	);
	await session.click(tab.id, reference);
	expect(requests).toHaveLength(2);
});
