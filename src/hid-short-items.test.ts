import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	type HidShortItemOptions,
	tokenizeHidShortItems,
} from "./hid-short-items.js";

const invalidMessage = "Invalid HID short-item input.";
const byteLimitMessage = "HID descriptor byte limit exceeded.";
const itemLimitMessage = "HID item count limit exceeded.";
const longMessage = "Long HID items are unsupported.";
const reservedMessage = "Reserved HID item types are unsupported.";

function rejects(
	action: () => unknown,
	code: ErrorCode = "invalid-input",
	message = invalidMessage,
): void {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ name: "AgentBrowserError", code, message });
	expect(caught).not.toHaveProperty("offset");
	expect(caught).not.toHaveProperty("cause");
}

it("classifies all 256 headers as 180 framed forms and 76 refusals", () => {
	const payloads = [[], [0xff], [0xfe, 0xdc], [0x80, 0xff, 0xfe, 0x01]];
	const types = ["main", "global", "local"];
	let iterations = 0;
	let permitted = 0;
	let refused = 0;
	for (let header = 0; header < 256; header++) {
		iterations++;
		const data = payloads[header % 4];
		const bytes = new Uint8Array([header, ...data]);
		const tag = Math.floor(header / 16);
		const type = Math.floor(header / 4) % 4;
		if (tag === 15 || type === 3) {
			refused++;
			rejects(
				() => tokenizeHidShortItems(bytes),
				"unsupported",
				tag === 15 ? longMessage : reservedMessage,
			);
		} else {
			permitted++;
			expect(tokenizeHidShortItems(bytes)).toEqual([
				{
					offset: 0,
					header,
					type: types[type],
					tag,
					data: new Uint8Array(data),
				},
			]);
		}
	}
	expect({ iterations, permitted, refused }).toEqual({
		iterations: 256,
		permitted: 180,
		refused: 76,
	});
});

it("retains independent offsets, raw headers and four bytes for size code three", () => {
	expect(
		tokenizeHidShortItems(
			new Uint8Array([
				0x04, 0x05, 0xaa, 0x06, 0xbb, 0xcc, 0x07, 0xdd, 0xee, 0xff, 0,
			]),
		),
	).toEqual([
		{ offset: 0, header: 4, type: "global", tag: 0, data: new Uint8Array() },
		{
			offset: 1,
			header: 5,
			type: "global",
			tag: 0,
			data: new Uint8Array([0xaa]),
		},
		{
			offset: 3,
			header: 6,
			type: "global",
			tag: 0,
			data: new Uint8Array([0xbb, 0xcc]),
		},
		{
			offset: 6,
			header: 7,
			type: "global",
			tag: 0,
			data: new Uint8Array([0xdd, 0xee, 0xff, 0]),
		},
	]);
});

it("rejects every truncated permitted form with and without a complete prefix", () => {
	let headers = 0;
	let iterations = 0;
	for (let tag = 0; tag < 15; tag++) {
		for (let type = 0; type < 3; type++) {
			for (const [sizeCode, size] of [
				[1, 1],
				[2, 2],
				[3, 4],
			]) {
				headers++;
				for (let available = 0; available < size; available++) {
					for (const prefix of [[], [0x04]]) {
						iterations++;
						const bytes = new Uint8Array([
							...prefix,
							tag * 16 + type * 4 + sizeCode,
							...new Uint8Array(available).fill(0xff),
						]);
						rejects(() => tokenizeHidShortItems(bytes));
					}
				}
			}
		}
	}
	expect(headers).toBe(135);
	expect(iterations).toBe(630);
});

it("refuses unsupported headers before checking or scanning any suffix", () => {
	let headers = 0;
	let iterations = 0;
	for (let header = 0; header < 256; header++) {
		if (header < 0xf0 && (header & 0x0c) !== 0x0c) continue;
		headers++;
		for (const suffix of [[], [0xff], [0x00, 0x05]]) {
			for (const prefix of [[], [0x04]]) {
				iterations++;
				rejects(
					() =>
						tokenizeHidShortItems(
							new Uint8Array([...prefix, header, ...suffix]),
						),
					"unsupported",
					header >= 0xf0 ? longMessage : reservedMessage,
				);
			}
		}
	}
	expect(headers).toBe(76);
	expect(iterations).toBe(456);
});

