import { createServer, request } from "node:http";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { approvePlayground, requestCommand } from "./node-command-client.js";
import {
	type CommandServerOptions,
	listenCommandServer,
} from "./node-command-server.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";
import { loadTextDocument } from "./text-loader.js";

let site = "";
let slowRequests = 0;
const servers: Awaited<ReturnType<typeof listenCommandServer>>[] = [];
const hosts: BrowserCommandHost[] = [];
const website = createServer((request, response) => {
	if (request.url === "/slow") {
		slowRequests++;
		return;
	}
	response.setHeader("content-type", "text/plain");
	response.end("Local command API fixture");
});

it("awaits asynchronous host cleanup before declaring the server closed", async () => {
	let release = () => {};
	let entered = false;
	const cleanup = new Promise<void>((resolve) => {
		release = resolve;
	});
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("not used");
		},
	});
	hosts.push(host);
	const server = await listenCommandServer({
		execute: host.execute.bind(host),
		close: async () => {
			entered = true;
			host.close();
			await cleanup;
		},
	});
	servers.push(server);
	let settled = false;
	const closing = server.close().then(() => {
		settled = true;
	});
	await vi.waitFor(() => expect(entered).toBe(true));
	expect(settled).toBe(false);
	release();
	await closing;
	expect(settled).toBe(true);
});

async function fixture(options: CommandServerOptions = {}) {
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: (cookieJar) =>
					new NodeNetworkTransport({ cookieJar, allowPrivateOrigins: [site] }),
				loadDocument: loadTextDocument,
			}),
	});
	hosts.push(host);
	const server = await listenCommandServer(host, options);
	servers.push(server);
	return {
		host,
		server,
		connection: {
			schemaVersion: 1 as const,
			origin: server.origin,
			token: server.token,
		},
	};
}

function api(
	server: { origin: string; token: string },
	body: unknown = { argv: ["list"] },
	headers: Record<string, string | string[]> = {},
	path = "/api/command",
	method = "POST",
) {
	return new Promise<{
		status: number;
		body: unknown;
		headers: Record<string, unknown>;
	}>((resolve, reject) => {
		const data = JSON.stringify(body);
		const operation = request(
			`${server.origin}${path}`,
			{
				method,
				agent: false,
				headers: {
					authorization: `Bearer ${server.token}`,
					"content-type": "application/json",
					"content-length": Buffer.byteLength(data),
					...headers,
				},
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.once("error", reject);
				response.once("end", () => {
					try {
						resolve({
							status: response.statusCode ?? 0,
							body: JSON.parse(Buffer.concat(chunks).toString()),
							headers: response.headers,
						});
					} catch (error) {
						reject(error);
					}
				});
			},
		);
		operation.once("error", reject);
		operation.end(data);
	});
}

beforeAll(async () => {
	await new Promise<void>((resolve) => website.listen(0, "127.0.0.1", resolve));
	const address = website.address();
	if (!address || typeof address === "string")
		throw new Error("Missing fixture address");
	site = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
	for (const host of hosts.splice(0)) host.close();
	website.closeAllConnections();
});
afterAll(async () => {
	await new Promise<void>((resolve) => website.close(() => resolve()));
});

it("executes authenticated commands against the same owned session over separate HTTP requests", async () => {
	const { connection, host } = await fixture();
	await requestCommand(connection, { argv: ["-s=one", "open", site] });
	await requestCommand(connection, {
		argv: ["-s=one", "localstorage-set", "key", "value"],
	});
	expect(
		await requestCommand(connection, {
			argv: ["-s=one", "localstorage-get", "key"],
		}),
	).toMatchObject({ data: { value: "value" } });
	const snapshot = await requestCommand(connection, {
		argv: ["-s=one", "snapshot"],
	});
	expect(snapshot).toMatchObject({
		data: {
			entries: [expect.objectContaining({ name: "Local command API fixture" })],
		},
	});
	expect(host.metrics().sessions).toBe(1);
});

