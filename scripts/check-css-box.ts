import { BrowserCommandHost } from "../src/command-host.js";
import type { BoxStyle } from "../src/css-box.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import type { SemanticSnapshot } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const checks: { label: string; passed: boolean }[] = [];
const requested: string[] = [];
const html =
	'<!doctype html><link rel="stylesheet" href="/box.css"><style>#parent{width:2in;box-sizing:border-box} #panel{width:50vw;height:10vh;padding:10px 20px;margin-left:5%} @media(max-width:400px){#panel{padding:3px}}</style><section id="parent"><div id="child" style="all:inherit"></div></section><div id="panel">Panel</div><div id="priority">Priority</div><button id="resize">Update width</button>';
const host = new BrowserCommandHost({
	createSession: () =>
		new BrowserSession({
			createTransport: () => {
				let closed = false;
				let count = 0;
				let bytes = 0;
				return {
					async request(input) {
						if (closed || input.signal?.aborted)
							throw new Error("Closed mock transport");
						requested.push(input.url);
						count++;
						const css = new URL(input.url).pathname === "/box.css";
						const body = new TextEncoder().encode(
							css ? "#priority{width:11px!important;padding:2px}" : html,
						);
						bytes += body.byteLength;
						return {
							url: input.url,
							status: 200,
							headers: {
								"content-type": [css ? "text/css" : "text/html; charset=utf-8"],
							},
							body,
							redirects: [],
							encodedBytes: body.byteLength,
							elapsedMs: 0,
						};
					},
					metrics: () => ({
						requests: count,
						active: 0,
						redirects: 0,
						encodedBytes: bytes,
						decodedBytes: bytes,
						closed,
					}),
					close() {
						closed = true;
					},
				};
			},
			loadDocument: loadBrowserDocument,
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
	if (!result.ok) throw new Error("CSS box interpreted fixture failed");
	return result.value;
}
async function inspect(target: string) {
	return (await host.execute(["styles", target])).data as {
		box: BoxStyle;
		visible: boolean;
		layout: false;
		partial: true;
	};
}
try {
	await host.execute(["open", "https://example.com/"]);
	const baseline = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	check(
		"The real document loader retrieves the linked sheet through the in-memory transport",
		requested.length === 2 && requested[1] === "https://example.com/box.css",
	);
	const initial = await inspect("#panel");
	check(
		"Host box values compute viewport units but retain percentages and no layout claim",
		initial.box.width === "640px" &&
			initial.box.height === "72px" &&
			initial.box["margin-left"] === "5%" &&
			initial.layout === false,
	);
	check(
		"External author CSS participates in the shared native cascade",
		(await inspect("#priority")).box.width === "11px",
	);
	await evaluate(
		'document.getElementById("resize").addEventListener("click", function() { document.getElementById("panel").style.width = "12.5%"; });',
	);
	await host.execute(["click", "#resize"]);
	check(
		"A native click runs the actual interpreted handler and changes box declarations",
		(await inspect("#panel")).box.width === "12.5%",
	);
	await evaluate(
		'document.getElementById("panel").style.removeProperty("width");',
	);
	await host.execute(["resize", "320", "600"]);
	const resized = await inspect("#panel");
	check(
		"Logical resize recomputes viewport dimensions and matching media declarations",
		resized.box.width === "160px" &&
			resized.box.height === "60px" &&
			resized.box["padding-top"] === "3px",
	);
	await evaluate('document.getElementById("priority").style.width = "2px";');
	check(
		"An interpreted ordinary inline write does not defeat stylesheet importance",
		(await inspect("#priority")).box.width === "11px",
	);
	await evaluate(
		'document.getElementById("priority").style.setProperty("width", "3in", "important");',
	);
	check(
		"An interpreted important write wins and computes absolute CSS units",
		(await inspect("#priority")).box.width === "288px",
	);
	check(
		"Explicit all inheritance reads the parent computed sizing values",
		(await inspect("#child")).box.width === "192px" &&
			(await inspect("#child")).box["box-sizing"] === "border-box",
	);
	await evaluate('document.getElementById("parent").style.width = "30%";');
	check(
		"Interpreted parent mutation invalidates inherited values without resolving percentages prematurely",
		(await inspect("#child")).box.width === "30%",
	);
	await evaluate(
		'document.getElementById("panel").style.padding = "-2px"; document.getElementById("panel").style.visibility = "hidden";',
	);
	const hidden = await inspect("#panel");
	check(
		"Invalid padding is ignored and existing visibility semantics remain independent",
		hidden.box["padding-top"] === "3px" &&
			hidden.box.width === "160px" &&
			!hidden.visible,
	);
	check(
		"No fake getComputedStyle or client geometry API was installed",
		(await evaluate(
			'typeof getComputedStyle + ":" + typeof document.getElementById("panel").getBoundingClientRect',
		)) === "undefined:undefined",
	);
	const diff = (await host.execute(["snapshot", "--diff"])).data as {
		reset: boolean;
		fromRevision?: number;
	};
	check(
		"Box inspection preserves the shared snapshot diff baseline",
		!diff.reset && diff.fromRevision === baseline.revision,
	);
	host.close();
	for (const owner of owners.values()) await owner.close();
	check(
		"All interpreted page owners and their native documents close",
		[...owners.entries()].every(([tree, owner]) => {
			if (!owner.closed) return false;
			try {
				tree.get(tree.root);
				return false;
			} catch (error) {
				return error instanceof AgentBrowserError && error.code === "closed";
			}
		}),
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
					"existing-experimental-core-native-author-cascade-in-memory-transport-no-layout-or-public-network",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
