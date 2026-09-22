import { expect, it, vi } from "vitest";
import type { NetworkResponse } from "./network.js";
import {
	decodeWorkerImportedScript,
	decodeWorkerScript,
	fetchWorkerImportedScript,
	fetchWorkerScript,
	workerImportPolicy,
} from "./worker-fetch.js";
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
	expect(loaded).toMatchObject({
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

it("imports cross-origin JavaScript without CORS while omitting cross-origin document credentials", async () => {
	const url = "https://cdn.test/import.js";
	const request = vi.fn(async () =>
		response({
			url,
			headers: {
				"content-type": ["application/javascript"],
				"content-security-policy": ["sandbox"],
			},
		}),
	);
	const checkContentSecurityPolicy = vi.fn();
	const loaded = await fetchWorkerImportedScript(url, {
		documentUrl,
		signal: new AbortController().signal,
		maxRedirects: 2,
		request,
		checkContentSecurityPolicy,
	});
	expect(loaded).toEqual({
		url,
		source: "postMessage('✓');",
		redirectCount: 0,
	});
	expect(request.mock.calls[0]).toMatchObject([
		{ cookieContext: { credentials: "omit" }, headers: { accept: "*/*" } },
	]);
	expect(checkContentSecurityPolicy.mock.calls).toEqual([
		[url, 0],
		[url, 0],
	]);
});
it("keeps an imported response's CSP from replacing the worker execution policy", () => {
	const input = response({
		headers: {
			"content-type": ["text/javascript"],
			"content-security-policy": ["sandbox"],
		},
	});
	expect(() => decodeWorkerScript(input)).toThrow();
	expect(decodeWorkerImportedScript(input)).toEqual({
		url: workerUrl,
		source: "postMessage('✓');",
		redirectCount: 0,
	});
});
it.each([
	["worker-src 'none'; script-src 'self' blob:", workerUrl, true],
	["worker-src https:; script-src 'none'", workerUrl, false],
	[
		"script-src-elem 'none'; script-src https://cdn.test",
		"https://cdn.test/import.js",
		true,
	],
	["script-src 'none'; default-src https:", workerUrl, false],
	["default-src 'self'", "blob:https://example.test/import", true],
	["script-src *", "blob:https://example.test/import", false],
	["script-src 'self'", "blob:https://other.test/import", false],
] as const)(
	"matches worker-import policy %s for %s",
	(policy, url, allowed) => {
		const check = workerImportPolicy(documentUrl, {
			"content-security-policy": [policy],
		});
		if (allowed) expect(() => check(url, 0)).not.toThrow();
		else expect(() => check(url, 0)).toThrow();
	},
);

it("decodes Worker WASM policy without granting string eval", () => {
	const loaded = decodeWorkerScript(
		response({
			headers: {
				"content-type": ["text/javascript"],
				"content-security-policy": ["script-src 'wasm-unsafe-eval'"],
			},
		}),
	);
	expect(loaded.wasmCompilation).toBe("allow");
	expect(loaded.stringCompilation).toBe("deny");
	const denied = decodeWorkerScript(
		response({
			headers: {
				"content-type": ["text/javascript"],
				"content-security-policy": ["script-src 'none'"],
			},
		}),
	);
	expect(denied.wasmCompilation).toBe("deny");
});
