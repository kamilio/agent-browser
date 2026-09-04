import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { documentScroll } from "./document-scroll.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
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
				'<style>html,body{margin:0;padding:0}div,a{display:block;height:60px;width:160px;font-size:8px}#top{background:red}#link{background:blue}</style><div id="top"></div><a id="link" href="/next">Next</a><div></div>',
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/wheel"]);
	await host.execute(["resize", "100", "80"]);
	return {
		host,
		session,
		requests,
		tab: session.tabs()[0].id,
		page: session.page(session.tabs()[0].id),
	};
}
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

it("advertises actual pixel-wheel support while retaining explicit viewport-only limits", async () => {
	const { host } = await fixture();
	expect((await host.execute(["capabilities"])).data).toMatchObject({
		viewportScrolling: {
			partial: true,
			command: "mousewheel",
			elementScrolling: false,
			programmaticGuestScrolling: true,
		},
		mouse: {
			scrolling: "root-viewport-pixel-wheel",
			modifierWheelDefaults: false,
		},
	});
});

it("shares scrolling across command results, geometry, captures and hit testing", async () => {
	const { host } = await fixture();
	await host.execute(["mousemove", "5", "5"]);
	expect((await host.execute(["mousewheel", "10", "60"])).data).toMatchObject({
		mouse: { scroll: { x: 10, y: 60 }, canceled: false },
	});
	const geometry = (await host.execute(["geometry", "#link"])).data as {
		reference: string;
		bounds: { x: number; y: number };
		scroll: { x: number; y: number };
	};
	expect(geometry).toMatchObject({
		bounds: { x: -10, y: 0 },
		scroll: { x: 10, y: 60 },
	});
	expect((await host.execute(["hit-test", "5", "5"])).data).toMatchObject({
		reference: geometry.reference,
	});
	expect((await host.execute(["screenshot"])).data).toMatchObject({
		clip: { x: 10, y: 60, width: 100, height: 80 },
	});
});

it("coordinate click after scrolling navigates the actual newly visible link", async () => {
	const { host, page, requests } = await fixture();
	const oldScroll = documentScroll(page.document);
	await host.execute(["mousemove", "5", "5"]);
	await host.execute(["mousewheel", "0", "60"]);
	await host.execute(["mousedown"]);
	expect((await host.execute(["mouseup"])).data).toMatchObject({
		navigation: { url: "https://fixture.invalid/next" },
	});
	expect(requests).toHaveLength(2);
	expect(oldScroll.metrics()).toMatchObject({ x: 0, y: 0, closed: true });
});

it("canceled wheel reaches the command result without changing native scroll", async () => {
	const { host, page } = await fixture();
	const target = new DocumentQueries(page.document).querySelector(
		"#top",
	) as number;
	page.interactions.events.addEventListener(target, "wheel", (event) =>
		event.preventDefault(),
	);
	expect((await host.execute(["mousewheel", "0", "60"])).data).toMatchObject({
		mouse: { canceled: true, scroll: { x: 0, y: 0 } },
	});
});

it.each(["", "NaN", "Infinity", "1000001"])(
	"rejects invalid CLI wheel delta %s rather than reporting success",
	async (delta) => {
		const { host, page } = await fixture();
		await expect(
			host.execute(["mousewheel", "0", delta]),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(documentScroll(page.document).get().y).toBe(0);
	},
);

it("does not reuse another tab's viewport position", async () => {
	const { host } = await fixture();
	await host.execute(["mousewheel", "0", "60"]);
	await host.execute(["tab-new", "https://fixture.invalid/second"]);
	expect((await host.execute(["geometry", "#link"])).data).toMatchObject({
		scroll: { x: 0, y: 0 },
	});
	await host.execute(["tab-select", "0"]);
	expect((await host.execute(["geometry", "#link"])).data).toMatchObject({
		scroll: { x: 0, y: 60 },
	});
});

it("rejects an already aborted session wheel request without mutating the page", async () => {
	const { session, tab, page } = await fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		session.mousewheel(tab, 0, 60, { signal: controller.signal }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(documentScroll(page.document).get().y).toBe(0);
});

it("accepts matching optional wheel guards without changing normal mouse semantics", async () => {
	const { host, page } = await fixture();
	const viewport = (await host.execute(["viewport"])).data as { key: string };
	expect(
		(
			await host.execute([
				"mousewheel",
				"0",
				"60",
				`--expected-viewport=${viewport.key}`,
				`--expected-document=${page.document.reference(page.document.root)}`,
			])
		).data,
	).toMatchObject({ mouse: { scroll: { x: 0, y: 60 } } });
});

it.each(["tab", "navigation"])(
	"rejects stale wheel input after %s replacement before dispatching an event",
	async (replacement) => {
		const { host, session, page } = await fixture();
		const viewport = (await host.execute(["viewport"])).data as { key: string };
		const reference = page.document.reference(page.document.root);
		if (replacement === "tab")
			await host.execute(["tab-new", "https://fixture.invalid/new"]);
		else await host.execute(["goto", "https://fixture.invalid/new"]);
		let dispatched = 0;
		const selected = session.tabs().at(-1);
		if (!selected) throw new Error("Missing test tab");
		const current = session.page(selected.id);
		current.interactions.events.addEventListener(
			current.document.root,
			"wheel",
			() => {
				dispatched++;
			},
		);
		await expect(
			host.execute([
				"mousewheel",
				"0",
				"60",
				`--expected-viewport=${viewport.key}`,
				`--expected-document=${reference}`,
			]),
		).rejects.toMatchObject({ code: "stale-reference" });
		expect(dispatched).toBe(0);
		expect((await host.execute(["geometry", "#link"])).data).toMatchObject({
			scroll: { x: 0, y: 0 },
		});
	},
);
