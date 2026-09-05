import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	copyFidoHidChannel,
	decodeFidoHidPacket,
	encodeFidoHidMessage,
	fidoHidLimits,
	fidoHidMaximumPayload,
} from "./fido-hid-packets.js";

const channel = new Uint8Array([0x12, 0x34, 0xab, 0xcd]);

function rejects(action: () => unknown, code = "invalid-input") {
	expect(action).toThrowError(AgentBrowserError);
	expect(action).toThrowError(
		expect.objectContaining({
			code,
			message:
				code === "resource-limit"
					? "FIDO HID payload exceeds the packet limit."
					: "Invalid FIDO HID packet input.",
		}),
	);
}

it("exposes frozen bounded report limits and independent maximum values", () => {
	expect(Object.isFrozen(fidoHidLimits)).toBe(true);
	expect(fidoHidLimits).toEqual({
		minReportBytes: 7,
		maxReportBytes: 64,
		maxContinuationPackets: 128,
	});
	expect(fidoHidMaximumPayload()).toBe(7609);
	expect(fidoHidMaximumPayload(7)).toBe(256);
	expect(fidoHidMaximumPayload(8)).toBe(385);
	for (let reportBytes = 7; reportBytes <= 64; reportBytes++)
		expect(fidoHidMaximumPayload(reportBytes)).toBe(129 * reportBytes - 647);
});

it("encodes independent seven and eight byte wire vectors with zero padding", () => {
	const payload = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee]);
	expect(encodeFidoHidMessage(channel, 1, payload, 7)).toEqual([
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0x81, 0, 5]),
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0, 0xaa, 0xbb]),
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 1, 0xcc, 0xdd]),
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 2, 0xee, 0]),
	]);
	expect(encodeFidoHidMessage(channel, 127, payload, 8)).toEqual([
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0xff, 0, 5, 0xaa]),
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0, 0xbb, 0xcc, 0xdd]),
		new Uint8Array([0x12, 0x34, 0xab, 0xcd, 1, 0xee, 0, 0]),
	]);
});

it("encodes the default 64 byte boundary against independent reports", () => {
	const payload = Uint8Array.from({ length: 58 }, (_, index) => index + 1);
	const initial = new Uint8Array(64);
	initial.set([0x12, 0x34, 0xab, 0xcd, 0x80, 0, 58]);
	for (let index = 0; index < 57; index++) initial[7 + index] = index + 1;
	const continuation = new Uint8Array(64);
	continuation.set([0x12, 0x34, 0xab, 0xcd, 0, 58]);
	expect(encodeFidoHidMessage(channel, 0, payload)).toEqual([
		initial,
		continuation,
	]);
});

it.each([7, 8, 64])(
	"encodes empty and exact initial capacity at size %i",
	(reportBytes) => {
		const empty = new Uint8Array(reportBytes);
		empty.set([0x12, 0x34, 0xab, 0xcd, 0x80, 0, 0]);
		expect(
			encodeFidoHidMessage(channel, 0, new Uint8Array(), reportBytes),
		).toEqual([empty]);
		const payload = new Uint8Array(reportBytes - 7).fill(0x93);
		const expected = new Uint8Array(reportBytes).fill(0x93);
		expected.set([0x12, 0x34, 0xab, 0xcd, 0x82, 0, reportBytes - 7]);
		expect(encodeFidoHidMessage(channel, 2, payload, reportBytes)).toEqual([
			expected,
		]);
	},
);

