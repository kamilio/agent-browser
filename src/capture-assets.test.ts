import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { listenCommandServer } from "./node-command-server.js";
import { playgroundHtml } from "./playground-assets.js";

const fixture = vi.hoisted(() => ({
	handler: undefined as
		| ((request: IncomingMessage, response: ServerResponse) => void)
		| undefined,
}));
vi.mock("node:http", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		createServer: (
			_options: unknown,
			handler: (request: IncomingMessage, response: ServerResponse) => void,
		) => {
			fixture.handler = handler;
			return new (class extends EventEmitter {
				listen() {
					queueMicrotask(() => this.emit("listening"));
				}
				address() {
					return { port: 34567 };
				}
				close(callback: () => void) {
					callback();
				}
				closeAllConnections() {}
			})();
		},
	};
});
const servers: Awaited<ReturnType<typeof listenCommandServer>>[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
});

it("serves only the explicit capture modules and allows blob images without remote image origins", async () => {
	const execute = vi.fn();
	const server = await listenCommandServer(
		{ execute, close() {} },
		{
			playground: {
				html: playgroundHtml,
				styles: "styles",
				script: "script",
				captureClient: "client-module",
				captureArtifacts: "artifact-module",
				errors: "error-module",
			},
		},
	);
	servers.push(server);
	for (const [path, content] of [
		["/capture-client.js", "client-module"],
		["/capture-artifacts.js", "artifact-module"],
		["/errors.js", "error-module"],
	]) {
		let status = 0;
		let headers: Record<string, string> = {};
		let body: unknown;
		fixture.handler?.(
			{
				method: "GET",
				url: path,
				headers: { host: "127.0.0.1:34567" },
				rawHeaders: ["Host", "127.0.0.1:34567"],
			} as IncomingMessage,
			{
				writeHead: (code: number, value: Record<string, string>) => {
					status = code;
					headers = value;
				},
				end: (value: unknown) => {
					body = value;
				},
			} as unknown as ServerResponse,
		);
		expect(status).toBe(200);
		expect(body).toBe(content);
		expect(headers["content-type"]).toBe("text/javascript; charset=utf-8");
		expect(headers["content-security-policy"]).toContain("img-src blob:;");
		expect(headers["content-security-policy"]).not.toContain("img-src *");
		expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
	}
	expect(execute).not.toHaveBeenCalled();
	expect(playgroundHtml).toContain('id="capture-render"');
	expect(playgroundHtml).toContain('id="download-png"');
	expect(playgroundHtml).toContain('data-view="render"');
});

it("rejects a foreign Origin header on capture-module requests", async () => {
	const server = await listenCommandServer(
		{ execute: vi.fn(), close() {} },
		{
			playground: {
				html: "html",
				script: "script",
				styles: "css",
				captureClient: "client",
			},
		},
	);
	servers.push(server);
	let status = 0;
	fixture.handler?.(
		{
			method: "GET",
			url: "/capture-client.js",
			headers: {
				host: "127.0.0.1:34567",
				origin: "https://foreign.invalid",
				"sec-fetch-site": "cross-site",
			},
			rawHeaders: [
				"Host",
				"127.0.0.1:34567",
				"Origin",
				"https://foreign.invalid",
			],
		} as IncomingMessage,
		{
			writeHead: (code: number) => {
				status = code;
			},
			end: () => {},
		} as unknown as ServerResponse,
	);
	expect(status).toBe(403);
});
