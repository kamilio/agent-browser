import { afterEach, describe, expect, it, vi } from "vitest";
import * as ctapCbor from "./ctap-cbor.js";
import {
	decodeCtapGetInfoResponse,
	encodeCtapGetInfoRequest,
	queryCtapGetInfo,
} from "./ctap-get-info.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	FidoHidCborConnection,
	type FidoHidReportTransport,
} from "./fido-hid-connection.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";

const aaguid = [
	0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c,
	0x1d, 0x1e, 0x1f,
];
const requiredFields = [0x01, 0x80, 0x03, 0x50, ...aaguid];
const channel = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
const connections: FidoHidCborConnection[] = [];
const releaseClosures: Array<() => void> = [];

function response(...bytes: number[]): Uint8Array {
	return new Uint8Array(bytes);
}

function info(input: Uint8Array) {
	const result = decodeCtapGetInfoResponse(input);
	expect(result.kind).toBe("info");
	if (result.kind !== "info") throw new Error("Expected GetInfo success.");
	return result.info;
}

function invalid(input: Uint8Array, code: ErrorCode = "invalid-input") {
	let caught: unknown;
	try {
		decodeCtapGetInfoResponse(input);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ name: "AgentBrowserError", code });
	expect((caught as Error).message).not.toMatch(/private|driver|secret/i);
	return caught;
}

class FakeTransport implements FidoHidReportTransport {
	readonly writes: Uint8Array[] = [];
	readonly incoming: Uint8Array[] = [];
	closeCalls = 0;
	onClose?: () => Promise<void>;

	async write(report: Uint8Array): Promise<number> {
		this.writes.push(new Uint8Array(report));
		return report.length;
	}

	async read(): Promise<Uint8Array> {
		const report = this.incoming.shift();
		if (!report) throw new Error("No synthetic report available.");
		return report;
	}

	async close(): Promise<void> {
		this.closeCalls++;
		await this.onClose?.();
	}
}

function createConnection(payload: Uint8Array, command = 0x10) {
	const transport = new FakeTransport();
	transport.incoming.push(...encodeFidoHidMessage(channel, command, payload));
	const connection = new FidoHidCborConnection(channel, transport);
	connections.push(connection);
	return { connection, transport };
}

afterEach(async () => {
	for (const release of releaseClosures) release();
	for (const connection of connections)
		await connection.close().catch(() => undefined);
	releaseClosures.length = 0;
	connections.length = 0;
	vi.restoreAllMocks();
});

describe("GetInfo request and status", () => {
	it("returns a fresh no-parameter request on every call", () => {
		const first = encodeCtapGetInfoRequest();
		const second = encodeCtapGetInfoRequest();
		expect(first).toEqual(response(0x04));
		expect(second).toEqual(response(0x04));
		expect(first.buffer).not.toBe(second.buffer);
		first.fill(0xff);
		expect(second).toEqual(response(0x04));
	});

	it.each([0x01, 0x2e, 0x7f, 0xee, 0xff])(
		"preserves nonzero CTAP status %i with no body or an optional map",
		(status) => {
			for (const body of [[], [0xa0], [0xa1, 0x01, 0xf6]])
				expect(decodeCtapGetInfoResponse(response(status, ...body))).toEqual({
					kind: "ctap-error",
					status,
				});
		},
	);

	it.each([
		[0x80],
		[0xf6],
		[0xa1, 0x01],
		[0xa0, 0x00],
		[0xbf, 0xff],
		[0xa2, 0x01, 0x00, 0x01, 0x01],
	])("validates optional error-body CBOR %j", (...body) => {
		invalid(response(0xee, ...body));
	});

	it("rejects an absent status and success without a map", () => {
		for (const bytes of [[], [0], [0, 0xa0], [0, 0x80]])
			invalid(response(...bytes));
	});
});

