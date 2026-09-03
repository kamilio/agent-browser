import { cpus } from "node:os";
import { AgentBrowserError } from "../src/errors.js";
import { resolveDocumentBlockWidths } from "../src/formatting-tree.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const profiles: Readonly<Record<string, number>> = Object.freeze({
	small: 100,
	medium: 1000,
	large: 5000,
});
const profile = process.argv[2] ?? "small";
if (!Object.hasOwn(profiles, profile) || process.argv.length > 3)
	throw new Error("Choose small, medium or large");
const rows = profiles[profile];
const startedAt = new Date().toISOString();
const started = performance.now();
const cpu = process.cpuUsage();
const readyMs = process.uptime() * 1000;
const checks: { label: string; passed: boolean }[] = [];
const samples: {
	stage: string;
	rss: number;
	heapUsed: number;
	heapTotal: number;
}[] = [];
function sample(stage: string) {
	const memory = process.memoryUsage();
	samples.push({
		stage,
		rss: memory.rss,
		heapUsed: memory.heapUsed,
		heapTotal: memory.heapTotal,
	});
}
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
sample("ready");
const source = `<!doctype html><style>main{width:80%;margin:auto;padding:10px}.box{width:50%;margin:auto}</style><main>${Array.from({ length: rows }, (_, index) => `<span>Before<div class="box" data-row="${index}">Row ${index}</div>After</span>`).join("")}</main>`;
const parseStart = performance.now();
const tree = parseHtmlDocument(source, "https://example.com/");
const parseMs = performance.now() - parseStart;
const ownedNodes = tree.nodeCount;
let completed = false;
let closed = false;
tree.onClose(() => {
	closed = true;
});
try {
	documentStyles(tree).setViewport(1000, 600);
	sample("parsed");
	const layoutStart = performance.now();
	const result = resolveDocumentBlockWidths(tree);
	const formattingAndWidthsMs = performance.now() - layoutStart;
	sample("formatted");
	const queries = new DocumentQueries(tree);
	const rowIds = queries.querySelectorAll(".box");
	const rowRefs = new Set(rowIds.map((id) => tree.reference(id)));
	const rowWidths = result.widths.filter(
		(entry) => entry.ref !== undefined && rowRefs.has(entry.ref),
	);
	check(
		"Every source row has a real block width result",
		rowWidths.length === rows,
	);
	check(
		"Percentages and accumulated positions use the actual derived containing block",
		rowWidths.every(
			(entry) =>
				entry.containingWidth === 800 &&
				entry.contentWidth === 400 &&
				entry.contentX === 300,
		),
	);
	check(
		"Each source inline owner splits into two fragments",
		result.formatting.nodes.filter((node) => node.kind === "inline").length ===
			rows * 2,
	);
	check(
		"Adjacent inline tails and heads share the expected anonymous runs",
		result.formatting.nodes.filter((node) => node.kind === "anonymous-block")
			.length ===
			rows + 1,
	);
	check(
		"All raw source text records survive without duplication",
		result.formatting.nodes.filter((node) => node.kind === "text").length ===
			rows * 3,
	);
	check(
		"All returned widths satisfy the normal-flow equation",
		result.widths.every(
			(entry) =>
				Math.abs(
					entry.marginLeft +
						entry.borderBoxWidth +
						entry.marginRight -
						entry.containingWidth,
				) < 1e-7,
		),
	);
	check(
		"The formatting profile has no deferred or silently ignored CSS",
		result.formatting.metrics.deferredSubtrees === 0 &&
			Object.keys(result.formatting.issues).length === 0,
	);
	queries.close();
	tree.close();
	sample("closed-with-result-retained");
	check(
		"Closing the owner leaves only caller-retained immutable result data",
		closed &&
			Object.isFrozen(result) &&
			Object.isFrozen(result.formatting.nodes),
	);
	let rejected = false;
	try {
		resolveDocumentBlockWidths(tree);
	} catch (error) {
		rejected = error instanceof AgentBrowserError && error.code === "closed";
	}
	check("Closed owners reject fresh formatting operations", rejected);
	completed = true;
	const usage = process.cpuUsage(cpu);
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope: "native-formatting-and-horizontal-widths-no-js-network-or-paint",
				runtime: {
					version: process.version,
					platform: process.platform,
					architecture: process.arch,
					cpuModel: cpus()[0]?.model,
				},
				profile,
				rows,
				sourceBytes: new TextEncoder().encode(source).byteLength,
				ownedNodes,
				readyMs,
				parseMs,
				formattingAndWidthsMs,
				elapsedMs: performance.now() - started,
				cpuMs: (usage.user + usage.system) / 1000,
				peakProcessRssBytes: process.resourceUsage().maxRSS * 1024,
				samples,
				formatting: result.formatting.metrics,
				resolvedBlocks: result.widths.length,
				completed,
				checks,
				limitations: [
					"One synthetic fresh-process observation; no statistical comparison or real-site acceptance.",
					"No interpreter, sockets, external browser, vertical layout, fonts, painting or client rectangles.",
					"RSS includes Node, source, DOM, styles, intermediate/results and instrumentation; close does not force garbage collection.",
					"The immutable formatting result remains retained by the caller after document close.",
					"readyMs is in-process uptime after static imports, not parent-observed CLI startup.",
				],
			},
			null,
			2,
		),
	);
} finally {
	tree.close();
	if (!completed)
		console.log(
			JSON.stringify({ startedAt, profile, rows, completed, closed, checks }),
		);
}
