import type { DocumentTree } from "./document.js";
import { DocumentWebSocketPolicy } from "./document-websocket-policy.js";
import { AgentBrowserError } from "./errors.js";
import { validateWebSocketProtocols } from "./websocket-protocols.js";
import type {
	WebSocketConnection,
	WebSocketTransport,
} from "./websocket-transport.js";

export interface DocumentWebSocketLimits {
	maxConcurrent: number;
	maxConnections: number;
	handshakeTimeoutMs: number;
}

export interface DocumentWebSocketOptions {
	headerValues?: readonly string[];
	limits?: Partial<DocumentWebSocketLimits>;
}

export interface DocumentWebSocketConnectOptions {
	protocols?: readonly string[];
	signal?: AbortSignal;
}

interface Lease {
	controller: AbortController;
	cancelled: boolean;
	dispatched: boolean;
	abortRequested: boolean;
	completionObserved: boolean;
	connection?: WebSocketConnection;
	reject(error: unknown): void;
	detach(): void;
	timer?: ReturnType<typeof setTimeout>;
}

export class DocumentWebSockets {
	private readonly policy: DocumentWebSocketPolicy;
	private readonly limits: Readonly<DocumentWebSocketLimits>;
	private readonly leases = new Set<Lease>();
	private readonly unregisterClose: () => unknown;
	private attempts = 0;
	private failures = 0;
	private cleanupFailures = 0;
	private closed = false;

