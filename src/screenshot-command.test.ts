import { afterEach, expect, it } from "vitest";
import type { CaptureArtifact } from "./capture-artifacts.js";
import { capturePng } from "./capture-client.js";
import { BrowserCommandHost } from "./command-host.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { scriptFrame, scriptFrameLimit } from "./node-script-protocol.js";
import { encodePng } from "./png.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
function fixture(
	markup = '<body style="background-color:navy"><main id="target" style="margin:3.5px;padding:2px;height:12px;color:aquamarine;font-size:8px">A<span>B</span></main></body>',
) {
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
					tree = parseHtmlDocument(markup, response.url);
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

it("transfers a real compressed viewport PNG using bounded chunks", async () => {
	const { host, document } = fixture();
	await host.execute(["open", "https://fixture.invalid/"]);
	await host.execute(["resize", "1024", "768"]);
	const revision = document().revision;
	const frames: number[] = [];
	const result = await capturePng(async (argv) => {
		const response = await host.execute(argv);
		const encoded = scriptFrame({ result: response });
		frames.push(Buffer.byteLength(encoded));
		return JSON.parse(encoded).result;
	});
	expect(result.artifact.bytes).toBeLessThan(scriptFrameLimit);
	expect(Math.max(...frames)).toBeLessThan(100_000);
	expect(
		Buffer.from(result.bytes).equals(
			encodePng(rasterizeDocument(document()).image),
		),
	).toBe(true);
	expect(result.released).toBe(true);
	expect((await host.execute(["artifact-list"])).data).toEqual([]);
	expect(document().revision).toBe(revision);
});

it("captures a fractional block border box using outward pixel rounding", async () => {
	const { host, document } = fixture();
	await host.execute(["open", "https://fixture.invalid/"]);
	await host.execute(["resize", "40", "40"]);
	const result = await capturePng((argv) => host.execute(argv), "#target");
	expect(result.artifact.clip).toEqual({ x: 3, y: 3, width: 34, height: 17 });
	expect(result.bytes).toEqual(
		encodePng(
			rasterizeDocument(document(), {
				clip: { x: 3, y: 3, width: 34, height: 17 },
			}).image,
		),
	);
});

it("exports wrapped inline targets through bounded artifacts with geometry-matched bounds", async () => {
	const { host, document } = fixture(
		'<main style="width:18px;font-size:8px"><span id="target" style="background-color:navy;color:white">ab cd</span></main>',
	);
	await host.execute(["open", "https://fixture.invalid/"]);
	const geometry = (await host.execute(["geometry", "#target"])).data as {
		reference: string;
		bounds: { x: number; y: number; width: number; height: number };
	};
	const result = await capturePng((argv) => host.execute(argv), "#target");
	expect(result.artifact).toMatchObject({
		target: geometry.reference,
		width: 12,
		height: 18,
		clip: { x: 0, y: 1, width: 12, height: 18 },
	});
	expect(result.artifact.clip).toMatchObject({
		x: geometry.bounds.x,
		y: geometry.bounds.y,
		width: geometry.bounds.width,
		height: geometry.bounds.height,
	});
	expect(result.bytes).toEqual(
		encodePng(
			rasterizeDocument(document(), { element: geometry.reference }).image,
		),
	);
	expect(host.metrics().captureArtifacts.artifacts).toBe(0);
});

it("keeps captures stable across navigation but scopes them to the session and releases on close", async () => {
	const { host } = fixture();
	await host.execute(["open", "https://fixture.invalid/"], {
		session: "first",
	});
	await host.execute(["resize", "20", "20"], { session: "first" });
	const info = (await host.execute(["screenshot"], { session: "first" }))
		.data as CaptureArtifact;
	const before = await host.execute(["artifact-read", info.id], {
		session: "first",
	});
	await host.execute(["goto", "https://fixture.invalid/next"], {
		session: "first",
	});
	expect(
		(await host.execute(["artifact-read", info.id], { session: "first" })).data,
	).toEqual(before.data);
	await host.execute(["open", "https://fixture.invalid/"], {
		session: "second",
	});
	await expect(
		host.execute(["artifact-read", info.id], { session: "second" }),
	).rejects.toMatchObject({ code: "not-found" });
	await host.execute(["close"], { session: "first" });
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
	await host.execute(["open", "https://fixture.invalid/"], {
		session: "first",
	});
	await expect(
		host.execute(["artifact-read", info.id], { session: "first" }),
	).rejects.toMatchObject({ code: "not-found" });
});

it("supports hires truthfully at device scale one and never writes server-side filenames", async () => {
	const { host } = fixture();
	await host.execute(["open", "https://fixture.invalid/"]);
	await host.execute(["resize", "20", "20"]);
	const info = (await host.execute(["screenshot", "--hires"]))
		.data as CaptureArtifact;
	expect(info).toMatchObject({
		width: 20,
		height: 20,
		deviceScaleFactor: 1,
		hires: true,
		partial: true,
	});
	await expect(
		host.execute(["screenshot", "--filename=/tmp/not-written.png"]),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(host.capabilities().screenshots.transport).toBe("artifact-chunks");
});

it.each([
	'<main style="display:none">X</main>',
	'<main style="height:0"></main>',
	'<span id="target"></span>',
	'<main style="position:sticky">X</main>',
])("rejects unsupported or invisible element captures: %s", async (markup) => {
	const { host } = fixture(markup);
	await host.execute(["open", "https://fixture.invalid/"]);
	await expect(
		host.execute(["screenshot", markup.startsWith("<span") ? "span" : "main"]),
	).rejects.toThrow();
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
});
