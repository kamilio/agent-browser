import { cpus } from "node:os";
import { BrowserCommandHost } from "../src/command-host.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { setOuterHtml } from "../src/html-content.js";
import { documentInteractions } from "../src/interactions.js";
import { DocumentQueries } from "../src/selectors.js";
import { BrowserSession } from "../src/session.js";
import type { SnapshotSearch } from "../src/snapshot-search.js";
import { type SemanticSnapshot, renderSnapshot } from "../src/snapshot.js";

const profiles = {
	small: { rows: 100, sessions: 1, navigations: 1 },
	medium: { rows: 1000, sessions: 1, navigations: 1 },
	large: { rows: 5000, sessions: 1, navigations: 1 },
	retained: { rows: 100, sessions: 8, navigations: 1 },
	churn: { rows: 100, sessions: 1, navigations: 20 },
} as const;
const profileName = process.argv[2] ?? "small";
if (!Object.hasOwn(profiles, profileName) || process.argv.length > 3)
	throw new Error(
		"Choose one resource profile: small, medium, large, retained, churn",
	);
const profile = profiles[profileName as keyof typeof profiles];
const startedAt = new Date().toISOString();
const readyMs = process.uptime() * 1000;
const cpuStart = process.cpuUsage();
const started = performance.now();
const phases: { stage: string; elapsedMs: number; cpuMs: number }[] = [];
const samples: {
	stage: string;
	rss: number;
	heapUsed: number;
	heapTotal: number;
	external: number;
	arrayBuffers: number;
	liveDocuments: number;
	liveNodes: number;
}[] = [];
const checks: { label: string; passed: boolean }[] = [];
const documents = new Map<string, DocumentTree>();
const sessions: BrowserSession[] = [];
let createdDocuments = 0;
let closedDocuments = 0;
let closedTransports = 0;
let requestCount = 0;
let maxSampledLiveDocuments = 0;
let maxSampledLiveNodes = 0;
let maxSnapshotJsonBytes = 0;
let maxSnapshotTextBytes = 0;
let truncatedSnapshots = 0;
let resetDiffs = 0;
let failure: { stage: string; code: string } | undefined;
let currentStage = "setup";