	constructor(
		tree: DocumentTree,
		private readonly transport: WebSocketTransport,
		options: DocumentWebSocketOptions = {},
	) {
		if (!options || typeof options !== "object" || Array.isArray(options))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document WebSocket options",
			);
		if (!transport || typeof transport.connect !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Document WebSockets require an explicit transport",
			);
		this.limits = Object.freeze({
			maxConcurrent: 4,
			maxConnections: 16,
			handshakeTimeoutMs: 15_000,
			...options.limits,
		});
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid document WebSocket limits",
				);
		if (this.limits.handshakeTimeoutMs > 2_147_483_647)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document WebSocket timeout",
			);
		this.policy = new DocumentWebSocketPolicy(tree, options.headerValues);
		try {
			this.unregisterClose = tree.onClose(() => this.close());
		} catch (error) {
			this.policy.close();
			throw error;
		}
	}

	async connect(
		input: unknown,
		options: DocumentWebSocketConnectOptions = {},
	): Promise<WebSocketConnection> {
		this.ensureOpen();
		if (!options || typeof options !== "object" || Array.isArray(options))
			throw new AgentBrowserError("invalid-input", "Invalid WebSocket options");
		const protocols = validateWebSocketProtocols(options.protocols);
		const signal = options.signal;
		if (signal !== undefined && !(signal instanceof AbortSignal))
			throw new AgentBrowserError("invalid-input", "Invalid WebSocket signal");
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "WebSocket connection aborted");
		const target = this.policy.resolve(input);
		if (
			this.leases.size >= this.limits.maxConcurrent ||
			this.attempts >= this.limits.maxConnections
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Document WebSocket connection limit exceeded",
			);
		this.attempts++;
		return new Promise((resolve, reject) => {
			const abort = () =>
				this.cancel(
					lease,
					new AgentBrowserError("aborted", "WebSocket connection aborted"),
				);
			const lease: Lease = {
				controller: new AbortController(),
				cancelled: false,
				dispatched: false,
				abortRequested: false,
				completionObserved: false,
				reject,
				detach: () => signal?.removeEventListener("abort", abort),
			};
			this.leases.add(lease);
			signal?.addEventListener("abort", abort, { once: true });
			lease.timer = setTimeout(
				() =>
					this.cancel(
						lease,
						new AgentBrowserError("timeout", "WebSocket handshake timed out"),
					),
				this.limits.handshakeTimeoutMs,
			);
			void Promise.resolve()
				.then(() => {
					if (lease.cancelled || !this.leases.has(lease))
						throw new AgentBrowserError(
							"aborted",
							"WebSocket connection aborted",
						);
					lease.dispatched = true;
					return this.transport.connect(target.url, {
						origin: target.origin,
						protocols,
						signal: lease.controller.signal,
					});
				})
				.then(
					(connection) => {
						if (!this.leases.has(lease)) {
							this.abortConnection(connection);
							return;
						}
						lease.connection = connection;
						const completion = connection?.closed;
						if (completion instanceof Promise) {
							lease.completionObserved = true;
							void completion.then(
								() => this.release(lease),
								() => {
									this.cancel(
										lease,
										new AgentBrowserError("network-error", "WebSocket failed"),
									);
									this.release(lease);
								},
							);
						}
						if (lease.cancelled) {
							this.abortLease(lease);
							if (!connection) this.release(lease);
							return;
						}
						if (
							!connection ||
							connection.url !== target.url ||
							(connection.protocol !== "" &&
								!protocols.includes(connection.protocol)) ||
							![
								connection.read,
								connection.send,
								connection.close,
								connection.abort,
							].every((operation) => typeof operation === "function") ||
							!(completion instanceof Promise)
						) {
							this.cancel(
								lease,
								new AgentBrowserError(
									"network-error",
									"Invalid WebSocket connection result",
								),
							);
							if (!connection) this.release(lease);
							return;
						}
						clearTimeout(lease.timer);
						lease.timer = undefined;
						resolve(connection);
					},
					(error) => {
						this.cancel(
							lease,
							error instanceof AgentBrowserError
								? error
								: new AgentBrowserError(
										"network-error",
										"WebSocket connection failed",
									),
						);
						this.release(lease);
					},
				)
				.catch(() => {
					this.cancel(
						lease,
						new AgentBrowserError(
							"network-error",
							"Invalid WebSocket connection result",
						),
					);
					this.abortLease(lease);
					if (!lease.connection) this.release(lease);
				});
		});
	}

	metrics() {
		let connecting = 0;
		let closing = 0;
		let quarantined = 0;
		for (const lease of this.leases) {
			if (!lease.connection) connecting++;
			else if (lease.cancelled) {
				closing++;
				if (!lease.completionObserved) quarantined++;
			}
		}
		return Object.freeze({
			closed: this.closed,
			attempts: this.attempts,
			connecting,
			closing,
			quarantined,
			open: this.leases.size - connecting - closing,
			failures: this.failures,
			cleanupFailures: this.cleanupFailures,
		});
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.unregisterClose();
		this.policy.close();
		for (const lease of this.leases)
			this.cancel(
				lease,
				new AgentBrowserError("closed", "WebSocket document closed"),
			);
	}

	private ensureOpen(): void {
		if (this.closed)
			throw new AgentBrowserError("closed", "WebSocket document closed");
	}

	private release(lease: Lease): boolean {
		if (!this.leases.delete(lease)) return false;
		clearTimeout(lease.timer);
		lease.detach();
		return true;
	}

	private cancel(lease: Lease, error: AgentBrowserError): void {
		if (lease.cancelled || !this.leases.has(lease)) return;
		lease.cancelled = true;
		clearTimeout(lease.timer);
		lease.detach();
		this.failures++;
		lease.controller.abort(error);
		this.abortLease(lease, error);
		if (!lease.dispatched) this.release(lease);
		lease.reject(error);
	}

	private abortLease(lease: Lease, error?: AgentBrowserError): void {
		if (!lease.connection || lease.abortRequested) return;
		lease.abortRequested = true;
		this.abortConnection(lease.connection, error);
	}

	private abortConnection(
		connection: WebSocketConnection,
		error?: AgentBrowserError,
	): void {
		try {
			if (connection.closed instanceof Promise)
				void connection.closed.catch(() => undefined);
		} catch {
			this.cleanupFailures++;
		}
		try {
			void Promise.resolve(connection.abort(error)).catch(() => {
				this.cleanupFailures++;
			});
		} catch {
			this.cleanupFailures++;
		}
	}
}
