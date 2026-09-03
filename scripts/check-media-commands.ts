import { createHash } from "node:crypto";
import { capturePng } from "../src/capture-client.js";
import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { scriptFrame } from "../src/node-script-protocol.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
let maximumFrameBytes = 0;
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
			loadDocument: (response) =>
				parseHtmlDocument(
					'<style>main{font-size:8px;color:white;background:red}@media (0px < width <= 48px) and ((aspect-ratio < 1) or (resolution > 2dppx)){main{background:blue}}</style><main id="status">wide</main>',
					response.url,
				),
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
async function command(argv: readonly string[]) {
	const result = await host.execute(argv);
	const frame = scriptFrame({ result });
	maximumFrameBytes = Math.max(maximumFrameBytes, Buffer.byteLength(frame));
	return (JSON.parse(frame) as { result: typeof result }).result;
}
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function evaluate(source: string) {
	const result = (await command(["eval", source])).data as ScriptEvaluation;
	if (!result.ok) throw new Error("Media command evaluation failed");
	return result.value;
}
async function idle() {
	const deadline = Date.now() + 2000;
	while (
		[...owners.values()].some(
			(owner) =>
				owner.metrics().media?.queued || owner.metrics().media?.running,
		)
	) {
		if (Date.now() >= deadline)
			throw new Error("Media command delivery did not become idle");
		await new Promise<void>((resolve) => setTimeout(resolve, 5));
	}
}
function digest(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}
try {
	await command(["open", "https://fixture.invalid/media-commands"]);
	await command(["resize", "80", "40"]);
	const viewport = (await command(["viewport"])).data as {
		tabId: string;
		key: string;
		width: number;
		height: number;
		deviceScaleFactor: number;
	};
	check(
		"Read-only viewport inspection reports the active tab and actual logical dimensions",
		typeof viewport.tabId === "string" &&
			viewport.width === 80 &&
			viewport.height === 40 &&
			viewport.deviceScaleFactor === 1,
	);
	check(
		"Agent eval installs real responsive page handlers",
		(await evaluate(
			'var count = 0; var resizeCount = 0; var media = matchMedia("(0px < width <= 48px) and ((aspect-ratio < 1) or (resolution > 2dppx))"); media.onchange = function(event) { count++; document.getElementById("status").textContent = event.matches ? "narrow" : "wide"; }; window.onresize = function() { resizeCount++; }; return !media.matches && window.innerWidth === 80;',
		)) === true,
	);
	const before = await capturePng(command);
	check(
		"Interpreted page code sees grouped alternatives, initial-font units and native resolution",
		(await evaluate(
			'return matchMedia("(width >= 80px) or (height > 999px)").matches && matchMedia("(resolution = 1dppx)").matches && matchMedia("(min-aspect-ratio: 2/1)").matches && matchMedia("(width = 5em)").matches;',
		)) === true,
	);
	const resized = await command([
		"resize",
		"40",
		"80",
		`--expected-viewport=${viewport.key}`,
	]);
	check(
		"Existing resize command changes the page viewport",
		JSON.stringify(resized.data).includes('"width":40'),
	);
	await idle();
	check(
		"Agent eval observes the real resize and media callback results",
		(await evaluate(
			'return media.matches && window.innerWidth === 40 && window.innerHeight === 80 && count === 1 && resizeCount === 1 && document.getElementById("status").textContent === "narrow";',
		)) === true,
	);
	check(
		"Agent snapshot exports responsive guest content",
		JSON.stringify((await command(["snapshot"])).data).includes("narrow"),
	);
	const after = await capturePng(command);
	check(
		"Chunked screenshot command exports changed native pixels",
		after.artifact.width === 40 &&
			after.artifact.height === 80 &&
			digest(before.bytes) !== digest(after.bytes),
	);
	await command(["resize", "80", "40"]);
	await idle();
	check(
		"Reverse resize triggers the same interpreted listener again",
		(await evaluate(
			'return !media.matches && count === 2 && resizeCount === 2 && document.getElementById("status").textContent === "wide";',
		)) === true,
	);
	check(
		"Agent screenshot returns to identical original bytes",
		digest(before.bytes) === digest((await capturePng(command)).bytes),
	);
	await command(["resize", "40", "80"]);
	await command(["close"]);
	check(
		"Session close cancels queued media work and revokes actual page owners",
		[...owners.values()].every(
			(owner) =>
				owner.closed &&
				owner.metrics().media?.closed &&
				owner.metrics().media?.lists === 0,
		),
	);
	check(
		"Every actual command response fits the bounded JSON protocol frame",
		maximumFrameBytes < 100_000,
	);
	passed = true;
} finally {
	await host.close();
	await Promise.all([...owners.values()].map((owner) => owner.close()));
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				fixture:
					"production agent commands over in-memory mocked transport; no network or sockets",
				runtime:
					"explicit existing experimental SafeJS core, not released-SDK or function-alias-identity acceptance",
				passed,
				checks,
				maximumFrameBytes,
				owners: [...owners.values()].map((owner) => owner.metrics()),
			},
			null,
			2,
		),
	);
}
