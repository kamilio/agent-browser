import { PassThrough } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { runTerminal } from "../src/node-terminal.js";
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
					`<main>${Array.from({ length: 300 }, (_, index) => `<p>Paragraph ${index}: ${"ordinary content ".repeat(24)}</p>`).join("")}<button id="buy">RemoteBuy</button></main>`,
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
const input = Object.assign(new PassThrough(), {
	isTTY: true,
	isRaw: false,
	setRawMode(raw: boolean) {
		this.isRaw = raw;
		return this;
	},
});
input.pause();
const output = Object.assign(new PassThrough(), {
	isTTY: true,
	columns: 160,
	rows: 16,
});
let screen = "";
output.on("data", (chunk) => {
	screen = (screen + chunk.toString()).slice(-64_000);
});
const requests: string[][] = [];
let running: Promise<void> | undefined;
let completed = false;
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
async function waitFor(predicate: () => boolean) {
	const deadline = Date.now() + 5000;
	while (!predicate()) {
		if (Date.now() >= deadline)
			throw new Error("Mock terminal fixture timed out");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}
function key(text: string, name?: string) {
	input.emit("keypress", text, name ? { name } : {});
}
try {
	await host.execute(["open", "https://example.com/"]);
	const baseline = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	check(
		"Target lies outside the truncated default observer snapshot",
		baseline.truncated &&
			!baseline.entries.some((entry) => entry.name.includes("RemoteBuy")),
	);
	const diffBaseline = (await host.execute(["snapshot", "--max-bytes=262144"]))
		.data as SemanticSnapshot;
	if (diffBaseline.truncated)
		throw new Error("Diff fixture requires a complete baseline");
	const evaluation = (
		await host.execute([
			"eval",
			'document.getElementById("buy").addEventListener("click", function() { this.textContent = "Purchased"; });',
		])
	).data as ScriptEvaluation;
	check(
		"Real experimental interpreter installs the click handler",
		evaluation.ok,
	);
	running = runTerminal({
		session: "default",
		input: input as unknown as ReadStream,
		output: output as unknown as WriteStream,
		pollMs: 60_000,
		execute: (argv, signal) => {
			requests.push([...argv]);
			return host.execute(argv, { signal });
		},
	});
	await waitFor(() => screen.includes("Paragraph 0"));
	key("s");
	key("RemoteBuy");
	key("", "return");
	await waitFor(() => screen.includes("1 matches in"));
	check(
		"Mock terminal finds the target beyond its retained root prefix",
		screen.includes("partial backend search") &&
			screen.includes("RemoteBuy") &&
			!requests.some((argv) => argv[0] === "click"),
	);
	key("", "return");
	await waitFor(() => screen.includes("Scoped inspection"));
	const inspection = requests.find(
		(argv) => argv[0] === "snapshot" && argv[1] !== "--observe",
	);
	check(
		"First Enter requests fresh scoped inspection without activation",
		!!inspection && !requests.some((argv) => argv[0] === "click"),
	);
	key("", "return");
	await waitFor(() => screen.includes("Purchased"));
	check(
		"Second Enter activates that ref and renders its interpreted mutation",
		requests.some(
			(argv) => argv[0] === "click" && argv[1] === inspection?.[1],
		) &&
			requests.filter(
				(argv) => argv[0] === "snapshot" && argv[1] === inspection?.[1],
			).length === 2,
	);
	key("S");
	key("/purchased/i");
	key("", "return");
	await waitFor(() => screen.includes("Regex: /purchased/i"));
	check(
		"Regex search sees the changed native snapshot without another eval",
		requests.some((argv) => argv[0] === "find" && argv.includes("--regex")) &&
			((await host.execute(["find", "Purchased"])).data as SnapshotSearch)
				.matched === 1,
	);
	key("U");
	await waitFor(() => screen.includes("Document root"));
	check(
		"Root navigation restores the ordinary observer projection",
		requests.filter((argv) => argv[0] === "snapshot" && argv[1] === "--observe")
			.length === 2,
	);
	key("q");
	await running;
	check(
		"Detaching restores mock stream state without closing the shared session",
		!input.isRaw &&
			input.isPaused() &&
			input.listenerCount("keypress") === 0 &&
			((await host.execute(["find", "Purchased"])).data as SnapshotSearch)
				.matched === 1,
	);
	const diff = (
		await host.execute(["snapshot", "--diff", "--max-bytes=262144"])
	).data as {
		reset: boolean;
		fromRevision?: number;
		updated?: { name: string }[];
	};
	check(
		"Terminal observers and searches do not consume the snapshot diff baseline",
		diff.reset === false &&
			diff.fromRevision === diffBaseline.revision &&
			!!diff.updated?.some((entry) => entry.name === "Purchased"),
	);
	completed = true;
} finally {
	input.emit("keypress", "", { ctrl: true, name: "c" });
	await running;
	host.close();
	for (const owner of owners.values()) await owner.close();
	input.destroy();
	output.destroy();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"existing-experimental-core-in-memory-command-host-mock-terminal-streams",
				realPty: false,
				realNetwork: false,
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
