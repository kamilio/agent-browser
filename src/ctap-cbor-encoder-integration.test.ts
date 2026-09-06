import { expect, it, vi } from "vitest";
import { encodeCtapCbor } from "./ctap-cbor-encoder.js";
import { type CtapCborValue, decodeCtapCbor } from "./ctap-cbor.js";
import {
	decodeCtapGetInfoResponse,
	queryCtapGetInfo,
} from "./ctap-get-info.js";
import { FidoHidCborConnection } from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";

const channel = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
const identity = new Uint8Array([
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
]);
const expectedInfo = new Uint8Array([
	0xa3,
	1,
	0x81,
	0x68,
	0x46,
	0x49,
	0x44,
	0x4f,
	0x5f,
	0x32,
	0x5f,
	0x30,
	3,
	0x50,
	...identity,
	4,
	0xa2,
	0x62,
	0x72,
	0x6b,
	0xf5,
	0x62,
	0x75,
	0x70,
	0xf4,
]);

function infoTree(aaguid: Uint8Array): CtapCborValue {
	return {
		kind: "map",
		entries: [
			[
				{ kind: "unsigned", value: 4n },
				{
					kind: "map",
					entries: [
						[
							{ kind: "text", value: "up" },
							{ kind: "simple", value: 20 },
						],
						[
							{ kind: "text", value: "rk" },
							{ kind: "simple", value: 21 },
						],
					],
				},
			],
			[
				{ kind: "unsigned", value: 3n },
				{ kind: "bytes", value: aaguid },
			],
			[
				{ kind: "unsigned", value: 1n },
				{ kind: "array", items: [{ kind: "text", value: "FIDO_2_0" }] },
			],
		],
	};
}

it.each([
	{ inputReportBytes: 64, outputReportBytes: 64 },
	{ inputReportBytes: 7, outputReportBytes: 64 },
	{ inputReportBytes: 64, outputReportBytes: 7 },
])(
	"composes canonical capability bytes with owned HID and GetInfo %#",
	async ({ inputReportBytes, outputReportBytes }) => {
		const aaguid = identity.slice();
		const tree = infoTree(aaguid);
		const encoded = encodeCtapCbor(tree);
		expect(encoded).toEqual(expectedInfo);
		aaguid.fill(255);
		expect(encoded).toEqual(expectedInfo);
		const response = new Uint8Array([0, ...encoded]);
		const incoming = [
			...encodeFidoHidMessage(channel, 0x10, response, inputReportBytes),
		];
		const writes: Uint8Array[] = [];
		const read = vi.fn(async () => {
			const report = incoming.shift();
			if (!report) throw new Error("Synthetic response exhausted");
			return report;
		});
		const close = vi.fn(async () => undefined);
		const connection = new FidoHidCborConnection(
			channel,
			{
				read,
				async write(report) {
					writes.push(report.slice());
					return report.length;
				},
				close,
			},
			{ inputReportBytes, outputReportBytes },
		);
		try {
			const result = await queryCtapGetInfo(connection);
			if (result.kind !== "info")
				throw new Error("Expected synthetic capabilities");
			expect(result.info).toEqual({
				versions: ["FIDO_2_0"],
				aaguid: identity,
				options: {
					platform: false,
					residentKey: true,
					userPresence: false,
					clientPin: "unsupported",
					userVerification: "unsupported",
				},
			});
			result.info.aaguid.fill(0xff);
			expect(encoded).toEqual(expectedInfo);
			expect(response).toEqual(new Uint8Array([0, ...expectedInfo]));
			expect(read).toHaveBeenCalledTimes(inputReportBytes === 7 ? 22 : 1);
			expect(writes).toHaveLength(outputReportBytes === 7 ? 2 : 1);
			const assembler = new FidoHidMessageAssembler(channel, outputReportBytes);
			let request: ReturnType<FidoHidMessageAssembler["accept"]>;
			for (const report of writes) request = assembler.accept(report);
			expect(request).toMatchObject({
				command: 0x10,
				payload: new Uint8Array([4]),
			});
			expect(close).not.toHaveBeenCalled();
			expect(connection.state).toBe("idle");
		} finally {
			await connection.close();
		}
		expect(close).toHaveBeenCalledTimes(1);
	},
);

it.each([
	{ outputReportBytes: 64, byteCount: 7606, encodedLength: 7609 },
	{ outputReportBytes: 7, byteCount: 254, encodedLength: 256 },
])(
	"does not confuse standalone CBOR size with command/report budgets %#",
	async ({ outputReportBytes, byteCount, encodedLength }) => {
		const encoded = encodeCtapCbor({
			kind: "bytes",
			value: new Uint8Array(byteCount),
		});
		expect(encoded).toHaveLength(encodedLength);
		const request = new Uint8Array([2, ...encoded]);
		const read = vi.fn(async () => {
			throw new Error("Unexpected synthetic read");
		});
		const write = vi.fn(async (report: Uint8Array) => report.length);
		const close = vi.fn(async () => undefined);
		const connection = new FidoHidCborConnection(
			channel,
			{ read, write, close },
			{ outputReportBytes },
		);
		try {
			await expect(connection.exchange(request)).rejects.toMatchObject({
				code: "resource-limit",
			});
			expect(connection.state).toBe("idle");
			expect(read).not.toHaveBeenCalled();
			expect(write).not.toHaveBeenCalled();
			expect(close).not.toHaveBeenCalled();
			expect(request.subarray(1)).toEqual(encoded);
		} finally {
			await connection.close();
		}
	},
);

it("retains exact canonical wire identity through decoder and encoder", () => {
	const wire = new Uint8Array([
		0xa3, 0x1b, 0, 0x20, 0, 0, 0, 0, 0, 1, 0x82, 0x40, 0x63, 0xef, 0xbb, 0xbf,
		0xf9, 0x7e, 0, 0xf8, 32, 0xfa, 0x7f, 0xc0, 0, 1, 0xfb, 0x80, 0, 0, 0, 0, 0,
		0, 0,
	]);
	const decoded = decodeCtapCbor(wire);
	const encoded = encodeCtapCbor(decoded);
	expect(encoded).toEqual(wire);
	expect(decodeCtapCbor(encoded)).toEqual(decoded);
	encoded.fill(0);
	expect(encodeCtapCbor(decoded)).toEqual(wire);
});

it("does not mistake a valid generic map for valid GetInfo semantics", () => {
	const encoded = encodeCtapCbor({
		kind: "map",
		entries: [
			[
				{ kind: "unsigned", value: 3n },
				{ kind: "bytes", value: identity },
			],
			[
				{ kind: "unsigned", value: 1n },
				{ kind: "text", value: "FIDO_2_0" },
			],
		],
	});
	expect(decodeCtapCbor(encoded).kind).toBe("map");
	expect(() =>
		decodeCtapGetInfoResponse(new Uint8Array([0, ...encoded])),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});
