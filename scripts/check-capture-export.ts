import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { capturePng } from "../src/capture-client.js";
import { parseInvocation } from "../src/cli-parser.js";
import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { saveCapture } from "../src/node-capture.js";
import { loadPlaygroundAssets } from "../src/node-playground-assets.js";
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
const sizes: number[] = [];
let completed = false;
let artifact: Record<string, unknown> | undefined;
const markup =
	'<body style="background-color:#101827;color:#dce6ff"><main style="margin:32px auto;width:80%;font-size:16px"><header style="background-color:#24324b;padding:20px"><h1 style="font-size:24px;color:#91bfff;margin-bottom:12px">Agent browser PNG export</h1><p>Own document engine. Actual CLI artifact path.<br>No Chromium, Firefox or remote renderer.</p></header><section id="panel" style="margin-top:20px;padding:20px;background-color:#24324b"><p id="trigger" style="color:aquamarine">Interpreted click changed this background.</p><p style="margin-top:12px">This capture crosses the command protocol<br>in bounded chunks, then saves as a private PNG.</p></section><p style="margin-top:20px;font-size:12px">Partial normal-flow CSS. Built-in pixel font.<br>PNG bytes are real; full browser compatibility remains open.</p></main></body>';
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
const execute = async (argv: readonly string[]) => {
	const response = await host.execute(argv);
	const frame = scriptFrame({ result: response });
	sizes.push(Buffer.byteLength(frame));
	return JSON.parse(frame).result;
};
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
const digest = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");
try {
	await execute(["open", "https://fixture.invalid/capture-export"]);
	await execute(["resize", "1024", "768"]);
	const before = await capturePng(execute);
	check(
		"A real native PNG transfers through bounded protocol frames",
		before.bytes.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10" &&
			Math.max(...sizes) < 100_000,
	);
	const evaluation = (
		await execute([
			"eval",
			'document.getElementById("trigger").addEventListener("click", function() { document.getElementById("panel").style.backgroundColor = "#205343"; });',
		])
	).data as ScriptEvaluation;
	check(
		"The actual experimental core installs the page click handler",
		evaluation.ok,
	);
	await execute(["click", "#trigger"]);
	const after = await capturePng(execute);
	check(
		"Interpreted mutation changes the transferred PNG pixels",
		digest(before.bytes) !== digest(after.bytes),
	);
	const saved = await saveCapture(
		parseInvocation(["screenshot", `--filename=${filename}`, "--hires"]),
		execute,
	);
	const bytes = await readFile(saved.filename);
	check(
		"The same CLI client writer atomically exports the current native PNG",
		digest(bytes) === digest(after.bytes) &&
			saved.artifact.mediaType === "image/png" &&
			saved.artifact.deviceScaleFactor === 1 &&
			saved.artifact.hires,
	);
	check(
		"Successful downloads release retained server artifacts",
		saved.remoteCleanupConfirmed && host.metrics().captureArtifacts.bytes === 0,
	);
	const element = await capturePng(execute, "#panel");
	check(
		"A selector-targeted block capture reports a smaller real document clip",
		element.artifact.target !== null &&
			element.artifact.width < 1024 &&
			element.artifact.height < 768 &&
			element.artifact.clip.y > 0,
	);
	await execute(["resize", "320", "480"]);
	const narrow = await capturePng(execute);
	check(
		"Resize changes exported native PNG dimensions",
		narrow.artifact.width === 320 && narrow.artifact.height === 480,
	);
	const assets = await loadPlaygroundAssets();
	check(
		"Built playground assets include every runtime import used by PNG preview",
		assets.script.includes('"./capture-client.js"') &&
			assets.captureClient.includes('"./capture-artifacts.js"') &&
			assets.captureArtifacts.includes('"./errors.js"') &&
			assets.errors.includes("AgentBrowserError") &&
			assets.html.includes('id="render-image"'),
	);
	if (saved.artifact.mediaType !== "image/png")
		throw new Error("Expected a PNG export");
	artifact = {
		filename: saved.filename,
		bytes: bytes.length,
		sha256: digest(bytes),
		width: saved.artifact.width,
		height: saved.artifact.height,
		maximumFrameBytes: Math.max(...sizes),
		frames: sizes.length,
	};
	host.close();
	for (const owner of owners.values()) await owner.close();
	check(
		"Closing the host releases artifacts and interpreted realms",
		host.metrics().captureArtifacts.bytes === 0 &&
			[...owners.values()].every((owner) => owner.closed),
	);
	completed = true;
} finally {
	host.close();
	for (const owner of owners.values()) await owner.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"existing-experimental-core-in-memory-command-frame-capture-and-cli-writer",
				realWebsite: false,
				liveSocket: false,
				livePlayground: false,
				releasedSdk: false,
				completed,
				passed: checks.filter((check) => check.passed).length,
				checks,
				artifact,
			},
			null,
			2,
		),
	);
}
