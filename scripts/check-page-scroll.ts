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
	'<style>html,body{margin:0;padding:0}div{width:160px;height:60px}#first{background:red}#second{background:blue}</style><div id="first"></div><div id="second"></div><div></div>',
	"https://fixture.invalid/page-scroll",
);
documentStyles(tree).setViewport(100, 80);
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
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
		const state = page.metrics();
		if (state.closed)
			throw new Error("Page closed while awaiting scroll delivery");
		if (
			!state.scrolling?.pending &&
			!state.scrolling?.queued &&
			!state.scrolling?.running &&
			state.pendingCallbacks === 0
		)
			return;
		await new Promise<void>((resolve) => setTimeout(resolve, 5));
	}
	throw new Error(
		"Scroll notification did not settle within the bounded host wait",
	);
}
const pixels = () =>
	createHash("sha256")
		.update(rasterizeDocument(tree).image.pixels)
		.digest("hex");
try {
	await guest(
		"Guest installs Document and Window scroll handlers",
		`
		var second = document.getElementById("second"); var saved = second.getBoundingClientRect();
		var trace = []; var follow = false;
		document.onscroll = function(event) { trace.push("doc:" + window.scrollY + ":" + event.cancelable + ":" + (this === document)); };
		window.onscroll = function(event) { trace.push("win:" + window.scrollY + ":" + (this === window)); if(follow && window.scrollY === 20) { follow = false; scrollTo(0, 60); } };
		return typeof scroll === "function" && typeof scrollTo === "function" && typeof scrollBy === "function" && saved.y === 60;
	`,
	);
	const before = pixels();
	await guest(
		"Global dictionary scrollTo moves immediately without reentering guest handlers",
		'var completion = scrollTo({left:10, top:60, behavior:"instant"}); return window.scrollX === 10 && window.scrollY === 60 && second.getBoundingClientRect().y === 0 && trace.length === 0 && typeof completion.then === "function";',
	);
	check(
		"Programmatic movement changes actual native viewport pixels",
		pixels() !== before && rasterizeDocument(tree).clip.y === 60,
	);
	await settle();
	await guest(
		"Deferred native document scroll bubbles to Window with real receiver identities",
		'return trace.join("|") === "doc:60:false:true|win:60:true";',
	);
	await guest(
		"Guest can await the already completed instant-scroll promise",
		"await completion; return window.scrollY === 60;",
	);
	await guest(
		"Saved DOMRects remain snapshots while hit testing follows the viewport",
		"return saved.y === 60 && document.elementFromPoint(5, 5) === second;",
	);
	await guest(
		"Multiple changes in one source are coalesced without intermediate callbacks",
		"trace = []; window.scroll(0,20); scrollBy({top:10}); window.scrollTo({top:40}); return window.scrollY === 40 && trace.length === 0;",
	);
	await settle();
	await guest(
		"The coalesced notification observes the final source position",
		'return trace.join("|") === "doc:40:false:true|win:40:true";',
	);
	await guest(
		"Guest arms a bounded listener-triggered follow-up scroll",
		"trace = []; follow = true; scrollTo(0,20); return window.scrollY === 20;",
	);
	await settle();
	await guest(
		"A callback scroll gets a subsequent task rather than reentrant dispatch",
		'return trace.join("|") === "doc:20:false:true|win:20:true|doc:60:false:true|win:60:true" && window.scrollY === 60;',
	);
	await guest(
		"Primitive numeric conversion and huge finite clamping use native bounds",
		'scrollTo("10.5", "30.25"); var converted = window.scrollX === 10.5 && window.scrollY === 30.25; scrollBy(1e100,1e100); return converted && window.scrollX === 60 && window.scrollY === 100;',
	);
	await settle();
	await guest(
		"Nonfinite relative values normalize to zero and undefined positional values reset",
		"scrollBy(NaN, Infinity); var kept = window.scrollY === 100; scrollTo(undefined, undefined); return kept && window.scrollX === 0 && window.scrollY === 0;",
	);
	await settle();
	await guest(
		"Unsupported smooth behavior throws without changing native position",
		'var caught = false; try { scrollTo({top:60,behavior:"smooth"}); } catch(error) { caught = true; } return caught && window.scrollY === 0;',
	);
	await guest(
		"No-op completion does not create a notification",
		"trace = []; await scrollTo({}); return trace.length === 0;",
	);
	await settle();
	await guest(
		"No-op leaves the scroll notification queue empty",
		"return trace.length === 0;",
	);
	await guest(
		"Guest schedules a final movement before owner shutdown",
		"scrollTo(0,60); return window.scrollY === 60;",
	);
	await page.close();
	check(
		"Closing cancels the pending owned task without retained callbacks",
		page.metrics().closed &&
			page.metrics().scrolling?.pending === false &&
			page.metrics().scrolling?.queued === false &&
			page.metrics().pendingCallbacks === 0,
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
				page: page.metrics(),
				fixture:
					"production PageScripts over an in-memory document; bounded host-side task waits, no sockets or public website",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Instant root viewport methods and per-source programmatic notification coalescing; native wheel retains command-step events, no smooth scrolling, nested scrollers, full rendering-phase order or current-SDK parity",
			},
			null,
			2,
		),
	);
}