it("makes progress through 4096 zero-byte items", () => {
	const items = tokenizeHidShortItems(new Uint8Array(4096));
	expect(items).toHaveLength(4096);
	let iterations = 0;
	for (const item of items) {
		expect(item).toEqual({
			offset: iterations,
			header: 0,
			type: "main",
			tag: 0,
			data: new Uint8Array(),
		});
		iterations++;
	}
	expect(iterations).toBe(4096);
});

it("returns empty tokens without claiming descriptor validity", () => {
	expect(tokenizeHidShortItems(new Uint8Array())).toEqual([]);
	expect(
		tokenizeHidShortItems(new Uint8Array(), { maxBytes: 1, maxItems: 1 }),
	).toEqual([]);
});

it("enforces exact configured and default full-byte caps", () => {
	let iterations = 0;
	for (const limit of [1, 5, 4096]) {
		iterations++;
		expect(
			tokenizeHidShortItems(new Uint8Array(limit), { maxBytes: limit }),
		).toHaveLength(limit);
		rejects(
			() =>
				tokenizeHidShortItems(new Uint8Array(limit + 1), { maxBytes: limit }),
			"resource-limit",
			byteLimitMessage,
		);
	}
	expect(iterations).toBe(3);
	rejects(
		() => tokenizeHidShortItems(new Uint8Array(4097)),
		"resource-limit",
		byteLimitMessage,
	);
	expect(
		tokenizeHidShortItems(new Uint8Array([0x07, 1, 2, 3, 4]), { maxBytes: 5 }),
	).toHaveLength(1);
});

it("enforces exact item caps before reading the next item", () => {
	let iterations = 0;
	for (const limit of [1, 2, 4095]) {
		iterations++;
		expect(
			tokenizeHidShortItems(new Uint8Array(limit), { maxItems: limit }),
		).toHaveLength(limit);
		rejects(
			() =>
				tokenizeHidShortItems(new Uint8Array(limit + 1), { maxItems: limit }),
			"resource-limit",
			itemLimitMessage,
		);
	}
	expect(iterations).toBe(3);
	let suffixes = 0;
	for (const header of [0x00, 0x07, 0x0f, 0xff]) {
		suffixes++;
		rejects(
			() =>
				tokenizeHidShortItems(new Uint8Array([0x04, header]), { maxItems: 1 }),
			"resource-limit",
			itemLimitMessage,
		);
	}
	expect(suffixes).toBe(4);
});

it("checks the full-byte cap before unsupported, truncated or item-limited content", () => {
	let iterations = 0;
	for (const bytes of [
		[0xff, 0],
		[0x0f, 0],
		[0x07, 0],
		[0, 0],
	]) {
		iterations++;
		rejects(
			() =>
				tokenizeHidShortItems(new Uint8Array(bytes), {
					maxBytes: 1,
					maxItems: 1,
				}),
			"resource-limit",
			byteLimitMessage,
		);
	}
	expect(iterations).toBe(4);
});

it("defaults undefined limits and accepts integer boundary configurations", () => {
	let iterations = 0;
	for (const options of [
		undefined,
		{},
		{ maxBytes: undefined, maxItems: undefined },
		{ maxBytes: 1, maxItems: 1 },
		{ maxBytes: 2, maxItems: 2 },
		{ maxBytes: 4095, maxItems: 4095 },
		{ maxBytes: 4096, maxItems: 4096 },
	]) {
		iterations++;
		expect(tokenizeHidShortItems(new Uint8Array([0]), options)).toHaveLength(1);
	}
	expect(iterations).toBe(7);
});

it("rejects invalid limits without coercion even on empty input", () => {
	let hooks = 0;
	const trap = (): never => {
		hooks++;
		throw new Error("private limit");
	};
	const values: unknown[] = [
		0,
		-0,
		-1,
		4097,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		"1",
		"4096",
		1n,
		null,
		true,
		false,
		Symbol("private"),
		new Number(1),
		[],
		{},
		{ valueOf: trap, toString: trap, [Symbol.toPrimitive]: trap },
	];
	let iterations = 0;
	for (const key of ["maxBytes", "maxItems"]) {
		for (const value of values) {
			iterations++;
			rejects(() =>
				tokenizeHidShortItems(new Uint8Array(), {
					[key]: value,
				} as HidShortItemOptions),
			);
		}
	}
	expect(iterations).toBe(38);
	expect(hooks).toBe(0);
});

it("rejects nonobject and array options with fixed errors", () => {
	let iterations = 0;
	for (const options of [
		null,
		[],
		1,
		"private",
		true,
		false,
		1n,
		Symbol(),
		() => 1,
	]) {
		iterations++;
		rejects(() =>
			tokenizeHidShortItems(new Uint8Array(), options as HidShortItemOptions),
		);
	}
	expect(iterations).toBe(9);
});

