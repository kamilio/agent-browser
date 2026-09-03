import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { capturePng } from "../src/capture-client.js";
import { parseInvocation } from "../src/cli-parser.js";
import { BrowserCommandHost } from "../src/command-host.js";
import { rasterizeDocument } from "../src/document-raster.js";
import type { DocumentTree } from "../src/document.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { saveCapture } from "../src/node-capture.js";
import { scriptFrame } from "../src/node-script-protocol.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const filename = process.argv[2];
if (!filename || process.argv.length !== 3)
	throw new Error("Provide one new PNG output path");
const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const checks: { label: string; passed: boolean }[] = [];
const frames: number[] = [];
let tree: DocumentTree | undefined;
let completed = false;
let artifact: Record<string, unknown> | undefined;
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
					'<main style="width:144px;font-size:16px;padding:10px;margin:4px;background-color:navy"><span id="target" style="color:white;background-color:#284d80">alpha beta gamma delta</span></main>',
					response.url,
				);
				return tree;
			},
		}),
	evaluatePage: (page, source, signal) => {
		let owner = owners.get(page.document);
		if (!owner) {
			owner = new PageScripts(
				{ document: page.document, interactions: page.interactions },
				core,
			);
			owners.set(page.document, owner);
		}
		return owner.evaluate(source, { signal });
	},
});
async function execute(argv: readonly string[]) {
	const response = await host.execute(argv);
	const encoded = scriptFrame({ result: response });
	frames.push(Buffer.byteLength(encoded));
	return JSON.parse(encoded) as { result: typeof response };
}
const command = async (argv: readonly string[]) => (await execute(argv)).result;
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
async function evaluate(source: string) {
	const result = (await command(["eval", source])).data as ScriptEvaluation;
	if (!result.ok) throw new Error("Interpreted inline capture fixture failed");
	return result.value;
}
function pixels(bytes: Uint8Array, width: number, height: number) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const parts: Uint8Array[] = [];
	for (let offset = 8; offset < bytes.length; ) {
		if (offset + 12 > bytes.length) throw new Error("Truncated PNG chunk");
		const length = view.getUint32(offset);
		if (length > bytes.length - offset - 12)
			throw new Error("Invalid PNG chunk length");
		if (view.getUint32(offset + 4) === 0x49444154)
			parts.push(bytes.subarray(offset + 8, offset + 8 + length));
		offset += length + 12;
	}
	const stride = width * 4;
	const decoded = inflateSync(Buffer.concat(parts), {
		maxOutputLength: (stride + 1) * height,
	});
	if (decoded.length !== (stride + 1) * height)
		throw new Error("Invalid PNG pixel length");
	const result = new Uint8Array(stride * height);
	for (let row = 0; row < height; row++) {
		if (decoded[row * (stride + 1)] !== 0)
			throw new Error("Expected the encoder's unfiltered scanlines");
		result.set(
			decoded.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)),
			row * stride,
		);
	}
	return result;
}
const digest = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");
try {
	await command(["open", "https://fixture.invalid/inline-capture"]);
	await command(["resize", "256", "128"]);
	check(
		"The real interpreter sees two source-mapped inline fragments",
		(await evaluate(
			'document.getElementById("target").getClientRects().length === 2',
		)) === true,
	);
	const before = await capturePng(command, "#target");
	check(
		"Selector capture exports actual wrapped bounds",
		JSON.stringify(before.artifact.clip) ===
			JSON.stringify({ x: 14, y: 16, width: 132, height: 36 }),
	);
	const geometry = (await command(["geometry", "#target"])).data as {
		reference: string;
		bounds: { x: number; y: number; width: number; height: number };
	};
	check(
		"Script geometry, agent inspection and capture agree on the target",
		before.artifact.target === geometry.reference &&
			geometry.bounds.width === 132 &&
			geometry.bounds.height === 36 &&
			(await evaluate(
				'document.getElementById("target").getBoundingClientRect().width === 132',
			)) === true,
	);
	if (!tree) throw new Error("Missing fixture document");
	const viewport = rasterizeDocument(tree).image;
	const expected = new Uint8Array(132 * 36 * 4);
	for (let row = 0; row < 36; row++)
		expected.set(
			viewport.pixels.subarray(
				((row + 16) * 256 + 14) * 4,
				((row + 16) * 256 + 146) * 4,
			),
			row * 132 * 4,
		);
	const decoded = pixels(before.bytes, 132, 36);
	check(
		"Independent native inflate matches every pixel of the viewport crop",
		digest(decoded) === digest(expected),
	);
	check(
		"The union retains the page background between inline line boxes",
		decoded.subarray(16 * 132 * 4, 16 * 132 * 4 + 4).join(",") ===
			"0,0,128,255",
	);
	const saved = await saveCapture(
		parseInvocation(["screenshot", "#target", `--filename=${filename}`]),
		command,
	);
	const savedBytes = await readFile(saved.filename);
	check(
		"The CLI writer saves the same target PNG as a private file",
		digest(savedBytes) === digest(before.bytes) &&
			((await stat(saved.filename)).mode & 0o777) === 0o600,
	);
	await evaluate(
		'document.getElementById("target").addEventListener("click", function() { const target = document.getElementById("target"); target.textContent = "native"; target.style.backgroundColor = "maroon"; });',
	);
	await command(["click", "#target"]);
	check(
		"An interpreted event changes the real target bounds",
		(await evaluate(
			'document.getElementById("target").getBoundingClientRect().width === 72 && document.getElementById("target").getBoundingClientRect().height === 16',
		)) === true,
	);
	const after = await capturePng(command, geometry.reference);
	check(
		"The same stable reference captures the new layout and colors",
		after.artifact.width === 72 &&
			after.artifact.height === 16 &&
			digest(after.bytes) !== digest(before.bytes),
	);
	check(
		"The changed capture contains the guest-selected background",
		pixels(after.bytes, 72, 16).subarray(0, 4).join(",") === "128,0,0,255",
	);
	check(
		"The saved old artifact remains independent of later page mutation",
		digest(await readFile(saved.filename)) === digest(before.bytes),
	);
	check(
		"Downloads stay bounded and release server-owned artifact bytes",
		Math.max(...frames) < 100_000 &&
			before.released &&
			after.released &&
			saved.remoteCleanupConfirmed &&
			host.metrics().captureArtifacts.bytes === 0,
	);
	artifact = {
		filename: saved.filename,
		width: 132,
		height: 36,
		bytes: savedBytes.length,
		sha256: digest(savedBytes),
		pixelsSha256: digest(decoded),
		after: {
			width: after.artifact.width,
			height: after.artifact.height,
			bytes: after.bytes.length,
		},
		maxFrameBytes: Math.max(...frames),
	};
	completed = true;
} finally {
	for (const owner of owners.values()) await owner.close();
	host.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				runtime:
					"existing explicitly selected experimental SafeJS core, not released-SDK acceptance",
				fixture:
					"in-memory HTML, framed commands and local private PNG; no websites or live sockets",
				completed,
				checks,
				artifact,
			},
			null,
			2,
		),
	);
}
