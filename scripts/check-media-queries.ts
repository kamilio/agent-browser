import { createHash } from "node:crypto";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { encodePng } from "../src/png.js";
import { renderSnapshot, snapshotDocument } from "../src/snapshot.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>main{font-size:8px;color:white;background:red}@media (max-width:3em){main{background:blue}}</style><main id="status">wide</main>',
	"https://fixture.invalid/media-queries",
);
const styles = documentStyles(tree);
styles.setViewport(80, 40);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
let artifacts: unknown;
let initialState: unknown;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
async function idle() {
	const deadline = Date.now() + 2000;
	while (page.metrics().media?.queued || page.metrics().media?.running) {
		if (Date.now() >= deadline)
			throw new Error("Media event delivery did not become idle");
		await new Promise<void>((resolve) => setTimeout(resolve, 5));
	}
	if (page.metrics().closed)
		throw new Error("Page closed during media delivery");
}
function digest(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}
try {
	const initial = await page.evaluate(
		'var target = document.getElementById("status"); var narrow = matchMedia("(max-width:3em)"); var portrait = window.matchMedia("(orientation:portrait)"); var trace = []; var legacy = 0; var once = 0; var kept = null; return [matchMedia === window.matchMedia, narrow.matches, portrait.matches, narrow.media, window.innerWidth, window.innerHeight];',
	);
	initialState = initial;
	checks.push({
		label:
			"Global and Window matchMedia have identical interpreted function identity",
		passed:
			initial.ok && Array.isArray(initial.value) && initial.value[0] === true,
	});
	check(
		"Global and Window entry points read the same live query and viewport state",
		initial.ok &&
			Array.isArray(initial.value) &&
			JSON.stringify(initial.value.slice(1)) ===
				JSON.stringify([false, false, "(max-width: 3em)", 80, 40]),
	);
	await guest(
		"Register real interpreted resize, change, legacy and once listeners",
		'var validTargets = true; window.onresize = function() { validTargets = validTargets && this === window; trace.push("resize:" + window.innerWidth); }; narrow.onchange = function(event) { kept = event; target.textContent = event.matches ? "narrow" : "wide"; trace.push("change:" + event.matches); validTargets = validTargets && this === narrow && event.target === narrow && event.currentTarget === narrow && event.type === "change" && event.media === narrow.media; }; var legacyListener = function() { legacy++; }; narrow.addListener(legacyListener); narrow.addEventListener("change", legacyListener); narrow.addEventListener("change", function() { once++; }, {once:true}); return narrow.onchange !== null;',
	);
	const before = encodePng(rasterizeDocument(tree).image);
	styles.setViewport(45, 80);
	styles.setViewport(40, 80);
	await idle();
	await guest(
		"Coalesced resize precedes the real change callback and mutates DOM",
		'return validTargets && trace.join("|") === "resize:40|change:true" && target.textContent === "narrow" && legacy === 1 && once === 1 && narrow.matches && portrait.matches && window.innerWidth === 40 && window.innerHeight === 80;',
	);
	check(
		"Agent snapshot sees responsive guest content",
		renderSnapshot(snapshotDocument(tree)).includes("narrow"),
	);
	const image = rasterizeDocument(tree).image;
	check(
		"The same media environment selects the actual native CSS background",
		image.width === 40 &&
			image.height === 80 &&
			image.pixels[0] === 0 &&
			image.pixels[1] === 0 &&
			image.pixels[2] === 255,
	);
	const after = encodePng(image);
	check(
		"Responsive DOM and CSS change actual native PNG output",
		digest(before) !== digest(after),
	);
	await guest(
		"Saved event has native post-dispatch state and immutable change data",
		"return kept.matches === true && kept.media === narrow.media && kept.target === narrow && kept.currentTarget === null && kept.eventPhase === 0 && kept.composedPath().length === 0 && !kept.bubbles && !kept.cancelable;",
	);
	styles.setViewport(35, 80);
	await idle();
	await guest(
		"Same matching result produces resize but not duplicate change",
		'return trace.join("|") === "resize:40|change:true|resize:35" && legacy === 1 && once === 1;',
	);
	await guest(
		"Legacy removal and onchange replacement use the same owned event engine",
		'narrow.removeEventListener("change", legacyListener); narrow.onchange = function(event) { target.textContent = event.matches ? "narrow" : "wide"; trace.push("replacement:" + event.matches); }; return narrow.onchange !== null;',
	);
	styles.setViewport(80, 40);
	await idle();
	await guest(
		"Restored viewport triggers replacement once without removed or once listeners",
		'return target.textContent === "wide" && legacy === 1 && once === 1 && !narrow.matches && !portrait.matches && trace.join("|") === "resize:40|change:true|resize:35|resize:80|replacement:false";',
	);
	check(
		"Restoring viewport and content restores the identical native PNG",
		digest(before) === digest(encodePng(rasterizeDocument(tree).image)),
	);
	await guest(
		"Invalid queries and readonly values are bounded capabilities",
		'var invalid = matchMedia("invalid"); var readonly = false; try { narrow.matches = true; } catch(error) { readonly = true; } return readonly && !narrow.matches && invalid.media === "not all" && !invalid.matches && matchMedia("print, screen").matches;',
	);
	artifacts = {
		wide: { bytes: before.length, sha256: digest(before) },
		narrow: { bytes: after.length, sha256: digest(after) },
	};
	styles.setViewport(40, 80);
	await page.close();
	tree.close();
	check(
		"Closing the page cancels queued media work and releases list records",
		page.metrics().closed &&
			page.metrics().media?.closed === true &&
			page.metrics().media?.lists === 0 &&
			page.metrics().media?.queued === false,
	);
	passed = checks.every((entry) => entry.passed);
	if (!passed) process.exitCode = 1;
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
				initialState,
				artifacts,
				page: page.metrics(),
			},
			null,
			2,
		),
	);
}
