import { expect, it, vi } from "vitest";
import { queryCtapGetInfo } from "./ctap-get-info.js";
import { FidoHidCborConnection } from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";
import {
	type NodeHidrawHandle,
	NodeHidrawTransport,
} from "./node-hidraw-transport.js";

const channel = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
const aaguid = new Uint8Array([
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
]);
const infoResponse = new Uint8Array([
	0,
	0xa6,
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
	2,
	0x81,
	0x6b,
	0x68,
	0x6d,
	0x61,
	0x63,
	0x2d,
	0x73,
	0x65,
	0x63,
	0x72,
	0x65,
	0x74,
	3,
	0x50,
	...aaguid,
	4,
	0xa3,
	0x62,
	0x72,
	0x6b,
	0xf5,
	0x62,
	0x75,
	0x70,
	0xf4,
	0x69,
	0x63,
	0x6c,
	0x69,
	0x65,
	0x6e,
	0x74,
	0x50,
	0x69,
	0x6e,
	0xf4,
	5,
	0x19,
	4,
	0,
	6,
	0x82,
	1,
	2,
]);

function deferred() {
	let resolve = (): void => {
		throw new Error("Uninitialized synthetic completion");
	};
	const promise = new Promise<void>((fulfill) => {
		resolve = fulfill;
	});
	return { promise, resolve };
}

it.each([
	{
		inputReportBytes: 64,
		outputReportBytes: 64,
		inputReportId: 0,
		outputReportId: 0,
	},
	{
		inputReportBytes: 7,
		outputReportBytes: 64,
		inputReportId: 3,
		outputReportId: 9,
	},
	{
		inputReportBytes: 64,
		outputReportBytes: 7,
		inputReportId: 5,
		outputReportId: 11,
	},
])(
	"queries GetInfo over owned $inputReportBytes/$outputReportBytes-byte hidraw reports",
	async (options) => {
		expect(infoResponse.length).toBe(74);
		const incoming = [
			...encodeFidoHidMessage(
				channel,
				0x3b,
				new Uint8Array([2]),
				options.inputReportBytes,
			),
			...encodeFidoHidMessage(
				channel,
				0x10,
				infoResponse,
				options.inputReportBytes,
			),
		];
		const writes: Uint8Array[] = [];
		const scratch: Uint8Array[] = [];
		let reads = 0;
		const handle: NodeHidrawHandle = {
			async read(buffer, offset, length, position) {
				expect(offset).toBe(0);
				expect(position).toBeNull();
				expect(length).toBe(
					options.inputReportBytes + (options.inputReportId === 0 ? 1 : 2),
				);
				const packet = incoming[reads++];
				if (!packet) throw new Error("Unexpected synthetic read");
				const wire =
					options.inputReportId === 0
						? packet
						: new Uint8Array([options.inputReportId, ...packet]);
				buffer.fill(0xa5);
				buffer.set(wire);
				scratch.push(buffer);
				return { bytesRead: wire.length };
			},
			async write(buffer, offset, length, position) {
				expect(offset).toBe(0);
				expect(position).toBeNull();
				expect(length).toBe(options.outputReportBytes + 1);
				expect(buffer[0]).toBe(options.outputReportId);
				writes.push(buffer.slice());
				scratch.push(buffer);
				return { bytesWritten: length };
			},
			close: vi.fn(async () => {}),
		};
		const transport = new NodeHidrawTransport(handle, options);
		const connection = new FidoHidCborConnection(channel, transport, options);
		try {
			const result = await queryCtapGetInfo(connection);
			expect(result).toEqual({
				kind: "info",
				info: {
					versions: ["FIDO_2_0"],
					extensions: ["hmac-secret"],
					aaguid,
					options: {
						platform: false,
						residentKey: true,
						userPresence: false,
						clientPin: "unconfigured",
						userVerification: "unsupported",
					},
					maxMessageSize: 1024n,
					pinProtocols: [1n, 2n],
				},
			});
			expect(connection.state).toBe("idle");
			expect(transport.state).toBe("open");
			expect(reads).toBe(options.inputReportBytes === 7 ? 40 : 3);
			expect(writes).toHaveLength(options.outputReportBytes === 7 ? 2 : 1);
			expect(writes[0].slice(1, 8)).toEqual(
				new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x90, 0, 1]),
			);
			const assembler = new FidoHidMessageAssembler(
				channel,
				options.outputReportBytes,
			);
			const assembled = writes.map((wire) => assembler.accept(wire.slice(1)));
			expect(assembled[assembled.length - 1]).toMatchObject({
				command: 0x10,
				payload: new Uint8Array([4]),
			});
			for (const buffer of scratch)
				expect(buffer.every((value) => value === 0)).toBe(true);
			if (result.kind !== "info") throw new Error("Expected synthetic info");
			result.info.aaguid.fill(0xff);
			expect(aaguid[0]).toBe(0);
			expect(infoResponse.slice(29, 45)).toEqual(aaguid);
		} finally {
			await connection.close();
		}
		expect(handle.close).toHaveBeenCalledTimes(1);
		expect(transport.state).toBe("closed");
	},
);

