import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { documentScroll } from "../src/document-scroll.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
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
			'<style>html,body{margin:0;padding:0}main{width:200px;height:400px}#top{height:100px;background:red}#bottom{height:100px;background:blue}</style><main><div id="top">Top</div><div id="bottom">Bottom</div><input id="edit"><select id="select"><option>A</option><option>B</option></select><button id="button" type="button">Go</button><a id="link" href="/next">Next</a></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/keyboard-scroll"]);
await host.execute(["resize", "100", "80"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
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
const pixels = () =>
	createHash("sha256")
		.update(rasterizeDocument(loaded.document).image.pixels)
		.digest("hex");
try {
	await guest(
		"Real guest listeners observe key defaults and live geometry",
		`
		var blocked = false; var keypressBlocked = false; var scrolls = 0; var windowScrolls = 0; var trace = []; var clicks = 0;
		var bottom = document.getElementById("bottom"); var saved = bottom.getBoundingClientRect();
		document.addEventListener("keydown", function(event) { trace.push("down:" + event.key + ":" + event.repeat); if (blocked) event.preventDefault(); });
		document.addEventListener("keypress", function(event) { if (keypressBlocked) event.preventDefault(); });
		document.addEventListener("keyup", function(event) { trace.push("up:" + event.key); });
		document.addEventListener("scroll", function(event) { scrolls++; trace.push("scroll:" + window.scrollY + ":" + bottom.getBoundingClientRect().y + ":" + event.cancelable); });
		window.addEventListener("scroll", function() { windowScrolls++; });
		document.getElementById("button").addEventListener("click", function() { clicks++; });
		return saved.y === 100 && window.scrollY === 0;
	`,
	);
	const before = pixels();
	const result = await host.execute(["press", "PageDown"]);
	check(
		"CLI press returns native page position",
		(result.data as { keyboard: { scroll?: { y: number } } }).keyboard.scroll
			?.y === 70 && scroll.get().y === 70,
	);
	await guest(
		"Guest key/scroll/keyup order and Window bubbling",
		'return trace.join("|") === "down:PageDown:false|scroll:70:30:false|up:PageDown" && scrolls === 1 && windowScrolls === 1 && saved.y === 100;',
	);
	check(
		"Native rendered pixels change after keyboard scrolling",
		pixels() !== before,
	);
	await guest(
		"Enable guest keydown cancellation",
		"blocked = true; return true;",
	);
	await host.execute(["press", "End"]);
	await guest(
		"Canceled keydown preserves viewport and still delivers keyup",
		'return window.scrollY === 70 && scrolls === 1 && trace[trace.length - 1] === "up:End";',
	);
	await guest(
		"Enable guest Space keypress cancellation",
		"blocked = false; keypressBlocked = true; return true;",
	);
	await host.execute(["press", "Space"]);
	await guest(
		"Canceled Space keypress does not scroll",
		"keypressBlocked = false; return window.scrollY === 70 && scrolls === 1;",
	);
	await host.execute(["keydown", "ArrowDown"]);
	await host.execute(["keydown", "ArrowDown"]);
	await host.execute(["keyup", "ArrowDown"]);
	await guest(
		"Held keys repeat real defaults without scrolling on release",
		'return window.scrollY === 150 && scrolls === 3 && trace.indexOf("down:ArrowDown:true") >= 0;',
	);
	await host.execute(["press", "Shift+Space"]);
	await guest(
		"Shift Space reverses the page direction",
		"return window.scrollY === 80;",
	);
	await host.execute(["press", "--target=#edit", "Home"]);
	await host.execute(["type", "ab"]);
	await host.execute(["press", "Home"]);
	await host.execute(["press", "Space"]);
	await guest(
		"Input Home and Space edit without stealing root scroll",
		'return document.getElementById("edit").value === " ab" && window.scrollY === 80;',
	);
	await host.execute(["press", "--target=#select", "ArrowDown"]);
	await guest(
		"Select arrows retain native selection precedence",
		'return document.getElementById("select").value === "B" && window.scrollY === 80;',
	);
	await host.execute(["press", "--target=#button", "Space"]);
	await guest(
		"Button Space activates exactly once without page scrolling",
		"return clicks === 1 && window.scrollY === 80;",
	);
	await host.execute(["press", "--target=#link", "End"]);
	await host.execute(["press", "PageDown"]);
	await guest(
		"Focused link page defaults clamp at the document end",
		"return window.scrollY === 320;",
	);
	await host.execute(["press", "Home"]);
	await guest(
		"Home returns to the top through the same native owner",
		"return window.scrollY === 0 && bottom.getBoundingClientRect().y === 100;",
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
					"actual interpreted callbacks and production commands on in-memory content; no sockets or public sites",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Instant LTR root scrolling with command-step events, fixed line/page profile; no nested/control scrolling, smooth animation, scrollend or platform shortcuts",
			},
			null,
			2,
		),
	);
}