it("normalizes hostile option getters and proxies including thrown browser errors", () => {
	let iterations = 0;
	for (const key of ["maxBytes", "maxItems"]) {
		for (const failure of [
			new Error("private getter"),
			new AgentBrowserError("unsupported", "private unsupported"),
			new AgentBrowserError("resource-limit", "private resource limit"),
		]) {
			iterations++;
			const options = Object.defineProperty({}, key, {
				get: () => {
					throw failure;
				},
			});
			rejects(() => tokenizeHidShortItems(new Uint8Array([0xff]), options));
		}
	}
	expect(iterations).toBe(6);
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	rejects(() => tokenizeHidShortItems(new Uint8Array(), revoked.proxy));
	rejects(() =>
		tokenizeHidShortItems(
			new Uint8Array(),
			new Proxy(
				{},
				{
					get: () => {
						throw new Error("private proxy");
					},
				},
			),
		),
	);
});

it("ignores unrelated keys and accepts inherited or null-prototype limits", () => {
	let hooks = 0;
	const options = Object.create(null);
	options.maxBytes = 1;
	Object.defineProperty(options, "private", {
		get: () => {
			hooks++;
			throw new Error("private key");
		},
	});
	expect(tokenizeHidShortItems(new Uint8Array([0]), options)).toHaveLength(1);
	expect(
		tokenizeHidShortItems(new Uint8Array([0]), Object.create({ maxItems: 1 })),
	).toHaveLength(1);
	expect(hooks).toBe(0);
});

it("validates both supplied options before input parsing or byte limits", () => {
	let reads = 0;
	const options = {
		get maxBytes() {
			reads++;
			return 1;
		},
		get maxItems() {
			reads++;
			return 0;
		},
	};
	let iterations = 0;
	for (const bytes of [new Uint8Array([0xff]), new Uint8Array(4097), null]) {
		iterations++;
		rejects(() => tokenizeHidShortItems(bytes as Uint8Array, options));
	}
	expect(iterations).toBe(3);
	expect(reads).toBe(6);
});

it("rejects wrong byte brands and spoofed branding", () => {
	let iterations = 0;
	for (const value of [
		null,
		undefined,
		false,
		7,
		"private bytes",
		[0],
		{},
		new ArrayBuffer(1),
		new DataView(new ArrayBuffer(1)),
		new Int8Array(1),
		new Uint8ClampedArray(1),
		new Uint16Array(1),
		new Float32Array(1),
		Object.create(Uint8Array.prototype),
		{ length: 1, [Symbol.toStringTag]: "Uint8Array" },
		Object.defineProperty(new Uint16Array(1), Symbol.toStringTag, {
			value: "Uint8Array",
		}),
	]) {
		iterations++;
		rejects(() => tokenizeHidShortItems(value as Uint8Array));
	}
	expect(iterations).toBe(16);
});

it("rejects shared and detached storage including empty and cross-realm views", () => {
	let iterations = 0;
	for (const length of [0, 1]) {
		const detached = new Uint8Array(length);
		structuredClone(detached.buffer, { transfer: [detached.buffer] });
		const foreignDetached = runInNewContext("new Uint8Array(length)", {
			length,
		});
		structuredClone(foreignDetached.buffer, {
			transfer: [foreignDetached.buffer],
		});
		for (const value of [
			detached,
			foreignDetached,
			new Uint8Array(new SharedArrayBuffer(length)),
			runInNewContext("new Uint8Array(new SharedArrayBuffer(length))", {
				length,
			}),
		]) {
			iterations++;
			rejects(() => tokenizeHidShortItems(value));
		}
	}
	expect(iterations).toBe(8);
});

it("distinguishes valid empty resizable views from out-of-bounds views", () => {
	const buffer = new ArrayBuffer(8, { maxByteLength: 16 });
	const emptyFixed = new Uint8Array(buffer, 4, 0);
	const tracking = new Uint8Array(buffer, 4);
	const populatedFixed = new Uint8Array(buffer, 4, 2);
	buffer.resize(4);
	let emptyCases = 0;
	for (const bytes of [emptyFixed, tracking]) {
		emptyCases++;
		expect(tokenizeHidShortItems(bytes)).toEqual([]);
	}
	expect(emptyCases).toBe(2);
	rejects(() => tokenizeHidShortItems(populatedFixed));
	buffer.resize(3);
	let invalidCases = 0;
	for (const bytes of [emptyFixed, tracking, populatedFixed]) {
		invalidCases++;
		expect(bytes.byteOffset).toBe(0);
		expect(bytes.byteLength).toBe(0);
		rejects(() => tokenizeHidShortItems(bytes));
	}
	expect(invalidCases).toBe(3);
	buffer.resize(8);
	expect(tokenizeHidShortItems(emptyFixed)).toEqual([]);
	expect(tokenizeHidShortItems(tracking)).toHaveLength(4);
	expect(tokenizeHidShortItems(populatedFixed)).toHaveLength(2);
});

