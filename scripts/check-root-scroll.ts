import { createHash } from "node:crypto";
import { documentGeometry } from "../src/document-geometry.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { documentScroll } from "../src/document-scroll.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<!doctype html><style>html,body{margin:0;padding:0}main{width:160px;height:240px}#top{height:100px;background:red}#bottom{height:100px;background:blue}</style><main id="main"><div id="top">Top</div><div id="bottom">Bottom</div></main>',
	"https://fixture.invalid/root-scroll",
);
const styles = documentStyles(tree);
styles.setViewport(100, 80);
const interactions = documentInteractions(tree);
const page = new PageScripts({ document: tree, interactions }, core);
const scroll = documentScroll(tree);
const checks: { label: string; passed: boolean }[] = [];
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
async function settle() {
	for (let attempt = 0; attempt < 200; attempt++) {
		const metrics = page.metrics().scrolling;
		if (!metrics?.pending && !metrics?.queued && !metrics?.running) return;
		await new Promise<void>((resolve) => setTimeout(resolve, 5));
	}
	throw new Error("Programmatic scroll notifications did not settle");
}
const pixels = () =>
	createHash("sha256")
		.update(rasterizeDocument(tree).image.pixels)
		.digest("hex");
try {
	await guest(
		"Guest root identity and native document extents",
		`
		var root = document.scrollingElement; var bottom = document.getElementById("bottom"); var saved = bottom.getBoundingClientRect();
		var scrolls = 0; var windowScrolls = 0; var lastTop = null;
		document.addEventListener("scroll", function(event) { scrolls++; lastTop = root.scrollTop; });
		window.addEventListener("scroll", function() { windowScrolls++; });
		return root === document.documentElement && root.scrollWidth === 160 && root.scrollHeight === 240 && root.scrollTop === 0 && root.scrollLeft === 0;
	`,
	);
	const before = pixels();
	await guest(
		"Setters update live offsets and geometry synchronously",
		"root.scrollLeft = 12.5; root.scrollTop = 40.25; return root.scrollLeft === 12.5 && root.scrollTop === 40.25 && window.scrollX === 12.5 && window.scrollY === 40.25 && bottom.getBoundingClientRect().y === 59.75 && saved.y === 100 && scrolls === 0;",
	);
	check(
		"Native viewport and software pixels share the guest assignments",
		scroll.get().x === 12.5 && scroll.get().y === 40.25 && pixels() !== before,
	);
	await settle();
	await guest(
		"Root setters share one coalesced document notification",
		"return scrolls === 1 && windowScrolls === 1 && lastTop === 40.25;",
	);
	await guest(
		"Window requests and property setters coalesce within a source",
		"root.scrollTop = 50; window.scrollBy(0, 10); root.scrollTop = 70; return root.scrollTop === 70 && root.scrollHeight === 240;",
	);
	await settle();
	await guest(
		"Mixed programmatic writes use the existing notification owner",
		"return scrolls === 2 && lastTop === 70 && windowScrolls === 2;",
	);
	await guest(
		"Undefined assignment normalizes to zero while preserving the other axis",
		"root.scrollTop = undefined; return root.scrollTop === 0 && root.scrollLeft === 12.5;",
	);
	await settle();
	await guest(
		"Huge and negative primitive values clamp without overflowing layout",
		"root.scrollTop = 1e300; root.scrollLeft = -1e300; return root.scrollTop === 160 && root.scrollLeft === 0;",
	);
	await settle();
	await guest(
		"Body metrics describe visible content without aliasing the viewport position",
		"document.body.scrollTop = 20; return document.body.scrollHeight === 240 && document.body.scrollWidth === 160 && document.body.scrollTop === 0 && root.scrollTop === 160;",
	);
	await guest(
		"Detached elements remain unscrolled and have zero extents",
		'var detached = document.createElement("div"); detached.scrollTop = 20; return detached.scrollTop === 0 && detached.scrollLeft === 0 && detached.scrollHeight === 0 && detached.scrollWidth === 0;',
	);
	await guest(
		"Native keyboard changes are observed by saved root references",
		"return root === document.scrollingElement;",
	);
	await interactions.keyboard.pressAsync("Home");
	await guest(
		"Keyboard and DOM properties share one root position",
		"return root.scrollTop === 0 && window.scrollY === 0;",
	);
	styles.setViewport(200, 300);
	await guest(
		"Root extents update after viewport resize",
		"return root.scrollWidth === 200 && root.scrollHeight === 300;",
	);
	await guest(
		"Guest layout mutation updates root scroll extent",
		'document.getElementById("main").style.height = "500px"; root.scrollTop = root.scrollHeight; return root.scrollHeight === 500 && root.scrollTop === 200;',
	);
	check(
		"Native geometry observes the guest extent-based scroll",
		documentGeometry(tree).getBoundingClientRect(
			tree
				.get(tree.root)
				.children.find((id) => tree.get(id).kind === "element") as number,
		).y === -200,
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
				scroll: scroll.metrics(),
				page: page.metrics(),
				fixture:
					"actual interpreted property bindings with native geometry, pixels and events; in-memory only",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Standards-profile root plus normal-flow visible-overflow element metrics; no quirks mode, control or nested scrolling; existing event-loop and throughput gates remain",
			},
			null,
			2,
		),
	);
}
