import { expect, it, vi } from "vitest";
import type { NetworkResponse } from "./network.js";
import { decodeWorkerScript, fetchWorkerScript } from "./worker-fetch.js";
const documentUrl = "https://example.test/page";
const workerUrl = "https://example.test/worker.js";
function response(overrides: Partial<NetworkResponse> = {}): NetworkResponse {
	const body = new TextEncoder().encode("postMessage('✓');");
	return {
		url: workerUrl,
		status: 200,
		headers: { "content-type": ["text/javascript"] },
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 1,
		...overrides,
	};
}
it("fetches same-origin source with document credentials, byte limits and Worker policy checks", async () => {
	const request = vi.fn(async () => response());
	const checkContentSecurityPolicy = vi.fn();
	const loaded = await fetchWorkerScript(
		workerUrl,
		{
			documentUrl,
			signal: new AbortController().signal,
			maxRedirects: 2,
			request,
			checkContentSecurityPolicy,
		},
		128,
	);
	expect(loaded).toEqual({
		url: workerUrl,
		source: "postMessage('✓');",
		stringCompilation: "allow",
	});
	expect(request.mock.calls[0]).toMatchObject([
		{
			url: workerUrl,
			redirect: "manual",
			maxResponseBytes: 128,
			cookieContext: {
				siteUrl: documentUrl,
				credentials: "same-origin",
				topLevelNavigation: false,
			},
		},
	]);
	expect(checkContentSecurityPolicy.mock.calls).toEqual([
		[workerUrl, 0],
		[workerUrl, 0],
	]);
});
it("rejects foreign entry URLs before requests even when their CORS response would allow access", async () => {
	const request = vi.fn(async () =>
		response({
			headers: {
				"content-type": ["text/javascript"],
				"access-control-allow-origin": ["*"],
			},
		}),
	);
	await expect(
		fetchWorkerScript("https://other.test/worker.js", {
			documentUrl,
			signal: new AbortController().signal,
			maxRedirects: 2,
			request,
		}),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(request).not.toHaveBeenCalled();
});
it.each(["https://other.test/worker.js", "http://example.test/worker.js"])(
	"rejects a foreign or insecure redirect before contacting %s",
	async (destination) => {
		const request = vi.fn(async () =>
			response({ status: 302, headers: { location: [destination] } }),
		);
		await expect(
			fetchWorkerScript(workerUrl, {
				documentUrl,
				signal: new AbortController().signal,
				maxRedirects: 2,
				request,
			}),
		).rejects.toMatchObject({ code: "policy-denied" });
		expect(request).toHaveBeenCalledOnce();
	},
);
it("checks Worker CSP at each same-origin redirect and uses final location and policy", async () => {
	const final = "https://example.test/final.js";
	const request = vi
		.fn()
		.mockResolvedValueOnce(
			response({ status: 302, headers: { location: [final] } }),
		)
		.mockResolvedValueOnce(
			response({
				url: final,
				headers: {
					"content-type": ["application/javascript; charset=iso-8859-1"],
					"content-security-policy": ["script-src 'none'"],
				},
			}),
		);
	const checkContentSecurityPolicy = vi.fn();
	const loaded = await fetchWorkerScript(workerUrl, {
		documentUrl,
		signal: new AbortController().signal,
		maxRedirects: 2,
		request,
		checkContentSecurityPolicy,
	});
	expect(loaded).toMatchObject({
		url: final,
		source: "postMessage('✓');",
		stringCompilation: "deny",
	});
	expect(checkContentSecurityPolicy.mock.calls).toEqual([
		[workerUrl, 0],
		[workerUrl, 0],
		[final, 1],
		[final, 1],
	]);
});
it.each<Partial<NetworkResponse>>([
	{ status: 404 },
	{ headers: {} },
	{ headers: { "content-type": ["text/html"] } },
	{
		headers: { "content-type": ["text/javascript", "application/javascript"] },
	},
	{
		headers: {
			"content-type": ["text/javascript"],
			"content-security-policy": ["sandbox"],
		},
	},
	{ body: new Uint8Array(129) },
])(
	"rejects failed, ambiguous, unsupported or excessive source: %j",
	(overrides) => {
		expect(() => decodeWorkerScript(response(overrides), 128)).toThrow();
	},
);
it("blocks an adapter which silently follows redirects", async () => {
	const request = vi.fn(async () =>
		response({ url: "https://example.test/final.js" }),
	);
	await expect(
		fetchWorkerScript(workerUrl, {
			documentUrl,
			signal: new AbortController().signal,
			maxRedirects: 2,
			request,
		}),
	).rejects.toMatchObject({ code: "policy-denied" });
});
it("rejects cancellation before returning a decoded source", async () => {
	const controller = new AbortController();
	const request = vi.fn(async () => {
		controller.abort();
		return response();
	});
	await expect(
		fetchWorkerScript(workerUrl, {
			documentUrl,
			signal: controller.signal,
			maxRedirects: 2,
			request,
		}),
	).rejects.toThrow();
});
