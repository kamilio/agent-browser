import { createHash } from "node:crypto";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>html,body{margin:0}main{width:20px;font-size:8px;line-height:12px}a{border:1px solid red;color:transparent}</style><main id="main"><a id="target" href="/next">ab cd ef</a></main>',
	"https://fixture.invalid/inline-borders",
);
documentStyles(tree).setViewport(100, 80);
const interactions = documentInteractions(tree);
const page = new PageScripts({ document: tree, interactions }, core);
const checks: { label: string; passed: boolean }[] = [];
const captures: { label: string; sha256: string; borderPixels: number }[] = [];
let passed = false;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
function capture(label: string) {
	const raster = rasterizeDocument(tree);
	captures.push({
		label,
		sha256: createHash("sha256").update(raster.image.pixels).digest("hex"),
		borderPixels: raster.metrics.borderPixels,
	});
	return raster;
}
try {
	await guest(
		"Guest receives the three actual wrapped border rectangles",
		'var target=document.getElementById("target"); var main=document.getElementById("main"); var saved=target.getClientRects(); return saved.length===3 && saved[0].x===0 && saved[0].y===1 && saved[0].width===13 && saved[1].y===13 && saved[1].width===12 && saved[2].y===25 && saved[2].width===13;',
	);
	await guest(
		"Guest inline client and offset dimensions distinguish borders from content",
		"return target.clientWidth===0 && target.clientHeight===0 && target.clientLeft===1 && target.clientTop===1 && target.offsetWidth===13 && target.offsetHeight===34;",
	);
	const raster = capture("wrapped");
	const pixel = (column: number, row: number) =>
		Array.from(
			raster.image.pixels.slice(
				(row * raster.image.width + column) * 4,
				(row * raster.image.width + column) * 4 + 4,
			),
		).join(",");
	check(
		"Actual pixels leave continuation sides open while retaining the outer borders",
		pixel(0, 5) === "255,0,0,255" &&
			pixel(12, 5) === "255,255,255,255" &&
			pixel(0, 17) === "255,255,255,255" &&
			pixel(12, 29) === "255,0,0,255",
	);
	await guest(
		"Guest hit testing shares border rectangles and excludes the gap",
		'var clicks=0; target.addEventListener("click",function(event){clicks++;event.preventDefault();}); return document.elementFromPoint(0.5,5)===target && document.elementFromPoint(12.5,29)===target && document.elementFromPoint(5,12)!==target;',
	);
	await interactions.mouse.moveAsync(0.5, 5);
	await interactions.mouse.downAsync();
	await interactions.mouse.upAsync();
	await guest(
		"Native pointer actions on a border reach the guest listener",
		"return clicks===1;",
	);
	await guest(
		"Changing border width refreshes live geometry without mutating saved rectangles",
		'target.style.borderWidth="3px"; var changed=target.getClientRects(); return changed.length===3 && changed[0].width===15 && changed[1].width===12 && changed[2].width===15 && target.clientLeft===3 && saved[0].width===13;',
	);
	await guest(
		"Widening the containing block rejoins the inline into one bordered fragment",
		'main.style.width="60px"; return target.getClientRects().length===1 && target.offsetWidth===54 && target.offsetHeight===14;',
	);
	await guest(
		"Current computed border colors remain live after reflow",
		'target.style.borderColor="blue"; return getComputedStyle(target).borderLeftColor==="rgb(0, 0, 255)";',
	);
	capture("joined-blue");
	check(
		"Reflow and style mutation change the actual rendered pixels",
		captures[0].sha256 !== captures[1].sha256,
	);
	await guest(
		"Hiding the inline clears geometry and hit regions",
		'target.style.display="none"; return target.getClientRects().length===0 && target.clientLeft===0 && document.elementFromPoint(1,5)!==target;',
	);
	await guest(
		"Restoring the inline recreates current geometry, not stale slices",
		'target.style.display="inline"; return target.getClientRects().length===1 && target.offsetWidth===54 && saved.length===3;',
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
				passed,
				checks,
				captures,
				page: page.metrics(),
				fixture:
					"parsed in-memory document; no network, sockets or external browser",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"LTR sliced inline borders; clone, bidi, vertical writing, radius and broader fragmentation remain open",
			},
			null,
			2,
		),
	);
}
