import { BrowserCommandHost } from "../src/command-host.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "../src/formatting-tree.js";
import { parseHtmlDocument } from "../src/html-parser.js";
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
			'<!doctype html><style>html{font-size:10px}#container{display:flex;gap:1em 2rem;font-size:12px}#first{flex:2 3 1em;order:2}#flat{display:contents}#second{order:-1}</style><main id="container">before<span id="first">first</span><span id="flat"><span id="second">second</span></span></main>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/flex-styles"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const queries = new DocumentQueries(loaded.document);
const ref = (selector: string) => {
	const id = queries.querySelector(selector);
	if (id === null) throw new Error("Missing fixture target");
	return loaded.document.reference(id);
};
const formation = () => {
	const tree = buildFormattingTree(loaded.document);
	const container = tree.nodes.find((node) => node.ref === ref("#container"));
	if (!container) throw new Error("Missing flex formatting container");
	return { tree, container };
};
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
		"Actual SafeJS reads native flex longhands and shorthand aliases",
		'var container = document.getElementById("container"); var first = document.getElementById("first"); var second = document.getElementById("second"); var saved = getComputedStyle(first); return saved.flex === "2 3 12px" && saved.flexGrow === "2" && saved.flexBasis === "12px" && saved.flexFlow === "row nowrap" && saved.length === 55;',
	);
	await guest(
		"Gap font conversion and modern alignment defaults are exposed",
		'var computed = getComputedStyle(container); return computed.gap === "12px 20px" && computed.rowGap === "12px" && computed.columnGap === "20px" && computed.alignItems === "normal" && computed.alignContent === "normal";',
	);
	await guest(
		"Flex children blockify through display contents without changing authored style",
		'return saved.display === "block" && first.style.display === "" && getComputedStyle(second).display === "block" && getComputedStyle(document.getElementById("flat")).display === "contents";',
	);
	const initial = formation();
	check(
		"Anonymous text and two element items keep their source order",
		initial.container.children.length === 3 &&
			initial.tree.nodes[initial.container.children[0]].kind ===
				"anonymous-block" &&
			initial.tree.nodes[initial.container.children[1]].ref === ref("#first") &&
			initial.tree.nodes[initial.container.children[2]].ref === ref("#second"),
	);
	check(
		"Order-modified traversal is separate and stable",
		initial.container.orderModifiedChildren
			?.map((id) => initial.tree.nodes[id].ref ?? "anonymous")
			.join(",") === [ref("#second"), "anonymous", ref("#first")].join(","),
	);
	await guest(
		"Number-only shorthand preserves omitted percentage basis",
		'first.style.flex = "666"; return first.style.flex === "666 1 0%" && saved.flex === "666 1 0%";',
	);
	await guest(
		"Variables feed pending flex shorthand through the same cascade",
		'first.style.setProperty("--sizing", "2 3 2em"); first.style.flex = "var(--sizing)"; return saved.flex === "2 3 24px";',
	);
	await guest(
		"Font mutation invalidates the saved computed declaration",
		'first.style.fontSize = "8px"; return saved.flexBasis === "16px";',
	);
	await guest(
		"Invalid substituted flex shorthand becomes unset",
		'first.style.setProperty("--sizing", "1 auto 2"); return saved.flex === "0 1 auto";',
	);
	await guest(
		"Flow and gap setters expand their longhands",
		'container.style.flexFlow = "wrap column"; container.style.gap = "calc(1em + 2px) 10%"; return getComputedStyle(container).flexFlow === "column wrap" && getComputedStyle(container).gap === "14px 10%";',
	);
	await guest(
		"Explicit inheritance copies computed rather than authored font-relative values",
		'first.style.gap = "inherit"; return saved.gap === "14px 10%";',
	);
	await guest(
		"A real intervening box stops flex item blockification",
		'document.getElementById("flat").style.display = "block"; return getComputedStyle(second).display === "inline";',
	);
	await guest(
		"Removing the flex container invalidates computed blockification",
		'container.style.display = "block"; return saved.display === "inline";',
	);
	await guest(
		"Restoring flex and mutating order preserves DOM source order",
		'container.style.display = "flex"; document.getElementById("flat").style.display = "contents"; first.style.order = "-5"; return saved.display === "block" && saved.order === "-5" && container.children[0] === first;',
	);
	const changed = formation();
	check(
		"New formatting snapshot reads live order while the old snapshot stays immutable",
		changed.tree.nodes[changed.container.orderModifiedChildren?.[0] ?? -1]
			?.ref === ref("#first") &&
			initial.tree.nodes[initial.container.orderModifiedChildren?.[0] ?? -1]
				?.ref === ref("#second") &&
			Object.isFrozen(changed.container.orderModifiedChildren),
	);
	let rejected = false;
	try {
		resolveDocumentBlockWidths(loaded.document);
	} catch (error) {
		rejected = error instanceof Error && error.message.includes("issue-free");
	}
	check(
		"The width-only stage still requires a separate flex layout consumer",
		changed.container.kind === "deferred" &&
			changed.container.contentMode === "flex" &&
			changed.tree.issues["display-layout-not-supported"] === 1 &&
			rejected,
	);
	const capabilities = await host.execute(["capabilities"]);
	check(
		"CLI capability advertises the integrated block flex container profile",
		(capabilities.data as { flexStyles?: { layoutProfile?: string } })
			.flexStyles?.layoutProfile === "block-and-inline-flex-containers",
	);
	check(
		"Guest style and formation checks make no additional requests",
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
					"Synthetic in-memory HTML with actual experimental SafeJS; no sockets or public-site requests",
				limitations:
					"Computed styles and bounded item formation only, not flex sizing/geometry/paint, released SDK, throughput, real-site or Worker acceptance",
			},
			null,
			2,
		),
	);
}
