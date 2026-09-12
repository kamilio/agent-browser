import { afterEach, expect, it } from "vitest";
import { documentImages } from "./document-images.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { BrowserSession } from "./session.js";

const sessions: BrowserSession[] = [];

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

function response(url: string, html?: string): NetworkResponse {
	const body =
		html === undefined
			? encodePng(createRaster(3, 2, [10, 20, 30, 255]))
			: new TextEncoder().encode(html);
	return {
		url,
		status: 200,
		headers: {
			"content-type": [html === undefined ? "image/png" : "text/html"],
		},
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

function fixture(
	policies: string[],
	image?: (request: NetworkRequest) => NetworkResponse,
	headerName = "content-security-policy",
) {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			request: async (request) => {
				requests.push(request);
				if (request.url === "https://example.com/page") {
					const result = response(
						request.url,
						'<title>CSP image fixture</title><img src="/pixels/start.png">',
					);
					result.headers = { ...result.headers, [headerName]: policies };
					return result;
				}
				return image ? image(request) : response(request.url);
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
		session,
		tab,
		requests,
		load: () => session.navigate(tab, "https://example.com/page"),
		image: () => documentImages(session.page(tab).document).inspect().images[0],
	};
}

it.each([
	"img-src 'self'",
	"default-src 'self'",
	"img-src https://example.com/pixels/",
	"script-src 'none'",
	"img-src 'none' 'self'",
	"img-src 'self'; img-src 'none'",
	"",
])("loads an admitted native PNG under %s", async (policy) => {
	const test = fixture([policy]);
	await test.load();
	expect(test.requests.map((request) => request.url)).toEqual([
		"https://example.com/page",
		"https://example.com/pixels/start.png",
	]);
	expect(test.image()).toMatchObject({
		state: "complete",
		naturalWidth: 3,
		naturalHeight: 2,
		originClean: true,
	});
	expect(test.image().error).toBeUndefined();
});

it.each([
	["img-src 'none'"],
	["img-src; default-src *"],
	["img-src 'none'; img-src 'self'"],
	["img-src *", "default-src 'none'"],
	["img-src 'self', default-src 'none'"],
	["img-src https://other.example/pixels/"],
	["img-src https://example.com/other/"],
])("denies before an image request for %j", async (...policies) => {
	const test = fixture(policies);
	await test.load();
	expect(test.requests).toHaveLength(1);
	expect(test.image()).toMatchObject({
		state: "broken",
		error: "policy-denied",
		naturalWidth: 0,
	});
});

it("does not enforce a report-only header as an image policy", async () => {
	const test = fixture(
		["img-src 'none'"],
		undefined,
		"Content-Security-Policy-Report-Only",
	);
	await test.load();
	expect(test.requests).toHaveLength(2);
	expect(test.image().state).toBe("complete");
});

it("skips path checks after a native redirect without dropping host checks", async () => {
	const test = fixture(
		["img-src https://example.com/pixels/start.png", "default-src 'self'"],
		(request) =>
			request.url.endsWith("/start.png")
				? {
						...response(request.url),
						status: 302,
						headers: { location: ["/different/final.png"] },
					}
				: response(request.url),
	);
	await test.load();
	expect(test.requests.map((request) => request.url)).toEqual([
		"https://example.com/page",
		"https://example.com/pixels/start.png",
		"https://example.com/different/final.png",
	]);
	expect(test.image().state).toBe("complete");
});

it("blocks a denied redirect target before contacting it", async () => {
	const test = fixture(["img-src 'self'"], (request) => ({
		...response(request.url),
		status: 302,
		headers: { location: ["https://other.example/final.png"] },
	}));
	await test.load();
	expect(test.requests.map((request) => request.url)).toEqual([
		"https://example.com/page",
		"https://example.com/pixels/start.png",
	]);
	expect(test.image().error).toBe("policy-denied");
});