describe("GetInfo fields", () => {
	it("preserves empty versions, absent fields and option defaults", () => {
		const decoded = info(response(0, 0xa2, ...requiredFields));
		expect(decoded).toEqual({
			versions: [],
			aaguid: response(...aaguid),
			options: {
				platform: false,
				residentKey: false,
				userPresence: true,
				clientPin: "unsupported",
				userVerification: "unsupported",
			},
		});
		for (const field of ["extensions", "maxMessageSize", "pinProtocols"])
			expect(Object.hasOwn(decoded, field)).toBe(false);
	});

	it("preserves unknown versions, order, duplicates and exact Unicode", () => {
		const decoded = info(
			response(
				0,
				0xa3,
				0x01,
				0x84,
				0x68,
				0x46,
				0x49,
				0x44,
				0x4f,
				0x5f,
				0x32,
				0x5f,
				0x30,
				0x63,
				0x6e,
				0x65,
				0x77,
				0x63,
				0x65,
				0xcc,
				0x81,
				0x63,
				0x6e,
				0x65,
				0x77,
				0x02,
				0x83,
				0x60,
				0x63,
				0xef,
				0xbb,
				0xbf,
				0x62,
				0xc3,
				0xa9,
				0x03,
				0x50,
				...aaguid,
			),
		);
		expect(decoded.versions).toEqual(["FIDO_2_0", "new", "e\u0301", "new"]);
		expect(decoded.extensions).toEqual(["", "\ufeff", "é"]);
	});

	it("preserves present-empty optional arrays and options", () => {
		const decoded = info(
			response(
				0,
				0xa5,
				0x01,
				0x80,
				0x02,
				0x80,
				0x03,
				0x50,
				...aaguid,
				0x04,
				0xa0,
				0x06,
				0x80,
			),
		);
		expect(decoded.extensions).toEqual([]);
		expect(decoded.pinProtocols).toEqual([]);
		expect(decoded.options).toEqual(
			info(response(0, 0xa2, ...requiredFields)).options,
		);
	});

	it.each([
		{ encoded: [0x00], expected: 0n },
		{ encoded: [0x1a, 0xff, 0xff, 0xff, 0xff], expected: 4294967295n },
		{
			encoded: [0x1b, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01],
			expected: 9007199254740993n,
		},
		{
			encoded: [0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
			expected: 18446744073709551615n,
		},
	])(
		"preserves full unsigned field value $expected",
		({ encoded, expected }) => {
			const decoded = info(
				response(
					0,
					0xa4,
					...requiredFields,
					0x05,
					...encoded,
					0x06,
					0x83,
					...encoded,
					0x00,
					...encoded,
				),
			);
			expect(decoded.maxMessageSize).toBe(expected);
			expect(decoded.pinProtocols).toEqual([expected, 0n, expected]);
		},
	);

	it("recognizes all six fields through equivalent integral float keys", () => {
		const decoded = info(
			response(
				0,
				0xa6,
				0xf9,
				0x3c,
				0x00,
				0x80,
				0xf9,
				0x40,
				0x00,
				0x80,
				0xf9,
				0x42,
				0x00,
				0x50,
				...aaguid,
				0xf9,
				0x44,
				0x00,
				0xa1,
				0x62,
				0x75,
				0x70,
				0xf4,
				0xf9,
				0x45,
				0x00,
				0x00,
				0xf9,
				0x46,
				0x00,
				0x81,
				0x01,
			),
		);
		expect(decoded).toMatchObject({
			versions: [],
			extensions: [],
			aaguid: response(...aaguid),
			options: { userPresence: false },
			maxMessageSize: 0n,
			pinProtocols: [1n],
		});
	});

	it("does not mistake a text field key for a required numeric field", () => {
		invalid(response(0, 0xa2, 0x03, 0x50, ...aaguid, 0x61, 0x31, 0x80));
	});

	it("ignores unfamiliar root keys and typed values after complete validation", () => {
		const decoded = info(
			response(
				0,
				0xa8,
				...requiredFields,
				0x07,
				0xf8,
				0xff,
				0x08,
				0xf9,
				0x7c,
				0x00,
				0x20,
				0xa1,
				0x00,
				0x81,
				0xf6,
				0x41,
				0x01,
				0xf7,
				0x61,
				0x31,
				0xf4,
				0xf9,
				0x3e,
				0x00,
				0x41,
				0xaa,
			),
		);
		expect(decoded.versions).toEqual([]);
		expect(decoded.aaguid).toEqual(response(...aaguid));
	});

	it.each([
		[0xa1, 0x01, 0x80],
		[0xa1, 0x03, 0x50, ...aaguid],
		[0xa2, 0x01, 0x60, 0x03, 0x50, ...aaguid],
		[0xa2, 0x01, 0x81, 0x00, 0x03, 0x50, ...aaguid],
		[0xa2, 0x01, 0x80, 0x03, 0x4f, ...aaguid.slice(1)],
		[0xa2, 0x01, 0x80, 0x03, 0x51, ...aaguid, 0x00],
		[0xa2, 0x01, 0x80, 0x03, 0x70, ...aaguid],
		[0xa3, 0x01, 0x80, 0x02, 0x60, 0x03, 0x50, ...aaguid],
		[0xa3, 0x01, 0x80, 0x02, 0x81, 0xf6, 0x03, 0x50, ...aaguid],
		[0xa3, ...requiredFields, 0x04, 0x80],
		[0xa3, ...requiredFields, 0x06, 0x01],
	])("rejects missing or mistyped known fields %j", (...body) => {
		invalid(response(0, ...body));
	});

	it.each([[0x20], [0x61, 0x31], [0xf4], [0xf9, 0x3c, 0x00]])(
		"requires major-zero unsigned values rather than %j",
		(...encoded) => {
			invalid(response(0, 0xa3, ...requiredFields, 0x05, ...encoded));
			invalid(response(0, 0xa3, ...requiredFields, 0x06, 0x81, ...encoded));
		},
	);

	it("does not impose tiny version-list or string limits", () => {
		const manyVersions = info(
			response(
				0,
				0xa2,
				0x01,
				0x99,
				0x01,
				0x00,
				...Array<number>(256).fill(0x60),
				0x03,
				0x50,
				...aaguid,
			),
		);
		expect(manyVersions.versions).toHaveLength(256);
		const longVersion = info(
			response(
				0,
				0xa2,
				0x01,
				0x81,
				0x79,
				0x04,
				0x00,
				...Array<number>(1024).fill(0x78),
				0x03,
				0x50,
				...aaguid,
			),
		);
		expect(longVersion.versions).toEqual(["x".repeat(1024)]);
	});
});

describe("GetInfo options", () => {
	const optionKeys = [
		{
			name: "platform",
			key: [0x64, 0x70, 0x6c, 0x61, 0x74],
			capability: false,
		},
		{ name: "residentKey", key: [0x62, 0x72, 0x6b], capability: false },
		{ name: "userPresence", key: [0x62, 0x75, 0x70], capability: false },
		{
			name: "clientPin",
			key: [0x69, 0x63, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0x50, 0x69, 0x6e],
			capability: true,
		},
		{ name: "userVerification", key: [0x62, 0x75, 0x76], capability: true },
	] as const;

	it.each(optionKeys)(
		"decodes both booleans for $name",
		({ name, key, capability }) => {
			for (const enabled of [false, true]) {
				const decoded = info(
					response(
						0,
						0xa3,
						...requiredFields,
						0x04,
						0xa1,
						...key,
						enabled ? 0xf5 : 0xf4,
					),
				);
				expect(decoded.options[name]).toBe(
					capability ? (enabled ? "configured" : "unconfigured") : enabled,
				);
			}
		},
	);

	it.each(optionKeys)("rejects non-booleans for $name", ({ key }) => {
		for (const value of [
			[0x00],
			[0x01],
			[0xf6],
			[0xf7],
			[0xf0],
			[0xf9, 0x3c, 0x00],
		])
			invalid(
				response(0, 0xa3, ...requiredFields, 0x04, 0xa1, ...key, ...value),
			);
	});

	it("ignores unknown option names, key types and non-boolean values", () => {
		const decoded = info(
			response(
				0,
				0xa3,
				...requiredFields,
				0x04,
				0xa4,
				0x01,
				0xf6,
				0x62,
				0x55,
				0x50,
				0x81,
				0xf8,
				0x80,
				0x62,
				0x75,
				0x70,
				0xf4,
				0x63,
				0x6e,
				0x65,
				0x77,
				0xf9,
				0x7e,
				0x00,
			),
		);
		expect(decoded.options).toEqual({
			platform: false,
			residentKey: false,
			userPresence: false,
			clientPin: "unsupported",
			userVerification: "unsupported",
		});
	});
});

describe("GetInfo ownership and parser failures", () => {
	it("owns returned bytes and never modifies offset input or sibling results", () => {
		const original = response(0, 0xa2, ...requiredFields);
		const backing = response(0xff, ...original, 0xee);
		const supplied = backing.subarray(1, backing.length - 1);
		const first = info(supplied);
		const second = info(supplied);
		expect(backing).toEqual(response(0xff, ...original, 0xee));
		expect(first.aaguid.buffer).not.toBe(backing.buffer);
		expect(first.aaguid.buffer).not.toBe(second.aaguid.buffer);
		first.aaguid.fill(0);
		expect(second.aaguid).toEqual(response(...aaguid));
		expect(supplied).toEqual(original);
		supplied.fill(0xff);
		expect(second.aaguid).toEqual(response(...aaguid));
	});

	it.each([
		[0, 0xa2, ...requiredFields],
		[0xee],
		[0xee, 0xa0],
		[0, 0xa0],
		[0, 0xa1, 0x01],
	])("wipes owned response copies on every outcome %j", (...bytes) => {
		const copy = vi.spyOn(ctapCbor, "copyCtapBytes");
		const supplied = response(...bytes);
		try {
			decodeCtapGetInfoResponse(supplied);
		} catch (error) {
			expect(error).toBeInstanceOf(AgentBrowserError);
		}
		const copied = copy.mock.results[0];
		expect(copied.type).toBe("return");
		expect(copied.value).toEqual(new Uint8Array(supplied.length));
		expect(supplied).toEqual(response(...bytes));
	});

	it("propagates byte and depth resource limits, even in error bodies", () => {
		invalid(new Uint8Array(7610), "resource-limit");
		for (const status of [0, 0xee])
			invalid(
				response(
					status,
					0xa3,
					...requiredFields,
					0x07,
					0x81,
					0x81,
					0x81,
					0x81,
					0x00,
				),
				"resource-limit",
			);
	});

	it("accepts the byte cap including the status byte", () => {
		const supplied = response(
			0,
			0xa3,
			...requiredFields,
			0x07,
			0x59,
			0x1d,
			0x9f,
			...Array<number>(7583).fill(0),
		);
		expect(supplied).toHaveLength(7609);
		expect(info(supplied).aaguid).toEqual(response(...aaguid));
	});

	it("validates unknown field contents instead of skipping malformed values", () => {
		invalid(response(0, 0xa3, ...requiredFields, 0x07, 0x61, 0xff));
		invalid(response(0, 0xa3, ...requiredFields, 0x04, 0xa1, 0x00, 0xc0, 0x00));
	});
});

describe("GetInfo querying over a synthetic FIDO connection", () => {
	it("exchanges exactly one fresh command, forwards options and wipes payloads", async () => {
		const { connection, transport } = createConnection(
			response(0, 0xa2, ...requiredFields),
		);
		const exchange = vi.spyOn(connection, "exchange");
		const options = {
			timeoutMs: 1000,
			maxReports: 8,
			signal: new AbortController().signal,
		};
		const result = await queryCtapGetInfo(connection, options);
		expect(result).toMatchObject({
			kind: "info",
			info: { aaguid: response(...aaguid) },
		});
		expect(exchange).toHaveBeenCalledExactlyOnceWith(response(0x04), options);
		expect(transport.writes).toHaveLength(1);
		expect(transport.writes[0].subarray(0, 8)).toEqual(
			response(...channel, 0x90, 0, 1, 4),
		);
		const consumed = await exchange.mock.results[0].value;
		expect(consumed.payload).toEqual(new Uint8Array(2 + requiredFields.length));
		expect(connection.state).toBe("idle");
		expect(transport.closeCalls).toBe(0);
		transport.incoming.push(
			...encodeFidoHidMessage(channel, 0x10, response(0xee)),
		);
		expect(await queryCtapGetInfo(connection)).toEqual({
			kind: "ctap-error",
			status: 0xee,
		});
		expect(exchange).toHaveBeenCalledTimes(2);
		expect(exchange.mock.calls[0][0]).not.toBe(exchange.mock.calls[1][0]);
		expect(exchange.mock.calls[1]).toEqual([response(0x04), undefined]);
		const consumedError = await exchange.mock.results[1].value;
		expect(consumedError.payload).toEqual(response(0));
		expect(connection.state).toBe("idle");
		expect(transport.closeCalls).toBe(0);
	});

	it.each([
		{ code: 0x01, label: "ERR_INVALID_CMD" },
		{ code: 0xee, label: "unknown" },
	])(
		"keeps HID error $code distinct from the same CTAP status",
		async ({ code, label }) => {
			const hid = createConnection(response(code), 0x3f);
			const ctap = createConnection(response(code, 0xa0));
			expect(await queryCtapGetInfo(hid.connection)).toEqual({
				kind: "hid-error",
				code,
				error: label,
			});
			expect(await queryCtapGetInfo(ctap.connection)).toEqual({
				kind: "ctap-error",
				status: code,
			});
			expect(hid.connection.state).toBe("idle");
			expect(ctap.connection.state).toBe("idle");
			expect(hid.transport.closeCalls).toBe(0);
			expect(ctap.transport.closeCalls).toBe(0);
			expect(hid.transport.writes).toHaveLength(1);
			expect(ctap.transport.writes).toHaveLength(1);
		},
	);

	it.each([
		{ bytes: [0, 0xa0], code: "invalid-input" },
		{ bytes: [0, 0xa1, 0x01], code: "invalid-input" },
		{ bytes: [0xee, 0x80], code: "invalid-input" },
		{
			bytes: [0, 0xa3, ...requiredFields, 0x07, 0x81, 0x81, 0x81, 0x81, 0],
			code: "resource-limit",
		},
	])(
		"quarantines malformed response $bytes without retrying",
		async ({ bytes, code }) => {
			const { connection, transport } = createConnection(response(...bytes));
			const exchange = vi.spyOn(connection, "exchange");
			const close = vi.spyOn(connection, "close");
			await expect(queryCtapGetInfo(connection)).rejects.toMatchObject({
				name: "AgentBrowserError",
				code,
			});
			expect(close).toHaveBeenCalledTimes(1);
			expect(exchange).toHaveBeenCalledTimes(1);
			const consumed = await exchange.mock.results[0].value;
			expect(consumed.payload).toEqual(new Uint8Array(bytes.length));
			await expect(queryCtapGetInfo(connection)).rejects.toMatchObject({
				code: "closed",
			});
			expect(close).toHaveBeenCalledTimes(1);
			expect(transport.writes).toHaveLength(1);
			expect(transport.closeCalls).toBe(1);
		},
	);

	it("rejects promptly while quarantine close remains pending", async () => {
		const { connection, transport } = createConnection(response(0, 0xa0));
		transport.onClose = () =>
			new Promise<void>((resolve) => releaseClosures.push(resolve));
		const close = vi.spyOn(connection, "close");
		await expect(queryCtapGetInfo(connection)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(connection.state).toBe("closing");
		expect(close).toHaveBeenCalledTimes(1);
		expect(transport.closeCalls).toBe(1);
		await expect(queryCtapGetInfo(connection)).rejects.toMatchObject({
			code: "closed",
		});
		expect(transport.writes).toHaveLength(1);
	});

	it("absorbs close rejection without replacing the decode error", async () => {
		const { connection, transport } = createConnection(response(0, 0xa0));
		transport.onClose = async () => {
			throw new Error("private driver secret");
		};
		const close = vi.spyOn(connection, "close");
		await expect(queryCtapGetInfo(connection)).rejects.toMatchObject({
			code: "invalid-input",
			message: "Invalid CTAP GetInfo response.",
		});
		expect(close).toHaveBeenCalledTimes(1);
		await expect(close.mock.results[0].value).rejects.toMatchObject({
			code: "unsupported",
		});
		expect(connection.state).toBe("close-failed");
		expect(transport.closeCalls).toBe(1);
	});

	it("propagates connection errors unchanged without extra quarantine", async () => {
		const { connection, transport } = createConnection(
			response(0, 0xa2, ...requiredFields),
		);
		const controller = new AbortController();
		controller.abort();
		const exchange = vi.spyOn(connection, "exchange");
		const close = vi.spyOn(connection, "close");
		const queried = queryCtapGetInfo(connection, { signal: controller.signal });
		const original = await exchange.mock.results[0].value.catch(
			(error: unknown) => error,
		);
		expect(original).toBeInstanceOf(AgentBrowserError);
		await expect(queried).rejects.toBe(original);
		expect(original).toMatchObject({ code: "aborted" });
		expect(close).not.toHaveBeenCalled();
		expect(transport.writes).toHaveLength(0);
		expect(connection.state).toBe("idle");
	});
});
