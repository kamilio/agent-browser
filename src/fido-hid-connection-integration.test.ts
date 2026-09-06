import { expect, it } from "vitest";
import {
	decodeFidoHidAllocationResponse,
	encodeFidoHidAllocationRequest,
} from "./fido-hid-allocation.js";
import {
	FidoHidCborConnection,
	type FidoHidReportTransport,
} from "./fido-hid-connection.js";
import { discoverFidoHidReportLayouts } from "./fido-hid-descriptor.js";
import {
	type FidoHidMessage,
	FidoHidMessageAssembler,
} from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";
import {
	decodeLinuxHidrawInputReport,
	encodeLinuxHidrawOutputReport,
} from "./linux-hidraw-reports.js";

it.each([
	{ inputBytes: 64, outputBytes: 64, inputId: 0, outputId: 0 },
	{ inputBytes: 7, outputBytes: 64, inputId: 3, outputId: 9 },
	{ inputBytes: 64, outputBytes: 7, inputId: 5, outputId: 11 },
])(
	"joins allocation and owned exchange with $inputBytes/$outputBytes-byte reports",
	async ({ inputBytes, outputBytes, inputId, outputId }) => {
		const descriptor = new Uint8Array([
			0x06,
			0xd0,
			0xf1,
			0x09,
			1,
			0xa1,
			1,
			0x15,
			0,
			0x26,
			0xff,
			0,
			0x75,
			8,
			...(inputId === 0 ? [] : [0x85, inputId]),
			0x95,
			inputBytes,
			0x09,
			0x37,
			0x81,
			2,
			...(outputId === 0 ? [] : [0x85, outputId]),
			0x95,
			outputBytes,
			0x09,
			0x91,
			0x91,
			2,
			0xc0,
		]);
		const layouts = discoverFidoHidReportLayouts(descriptor);
		expect(layouts).toEqual([
			{
				collectionOffset: 5,
				input: { reportId: inputId, reportBytes: inputBytes },
				output: { reportId: outputId, reportBytes: outputBytes },
			},
		]);
		const layout = layouts[0];
		const broadcast = new Uint8Array([255, 255, 255, 255]);
		const channel = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
		const nonce = new Uint8Array([1, 3, 5, 7, 9, 11, 13, 15]);
		const initAssembler = new FidoHidMessageAssembler(broadcast, outputBytes);
		let initMessage: FidoHidMessage | undefined;
		for (const packet of encodeFidoHidAllocationRequest(nonce, outputBytes)) {
			const wire = encodeLinuxHidrawOutputReport(
				packet,
				layout.output.reportBytes,
				layout.output.reportId,
			);
			expect(wire.length).toBe(outputBytes + 1);
			expect(wire[0]).toBe(outputId);
			initMessage = initAssembler.accept(wire.slice(1));
		}
		expect(initMessage).toMatchObject({
			command: 6,
			payload: nonce,
			channel: broadcast,
		});
		const inputWire = (packet: Uint8Array) =>
			inputId === 0 ? packet.slice() : new Uint8Array([inputId, ...packet]);
		const allocationAssembler = new FidoHidMessageAssembler(
			broadcast,
			inputBytes,
		);
		let allocationMessage: FidoHidMessage | undefined;
		for (const packet of encodeFidoHidMessage(
			broadcast,
			6,
			new Uint8Array([...nonce, ...channel, 2, 1, 0, 0, 4]),
			inputBytes,
		))
			allocationMessage = allocationAssembler.accept(
				decodeLinuxHidrawInputReport(inputWire(packet), inputBytes, inputId),
			);
		if (!allocationMessage)
			throw new Error("Expected complete synthetic allocation");
		const allocation = decodeFidoHidAllocationResponse(
			allocationMessage.channel,
			allocationMessage.command,
			allocationMessage.payload,
			nonce,
		);
		expect(allocation).toMatchObject({ channel, cbor: true });
		if (!allocation) throw new Error("Expected matching synthetic nonce");
		const reply = new Uint8Array([0, 0xa1, 1, 0xf5]);
		const incoming = [
			...encodeFidoHidMessage(channel, 0x3b, new Uint8Array([1]), inputBytes),
			...encodeFidoHidMessage(channel, 0x3b, new Uint8Array([2]), inputBytes),
			...encodeFidoHidMessage(channel, 0x10, reply, inputBytes),
		].map(inputWire);
		const writes: Uint8Array[] = [];
		const statuses: number[] = [];
		let reads = 0;
		let closes = 0;
		let connection: FidoHidCborConnection;
		const transport: FidoHidReportTransport = {
			async write(packet) {
				const wire = encodeLinuxHidrawOutputReport(
					packet,
					layout.output.reportBytes,
					layout.output.reportId,
				);
				writes.push(wire);
				return wire.length - 1;
			},
			async read() {
				const progress = connection.keepalive;
				if (progress) statuses.push(progress.code);
				const wire = incoming[reads++];
				if (!wire) throw new Error("Unexpected synthetic read");
				return decodeLinuxHidrawInputReport(
					wire,
					layout.input.reportBytes,
					layout.input.reportId,
				);
			},
			async close() {
				closes++;
			},
		};
		connection = new FidoHidCborConnection(allocation.channel, transport, {
			inputReportBytes: inputBytes,
			outputReportBytes: outputBytes,
		});
		allocation.channel.fill(0);
		try {
			const request = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
			const result = await connection.exchange(request);
			expect(result).toEqual({ kind: "response", payload: reply });
			expect(connection.state).toBe("idle");
			expect(connection.keepalive).toBeUndefined();
			expect(statuses).toContain(1);
			expect(statuses).toContain(2);
			expect(reads).toBe(inputBytes === 7 ? 7 : 3);
			expect(writes).toHaveLength(outputBytes === 7 ? 6 : 1);
			expect(writes[0].slice(1, 8)).toEqual(
				new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x90, 0, 9]),
			);
			const requestAssembler = new FidoHidMessageAssembler(
				channel,
				outputBytes,
			);
			let sent: FidoHidMessage | undefined;
			for (const wire of writes) {
				expect(wire[0]).toBe(outputId);
				expect(wire.length).toBe(outputBytes + 1);
				sent = requestAssembler.accept(wire.slice(1));
			}
			expect(sent).toEqual({ channel, command: 0x10, payload: request });
		} finally {
			await connection.close();
		}
		expect(closes).toBe(1);
		expect(connection.state).toBe("closed");
	},
);
