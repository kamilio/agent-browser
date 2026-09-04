import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { parseInvocation } from "./cli-parser.js";
import { commands } from "./commands.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
async function fixture(
	extraCss = "",
	target = '<a id="target" href="/next">Go</a>',
) {
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
				`<!doctype html><style>html,body{margin:0;padding:0}main{width:400px;height:500px}#before{height:160px}#target{display:block;margin-left:150px;width:20px;height:20px;background:blue}#after{height:320px}${extraCss}</style><main><div id="before"></div>${target}<div id="after"></div></main>`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/into-view"]);
	await host.execute(["resize", "100", "80"]);
	const tab = session.tabs()[0].id;
	const page = session.page(tab);
	const id = new DocumentQueries(page.document).querySelector("#target");
	if (id === null) throw new Error("Missing target");
	return {
		host,
		session,
		page,
		tab,
		requests,
		reference: page.document.reference(id),
		scroll: documentScroll(page.document),
	};
}
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

it("parses and advertises a strict extension command with alignment options", async () => {
	expect(
		parseInvocation([
			"scroll-into-view",
			"#target",
			"--block=nearest",
			"--inline=center",
		]),
	).toMatchObject({
		command: "scroll-into-view",
		arguments: ["#target"],
		options: { block: "nearest", inline: "center" },
	});
	expect(commands.get("scroll-into-view")?.category).toBe("extension");
	const { host } = await fixture();
	expect((await host.execute(["capabilities"])).data).toMatchObject({
		scrollIntoView: {
			command: "scroll-into-view",
			containerScope: "root-only",
			smooth: false,
		},
	});
});

it("scrolls a stable target into actual pixels and then allows a coordinate click", async () => {
	const { host, page, reference, requests, scroll } = await fixture();
	const before = rasterizeDocument(page.document).image.pixels.slice();
	expect(
		(await host.execute(["scroll-into-view", reference, "--block=nearest"]))
			.data,
	).toMatchObject({
		reference,
		hasBox: true,
		changed: true,
		scroll: { x: 70, y: 100 },
	});
	expect((await host.execute(["geometry", reference])).data).toMatchObject({
		bounds: { x: 80, y: 60 },
	});
	expect(rasterizeDocument(page.document).image.pixels).not.toEqual(before);
	expect(page.interactions.focus.active()).toBe(null);
	expect(requests).toHaveLength(1);
	await host.execute(["mousemove", "85", "65"]);
	await host.execute(["mousedown"]);
	expect((await host.execute(["mouseup"])).data).toMatchObject({
		navigation: { url: "https://fixture.invalid/next" },
	});
	expect(scroll.metrics().closed).toBe(true);
	expect(requests).toHaveLength(2);
});

it("resolves selectors strictly rather than choosing the first match", async () => {
	const { host, scroll } = await fixture(
		"",
		'<a id="target" class="entry">One</a><a class="entry">Two</a>',
	);
	await expect(host.execute(["scroll-into-view", ".entry"])).rejects.toThrow();
	await expect(
		host.execute(["scroll-into-view", "#missing"]),
	).rejects.toThrow();
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it("reports an unrendered CLI target as not actionable without moving", async () => {
	const { host, scroll } = await fixture("#target{display:none}");
	await expect(
		host.execute(["scroll-into-view", "#target"]),
	).rejects.toMatchObject({ code: "not-actionable" });
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it("rejects invalid alignment and smooth behavior with structured command errors", async () => {
	const { host, scroll } = await fixture();
	await expect(
		host.execute(["scroll-into-view", "#target", "--block=wrong"]),
	).rejects.toMatchObject({ code: "invalid-input" });
	await expect(
		host.execute(["scroll-into-view", "#target", "--behavior=smooth"]),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it("rejects stale references after navigation instead of targeting a similar element", async () => {
	const { host, reference } = await fixture();
	await host.execute(["goto", "https://fixture.invalid/replacement"]);
	await expect(host.execute(["scroll-into-view", reference])).rejects.toThrow();
	expect((await host.execute(["geometry", "#target"])).data).toMatchObject({
		scroll: { x: 0, y: 0 },
	});
});

it("honors abort before the session action without scrolling", async () => {
	const { session, tab, reference, scroll } = await fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		session.scrollIntoView(tab, reference, {}, { signal: controller.signal }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it("reports abort during scroll delivery without rolling back observed movement", async () => {
	const { session, tab, reference, scroll, page } = await fixture();
	const controller = new AbortController();
	page.interactions.events.addEventListener(page.document.root, "scroll", () =>
		controller.abort(),
	);
	await expect(
		session.scrollIntoView(tab, reference, {}, { signal: controller.signal }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(scroll.get()).toEqual({ x: 70, y: 160 });
});

it("does not re-emit a scroll event when nearest alignment is already satisfied", async () => {
	const { host, page } = await fixture();
	let calls = 0;
	page.interactions.events.addEventListener(
		page.document.root,
		"scroll",
		() => calls++,
	);
	await host.execute(["scroll-into-view", "#target", "--block=nearest"]);
	expect(
		(await host.execute(["scroll-into-view", "#target", "--block=nearest"]))
			.data,
	).toMatchObject({ changed: false });
	expect(calls).toBe(1);
});
