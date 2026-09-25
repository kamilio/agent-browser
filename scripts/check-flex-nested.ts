import { BrowserCommandHost } from "../src/command-host.js";
import { layoutDocument } from "../src/document-layout.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
let requests = 0;
let transportClosed = false;
const session = new BrowserSession({
	createTransport: () => ({
		async request(input) {
			requests++;
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
			requests,
			active: 0,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
			closed: transportClosed,
		}),
		close() {
			transportClosed = true;
		},
	}),
	loadDocument: (response) =>
		parseHtmlDocument(
			'<!doctype html><style>html{font-size:8px}main{display:flex;width:120px;height:60px;padding:4px;gap:4px}#inner{display:flex;flex:1;min-width:0;padding:2px;gap:4px}#inner>div{flex:1;min-width:0}#first{background:lime}#second{background:blue}#peer{flex:0 0 20px}</style><main id="outer"><section id="inner"><div id="first">A</div><div id="second">B</div></section><button id="peer">C</button></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/flex-nested"]);
await host.execute(["resize", "160", "120"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
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
function pixel(x: number, y: number) {
	const image = rasterizeDocument(loaded.document).image;
	const offset = (y * image.width + x) * 4;
	return [...image.pixels.slice(offset, offset + 4)].join(",");
}
try {
	await guest(
		"Actual guest reads allocated nested widths and cross stretch",
		'var outer = document.getElementById("outer"); var inner = document.getElementById("inner"); var first = document.getElementById("first"); var second = document.getElementById("second"); var peer = document.getElementById("peer"); var old = first.getBoundingClientRect(); return inner.getBoundingClientRect().width === 96 && old.x === 6 && old.y === 6 && old.width === 44 && old.height === 56 && second.getBoundingClientRect().x === 54;',
	);
	await guest(
		"Guest hit testing retains container ownership in padding",
		"return document.elementFromPoint(1, 1) === outer && document.elementFromPoint(5, 5) === inner;",
	);
	await guest(
		"Guest creates a third flex context with percentage height",
		'first.textContent = ""; var grand = document.createElement("section"); grand.style.display = "flex"; grand.style.height = "50%"; grand.style.background = "red"; var leaf = document.createElement("div"); leaf.style.flex = "1"; leaf.textContent = "D"; grand.appendChild(leaf); first.appendChild(grand); return grand.getBoundingClientRect().height === 28 && leaf.getBoundingClientRect().width === 44 && leaf.getBoundingClientRect().height === 28;',
	);
	check(
		"Recursive document layout paints descendant and ancestor backgrounds",
		pixel(30, 10) === "255,0,0,255" && pixel(30, 40) === "0,255,0,255",
	);
	await guest(
		"Changing the outer height reflows percentage descendants recursively",
		'outer.style.height = "80px"; return first.getBoundingClientRect().height === 76 && grand.getBoundingClientRect().height === 38 && leaf.getBoundingClientRect().height === 38 && old.height === 56;',
	);
	await guest(
		"Guest installs a layout-changing activation handler",
		'peer.addEventListener("click", function() { inner.style.flexWrap = "wrap-reverse"; first.style.flex = "0 0 60px"; second.style.flex = "0 0 60px"; }); return true;',
	);
	await host.execute(["click", "#peer"]);
	await guest(
		"CLI activation reruns nested wrapping and line-specific stretch",
		"return first.getBoundingClientRect().y === 46 && second.getBoundingClientRect().y === 6 && first.getBoundingClientRect().height === 36 && grand.getBoundingClientRect().height === 18 && leaf.getBoundingClientRect().width === 60;",
	);
	await guest(
		"Nested ordering changes visual geometry without changing DOM order",
		'first.style.order = "2"; second.style.order = "0"; return first.getBoundingClientRect().y === 6 && second.getBoundingClientRect().y === 46 && inner.children[0] === first;',
	);
	check(
		"Nested order updates the actual viewport pixels",
		pixel(30, 10) === "255,0,0,255" && pixel(30, 50) === "0,0,255,255",
	);
	await guest(
		"Auto width uses the live page containing block",
		'outer.style.width = "auto"; return getComputedStyle(inner).width === "124px";',
	);
	await host.execute(["resize", "160", "100"]);
	await guest(
		"Nested items fit one line after available width changes",
		"return first.getBoundingClientRect().x === 70 && second.getBoundingClientRect().x === 6 && first.getBoundingClientRect().height === 76 && grand.getBoundingClientRect().height === 38;",
	);
	await guest(
		"Guest hit testing reaches the recursively placed leaf",
		"return document.elementFromPoint(80, 12) === leaf;",
	);
	await guest(
		"Nested style and text mutation can change the exported baseline",
		'outer.style.alignItems = "baseline"; outer.style.height = "auto"; peer.style.display = "none"; var reference = document.createElement("div"); reference.textContent = "Ref"; outer.appendChild(reference); inner.style.flex = "none"; inner.style.width = "60px"; inner.style.gap = "0px"; inner.style.alignItems = "baseline"; first.style.order = "1"; second.style.order = "2"; first.textContent = "A"; second.textContent = "B"; first.style.fontSize = "10px"; second.style.fontSize = "30px"; return second.getBoundingClientRect().y + 30 === reference.getBoundingClientRect().y + 8;',
	);
	await guest(
		"A nested empty flex box remains a real hit target",
		'second.textContent = ""; second.style.display = "flex"; second.style.height = "40px"; outer.style.alignItems = "flex-start"; inner.style.alignItems = "flex-start"; var empty = second.getBoundingClientRect(); return document.elementFromPoint(empty.x + 1, empty.y + 1) === second;',
	);
	await guest(
		"Unsupported nested grid contexts still reject rather than fabricate geometry",
		'inner.style.display = "grid"; try { first.getBoundingClientRect(); return false; } catch (error) { inner.style.display = "flex"; return true; }',
	);
	const result = layoutDocument(loaded.document);
	check(
		"Final native layout retains the live document revision",
		result.text.horizontal.formatting.revision === loaded.document.revision &&
			result.boxes.length >= 7,
	);
	const capabilities = await host.execute(["capabilities"]);
	check(
		"Capability exposes nested support and column wrapping",
		(
			capabilities.data as {
				flexStyles: { nestedFlex: boolean; column: boolean };
			}
		).flexStyles.nestedFlex === true &&
			(capabilities.data as { flexStyles: { columnWrap: boolean } }).flexStyles
				.columnWrap === true,
	);
	check(
		"Nested scripts and native reflows use no extra requests",
		requests === 1,
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
				page: page.metrics(),
				transport: { requests, closed: transportClosed },
				fixture:
					"Actual existing experimental SafeJS and production CLI with synthetic in-memory nested flex HTML, native geometry/pixels and no sockets",
				limitations:
					"Bounded horizontal block-level nested flex profile; not column/inline flex, full CSS/font conformance, released-runtime throughput, public-site, live terminal/playground or Worker acceptance",
			},
			null,
			2,
		),
	);
}
