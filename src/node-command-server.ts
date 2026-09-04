import { randomBytes, timingSafeEqual } from "node:crypto";
import {
	type IncomingMessage,
	type ServerResponse,
	createServer,
} from "node:http";
import type { Socket } from "node:net";
import type { CommandExecutor } from "./command-host.js";
import { AgentBrowserError } from "./errors.js";
import { PlaygroundAuth } from "./playground-auth.js";
import { playgroundDependencyPaths } from "./node-playground-assets.js";

export interface CommandServerOptions {
	port?: number;
	token?: string;
	maxRequestBytes?: number;
	maxResponseBytes?: number;
	bodyTimeoutMs?: number;
	onShutdown?: () => void | Promise<void>;
	playground?: {
		html: string;
		script: string;
		styles: string;
		captureClient?: string;
		captureArtifacts?: string;
		errors?: string;
		terminalTabs?: string;
	};
}

function headerCount(request: IncomingMessage, name: string) {
	let count = 0;
	for (let index = 0; index < request.rawHeaders.length; index += 2)
		if (request.rawHeaders[index].toLowerCase() === name) count++;
	return count;
}

function readBody(request: IncomingMessage, limit: number, timeoutMs: number) {
	return new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		let bytes = 0;
		const timer = setTimeout(() => {
			cleanup();
			request.pause();
			reject(
				new AgentBrowserError("timeout", "API request body deadline exceeded"),
			);
		}, timeoutMs);
		const cleanup = () => {
			clearTimeout(timer);
			request.off("data", data);
			request.off("end", end);
			request.off("error", error);
			request.off("aborted", abort);
		};
		const error = () => {
			cleanup();
			reject(new AgentBrowserError("aborted", "Request body interrupted"));
		};
		const abort = () => error();
		const data = (chunk: Buffer) => {
			bytes += chunk.byteLength;
			if (bytes > limit) {
				cleanup();
				request.pause();
				reject(
					new AgentBrowserError(
						"resource-limit",
						"API request body limit exceeded",
					),
				);
				return;
			}
			chunks.push(chunk);
		};
		const end = () => {
			cleanup();
			resolve(Buffer.concat(chunks));
		};
		request.on("data", data);
		request.once("end", end);
		request.once("error", error);
		request.once("aborted", abort);
	});
}

