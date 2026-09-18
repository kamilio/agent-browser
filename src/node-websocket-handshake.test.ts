import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	createWebSocketKey,
	validateWebSocketHandshake,
	validateWebSocketProtocols,
} from "./node-websocket-handshake.js";

const rfcKey = "dGhlIHNhbXBsZSBub25jZQ==";
const rfcAccept = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";
const headerBudget = 4096;

function validHeaders(): string[] {
	return [
		"Connection",
		"Upgrade",
		"Upgrade",
		"websocket",
		"Sec-WebSocket-Accept",
		rfcAccept,
	];
}

function expectCode(action: () => unknown, code: ErrorCode): void {
	expect(action).toThrowError(
		expect.objectContaining({ name: "AgentBrowserError", code }),
	);
	expect(action).toThrowError(AgentBrowserError);
}

function validate(
	headers: readonly string[],
	protocols: readonly string[] = [],
) {
	return validateWebSocketHandshake(
		101,
		headers,
		rfcKey,
		protocols,
		headerBudget,
	);
}

function headerBytes(headers: readonly string[]): number {
	return headers.reduce(
		(total, value) => total + Buffer.byteLength(value, "utf8") + 2,
		2,
	);
}

describe("WebSocket protocol options", () => {
	it("returns independent frozen lists without normalizing or mutating input", () => {
		const input = ["chat", "Chat", "!#$%&'*+-.^_`|~0123456789AZaz"];
		const original = [...input];
		const protocols = validateWebSocketProtocols(input);
		expect(protocols).toEqual(original);
		expect(protocols).not.toBe(input);
		expect(Object.isFrozen(protocols)).toBe(true);
		expect(input).toEqual(original);
		input[0] = "changed";
		expect(protocols[0]).toBe("chat");
		expect(validateWebSocketProtocols(Object.freeze(original))).toEqual(
			original,
		);
	});

	it("accepts omitted and empty lists and the exact count and length bounds", () => {
		const empty: string[] = [];
		const result = validateWebSocketProtocols(empty);
		expect(result).toEqual([]);
		expect(result).not.toBe(empty);
		expect(Object.isFrozen(result)).toBe(true);
		expect(validateWebSocketProtocols()).toEqual([]);
		expect(Object.isFrozen(validateWebSocketProtocols())).toBe(true);
		const protocols = Array.from({ length: 32 }, (_, index) => `chat-${index}`);
		protocols[0] = "a".repeat(256);
		expect(validateWebSocketProtocols(protocols)).toEqual(protocols);
	});

	it.each([
		"",
		" chat",
		"chat ",
		"chat\t",
		"chat\n",
		"chat\r",
		"two words",
		"chat,other",
		"chat/other",
		"chat:other",
		'"chat"',
		"chat(other)",
		"chat[other]",
		"chat{other}",
		"chat\\other",
		"chat?other",
		"chat=other",
		"chát",
		"chat\u007f",
		"chat\u0000",
		"chat\u00a0",
		"a".repeat(257),
	])("rejects an invalid protocol token %j", (protocol) => {
		expectCode(() => validateWebSocketProtocols([protocol]), "invalid-input");
	});

	it("rejects duplicates instead of silently removing them", () => {
		const input = Object.freeze(["chat", "chat"]);
		expectCode(() => validateWebSocketProtocols(input), "invalid-input");
		expect(input).toEqual(["chat", "chat"]);
	});

	it("rejects nonarrays, nonstrings, holes and excessive lists", () => {
		for (const input of [
			null,
			"chat",
			{},
			{ length: 0 },
			new Set(["chat"]),
			[null],
			[1],
			[undefined],
			[new String("chat")],
			new Array(1),
			Array.from({ length: 33 }, (_, index) => `chat-${index}`),
		]) {
			expectCode(
				() => validateWebSocketProtocols(input as readonly string[]),
				"invalid-input",
			);
		}
	});
});

