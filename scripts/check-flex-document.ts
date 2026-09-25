import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { layoutDocument } from "../src/document-layout.js";
import { renderDocumentPdf } from "../src/document-pdf.js";
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
			'<!doctype html><style>html{font-size:8px}main{display:flex;width:60px;height:40px;margin:7px;padding:3px;flex-wrap:wrap;row-gap:4px}main>div{flex:0 0 35px;min-width:0}#first{background:red;min-height:10px}#second{background:blue}</style><main id="container"><div id="first">A</div><div id="second">B</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/flex-document"]);
await host.execute(["resize", "80", "60"]);
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
const hashes: string[] = [];
function capture() {
	hashes.push(
		createHash("sha256")
			.update(rasterizeDocument(loaded.document).image.pixels)
			.digest("hex"),
	);
}
try {
	await guest(
		"Guest client geometry uses page-positioned flex boxes",
		'var container = document.getElementById("container"); var first = document.getElementById("first"); var second = document.getElementById("second"); var original = first.getBoundingClientRect(); return original.x === 10 && original.y === 10 && original.width === 35 && original.height === 18 && second.getBoundingClientRect().y === 32;',
	);
	await guest(
		"Computed styles and element size owners share allocated geometry",
		'var firstStyle = getComputedStyle(first); return firstStyle.width === "35px" && firstStyle.height === "18px" && first.clientWidth === 35 && first.clientHeight === 18 && second.offsetHeight === 18;',
	);
	check(
		"Actual viewport pixels match both positioned flex backgrounds",
		pixel(30, 11) === "255,0,0,255" && pixel(30, 33) === "0,0,255,255",
	);
	capture();
	await guest(
		"Guest hit testing follows the same page coordinates",
		"return document.elementFromPoint(30, 11) === first && document.elementFromPoint(30, 33) === second;",
	);
	await guest(
		"Guest-created percentage child resolves from the stretched item",
		'first.textContent = ""; var child = document.createElement("div"); child.style.height = "50%"; child.style.background = "lime"; first.appendChild(child); return child.getBoundingClientRect().height === 9 && child.getBoundingClientRect().y === 10;',
	);
	check(
		"The stretched descendant paints through the page renderer",
		pixel(30, 11) === "0,255,0,255" && pixel(30, 21) === "255,0,0,255",
	);
	await guest(
		"Order changes visual placement without reordering DOM children",
		'second.style.order = "-1"; first.style.order = "2"; return first.getBoundingClientRect().y === 32 && second.getBoundingClientRect().y === 10 && container.children[0] === first && original.y === 10;',
	);
	check(
		"Order invalidation reaches raster and PDF production owners",
		pixel(30, 11) === "0,0,255,255" &&
			renderDocumentPdf(loaded.document).metrics.glyphs === 1,
	);
	await guest(
		"Guest listener can mutate layout from a CLI activation",
		'second.addEventListener("click", function() { container.style.flexDirection = "row-reverse"; }); return true;',
	);
	await host.execute(["click", "#second"]);
	await guest(
		"Production CLI click reaches the layout-changing listener",
		"return first.getBoundingClientRect().x === 35 && second.getBoundingClientRect().x === 35 && document.elementFromPoint(50, 11) === second;",
	);
	capture();
	await host.execute(["resize", "80", "20"]);
	await guest(
		"Root scrolling moves client geometry and hit testing together",
		"window.scrollTo(0, 32); return window.scrollY === 32 && first.getBoundingClientRect().y === 0 && document.elementFromPoint(50, 12) === first;",
	);
	check(
		"Viewport raster uses the same scroll origin",
		pixel(50, 12) === "255,0,0,255",
	);
	await guest(
		"Auto container width remains a real containing-block constraint",
		'container.style.width = "auto"; return getComputedStyle(container).width === "60px";',
	);
	await host.execute(["resize", "100", "60"]);
	await guest(
		"CLI resize changes wrapping, stretch and physical item positions",
		'return getComputedStyle(container).width === "80px" && first.getBoundingClientRect().x === 20 && second.getBoundingClientRect().x === 55 && first.getBoundingClientRect().height === 40 && second.getBoundingClientRect().y === 10 && window.scrollY === 0;',
	);
	capture();
	await guest(
		"Switching back to ordinary block layout invalidates flex geometry",
		'container.style.display = "block"; return second.getBoundingClientRect().y === 20 && firstStyle.width === "80px";',
	);
	await guest(
		"Switching to horizontal flex restores the shared page path",
		'container.style.display = "flex"; return second.getBoundingClientRect().x === 55 && firstStyle.width === "35px";',
	);
	await guest(
		"Unsupported grid layout remains visible rather than guessed",
		'container.style.display = "grid"; try { first.getBoundingClientRect(); return false; } catch (error) { container.style.display = "flex"; return true; }',
	);
	const final = layoutDocument(loaded.document);
	check(
		"Final layout uses the live revision and contains both item owners",
		final.text.horizontal.formatting.revision === loaded.document.revision &&
			final.boxes.length >= 5,
	);
	check(
		"Native captures differ without extra network requests",
		new Set(hashes).size === hashes.length && requests === 1,
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
				hashes,
				page: page.metrics(),
				transport: { requests, closed: transportClosed },
				fixture:
					"Actual experimental SafeJS, production CLI actions and native page layout/geometry/raster/PDF over synthetic in-memory HTML; no sockets or public sites",
				limitations:
					"Horizontal block-level flex containers only; no column/nested/inline flex, released-runtime throughput, real-site, live terminal/playground or Worker acceptance",
			},
			null,
			2,
		),
	);
}
