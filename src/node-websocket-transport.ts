import { Buffer } from "node:buffer";
import { Resolver } from "node:dns/promises";
import { type ClientRequest, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Duplex } from "node:stream";
import { checkServerIdentity } from "node:tls";
import { AgentBrowserError } from "./errors.js";
import type { WebSocketTransport } from "./websocket-transport.js";

export { DocumentWebSockets } from "./document-websockets.js";
export type {
	DocumentWebSocketConnectOptions,
	DocumentWebSocketLimits,
	DocumentWebSocketOptions,
} from "./document-websockets.js";
export type {
	WebSocketConnection,
	WebSocketTransport,
} from "./websocket-transport.js";
import {
	NetworkPolicy,
	type NetworkPolicyOptions,
	addressFamily,
	networkHostname,
} from "./network.js";
import {
	NodeWebSocketConnection,
	type WebSocketConnectionLimits,
} from "./node-websocket-connection.js";
import {
	createWebSocketKey,
	validateWebSocketHandshake,
	validateWebSocketProtocols,
} from "./node-websocket-handshake.js";

export type {
	NativeWebSocketMessage,
	NodeWebSocketConnection,
	WebSocketCloseResult,
} from "./node-websocket-connection.js";

export interface NodeWebSocketLimits extends WebSocketConnectionLimits {
	handshakeTimeoutMs: number;
	maxHeaderBytes: number;
	maxConcurrent: number;
	maxConnections: number;
}

export const nodeWebSocketLimits: Readonly<NodeWebSocketLimits> = Object.freeze(
	{
		maxFrameBytes: 1_048_576,
		maxMessageBytes: 4_194_304,
		maxFramesPerPush: 4096,
		maxQueuedMessages: 128,
		maxQueuedBytes: 8_388_608,
		maxPendingSendBytes: 8_388_608,
		maxPendingWrites: 128,
		maxReceivedBytes: 67_108_864,
		maxSentBytes: 67_108_864,
		writeTimeoutMs: 15_000,
		closeTimeoutMs: 2000,
		handshakeTimeoutMs: 15_000,
		maxHeaderBytes: 16_384,
		maxConcurrent: 4,
		maxConnections: 16,
	},
);

export interface NodeWebSocketTransportOptions extends NetworkPolicyOptions {
	limits?: Partial<NodeWebSocketLimits>;
	resolver?: (
		hostname: string,
		signal: AbortSignal,
	) => Promise<readonly string[]>;
}

export interface NodeWebSocketConnectOptions {
	origin: string;
	protocols?: readonly string[];
	signal?: AbortSignal;
}

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function httpEquivalent(value: string, origins = false) {
	let url: URL;
	try {
		if (typeof value !== "string") return invalid("Invalid WebSocket URL");
		url = new URL(value);
	} catch {
		return invalid("Invalid WebSocket URL");
	}
	if (url.username || url.password || value.includes("#"))
		return invalid("WebSocket URLs cannot contain credentials or fragments");
	if (url.protocol === "wss:") url.protocol = "https:";
	else if (url.protocol === "ws:") url.protocol = "http:";
	else if (!origins || !["http:", "https:"].includes(url.protocol))
		return invalid("WebSocket URLs require ws or wss");
	return url;
}

function policyOrigins(values: readonly string[] | undefined) {
	if (values === undefined) return undefined;
	if (!Array.isArray(values) || values.length > 1000)
		return invalid("Invalid WebSocket origin policy");
	return values.map((value) => httpEquivalent(value, true).href);
}

function documentOrigin(value: string) {
	let origin: URL;
	try {
		if (typeof value !== "string")
			return invalid("A document origin is required");
		origin = new URL(value);
	} catch {
		return invalid("Invalid WebSocket document origin");
	}
	if (
		!["http:", "https:"].includes(origin.protocol) ||
		origin.username ||
		origin.password ||
		origin.pathname !== "/" ||
		origin.search ||
		value.includes("#")
	)
		return invalid("WebSocket document origin must be an HTTP(S) origin");
	return origin;
}

function abortReason(signal: AbortSignal) {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "WebSocket connection aborted");
}

