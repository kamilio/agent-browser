import { BrowserCommandHost } from "../src/command-host.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { measureIntrinsicWidths } from "../src/intrinsic-widths.js";
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
			'<!doctype html><style>html{font-size:8px}#atom{display:inline-flex;gap:3px}</style><main id="host">A<span id="atom"><div id="first">bb cc</div><div id="second">dd</div></span>Z</main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/inline-flex-intrinsic"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const query = new DocumentQueries(loaded.document);
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
function sizes(
	label: string,
	selector: string,
	minimum: number,
	maximum: number,
) {
	const id = query.querySelector(selector);
	if (id === null) throw new Error(selector);
	const record = measureIntrinsicWidths(loaded.document).widths.find(
		(entry) => entry.ref === loaded.document.reference(id),
	);
	check(label, record?.minContent === minimum && record.maxContent === maximum);
}
try {
	sizes(
		"Native measurement composes inline flex with surrounding text",
		"#host",
		27,
		57,
	);
	await guest(
		"Guest sees real elements and used atomic geometry",
		'var atom = document.getElementById("atom"); var first = document.getElementById("first"); var parent = document.getElementById("host"); return atom.getBoundingClientRect().width === 45 && atom.children[0] === first && first.textContent === "bb cc";',
	);
	await guest(
		"Guest changes intrinsic text content without replacing node identity",
		'first.textContent = "bbbb"; return atom.children[0] === first;',
	);
	sizes("Intrinsic widths observe the guest content revision", "#host", 39, 51);
	await guest(
		"Guest sets an explicit atomic width",
		'atom.style.width = "20px"; return atom.style.width === "20px";',
	);
	sizes(
		"The atomic preferred width controls its outer contribution",
		"#host",
		20,
		32,
	);
	await guest(
		"Guest changes padding border and margins",
		'atom.style.padding = "2px"; atom.style.border = "1px solid red"; atom.style.marginLeft = "3px"; atom.style.marginRight = "4px"; return true;',
	);
	sizes(
		"Content-box edges participate in the parent inline contribution",
		"#host",
		33,
		45,
	);
	await guest(
		"Guest changes box sizing",
		'atom.style.boxSizing = "border-box"; return true;',
	);
	sizes("Border-box constraints retain physical margins", "#host", 27, 39);
	await guest(
		"Guest changes the atomic context to wrapped columns",
		'atom.style.cssText = "display:inline-flex;gap:3px;flex-direction:column;flex-wrap:wrap;height:10px"; return atom.style.flexDirection === "column";',
	);
	sizes(
		"Actual wrapped-column measurement supplies the inline maximum",
		"#host",
		24,
		51,
	);
	await guest(
		"Guest provides a definite percentage-height containing block",
		'parent.style.height = "46px"; atom.style.height = "50%"; return true;',
	);
	sizes(
		"Definite percentage height recollects intrinsic columns",
		"#atom",
		24,
		24,
	);
	await guest(
		"Guest reduces the containing height",
		'parent.style.height = "20px"; return true;',
	);
	sizes(
		"Reduced height creates multiple measured intrinsic columns",
		"#atom",
		24,
		39,
	);
	await guest(
		"Guest creates a nested inline flex inside a normal flex item",
		'atom.style.cssText = "display:inline-flex;gap:3px"; var inner = document.createElement("span"); inner.style.display = "inline-flex"; inner.style.gap = "2px"; var left = document.createElement("span"); left.textContent = "x"; var right = document.createElement("span"); right.textContent = "y"; inner.appendChild(left); inner.appendChild(right); first.appendChild(inner); return first.children[0] === inner;',
	);
	sizes(
		"Recursive atomic scopes use the same guest-mutated document",
		"#host",
		39,
		65,
	);
	const measured = measureIntrinsicWidths(loaded.document);
	check(
		"Intrinsic passes do not fabricate glyph output",
		measured.metrics.minText.glyphs === 0 &&
			measured.metrics.maxText.glyphs === 0,
	);
	let limited = false;
	try {
		measureIntrinsicWidths(loaded.document, {
			maxWork: measured.metrics.work - 1,
		});
	} catch (error) {
		limited =
			error instanceof AgentBrowserError && error.code === "resource-limit";
	}
	check("The recursive measurement remains under one work budget", limited);
	const capabilities = await host.execute(["capabilities"]);
	check(
		"Capability reports integrated inline-flex rendering",
		(capabilities.data as { flexStyles: { inlineFlex: boolean } }).flexStyles
			.inlineFlex === true,
	);
	check(
		"Intrinsic measurement uses only the original synthetic request",
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
					"Existing experimental SafeJS and production CLI load over in-memory HTML, with native intrinsic measurement after guest mutations; no sockets",
				limitations:
					"Intrinsic measurement regression fixture, with one used-geometry assertion; not a complete page paint/hit acceptance suite, real-site or deployment acceptance, or released-runtime throughput claim.",
			},
			null,
			2,
		),
	);
}
