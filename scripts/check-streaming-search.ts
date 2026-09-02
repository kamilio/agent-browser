import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import type { SnapshotSearch } from "../src/snapshot-search.js";
import type { SemanticSnapshot } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const checks: { label: string; passed: boolean }[] = [];
const owners = new Map<DocumentTree, PageScripts>();
const source = `<main><ul>${Array.from(
	{ length: 5500 },
	(_, index) =>
		`<li><button id="row-${index}">Row ${index} action</button></li>`,
).join("")}</ul></main>`;
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
				parseHtmlDocument(source, response.url, {
					limits: context.limits,
					signal: context.signal,
				}),
		}),
	evaluatePage: (page, code, signal) => {
		let owner = owners.get(page.document);
		if (!owner) {
			owner = new PageScripts(
				{ document: page.document, interactions: page.interactions },
				core,
			);
			owners.set(page.document, owner);
		}
		return owner.evaluate(code, { signal });
	},
});
let completed = false;
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
async function evaluate(code: string) {
	const result = (await host.execute(["eval", code])).data as ScriptEvaluation;
	if (!result.ok) throw new Error("Streaming search evaluation failed");
	return result.value;
}
try {
	await host.execute(["open", "https://example.com/"]);
	const root = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	check(
		"The ordinary root snapshot is explicitly truncated on the large fixture",
		root.truncated,
	);
	check(
		"Actual interpreted code installs a listener on the final parsed button",
		(await evaluate(`
var clicks = 0; var tail = document.getElementById("row-5499");
tail.addEventListener("click", function() { clicks++; tail.textContent = "Updated end"; });
return tail.textContent === "Row 5499 action";
`)) === true,
	);
	const search = (await host.execute(["find", "Row 5499 action"]))
		.data as SnapshotSearch;
	check(
		"Streaming native search reaches the final button beyond ten thousand entries",
		search.scannedEntries > 10_000 &&
			search.matched === 1 &&
			search.matches.length === 1 &&
			!search.truncated,
	);
	const ref = search.matches[0].ref;
	const baseline = (await host.execute(["snapshot", ref]))
		.data as SemanticSnapshot;
	check(
		"A search result supports fresh complete scoped inspection",
		!baseline.truncated && baseline.entries.some((entry) => entry.ref === ref),
	);
	await host.execute(["click", ref]);
	const updated = (await host.execute(["find", "Updated end"]))
		.data as SnapshotSearch;
	check(
		"Activating the streamed reference runs its real interpreted listener exactly once",
		updated.matched === 1 &&
			updated.matches[0].ref === ref &&
			!updated.truncated &&
			(await evaluate("return clicks;")) === 1,
	);
	const count = (
		await host.execute(["find", "Row ", "--max-results=1", "--context=0"])
	).data as SnapshotSearch;
	check(
		"Returned results stay bounded while the complete streamed match count is preserved",
		count.matched === 5499 &&
			count.matches.length === 1 &&
			count.resultsTruncated &&
			!count.snapshotTruncated,
	);
	const diff = (await host.execute(["snapshot", ref, "--diff"])).data as {
		reset: boolean;
		fromRevision?: number;
	};
	check(
		"Full-document streaming search does not consume the scoped snapshot diff baseline",
		!diff.reset && diff.fromRevision === baseline.revision,
	);
	let rejected = false;
	try {
		await host.execute(["find", "(x)\\1", "--regex"]);
	} catch (error) {
		rejected =
			error instanceof AgentBrowserError && error.code === "unsupported";
	}
	check(
		"Invalid regex fails without poisoning the command queue",
		rejected &&
			(await evaluate("return clicks;")) === 1 &&
			host.metrics().pendingCommands === 0,
	);
	host.close();
	for (const owner of owners.values()) await owner.close();
	check(
		"Closing the session revokes the large document's interpreted owner",
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
				scope: "existing-experimental-core-in-memory-large-native-document",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
