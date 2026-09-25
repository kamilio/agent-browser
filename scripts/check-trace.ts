import { createHash } from "node:crypto";
import { BrowserCommandHost } from "../src/command-host.js";
import { readTrace } from "../src/capture-client.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession, type SessionPage } from "../src/session.js";
import { renderSnapshot } from "../src/snapshot.js";
import {
	describeTraceFrame,
	parseTraceForReview,
} from "../src/trace-review.js";
import {
	loadPlaygroundAssets,
	playgroundDependencyPaths,
} from "../src/node-playground-assets.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const requests: string[] = [];
const owners = new Map<SessionPage["document"], PageScripts>();
let transportClosed = false;
const session = new BrowserSession({
	createTransport: () => ({
		async request(input) {
			requests.push(input.url);
			if (input.url.includes("/failure"))
				throw new AgentBrowserError("network-error", "private-error-marker");
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
			requests: requests.length,
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
			'<main><h1>Initial heading</h1><input id="field" aria-label="Name"><input id="check" type="checkbox" aria-label="Agree"><input type="password" value="private-password-marker"><p id="status">Ready</p></main>',
			response.url,
		),
});
function owner(page: SessionPage) {
	let scripts = owners.get(page.document);
	if (!scripts) {
		scripts = new PageScripts(page, core);
		owners.set(page.document, scripts);
	}
	return scripts;
}
const host = new BrowserCommandHost({
	createSession: () => session,
	evaluatePage: (page, source, signal) =>
		owner(page).evaluate(source, { signal }),
});
const checks: { label: string; passed: boolean }[] = [];
let passed = false;
let evidence: unknown;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = (await host.execute(["eval", source])).data as {
		ok: boolean;
		value?: unknown;
		error?: unknown;
	};
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
try {
	await host.execute([
		"open",
		"https://fixture.invalid/start?token=private-query-marker",
	]);
	await guest(
		"Actual guest installs native form listeners before recording",
		'var edits = 0; document.getElementById("field").addEventListener("input", function(){ edits++; document.getElementById("status").textContent = "Edited"; }); return true;',
	);
	const first = session.page(session.tabs()[0].id);
	const initialDocument = first.document.reference(first.document.root);
	await host.execute(["tracing-start"]);
	await host.execute(["fill", "#field", "private-value-marker"]);
	await guest(
		"Guest listener ran during the traced fill command",
		'return edits === 1 && document.getElementById("status").textContent === "Edited";',
	);
	await host.execute(["check", "#check"]);
	await guest(
		"Traced guest evaluation mutates the same native document",
		'var confidential = "private-source-marker"; document.querySelector("h1").textContent = "Guest heading"; return document.getElementById("check").checked;',
	);
	await host.execute([
		"goto",
		"https://fixture.invalid/next?token=private-next-marker",
	]);
	check(
		"Navigation revokes the old interpreted page owner",
		owners.get(first.document)?.closed === true,
	);
	await guest(
		"A second actual realm can mutate the newly committed document",
		'document.querySelector("h1").textContent = "Second guest heading"; return true;',
	);
	try {
		await host.execute([
			"goto",
			"https://fixture.invalid/failure?token=private-failed-marker",
		]);
	} catch (error) {
		check(
			"Failed navigation remains an explicit command error",
			error instanceof AgentBrowserError && error.code === "network-error",
		);
	}
	const artifact = (await host.execute(["tracing-stop"])).data;
	let bytes: Uint8Array = new Uint8Array();
	await readTrace(
		(argv) => host.execute(argv),
		artifact,
		(data) => {
			bytes = data;
		},
	);
	const text = new TextDecoder().decode(bytes);
	const trace = JSON.parse(text);
	const reviewed = parseTraceForReview(bytes);
	check(
		"Strict review validation accepts actual guest-driven trace frames",
		reviewed.frames.length === trace.frames.length,
	);
	check(
		"Read-only review text retains original and changed headings",
		describeTraceFrame(reviewed.frames[0]).snapshotText.includes(
			"Initial heading",
		) &&
			describeTraceFrame(reviewed.frames[6]).snapshotText.includes(
				"Second guest heading",
			),
	);
	const assets = await loadPlaygroundAssets();
	check(
		"Built playground includes the local review interface and module routes",
		assets.html.includes('id="trace-file"') &&
			assets.script.includes('"./trace-view.js"') &&
			assets.traceView.includes('"./trace-review.js"') &&
			playgroundDependencyPaths.some(
				([key, path]) => key === "traceReview" && path === "/trace-review.js",
			),
	);
	check(
		"Export contains ordered initial/action/final frames",
		trace.frames
			.map((frame: { action: { command: string } }) => frame.action.command)
			.join(",") ===
			"tracing-start,fill,eval,check,eval,goto,eval,goto,tracing-stop",
	);
	check(
		"The original trace frame keeps its original document identity",
		trace.frames[0].snapshot.document === initialDocument,
	);
	check(
		"Input-listener DOM changes are visible in the following frame",
		renderSnapshot(trace.frames[1].snapshot).includes("Edited"),
	);
	check(
		"Native checked state is retained as semantic evidence",
		trace.frames[3].snapshot.entries.some(
			(entry: { checked?: boolean }) => entry.checked === true,
		),
	);
	check(
		"Interpreted heading changes appear in trace snapshots",
		renderSnapshot(trace.frames[4].snapshot).includes("Guest heading"),
	);
	check(
		"Navigation records a distinct native document",
		trace.frames[5].snapshot.document !== initialDocument,
	);
	check(
		"The second guest mutation is retained in its own frame",
		renderSnapshot(trace.frames[6].snapshot).includes("Second guest heading"),
	);
	check(
		"Failed navigation keeps the committed snapshot and failed network evidence",
		trace.frames[7].snapshot.document === trace.frames[6].snapshot.document &&
			trace.frames[7].network.entries[0].state === "failed" &&
			trace.frames[7].action.outcome === "threw",
	);
	check(
		"Control values, source, error messages and URL queries are omitted",
		!text.includes("private-"),
	);
	check(
		"Recording and export do not introduce extra transport requests",
		requests.length === 3,
	);
	check(
		"Export is complete within its declared byte/frame limits",
		trace.truncated === false &&
			trace.frames.length === 9 &&
			bytes.length < trace.limits.maxBytes,
	);
	await host.execute(["artifact-delete", (artifact as { id: string }).id]);
	host.close();
	for (const scripts of owners.values()) await scripts.close();
	check(
		"All interpreted owners, session artifacts and transport close",
		[...owners.values()].every((scripts) => scripts.closed) &&
			host.metrics().captureArtifacts.bytes === 0 &&
			transportClosed,
	);
	check(
		"Exported frames remain readable without a live document",
		renderSnapshot(trace.frames[0].snapshot).includes("Initial heading") &&
			renderSnapshot(trace.frames[6].snapshot).includes("Second guest heading"),
	);
	evidence = {
		bytes: bytes.length,
		frames: trace.frames.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		requests: requests.length,
		realms: owners.size,
	};
	passed = true;
} finally {
	host.close();
	for (const scripts of owners.values()) await scripts.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				checks,
				evidence,
				owners: [...owners.values()].map((scripts) => scripts.metrics()),
				fixture:
					"Actual experimental-SafeJS realms, shared command host, native snapshots and synthetic successful/failed transports; no sockets or public-site execution",
				limitations:
					"Semantic timeline replay evidence, not continuous recording, a packaged visual player, Playwright trace archive compatibility, real-site performance or deployment acceptance",
			},
			null,
			2,
		),
	);
}
