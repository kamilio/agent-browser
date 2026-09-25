import { BrowserCommandHost } from "../src/command-host.js";
import { resolveDocumentBlockWidths } from "../src/formatting-tree.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { resolveFlexMainSizes } from "../src/index.js";
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
			'<!doctype html><style>html{font-size:8px}main{display:flex;width:120px}span{flex:1 1 auto}</style><main id="container"><span id="first">aa bbbb</span><span id="second">cc</span></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/flex-main"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const queries = new DocumentQueries(loaded.document);
const id = queries.querySelector("#container");
if (id === null) throw new Error("Missing flex fixture");
const reference = loaded.document.reference(id);
const resolve = (width = 120) =>
	resolveFlexMainSizes(loaded.document, reference, {
		contentWidth: width,
		contentHeight: null,
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
		"Actual SafeJS observes the native flex CSSOM and document",
		'var first = document.getElementById("first"); var second = document.getElementById("second"); var container = document.getElementById("container"); return getComputedStyle(first).flex === "1 1 auto" && first.textContent === "aa bbbb";',
	);
	const original = resolve();
	check(
		"Real intrinsic bases feed style-derived growth factors",
		original.items[0].baseSize === 42 &&
			original.items[0].minSize === 24 &&
			original.resolved.lines[0].items[0].contentSize === 75 &&
			original.resolved.lines[0].items[1].contentSize === 45,
	);
	await guest(
		"Guest text mutation reaches the same measurement owner",
		'first.textContent = "longerword"; return first.textContent === "longerword";',
	);
	const text = resolve();
	check(
		"Longer words change both the base and automatic minimum",
		text.items[0].baseSize === 60 &&
			text.items[0].minSize === 60 &&
			text.resolved.lines[0].items[0].contentSize === 84,
	);
	await guest(
		"Guest width and basis remain distinct CSSOM values",
		'first.style.width = "10px"; first.style.flexBasis = "100px"; return getComputedStyle(first).flexBasis === "100px";',
	);
	check(
		"Explicit width caps auto minimum without clamping the flex base",
		resolve().items[0].minSize === 10 && resolve().items[0].baseSize === 100,
	);
	await guest(
		"Variable flex shorthand and font mutations are interpreted",
		'first.style.width = "auto"; first.style.setProperty("--basis", "2em"); first.style.flex = "1 1 var(--basis)"; first.style.fontSize = "16px"; return getComputedStyle(first).flexBasis === "32px";',
	);
	const font = resolve();
	check(
		"Automatic minimum still comes from content when basis is smaller",
		font.items[0].baseSize === 32 &&
			font.items[0].minSize === 120 &&
			font.resolved.lines[0].remainingFreeSpace === -12,
	);
	await guest(
		"Explicit zero minimum opts into shrinkage",
		'first.style.minWidth = "0"; second.style.minWidth = "0"; return getComputedStyle(first).minWidth === "0px";',
	);
	const shrunk = resolve(22);
	check(
		"Native scaled shrink factors use real bases",
		shrunk.resolved.lines[0].items[0].contentSize === 16 &&
			shrunk.resolved.lines[0].items[1].contentSize === 6,
	);
	await guest(
		"Guest order does not mutate DOM source order",
		'first.style.order = "2"; second.style.order = "-1"; return container.children[0] === first;',
	);
	check(
		"Resolved line order retains original item indices",
		resolve()
			.resolved.lines[0].items.map((item) => item.index)
			.join(",") === "1,0",
	);
	await guest(
		"Wrapping and percentage gap mutations remain live",
		'container.style.flexWrap = "wrap"; container.style.gap = "2px 10%"; first.style.flex = "0 0 70px"; second.style.flex = "0 0 70px"; return getComputedStyle(container).columnGap === "10%";',
	);
	const wrapped = resolve();
	check(
		"The same native pipeline collects lines using resolved gaps",
		wrapped.resolved.gap === 12 &&
			wrapped.resolved.lines.length === 2 &&
			wrapped.resolved.lines.every((line) => line.items[0].contentSize === 70),
	);
	await guest(
		"Border-box zero bases preserve their authored distinction",
		'first.style.flex = "0 1 0px"; first.style.boxSizing = "border-box"; first.style.padding = "10px"; return getComputedStyle(first).flexBasis === "0px";',
	);
	const bordered = resolve();
	check(
		"Content bases can be negative while final content boxes stay nonnegative",
		bordered.items[0].baseSize === -20 &&
			bordered.items[0].borderPadding === 20 &&
			bordered.resolved.lines.some((line) =>
				line.items.some((item) => item.index === 0 && item.contentSize === 0),
			),
	);
	let rejected = false;
	try {
		resolveDocumentBlockWidths(loaded.document);
	} catch (error) {
		rejected = error instanceof Error && error.message.includes("issue-free");
	}
	check(
		"Main-size allocation does not bypass unsupported full flex geometry",
		rejected,
	);
	check(
		"Prior snapshots stay immutable and extra requests stay absent",
		original.items[0].baseSize === 42 &&
			Object.isFrozen(original.items[0]) &&
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
					"Synthetic in-memory HTML and actual experimental SafeJS; caller supplies definite content constraints; no sockets or public-site requests",
				limitations:
					"Native horizontal main-size stage, not final cross-axis geometry/paint, released-runtime, real-site, terminal/playground or Worker acceptance",
			},
			null,
			2,
		),
	);
}
