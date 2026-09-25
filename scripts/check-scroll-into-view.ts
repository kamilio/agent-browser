import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { documentScroll } from "../src/document-scroll.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { documentScrollIntoView } from "../src/scroll-into-view.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const session = new BrowserSession({
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
			'<!doctype html><style>html,body{margin:0;padding:0}main{width:400px;height:500px}#before{height:160px}#target{display:block;margin-left:150px;width:20px;height:20px;background:blue}#after{height:320px}</style><main><div id="before"></div><a id="target" href="/next">Go</a><div id="after"></div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/into-view"]);
await host.execute(["resize", "100", "80"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const owner = documentScrollIntoView(loaded.document);
const scroll = documentScroll(loaded.document);
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
const pixels = () =>
	createHash("sha256")
		.update(rasterizeDocument(loaded.document).image.pixels)
		.digest("hex");
try {
	await guest(
		"Actual guest exposes the method on the native target",
		'var target = document.getElementById("target"); var saved = target.getBoundingClientRect(); var scrolls = 0; var windowScrolls = 0; var clicks = 0; var observedTop = null; document.addEventListener("scroll", function(event) { scrolls++; observedTop = target.getBoundingClientRect().top; }); window.addEventListener("scroll", function() { windowScrolls++; }); target.addEventListener("click", function() { clicks++; }); return typeof target.scrollIntoView === "function" && saved.top === 160 && saved.left === 150;',
	);
	const before = pixels();
	await guest(
		"Awaiting default alignment observes immediate geometry without early notification",
		"await target.scrollIntoView(); return window.scrollX === 70 && window.scrollY === 160 && target.getBoundingClientRect().top === 0 && saved.top === 160 && scrolls === 0;",
	);
	check(
		"Native viewport and raster reflect the guest method",
		scroll.get().x === 70 && scroll.get().y === 160 && pixels() !== before,
	);
	await settle();
	await guest(
		"Deferred document notification bubbles to Window without click",
		"return scrolls === 1 && windowScrolls === 1 && observedTop === 0 && clicks === 0;",
	);
	check(
		"Scrolling does not implicitly focus the target",
		loaded.interactions.focus.active() === null,
	);
	await guest(
		"Legacy false aligns the target end",
		"await target.scrollIntoView(false); return window.scrollY === 100 && target.getBoundingClientRect().bottom === 80;",
	);
	await settle();
	await guest(
		"Property, Window and scrollIntoView writes share source coalescing",
		'document.scrollingElement.scrollTop = 0; target.scrollIntoView({ block: "center", inline: "center" }); window.scrollBy(0, 0); return window.scrollX === 110 && window.scrollY === 130 && scrolls === 2;',
	);
	await settle();
	await guest(
		"Mixed programmatic calls produce only the final notification",
		"return scrolls === 3 && windowScrolls === 3 && observedTop === 30;",
	);
	const result = await host.execute([
		"scroll-into-view",
		"#target",
		"--block=end",
		"--inline=end",
	]);
	check(
		"CLI uses the same geometry and returns native final position",
		(result.data as { changed: boolean; scroll: { x: number; y: number } })
			.changed &&
			scroll.get().x === 70 &&
			scroll.get().y === 100,
	);
	await guest(
		"CLI command-step delivery reaches actual guest listeners",
		"return scrolls === 4 && observedTop === 60 && clicks === 0;",
	);
	await host.execute([
		"scroll-into-view",
		"#target",
		"--block=nearest",
		"--inline=nearest",
	]);
	await guest(
		"Nearest on an already visible target causes no additional scroll",
		"return scrolls === 4 && window.scrollY === 100;",
	);
	await guest(
		"Unsupported smooth behavior leaves the viewport unchanged",
		'var rejected = false; try { target.scrollIntoView({ behavior: "smooth" }); } catch(error) { rejected = true; } return rejected && window.scrollY === 100;',
	);
	await guest(
		"A hidden target returns a resolved no-op completion",
		'target.style.display = "none"; await target.scrollIntoView(); return window.scrollY === 100 && scrolls === 4;',
	);
	await guest(
		"Detached targets also resolve without creating viewport movement",
		'var detached = document.createElement("div"); await detached.scrollIntoView(); target.style.display = "block"; return window.scrollY === 100;',
	);
	await host.execute(["resize", "200", "100"]);
	await guest(
		"Alignment recomputes against the actual resized viewport",
		'await target.scrollIntoView({ block: "center", inline: "center", container: "nearest" }); return window.scrollX === 60 && window.scrollY === 120 && target.getBoundingClientRect().left === 90 && target.getBoundingClientRect().top === 40;',
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
				intoView: owner.metrics(),
				scroll: scroll.metrics(),
				page: page.metrics(),
				fixture:
					"actual interpreted DOM method and production CLI on in-memory content; no network or sockets",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Normal-flow LTR root-only instant alignment; no nested scrolling, scroll margins/padding/snap, smooth motion or full UA-availability/WebIDL conformance",
			},
			null,
			2,
		),
	);
}
