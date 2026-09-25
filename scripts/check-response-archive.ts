import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { documentScriptState } from "../src/document-script-state.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { documentInteractions } from "../src/interactions.js";
import type { NetworkResponse } from "../src/network.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { ResponseArchive } from "../src/response-archive.js";
import { ScriptLoader } from "../src/script-loader.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const origin = "https://fixture.invalid";
const fixtures = new Map<string, [string, string]>([
	[
		`${origin}/page`,
		[
			"text/html",
			'<!doctype html><link rel="stylesheet" href="/site.css"><body><button id="go">Increment</button><p id="status">Before script</p><script src="/app.js" defer></script></body>',
		],
	],
	[
		`${origin}/site.css`,
		[
			"text/css",
			"html,body{margin:0;padding:0}#status{width:150px;height:24px;background:red;font-size:8px}#status.done{background:blue}",
		],
	],
	[
		`${origin}/app.js`,
		[
			"text/javascript",
			'var count = 0; var status = document.getElementById("status"); status.textContent = "Ready"; document.getElementById("go").addEventListener("click", function() { count = count + 1; status.textContent = "Count " + count; status.setAttribute("class", "done"); });',
		],
	],
]);
const checks: { label: string; passed: boolean }[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
const archive = new ResponseArchive();
let replay: ResponseArchive | undefined;
let passed = false;

async function run(mode: "record" | "replay", responses: ResponseArchive) {
	const owners = new Map<DocumentTree, PageScripts>();
	let requests = 0;
	let closed = false;
	const ownerFor = (document: DocumentTree) => {
		let owner = owners.get(document);
		if (!owner) {
			owner = new PageScripts(
				{ document, interactions: documentInteractions(document) },
				core,
			);
			owners.set(document, owner);
		}
		return owner;
	};
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
				if (closed)
					throw new AgentBrowserError("closed", "Fixture transport closed");
				requests++;
				if (mode === "replay") return responses.take(input);
				const fixture = fixtures.get(input.url);
				if (!fixture)
					throw new AgentBrowserError("not-found", "Missing synthetic fixture");
				const body = new TextEncoder().encode(fixture[1]);
				const response: NetworkResponse = {
					url: input.url,
					status: 200,
					headers: { "content-type": [fixture[0]] },
					body,
					redirects: [],
					encodedBytes: body.length,
					elapsedMs: 0,
				};
				responses.record(input, response);
				return response;
			},
			metrics: () => ({
				requests,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				active: 0,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: (response, context) =>
			loadBrowserDocument(response, {
				...context,
				scripts: new ScriptLoader({
					response,
					signal: context.signal,
					fetch: context.fetchScript,
					owner: ownerFor,
				}),
			}),
	});
	const host = new BrowserCommandHost({
		createSession: () => session,
		websiteScripts: true,
		evaluatePage: (page, source, signal) =>
			ownerFor(page.document).evaluate(source, { signal }),
	});
	try {
		await host.execute(["open", `${origin}/page`]);
		await host.execute(["resize", "200", "100"]);
		const page = session.page(session.tabs()[0].id);
		const status = page.queries.querySelector("#status");
		if (status === null) throw new Error("Missing native status element");
		const report = documentScriptState(page.document)?.report;
		check(
			`${mode}: external classic script executes through the production loader`,
			report?.executed === 1 && report.failed === 0 && report.complete,
		);
		check(
			`${mode}: JavaScript changes native DOM before interaction`,
			page.document.textContent(status) === "Ready",
		);
		const owner = ownerFor(page.document);
		const css = await owner.evaluate(
			'return getComputedStyle(document.getElementById("status")).width === "150px";',
		);
		check(
			`${mode}: archived external stylesheet reaches native computed styles`,
			css.ok && css.value === true,
		);
		const pixels = () =>
			createHash("sha256")
				.update(rasterizeDocument(page.document).image.pixels)
				.digest("hex");
		const before = pixels();
		await host.execute(["click", "#go"]);
		check(
			`${mode}: native CLI click invokes the interpreted listener`,
			page.document.textContent(status) === "Count 1",
		);
		const after = pixels();
		check(
			`${mode}: interaction changes native raster pixels`,
			before !== after,
		);
		check(
			`${mode}: exactly HTML, CSS and JavaScript resources are used`,
			requests === 3,
		);
		return { before, after, requests };
	} finally {
		for (const owner of owners.values()) await owner.close();
		host.close();
		check(
			`${mode}: interpreted owners and fixture transport close`,
			closed && [...owners.values()].every((owner) => owner.closed),
		);
	}
}

try {
	const recorded = await run("record", archive);
	replay = ResponseArchive.parse(archive.serialize());
	fixtures.clear();
	const replayed = await run("replay", replay);
	check(
		"Replayed before/after raster hashes exactly match recorded fixture execution",
		JSON.stringify(recorded) === JSON.stringify(replayed),
	);
	check(
		"All recorded response entries are consumed exactly once",
		replay.metrics().remaining === 0 && replay.metrics().reads === 3,
	);
	passed = true;
} finally {
	const recordedMetrics = archive.metrics();
	const replayMetrics = replay?.metrics();
	archive.close();
	replay?.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				checks,
				recorded: recordedMetrics,
				replayed: replayMetrics,
				closed: { recorded: archive.metrics(), replayed: replay?.metrics() },
				fixture:
					"Synthetic in-memory HTML/CSS/JavaScript only; source map cleared before replay; no network, sockets, captured public bodies or live websites",
				runtime:
					"Existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"Logical response archive only, not a NetworkTransport or session/cookie/redirect-side-effect recording. No original latency or completion scheduling is replayed.",
			},
			null,
			2,
		),
	);
}