it.each([
	[7, 256],
	[8, 385],
	[64, 7609],
])(
	"bounds maximum payload and sequence 127 at size %i",
	(reportBytes, maximum) => {
		const payload = new Uint8Array(maximum).fill(0xa5);
		const reports = encodeFidoHidMessage(channel, 0x42, payload, reportBytes);
		expect(reports).toHaveLength(129);
		expect(Array.from(reports[0]).slice(0, 7)).toEqual([
			0x12,
			0x34,
			0xab,
			0xcd,
			0xc2,
			maximum >> 8,
			maximum & 0xff,
		]);
		for (let index = 0; index < reports.length; index++) {
			expect(reports[index]).toHaveLength(reportBytes);
			expect(Array.from(reports[index]).slice(0, 4)).toEqual(
				Array.from(channel),
			);
			expect(Array.from(reports[index]).slice(index === 0 ? 7 : 5)).toEqual(
				Array(reportBytes - (index === 0 ? 7 : 5)).fill(0xa5),
			);
			if (index > 0) expect(reports[index][4]).toBe(index - 1);
		}
		expect(reports[128][4]).toBe(127);
		rejects(
			() =>
				encodeFidoHidMessage(
					channel,
					0,
					new Uint8Array(maximum + 1),
					reportBytes,
				),
			"resource-limit",
		);
	},
);

it("decodes independent vectors without command, length or padding interpretation", () => {
	expect(
		decodeFidoHidPacket(new Uint8Array([1, 2, 3, 4, 0xff, 0xff, 0xff]), 7),
	).toEqual({
		type: "initialization",
		channel: new Uint8Array([1, 2, 3, 4]),
		command: 127,
		payloadLength: 65535,
		data: new Uint8Array(),
	});
	expect(
		decodeFidoHidPacket(new Uint8Array([1, 2, 3, 4, 0x80, 0, 0, 0xef]), 8),
	).toEqual({
		type: "initialization",
		channel: new Uint8Array([1, 2, 3, 4]),
		command: 0,
		payloadLength: 0,
		data: new Uint8Array([0xef]),
	});
	expect(
		decodeFidoHidPacket(new Uint8Array([1, 2, 3, 4, 127, 0xaa, 0xbb]), 7),
	).toEqual({
		type: "continuation",
		channel: new Uint8Array([1, 2, 3, 4]),
		sequence: 127,
		data: new Uint8Array([0xaa, 0xbb]),
	});
	const report = new Uint8Array(64).fill(0xe7);
	report.set([1, 2, 3, 4, 0x81, 0x12, 0x34]);
	expect(decodeFidoHidPacket(report)).toEqual({
		type: "initialization",
		channel: new Uint8Array([1, 2, 3, 4]),
		command: 1,
		payloadLength: 0x1234,
		data: new Uint8Array(57).fill(0xe7),
	});
	report[4] = 0;
	expect(decodeFidoHidPacket(report)).toEqual({
		type: "continuation",
		channel: new Uint8Array([1, 2, 3, 4]),
		sequence: 0,
		data: new Uint8Array([0x12, 0x34, ...Array(57).fill(0xe7)]),
	});
});

it("copies opaque nonzero channels and permits broadcast structurally", () => {
	for (const bytes of [
		[0, 0, 0, 1],
		[1, 0, 0, 0],
		[255, 255, 255, 255],
	]) {
		const input = new Uint8Array(bytes);
		const copied = copyFidoHidChannel(input);
		expect(copied).toEqual(input);
		expect(copied.buffer).not.toBe(input.buffer);
		const reports = encodeFidoHidMessage(input, 0, new Uint8Array(), 7);
		expect(decodeFidoHidPacket(reports[0], 7).channel).toEqual(input);
		copied.fill(7);
		expect(Array.from(input)).toEqual(bytes);
	}
	for (const input of [
		new Uint8Array(4),
		new Uint8Array(3),
		new Uint8Array(5),
	]) {
		rejects(() => copyFidoHidChannel(input));
		rejects(() => encodeFidoHidMessage(input, 1, new Uint8Array()));
	}
	for (const command of [0, 0x80]) {
		const report = new Uint8Array(64);
		report[4] = command;
		rejects(() => decodeFidoHidPacket(report));
	}
});

