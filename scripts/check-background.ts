import { createHash } from "node:crypto";
import { renderDocumentPdf } from "../src/document-pdf.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { encodePng } from "../src/png.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>main{font-size:8px;color:blue;background:red}#target{width:12px;height:12px;background:none}</style><main><div id="target">A</div></main>',
	"https://fixture.invalid/background",
);
documentStyles(tree).setViewport(24, 24);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
let artifacts: unknown;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
function digest(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}
function pixel() {
	const image = rasterizeDocument(tree).image;
	const offset = (10 * image.width + 10) * 4;
	return Array.from(image.pixels.subarray(offset, offset + 4)).join(",");
}
try {
	check(
		"Authored shorthand paints the actual native parent background",
		pixel() === "255,0,0,255",
	);
	await guest(
		"Guest sees resolved background aliases and all neutral components",
		'var target = document.getElementById("target"); var computed = getComputedStyle(target); return computed.backgroundColor === "rgba(0, 0, 0, 0)" && computed.backgroundImage === "none" && computed.backgroundPosition === "0% 0%" && computed.backgroundSize === "auto" && computed.backgroundRepeat === "repeat" && computed.backgroundAttachment === "scroll" && computed.backgroundOrigin === "padding-box" && computed.backgroundClip === "border-box" && computed.length === 31;',
	);
	await guest(
		"Actual interpreted setter expands and resets eight inline components",
		'target.style.background = "currentcolor"; return target.style.length === 8 && target.style.background === "currentcolor" && target.style.backgroundImage === "none" && computed.backgroundColor === "rgb(0, 0, 255)";',
	);
	check(
		"Currentcolor shorthand changes native pixels",
		pixel() === "0,0,255,255",
	);
	const bluePng = encodePng(rasterizeDocument(tree).image);
	const bluePdf = renderDocumentPdf(tree).bytes;
	await guest(
		"Important shorthand participates in per-component cascade",
		'target.style.setProperty("background", "none red", "important"); return target.style.getPropertyPriority("background") === "important" && target.style.getPropertyPriority("background-image") === "important" && computed.backgroundColor === "rgb(255, 0, 0)";',
	);
	check(
		"Actual page mutation changes both PNG and PDF exports",
		digest(bluePng) !== digest(encodePng(rasterizeDocument(tree).image)) &&
			digest(bluePdf) !== digest(renderDocumentPdf(tree).bytes),
	);
	await guest(
		"Unsupported image setter does not partially mutate live style",
		'var before = target.style.cssText; target.style.background = "url(no-network.png) red"; return target.style.cssText === before && computed.backgroundImage === "none";',
	);
	await guest(
		"Removing shorthand removes every component and restores stylesheet cascade",
		'var removed = target.style.removeProperty("background"); return removed === "red" && target.style.length === 0 && computed.backgroundColor === "rgba(0, 0, 0, 0)";',
	);
	check(
		"Transparent child again reveals the native parent background",
		pixel() === "255,0,0,255",
	);
	await guest(
		"Shorthand inherit and unset preserve foreground and reset background",
		'target.style.background = "inherit"; var inherited = computed.backgroundColor === "rgb(255, 0, 0)"; target.style.background = "unset"; return inherited && computed.backgroundColor === "rgba(0, 0, 0, 0)" && computed.color === "rgb(0, 0, 255)";',
	);
	await guest(
		"Computed shorthand is live and read-only",
		'target.style.background = "blue"; var rejected = false; try { computed.background = "red"; } catch(error) { rejected = error.name === "NoModificationAllowedError"; } return rejected && computed.background === "rgb(0, 0, 255) none repeat scroll 0% 0% / auto padding-box border-box";',
	);
	check(
		"Restoring blue produces identical deterministic PNG and PDF bytes",
		digest(bluePng) === digest(encodePng(rasterizeDocument(tree).image)) &&
			digest(bluePdf) === digest(renderDocumentPdf(tree).bytes),
	);
	artifacts = {
		png: { bytes: bluePng.length, sha256: digest(bluePng) },
		pdf: { bytes: bluePdf.length, sha256: digest(bluePdf) },
	};
	await page.close();
	tree.close();
	check(
		"Page and document component owners close",
		page.metrics().closed && page.metrics().dom?.geometry.closed === true,
	);
	passed = true;
} finally {
	await page.close();
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				fixture:
					"in-memory HTML through production PageScripts; no network or sockets",
				runtime:
					"explicit existing experimental SafeJS core, not released-SDK acceptance",
				passed,
				checks,
				artifacts,
				page: page.metrics(),
			},
			null,
			2,
		),
	);
}
