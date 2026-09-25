import { documentElementScroll } from "../src/element-scroll.js";
import { documentScroll } from "../src/document-scroll.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<!doctype html><style>html,body{margin:0;padding:0}.target{width:200px;height:40px;padding-right:40px;padding-bottom:50px;border:1px solid}#direct>div{width:250px;height:150px}#nested>div{width:60px;height:30px}#nested>div>div{width:250px;height:150px}#text{width:10px;height:2px;padding:3px;font-size:8px;line-height:12px;white-space:nowrap}</style><div id="direct" class="target"><div></div></div><div id="nested" class="target"><div><div id="wide"></div></div></div><div id="text">abcdefghij</div><span id="inline">Inline</span><input id="control"><div style="height:500px"></div>',
	"https://fixture.invalid/element-scroll",
);
documentStyles(tree).setViewport(500, 400);
const interactions = documentInteractions(tree);
const page = new PageScripts({ document: tree, interactions }, core);
const metrics = documentElementScroll(tree);
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
		const state = page.metrics().scrolling;
		if (!state?.pending && !state?.queued && !state?.running) return;
		await new Promise<void>((resolve) => setTimeout(resolve, 5));
	}
	throw new Error("Scroll notifications did not settle");
}
try {
	await guest(
		"Actual guest reads direct visible overflow with trailing padding",
		'var direct = document.getElementById("direct"); var nested = document.getElementById("nested"); var root = document.scrollingElement; var notifications = 0; document.addEventListener("scroll", function() { notifications++; }); return direct.scrollWidth === 290 && direct.scrollHeight === 200 && direct.clientWidth === 240 && direct.clientHeight === 90;',
	);
	await guest(
		"Nested overflow does not receive padding from every ancestor",
		"return nested.scrollWidth === 250 && nested.scrollHeight === 150;",
	);
	await guest(
		"Text metrics use real line positions and bitmap advances",
		'var text = document.getElementById("text"); return text.scrollWidth === 66 && text.scrollHeight === 18;',
	);
	await guest(
		"Body extents are measurable without treating it as the viewport",
		"return document.body.scrollHeight > 400 && document.body.scrollWidth === 500 && document.body.scrollTop === 0;",
	);
	const builds = metrics.metrics().builds;
	await guest(
		"Repeated reads reuse native revision-scoped measurements",
		"return direct.scrollWidth === 290 && nested.scrollHeight === 150 && text.scrollHeight === 18;",
	);
	check(
		"No redundant native extent rebuild on repeated reads",
		metrics.metrics().builds === builds,
	);
	await guest(
		"Nonscrolling element setters are no-ops without root events",
		"direct.scrollTop = 100; direct.scrollLeft = 50; document.body.scrollTop = 10; return direct.scrollTop === 0 && direct.scrollLeft === 0 && root.scrollTop === 0 && notifications === 0;",
	);
	check(
		"Nonscrolling assignments do not enqueue programmatic scroll tasks",
		page.metrics().scrolling?.requests === 0,
	);
	await guest(
		"Guest mutation refreshes nested extent without absorbing siblings",
		'document.getElementById("wide").style.width = "350px"; return nested.scrollWidth === 350 && direct.scrollWidth === 290;',
	);
	await guest(
		"Root movement leaves content dimensions invariant",
		"root.scrollTop = 80; return direct.scrollWidth === 290 && nested.scrollHeight === 150 && document.body.scrollTop === 0 && window.scrollY === 80;",
	);
	await settle();
	await guest(
		"Only actual root movement emits the scroll notification",
		"return notifications === 1 && root.scrollTop === 80;",
	);
	await guest(
		"Display-none and ordinary inline elements have no scroll box metrics",
		'direct.style.display = "none"; return direct.scrollWidth === 0 && direct.scrollHeight === 0 && document.getElementById("inline").scrollWidth === 0;',
	);
	await guest(
		"Detached nodes have zero extents until insertion",
		'var detached = document.createElement("div"); detached.style.width = "120px"; detached.style.height = "45px"; var zero = detached.scrollWidth === 0; document.body.appendChild(detached); return zero && detached.scrollWidth === 120 && detached.scrollHeight === 45;',
	);
	await guest(
		"Control internals remain explicitly unsupported",
		'var rejected = false; try { var size = document.getElementById("control").scrollWidth; } catch(error) { rejected = true; } return rejected;',
	);
	check(
		"Native viewport still owns the actual root position",
		documentScroll(tree).get().y === 80,
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
				metrics: metrics.metrics(),
				page: page.metrics(),
				fixture:
					"actual interpreted DOM scroll metrics on in-memory visible-overflow content; no sockets or network",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Normal-flow LTR visible overflow; no control/nested scrolling, clipping, positioned layout, RTL, quirks or complete browser conformance",
			},
			null,
			2,
		),
	);
}
