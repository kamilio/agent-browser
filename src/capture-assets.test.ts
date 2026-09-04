import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { listenCommandServer } from "./node-command-server.js";
import { playgroundHtml } from "./playground-assets.js";
import {
	loadPlaygroundAssets,
	playgroundDependencyPaths,
} from "./node-playground-assets.js";

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
				terminalTabs: "tab-module",
			},
		},
	);
	servers.push(server);
	for (const [path, content] of [
		["/capture-client.js", "client-module"],
		["/capture-artifacts.js", "artifact-module"],
		["/errors.js", "error-module"],
		["/terminal-tabs.js", "tab-module"],
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

it.each(["/capture-client.js", "/terminal-tabs.js"])(
	"rejects a foreign Origin header on %s requests",
	async (path) => {
		const server = await listenCommandServer(
			{ execute: vi.fn(), close() {} },
			{
				playground: {
					html: "html",
					script: "script",
					styles: "css",
					captureClient: "client",
					terminalTabs: "tabs",
				},
			},
		);
		servers.push(server);
		let status = 0;
		fixture.handler?.(
			{
				method: "GET",
				url: path,
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
	},
);

it("loads the tab projection with a closed local frontend module graph", async () => {
	const assets = await loadPlaygroundAssets(
		async (name) =>
			ts.transpileModule(
				await readFile(new URL(`./${name}.ts`, import.meta.url), "utf8"),
				{
					compilerOptions: {
						target: ts.ScriptTarget.ES2022,
						module: ts.ModuleKind.ESNext,
						verbatimModuleSyntax: true,
					},
				},
			).outputText,
	);
	const modules = new Map<string, string>([
		["/playground.js", assets.script],
		...playgroundDependencyPaths.map(
			([key, path]) => [path, assets[key]] as [string, string],
		),
	]);
	expect(modules.get("/terminal-tabs.js")).toContain("terminalTabs");
	expect(assets.script).toContain('from "./terminal-tabs.js"');
	for (const [path, source] of modules) {
		const parsed = ts.createSourceFile(
			path,
			source,
			ts.ScriptTarget.ES2022,
			true,
			ts.ScriptKind.JS,
		);
		for (const statement of parsed.statements) {
			if (
				(!ts.isImportDeclaration(statement) &&
					!ts.isExportDeclaration(statement)) ||
				!statement.moduleSpecifier
			)
				continue;
			if (!ts.isStringLiteral(statement.moduleSpecifier))
				throw new Error("Unexpected module expression");
			const resolved = new URL(
				statement.moduleSpecifier.text,
				`https://fixture.invalid${path}`,
			);
			expect(resolved.origin).toBe("https://fixture.invalid");
			expect(modules.has(resolved.pathname)).toBe(true);
		}
	}
});
