import { afterEach, expect, it } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const sessions: BrowserSession[] = [];
const pageUrl = "https://example.com/page";
const sheetUrl = "https://example.com/styles/start.css";

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

function response(url: string, text = "body { color: red }"): NetworkResponse {
	const body = new TextEncoder().encode(text);
	return {
		url,
		status: 200,
		headers: { "content-type": [url === pageUrl ? "text/html" : "text/css"] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

function fixture(
	policies: string[],
	options: {
		attributes?: string;
		headerName?: string;
		sheet?: (request: NetworkRequest) => NetworkResponse;
	} = {},
) {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			request: async (request) => {
				requests.push(request);
				if (request.url !== pageUrl)
					return options.sheet?.(request) ?? response(request.url);
				const result = response(
					pageUrl,
					`<title>Style CSP</title><link rel="stylesheet" href="/styles/start.css" ${options.attributes ?? ""}><body>Native test</body>`,
				);
				result.headers = {
					...result.headers,
					[options.headerName ?? "content-security-policy"]: policies,
				};
				return result;
			},
			metrics: () => ({
				requests: requests.length,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				active: 0,
				closed,
			}),
			close: () => {
				closed = true;
			},
		}),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab().id;
	return {
		requests,
		load: () => session.navigate(tab, pageUrl),
		metrics: () => documentStyles(session.page(tab).document).metrics(),
	};
}

it.each([
	["style-src 'none'"],
	["default-src 'none'"],
	["style-src-elem 'none'; style-src *"],
	["style-src; default-src *"],
	["style-src 'none'; style-src 'self'"],
	["style-src *", "style-src-elem 'none'"],
	["style-src *, default-src 'none'"],
	["style-src https://other.example/"],
	["style-src https://example.com/other/"],
])(
	"denies an ordinary stylesheet before transport under %j",
	async (...policies) => {
		const test = fixture(policies);
		await test.load();
		expect(test.requests.map((request) => request.url)).toEqual([pageUrl]);
		expect(test.metrics().externalSheets).toBe(0);
		expect(test.metrics().issues["stylesheet-policy-denied"]).toBe(1);
	},
);

it.each([
	"style-src 'self'",
	"default-src 'self'",
	"style-src-elem 'self'; style-src 'none'; default-src 'none'",
	"style-src 'self'; style-src 'none'",
	"style-src 'none' 'self'",
	"style-src https://example.com/styles/",
	"img-src 'none'",
	"",
])("admits a URL-authorized ordinary stylesheet under %s", async (policy) => {
	const test = fixture([policy]);
	await test.load();
	expect(test.requests.map((request) => request.url)).toEqual([
		pageUrl,
		sheetUrl,
	]);
	expect(test.metrics().externalSheets).toBe(1);
	expect(test.metrics().issues).toEqual({});
});

it("admits a same-origin CORS stylesheet without disabling CSP", async () => {
	const test = fixture(["style-src 'self'"], { attributes: "crossorigin" });
	await test.load();
	expect(test.requests.map((request) => request.url)).toEqual([
		pageUrl,
		sheetUrl,
	]);
	expect(test.metrics().externalSheets).toBe(1);
	expect(test.metrics().issues).toEqual({});
});

it("ignores report-only stylesheet restrictions", async () => {
	const test = fixture(["style-src 'none'"], {
		headerName: "Content-Security-Policy-Report-Only",
	});
	await test.load();
	expect(test.requests.map((request) => request.url)).toEqual([
		pageUrl,
		sheetUrl,
	]);
	expect(test.metrics().externalSheets).toBe(1);
});

it("blocks an ordinary stylesheet redirect before contacting its denied host", async () => {
	const test = fixture(["style-src 'self'"], {
		sheet: (request) => ({
			...response(request.url),
			status: 302,
			headers: { location: ["https://other.example/final.css"] },
		}),
	});
	await test.load();
	expect(test.requests.map((request) => request.url)).toEqual([
		pageUrl,
		sheetUrl,
	]);
	expect(test.requests[1].redirect).toBe("manual");
	expect(test.metrics().externalSheets).toBe(0);
	expect(test.metrics().issues["stylesheet-policy-denied"]).toBe(1);
});

it("retains host policy but skips its path after a stylesheet redirect", async () => {
	const finalUrl = "https://example.com/elsewhere/final.css";
	const test = fixture(["style-src https://example.com/styles/start.css"], {
		sheet: (request) =>
			request.url === sheetUrl
				? {
						...response(request.url),
						status: 302,
						headers: { location: [finalUrl] },
					}
				: response(request.url),
	});
	await test.load();
	expect(test.requests.map((request) => request.url)).toEqual([
		pageUrl,
		sheetUrl,
		finalUrl,
	]);
	expect(test.metrics().externalSheets).toBe(1);
	expect(test.metrics().issues).toEqual({});
});
