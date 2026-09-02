import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import {
	type SnapshotSearch,
	renderSnapshotSearch,
} from "../src/snapshot-search.js";
import type { SemanticSnapshot } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const checks: { label: string; passed: boolean }[] = [];
const owners = new Map<DocumentTree, PageScripts>();
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
					'<main><h1>Shop</h1><button id="buy">Buy item</button><p>Price $12.34</p><input type="password" value="fixture-password"><p hidden>hidden-marker</p></main>',
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
async function find(query: string, ...options: string[]) {
	return (await host.execute(["find", query, ...options]))
		.data as SnapshotSearch;
}
try {
	await host.execute(["open", "https://example.com/"]);
	const baseline = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	const found = await find("Buy item");
	check(
		"Shared command-host find returns an actionable ref with snapshot context",
		found.matched === 1 &&
			found.matches[0].context.some((line) => line.text.includes("Buy item")),
	);
	check(
		"Common price and case-insensitive regex searches work without page evaluation",
		(await find("\\$[0-9]+\\.[0-9]{2}", "--regex")).matched === 1 &&
			(await find("/buy (item|product)/i", "--regex")).matched === 1,
	);
	check(
		"Search excludes hidden content and protected password values",
		(await find("hidden-marker")).matched === 0 &&
			(await find("fixture-password")).matched === 0,
	);
	const evaluation = (
		await host.execute([
			"eval",
			'document.getElementById("buy").addEventListener("click", function() { this.textContent = "Purchased"; });',
		])
	).data as ScriptEvaluation;
	if (!evaluation.ok)
		throw new Error("Search fixture listener evaluation failed");
	await host.execute(["click", found.matches[0].ref]);
	const updated = await find("Purchased");
	check(
		"The found ref activates the interpreted handler and search sees its live mutation",
		updated.matched === 1 &&
			updated.matches[0].ref === found.matches[0].ref &&
			(await find("Buy item")).matched === 0,
	);
	const diff = (await host.execute(["snapshot", "--diff"])).data as {
		reset: boolean;
		fromRevision?: number;
	};
	check(
		"Search does not consume the host snapshot-diff baseline",
		diff.reset === false && diff.fromRevision === baseline.revision,
	);
	const limited = await find(
		".",
		"--regex",
		"--max-results=1",
		"--context=0",
		"--max-bytes=1024",
	);
	check(
		"Result and UTF-8 budgets report omitted matches explicitly",
		limited.matches.length === 1 &&
			limited.matched > 1 &&
			limited.resultsTruncated &&
			new TextEncoder().encode(JSON.stringify(limited)).byteLength <= 1024,
	);
	let bounded = false;
	try {
		await find("(a{128}){128}", "--regex");
	} catch (error) {
		bounded =
			error instanceof AgentBrowserError && error.code === "resource-limit";
	}
	check(
		"Oversized regex compilation fails safely and the command queue remains usable",
		bounded &&
			(await find("Purchased")).matched === 1 &&
			host.metrics().pendingCommands === 0,
	);
	check(
		"Plain search rendering includes stable paths and highlighted context lines",
		renderSnapshotSearch(updated).includes(
			`Path: ${[...updated.matches[0].path, updated.matches[0].ref].join(" > ")}`,
		) && renderSnapshotSearch(updated).includes("> "),
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
				scope: "existing-experimental-core-in-memory-command-host",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
