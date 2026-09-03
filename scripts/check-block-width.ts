import { resolveBlockWidth } from "../src/block-width.js";
import { BrowserCommandHost } from "../src/command-host.js";
import type { BoxStyle } from "../src/css-box.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import type { SemanticSnapshot } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const checks: { label: string; passed: boolean }[] = [];
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
			loadDocument: (response, context) =>
				parseHtmlDocument(
					'<style>#container{width:80%;margin:auto} #panel{width:50%;padding:10%;margin:auto}</style><main id="container"><div id="panel">Panel</div></main><button id="change">Constrain</button>',
					response.url,
					{ limits: context.limits, signal: context.signal },
				),
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
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
async function evaluate(source: string) {
	const result = (await host.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok) throw new Error("Block width interpreted fixture failed");
	return result.value;
}
async function box(target: string) {
	return ((await host.execute(["styles", target])).data as { box: BoxStyle })
		.box;
}
async function widths(viewport: number, direction: "ltr" | "rtl" = "ltr") {
	const container = resolveBlockWidth(await box("#container"), viewport, {
		containingDirection: direction,
	});
	const panel = resolveBlockWidth(await box("#panel"), container.contentWidth, {
		containingDirection: direction,
	});
	return { container, panel };
}
try {
	await host.execute(["open", "https://example.com/"]);
	await host.execute(["resize", "500", "400"]);
	const baseline = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	const initial = await widths(500);
	check(
		"Known fixture containing blocks resolve from the actual native author cascade",
		initial.container.contentWidth === 400 &&
			initial.container.marginLeft === 50 &&
			initial.panel.contentWidth === 200 &&
			initial.panel.borderBoxWidth === 280 &&
			initial.panel.marginLeft === 60 &&
			initial.panel.contentOffset === 100,
	);
	check(
		"Computed style percentages are not overwritten with the solver's used widths",
		(await box("#panel")).width === "50%",
	);
	await evaluate(
		'document.getElementById("change").addEventListener("click", function() { document.getElementById("panel").style.width = "80%"; document.getElementById("panel").style.maxWidth = "240px"; });',
	);
	await host.execute(["click", "#change"]);
	const maximum = (await widths(500)).panel;
	check(
		"An interpreted event changes used width and re-solves auto margins after a maximum",
		maximum.contentWidth === 240 &&
			maximum.marginLeft === 40 &&
			maximum.clampedBy === "max-width",
	);
	await evaluate('document.getElementById("panel").style.minWidth = "300px";');
	const minimum = (await widths(500)).panel;
	check(
		"Interpreted minimum sizing wins when it conflicts with the maximum",
		minimum.contentWidth === 300 &&
			minimum.marginLeft === 10 &&
			minimum.clampedBy === "min-width",
	);
	await evaluate(
		'document.getElementById("panel").style.boxSizing = "border-box";',
	);
	const borderBox = (await widths(500)).panel;
	check(
		"Interpreted box-sizing changes the constrained sizing edge without changing padding",
		borderBox.contentWidth === 220 &&
			borderBox.borderBoxWidth === 300 &&
			borderBox.marginLeft === 50,
	);
	await evaluate(
		'document.getElementById("panel").style.cssText = "width:4px;box-sizing:border-box";',
	);
	const floored = (await widths(500)).panel;
	check(
		"A too-small specified border box floors content at zero and preserves padding",
		floored.contentWidth === 0 &&
			floored.borderBoxWidth === 80 &&
			floored.marginLeft === 160,
	);
	await evaluate('document.getElementById("panel").style.cssText = "";');
	await host.execute(["resize", "250", "400"]);
	const resized = await widths(250);
	check(
		"An explicit new definite container resolves nested percentages after resize",
		resized.container.contentWidth === 200 &&
			resized.panel.contentWidth === 100 &&
			resized.panel.paddingLeft === 20 &&
			resized.panel.marginLeft === 30,
	);
	await evaluate(
		'document.getElementById("panel").style.cssText = "width:300px;padding:0";',
	);
	const leftToRight = (await widths(250)).panel;
	const rightToLeft = (await widths(250, "rtl")).panel;
	check(
		"The caller-supplied containing direction controls over-constrained auto-margin overflow",
		leftToRight.marginLeft === 0 &&
			leftToRight.marginRight === -100 &&
			rightToLeft.marginLeft === -100 &&
			rightToLeft.marginRight === 0,
	);
	await evaluate(
		'document.getElementById("panel").style.cssText = "width:auto;padding:0;margin:10px -20px";',
	);
	check(
		"Signed margins can enlarge automatic content width while preserving the equation",
		(await widths(250)).panel.contentWidth === 240,
	);
	await evaluate('document.getElementById("container").style.width = "100px";');
	check(
		"Ancestor mutation supplies a new definite width for the same retained child",
		(await widths(250)).panel.contentWidth === 140,
	);
	await evaluate(
		'document.getElementById("panel").style.width = "20000000px";',
	);
	let limited = false;
	try {
		await widths(250);
	} catch (error) {
		limited =
			error instanceof AgentBrowserError && error.code === "resource-limit";
	}
	await evaluate('document.getElementById("panel").style.width = "50px";');
	check(
		"Oversized used lengths fail without poisoning the actual interpreted owner",
		limited && (await widths(250)).panel.contentWidth === 50,
	);
	const diff = (await host.execute(["snapshot", "--diff"])).data as {
		reset: boolean;
		fromRevision?: number;
	};
	check(
		"Style reads and width resolution leave the snapshot diff baseline intact",
		!diff.reset && diff.fromRevision === baseline.revision,
	);
	host.close();
	for (const owner of owners.values()) await owner.close();
	check(
		"All actual interpreter owners close",
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
					"existing-experimental-core-in-memory-known-horizontal-normal-flow-fixture-no-formatting-tree-or-client-rectangles",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
