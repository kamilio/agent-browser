import type { AgentBrowserError } from "./errors.js";

export interface WebSocketCloseResult {
	readonly code: number;
	readonly reason: string;
	readonly wasClean: boolean;
}

export interface NativeWebSocketMessage {
	readonly data: string | Uint8Array;
}

export interface WebSocketConnection {
	readonly url: string;
	readonly protocol: string;
	readonly closed: Promise<WebSocketCloseResult>;
	read(): Promise<NativeWebSocketMessage | undefined>;
	send(data: string | Uint8Array): Promise<void>;
	close(code?: number, reason?: string): Promise<WebSocketCloseResult>;
	abort(error?: AgentBrowserError): void;
}

export interface WebSocketConnectOptions {
	origin: string;
	protocols?: readonly string[];
	signal?: AbortSignal;
}

export interface WebSocketTransport {
	connect(
		url: string,
		options: WebSocketConnectOptions,
	): Promise<WebSocketConnection>;
}
