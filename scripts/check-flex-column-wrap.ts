import { BrowserCommandHost } from "../src/command-host.js";
import { renderDocumentPdf } from "../src/document-pdf.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { measureIntrinsicWidths } from "../src/intrinsic-widths.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { DocumentQueries } from "../src/selectors.js";
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
			'<!doctype html><style>html{font-size:8px}main{display:flex;flex-direction:column;flex-wrap:wrap;width:100px;height:45px;gap:5px;align-content:flex-start;padding:3px}main>div{width:15px;height:20px;flex:none}#first{background:red}#second{background:blue}#third{background:lime}</style><main id="container"><div id="first">A</div><div id="second">B</div><div id="third">C</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/flex-column-wrap"]);
await host.execute(["resize", "160", "100"]);
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
	const start = (y * image.width + x) * 4;
	return [...image.pixels.subarray(start, start + 4)].join(",");
}
try {
	await guest(
		"Guest geometry observes real collected columns",
		'var container = document.getElementById("container"); var first = document.getElementById("first"); var second = document.getElementById("second"); var third = document.getElementById("third"); var original = first.getBoundingClientRect(); return original.x === 3 && original.y === 3 && second.getBoundingClientRect().y === 28 && third.getBoundingClientRect().x === 23 && third.getBoundingClientRect().y === 3;',
	);
	check(
		"Column boxes paint through the shared raster owner",
		pixel(16, 15) === "255,0,0,255" &&
			pixel(16, 40) === "0,0,255,255" &&
			pixel(36, 15) === "0,255,0,255",
	);
	await guest(
		"Guest-created nested row uses a definite allocated height",
		'first.textContent = ""; var child = document.createElement("section"); child.style.display = "flex"; child.style.height = "50%"; var leaf = document.createElement("div"); leaf.style.flex = "1"; leaf.textContent = "L"; child.appendChild(leaf); first.appendChild(child); return child.getBoundingClientRect().height === 10 && leaf.getBoundingClientRect().width === 15;',
	);
	await guest(
		"Guest installs a wrap-reversal action",
		'third.addEventListener("click", function() { container.style.flexWrap = "wrap-reverse"; }); return true;',
	);
	await host.execute(["click", "#third"]);
	await guest(
		"Production CLI click changes column direction and hit targets",
		"return first.getBoundingClientRect().x === 88 && third.getBoundingClientRect().x === 68 && document.elementFromPoint(80, 15) === third;",
	);
	await guest(
		"Height mutation recollects a single column",
		'container.style.height = "70px"; return first.getBoundingClientRect().x === 88 && third.getBoundingClientRect().y === 53 && original.x === 3;',
	);
	await guest(
		"A smaller height recollects three physical columns",
		'container.style.height = "30px"; return first.getBoundingClientRect().x === 88 && second.getBoundingClientRect().x === 68 && third.getBoundingClientRect().x === 48 && third.getBoundingClientRect().y === 3;',
	);
	await guest(
		"Main reversal is independent of wrap reversal",
		'container.style.flexDirection = "column-reverse"; return first.getBoundingClientRect().y === 13 && third.getBoundingClientRect().y === 13;',
	);
	await guest(
		"Ordering changes placement but not DOM identity or order",
		'first.style.order = "2"; return first.getBoundingClientRect().x === 48 && second.getBoundingClientRect().x === 88 && container.children[0] === first && document.elementFromPoint(50, 27) === first;',
	);
	await guest(
		"Cross stretch uses actual per-column free space",
		'first.style.order = "0"; container.style.flexDirection = "column"; container.style.flexWrap = "wrap"; container.style.height = "45px"; container.style.width = "auto"; container.style.alignContent = "stretch"; first.style.width = "auto"; second.style.width = "auto"; third.style.width = "auto"; return first.getBoundingClientRect().width === 74.5 && leaf.getBoundingClientRect().width === 74.5 && third.getBoundingClientRect().x === 82.5;',
	);
	await host.execute(["resize", "120", "100"]);
	await guest(
		"CLI resize reflows stretched columns and nested content",
		'var computed = getComputedStyle(first); return first.getBoundingClientRect().width === 54.5 && computed.width === "54.5px" && leaf.getBoundingClientRect().width === 54.5 && third.getBoundingClientRect().x === 62.5;',
	);
	await guest(
		"Auto height with a maximum uses collected hypothetical line heights",
		'container.style.height = "auto"; container.style.maxHeight = "30px"; return getComputedStyle(container).height === "20px" && first.getBoundingClientRect().y === 3 && second.getBoundingClientRect().y === 3 && third.getBoundingClientRect().y === 3;',
	);
	const containerId = new DocumentQueries(loaded.document).querySelector(
		"#container",
	);
	if (containerId === null) throw new Error("Missing container");
	const measured = measureIntrinsicWidths(loaded.document).widths.find(
		(entry) => entry.ref === loaded.document.reference(containerId),
	);
	check(
		"Native intrinsic sizing consumes the guest-mutated multi-column tree",
		measured?.minContent === 6 && measured.maxContent === 28,
	);
	check(
		"PDF consumes the same positioned glyphs",
		renderDocumentPdf(loaded.document).metrics.glyphs === 3,
	);
	await guest(
		"Unsupported grid layout rejects and a supported revision recovers",
		'container.style.display = "grid"; try { first.getBoundingClientRect(); return false; } catch (error) { container.style.display = "flex"; return first.getBoundingClientRect().height === 20; }',
	);
	const capabilities = await host.execute(["capabilities"]);
	const profile = (
		capabilities.data as {
			flexStyles: {
				column: boolean;
				columnWrap: boolean;
				nestedFlex: boolean;
				inlineFlex: boolean;
			};
		}
	).flexStyles;
	check(
		"Capability advertises supported wrapping and inline flex",
		profile.column &&
			profile.columnWrap &&
			profile.nestedFlex &&
			profile.inlineFlex,
	);
	check(
		"All scripts and layout use only the synthetic document request",
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
					"Actual existing experimental SafeJS and production CLI over in-memory HTML, with native layout/raster/PDF; no sockets",
				limitations:
					"Column wrapping fixture, not full font/CSS conformance, released-runtime throughput, public-site, live interface or Worker acceptance",
			},
			null,
			2,
		),
	);
}
