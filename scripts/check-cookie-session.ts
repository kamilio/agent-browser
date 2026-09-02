import { CookieJar, type CookieRequestContext } from "../src/cookies.js";
import { AgentBrowserError } from "../src/errors.js";
import { type NetworkResponse, decodeResponseText } from "../src/network.js";
import { NodeNetworkTransport } from "../src/node-transport.js";

const origin = "https://httpbingo.org";
const name = "agent_browser_probe";
const value = "synthetic-session-check";
const jar = new CookieJar();
const isolatedJar = new CookieJar();
const options = {
	allowedOrigins: [origin],
	limits: { maxRequests: 8, maxResponseBytes: 65_536, timeoutMs: 20_000 },
};
const transport = new NodeNetworkTransport({ ...options, cookieJar: jar });
const isolatedTransport = new NodeNetworkTransport({
	...options,
	cookieJar: isolatedJar,
});
const cookieContext: CookieRequestContext = {
	siteUrl: origin,
	credentials: "include",
	topLevelNavigation: true,
};
const checks: Record<string, unknown>[] = [];
const startedAt = new Date().toISOString();

function matches(response: NetworkResponse, expected: string | undefined) {
	const body = JSON.parse(decodeResponseText(response).text) as {
		cookies?: Record<string, unknown>;
	};
	return (
		response.status === 200 && !!body.cookies && body.cookies[name] === expected
	);
}

async function check(
	label: string,
	request: () => Promise<NetworkResponse>,
	expected: string | undefined,
	redirects = false,
) {
	try {
		const response = await request();
		const valueMatches = matches(response, expected);
		const redirectMatches = !redirects || response.redirects.length > 0;
		checks.push({
			label,
			passed: valueMatches && redirectMatches,
			status: response.status,
			valueMatches,
			redirectMatches,
			redirectCount: response.redirects.length,
			responseBytes: response.body.byteLength,
			elapsedMs: Math.round(response.elapsedMs),
		});
	} catch (error) {
		checks.push({
			label,
			passed: false,
			error:
				error instanceof AgentBrowserError
					? { code: error.code, message: error.message }
					: { code: "unexpected-response" },
		});
	}
	await new Promise((resolve) => setTimeout(resolve, 500));
}

try {
	await check(
		"redirect sets and echoes the synthetic cookie",
		() =>
			transport.request({
				url: `${origin}/cookies/set?${name}=${value}`,
				cookieContext,
			}),
		value,
		true,
	);
	await check(
		"later request keeps the same session",
		() => transport.request({ url: `${origin}/cookies`, cookieContext }),
		value,
	);
	await check(
		"independent jar has no session cookie",
		() =>
			isolatedTransport.request({ url: `${origin}/cookies`, cookieContext }),
		undefined,
	);
	await check(
		"redirect deletes the synthetic cookie",
		() =>
			transport.request({
				url: `${origin}/cookies/delete?${name}=`,
				cookieContext,
			}),
		undefined,
		true,
	);
} finally {
	transport.close();
	isolatedTransport.close();
	jar.close();
	isolatedJar.close();
}

const allPassed = checks.every((result) => result.passed);
console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			scope: "host-cookie-transport-session-only",
			startedAt,
			finishedAt: new Date().toISOString(),
			node: process.versions.node,
			endpoint: origin,
			checks,
			allPassed,
			metrics: {
				transport: transport.metrics(),
				isolatedTransport: isolatedTransport.metrics(),
				jar: jar.metrics(),
				isolatedJar: isolatedJar.metrics(),
			},
			limitations: [
				"Only fixed synthetic cookie values are sent to a designated public HTTP test service.",
				"Cookie values, Set-Cookie headers, echoed client IPs and response bodies are not retained in this report.",
				"No HTML parsing, website JavaScript, page document.cookie binding or browser navigation is exercised.",
				"Domain and Partitioned cookies are explicitly rejected; same-site uses a conservative exact-host scheme boundary, not a Public Suffix List.",
			],
		},
		null,
		2,
	),
);
if (!allPassed) process.exitCode = 1;