describe("WebSocket client keys", () => {
	it("creates canonical base64 keys encoding exactly 16 bytes", () => {
		for (let index = 0; index < 4; index++) {
			const key = createWebSocketKey();
			expect(key).toMatch(/^[A-Za-z0-9+/]{22}==$/);
			const decoded = Buffer.from(key, "base64");
			expect(decoded).toHaveLength(16);
			expect(decoded.toString("base64")).toBe(key);
			const headers = validHeaders();
			headers[5] = createHash("sha1")
				.update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
				.digest("base64");
			expect(
				validateWebSocketHandshake(101, headers, key, [], headerBudget),
			).toBe("");
		}
	});

	it("rejects malformed, noncanonical or incorrectly sized caller keys", () => {
		for (const key of [
			undefined,
			null,
			12,
			"",
			` ${rfcKey}`,
			`${rfcKey}\n`,
			rfcKey.slice(0, -2),
			"dGhlIHNhbXBsZSBub25jZR==",
			"______________________==",
			Buffer.alloc(15).toString("base64"),
			Buffer.alloc(17).toString("base64"),
			"a".repeat(100_000),
		]) {
			expectCode(
				() =>
					validateWebSocketHandshake(
						101,
						validHeaders(),
						key as string,
						[],
						headerBudget,
					),
				"invalid-input",
			);
		}
	});
});