it("isolates payloads from resizable fixed and length-tracking input storage", () => {
	const buffer = new ArrayBuffer(5, { maxByteLength: 16 });
	new Uint8Array(buffer).set([0xff, 0x05, 0xaa, 0x05, 0xbb]);
	const fixed = new Uint8Array(buffer, 1, 4);
	const tracking = new Uint8Array(buffer, 1);
	const fixedItems = tokenizeHidShortItems(fixed);
	const trackingItems = tokenizeHidShortItems(tracking);
	expect([...new Uint8Array(buffer)]).toEqual([0xff, 0x05, 0xaa, 0x05, 0xbb]);
	buffer.resize(0);
	buffer.resize(9);
	new Uint8Array(buffer).fill(0);
	let iterations = 0;
	for (const items of [fixedItems, trackingItems]) {
		iterations++;
		expect(items.map((item) => [...item.data])).toEqual([[0xaa], [0xbb]]);
		expect(items[0].data.buffer).not.toBe(buffer);
		expect(items[1].data.buffer).not.toBe(buffer);
	}
	expect(iterations).toBe(2);
	fixedItems[0].data[0] = 0x11;
	expect(trackingItems[0].data).toEqual(new Uint8Array([0xaa]));
	expect(fixedItems[1].data).toEqual(new Uint8Array([0xbb]));
	expect([...new Uint8Array(buffer)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

it("rejects proxies and hostile lookalikes without reading their hooks", () => {
	let hooks = 0;
	const trap = (): never => {
		hooks++;
		throw new Error("private byte hook");
	};
	const bytes = new Uint8Array([0]);
	const revoked = Proxy.revocable(bytes, {});
	revoked.revoke();
	const lookalike = Object.create(null);
	let properties = 0;
	for (const key of [
		"buffer",
		"byteOffset",
		"byteLength",
		"length",
		Symbol.toStringTag,
	]) {
		properties++;
		Object.defineProperty(lookalike, key, { get: trap });
	}
	let iterations = 0;
	for (const value of [
		new Proxy(bytes, {}),
		new Proxy(bytes, { get: trap, getPrototypeOf: trap }),
		revoked.proxy,
		lookalike,
	]) {
		iterations++;
		rejects(() => tokenizeHidShortItems(value));
	}
	expect(properties).toBe(5);
	expect(iterations).toBe(4);
	expect(hooks).toBe(0);
});

it("accepts genuine offset, Buffer, cross-realm and hostile subclass views", () => {
	let hooks = 0;
	const trap = (): never => {
		hooks++;
		throw new Error("private view hook");
	};
	class HostileBytes extends Uint8Array {
		static get [Symbol.species](): Uint8ArrayConstructor {
			return trap();
		}
	}
	const storage = new Uint8Array([0xff, 0x05, 0xaa, 0xff]);
	const shadowed = new HostileBytes(storage.buffer, 1, 2);
	let properties = 0;
	for (const key of [
		"buffer",
		"byteOffset",
		"byteLength",
		"length",
		"constructor",
		"slice",
		"subarray",
		"set",
		"values",
		Symbol.iterator,
		Symbol.toStringTag,
	]) {
		properties++;
		Object.defineProperty(shadowed, key, { get: trap });
	}
	Object.defineProperty(storage.buffer, "byteLength", { get: trap });
	let iterations = 0;
	for (const bytes of [
		new Uint8Array([0x05, 0xaa]),
		new Uint8Array(storage.buffer, 1, 2),
		Buffer.from([0xff, 0x05, 0xaa, 0xff]).subarray(1, 3),
		new HostileBytes([0x05, 0xaa]),
		shadowed,
		runInNewContext(
			"new Uint8Array(new Uint8Array([255, 5, 170, 255]).buffer, 1, 2)",
		),
	]) {
		iterations++;
		expect(tokenizeHidShortItems(bytes, { maxBytes: 2 })).toEqual([
			{
				offset: 0,
				header: 5,
				type: "global",
				tag: 0,
				data: new Uint8Array([0xaa]),
			},
		]);
	}
	expect(properties).toBe(11);
	expect(iterations).toBe(6);
	expect(hooks).toBe(0);
});

it("owns each payload independently without retaining or mutating input storage", () => {
	const storage = new Uint8Array([
		0xff, 0x05, 0xaa, 0x05, 0xbb, 0x04, 0x04, 0xff,
	]);
	const input = storage.subarray(1, 7);
	const items = tokenizeHidShortItems(input);
	const again = tokenizeHidShortItems(input);
	expect(storage).toEqual(
		new Uint8Array([0xff, 0x05, 0xaa, 0x05, 0xbb, 0x04, 0x04, 0xff]),
	);
	let iterations = 0;
	for (const item of items) {
		iterations++;
		expect(item.data.buffer).not.toBe(storage.buffer);
		expect(item.data.byteOffset).toBe(0);
		expect(item.data.buffer.byteLength).toBe(item.data.length);
	}
	expect(iterations).toBe(4);
	expect(new Set(items.map((item) => item.data.buffer)).size).toBe(4);
	items[0].data[0] = 0x11;
	expect(input[1]).toBe(0xaa);
	expect(items[1].data).toEqual(new Uint8Array([0xbb]));
	expect(again[0].data).toEqual(new Uint8Array([0xaa]));
	storage.fill(0);
	structuredClone(storage.buffer, { transfer: [storage.buffer] });
	expect(items.map((item) => [...item.data])).toEqual([[0x11], [0xbb], [], []]);
	expect(again.map((item) => [...item.data])).toEqual([[0xaa], [0xbb], [], []]);
});

it("never returns a partial prefix when a later item fails", () => {
	let iterations = 0;
	for (const fixture of [
		{ bytes: [0x04, 0x05], code: "invalid-input", message: invalidMessage },
		{ bytes: [0x04, 0xff], code: "unsupported", message: longMessage },
		{ bytes: [0x04, 0x0c], code: "unsupported", message: reservedMessage },
	] as const) {
		iterations++;
		let returned: unknown = "not returned";
		rejects(
			() => {
				returned = tokenizeHidShortItems(new Uint8Array(fixture.bytes));
			},
			fixture.code,
			fixture.message,
		);
		expect(returned).toBe("not returned");
	}
	expect(iterations).toBe(3);
});

it("keeps illustrative FIDO-like bytes as tokens only", () => {
	const bytes = new Uint8Array([
		0x06, 0xd0, 0xf1, 0x09, 0x01, 0xa1, 0x01, 0x09, 0x20, 0x15, 0x00, 0x26,
		0xff, 0x00, 0x75, 0x08, 0x95, 0x40, 0x81, 0x02, 0x09, 0x21, 0x91, 0x02,
		0xc0,
	]);
	expect(tokenizeHidShortItems(bytes)).toEqual([
		{
			offset: 0,
			header: 0x06,
			type: "global",
			tag: 0,
			data: new Uint8Array([0xd0, 0xf1]),
		},
		{
			offset: 3,
			header: 0x09,
			type: "local",
			tag: 0,
			data: new Uint8Array([1]),
		},
		{
			offset: 5,
			header: 0xa1,
			type: "main",
			tag: 10,
			data: new Uint8Array([1]),
		},
		{
			offset: 7,
			header: 0x09,
			type: "local",
			tag: 0,
			data: new Uint8Array([0x20]),
		},
		{
			offset: 9,
			header: 0x15,
			type: "global",
			tag: 1,
			data: new Uint8Array([0]),
		},
		{
			offset: 11,
			header: 0x26,
			type: "global",
			tag: 2,
			data: new Uint8Array([0xff, 0]),
		},
		{
			offset: 14,
			header: 0x75,
			type: "global",
			tag: 7,
			data: new Uint8Array([8]),
		},
		{
			offset: 16,
			header: 0x95,
			type: "global",
			tag: 9,
			data: new Uint8Array([0x40]),
		},
		{
			offset: 18,
			header: 0x81,
			type: "main",
			tag: 8,
			data: new Uint8Array([2]),
		},
		{
			offset: 20,
			header: 0x09,
			type: "local",
			tag: 0,
			data: new Uint8Array([0x21]),
		},
		{
			offset: 22,
			header: 0x91,
			type: "main",
			tag: 9,
			data: new Uint8Array([2]),
		},
		{ offset: 24, header: 0xc0, type: "main", tag: 12, data: new Uint8Array() },
	]);
});
