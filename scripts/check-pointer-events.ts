import { BrowserCommandHost } from "../src/command-host.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { renderDocumentPdf } from "../src/document-pdf.js";
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
			'<!doctype html><style>html{font-size:8px}main{width:100px}#back,#front{display:block;width:30px;height:20px}#back{background:blue}#front{position:relative;top:-20px;z-index:1;background:red}</style><main id="host"><div id="back" tabindex="0">A</div><div id="front" tabindex="0"><span id="child">B</span></div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/pointer-events"]);
await host.execute(["resize", "100", "100"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const checks: { label: string; passed: boolean }[] = [];
const observations: unknown[] = [];
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
async function click(pointerX: number, pointerY: number) {
	for (const command of [
		["mousemove", String(pointerX), String(pointerY)],
		["mousedown"],
		["mouseup"],
	])
		observations.push(await host.execute(command));
}
try {
	await guest(
		"Initial hit targets the painted overlay and exposes the computed default",
		'var front = document.getElementById("front"); var back = document.getElementById("back"); var child = document.getElementById("child"); var parent = document.getElementById("host"); var saved = getComputedStyle(front); var original = front.getBoundingClientRect(); var backClicks = 0; var frontClicks = 0; back.addEventListener("click", function () { backClicks++; }); front.addEventListener("click", function () { frontClicks++; }); return document.elementFromPoint(15, 5) === front && saved.pointerEvents === "auto" && saved.length === 66;',
	);
	await guest(
		"Live CSSOM none is inherited and excludes the overlay from hit results",
		'front.style.pointerEvents = "none"; return saved.pointerEvents === "none" && getComputedStyle(child).pointerEvents === "none" && document.elementFromPoint(15, 5) === back && document.elementsFromPoint(15, 5).indexOf(front) === -1;',
	);
	const image = rasterizeDocument(loaded.document).image;
	const pixel = (5 * image.width + 15) * 4;
	check(
		"The non-interactive overlay still paints red",
		[...image.pixels.slice(pixel, pixel + 4)].join(",") === "255,0,0,255",
	);
	await click(15, 5);
	observations.push(
		await page.evaluate(
			"return [backClicks, frontClicks, document.activeElement === back, document.activeElement && document.activeElement.id];",
		),
	);
	await guest(
		"Production CLI coordinate click reaches and focuses the underlying element",
		"return backClicks === 1 && frontClicks === 0 && document.activeElement === back;",
	);
	await host.execute(["press", "Tab"]);
	await guest(
		"Sequential focus still reaches the pointer-excluded overlay",
		'return document.activeElement === front && saved.pointerEvents === "none";',
	);
	observations.push(
		await page.evaluate("return { htmlElementClick: typeof front.click };"),
	);
	await guest(
		"A child can opt back into hit testing without restoring its parent's region",
		'child.style.display = "block"; child.style.width = "10px"; child.style.height = "10px"; child.style.pointerEvents = "auto"; return document.elementFromPoint(2, 4) === child && document.elementFromPoint(15, 5) === back;',
	);
	await guest(
		"Registers capture and bubble checks on the pointer-excluded ancestor",
		'var trace = ""; front.addEventListener("click", function () { trace += "capture "; }, true); child.addEventListener("click", function () { trace += "target "; }); front.addEventListener("click", function () { trace += "bubble "; }); return true;',
	);
	await click(2, 4);
	await guest(
		"CLI child click still traverses its none ancestor in both event phases",
		'return trace === "capture target bubble " && frontClicks === 1 && backClicks === 1;',
	);
	await guest(
		"Unset restores inherited suppression without changing box geometry",
		'child.style.pointerEvents = "unset"; var current = front.getBoundingClientRect(); return getComputedStyle(child).pointerEvents === "none" && document.elementFromPoint(2, 4) === back && current.x === original.x && current.y === original.y && current.width === original.width && current.height === original.height;',
	);
	await guest(
		"An initial child value resets to auto",
		'child.style.pointerEvents = "initial"; return getComputedStyle(child).pointerEvents === "auto" && document.elementFromPoint(2, 4) === child;',
	);
	await guest(
		"CSS variables update the inherited hit policy",
		'child.style.pointerEvents = "inherit"; front.style.pointerEvents = "var(--policy)"; parent.style.setProperty("--policy", "auto"); var enabled = document.elementFromPoint(15, 5) === front; parent.style.setProperty("--policy", "none"); return enabled && saved.pointerEvents === "none" && document.elementFromPoint(15, 5) === back;',
	);
	await guest(
		"Inertness cannot be overridden by child auto",
		'child.style.pointerEvents = "auto"; front.setAttribute("inert", ""); var excluded = document.elementFromPoint(2, 4) === back; front.removeAttribute("inert"); return excluded && document.elementFromPoint(2, 4) === child;',
	);
	await guest(
		"Detached computed styles empty and restored inheritance remains live",
		'front.remove(); var empty = saved.length === 0 && saved.pointerEvents === ""; parent.appendChild(front); return empty && saved.pointerEvents === "none" && saved.length === 67 && saved.getPropertyValue("--policy") === "none";',
	);
	await guest(
		"Root fallback survives pointer exclusion without inventing a child target",
		'front.style.pointerEvents = "inherit"; child.style.pointerEvents = "inherit"; document.documentElement.style.pointerEvents = "none"; var root = document.elementFromPoint(15, 5) === document.documentElement; document.documentElement.style.pointerEvents = "auto"; return root && document.elementFromPoint(15, 5) === front;',
	);
	check(
		"PDF retains both painted glyphs",
		renderDocumentPdf(loaded.document).metrics.glyphs === 2,
	);
	const capability = (await host.execute(["capabilities"])).data as {
		hitTesting: { pointerEventsCss: boolean };
	};
	check(
		"Capability advertises CSS pointer exclusion",
		capability.hitTesting.pointerEventsCss,
	);
	check("Only the synthetic document request was needed", requests === 1);
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
				observations,
				page: page.metrics(),
				transport: { requests, closed: transportClosed },
				fixture:
					"Existing experimental SafeJS and production coordinate mouse/keyboard CLI over one synthetic document; no sockets",
				limitations:
					"HTMLElement.click is absent and is not counted as supported. Not released-runtime throughput, SVG pointer hit testing, PointerEvent support, selector-click actionability, real-site or deployment acceptance",
			},
			null,
			2,
		),
	);
}