export async function listenCommandServer(
	host: CommandExecutor,
	options: CommandServerOptions = {},
) {
	const port = options.port ?? 0;
	const token = options.token ?? randomBytes(32).toString("base64url");
	const maxRequestBytes = options.maxRequestBytes ?? 65_536;
	const maxResponseBytes = options.maxResponseBytes ?? 2_097_152;
	const bodyTimeoutMs = options.bodyTimeoutMs ?? 10_000;
	if (
		!Number.isSafeInteger(bodyTimeoutMs) ||
		bodyTimeoutMs < 1 ||
		bodyTimeoutMs > 30_000
	)
		throw new AgentBrowserError("invalid-input", "Invalid API body timeout");
	if (
		!Number.isInteger(port) ||
		port < 0 ||
		port > 65_535 ||
		!/^[a-zA-Z0-9_-]{43}$/.test(token)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid command server configuration",
		);
	for (const limit of [maxRequestBytes, maxResponseBytes])
		if (!Number.isSafeInteger(limit) || limit < 256 || limit > 16_777_216)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid command server byte limit",
			);
	const tokenBytes = Buffer.from(`Bearer ${token}`);
	const playground = new PlaygroundAuth();
	const assets = new Map<string, { content: string; type: string }>();
	if (options.playground) {
		for (const content of Object.values(options.playground))
			if (typeof content !== "string" || Buffer.byteLength(content) > 524_288)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid playground assets",
				);
		assets.set("/", {
			content: options.playground.html,
			type: "text/html; charset=utf-8",
		});
		assets.set("/playground.js", {
			content: options.playground.script,
			type: "text/javascript; charset=utf-8",
		});
		assets.set("/playground.css", {
			content: options.playground.styles,
			type: "text/css; charset=utf-8",
		});
		for (const [key, path] of playgroundDependencyPaths) {
			const content = options.playground[key];
			if (content !== undefined)
				assets.set(path, { content, type: "text/javascript; charset=utf-8" });
		}
	}
	let origin = "";
	let closing: Promise<void> | undefined;
	const sockets = new Set<Socket>();
	const controllers = new Set<AbortController>();
	const server = createServer(
		{
			maxHeaderSize: 8192,
			requestTimeout: 10_000,
			headersTimeout: 10_000,
			keepAliveTimeout: 1000,
		},
		(request, response) => {
			void handle(request, response).catch(() => {
				if (!response.headersSent)
					send(response, 500, {
						ok: false,
						error: {
							code: "network-error",
							message: "Local API request failed",
						},
					});
				else response.destroy();
			});
		},
	);
	server.maxHeadersCount = 32;
	server.maxRequestsPerSocket = 100;
	server.on("connection", (socket) => {
		if (sockets.size >= 32 || closing) {
			socket.destroy();
			return;
		}
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
	});
	server.on("upgrade", (_request, socket) => socket.destroy());
	server.on("clientError", (_error, socket) => socket.destroy());

	function send(response: ServerResponse, status: number, data: unknown) {
		let statusCode = status;
		let body = JSON.stringify(data);
		if (Buffer.byteLength(body) > maxResponseBytes) {
			statusCode = 413;
			body = JSON.stringify({
				ok: false,
				error: {
					code: "resource-limit",
					message: "API response body limit exceeded",
				},
			});
		}
		response.writeHead(statusCode, {
			"content-type": "application/json; charset=utf-8",
			"content-length": Buffer.byteLength(body),
			"cache-control": "no-store",
			"x-content-type-options": "nosniff",
			"content-security-policy": "default-src 'none'; frame-ancestors 'none'",
			"referrer-policy": "no-referrer",
			connection: "close",
		});
		response.end(body);
	}

	async function handle(request: IncomingMessage, response: ServerResponse) {
		const expectedHost = new URL(origin).host;
		const asset = ["GET", "HEAD"].includes(request.method ?? "")
			? assets.get(request.url ?? "")
			: undefined;
		if (
			headerCount(request, "host") !== 1 ||
			request.headers.host !== expectedHost ||
			headerCount(request, "origin") > 1 ||
			(request.headers.origin !== undefined &&
				request.headers.origin !== origin) ||
			(!asset &&
				request.headers["sec-fetch-site"] !== undefined &&
				!["same-origin", "none"].includes(
					String(request.headers["sec-fetch-site"]),
				))
		) {
			send(response, 403, {
				ok: false,
				error: {
					code: "policy-denied",
					message: "Local API origin or host denied",
				},
			});
			return;
		}
		if (asset) {
			response.writeHead(200, {
				"content-type": asset.type,
				"content-length": Buffer.byteLength(asset.content),
				"cache-control": "no-store",
				"x-content-type-options": "nosniff",
				"referrer-policy": "no-referrer",
				"cross-origin-resource-policy": "same-origin",
				"content-security-policy":
					"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
				connection: "close",
			});
			response.end(request.method === "HEAD" ? undefined : asset.content);
			return;
		}
		const authorization =
			typeof request.headers.authorization === "string"
				? Buffer.from(request.headers.authorization)
				: Buffer.alloc(0);
		const mainAuthorization =
			headerCount(request, "authorization") === 1 &&
			authorization.byteLength === tokenBytes.byteLength &&
			timingSafeEqual(authorization, tokenBytes);
		const bearer =
			/^Bearer ([a-zA-Z0-9_-]{43})$/.exec(authorization.toString())?.[1] ?? "";
		const uiAuthorization =
			!closing &&
			headerCount(request, "authorization") === 1 &&
			playground.authorize(bearer);
		const publicPairing =
			assets.size > 0 &&
			["/api/pair/start", "/api/pair/poll"].includes(request.url ?? "") &&
			request.headers.origin === origin;
		if (!mainAuthorization && !uiAuthorization && !publicPairing) {
			send(response, 401, {
				ok: false,
				error: {
					code: "policy-denied",
					message: "Local API authentication required",
				},
			});
			return;
		}
		if (closing) {
			send(response, 503, {
				ok: false,
				error: { code: "closed", message: "Local API is closing" },
			});
			return;
		}
		if (
			request.method !== "POST" ||
			![
				"/api/command",
				"/api/shutdown",
				...(assets.size
					? [
							"/api/pair/start",
							"/api/pair/poll",
							"/api/pair/approve",
							"/api/pair/revoke",
						]
					: []),
			].includes(request.url ?? "")
		) {
			send(response, 404, {
				ok: false,
				error: { code: "not-found", message: "Unknown local API operation" },
			});
			return;
		}
		if (
			["/api/shutdown", "/api/pair/approve"].includes(request.url ?? "") &&
			!mainAuthorization
		) {
			send(response, 403, {
				ok: false,
				error: {
					code: "policy-denied",
					message: "This operation requires the local CLI credential",
				},
			});
			return;
		}
		if (
			headerCount(request, "content-type") !== 1 ||
			!/^application\/json(?:;\s*charset=utf-8)?$/i.test(
				request.headers["content-type"] ?? "",
			)
		) {
			send(response, 415, {
				ok: false,
				error: { code: "invalid-input", message: "Expected application/json" },
			});
			return;
		}
		const controller = new AbortController();
		controllers.add(controller);
		const abort = () => {
			if (!response.writableEnded)
				controller.abort(
					new AgentBrowserError("aborted", "API client disconnected"),
				);
		};
		request.once("aborted", abort);
		response.once("close", abort);
		try {
			if (Number(request.headers["content-length"] ?? 0) > maxRequestBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"API request body limit exceeded",
				);
			const bytes = await readBody(request, maxRequestBytes, bodyTimeoutMs);
			let body: unknown;
			try {
				body = JSON.parse(
					new TextDecoder("utf-8", { fatal: true }).decode(bytes),
				);
			} catch {
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid JSON request body",
				);
			}
			if (!body || typeof body !== "object" || Array.isArray(body))
				throw new AgentBrowserError("invalid-input", "Invalid API request");
			if (request.url?.startsWith("/api/pair/")) {
				const input = body as { id?: unknown; code?: unknown };
				const required = request.url.endsWith("/poll")
					? ["id"]
					: request.url.endsWith("/approve")
						? ["code"]
						: [];
				if (
					Object.keys(body).length !== required.length ||
					Object.keys(body).some((key) => !required.includes(key))
				)
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid playground pairing request",
					);
				if (request.url.endsWith("/start"))
					send(response, 200, { ok: true, pair: playground.start() });
				else if (request.url.endsWith("/poll"))
					send(response, 200, { ok: true, ...playground.poll(input.id) });
				else if (request.url.endsWith("/approve"))
					send(response, 200, { ok: true, ...playground.approve(input.code) });
				else
					send(response, 200, { ok: true, revoked: playground.revoke(bearer) });
				return;
			}
			if (request.url === "/api/shutdown") {
				if (Object.keys(body).length)
					throw new AgentBrowserError(
						"invalid-input",
						"Shutdown takes an empty request",
					);
				response.once("finish", () => {
					setImmediate(() => {
						void close()
							.then(() => options.onShutdown?.())
							.catch(() => {});
					});
				});
				send(response, 200, { ok: true, closed: true });
				return;
			}
			const input = body as { argv?: unknown; session?: unknown };
			if (
				Object.keys(body).some((key) => !["argv", "session"].includes(key)) ||
				!Array.isArray(input.argv) ||
				input.argv.some((argument) => typeof argument !== "string") ||
				(input.session !== undefined && typeof input.session !== "string")
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Expected argv strings and optional session name",
				);
			const result = await host.execute(input.argv, {
				session: input.session as string | undefined,
				signal: controller.signal,
			});
			if (!response.destroyed) send(response, 200, { ok: true, result });
		} catch (error) {
			if (response.destroyed) return;
			const known =
				error instanceof AgentBrowserError
					? error
					: new AgentBrowserError("network-error", "Local API command failed");
			const status =
				known.code === "resource-limit"
					? 413
					: known.code === "timeout"
						? 408
						: known.code === "unsupported"
							? 422
							: known.code === "closed"
								? 409
								: 400;
			send(response, status, {
				ok: false,
				error: { code: known.code, message: known.message },
			});
		} finally {
			request.off("aborted", abort);
			response.off("close", abort);
			controllers.delete(controller);
		}
	}

	function close(): Promise<void> {
		if (closing) return closing;
		for (const controller of controllers)
			controller.abort(new AgentBrowserError("closed", "Local API is closed"));
		playground.close();
		const serverClosed = new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
		closing = Promise.allSettled([
			serverClosed,
			Promise.resolve().then(() => host.close()),
		]).then((results) => {
			for (const result of results)
				if (result.status === "rejected") throw result.reason;
		});
		server.closeAllConnections();
		return closing;
	}

	await new Promise<void>((resolve, reject) => {
		const failure = (error: Error) => {
			server.off("listening", ready);
			reject(error);
		};
		const ready = () => {
			server.off("error", failure);
			resolve();
		};
		server.once("error", failure);
		server.once("listening", ready);
		server.listen(port, "127.0.0.1");
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		await close();
		throw new AgentBrowserError("network-error", "Missing local API address");
	}
	origin = `http://127.0.0.1:${address.port}`;
	return { origin, token, close };
}
