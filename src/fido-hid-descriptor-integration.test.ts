import { expect, it } from "vitest";
import { discoverFidoHidReportLayouts } from "./fido-hid-descriptor.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";
import { decodeFidoHidResponseControl } from "./fido-hid-response-control.js";
import {
	decodeLinuxHidrawInputReport,
	encodeLinuxHidrawOutputReport,
} from "./linux-hidraw-reports.js";

const channel = new Uint8Array([1, 2, 3, 4]);

it.each([
	{ inputBytes: 64, outputBytes: 64, inputId: 0, outputId: 0 },
	{ inputBytes: 7, outputBytes: 64, inputId: 7, outputId: 9 },
	{ inputBytes: 64, outputBytes: 7, inputId: 7, outputId: 9 },
])(
	"uses independent descriptor report metadata for $inputBytes/$outputBytes byte directions",
	({ inputBytes, outputBytes, inputId, outputId }) => {
		const descriptor = new Uint8Array([
			0x06,
			0xd0,
			0xf1,
			0x09,
			0x01,
			0xa1,
			0x01,
			0x09,
			0x20,
			0x15,
			0x00,
			0x26,
			0xff,
			0x00,
			0x75,
			0x08,
			...(inputId ? [0x85, inputId] : []),
			0x95,
			inputBytes,
			0x81,
			0x02,
			0x09,
			0x21,
			...(outputId ? [0x85, outputId] : []),
			0x95,
			outputBytes,
			0x91,
			0x02,
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
		const outbound = encodeFidoHidMessage(
			channel,
			0x10,
			new Uint8Array([1, 0xa0]),
			layout.output.reportBytes,
		);
		expect(outbound).toHaveLength(outputBytes === 7 ? 2 : 1);
		for (const packet of outbound) {
			const write = encodeLinuxHidrawOutputReport(
				packet,
				layout.output.reportBytes,
				layout.output.reportId,
			);
			expect(write).toHaveLength(outputBytes + 1);
			expect(write[0]).toBe(outputId);
			expect(write.subarray(1)).toEqual(packet);
		}
		let completed = 0;
		for (const status of [1, 2]) {
			const packets = encodeFidoHidMessage(
				channel,
				0x3b,
				new Uint8Array([status]),
				layout.input.reportBytes,
			);
			expect(packets).toHaveLength(inputBytes === 7 ? 2 : 1);
			const assembler = new FidoHidMessageAssembler(
				channel,
				layout.input.reportBytes,
			);
			for (const [index, packet] of packets.entries()) {
				const read = new Uint8Array(inputId ? [inputId, ...packet] : packet);
				const normalized = decodeLinuxHidrawInputReport(
					read,
					layout.input.reportBytes,
					layout.input.reportId,
				);
				expect(normalized).toEqual(packet);
				const message = assembler.accept(normalized);
				if (index < packets.length - 1) expect(message).toBeUndefined();
				else {
					expect(message).toBeDefined();
					if (!message) throw new Error("Expected assembled control message");
					expect(
						decodeFidoHidResponseControl(
							message.channel,
							message.command,
							message.payload,
						),
					).toEqual({
						kind: "keepalive",
						channel,
						code: status,
						status: status === 1 ? "STATUS_PROCESSING" : "STATUS_UPNEEDED",
					});
					completed++;
				}
			}
		}
		expect(completed).toBe(2);
	},
);
