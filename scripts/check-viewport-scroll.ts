import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { documentScroll } from "../src/document-scroll.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { renderDocumentPdf } from "../src/document-pdf.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const requests: string[] = [];
const session = new BrowserSession({
	createTransport: () => ({
		async request(input) {
			requests.push(input.url);
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
			requests: requests.length,
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
			'<style>html,body{margin:0;padding:0}div,a{display:block;width:160px;height:60px;font-size:8px;line-height:12px}#top{background:red}#link{background:blue}#bottom{background:green}</style><div id="top">Start</div><a id="link" href="/next">Next page</a><div id="bottom">End</div>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/scroll"]);
await host.execute(["resize", "100", "80"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const scroll = documentScroll(loaded.document);
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
const hash = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
try {
	await guest(
		"Actual guest observes initial Window scroll aliases and saves native geometry",
		`
		var link = document.getElementById("link"); var bottom = document.getElementById("bottom");
		var saved = link.getBoundingClientRect(); var originalOffset = link.offsetTop;
		var trace = []; var block = false; var windowScrolls = 0; var latestWheel = null; var stopClick = true; var clickY = null;
		document.addEventListener("wheel", function(event) { latestWheel = event; trace.push("wheel:" + event.deltaX + ":" + event.deltaY + ":" + event.deltaMode + ":" + event.pageY); if(block) event.preventDefault(); });
		document.addEventListener("scroll", function(event) { trace.push("scroll:" + window.scrollY + ":" + event.cancelable + ":" + event.bubbles); });
		window.addEventListener("scroll", function(event) { windowScrolls++; });
		link.addEventListener("click", function(event) { clickY = event.pageY; if(stopClick) event.preventDefault(); });
		return window.scrollX === 0 && window.pageXOffset === 0 && window.scrollY === 0 && window.pageYOffset === 0 && saved.y === 60;
	`,
	);
	const initialPixels = hash(rasterizeDocument(loaded.document).image.pixels);
	const initialPdf = hash(renderDocumentPdf(loaded.document).bytes);
	await host.execute(["mousemove", "5", "5"]);
	const moved = await host.execute(["mousewheel", "10", "60"]);
	check(
		"Wheel command returns the actual root viewport position",
		(moved.data as { mouse: { scroll: { x: number; y: number } } }).mouse.scroll
			.x === 10 && scroll.get().y === 60,
	);
	await guest(
		"Guest geometry, viewport hit identity and Window aliases share scrolling",
		"return window.scrollX === 10 && window.pageXOffset === 10 && window.scrollY === 60 && window.pageYOffset === 60 && link.getBoundingClientRect().x === -10 && link.getBoundingClientRect().y === 0 && document.elementFromPoint(5, 5) === link;",
	);
	await guest(
		"Saved rectangles and document-space offsets do not move with the viewport",
		"return saved.y === 60 && saved.x === 0 && link.offsetTop === originalOffset;",
	);
	await guest(
		"Wheel data precedes noncancelable document scroll and bubbles to Window",
		'return trace.join("|") === "wheel:10:60:0:5|scroll:60:false:true" && windowScrolls === 1 && latestWheel.deltaZ === 0;',
	);
	check(
		"Actual software pixels change with the native viewport",
		hash(rasterizeDocument(loaded.document).image.pixels) !== initialPixels,
	);
	const capture = await host.execute(["screenshot"]);
	check(
		"Agent PNG records document-space viewport capture origin",
		(capture.data as { clip: { x: number; y: number } }).clip.x === 10 &&
			(capture.data as { clip: { y: number } }).clip.y === 60,
	);
	check(
		"Full document PDF is independent of viewport scrolling",
		hash(renderDocumentPdf(loaded.document).bytes) === initialPdf,
	);
	await guest(
		"Guest arms wheel cancellation",
		"block = true; trace = []; return true;",
	);
	await host.execute(["mousewheel", "0", "25"]);
	await guest(
		"Canceled guest wheel preserves position and sends no scroll event",
		'return window.scrollY === 60 && trace.join("|") === "wheel:0:25:0:65" && windowScrolls === 1;',
	);
	await host.execute(["mousedown"]);
	await host.execute(["mouseup"]);
	await guest(
		"Coordinate activation targets the scrolled link with document page coordinates",
		"return clickY === 65;",
	);
	await guest(
		"DOM shrink clamps the viewport before exposing client geometry",
		'bottom.style.display = "none"; return window.scrollY === 40 && link.getBoundingClientRect().y === 20;',
	);
	await guest(
		"Guest restores content and allows wheel defaults",
		'bottom.style.display = "block"; block = false; return true;',
	);
	await host.execute(["resize", "200", "200"]);
	await guest(
		"Resize clamps both axes without corrupting saved event coordinates",
		"return window.scrollX === 0 && window.scrollY === 0 && latestWheel.pageY === 65;",
	);
	await host.execute(["resize", "100", "80"]);
	await host.execute(["mousewheel", "0", "60"]);
	await guest(
		"Guest allows the next native link activation",
		"stopClick = false; return true;",
	);
	await host.execute(["mousedown"]);
	const navigated = await host.execute(["mouseup"]);
	check(
		"Scrolled coordinate click navigates and releases the old viewport owner",
		!!(navigated.data as { navigation?: unknown }).navigation &&
			requests.length === 2 &&
			requests[1] === "https://fixture.invalid/next" &&
			scroll.metrics().closed &&
			scroll.metrics().y === 0,
	);
	check(
		"The new document begins unscrolled",
		documentScroll(session.page(session.tabs()[0].id).document).get().y === 0,
	);
	passed = true;
} finally {
	await page.close();
	host.close();
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
					"actual guest callbacks and production commands on in-memory long content; no sockets or network",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Normal-flow LTR root viewport, pixel wheel and command-step scroll notifications only; no element scrollers, visual viewport, smooth scrolling, scrollTo, event-loop coalescing, live-site or Worker acceptance",
			},
			null,
			2,
		),
	);
}
