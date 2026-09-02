import { BrowserCommandHost } from "../src/command-host.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import { AgentBrowserError } from "../src/errors.js";
import { htmlParseInfo } from "../src/html-info.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { BrowserSession, type SessionKeyResult } from "../src/session.js";

const startedAt = new Date().toISOString();
const checks: Record<string, unknown>[] = [];
let session: BrowserSession | undefined;
const host = new BrowserCommandHost({
	createSession: () => {
		session = new BrowserSession({
			createTransport: (cookieJar) =>
				new NodeNetworkTransport({
					cookieJar,
					allowedOrigins: ["https://httpbingo.org"],
					limits: {
						maxRequests: 3,
						maxRequestBytes: 16_384,
						maxResponseBytes: 65_536,
						timeoutMs: 20_000,
					},
				}),
			loadDocument: loadBrowserDocument,
		});
		return session;
	},
});
try {
	await host.execute(["open", "https://httpbingo.org/forms/post"]);
	if (!session) throw new Error("Missing owned session");
	const tab = session.tabs()[0];
	const page = session.page(tab.id);
	const parsed = htmlParseInfo(page.document);
	const initialNodes = page.document.nodeCount;
	await host.execute(["click", "input[name=custname]"]);
	await host.execute(["type", "synthetic-html-agent"]);
	await host.execute([
		"fill",
		"textarea[name=comments]",
		"synthetic parsed-form probe",
	]);
	await host.execute(["check", "input[name=size][value=medium]"]);
	await host.execute(["check", "input[name=topping][value=onion]"]);
	await host.execute(["click", "input[name=custname]"]);
	const result = (await host.execute(["press", "Enter"]))
		.data as SessionKeyResult;
	const current = session.page(tab.id).document;
	const echo = JSON.parse(current.textContent(current.root)) as {
		form?: Record<string, string[]>;
	};
	const expected = {
		custname: ["synthetic-html-agent"],
		custtel: [""],
		custemail: [""],
		size: ["medium"],
		topping: ["onion"],
		delivery: [""],
		comments: ["synthetic parsed-form probe"],
	};
	const matches = Object.entries(expected).every(
		([key, value]) =>
			JSON.stringify(echo.form?.[key]) === JSON.stringify(value),
	);
	checks.push({
		label:
			"Parsed public HTML form supports type/fill/check/Enter and real POST echo",
		passed:
			result.navigation?.response?.status === 200 &&
			matches &&
			page.document.nodeCount === 0,
		matches,
		parsed,
		initialNodes,
		response: result.navigation?.response,
		metrics: session.metrics(),
		rssBytes: process.memoryUsage().rss,
	});
} catch (error) {
	checks.push({
		label: "Parsed HTML form workflow",
		passed: false,
		error: error instanceof AgentBrowserError ? error.code : "unexpected-error",
	});
} finally {
	host.close();
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			scope:
				"Actual public HTML parsed into our document model. No constructed controls, attribute edits, validation bypass, host listeners or browser-engine fallback. Synthetic values are submitted only to the public httpbingo demo. Optional email/time fields remain empty; nonempty validation for those types is not implemented. Website JavaScript remains disabled. No raw body, headers or credentials are recorded.",
			checks,
		},
		null,
		2,
	),
);
if (checks.some((check) => !check.passed)) process.exitCode = 1;