it("preserves offsets and isolates all packet, channel and data buffers", () => {
	const backing = new Uint8Array([99, 1, 2, 3, 4, 99, 11, 12, 13, 14, 99]);
	const inputChannel = new Uint8Array(backing.buffer, 1, 4);
	const payload = new Uint8Array(backing.buffer, 6, 4);
	expect(copyFidoHidChannel(inputChannel)).toEqual(
		new Uint8Array([1, 2, 3, 4]),
	);
	const reports = encodeFidoHidMessage(inputChannel, 3, payload, 8);
	expect(reports).toEqual([
		new Uint8Array([1, 2, 3, 4, 0x83, 0, 4, 11]),
		new Uint8Array([1, 2, 3, 4, 0, 12, 13, 14]),
	]);
	expect(Array.from(backing)).toEqual([99, 1, 2, 3, 4, 99, 11, 12, 13, 14, 99]);
	backing.fill(0);
	expect(reports[0][7]).toBe(11);
	expect(reports[1][5]).toBe(12);
	expect(reports[0].buffer).not.toBe(reports[1].buffer);
	reports[0].fill(0);
	expect(reports[1][0]).toBe(1);
	for (const wire of [
		[1, 2, 3, 4, 0x80, 0, 0, 91],
		[1, 2, 3, 4, 127, 92, 93, 94],
	]) {
		const storage = new Uint8Array([99, ...wire, 99]);
		const input = new Uint8Array(storage.buffer, 1, 8);
		const decoded = decodeFidoHidPacket(input, 8);
		expect(Array.from(input)).toEqual(wire);
		expect(decoded.channel.buffer).not.toBe(input.buffer);
		expect(decoded.data.buffer).not.toBe(input.buffer);
		expect(decoded.data.buffer).not.toBe(decoded.channel.buffer);
		storage.fill(0);
		expect(decoded.channel).toEqual(new Uint8Array([1, 2, 3, 4]));
		expect(Array.from(decoded.data)).toEqual(
			wire.slice(wire[4] & 0x80 ? 7 : 5),
		);
		decoded.channel.fill(0);
		expect(decoded.data[0]).toBe(wire[4] & 0x80 ? 91 : 92);
		decoded.data.fill(0);
		expect(decoded.channel).toEqual(new Uint8Array(4));
	}
});

it("rejects invalid numeric inputs without coercion", () => {
	const hostile = {
		valueOf() {
			throw new Error("coercion");
		},
	};
	for (const input of [
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		-1,
		0,
		6,
		65,
		7.5,
		2 ** 53,
		"8",
		null,
		true,
		8n,
		Symbol(),
		hostile,
	]) {
		const reportBytes = input as number;
		rejects(() => fidoHidMaximumPayload(reportBytes));
		rejects(() =>
			encodeFidoHidMessage(channel, 1, new Uint8Array(), reportBytes),
		);
		rejects(() => decodeFidoHidPacket(new Uint8Array(8), reportBytes));
	}
	for (const input of [
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		-1,
		128,
		1.5,
		2 ** 53,
		"1",
		null,
		undefined,
		false,
		1n,
		Symbol(),
		hostile,
	])
		rejects(() =>
			encodeFidoHidMessage(channel, input as number, new Uint8Array()),
		);
	for (const reportBytes of [7, 8, 64])
		for (const length of [0, reportBytes - 1, reportBytes + 1])
			rejects(() =>
				decodeFidoHidPacket(new Uint8Array(length).fill(1), reportBytes),
			);
});

function rejectBytes(input: unknown) {
	const bytes = input as Uint8Array;
	rejects(() => copyFidoHidChannel(bytes));
	rejects(() => encodeFidoHidMessage(bytes, 1, new Uint8Array()));
	rejects(() => encodeFidoHidMessage(channel, 1, bytes));
	rejects(() => decodeFidoHidPacket(bytes, 8));
}

it("rejects nonbytes, shared and detached views across byte entry points", () => {
	const detached = new Uint8Array(4);
	structuredClone(detached.buffer, { transfer: [detached.buffer] });
	const detachedEmpty = new Uint8Array(0);
	structuredClone(detachedEmpty.buffer, { transfer: [detachedEmpty.buffer] });
	for (const input of [
		null,
		undefined,
		4,
		"bytes",
		[1, 2, 3, 4],
		{},
		new ArrayBuffer(4),
		new DataView(new ArrayBuffer(4)),
		new Int8Array(4),
		new Uint8ClampedArray(4),
		new Uint16Array(4),
		new Float32Array(4),
		new BigUint64Array(4),
		new SharedArrayBuffer(4),
		new Uint8Array(new SharedArrayBuffer(4)),
		new Uint8Array(new SharedArrayBuffer(0)),
		detached,
		detachedEmpty,
	])
		rejectBytes(input);
});

