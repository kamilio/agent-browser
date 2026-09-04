import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { scriptFrame, scriptFrameLimit } from "./node-script-protocol.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
function fixture(content = "ab cd", width = "18px") {
	let tree: DocumentTree | undefined;
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
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
						requests: 0,
						active: 0,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed: false,
					}),
					close() {},
				}),
				loadDocument: (response) => {
					tree = parseHtmlDocument(
						`<main style="width:${width};font-size:8px"><span id="target">${content}</span></main>`,
						response.url,
					);
					return tree;
				},
			}),
	});
	hosts.push(host);
	return {
		host,
		document: () => {
			if (!tree) throw new Error("No document");
			return tree;
		},
	};
}
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

it("inspects real wrapped geometry through selectors and stable references", async () => {
	const { host, document } = fixture();
	await host.execute(["open", "https://fixture.invalid/"]);
	const before = document().revision;
	const response = await host.execute(["geometry", "#target"]);
	const data = response.data as { reference: string; rects: unknown[] };
	expect(response.data).toMatchObject({
		revision: before,
		profile: "normal-flow-client-rects",
		partial: true,
		scroll: { x: 0, y: 0 },
		bounds: { width: 12, height: 18 },
		sizes: {
			clientWidth: 0,
			clientHeight: 0,
			offsetWidth: 12,
			offsetHeight: 18,
		},
		rects: [
			{ y: 1, width: 12 },
			{ y: 11, width: 12 },
		],
	});
	expect((await host.execute(["geometry", data.reference])).data).toEqual(
		response.data,
	);
	expect(document().revision).toBe(before);
	expect(documentGeometry(document()).metrics().builds).toBe(1);
});

it("reflows inspected block bounds after a resize", async () => {
	const { host } = fixture("a", "50%");
	await host.execute(["open", "https://fixture.invalid/"]);
	await host.execute(["resize", "100", "100"]);
	expect((await host.execute(["geometry", "main"])).data).toMatchObject({
		bounds: { width: 50 },
		sizes: { clientWidth: 50, offsetWidth: 50 },
		viewport: { width: 100, height: 100 },
	});
	await host.execute(["resize", "200", "100"]);
	expect((await host.execute(["geometry", "main"])).data).toMatchObject({
		bounds: { width: 100 },
		viewport: { width: 200, height: 100 },
	});
});

it("bounds fragment lists before command framing", async () => {
	const { host } = fixture("a ".repeat(4096), "6px");
	await host.execute(["open", "https://fixture.invalid/"]);
	const response = await host.execute(["geometry", "#target"]);
	expect((response.data as { rects: unknown[] }).rects).toHaveLength(4096);
	expect(Buffer.byteLength(scriptFrame({ result: response }))).toBeLessThan(
		scriptFrameLimit,
	);
});

it("rejects excessive lists and unsupported block-in-inline ownership", async () => {
	const large = fixture("a ".repeat(4097), "6px");
	await large.host.execute(["open", "https://fixture.invalid/"]);
	await expect(large.host.execute(["geometry", "#target"])).rejects.toThrow(
		"rectangle limit",
	);
	const split = fixture("a<div>b</div>c");
	await split.host.execute(["open", "https://fixture.invalid/"]);
	await expect(split.host.execute(["geometry", "#target"])).rejects.toThrow(
		"block-in-inline",
	);
});

it("advertises partial geometry rather than desktop-browser equivalence", async () => {
	const { host } = fixture();
	const response = await host.execute(["capabilities"]);
	expect(response.data).toMatchObject({
		computedStyles: {
			partial: true,
			live: true,
			readonly: true,
			pseudoElements: false,
			customProperties: false,
			maxObjects: 4096,
		},
		clientGeometry: {
			partial: true,
			command: "geometry",
			scroll: "root-viewport",
			domRectConstructors: false,
			blockInInline: false,
		},
	});
});
