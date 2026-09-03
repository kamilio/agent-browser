import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { BrowserCommandHost } from "../src/command-host.js";
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
let completed = false;
let artifact: Record<string, unknown> | undefined;
const markup = `<html style="color:#dce6ff"><body style="background-color:#101827"><main style="width:87.5%;max-width:560px;margin:24px auto;font-size:16px"><header style="padding:16px;background-color:#24324b"><h1 style="font-size:24px;line-height:1.2;margin-bottom:12px;color:#91bfff">Native CSS paint</h1><p>Actual document geometry.<br>Own TypeScript raster. No browser engine.</p></header><section id="panel" style="margin-top:20px;padding:16px;background-color:#283348"><p id="trigger" style="color:#f4cc6b;margin-bottom:12px">Click handler changed this panel.</p><p>Inherited foreground and <span style="color:#ffffff;background-color:#00000060">alpha inline backgrounds</span> follow wrapped text.</p><p style="margin-top:12px;font-size:12px;color:#b7ffdc">RGB, HSL, named colors and currentcolor.</p></section><section style="margin-top:20px;padding:12px;background-color:#ffffff12"><p style="font-size:12px">Block backgrounds paint before text.<br>Inline fragments paint around their glyphs.<br>Canvas color extends beyond the document.</p></section><p style="font-size:12px;margin-top:20px;color:#abb9d1">Partial normal-flow profile, not full CSS.<br>No images, borders, flex, grid or web fonts.</p></main></body></html>`;
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
				current = parseHtmlDocument(markup, response.url, {
					limits: context.limits,
					signal: context.signal,
				});
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
async function evaluate(source: string) {
	const result = (await host.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok) throw new Error("Interpreted CSS paint fixture failed");
	return result.value;
}
const digest = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");
try {
	await host.execute(["open", "https://fixture.invalid/css-paint"]);
	await host.execute(["resize", "640", "600"]);
	const before = rasterizeDocument(document());
	check(
		"Native canvas uses the propagated body background",
		JSON.stringify(before.canvasBackground.color) === "[16,24,39,255]",
	);
	check(
		"Actual document paints colored blocks, inline fragments and text",
		before.metrics.paintedBackgrounds > 4 &&
			before.metrics.inlineFragments > 0 &&
			before.metrics.paintedGlyphs > 200,
	);
	await evaluate(
		'document.getElementById("trigger").addEventListener("click", function() { document.getElementById("panel").style.backgroundColor = "hsl(160 40% 22%)"; document.getElementById("trigger").style.color = "#7fffd4"; });',
	);
	await host.execute(["click", "#trigger"]);
	const after = rasterizeDocument(document());
	check(
		"An interpreted click changes the real raster without moving geometry",
		digest(before.image.pixels) !== digest(after.image.pixels) &&
			before.layout.flowHeight === after.layout.flowHeight,
	);
	check(
		"Interpreted style getters serialize the shared color grammar",
		(await evaluate('document.getElementById("trigger").style.color')) ===
			"rgb(127, 255, 212)",
	);
	const inspection = (await host.execute(["styles", "#trigger"])).data as {
		paint?: { color?: unknown };
	};
	check(
		"Agent style inspection exposes the same resolved foreground",
		JSON.stringify(inspection.paint?.color) === "[127,255,212,255]",
	);
	const revision = document().revision;
	rasterizeDocument(document());
	check("Painting is observational", document().revision === revision);
	const crop = rasterizeDocument(document(), {
		clip: { x: 0, y: 80, width: 640, height: 120 },
	});
	check(
		"A document crop matches the full colored viewport",
		digest(crop.image.pixels) ===
			digest(after.image.pixels.subarray(80 * 640 * 4, 200 * 640 * 4)),
	);
	await host.execute(["resize", "320", "600"]);
	const narrow = rasterizeDocument(document());
	check(
		"Resize reflows the document while preserving painted inline fragments",
		narrow.image.width === 320 &&
			narrow.layout.metrics.lines > after.layout.metrics.lines &&
			narrow.metrics.inlineFragments > 0,
	);
	await host.execute(["resize", "640", "600"]);
	await evaluate(
		'document.getElementById("panel").style.backgroundColor = "not-a-color";',
	);
	check(
		"Invalid style setters preserve the accepted paint declaration",
		digest(rasterizeDocument(document()).image.pixels) ===
			digest(after.image.pixels),
	);
	await evaluate(
		'document.getElementById("panel").style.position = "absolute";',
	);
	let unsupported = false;
	try {
		rasterizeDocument(document());
	} catch {
		unsupported = true;
	}
	check("Unsupported layout still fails closed", unsupported);
	await evaluate(
		'document.getElementById("panel").style.removeProperty("position");',
	);
	let limited = false;
	try {
		rasterizeDocument(document(), { maxWork: 1 });
	} catch {
		limited = true;
	}
	const restored = rasterizeDocument(document());
	check(
		"Paint budget exhaustion preserves the document and subsequent capture",
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
		metrics: restored.metrics,
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
		"Close revokes new captures without revoking caller-owned pixels",
		revoked &&
			[...owners.values()].every((owner) => owner.closed) &&
			digest(encodePng(restored.image)) === digest(png),
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
				scope: "existing-experimental-core-in-memory-css-paint",
				realWebsite: false,
				releasedSdk: false,
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
