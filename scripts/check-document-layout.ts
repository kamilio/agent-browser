import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { BrowserCommandHost } from "../src/command-host.js";
import { type DocumentBox, layoutDocument } from "../src/document-layout.js";
import { rasterizeDocument } from "../src/document-raster.js";
import type { DocumentTree } from "../src/document.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { encodePng } from "../src/png.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const output = process.argv[2];
if (!output || process.argv.length !== 3)
	throw new Error("Provide one PNG output path");
const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const checks: { label: string; passed: boolean }[] = [];
let current: DocumentTree | undefined;
let artifact:
	| {
			output: string;
			bytes: number;
			sha256: string;
			width: number;
			height: number;
	  }
	| undefined;
let completed = false;
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
			loadDocument: (response, context) => {
				current = parseHtmlDocument(
					'<main id="page" style="width:87.5%;max-width:560px;margin:24px auto;font-size:16px"><header style="padding-bottom:8px"><h1 style="font-size:24px;line-height:1.2;margin-bottom:12px">Native document layout</h1><p>Actual blocks, lines and glyphs.<br>No manually positioned demonstration panels.</p></header><section id="section" style="margin-top:24px;padding-left:12px"><p id="first" style="margin:12px 0 28px">First block: height changes after a click.</p><p id="second" style="margin:20px 0 12px">Second block follows the first. Their adjoining margins collapse to 28px.</p><pre style="font-size:12px;margin-top:16px">name\tvalue\nwidth\t87.5%\nheight\t80px</pre></section><div style="display:flow-root;margin-top:20px"><span id="trigger" role="button" tabindex="0" style="font-size:12px">[ Change block height ]</span></div><footer style="font-size:12px;margin-top:18px">Independent TypeScript engine / Agent Mono<br>Restricted text-only paint, not full CSS.</footer></main>',
					response.url,
					{ limits: context.limits, signal: context.signal },
				);
				return current;
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
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
function document() {
	if (!current) throw new Error("Missing fixture document");
	return current;
}
function box(id: string): Readonly<DocumentBox> {
	const tree = document();
	const value = layoutDocument(tree).boxes.find(
		(entry) => entry.ref && tree.resolve(entry.ref).attributes.id === id,
	);
	if (!value) throw new Error(`Missing box ${id}`);
	return value;
}
async function evaluate(source: string) {
	const result = (await host.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok) throw new Error("Interpreted document fixture failed");
	return result.value;
}
const digest = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");
try {
	await host.execute(["open", "https://fixture.invalid/document-layout"]);
	await host.execute(["resize", "640", "600"]);
	const initial = rasterizeDocument(document());
	const first = box("first");
	const second = box("second");
	check(
		"Percentage widths and auto margins position the real document horizontally",
		box("page").contentWidth === 560 && box("page").borderX === 40,
	);
	check(
		"Adjacent authored margins collapse to one measured gap",
		second.borderY - first.borderY - first.borderBoxHeight === 28,
	);
	check(
		"Native raster uses actual document-positioned glyphs without manual placement",
		initial.metrics.paintedGlyphs > 100 &&
			initial.layout.contexts.some((context) => context.contentY > 200) &&
			initial.image.width === 640,
	);
	await evaluate(
		'document.getElementById("trigger").addEventListener("click", function() { document.getElementById("first").style.height = "80px"; });',
	);
	await host.execute(["click", "#trigger"]);
	const after = rasterizeDocument(document());
	check(
		"An actual interpreted click changes used height and shifts following blocks",
		box("first").contentHeight === 80 &&
			box("second").borderY === second.borderY + 80 - first.contentHeight,
	);
	check(
		"Document-coordinate changes alter the actual pixel output",
		digest(initial.image.pixels) !== digest(after.image.pixels),
	);
	const revision = document().revision;
	layoutDocument(document());
	rasterizeDocument(document());
	check(
		"Geometry and painting are observational",
		document().revision === revision,
	);
	const clipTop = Math.floor(box("second").borderY);
	const crop = rasterizeDocument(document(), {
		clip: { x: 0, y: clipTop, width: 640, height: 60 },
	});
	check(
		"A document-coordinate crop matches the corresponding viewport pixels",
		digest(crop.image.pixels) ===
			digest(
				after.image.pixels.subarray(
					clipTop * 640 * 4,
					(clipTop + 60) * 640 * 4,
				),
			),
	);
	await host.execute(["resize", "320", "600"]);
	const narrow = rasterizeDocument(document());
	check(
		"Resize recomputes wrapping, used heights and native pixel dimensions",
		narrow.image.width === 320 &&
			box("page").contentWidth === 280 &&
			narrow.layout.metrics.lines > after.layout.metrics.lines,
	);
	await host.execute(["resize", "640", "600"]);
	await evaluate(
		'document.getElementById("first").style.position = "absolute";',
	);
	let unsupported = false;
	try {
		rasterizeDocument(document());
	} catch {
		unsupported = true;
	}
	check(
		"Unsupported positioning fails closed rather than producing a misleading capture",
		unsupported,
	);
	await evaluate(
		'document.getElementById("first").style.removeProperty("position");',
	);
	let limited = false;
	try {
		rasterizeDocument(document(), { maxWork: 1 });
	} catch {
		limited = true;
	}
	const restored = rasterizeDocument(document());
	check(
		"A paint-budget failure leaves the document and subsequent output intact",
		limited && digest(restored.image.pixels) === digest(after.image.pixels),
	);
	const png = encodePng(restored.image);
	writeFileSync(output, png);
	artifact = {
		output,
		bytes: png.length,
		sha256: digest(png),
		width: restored.image.width,
		height: restored.image.height,
	};
	host.close();
	for (const owner of owners.values()) await owner.close();
	let revoked = false;
	try {
		rasterizeDocument(document());
	} catch {
		revoked = true;
	}
	check(
		"Closing the source revokes fresh layout/paint while retained output remains usable",
		revoked &&
			[...owners.values()].every((owner) => owner.closed) &&
			digest(encodePng(restored.image)) === artifact.sha256,
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
					"existing-experimental-core-in-memory-normal-flow-document-layout-and-native-text-paint",
				realWebsite: false,
				fullCssPainting: false,
				manualPanelPlacement: false,
				completed,
				passed: checks.filter((entry) => entry.passed).length,
				checks,
				artifact,
			},
			null,
			2,
		),
	);
}