function sample(stage: string) {
	const memory = process.memoryUsage();
	const liveNodes = [...documents.values()].reduce(
		(total, tree) => total + tree.nodeCount,
		0,
	);
	maxSampledLiveDocuments = Math.max(maxSampledLiveDocuments, documents.size);
	maxSampledLiveNodes = Math.max(maxSampledLiveNodes, liveNodes);
	samples.push({ stage, ...memory, liveDocuments: documents.size, liveNodes });
}
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(`Resource profile assertion failed: ${label}`);
}
async function phase<Result>(
	stage: string,
	operation: () => Result | Promise<Result>,
) {
	currentStage = stage;
	const start = performance.now();
	const cpu = process.cpuUsage();
	try {
		return await operation();
	} finally {
		const used = process.cpuUsage(cpu);
		phases.push({
			stage,
			elapsedMs: performance.now() - start,
			cpuMs: (used.user + used.system) / 1000,
		});
		sample(stage);
	}
}
sample("ready");
const source = `<!doctype html><html><head><title>Resource fixture</title><style>.active{display:block}li{display:list-item}</style></head><body><label for="note">Note</label><input id="note"><button type="button" id="toggle">Toggle</button><ul id="rows">${Array.from(
	{ length: profile.rows },
	(_, index) =>
		`<li id="row-${index}"><a href="/item/${index}">Row ${index} anchor</a></li>`,
).join("")}</ul></body></html>`;
const body = new TextEncoder().encode(source);
const host = new BrowserCommandHost({
	documentFormats: ["text/html"],
	createSession: (name) => {
		const browser = new BrowserSession({
			createTransport: () => {
				let closed = false;
				let requests = 0;
				return {
					async request(input) {
						if (closed || input.signal?.aborted)
							throw new Error("Resource fixture transport is unavailable");
						requests++;
						requestCount++;
						return {
							url: input.url,
							status: 200,
							headers: { "content-type": ["text/html; charset=utf-8"] },
							body,
							redirects: [],
							encodedBytes: body.byteLength,
							elapsedMs: 0,
						};
					},
					metrics: () => ({
						requests,
						active: 0,
						redirects: 0,
						encodedBytes: requests * body.byteLength,
						decodedBytes: requests * body.byteLength,
						closed,
					}),
					close() {
						if (!closed) {
							closed = true;
							closedTransports++;
						}
					},
				};
			},
			loadDocument: async (response, context) => {
				const tree = await loadBrowserDocument(response, context);
				createdDocuments++;
				documents.set(name, tree);
				tree.onClose(() => {
					closedDocuments++;
					if (documents.get(name) === tree) documents.delete(name);
				});
				const queries = new DocumentQueries(tree);
				const button = queries.querySelector("#toggle");
				queries.close();
				if (button === null) throw new Error("Missing resource fixture button");
				documentInteractions(tree).events.addEventListener(
					button,
					"click",
					() => tree.setAttribute(button, "data-clicked", "yes"),
				);
				return tree;
			},
		});
		sessions.push(browser);
		return browser;
	},
});
try {
	for (let sessionIndex = 0; sessionIndex < profile.sessions; sessionIndex++) {
		const session = `profile-${sessionIndex}`;
		const command = (args: string[]) => host.execute(args, { session });
		for (let navigation = 0; navigation < profile.navigations; navigation++) {
			const prefix = `${session}/${navigation}`;
			await phase(`${prefix}/open`, () =>
				command(["open", `https://fixture.invalid/page/${navigation}`]),
			);
			check(
				`${prefix}: predecessor documents close after navigation`,
				createdDocuments - closedDocuments === documents.size,
			);
			const tree = documents.get(session);
			if (!tree) throw new Error("Missing active resource document");
			const snapshot = (
				await phase(`${prefix}/snapshot`, () => command(["snapshot"]))
			).data as SemanticSnapshot;
			maxSnapshotJsonBytes = Math.max(
				maxSnapshotJsonBytes,
				new TextEncoder().encode(JSON.stringify(snapshot)).byteLength,
			);
			maxSnapshotTextBytes = Math.max(
				maxSnapshotTextBytes,
				new TextEncoder().encode(renderSnapshot(snapshot)).byteLength,
			);
			if (snapshot.truncated) truncatedSnapshots++;
			check(
				`${prefix}: snapshot reports controls`,
				snapshot.entries.some(
					(entry) => entry.role === "button" && entry.name === "Toggle",
				),
			);
			const search = (
				await phase(`${prefix}/find-last`, () =>
					command(["find", `Row ${profile.rows - 1} anchor`]),
				)
			).data as SnapshotSearch;
			check(
				`${prefix}: bounded search reaches the final row`,
				search.matched === 1 &&
					!search.snapshotTruncated &&
					!search.resultsTruncated,
			);
			await phase(`${prefix}/actions`, async () => {
				await command(["fill", "#note", "profile-value"]);
				await command(["click", "#toggle"]);
			});
			const queries = new DocumentQueries(tree);
			try {
				const note = queries.querySelector("#note");
				const toggle = queries.querySelector("#toggle");
				const last = queries.querySelector(`#row-${profile.rows - 1}`);
				if (note === null || toggle === null || last === null)
					throw new Error("Missing resource controls");
				check(
					`${prefix}: native fill and event dispatch mutate the same document`,
					tree.get(note).control.value === "profile-value" &&
						tree.get(toggle).attributes["data-clicked"] === "yes",
				);
				const previous = tree.reference(last);
				await phase(`${prefix}/outer-replacement`, () =>
					setOuterHtml(
						tree,
						last,
						'<li id="updated"><a href="/updated">Updated anchor</a></li>',
					),
				);
				const updated = queries.querySelector("#updated");
				check(
					`${prefix}: replacement creates a fresh reference`,
					updated !== null &&
						tree.reference(updated) !== previous &&
						tree.get(last).parent === null,
				);
			} finally {
				queries.close();
			}
			const diff = (
				await phase(`${prefix}/snapshot-diff`, () =>
					command(["snapshot", "--diff"]),
				)
			).data as {
				reset: boolean;
				fromRevision?: number;
				snapshot?: SemanticSnapshot;
			};
			if (diff.reset) resetDiffs++;
			check(
				`${prefix}: complete snapshots diff and truncated snapshots reset honestly`,
				snapshot.truncated
					? diff.reset &&
							diff.snapshot?.document === snapshot.document &&
							diff.snapshot.revision === tree.revision
					: !diff.reset && diff.fromRevision === snapshot.revision,
			);
		}
	}
	sample("retained-before-close");
} catch (error) {
	failure = {
		stage: currentStage,
		code: error instanceof AgentBrowserError ? error.code : "profile-failure",
	};
} finally {
	try {
		await phase("close", () => host.close());
	} catch (error) {
		failure ??= {
			stage: "close",
			code: error instanceof AgentBrowserError ? error.code : "cleanup-failure",
		};
	}
	checks.push(
		{
			label: "all created documents close",
			passed: createdDocuments === closedDocuments && documents.size === 0,
		},
		{
			label: "all transports close",
			passed: closedTransports === sessions.length,
		},
		{
			label: "sessions drain jobs, tabs and cleanup without errors",
			passed: sessions.every((session) => {
				const metrics = session.metrics();
				return (
					metrics.closed &&
					metrics.tabs === 0 &&
					metrics.pendingLoads === 0 &&
					metrics.cleanupErrors === 0
				);
			}),
		},
	);
}
const cpuUsed = process.cpuUsage(cpuStart);
const usage = process.resourceUsage();
const sampledPeakRss = Math.max(...samples.map((entry) => entry.rss));
const report = {
	schemaVersion: 1,
	scope: "native-browser-session-in-memory-no-page-javascript",
	startedAt,
	finishedAt: new Date().toISOString(),
	runtime: {
		version: process.version,
		platform: process.platform,
		architecture: process.arch,
		cpuModel: cpus()[0]?.model ?? "unknown",
	},
	profile: { name: profileName, ...profile, sourceBytes: body.byteLength },
	readyMs,
	elapsedMs: performance.now() - started,
	cpuMs: (cpuUsed.user + cpuUsed.system) / 1000,
	peakProcessRssBytes: usage.maxRSS * 1024,
	sampledPeakRssBytes: sampledPeakRss,
	createdDocuments,
	closedDocuments,
	closedTransports,
	requestCount,
	maxSampledLiveDocuments,
	maxSampledLiveNodes,
	maxSnapshotJsonBytes,
	maxSnapshotTextBytes,
	truncatedSnapshots,
	resetDiffs,
	phases,
	samples,
	checks,
	...(failure ? { failure } : {}),
	passed: !failure && checks.every((entry) => entry.passed),
	provisionalObservations: {
		readyWithinOneSecond: readyMs < 1000,
		sampledPeakUnder100MiB: sampledPeakRss < 100 * 1024 * 1024,
	},
	limitations: [
		"Fixed synthetic markup over an in-memory transport: no DNS, sockets, TLS, website scripts, SDK, CLI daemon, real terminal, layout or raster rendering.",
		"One profile per fresh Node process. readyMs includes Node and static module initialization, not parent-observed CLI or service startup; filesystem caches are uncontrolled.",
		"Peak RSS is process.resourceUsage maxRSS, converted from KiB to bytes. All memory includes the process, fixture source/bytes, reports and closed session wrappers, not just the DOM.",
		"Samples are not allocation attribution or retained-heap measurements. No forced GC: closing native owners does not guarantee immediate RSS reduction.",
		"Document/node maxima are phase-boundary samples of active loaded pages, not peaks during parsing, staging or navigation replacement.",
		"The retained profile holds independently isolated sessions simultaneously, but navigations execute sequentially; it is not parallel CPU throughput.",
		"Snapshot JSON and rendered text have different overhead. Native snapshot truncation is recorded rather than hidden; find must still reach the last row.",
		"Performance observations are not correctness gates, portable guarantees, released-SDK acceptance or full-browser benchmarks.",
	],
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
