import {
	type IncomingMessage,
	type ServerResponse,
	createServer,
} from "node:http";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { responseHeader } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";

let origin = "";
let otherOrigin = "";
let otherRequests = 0;
let hangingRequest: (() => void) | undefined;
const transports: NodeNetworkTransport[] = [];
const timers = new Set<ReturnType<typeof setTimeout>>();
const server = createServer((request, response) => {
	void handle(request, response);
});
const other = createServer((request, response) => {
	otherRequests++;
	response.end(JSON.stringify(request.headers));
});

async function handle(request: IncomingMessage, response: ServerResponse) {
	const url = new URL(request.url ?? "/", "http://fixture.test");
	if (url.pathname === "/hang") {
		hangingRequest?.();
		return;
	}
	if (url.pathname === "/redirect") {
		response.writeHead(Number(url.searchParams.get("status") ?? 302), {
			location: url.searchParams.get("to") ?? "/echo",
		});
		response.end("redirect body");
		return;
	}
	if (url.pathname === "/slow-redirect") {
		const timer = setTimeout(() => {
			timers.delete(timer);
			response.writeHead(302, { location: "/slow-redirect" });
			response.end();
		}, 30);
		timers.add(timer);
		return;
	}
	if (url.pathname === "/large") {
		response.end("x".repeat(32_768));
		return;
	}
	if (url.pathname === "/large-header") {
		response.setHeader("x-large", "x".repeat(4096));
		response.end("ok");
		return;
	}
	if (url.pathname === "/gzip-bomb") {
		response.setHeader("content-encoding", "gzip");
		response.end(gzipSync("x".repeat(200_000)));
		return;
	}
	if (url.pathname === "/compressed") {
		const encoding = url.searchParams.get("encoding") ?? "gzip";
		const content = Buffer.from("Hello 日本語 😀");
		const body =
			encoding === "gzip"
				? gzipSync(content)
				: encoding === "deflate"
					? deflateSync(content)
					: encoding === "br"
						? brotliCompressSync(content)
						: brotliCompressSync(gzipSync(content));
		response.setHeader("content-encoding", encoding);
		response.end(body);
		return;
	}
	if (url.pathname === "/bad-encoding") {
		response.setHeader("content-encoding", "unsupported");
		response.end("bad");
		return;
	}
	if (url.pathname === "/broken-gzip") {
		response.setHeader("content-encoding", "gzip");
		response.end("not gzip");
		return;
	}
	if (url.pathname === "/head") {
		response.setHeader("content-length", "999999999");
		response.setHeader("content-encoding", "unsupported");
		response.end();
		return;
	}
	if (url.pathname === "/cookies") {
		response.setHeader("set-cookie", ["first=1; Path=/", "second=2; Path=/"]);
		response.end("cookies");
		return;
	}
	if (url.pathname === "/bytes") {
		response.end("123456");
		return;
	}
	if (url.pathname === "/partial") {
		response.write("partial");
		response.socket?.destroy();
		return;
	}
	if (url.pathname === "/upgrade") {
		response.writeHead(101, { connection: "Upgrade", upgrade: "test" });
		response.end();
		return;
	}
	const chunks: Buffer[] = [];
	try {
		for await (const chunk of request) chunks.push(Buffer.from(chunk));
		response.setHeader("content-type", "application/json");
		response.end(
			JSON.stringify({
				method: request.method,
				url: request.url,
				host: request.headers.host,
				headers: request.headers,
				body: Buffer.concat(chunks).toString(),
			}),
		);
	} catch {
		response.destroy();
	}
}

function transport(options: NodeTransportOptions = {}) {
	const instance = new NodeNetworkTransport({
		allowPrivateOrigins: [origin],
		...options,
	});
	transports.push(instance);
	return instance;
}

function redirectTo(to: string, status = 302) {
	return `${origin}/redirect?${new URLSearchParams({ to, status: String(status) })}`;
}

function text(body: Uint8Array) {
	return new TextDecoder().decode(body);
}

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const otherAddress = other.address();
	if (
		!address ||
		typeof address === "string" ||
		!otherAddress ||
		typeof otherAddress === "string"
	)
		throw new Error("Missing fixture address");
	origin = `http://127.0.0.1:${address.port}`;
	otherOrigin = `http://127.0.0.1:${otherAddress.port}`;
});

afterEach(() => {
	for (const instance of transports.splice(0)) instance.close();
	hangingRequest = undefined;
	for (const timer of timers) clearTimeout(timer);
	timers.clear();
});

afterAll(async () => {
	server.closeAllConnections();
	other.closeAllConnections();
	await Promise.all([
		new Promise<void>((resolve) => server.close(() => resolve())),
		new Promise<void>((resolve) => other.close(() => resolve())),
	]);
});

it("does not access a private origin without explicit permission", async () => {
	const client = transport({ allowPrivateOrigins: [] });
	await expect(client.request({ url: origin })).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(client.metrics().requests).toBe(0);
});