it.each([
	[{ authorization: "Bearer invalid" }, 401],
	[{ authorization: ["Bearer invalid", "Bearer other"] }, 401],
	[{ host: "rebound.example" }, 403],
	[{ origin: "https://attacker.example" }, 403],
	[{ "sec-fetch-site": "cross-site" }, 403],
	[{ "content-type": "text/plain" }, 415],
] as [Record<string, string | string[]>, number][])(
	"rejects unauthorized or cross-origin requests %j",
	async (headers, expected) => {
		const { server, host } = await fixture();
		expect((await api(server, { argv: ["open"] }, headers)).status).toBe(
			expected,
		);
		expect(host.metrics().sessions).toBe(0);
	},
);

it("accepts its exact origin and returns non-cacheable, non-executable JSON without CORS", async () => {
	const { server } = await fixture();
	const response = await api(
		server,
		{ argv: ["capabilities"] },
		{ origin: server.origin, "sec-fetch-site": "same-origin" },
	);
	expect(response.status).toBe(200);
	expect(response.headers["cache-control"]).toBe("no-store");
	expect(response.headers["x-content-type-options"]).toBe("nosniff");
	expect(response.headers["access-control-allow-origin"]).toBeUndefined();
});

it("rejects wrong routes/methods, oversized bodies and invalid command JSON without mutations", async () => {
	const { server, host } = await fixture({ maxRequestBytes: 256 });
	expect((await api(server, {}, {}, "/api/command", "GET")).status).toBe(404);
	expect((await api(server, {}, {}, "/api/command?token=ignored")).status).toBe(
		404,
	);
	expect((await api(server, { argv: ["open"], extra: true })).status).toBe(400);
	expect((await api(server, { argv: [42] })).status).toBe(400);
	expect((await api(server, { argv: ["open", "x".repeat(300)] })).status).toBe(
		413,
	);
	expect(host.metrics().sessions).toBe(0);
});

it("does not disguise unsupported commands as successful API actions", async () => {
	const { server, connection } = await fixture();
	const response = await api(server, { argv: ["eval", "process.env"] });
	expect(response.status).toBe(422);
	await expect(
		requestCommand(connection, { argv: ["eval", "process.env"] }),
	).rejects.toMatchObject({ code: "unsupported" });
});

it.each(["chunked", "slow"] as const)(
	"bounds %s authenticated request bodies before executing commands",
	async (kind) => {
		const { server, host } = await fixture({
			maxRequestBytes: 256,
			bodyTimeoutMs: 20,
		});
		const result = await new Promise<{ status: number; body: unknown }>(
			(resolve, reject) => {
				const operation = request(
					`${server.origin}/api/command`,
					{
						method: "POST",
						agent: false,
						headers: {
							authorization: `Bearer ${server.token}`,
							"content-type": "application/json",
							"transfer-encoding": "chunked",
						},
					},
					(response) => {
						const chunks: Buffer[] = [];
						response.on("data", (chunk: Buffer) => chunks.push(chunk));
						response.once("error", reject);
						response.once("end", () =>
							resolve({
								status: response.statusCode ?? 0,
								body: JSON.parse(Buffer.concat(chunks).toString()),
							}),
						);
					},
				);
				operation.once("error", reject);
				operation.write(kind === "chunked" ? " ".repeat(300) : "{");
				if (kind === "chunked") operation.end();
			},
		);
		expect(result.status).toBe(kind === "chunked" ? 413 : 408);
		expect(host.metrics().executedCommands).toBe(0);
	},
);

