import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { AgentBrowserError } from "./errors.js";
import { validateWebSocketProtocols } from "./websocket-protocols.js";

export { validateWebSocketProtocols } from "./websocket-protocols.js";

const webSocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const invalidTokenCharacter = /[^!#$%&'*+\-.^_`|~0-9A-Za-z]/;
const invalidHeaderValueCharacter = /[^\t\x20-\x7e\x80-\xff]/;

function isToken(value: string): boolean {
	return value.length > 0 && !invalidTokenCharacter.test(value);
}

function trimWhitespace(value: string): string {
	return value.replace(/^[ \t]+|[ \t]+$/g, "");
}

function handshakeFailure(message: string): never {
	throw new AgentBrowserError("network-error", message);
}

function headerLimit(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"WebSocket handshake response header limit exceeded",
	);
}

export function createWebSocketKey(): string {
	return randomBytes(16).toString("base64");
}

export function validateWebSocketHandshake(
	status: number | undefined,
	rawHeaders: readonly string[],
	key: string,
	protocols: readonly string[],
	maxHeaderBytes: number,
): string {
	if (!Number.isSafeInteger(maxHeaderBytes) || maxHeaderBytes < 1)
		throw new AgentBrowserError(
			"invalid-input",
			"WebSocket header bound must be a positive safe integer",
		);
	if (
		typeof key !== "string" ||
		key.length !== 24 ||
		!/^[A-Za-z0-9+/]{22}==$/.test(key) ||
		Buffer.from(key, "base64").toString("base64") !== key
	)
		throw new AgentBrowserError(
			"invalid-input",
			"WebSocket key must be canonical base64 encoding of 16 bytes",
		);
	const requestedProtocols = validateWebSocketProtocols(protocols);
	if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0)
		handshakeFailure("Malformed WebSocket raw response headers");
	if (rawHeaders.length > Math.floor((maxHeaderBytes - 2) / 2)) headerLimit();
	let remainingHeaderBytes = maxHeaderBytes - 2;
	for (const value of rawHeaders) {
		if (typeof value !== "string")
			handshakeFailure("WebSocket response headers must be strings");
		if (value.length > remainingHeaderBytes - 2) headerLimit();
		const bytes = Buffer.byteLength(value, "utf8") + 2;
		if (bytes > remainingHeaderBytes) headerLimit();
		remainingHeaderBytes -= bytes;
	}
	if (status !== 101)
		handshakeFailure("WebSocket handshake requires HTTP status 101");

	let connectionUpgrade = false;
	let upgradeSeen = false;
	let accept: string | undefined;
	let selectedProtocol: string | undefined;
	for (let index = 0; index < rawHeaders.length; index += 2) {
		const name = rawHeaders[index];
		const rawValue = rawHeaders[index + 1];
		if (!isToken(name) || invalidHeaderValueCharacter.test(rawValue))
			handshakeFailure("Malformed WebSocket response header");
		const value = trimWhitespace(rawValue);
		switch (name.toLowerCase()) {
			case "connection":
				for (const entry of value.split(",")) {
					const token = trimWhitespace(entry);
					if (token === "") continue;
					if (!isToken(token))
						handshakeFailure("Malformed WebSocket Connection header");
					if (token.toLowerCase() === "upgrade") connectionUpgrade = true;
				}
				break;
			case "upgrade":
				if (upgradeSeen || value.toLowerCase() !== "websocket")
					handshakeFailure("Invalid WebSocket Upgrade header");
				upgradeSeen = true;
				break;
			case "sec-websocket-accept":
				if (accept !== undefined)
					handshakeFailure("Duplicate WebSocket accept header");
				accept = value;
				break;
			case "sec-websocket-protocol":
				if (
					selectedProtocol !== undefined ||
					!isToken(value) ||
					!requestedProtocols.includes(value)
				)
					handshakeFailure("Invalid WebSocket selected protocol");
				selectedProtocol = value;
				break;
			case "sec-websocket-extensions":
				handshakeFailure("WebSocket extensions were not offered");
		}
	}
	if (!connectionUpgrade || !upgradeSeen || accept === undefined)
		handshakeFailure("Missing required WebSocket upgrade response headers");
	const expectedAccept = createHash("sha1")
		.update(key + webSocketGuid)
		.digest("base64");
	if (accept !== expectedAccept)
		handshakeFailure("Invalid WebSocket accept digest");
	return selectedProtocol ?? "";
}