describe("bounded raw WebSocket opening handshakes", () => {
	it("accepts the RFC key/accept vector without selecting a protocol", () => {
		expect(validate(validHeaders())).toBe("");
		expect(validate(validHeaders(), ["chat"])).toBe("");
	});

	it("handles header casing, HTTP list whitespace and repeated Connection fields", () => {
		expect(
			validate([
				"cOnNeCtIoN",
				" keep-alive, \t",
				"CONNECTION",
				" , \tUpGrAdE\t, close, ",
				"uPgRaDe",
				"\tWebSocket ",
				"sEc-WeBsOcKeT-aCcEpT",
				` \t${rfcAccept}\t `,
				"X-Unrelated",
				"",
			]),
		).toBe("");
	});

	it("returns the exact selected protocol and preserves frozen inputs", () => {
		const headers = Object.freeze([
			...validHeaders(),
			"Sec-WebSocket-Protocol",
			"\tChat ",
		]);
		const protocols = Object.freeze(["chat", "Chat"]);
		const original = [...headers];
		expect(validate(headers, protocols)).toBe("Chat");
		expect(headers).toEqual(original);
		expect(protocols).toEqual(["chat", "Chat"]);
	});

	it.each([undefined, 0, 100, 200, 301, 400, 500, Number.NaN, 101.5])(
		"rejects non-upgrade status %s",
		(status) => {
			expectCode(
				() =>
					validateWebSocketHandshake(
						status,
						validHeaders(),
						rfcKey,
						[],
						headerBudget,
					),
				"network-error",
			);
		},
	);

	it("requires each mandatory header", () => {
		for (let index = 0; index < 6; index += 2) {
			const headers = validHeaders();
			headers.splice(index, 2);
			expectCode(() => validate(headers), "network-error");
		}
	});

	it("rejects invalid upgrade and Connection values", () => {
		for (const value of [
			"",
			"websocket, h2c",
			"h2c",
			"websocket/13",
			"websocket\u00a0",
		]) {
			const headers = validHeaders();
			headers[3] = value;
			expectCode(() => validate(headers), "network-error");
		}
		for (const value of [
			"",
			", ,",
			"keep-alive",
			"notupgrade",
			'"Upgrade"',
			"Upgrade;close",
			"Upgrade, bad token",
		]) {
			const headers = validHeaders();
			headers[1] = value;
			expectCode(() => validate(headers), "network-error");
		}
		expectCode(
			() => validate([...validHeaders(), "UPGRADE", "websocket"]),
			"network-error",
		);
	});

	it("rejects incorrect, coalesced and duplicate accepts", () => {
		for (const accept of [
			"",
			"wrong",
			rfcAccept.toLowerCase(),
			`${rfcAccept}, ${rfcAccept}`,
			rfcAccept.slice(0, -1),
		]) {
			const headers = validHeaders();
			headers[5] = accept;
			expectCode(() => validate(headers), "network-error");
		}
		for (const accept of [rfcAccept, "", "wrong"]) {
			expectCode(
				() => validate([...validHeaders(), "SEC-WEBSOCKET-ACCEPT", accept]),
				"network-error",
			);
		}
	});

	it("rejects unsolicited, case-mismatched, invalid and duplicate protocols", () => {
		for (const selected of [
			"",
			"Chat",
			"other",
			"chat, other",
			'"chat"',
			"chat other",
		]) {
			expectCode(
				() =>
					validate(
						[...validHeaders(), "Sec-WebSocket-Protocol", selected],
						["chat", "other-valid"],
					),
				"network-error",
			);
		}
		const selectedHeaders = [
			...validHeaders(),
			"Sec-WebSocket-Protocol",
			"chat",
		];
		expectCode(() => validate(selectedHeaders), "network-error");
		for (const selected of ["chat", "other"]) {
			expectCode(
				() =>
					validate(
						[...selectedHeaders, "SEC-WEBSOCKET-PROTOCOL", selected],
						["chat", "other"],
					),
				"network-error",
			);
		}
	});

	it.each(["", "permessage-deflate", "unknown; parameter=value"])(
		"rejects any extension response %j",
		(extension) => {
			expectCode(
				() =>
					validate([...validHeaders(), "sEc-WeBsOcKeT-eXtEnSiOnS", extension]),
				"network-error",
			);
		},
	);

	it("rejects malformed raw arrays and fields without mutating inputs", () => {
		for (const headers of [
			null,
			{},
			"Connection: Upgrade",
			[...validHeaders(), "odd"],
			[...validHeaders(), "X-Test", 1],
			new Array(2),
		]) {
			expectCode(() => validate(headers as readonly string[]), "network-error");
		}
		for (const name of [
			"",
			"X Test",
			"X:Test",
			"X-Test\n",
			"X-Test\r",
			"é",
			" X-Test",
			"X-Test\t",
		]) {
			expectCode(
				() => validate([...validHeaders(), name, "value"]),
				"network-error",
			);
		}
		for (const value of [
			"ok\r\nInjected: yes",
			"ok\n",
			"ok\r",
			"\u0000",
			"\u007f",
			"\u000b",
			"\u0100",
		]) {
			const headers = Object.freeze([...validHeaders(), "X-Test", value]);
			const original = [...headers];
			expectCode(() => validate(headers), "network-error");
			expect(headers).toEqual(original);
		}
	});

	it("validates protocol options even when the server selects none", () => {
		for (const protocols of [null, "chat", ["chat", "chat"], ["chat\n"]]) {
			expectCode(
				() => validate(validHeaders(), protocols as readonly string[]),
				"invalid-input",
			);
		}
	});

	it("rejects invalid caller header bounds", () => {
		for (const bound of [
			undefined,
			null,
			"4096",
			0,
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			expectCode(
				() =>
					validateWebSocketHandshake(
						101,
						validHeaders(),
						rfcKey,
						[],
						bound as number,
					),
				"invalid-input",
			);
		}
	});

	it("counts UTF-8 bytes, field separators and the final CRLF at exact bounds", () => {
		for (const headers of [
			validHeaders(),
			[...validHeaders(), "X-Text", "é\tÿ"],
		]) {
			const bytes = headerBytes(headers);
			expect(validateWebSocketHandshake(101, headers, rfcKey, [], bytes)).toBe(
				"",
			);
			expectCode(
				() => validateWebSocketHandshake(101, headers, rfcKey, [], bytes - 1),
				"resource-limit",
			);
		}
		expectCode(
			() => validateWebSocketHandshake(101, [], rfcKey, [], 1),
			"resource-limit",
		);
		expectCode(
			() => validateWebSocketHandshake(101, [], rfcKey, [], 2),
			"network-error",
		);
	});

	it("bounds header count and large fields before inspecting later entries", () => {
		let accessed = false;
		const oversizedCount = new Array<string>(100_000);
		Object.defineProperty(oversizedCount, "0", {
			get: () => {
				accessed = true;
				return "X-Test";
			},
		});
		expectCode(() => validate(oversizedCount), "resource-limit");
		expect(accessed).toBe(false);
		const oversizedField = [
			"X-Test",
			"é".repeat(headerBudget),
			"X-Later",
			"value",
		];
		Object.defineProperty(oversizedField, "2", {
			get: () => {
				accessed = true;
				return "X-Later";
			},
		});
		expectCode(() => validate(oversizedField), "resource-limit");
		expect(accessed).toBe(false);
		expectCode(() => validate(["X-Test", "é".repeat(3000)]), "resource-limit");
	});
});
