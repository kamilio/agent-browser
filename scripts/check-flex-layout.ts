import { BrowserCommandHost } from "../src/command-host.js";
import { layoutDocument } from "../src/document-layout.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { layoutFlexContainer } from "../src/index.js";
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
			'<!doctype html><style>html{font-size:8px}main{display:flex;height:100px;flex-wrap:wrap;row-gap:10px;align-content:flex-start;align-items:flex-start}main>div{flex:0 0 70px;min-width:0}</style><main id="container"><div id="first">aa</div><div id="second">bb</div></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/flex-layout"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const queries = new DocumentQueries(loaded.document);
const id = queries.querySelector("#container");
if (id === null) throw new Error("Missing fixture container");
const reference = loaded.document.reference(id);
const layout = () =>
	layoutFlexContainer(loaded.document, reference, {
		contentWidth: 120,
		containingWidth: 120,
		containingHeight: null,
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
		"Actual SafeJS observes the native flex document and styles",
		'var container = document.getElementById("container"); var first = document.getElementById("first"); var second = document.getElementById("second"); return getComputedStyle(container).alignContent === "flex-start";',
	);
	const original = layout();
	check(
		"Initial lines position real boxes and glyphs",
		original.contentHeight === 100 &&
			original.items[1].y === 20 &&
			original.contexts[1].glyphs[0].y === 21,
	);
	await guest(
		"Guest line distribution changes reach the native owner",
		'container.style.alignContent = "space-between"; return getComputedStyle(container).alignContent === "space-between";',
	);
	check(
		"Space-between moves the second actual line to the opposite edge",
		layout().items[1].y === 90,
	);
	await guest(
		"Guest stretch changes line sizing and item reflow",
		'container.style.alignContent = "stretch"; container.style.alignItems = "stretch"; return getComputedStyle(container).alignItems === "stretch";',
	);
	const stretched = layout();
	check(
		"Line stretch retains main sizes and reflows to actual cross sizes",
		stretched.items.every(
			(item) => item.box.contentWidth === 70 && item.box.contentHeight === 45,
		) &&
			stretched.items[1].y === 55 &&
			stretched.metrics.reflowPasses === 2,
	);
	await guest(
		"A guest-created percentage descendant participates in the second pass",
		'second.textContent = ""; var child = document.createElement("div"); child.setAttribute("id", "child"); child.style.height = "50%"; second.appendChild(child); return document.getElementById("child") === child;',
	);
	const withChild = layout();
	const childId = queries.querySelector("#child");
	if (childId === null) throw new Error("Missing guest child");
	check(
		"Percentage descendants resolve from their stretched line item",
		withChild.items[1].y === 60 &&
			withChild.items[1].box.contentHeight === 40 &&
			withChild.boxes.find(
				(box) => box.ref === loaded.document.reference(childId),
			)?.contentHeight === 20,
	);
	await guest(
		"Guest wrap reversal does not mutate DOM order",
		'container.style.flexWrap = "wrap-reverse"; return container.children[0] === first;',
	);
	const reversed = layout();
	check(
		"Wrap-reverse transforms line and descendant coordinates",
		reversed.items[0].y === 50 &&
			reversed.items[1].y === 0 &&
			reversed.boxes.find(
				(box) => box.ref === loaded.document.reference(childId),
			)?.borderY === 0,
	);
	await guest(
		"Guest order remains distinct from source identity",
		'second.style.order = "-1"; first.style.order = "2"; return container.children[0] === first;',
	);
	const ordered = layout();
	check(
		"Painting order and reversed visual line positions stay separate",
		ordered.items[0].y === 0 &&
			ordered.items[1].y === 60 &&
			ordered.paintOrder[0] === ordered.items[1].id,
	);
	await guest(
		"Guest fonts feed actual baseline groups",
		'container.style.flexWrap = "nowrap"; container.style.height = "60px"; container.style.alignItems = "baseline"; second.textContent = "b"; second.style.fontSize = "16px"; first.textContent = "a"; return getComputedStyle(second).fontSize === "16px";',
	);
	const baseline = layout();
	check(
		"Mixed font boxes align their real baselines",
		baseline.items[0].y === 8 &&
			baseline.items[1].y === 0 &&
			baseline.items.every((item) => item.firstBaseline === 16),
	);
	await guest(
		"Guest safe alignment handles reversed overflow",
		'container.style.flexDirection = "row-reverse"; container.style.justifyContent = "safe center"; return getComputedStyle(container).justifyContent === "safe center";',
	);
	check(
		"Safe reversed overflow anchors to physical start",
		layout()
			.items.map((item) => item.x)
			.join(",") === "0,70",
	);
	await guest(
		"Guest cross auto margins override baseline alignment",
		'second.style.marginTop = "auto"; return second.style.marginTop === "auto";',
	);
	const automatic = layout();
	check(
		"Auto cross margins move the actual box and text together",
		automatic.items[0].y === 0 &&
			automatic.items[1].y === 40 &&
			automatic.contexts[1].lines[0].baseline === 56,
	);
	const documentLayout = layoutDocument(loaded.document);
	check(
		"The separate page pipeline now includes supported horizontal containers",
		documentLayout.boxes.some((box) => box.ref === reference) &&
			documentLayout.text.horizontal.formatting.revision ===
				loaded.document.revision,
	);
	check(
		"Original geometry remains immutable and no extra requests occur",
		original.items[1].y === 20 &&
			Object.isFrozen(original.contexts[1].glyphs) &&
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
					"Synthetic in-memory HTML with actual experimental SafeJS and caller-supplied containing-block constraints; no sockets or public-site requests",
				limitations:
					"Horizontal flex profile, not nested/column/inline-flex, released-runtime, real-site, terminal/playground or Worker acceptance",
			},
			null,
			2,
		),
	);
}