it.each([
	{
		command: 0x3f,
		payload: new Uint8Array([6]),
		expected: { kind: "hid-error", code: 6, error: "ERR_CHANNEL_BUSY" },
	},
	{
		command: 0x10,
		payload: new Uint8Array([0xfe, 0xa0]),
		expected: { kind: "ctap-error", status: 0xfe },
	},
])(
	"distinguishes a $command reply without retry or automatic provider activation",
	async ({ command, payload, expected }) => {
		const packets = encodeFidoHidMessage(channel, command, payload, 64);
		let reads = 0;
		const handle: NodeHidrawHandle = {
			async read(buffer) {
				buffer.set(packets[reads++]);
				return { bytesRead: 64 };
			},
			write: vi.fn(async (_buffer, _offset, length) => ({
				bytesWritten: length,
			})),
			close: vi.fn(async () => {}),
		};
		const transport = new NodeHidrawTransport(handle, {
			inputReportBytes: 64,
			outputReportBytes: 64,
		});
		const connection = new FidoHidCborConnection(channel, transport);
		try {
			expect(await queryCtapGetInfo(connection)).toEqual(expected);
			expect(reads).toBe(1);
			expect(handle.write).toHaveBeenCalledTimes(1);
			expect(handle.close).not.toHaveBeenCalled();
			expect(connection.state).toBe("idle");
		} finally {
			await connection.close();
		}
	},
);

it("quarantines a malformed GetInfo map without waiting for physical close", async () => {
	const closeStarted = deferred();
	const closeReleased = deferred();
	const malformed = new Uint8Array([
		0,
		0xa2,
		1,
		0x80,
		3,
		0x4f,
		...new Uint8Array(15),
	]);
	const packets = encodeFidoHidMessage(channel, 0x10, malformed, 64);
	let reads = 0;
	const handle: NodeHidrawHandle = {
		async read(buffer) {
			buffer.set(packets[reads++]);
			return { bytesRead: 64 };
		},
		write: vi.fn(async (_buffer, _offset, length) => ({
			bytesWritten: length,
		})),
		close: vi.fn(() => {
			closeStarted.resolve();
			return closeReleased.promise;
		}),
	};
	const transport = new NodeHidrawTransport(handle, {
		inputReportBytes: 64,
		outputReportBytes: 64,
	});
	const connection = new FidoHidCborConnection(channel, transport);
	try {
		await expect(queryCtapGetInfo(connection)).rejects.toMatchObject({
			code: "invalid-input",
		});
		await closeStarted.promise;
		expect(connection.state).toBe("closing");
		expect(transport.state).toBe("closing");
		expect(handle.close).toHaveBeenCalledTimes(1);
		expect(handle.write).toHaveBeenCalledTimes(1);
		await expect(queryCtapGetInfo(connection)).rejects.toMatchObject({
			code: "closed",
		});
		expect(handle.write).toHaveBeenCalledTimes(1);
	} finally {
		closeReleased.resolve();
		await connection.close();
	}
	expect(transport.state).toBe("closed");
});
