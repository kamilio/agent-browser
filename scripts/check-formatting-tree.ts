import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "../src/formatting-tree.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { DocumentQueries } from "../src/selectors.js";
import { BrowserSession } from "../src/session.js";
import type { SemanticSnapshot } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const checks: { label: string; passed: boolean }[] = [];
let current: DocumentTree | undefined;
const host = new BrowserCommandHost({
	createSession: () =>
		new BrowserSession({
			createTransport: () => ({
				async request(input) {
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
					requests: 0,
					active: 0,
					redirects: 0,
					encodedBytes: 0,
					decodedBytes: 0,
					closed: false,
				}),
				close() {},
			}),
			loadDocument: (response, context) => {
				current = parseHtmlDocument(
					'<main id="container" style="width:50%;padding:10px;margin:auto"><span id="outer">Before<div id="child" style="width:50%;margin:auto">Inside</div>After</span></main><button id="activate">Activate</button>',
					response.url,
					{ limits: context.limits, signal: context.signal },
				);
				return current;
			},
		}),
	evaluatePage: (page, source, signal) => {
		let owner = owners.get(page.document);
		if (!owner) {
			owner = new PageScripts(
				{ document: page.document, interactions: page.interactions },
				core,
			);
			owners.set(page.document, owner);
		}
		return owner.evaluate(source, { signal });
	},
});
let completed = false;
function document() {
	if (!current) throw new Error("Missing formatting fixture document");
	return current;
}
function reference(selector: string) {
	const tree = document();
	const queries = new DocumentQueries(tree);
	try {
		const id = queries.querySelector(selector);
		if (id === null) throw new Error("Missing formatting fixture target");
		return tree.reference(id);
	} finally {
		queries.close();
	}
}
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
function widthFailure() {
	try {
		resolveDocumentBlockWidths(document());
		return "none";
	} catch (error) {
		return error instanceof AgentBrowserError ? error.code : "unexpected";
	}
}
async function evaluate(source: string) {
	const result = (await host.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok) throw new Error("Formatting tree interpreted fixture failed");
	return result.value;
}
try {
	await host.execute(["open", "https://example.com/"]);
	await host.execute(["resize", "800", "600"]);
	const baseline = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	const childRef = reference("#child");
	const outerRef = reference("#outer");
	check(
		"Unsupported native control layout is explicit instead of producing guessed document widths",
		buildFormattingTree(document()).metrics.deferredSubtrees === 1 &&
			widthFailure() === "unsupported",
	);
	await evaluate(
		'document.getElementById("activate").addEventListener("click", function() { this.style.display = "none"; document.getElementById("child").style.width = "75%"; }); document.getElementById("child").addEventListener("click", function() { this.textContent = "Clicked"; });',
	);
	await host.execute(["click", "#activate"]);
	const active = resolveDocumentBlockWidths(document());
	const child = active.widths.find((entry) => entry.ref === childRef);
	check(
		"An interpreted action reveals a supported formatting profile with document-derived containing widths",
		child?.containingWidth === 400 &&
			child.contentWidth === 300 &&
			child.contentX === 250,
	);
	check(
		"Block-in-inline decomposition creates retained-reference fragments and anonymous containers",
		active.formatting.nodes.filter((node) => node.ref === outerRef).length ===
			2 &&
			active.formatting.nodes.filter((node) => node.kind === "anonymous-block")
				.length === 2,
	);
	await host.execute(["click", childRef]);
	check(
		"A formatting reference remains a real native action target with its interpreted handler",
		(await evaluate('document.getElementById("child").textContent')) ===
			"Clicked",
	);
	await evaluate(
		'document.getElementById("outer").style.display = "contents";',
	);
	const contents = resolveDocumentBlockWidths(document());
	check(
		"Interpreted display:contents removes only formatting boxes, not DOM ownership",
		!contents.formatting.nodes.some((node) => node.ref === outerRef) &&
			contents.widths.find((entry) => entry.ref === childRef)?.contentWidth ===
				300 &&
			(await evaluate(
				'document.getElementById("child").parentNode === document.getElementById("outer")',
			)) === true,
	);
	await evaluate(
		'document.getElementById("child").style.visibility = "hidden";',
	);
	const hidden = resolveDocumentBlockWidths(document());
	check(
		"Visibility changes retain horizontal geometry while marking paint visibility",
		hidden.widths.find((entry) => entry.ref === childRef)?.contentWidth ===
			300 &&
			hidden.formatting.nodes.find((node) => node.ref === childRef)?.visible ===
				false,
	);
	await evaluate(
		'document.getElementById("child").style.visibility = "visible";',
	);
	await host.execute(["resize", "400", "600"]);
	const resized = resolveDocumentBlockWidths(document());
	check(
		"Native resize re-derives widths and accumulated horizontal offsets from the whole document",
		resized.widths.find((entry) => entry.ref === childRef)?.contentWidth ===
			150 &&
			resized.widths.find((entry) => entry.ref === childRef)?.contentX === 125,
	);
	check(
		"Saved formatting results are immutable historical data",
		child?.contentWidth === 300 && active.formatting.viewport.width === 800,
	);
	await evaluate(
		'document.getElementById("container").style.display = "grid";',
	);
	check(
		"Interpreted unsupported display mode cannot reuse stale normal-flow geometry",
		widthFailure() === "unsupported" &&
			buildFormattingTree(document()).metrics.deferredSubtrees === 1,
	);
	await evaluate(
		'document.getElementById("container").style.display = "block"; document.getElementById("container").style.position = "absolute";',
	);
	check(
		"Unresolved positioning declarations block geometry rather than being silently ignored",
		widthFailure() === "unsupported",
	);
	await evaluate(
		'document.getElementById("container").style.removeProperty("position"); document.getElementById("container").insertAdjacentHTML("afterbegin", \'<div id="added" style="width:20%">New</div>\');',
	);
	const addedRef = reference("#added");
	check(
		"Interpreted insertion produces a new formatting box with a real reference and containing width",
		resolveDocumentBlockWidths(document()).widths.find(
			(entry) => entry.ref === addedRef,
		)?.contentWidth === 40,
	);
	await evaluate('document.getElementById("added").remove();');
	check(
		"Interpreted removal disappears from the next formatting generation",
		!buildFormattingTree(document()).nodes.some(
			(node) => node.ref === addedRef,
		),
	);
	let limited = false;
	try {
		buildFormattingTree(document(), { maxBoxes: 1 });
	} catch (error) {
		limited =
			error instanceof AgentBrowserError && error.code === "resource-limit";
	}
	check(
		"A formatting budget failure preserves the page and subsequent width generation",
		limited &&
			resolveDocumentBlockWidths(document()).widths.some(
				(entry) => entry.ref === childRef,
			),
	);
	const diff = (await host.execute(["snapshot", "--diff"])).data as {
		reset: boolean;
		fromRevision?: number;
	};
	check(
		"Formatting and width reads preserve the shared snapshot diff baseline",
		!diff.reset && diff.fromRevision === baseline.revision,
	);
	host.close();
	for (const owner of owners.values()) await owner.close();
	check(
		"Closing the actual page revokes fresh formatting reads and its interpreter owner",
		widthFailure() === "closed" &&
			[...owners.values()].every((owner) => owner.closed),
	);
	completed = true;
} finally {
	host.close();
	for (const owner of owners.values()) await owner.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"existing-experimental-core-in-memory-display-decomposition-and-restricted-document-widths-no-vertical-layout-or-paint",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
