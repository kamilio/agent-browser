import { createHash } from "node:crypto";
import { AgentBrowserError } from "../src/errors.js";
import { decodeResponseText, responseHeader } from "../src/network.js";
import { NodeNetworkTransport } from "../src/node-transport.js";

const cases = [
	{ url: "https://example.com/", marker: "Example Domain", kind: "static" },
	{
		url: "https://news.ycombinator.com/",
		marker: "Hacker News",
		kind: "static-links",
	},
	{
		url: "https://books.toscrape.com/",
		marker: "Books to Scrape",
		kind: "static-catalog",
	},
	{
		url: "https://quotes.toscrape.com/js/",
		marker: "Quotes to Scrape",
		kind: "javascript-shell-only",
	},
];
const client = new NodeNetworkTransport({
	limits: { maxRequests: 20, maxTotalBytes: 8_388_608, timeoutMs: 20_000 },
});
const results: Record<string, unknown>[] = [];
const rssBeforeBytes = process.memoryUsage().rss;
const startedAt = new Date().toISOString();

try {
	for (const test of cases) {
		const started = performance.now();
		try {
			const response = await client.request({ url: test.url });
			const decoded = decodeResponseText(response);
			const markerPresent = decoded.text.includes(test.marker);
			const passed = response.status === 200 && markerPresent;
			results.push({
				url: test.url,
				kind: test.kind,
				passed,
				finalUrl: response.url,
				status: response.status,
				contentType: responseHeader(response, "content-type"),
				encoding: decoded.encoding,
				markerPresent,
				encodedBytes: response.encodedBytes,
				decodedBytes: response.body.byteLength,
				sha256: createHash("sha256").update(response.body).digest("hex"),
				redirectCount: response.redirects.length,
				elapsedMs: Math.round(response.elapsedMs),
			});
		} catch (error) {
			results.push({
				url: test.url,
				kind: test.kind,
				passed: false,
				error:
					error instanceof AgentBrowserError
						? { code: error.code, message: error.message }
						: { code: "unexpected-error" },
				elapsedMs: Math.round(performance.now() - started),
			});
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
} finally {
	client.close();
}

console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			scope: "network-transport-only",
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: {
				node: process.versions.node,
				bun: process.versions.bun ?? null,
			},
			checks: results,
			allPassed: results.every((result) => result.passed),
			metrics: client.metrics(),
			rssBeforeBytes,
			rssAfterBytes: process.memoryUsage().rss,
			limitations: [
				"No HTML parsing, DOM actions or JavaScript execution is exercised.",
				"Memory values are process samples, not peak or per-session measurements.",
			],
		},
		null,
		2,
	),
);
if (results.some((result) => !result.passed)) process.exitCode = 1;