it("explicit client cancellation aborts its navigation and removes the abort listener", async () => {
	const { connection, host } = await fixture();
	const controller = new AbortController();
	const remove = vi.spyOn(controller.signal, "removeEventListener");
	const pending = requestCommand(
		connection,
		{ argv: ["open", `${site}/slow`] },
		5000,
		controller.signal,
	);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await vi.waitFor(() => expect(host.metrics().pendingCommands).toBe(1));
	controller.abort();
	await rejected;
	await vi.waitFor(() => expect(host.metrics().pendingCommands).toBe(0));
	await vi.waitFor(() =>
		expect(remove).toHaveBeenCalledWith("abort", expect.any(Function)),
	);
	await expect(
		requestCommand(connection, { argv: ["list"] }, 5000, controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
});

it("disconnect cancellation stops in-flight browser navigation and drains its command slot", async () => {
	const { host, connection } = await fixture();
	const before = slowRequests;
	await expect(
		requestCommand(connection, { argv: ["open", `${site}/slow`] }, 100),
	).rejects.toMatchObject({ code: "timeout" });
	expect(slowRequests).toBe(before + 1);
	await vi.waitFor(() => expect(host.metrics().pendingCommands).toBe(0));
});

it("bounds response size rather than returning a partial JSON credential/state response", async () => {
	const { server } = await fixture({ maxResponseBytes: 256 });
	const response = await api(server, { argv: ["capabilities"] });
	expect(response.status).toBe(413);
	expect(response.body).toMatchObject({
		ok: false,
		error: { code: "resource-limit" },
	});
});

it("authenticated shutdown closes only this service and its owned sessions", async () => {
	const { host, connection, server } = await fixture();
	await requestCommand(connection, { argv: ["open"] });
	expect(await requestCommand(connection, null)).toEqual({ closed: true });
	await server.close();
	expect(host.metrics()).toMatchObject({ sessions: 0, closed: true });
});

it("serves a credential-free shell with restrictive headers and no arbitrary files", async () => {
	const { server } = await fixture({
		playground: {
			html: "fixture shell",
			script: "export {};",
			styles: "body {}",
		},
	});
	const response = await fetch(server.origin);
	expect(await response.text()).toBe("fixture shell");
	expect(response.headers.get("content-security-policy")).toContain(
		"script-src 'self'",
	);
	expect(response.headers.get("cache-control")).toBe("no-store");
	expect(response.headers.get("referrer-policy")).toBe("no-referrer");
	expect((await fetch(`${server.origin}/connection.json`)).status).toBe(401);
	expect(
		(await fetch(`${server.origin}/playground.js`, { method: "HEAD" })).status,
	).toBe(200);
});

it("pairs only through CLI approval, scopes UI credentials and revokes them", async () => {
	const { server, connection } = await fixture({
		playground: { html: "shell", script: "", styles: "" },
	});
	const publicHeaders = { authorization: "", origin: server.origin };
	expect(
		(await api(server, {}, { authorization: "" }, "/api/pair/start")).status,
	).toBe(401);
	expect(
		(
			await api(
				server,
				{},
				{ ...publicHeaders, origin: "https://evil.example" },
				"/api/pair/start",
			)
		).status,
	).toBe(403);
	const started = await api(server, {}, publicHeaders, "/api/pair/start");
	expect(started.status).toBe(200);
	const { pair } = started.body as { pair: { id: string; code: string } };
	expect(
		(await api(server, { id: pair.id }, publicHeaders, "/api/pair/poll")).body,
	).toMatchObject({ approved: false });
	expect(await approvePlayground(connection, pair.code)).toEqual({
		approved: true,
		url: server.origin,
	});
	const approved = await api(
		server,
		{ id: pair.id },
		publicHeaders,
		"/api/pair/poll",
	);
	const { token } = approved.body as { token: string };
	expect(token).not.toBe(server.token);
	expect(
		(await api(server, { id: pair.id }, publicHeaders, "/api/pair/poll")).body,
	).toMatchObject({ ok: false, error: { code: "not-found" } });
	const headers = { authorization: `Bearer ${token}`, origin: server.origin };
	expect((await api(server, { argv: ["list"] }, headers)).status).toBe(200);
	expect((await api(server, {}, headers, "/api/shutdown")).status).toBe(403);
	expect(
		(await api(server, { code: pair.code }, headers, "/api/pair/approve"))
			.status,
	).toBe(403);
	expect(
		(await api(server, {}, headers, "/api/pair/revoke")).body,
	).toMatchObject({ revoked: true });
	expect((await api(server, { argv: ["list"] }, headers)).status).toBe(401);
});
