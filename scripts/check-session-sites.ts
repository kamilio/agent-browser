import { createHash } from "node:crypto";
import { AgentBrowserError } from "../src/errors.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { BrowserSession } from "../src/session.js";
import { loadTextDocument } from "../src/text-loader.js";

const startedAt = new Date().toISOString();
const initialMemory = process.memoryUsage();
const session = new BrowserSession({
	createTransport: (cookieJar) =>
		new NodeNetworkTransport({
			cookieJar,
			allowedOrigins: [
				"https://www.rfc-editor.org",
				"https://httpbingo.org",
				"https://example.com",
			],
			limits: { maxRequests: 8, timeoutMs: 20_000 },
		}),
	loadDocument: loadTextDocument,
	limits: { maxNavigations: 8, navigationTimeoutMs: 25_000 },
});
const tab = session.createTab();
const checks: Record<string, unknown>[] = [];

async function navigate(url: string, marker: string, reload = false) {
	const start = performance.now();
	let previous: ReturnType<typeof session.page> | undefined;
	if (session.tabs()[0].url) previous = session.page(tab.id);
	try {
		const result = reload
			? await session.reload(tab.id)
			: await session.navigate(tab.id, url);
		const page = session.page(tab.id);
		const text = page.document.textContent(page.document.root);
		const snapshot = session.snapshot(tab.id);
		const markerMatches = text.includes(marker);
		const stalePrevious = !previous || previous.document.nodeCount === 0;
		checks.push({
			label: reload
				? "reload creates a fresh document"
				: "real text response becomes a document",
			url,
			passed:
				markerMatches &&
				stalePrevious &&
				snapshot.entries.length > 0 &&
				result.kind === "document",
			markerMatches,
			stalePrevious,
			response: result.response,
			documentNodes: page.document.nodeCount,
			textCodeUnits: text.length,
			textSha256: createHash("sha256").update(text).digest("hex"),
			snapshotEntries: snapshot.entries.length,
			snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)),
			elapsedMs: Math.round(performance.now() - start),
			memory: process.memoryUsage(),
		});
	} catch (error) {
		checks.push({
			url,
			passed: false,
			error:
				error instanceof AgentBrowserError
					? { code: error.code, message: error.message }
					: { code: "unexpected-error" },
		});
	}
	await new Promise((resolve) => setTimeout(resolve, 500));
}

try {
	await navigate(
		"https://www.rfc-editor.org/rfc/rfc9110.txt",
		"HTTP Semantics",
	);
	await navigate("https://httpbingo.org/json", "slideshow");
	if (session.tabs()[0].url === "https://httpbingo.org/json")
		await navigate("https://httpbingo.org/json", "slideshow", true);
	else
		checks.push({
			label: "reload creates a fresh document",
			passed: false,
			reason: "JSON document was not committed",
		});
	let previous: ReturnType<typeof session.page> | undefined;
	if (session.tabs()[0].url) previous = session.page(tab.id);
	try {
		await session.navigate(tab.id, "https://example.com/");
		checks.push({
			label: "HTML is explicitly unsupported by text loader",
			passed: false,
			reason: "Unexpected HTML acceptance",
		});
	} catch (error) {
		const rejectedAsUnsupported =
			error instanceof AgentBrowserError && error.code === "unsupported";
		const previousDocumentPreserved =
			!!previous && session.page(tab.id) === previous;
		checks.push({
			label: "HTML is explicitly unsupported by text loader",
			passed: rejectedAsUnsupported && previousDocumentPreserved,
			rejectedAsUnsupported,
			previousDocumentPreserved,
			...(error instanceof AgentBrowserError
				? { error: { code: error.code, message: error.message } }
				: {}),
		});
	}
} finally {
	session.close();
}

const allPassed = checks.length === 4 && checks.every((check) => check.passed);
console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			scope: "real-text-json-document-session-only",
			startedAt,
			finishedAt: new Date().toISOString(),
			node: process.versions.node,
			checks,
			allPassed,
			metrics: session.metrics(),
			initialMemory,
			finalMemory: process.memoryUsage(),
			limitations: [
				"Only plain text and JSON responses are loaded; HTML rejection is expected evidence of a missing feature, not browser compatibility.",
				"Documents use literal preformatted text nodes, not fabricated HTML parsing or links.",
				"No page scripts, forms, CSS layout, terminal CLI, playground or cross-document back/forward are exercised.",
				"Memory values are instantaneous whole-process measurements, not peak browser/session memory or an isolated benchmark.",
				"Response bodies, cookie values and client-identifying headers are not retained in reports.",
			],
		},
		null,
		2,
	),
);
if (!allPassed) process.exitCode = 1;