function withSignal<Value>(
	promise: Promise<Value>,
	signal: AbortSignal,
): Promise<Value> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(abortReason(signal));
		if (signal.aborted) {
			void promise.catch(() => undefined);
			abort();
			return;
		}
		signal.addEventListener("abort", abort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", abort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

async function resolveAddresses(
	hostname: string,
	signal: AbortSignal,
): Promise<readonly string[]> {
	const resolver = new Resolver({ timeout: 2000, tries: 2 });
	const cancel = () => resolver.cancel();
	signal.addEventListener("abort", cancel, { once: true });
	try {
		if (signal.aborted) throw abortReason(signal);
		const results = await Promise.allSettled([
			resolver.resolve4(hostname),
			resolver.resolve6(hostname),
		]);
		const addresses = results.flatMap((result) =>
			result.status === "fulfilled" ? result.value : [],
		);
		if (!addresses.length)
			throw new AgentBrowserError(
				"network-error",
				"WebSocket DNS resolution failed",
			);
		return addresses;
	} finally {
		signal.removeEventListener("abort", cancel);
	}
}

export class NodeWebSocketTransport implements WebSocketTransport {
	readonly limits: Readonly<NodeWebSocketLimits>;
	private readonly policy: NetworkPolicy;
	private readonly resolver: NonNullable<
		NodeWebSocketTransportOptions["resolver"]
	>;
	private readonly pending = new Map<
		AbortController,
		Promise<NodeWebSocketConnection>
	>();
	private readonly connections = new Set<NodeWebSocketConnection>();
	private stopped = false;
	private attempts = 0;
	private requests = 0;
	private established = 0;

	constructor(options: NodeWebSocketTransportOptions = {}) {
		if (!options || typeof options !== "object" || Array.isArray(options))
			invalid("Invalid WebSocket transport options");
		if (
			options.limits !== undefined &&
			(!options.limits ||
				typeof options.limits !== "object" ||
				Array.isArray(options.limits))
		)
			invalid("Invalid WebSocket transport limits");
		for (const name of Object.keys(options.limits ?? {}))
			if (!Object.hasOwn(nodeWebSocketLimits, name))
				invalid("Unknown WebSocket limit");
		const limits = { ...nodeWebSocketLimits, ...options.limits };
		for (const value of Object.values(limits))
			if (!Number.isSafeInteger(value) || value < 1)
				invalid("WebSocket limits must be positive safe integers");
		if (
			limits.maxFrameBytes > limits.maxMessageBytes ||
			[
				limits.handshakeTimeoutMs,
				limits.writeTimeoutMs,
				limits.closeTimeoutMs,
				limits.maxHeaderBytes,
			].some((value) => value > 2_147_483_647)
		)
			invalid("Invalid WebSocket size or timeout limits");
		if (
			options.resolver !== undefined &&
			typeof options.resolver !== "function"
		)
			invalid("Invalid WebSocket address resolver");
		this.limits = Object.freeze(limits);
		this.policy = new NetworkPolicy({
			allowedOrigins: policyOrigins(options.allowedOrigins),
			allowPrivateOrigins: policyOrigins(options.allowPrivateOrigins),
		});
		this.resolver = options.resolver ?? resolveAddresses;
	}

	metrics() {
		return Object.freeze({
			attempts: this.attempts,
			requests: this.requests,
			established: this.established,
			pending: this.pending.size,
			active: this.connections.size,
			closed: this.stopped,
		});
	}

	async connect(
		value: string,
		options: NodeWebSocketConnectOptions,
	): Promise<NodeWebSocketConnection> {
		if (this.stopped)
			throw new AgentBrowserError("closed", "WebSocket transport is closed");
		if (!options || typeof options !== "object")
			invalid("WebSocket connect options are required");
		const url = httpEquivalent(value);
		this.policy.checkUrl(url.href);
		const origin = documentOrigin(options.origin);
		if (origin.protocol === "https:" && url.protocol !== "https:")
			throw new AgentBrowserError(
				"policy-denied",
				"Insecure WebSocket from a secure document",
			);
		const protocols = validateWebSocketProtocols(options.protocols);
		if (
			options.signal !== undefined &&
			!(options.signal instanceof AbortSignal)
		)
			invalid("Invalid WebSocket abort signal");
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "WebSocket connection aborted");
		if (
			this.pending.size + this.connections.size >= this.limits.maxConcurrent ||
			this.attempts >= this.limits.maxConnections
		)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket connection limit exceeded",
			);
		this.attempts++;
		const controller = new AbortController();
		const abort = () =>
			controller.abort(
				new AgentBrowserError("aborted", "WebSocket connection aborted"),
			);
		options.signal?.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(
			() =>
				controller.abort(
					new AgentBrowserError("timeout", "WebSocket handshake timed out"),
				),
			this.limits.handshakeTimeoutMs,
		);
		timer.unref();
		const canonical = new URL(url);
		canonical.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		const operation = this.open(
			canonical.href,
			url,
			origin.origin,
			protocols,
			controller.signal,
			options.signal,
		);
		this.pending.set(controller, operation);
		try {
			return await operation;
		} catch (error) {
			if (controller.signal.aborted) throw abortReason(controller.signal);
			throw error instanceof AgentBrowserError
				? error
				: new AgentBrowserError("network-error", "WebSocket connection failed");
		} finally {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", abort);
			this.pending.delete(controller);
		}
	}

	async close(): Promise<void> {
		this.stopped = true;
		const pending = [...this.pending.values()];
		const connections = [...this.connections];
		for (const controller of this.pending.keys())
			controller.abort(
				new AgentBrowserError("closed", "WebSocket transport closed"),
			);
		for (const connection of connections) connection.abort();
		await Promise.allSettled([
			...pending,
			...connections.map((connection) => connection.closed),
		]);
	}

	private async open(
		value: string,
		url: URL,
		origin: string,
		protocols: readonly string[],
		signal: AbortSignal,
		lifetimeSignal?: AbortSignal,
	): Promise<NodeWebSocketConnection> {
		const hostname = networkHostname(url);
		const addresses = addressFamily(hostname)
			? [hostname]
			: await withSignal(
					Promise.resolve().then(() => {
						if (signal.aborted) throw abortReason(signal);
						return this.resolver(hostname, signal);
					}),
					signal,
				);
		if (signal.aborted) throw abortReason(signal);
		this.policy.checkAddresses(url.href, addresses);
		const key = createWebSocketKey();
		const headers: Record<string, string> = {
			Host: url.host,
			Upgrade: "websocket",
			Connection: "Upgrade",
			"Sec-WebSocket-Key": key,
			"Sec-WebSocket-Version": "13",
			Origin: origin,
			"User-Agent": "AgentBrowser/0.1",
		};
		if (protocols.length)
			headers["Sec-WebSocket-Protocol"] = protocols.join(", ");
		if (
			Object.entries(headers).reduce(
				(bytes, [name, content]) =>
					bytes + Buffer.byteLength(name) + Buffer.byteLength(content) + 4,
				2,
			) > this.limits.maxHeaderBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket request headers exceed the limit",
			);
		return new Promise((resolve, reject) => {
			let request: ClientRequest | undefined;
			let upgraded: Duplex | undefined;
			let finished = false;
			const abort = () => fail(abortReason(signal));
			const fail = (error: unknown) => {
				if (finished) return;
				finished = true;
				signal.removeEventListener("abort", abort);
				upgraded?.destroy();
				request?.destroy();
				reject(
					error instanceof AgentBrowserError
						? error
						: new AgentBrowserError(
								"network-error",
								"WebSocket upgrade failed",
							),
				);
			};
			try {
				if (signal.aborted) throw abortReason(signal);
				const secure = url.protocol === "https:";
				this.requests++;
				request = (secure ? httpsRequest : httpRequest)({
					hostname: addresses[0],
					port: url.port || (secure ? 443 : 80),
					path: url.pathname + url.search,
					method: "GET",
					agent: false,
					headers,
					maxHeaderSize: this.limits.maxHeaderBytes,
					...(secure
						? {
								servername: addressFamily(hostname) ? "" : hostname,
								rejectUnauthorized: true,
								checkServerIdentity: (
									_name: string,
									certificate: Parameters<typeof checkServerIdentity>[1],
								) => checkServerIdentity(hostname, certificate),
							}
						: {}),
				});
				request.maxHeadersCount = 0;
				request.on("error", fail);
				request.on("close", () => {
					if (!finished)
						fail(
							new AgentBrowserError(
								"network-error",
								"WebSocket request closed during handshake",
							),
						);
				});
				request.on("response", (response) => {
					response.destroy();
					fail(
						new AgentBrowserError(
							"network-error",
							`WebSocket upgrade returned HTTP ${response.statusCode ?? 0}`,
						),
					);
				});
				request.on("upgrade", (response, socket, head) => {
					if (finished) {
						socket.destroy();
						return;
					}
					upgraded = socket;
					try {
						if (signal.aborted || this.stopped)
							throw signal.aborted
								? abortReason(signal)
								: new AgentBrowserError("closed", "WebSocket transport closed");
						const protocol = validateWebSocketHandshake(
							response.statusCode,
							response.rawHeaders,
							key,
							protocols,
							this.limits.maxHeaderBytes,
						);
						const connection = new NodeWebSocketConnection(
							socket,
							value,
							protocol,
							this.limits,
							lifetimeSignal,
							() => this.connections.delete(connection),
						);
						this.connections.add(connection);
						this.established++;
						finished = true;
						signal.removeEventListener("abort", abort);
						resolve(connection);
						if (head.length) connection.accept(head);
					} catch (error) {
						fail(error);
					}
				});
				signal.addEventListener("abort", abort, { once: true });
				if (signal.aborted) abort();
				else request.end();
			} catch (error) {
				fail(error);
			}
		});
	}
}
