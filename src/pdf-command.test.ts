import {
	mkdtemp,
	readFile,
	lstat,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { BrowserSession } from "./session.js";
import { parseHtmlDocument } from "./html-parser.js";
import { capturePdf, readPdf } from "./capture-client.js";
import { validatePdfArtifact, type PdfArtifact } from "./capture-artifacts.js";
import { saveCapture } from "./node-capture.js";
import { parseInvocation } from "./cli-parser.js";

const hosts: BrowserCommandHost[] = [];
const directories: string[] = [];
function fixture(
	markup = '<main style="font-size:8px;line-height:10px">ONE<br>TWO<br>THREE</main>',
) {
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
				loadDocument: (response) => parseHtmlDocument(markup, response.url),
			}),
	});
	hosts.push(host);
	return host;
}
async function openHost() {
	const host = fixture();
	await host.execute(["open", "https://fixture.invalid/pdf"]);
	await host.execute(["resize", "64", "16"]);
	return host;
}
async function directory() {
	const path = await mkdtemp(join(tmpdir(), "agent-browser-pdf-"));
	directories.push(path);
	return path;
}
afterEach(async () => {
	for (const host of hosts.splice(0)) host.close();
	for (const path of directories.splice(0))
		await rm(path, { recursive: true, force: true });
});

it("transfers a real PDF and releases the owned artifact", async () => {
	const host = await openHost();
	const result = await capturePdf((argv) => host.execute(argv));
	expect(result.artifact).toMatchObject({
		mediaType: "application/pdf",
		pages: 3,
		width: 64,
		height: 16,
		partial: true,
	});
	expect(Buffer.from(result.bytes).subarray(0, 9).toString()).toBe(
		"%PDF-1.4\n",
	);
	expect(result.released).toBe(true);
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
	expect(host.capabilities().pdf).toMatchObject({
		printMedia: false,
		searchableText: true,
		transport: "artifact-chunks",
	});
});

it("shares artifact capacity and enforces session ownership", async () => {
	const host = await openHost();
	const artifact = (await host.execute(["pdf"])).data as PdfArtifact;
	await host.execute(["open", "https://fixture.invalid/other"], {
		session: "other",
	});
	await expect(
		host.execute(["artifact-read", artifact.id], { session: "other" }),
	).rejects.toThrow(/not found/);
	await expect(
		host.execute(["artifact-delete", artifact.id], { session: "other" }),
	).rejects.toThrow(/not found/);
	for (let index = 0; index < 7; index++) await host.execute(["pdf"]);
	await expect(host.execute(["screenshot"])).rejects.toThrow(/storage limit/);
	await host.execute(["artifact-delete", artifact.id]);
	await expect(host.execute(["pdf"])).resolves.toBeDefined();
});

it("downloads a multi-chunk PDF without oversized command frames", async () => {
	const host = fixture(
		`<main style="font-size:8px;line-height:10px">${Array.from({ length: 1000 }, () => `<div>${"A".repeat(80)}</div>`).join("")}</main>`,
	);
	await host.execute(["open", "https://fixture.invalid/pdf"]);
	await host.execute(["resize", "512", "512"]);
	const frames: number[] = [];
	let reads = 0;
	const result = await capturePdf(async (argv) => {
		const response = await host.execute(argv);
		const serialized = JSON.stringify(response);
		frames.push(Buffer.byteLength(serialized));
		if (argv[0] === "artifact-read") reads++;
		return JSON.parse(serialized);
	});
	expect(result.bytes.length).toBeGreaterThan(131072);
	expect(reads).toBeGreaterThan(2);
	expect(Math.max(...frames)).toBeLessThan(100000);
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
});

it("validates PDF metadata, page clips and cancellation", async () => {
	const host = await openHost();
	const artifact = (await host.execute(["pdf"])).data as PdfArtifact;
	expect(validatePdfArtifact(artifact)).toBe(artifact);
	for (const patch of [
		{ mediaType: "image/png" },
		{ pages: 33 },
		{ clips: [] },
		{ bytes: 100 },
		{ clips: [{ x: 0, y: 1, width: 64, height: 16 }] },
	])
		expect(() => validatePdfArtifact({ ...artifact, ...patch })).toThrow(/PDF/);
	const controller = new AbortController();
	controller.abort();
	await expect(
		readPdf(
			(argv) => host.execute(argv),
			artifact,
			() => {},
			controller.signal,
		),
	).rejects.toThrow(/aborted/);
});

it("rejects a corrupt PDF trailer and still releases remote bytes", async () => {
	const host = await openHost();
	await expect(
		capturePdf(async (argv) => {
			const response = await host.execute(argv);
			if (argv[0] === "artifact-read") {
				const chunk = response.data as { data: string };
				const bytes = Buffer.from(chunk.data, "base64");
				bytes[bytes.length - 2] = 0;
				return {
					...response,
					data: { ...chunk, data: bytes.toString("base64") },
				};
			}
			return response;
		}),
	).rejects.toThrow(/trailer/);
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
});

it("writes a private PDF atomically and refuses to replace an existing file", async () => {
	const host = await openHost();
	const path = await directory();
	const result = await saveCapture(
		parseInvocation(["pdf", "--filename=page.pdf"]),
		(argv) => host.execute(argv),
		path,
	);
	expect((await readFile(result.filename)).subarray(0, 9).toString()).toBe(
		"%PDF-1.4\n",
	);
	expect((await lstat(result.filename)).mode & 0o777).toBe(0o600);
	expect(result.remoteCleanupConfirmed).toBe(true);
	await writeFile(join(path, "existing.pdf"), "keep");
	await expect(
		saveCapture(
			parseInvocation(["pdf", "--filename=existing.pdf"]),
			(argv) => host.execute(argv),
			path,
		),
	).rejects.toThrow(/already exists/);
	expect(await readFile(join(path, "existing.pdf"), "utf8")).toBe("keep");
	expect((await readdir(path)).some((name) => name.endsWith(".part"))).toBe(
		false,
	);
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
});

it("does not accept a PNG destination for PDF or a server-side filename", async () => {
	const host = await openHost();
	await expect(
		saveCapture(parseInvocation(["pdf", "--filename=page.png"]), (argv) =>
			host.execute(argv),
		),
	).rejects.toThrow(/PDF file path/);
	await expect(host.execute(["pdf", "--filename=page.pdf"])).rejects.toThrow(
		/filename/,
	);
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
});