it("pins a vetted DNS address while retaining the original HTTP authority", async () => {
	const target = origin.replace("127.0.0.1", "fixture.test");
	let resolutions = 0;
	const client = transport({
		allowPrivateOrigins: [target],
		resolver: async () => {
			resolutions++;
			return resolutions === 1 ? ["127.0.0.1"] : ["127.0.0.2"];
		},
	});
	const response = await client.request({
		url: `${target}/echo?test=yes#fragment`,
	});
	const data = JSON.parse(text(response.body));
	expect(data.host).toBe(new URL(target).host);
	expect(data.url).toBe("/echo?test=yes");
	expect(resolutions).toBe(1);
	expect(response.url.endsWith("#fragment")).toBe(true);
	expect(response.elapsedMs).toBeGreaterThanOrEqual(0);
	expect(client.metrics()).toMatchObject({
		requests: 1,
		active: 0,
		closed: false,
	});
});

it("rejects mixed public/private DNS results before any connection", async () => {
	const client = transport({
		allowPrivateOrigins: [],
		resolver: async () => ["8.8.8.8", "127.0.0.1"],
	});
	await expect(
		client.request({ url: "https://fixture.test" }),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(client.metrics().encodedBytes).toBe(0);
});

it("revalidates redirect origins before reaching a second local service", async () => {
	const previous = otherRequests;
	await expect(
		transport().request({ url: redirectTo(`${otherOrigin}/private`) }),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(otherRequests).toBe(previous);
});

it.each([301, 302, 303])(
	"rewrites POST to GET for redirect status %i and removes body headers",
	async (status) => {
		const response = await transport().request({
			url: redirectTo("/echo", status),
			method: "POST",
			body: "payload",
			headers: { "content-type": "text/custom" },
		});
		const data = JSON.parse(text(response.body));
		expect(data.method).toBe("GET");
		expect(data.body).toBe("");
		expect(data.headers["content-type"]).toBeUndefined();
		expect(data.headers["content-length"]).toBeUndefined();
		expect(response.redirects).toHaveLength(1);
	},
);

it.each([307, 308])(
	"preserves method and body for redirect status %i",
	async (status) => {
		const response = await transport().request({
			url: redirectTo("/echo", status),
			method: "POST",
			body: "日本語",
		});
		const data = JSON.parse(text(response.body));
		expect(data.method).toBe("POST");
		expect(data.body).toBe("日本語");
		expect(data.headers["content-length"]).toBe(
			String(Buffer.byteLength("日本語")),
		);
	},
);

it("strips credentials on cross-origin redirects without altering the caller's headers", async () => {
	const headers = {
		authorization: "Bearer fixture",
		cookie: "fixture=value",
		referer: `${origin}/private`,
	};
	const client = transport({ allowPrivateOrigins: [origin, otherOrigin] });
	const response = await client.request({
		url: redirectTo(`${otherOrigin}/headers`),
		headers,
	});
	const forwarded = JSON.parse(text(response.body));
	expect(forwarded.authorization).toBeUndefined();
	expect(forwarded.cookie).toBeUndefined();
	expect(forwarded.referer).toBeUndefined();
	expect(headers.authorization).toBe("Bearer fixture");
});

it("returns manual redirects and handles explicit redirect denial and count limits", async () => {
	const target = redirectTo("/echo");
	const manual = await transport().request({ url: target, redirect: "manual" });
	expect(manual.status).toBe(302);
	expect(text(manual.body)).toBe("redirect body");
	expect(manual.redirects).toEqual([]);
	await expect(
		transport().request({ url: target, redirect: "error" }),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		transport({ limits: { maxRedirects: 0 } }).request({ url: target }),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it.each(["gzip", "deflate", "br", "gzip, br"])(
	"decodes %s while measuring encoded bytes separately",
	async (encoding) => {
		const client = transport();
		const response = await client.request({
			url: `${origin}/compressed?${new URLSearchParams({ encoding })}`,
		});
		expect(text(response.body)).toBe("Hello 日本語 😀");
		expect(response.encodedBytes).toBeGreaterThan(0);
		expect(client.metrics().decodedBytes).toBe(response.body.byteLength);
	},
);

it("bounds encoded and decoded responses and rejects malformed compression", async () => {
	await expect(
		transport({ limits: { maxResponseBytes: 1024 } }).request({
			url: `${origin}/large`,
		}),
	).rejects.toMatchObject({ code: "resource-limit" });
	await expect(
		transport({ limits: { maxResponseBytes: 1024 } }).request({
			url: `${origin}/gzip-bomb`,
		}),
	).rejects.toMatchObject({ code: "resource-limit" });
	await expect(
		transport().request({ url: `${origin}/bad-encoding` }),
	).rejects.toMatchObject({ code: "unsupported" });
	await expect(
		transport().request({ url: `${origin}/broken-gzip` }),
	).rejects.toMatchObject({ code: "network-error" });
});

it("does not decode or apply a response body limit to HEAD metadata", async () => {
	const response = await transport().request({
		url: `${origin}/head`,
		method: "HEAD",
	});
	expect(response.body.byteLength).toBe(0);
	expect(responseHeader(response, "Content-Length")).toBe("999999999");
});

it("preserves duplicate Set-Cookie fields without combining them", async () => {
	const response = await transport().request({ url: `${origin}/cookies` });
	expect(response.headers["set-cookie"]).toEqual([
		"first=1; Path=/",
		"second=2; Path=/",
	]);
	expect(Object.isFrozen(response.headers)).toBe(true);
	expect(Object.isFrozen(response.headers["set-cookie"])).toBe(true);
});

it("applies one wall deadline across DNS, headers, bodies and redirects", async () => {
	const dns = transport({
		resolver: async () => new Promise(() => {}),
		limits: { timeoutMs: 30 },
	});
	await expect(
		dns.request({ url: "https://fixture.test" }),
	).rejects.toMatchObject({ code: "timeout" });
	await expect(
		transport({ limits: { timeoutMs: 30 } }).request({ url: `${origin}/hang` }),
	).rejects.toMatchObject({ code: "timeout" });
	const redirects = transport({ limits: { timeoutMs: 75 } });
	await expect(
		redirects.request({ url: `${origin}/slow-redirect` }),
	).rejects.toMatchObject({ code: "timeout" });
	expect(redirects.metrics().active).toBe(0);
});

it("cancels live requests and closes all outstanding operations without retrying", async () => {
	const client = transport();
	const controller = new AbortController();
	const ready = new Promise<void>((resolve) => {
		hangingRequest = resolve;
	});
	const pending = client.request({
		url: `${origin}/hang`,
		signal: controller.signal,
	});
	const assertion = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await ready;
	controller.abort();
	await assertion;
	expect(client.metrics()).toMatchObject({ active: 0, requests: 1 });
	const dns = transport({ resolver: async () => new Promise(() => {}) });
	const inFlight = dns.request({ url: "https://fixture.test" });
	const closed = expect(inFlight).rejects.toMatchObject({ code: "closed" });
	dns.close();
	await closed;
	await expect(dns.request({ url: origin })).rejects.toMatchObject({
		code: "closed",
	});
	expect(dns.metrics()).toMatchObject({ active: 0, closed: true });
});

it("does not issue a request for an already aborted signal", async () => {
	const controller = new AbortController();
	controller.abort();
	const client = transport();
	await expect(
		client.request({ url: origin, signal: controller.signal }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(client.metrics().requests).toBe(0);
});

it("bounds concurrency, cumulative bytes and request counts", async () => {
	const client = transport({ limits: { maxConcurrent: 1 } });
	const ready = new Promise<void>((resolve) => {
		hangingRequest = resolve;
	});
	const pending = client.request({ url: `${origin}/hang` });
	const closed = expect(pending).rejects.toMatchObject({ code: "closed" });
	await ready;
	await expect(client.request({ url: origin })).rejects.toMatchObject({
		code: "resource-limit",
	});
	client.close();
	await closed;
	const requests = transport({ limits: { maxRequests: 1 } });
	await requests.request({ url: `${origin}/bytes` });
	await expect(requests.request({ url: origin })).rejects.toMatchObject({
		code: "resource-limit",
	});
	const bytes = transport({ limits: { maxTotalBytes: 10 } });
	await bytes.request({ url: `${origin}/bytes` });
	await expect(bytes.request({ url: `${origin}/bytes` })).rejects.toMatchObject(
		{ code: "resource-limit" },
	);
});

it("rejects unsafe headers, large uploads, protocol upgrades and partial responses", async () => {
	const client = transport({ limits: { maxRequestBytes: 4 } });
	for (const headers of [
		{ host: "private.internal" },
		{ "transfer-encoding": "chunked" },
		{ "x-test": "value\r\ninjected: true" },
		{ test: "a", TEST: "b" },
	])
		await expect(
			client.request({ url: origin, headers }),
		).rejects.toBeDefined();
	await expect(
		client.request({ url: origin, method: "POST", body: "12345" }),
	).rejects.toMatchObject({ code: "resource-limit" });
	await expect(
		client.request({ url: origin, method: "CONNECT" }),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		client.request({ url: origin, body: "1234" }),
	).rejects.toMatchObject({ code: "invalid-input" });
	await expect(
		client.request({ url: `${origin}/upgrade` }),
	).rejects.toMatchObject({ code: "network-error" });
	await expect(
		client.request({ url: `${origin}/partial` }),
	).rejects.toMatchObject({ code: "network-error" });
	await expect(
		transport({ limits: { maxHeaderBytes: 256 } }).request({
			url: `${origin}/large-header`,
		}),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it("copies request bodies before async work and snapshots metrics immutably", async () => {
	const client = transport();
	const body = new TextEncoder().encode("original");
	const pending = client.request({
		url: `${origin}/echo`,
		method: "POST",
		body,
	});
	body.fill(120);
	const response = await pending;
	expect(JSON.parse(text(response.body)).body).toBe("original");
	const before = client.metrics();
	await client.request({ url: origin });
	expect(before.requests).toBe(1);
	expect(client.metrics().requests).toBe(2);
	expect(Object.isFrozen(before)).toBe(true);
});