it("rejects proxies and accessor spoofs without invoking hooks", () => {
	let hooks = 0;
	const trap = () => {
		hooks++;
		throw new Error("input hook");
	};
	const spoof = Object.create(Uint8Array.prototype);
	for (const property of [
		"buffer",
		"byteOffset",
		"byteLength",
		"length",
		"constructor",
		Symbol.toStringTag,
		Symbol.iterator,
	])
		Object.defineProperty(spoof, property, { get: trap });
	const revoked = Proxy.revocable(new Uint8Array(4), {});
	revoked.revoke();
	for (const input of [
		spoof,
		new Proxy(new Uint8Array(4), { get: trap, getPrototypeOf: trap }),
		revoked.proxy,
	])
		rejectBytes(input);
	expect(hooks).toBe(0);
});

it("accepts Buffer, cross-realm and accessor-shadowed genuine byte views", () => {
	let hooks = 0;
	const trap = () => {
		hooks++;
		throw new Error("input hook");
	};
	const shadow = (bytes: Uint8Array) => {
		for (const property of [
			"buffer",
			"byteOffset",
			"byteLength",
			"length",
			"constructor",
			Symbol.toStringTag,
			Symbol.iterator,
		])
			Object.defineProperty(bytes, property, { get: trap });
		return bytes;
	};
	class HostileBytes extends Uint8Array {
		static get [Symbol.species](): Uint8ArrayConstructor {
			return trap();
		}
	}
	const channels = [
		Buffer.from([99, 1, 2, 3, 4, 99]).subarray(1, 5),
		runInNewContext(
			"new Uint8Array(new Uint8Array([99, 1, 2, 3, 4, 99]).buffer, 1, 4)",
		),
		shadow(new Uint8Array([1, 2, 3, 4])),
		new HostileBytes([1, 2, 3, 4]),
	];
	for (const input of channels) {
		expect(copyFidoHidChannel(input)).toEqual(new Uint8Array([1, 2, 3, 4]));
		expect(encodeFidoHidMessage(input, 1, input, 8)).toEqual([
			new Uint8Array([1, 2, 3, 4, 0x81, 0, 4, 1]),
			new Uint8Array([1, 2, 3, 4, 0, 2, 3, 4]),
		]);
	}
	for (const report of [
		Buffer.from([99, 1, 2, 3, 4, 0x80, 0, 0, 91, 99]).subarray(1, 9),
		runInNewContext(
			"new Uint8Array(new Uint8Array([99, 1, 2, 3, 4, 0x80, 0, 0, 91]).buffer, 1, 8)",
		),
		shadow(new Uint8Array([1, 2, 3, 4, 0x80, 0, 0, 91])),
		new HostileBytes([1, 2, 3, 4, 0x80, 0, 0, 91]),
	])
		expect(decodeFidoHidPacket(report, 8)).toEqual({
			type: "initialization",
			channel: new Uint8Array([1, 2, 3, 4]),
			command: 0,
			payloadLength: 0,
			data: new Uint8Array([91]),
		});
	expect(hooks).toBe(0);
});

it("checks excessive payload length before copying or inspecting the channel", () => {
	let hooks = 0;
	const payload = new Uint8Array(7610);
	Object.defineProperty(payload, "length", {
		get() {
			hooks++;
			return 0;
		},
	});
	const hostileChannel = new Proxy(channel, {
		get() {
			hooks++;
			throw new Error("channel hook");
		},
	});
	rejects(
		() => encodeFidoHidMessage(hostileChannel, 1, payload),
		"resource-limit",
	);
	expect(hooks).toBe(0);
});
