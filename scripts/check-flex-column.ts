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
			'<!doctype html><style>html{font-size:8px}main{display:flex;flex-direction:column;width:60px;height:100px;padding:3px;gap:4px}main>div{flex:1;min-height:0}#first{background:red}#second{background:blue}</style><main id="container"><div id="first">A</div><div id="second">B</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/flex-column"]);
await host.execute(["resize", "80", "80"]);
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
	return [...image.pixels.slice(start, start + 4)].join(",");
}
try {
	await guest(
		"Guest geometry observes actual vertical allocations",
		'var container = document.getElementById("container"); var first = document.getElementById("first"); var second = document.getElementById("second"); var original = first.getBoundingClientRect(); return original.x === 3 && original.y === 3 && original.width === 60 && original.height === 48 && second.getBoundingClientRect().y === 55;',
	);
	await guest(
		"Computed used styles and element sizes share column geometry",
		'var firstStyle = getComputedStyle(first); return firstStyle.height === "48px" && first.clientHeight === 48 && first.clientWidth === 60;',
	);
	check(
		"Column boxes paint at their actual page positions",
		pixel(30, 10) === "255,0,0,255" && pixel(30, 60) === "0,0,255,255",
	);
	await guest(
		"Guest-created row inside a column resolves allocated percentage height",
		'first.textContent = ""; var child = document.createElement("section"); child.style.height = "50%"; child.style.display = "flex"; child.style.background = "lime"; var leaf = document.createElement("div"); leaf.style.flex = "1"; leaf.textContent = "L"; child.appendChild(leaf); first.appendChild(child); return child.getBoundingClientRect().height === 24 && leaf.getBoundingClientRect().height === 24 && leaf.getBoundingClientRect().width === 60;',
	);
	check(
		"The mixed-axis descendant paints without rotating text",
		pixel(30, 10) === "0,255,0,255" && pixel(30, 30) === "255,0,0,255",
	);
	await guest(
		"Changing container height updates allocated and nested percentage heights",
		'container.style.height = "60px"; return firstStyle.height === "28px" && child.getBoundingClientRect().height === 14 && second.getBoundingClientRect().y === 35 && original.height === 48;',
	);
	await guest(
		"Guest installs a direction-changing action",
		'second.addEventListener("click", function() { container.style.flexDirection = "column-reverse"; }); return true;',
	);
	await host.execute(["click", "#second"]);
	await guest(
		"Production CLI click triggers column reversal and matching hit testing",
		"return first.getBoundingClientRect().y === 35 && second.getBoundingClientRect().y === 3 && document.elementFromPoint(30, 5) === second;",
	);
	await guest(
		"Order and column direction do not mutate DOM order",
		'first.style.order = "2"; second.style.order = "0"; return first.getBoundingClientRect().y === 3 && second.getBoundingClientRect().y === 35 && container.children[0] === first;',
	);
	await guest(
		"Vertical space distribution uses actual fixed item heights",
		'first.style.flex = "none"; second.style.flex = "none"; first.style.height = "10px"; second.style.height = "10px"; container.style.justifyContent = "space-between"; return first.getBoundingClientRect().y === 3 && second.getBoundingClientRect().y === 53;',
	);
	await guest(
		"Main auto margins resolve before positional alignment",
		'container.style.justifyContent = "flex-start"; first.style.marginBottom = "auto"; return firstStyle.marginBottom === "36px" && first.getBoundingClientRect().y === 3;',
	);
	await guest(
		"Percentage row gaps use the definite column height",
		'container.style.rowGap = "10%"; return firstStyle.marginBottom === "34px";',
	);
	await guest(
		"Auto container height treats cyclic gaps as zero while definite bases remain definite",
		'container.style.height = "auto"; return getComputedStyle(container).height === "20px" && child.getBoundingClientRect().height === 5 && second.getBoundingClientRect().y === 13;',
	);
	await guest(
		"An indefinite content basis does not invent a percentage-height containing block",
		'first.style.height = "auto"; first.style.flex = "1"; return first.getBoundingClientRect().height === 10 && child.getBoundingClientRect().height === 10 && leaf.getBoundingClientRect().height === 10;',
	);
	await guest(
		"Auto cross width is resolved by the current page viewport",
		'container.style.width = "auto"; return first.getBoundingClientRect().width === 74;',
	);
	await host.execute(["resize", "100", "80"]);
	await guest(
		"CLI resize reflows both column and nested row widths",
		"return first.getBoundingClientRect().width === 94 && leaf.getBoundingClientRect().width === 94 && document.elementFromPoint(80, 5) === leaf;",
	);
	check(
		"The shared PDF owner consumes mixed-axis positioned glyphs",
		renderDocumentPdf(loaded.document).metrics.glyphs === 2,
	);
	await guest(
		"Unsupported baseline line distribution remains explicit",
		'container.style.flexWrap = "wrap"; container.style.alignContent = "baseline"; try { first.getBoundingClientRect(); return false; } catch (error) { container.style.flexWrap = "nowrap"; container.style.alignContent = "normal"; return true; }',
	);
	const capabilities = await host.execute(["capabilities"]);
	const profile = (
		capabilities.data as {
			flexStyles: { column: boolean; columnWrap: boolean; nestedFlex: boolean };
		}
	).flexStyles;
	check(
		"Capability exposes columns and column wrapping",
		profile.column && profile.columnWrap && profile.nestedFlex,
	);
	check(
		"Column scripts and native reflow use only the original synthetic request",
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
					"Actual existing experimental SafeJS, production CLI and native mixed-axis geometry/raster/PDF over in-memory HTML; no sockets",
				limitations:
					"Column and column-reverse profile with nested rows/columns; no inline flex, full font/CSS conformance, released-runtime throughput, public-site, live interface or Worker acceptance",
			},
			null,
			2,
		),
	);
}
