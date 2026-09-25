import { BrowserCommandHost } from "../src/command-host.js";
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
			'<!doctype html><style>html{font-size:8px}main{width:100px;position:relative;z-index:0}#first,#child,#second{width:20px;height:20px}#first{position:relative;z-index:0;background:red}#child{position:relative;z-index:100;background:lime}#second{position:relative;top:-20px;z-index:2;background:blue}</style><main id="host"><div id="first"><div id="child">A</div></div><div id="second">B</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/stacking"]);
await host.execute(["resize", "100", "100"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
function check(label: string, result: boolean) {
	checks.push({ label, passed: result });
	if (!result) throw Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
function pixel() {
	const image = rasterizeDocument(loaded.document).image;
	const start = (5 * image.width + 15) * 4;
	return [...image.pixels.slice(start, start + 4)].join(",");
}
try {
	await guest(
		"A zero context contains a higher descendant below its sibling",
		'var first = document.getElementById("first"); var child = document.getElementById("child"); var second = document.getElementById("second"); var parent = document.getElementById("host"); var saved = getComputedStyle(first); var original = first.getBoundingClientRect(); return saved.zIndex === "0" && saved.length === 66 && document.elementFromPoint(15, 5) === second;',
	);
	check(
		"Raster paints the same isolated blue sibling",
		pixel() === "0,0,255,255",
	);
	await guest(
		"A live auto value releases the descendant into the ancestor context",
		'first.style.zIndex = "auto"; return saved.zIndex === "auto" && document.elementFromPoint(15, 5) === child && first.getBoundingClientRect().x === original.x && first.getBoundingClientRect().y === original.y;',
	);
	check("Raster observes escaped positive stacking", pixel() === "0,255,0,255");
	await guest(
		"Restoring zero re-isolates without changing geometry",
		'first.style.zIndex = "0"; return document.elementFromPoint(15, 5) === second && first.getBoundingClientRect().width === original.width;',
	);
	await guest(
		"Registers a production CLI handler on the visible sibling",
		'second.addEventListener("click", function () { first.style.zIndex = "3"; }); return true;',
	);
	await host.execute(["click", "#second"]);
	await guest(
		"CLI click recascades the ancestor stacking level",
		'return saved.zIndex === "3" && document.elementFromPoint(15, 5) === child;',
	);
	await guest(
		"A negative descendant paints above its zero-context root background",
		'first.style.zIndex = "0"; child.style.zIndex = "-1"; second.style.position = "static"; return document.elementFromPoint(15, 5) === child;',
	);
	check(
		"Negative nested context is visible above the root's red background",
		pixel() === "0,255,0,255",
	);
	await guest(
		"An auto parent paints over the now-escaping negative child",
		'first.style.zIndex = "auto"; return document.elementFromPoint(15, 5) === first;',
	);
	check(
		"Auto parent background covers the negative child",
		pixel() === "255,0,0,255",
	);
	await guest(
		"Static flex items create contexts for non-auto z-index",
		'parent.style.display = "flex"; first.style.position = "static"; first.style.zIndex = "3"; first.style.marginRight = "-20px"; second.style.marginRight = "-20px"; second.style.zIndex = "2"; child.style.position = "static"; return saved.position === "static" && document.elementFromPoint(15, 5) === child;',
	);
	await guest(
		"A lower static flex context is covered by its sibling",
		'first.style.zIndex = "1"; return document.elementFromPoint(15, 5) === second;',
	);
	await guest(
		"Equal-level flex contexts follow order-modified traversal",
		'first.style.zIndex = "2"; first.style.order = "2"; second.style.order = "1"; return document.elementFromPoint(15, 5) === child;',
	);
	await guest(
		"Custom properties and importance update stacking without replacing objects",
		'first.style.zIndex = "var(--layer)"; parent.style.setProperty("--layer", "0"); var behind = document.elementFromPoint(15, 5) === second; first.style.setProperty("z-index", "4", "important"); return behind && saved.zIndex === "4" && first.style.getPropertyPriority("z-index") === "important" && document.elementFromPoint(15, 5) === child;',
	);
	await guest(
		"Detach and reattach retain live computed-style behavior",
		'first.remove(); var detached = saved.length === 0 && saved.zIndex === ""; parent.appendChild(first); return detached && saved.length === 67 && saved.getPropertyValue("--layer") === "0" && saved.zIndex === "4";',
	);
	await guest(
		"Unsupported opacity remains explicit and a revision can recover",
		'first.style.opacity = "0.5"; try { first.getBoundingClientRect(); return false; } catch (error) { first.style.removeProperty("opacity"); return document.elementFromPoint(15, 5) === child; }',
	);
	check(
		"PDF receives both glyphs once",
		renderDocumentPdf(loaded.document).metrics.glyphs === 2,
	);
	const capability = (await host.execute(["capabilities"])).data as {
		flowStyles: { stackingContexts: string };
	};
	check(
		"Capability names the supported context sources",
		capability.flowStyles.stackingContexts ===
			"root-relative-and-static-flex-items",
	);
	check("Only one synthetic document request was needed", requests === 1);
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
					"Existing experimental SafeJS, production CLI, native paint/hit/PDF with one synthetic document; no sockets",
				limitations:
					"Not released-runtime throughput, real-site, full stacking/compositing, live terminal/playground or deployment acceptance",
			},
			null,
			2,
		),
	);
}
