import { BrowserCommandHost } from "../src/command-host.js";
import { layoutDocument } from "../src/document-layout.js";
import { resolveDocumentBlockWidths } from "../src/formatting-tree.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { reflowFlexItems } from "../src/index.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
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
			'<!doctype html><style>html{font-size:8px}main{display:flex}#item{flex:1 1 auto;min-width:0}</style><main id="container"><div id="item">aa bbbb cc</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/flex-reflow"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const queries = new DocumentQueries(loaded.document);
const id = queries.querySelector("#container");
if (id === null) throw new Error("Missing fixture container");
const reference = loaded.document.reference(id);
const reflow = (width = 30, height: number | null = null) =>
	reflowFlexItems(loaded.document, reference, {
		contentWidth: width,
		contentHeight: height,
	});
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
try {
	await guest(
		"Actual SafeJS reads the native flex item",
		'var item = document.getElementById("item"); return getComputedStyle(item).flex === "1 1 auto" && item.textContent === "aa bbbb cc";',
	);
	const wide = reflow(120);
	check(
		"Wide allocation produces one actual native text line",
		wide.items[0].box.contentWidth === 120 &&
			wide.items[0].box.contentHeight === 10 &&
			wide.layout.contexts[0].lines.length === 1,
	);
	const narrow = reflow();
	check(
		"Allocated narrower width triggers real reflow rather than scaling",
		narrow.items[0].box.contentWidth === 30 &&
			narrow.items[0].box.contentHeight === 30 &&
			narrow.layout.contexts[0].lines.length === 3 &&
			narrow.layout.contexts[0].glyphs.every((glyph) => glyph.fontSize === 8),
	);
	await guest(
		"Guest font mutations update the existing style owner",
		'item.style.fontSize = "16px"; return getComputedStyle(item).fontSize === "16px";',
	);
	const font = reflow();
	check(
		"Font changes alter line metrics and preserve unbreakable overflow",
		font.items[0].box.contentHeight === 60 &&
			font.layout.contexts[0].lines[1].overflow === 18,
	);
	await guest(
		"Guest whitespace changes remain live",
		'item.style.whiteSpace = "nowrap"; return getComputedStyle(item).whiteSpace === "nowrap";',
	);
	const nowrap = reflow();
	check(
		"No-wrap reflow keeps the native wide text line",
		nowrap.layout.contexts[0].lines.length === 1 &&
			nowrap.items[0].box.contentHeight === 20 &&
			nowrap.layout.contexts[0].lines[0].overflow === 90,
	);
	await guest(
		"Guest text replacement and border styles use native mutations",
		'item.style.fontSize = "8px"; item.style.whiteSpace = "normal"; item.style.padding = "2px"; item.style.border = "1px solid red"; item.textContent = "longerword"; return item.textContent === "longerword";',
	);
	const bordered = reflow(36);
	check(
		"Root edges and source glyph positions share item-local coordinates",
		bordered.items[0].box.contentWidth === 30 &&
			bordered.items[0].box.borderBoxHeight === 16 &&
			bordered.layout.contexts[0].glyphs[0].x === 3 &&
			bordered.layout.contexts[0].glyphs[0].y === 4,
	);
	await guest(
		"Explicit cross height does not rewrite the text source",
		'item.style.height = "40px"; return item.textContent === "longerword";',
	);
	const fixed = reflow(36);
	check(
		"Cross constraints retain natural reflow height separately",
		fixed.items[0].box.contentHeight === 40 &&
			fixed.items[0].box.naturalContentHeight === 10 &&
			fixed.items[0].box.borderBoxHeight === 46,
	);
	await guest(
		"A guest-created percentage-height descendant uses the same document",
		'item.style.height = "auto"; item.textContent = ""; var child = document.createElement("div"); child.setAttribute("id", "child"); child.style.height = "50%"; item.appendChild(child); return document.getElementById("child") === child;',
	);
	const stretched = reflow(36, 60);
	const childId = queries.querySelector("#child");
	if (childId === null) throw new Error("Missing guest-created child");
	const childBox = stretched.layout.boxes.find(
		(box) => box.ref === loaded.document.reference(childId),
	);
	check(
		"Definite stretch reaches percentage descendants before height layout",
		stretched.items[0].box.contentHeight === 54 &&
			stretched.items[0].box.naturalContentHeight === 27 &&
			childBox?.contentHeight === 27 &&
			childBox.containingHeight === 54,
	);
	await guest(
		"Guest alignment changes revoke the stretch prerequisite",
		'item.style.alignSelf = "flex-start"; return getComputedStyle(item).alignSelf === "flex-start";',
	);
	const natural = reflow(36, 60);
	check(
		"Without stretch, indefinite descendant percentages do not use viewport height",
		natural.items[0].box.contentHeight === 0 &&
			natural.layout.boxes.find(
				(box) => box.ref === loaded.document.reference(childId),
			)?.containingHeight === null,
	);
	let rejected = false;
	try {
		resolveDocumentBlockWidths(loaded.document);
	} catch (error) {
		rejected = error instanceof Error && error.message.includes("issue-free");
	}
	const pageLayout = layoutDocument(loaded.document);
	check(
		"Item-local reflow remains separate from the supported page path and unsupported width-only path",
		rejected &&
			natural.layout.stage === "isolated-block-layout" &&
			pageLayout.stage === "normal-flow-document-layout" &&
			pageLayout.boxes.some((box) => box.ref === natural.items[0].box.ref),
	);
	check(
		"Prior reflow records stay immutable after guest changes",
		wide.items[0].box.contentHeight === 10 &&
			Object.isFrozen(wide.items[0].box) &&
			Object.isFrozen(narrow.layout.contexts[0].glyphs),
	);
	check("Reflow and guest mutations make no extra requests", requests === 1);
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
					"Synthetic in-memory HTML and actual experimental SafeJS; explicit caller-supplied flex content constraints; no sockets or public-site requests",
				limitations:
					"Primarily item-local width/text/height reflow, with one shared page-path assertion; not general rendering, released runtime, real sites, terminal/playground or Worker acceptance",
			},
			null,
			2,
		),
	);
}
