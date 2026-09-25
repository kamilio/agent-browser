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
			'<!doctype html><style>html{font-size:8px}main{width:100px;height:80px}#target{width:20px;height:20px;background:red}#after{width:20px;height:20px;background:blue}</style><main id="host"><div id="target"><span id="text">ab</span></div><div id="after">cd</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/relative-positioning"]);
await host.execute(["resize", "160", "160"]);
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
try {
	await guest(
		"Guest captures original geometry and live computed styles",
		'var target = document.getElementById("target"); var after = document.getElementById("after"); var parent = document.getElementById("host"); var text = document.getElementById("text"); var original = target.getBoundingClientRect(); var following = after.getBoundingClientRect(); var computed = getComputedStyle(target); return original.x === 0 && original.y === 0 && following.y === 20 && computed.left === "auto";',
	);
	await guest(
		"Physical CSSOM setters move the box without reflowing its sibling",
		'target.style.position = "relative"; target.style.left = "10px"; target.style.top = "20px"; return target.getBoundingClientRect().x === 10 && target.getBoundingClientRect().y === 20 && after.getBoundingClientRect().y === following.y && original.x === 0;',
	);
	await guest(
		"Computed style exposes opposite used insets and new enumeration",
		'return computed.length === 66 && computed.left === "10px" && computed.right === "-10px" && computed.top === "20px" && computed.bottom === "-20px";',
	);
	await guest(
		"Paint-order hit testing sees a relative box above later static content",
		"return document.elementFromPoint(15, 35) === target && document.elementFromPoint(5, 5) !== target;",
	);
	const image = rasterizeDocument(loaded.document).image;
	const pixel = (35 * image.width + 15) * 4;
	check(
		"Native raster agrees with positioned hit order",
		[...image.pixels.slice(pixel, pixel + 4)].join(",") === "255,0,0,255",
	);
	await guest(
		"An ancestor shift reaches descendants once and establishes offsetParent",
		'parent.style.position = "relative"; parent.style.left = "5px"; parent.style.top = "3px"; return target.getBoundingClientRect().x === 15 && target.getBoundingClientRect().y === 23 && target.offsetParent === parent && target.offsetLeft === 10 && target.offsetTop === 20;',
	);
	await guest(
		"An inline relative descendant shifts independently",
		'var textBefore = text.getBoundingClientRect(); text.style.position = "relative"; text.style.left = "2px"; text.style.top = "-3px"; return text.getBoundingClientRect().x === textBefore.x + 2 && text.getBoundingClientRect().y === textBefore.y - 3 && target.getBoundingClientRect().x === 15;',
	);
	await guest(
		"Percentages use the containing block dimensions, not shifted coordinates",
		'target.style.left = "20%"; target.style.top = "25%"; return target.getBoundingClientRect().x === 25 && target.getBoundingClientRect().y === 23 && computed.left === "20px" && computed.top === "20px";',
	);
	await guest(
		"Auto-height vertical percentages become auto rather than using natural height",
		'parent.style.height = "auto"; target.style.bottom = "4px"; return computed.top === "-4px" && target.getBoundingClientRect().y === -1;',
	);
	await guest(
		"Signed calc and inherited custom properties update used geometry",
		'parent.style.setProperty("--shift", "12px"); target.style.left = "calc(var(--shift) - 20px)"; return computed.left === "-8px" && target.getBoundingClientRect().x === -3;',
	);
	await guest(
		"Registers an action handler for the production command host",
		'target.addEventListener("click", function () { target.style.left = "30px"; }); return true;',
	);
	await host.execute(["click", "#target"]);
	await guest(
		"CLI click updates positioned geometry",
		'return target.getBoundingClientRect().x === 35 && computed.left === "30px";',
	);
	await guest(
		"Unsupported absolute positioning still rejects and relative reset recovers",
		'target.style.position = "absolute"; try { target.getBoundingClientRect(); return false; } catch (error) { target.style.position = "relative"; return target.getBoundingClientRect().x === 35; }',
	);
	await guest(
		"Switching to static restores reserved flow despite retained insets",
		'target.style.position = "static"; text.style.position = "static"; return target.getBoundingClientRect().x === 5 && target.getBoundingClientRect().y === 3 && after.getBoundingClientRect().y === 23;',
	);
	check(
		"Shared PDF emits every glyph exactly once",
		renderDocumentPdf(loaded.document).metrics.glyphs === 4,
	);
	const layout = layoutDocument(loaded.document);
	check(
		"Positioned and relative text owners retain matching coordinates",
		layout.contexts.every((context, index) =>
			context.glyphs.every(
				(glyph, glyphIndex) =>
					glyph.y ===
					layout.text.contexts[index].glyphs[glyphIndex].y + context.contentY,
			),
		),
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
				page: page.metrics(),
				transport: { requests, closed: transportClosed },
				fixture:
					"Existing experimental SafeJS, production CLI, native geometry/raster/PDF over one synthetic document; no sockets",
				limitations:
					"Not a real-site, released-runtime throughput, full CSS, live terminal/playground or deployment acceptance test",
			},
			null,
			2,
		),
	);
}
