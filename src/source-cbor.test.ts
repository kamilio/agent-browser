import { expect, it, vi } from "vitest";
import {
	decodeSourceCbor,
	sourceCborLimits,
	type SourceCborValue,
} from "./source-cbor.js";

function rejects(input: unknown, code = "invalid-input", options?: unknown) {
	expect(() =>
		decodeSourceCbor(
			input as Uint8Array,
			options as Parameters<typeof decodeSourceCbor>[1],
		),
	).toThrowError(expect.objectContaining({ name: "AgentBrowserError", code }));
}

function join(parts: readonly Uint8Array[]): Uint8Array {
	const output = new Uint8Array(
		parts.reduce((length, part) => length + part.length, 0),
	);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}

function argument(major: number, input: number | bigint): Uint8Array {
	const value = BigInt(input);
	if (value < 24n) return new Uint8Array([(major << 5) | Number(value)]);
	const width =
		value <= 255n ? 1 : value <= 65535n ? 2 : value <= 4294967295n ? 4 : 8;
	const additional =
		width === 1 ? 24 : width === 2 ? 25 : width === 4 ? 26 : 27;
	const output = new Uint8Array(1 + width);
	output[0] = (major << 5) | additional;
	for (let index = 0; index < width; index++)
		output[index + 1] = Number(
			(value >> BigInt((width - index - 1) * 8)) & 255n,
		);
	return output;
}

function text(value: string): Uint8Array {
	const bytes = new TextEncoder().encode(value);
	return join([argument(3, bytes.length), bytes]);
}

function repeatedArray(count: number): Uint8Array {
	return join([argument(4, count), new Uint8Array(count).fill(0xf6)]);
}

function integerMap(count: number): Uint8Array {
	const parts = [argument(5, count)];
	for (let index = 0; index < count; index++) {
		parts.push(argument(0, index), new Uint8Array([0xf6]));
	}
	return join(parts);
}

function arrayItems(value: SourceCborValue): readonly SourceCborValue[] {
	if (value.kind !== "array") throw new Error("Expected array fixture");
	return value.items;
}

it("exports frozen fixed limits", () => {
	expect(Object.isFrozen(sourceCborLimits)).toBe(true);
	expect(sourceCborLimits).toEqual({
		maxBytes: 2_000_000,
		maxDepth: 64,
		maxValues: 100_000,
		maxStringBytes: 1_000_000,
		maxContainerEntries: 50_000,
	});
});

it("decodes canonical unsigned widths without rounding uint64", () => {
	for (const value of [
		0n,
		23n,
		24n,
		255n,
		256n,
		65535n,
		65536n,
		4294967295n,
		4294967296n,
		9007199254740993n,
		18446744073709551615n,
	]) {
		const input = argument(0, value);
		expect(decodeSourceCbor(input)).toEqual({
			kind: "unsigned",
			value,
			start: 0,
			end: input.length,
		});
	}
});

it("decodes canonical negative widths through negative uint64", () => {
	for (const magnitude of [
		0n,
		23n,
		24n,
		255n,
		256n,
		65535n,
		65536n,
		4294967295n,
		4294967296n,
		18446744073709551615n,
	]) {
		const input = argument(1, magnitude);
		expect(decodeSourceCbor(input)).toEqual({
			kind: "negative",
			value: -1n - magnitude,
			start: 0,
			end: input.length,
		});
	}
});

it("decodes booleans, null and empty strings and containers with offsets", () => {
	const fixtures = [
		{ header: 0xf4, node: { kind: "boolean", value: false } },
		{ header: 0xf5, node: { kind: "boolean", value: true } },
		{ header: 0xf6, node: { kind: "null" } },
		{ header: 0x40, node: { kind: "bytes", value: new Uint8Array() } },
		{ header: 0x60, node: { kind: "text", value: "" } },
		{ header: 0x80, node: { kind: "array", items: [] } },
		{ header: 0xa0, node: { kind: "map", entries: [] } },
	];
	for (const { header, node } of fixtures)
		expect(decodeSourceCbor(new Uint8Array([header]))).toEqual({
			...node,
			start: 0,
			end: 1,
		});
});

it("retains exact half-open offsets for every nested node", () => {
	const input = new Uint8Array([
		0x83, 0x18, 24, 0xa1, 0x61, 0x78, 0x82, 0xf5, 0xf6, 0x42, 1, 2,
	]);
	expect(decodeSourceCbor(input)).toEqual({
		kind: "array",
		start: 0,
		end: 12,
		items: [
			{ kind: "unsigned", value: 24n, start: 1, end: 3 },
			{
				kind: "map",
				start: 3,
				end: 9,
				entries: [
					[
						{ kind: "text", value: "x", start: 4, end: 6 },
						{
							kind: "array",
							start: 6,
							end: 9,
							items: [
								{ kind: "boolean", value: true, start: 7, end: 8 },
								{ kind: "null", start: 8, end: 9 },
							],
						},
					],
				],
			},
			{ kind: "bytes", value: new Uint8Array([1, 2]), start: 9, end: 12 },
		],
	});
});

it("keeps neighboring uint64 map keys distinct", () => {
	const values = [9007199254740992n, 9007199254740993n, 18446744073709551615n];
	const parts = [argument(5, values.length)];
	for (const value of values)
		parts.push(argument(0, value), new Uint8Array([0]));
	const result = decodeSourceCbor(join(parts));
	if (result.kind !== "map") throw new Error("Expected map fixture");
	expect(
		result.entries.map(([key]) => key.kind === "unsigned" && key.value),
	).toEqual(values);
});

it("decodes fatal UTF8 while retaining initial and embedded BOMs and NULs", () => {
	for (const value of ["ASCII", "é界😀", "\uFEFF", "\uFEFFtext\uFEFF", "\0"]) {
		const input = text(value);
		expect(decodeSourceCbor(input)).toEqual({
			kind: "text",
			value,
			start: 0,
			end: input.length,
		});
	}
});

it("streams UTF8 safely across byte-work boundaries", () => {
	for (const prefix of [4093, 4094, 4095, 4096]) {
		const value = `${"x".repeat(prefix)}😀\uFEFF${"界".repeat(2048)}`;
		expect(decodeSourceCbor(text(value))).toMatchObject({
			kind: "text",
			value,
		});
	}
});

it("owns byte strings independently of input, siblings and other decodes", () => {
	const input = new Uint8Array([0x84, 0x42, 1, 2, 0x42, 1, 2, 0x40, 0x40]);
	const original = input.slice();
	const items = arrayItems(decodeSourceCbor(input));
	const [first, second, emptyFirst, emptySecond] = items;
	if (
		first.kind !== "bytes" ||
		second.kind !== "bytes" ||
		emptyFirst.kind !== "bytes" ||
		emptySecond.kind !== "bytes"
	)
		throw new Error("Expected byte fixtures");
	input.fill(255);
	expect(first.value).toEqual(new Uint8Array([1, 2]));
	expect(first.value.buffer).not.toBe(second.value.buffer);
	expect(emptyFirst.value.buffer).not.toBe(emptySecond.value.buffer);
	first.value.fill(9);
	expect(second.value).toEqual(new Uint8Array([1, 2]));
	expect(arrayItems(decodeSourceCbor(original))[0]).toMatchObject({
		value: new Uint8Array([1, 2]),
	});
});

it("uses only the supplied view and bypasses caller byte hooks", () => {
	const backing = new Uint8Array([0xff, 0x18, 24, 0xff]);
	const input = backing.subarray(1, 3);
	const hook = vi.fn(() => {
		throw new Error("Unexpected byte hook");
	});
	for (const property of [
		"length",
		"byteLength",
		"byteOffset",
		"buffer",
		"constructor",
		"slice",
		"subarray",
		Symbol.toStringTag,
		Symbol.iterator,
	])
		Object.defineProperty(input, property, { get: hook });
	expect(decodeSourceCbor(input)).toEqual({
		kind: "unsigned",
		value: 24n,
		start: 0,
		end: 2,
	});
	expect(hook).not.toHaveBeenCalled();
	expect(backing).toEqual(new Uint8Array([0xff, 0x18, 24, 0xff]));
});

it("rejects duplicate semantic keys for every supported scalar kind", () => {
	for (const key of [
		argument(0, 0),
		argument(0, 18446744073709551615n),
		argument(1, 0),
		text(""),
		text("__proto__"),
		new Uint8Array([0x40]),
		new Uint8Array([0x42, 0, 255]),
		new Uint8Array([0xf4]),
		new Uint8Array([0xf5]),
		new Uint8Array([0xf6]),
	]) {
		rejects(
			join([
				new Uint8Array([0xa2]),
				key,
				new Uint8Array([0]),
				key,
				new Uint8Array([1]),
			]),
		);
	}
});

it("keeps typed keys distinct without coercion, property assignment or ordering requirements", () => {
	const keys = [
		text("__proto__"),
		text("constructor"),
		text("toString"),
		text("1"),
		argument(0, 1),
		text("-1"),
		argument(1, 0),
		text("true"),
		new Uint8Array([0xf5]),
		text("false"),
		new Uint8Array([0xf4]),
		text("null"),
		new Uint8Array([0xf6]),
		text("a"),
		new Uint8Array([0x41, 0x61]),
		text(""),
		new Uint8Array([0x40]),
	];
	const parts = [argument(5, keys.length)];
	for (const key of keys) parts.push(key, new Uint8Array([0xf6]));
	const result = decodeSourceCbor(join(parts));
	if (result.kind !== "map") throw new Error("Expected map fixture");
	expect(result.entries).toHaveLength(keys.length);
	expect(
		result.entries.slice(0, 3).map(([key]) => key.kind === "text" && key.value),
	).toEqual(["__proto__", "constructor", "toString"]);
});

it("does not normalize Unicode or remove BOMs when comparing text keys", () => {
	const keys = ["é", "e\u0301", "name", "\uFEFFname"];
	const parts = [argument(5, keys.length)];
	for (const key of keys) parts.push(text(key), new Uint8Array([0]));
	const result = decodeSourceCbor(join(parts));
	if (result.kind !== "map") throw new Error("Expected map fixture");
	expect(result.entries).toHaveLength(4);
});

it("rejects every nonminimal integer argument width", () => {
	for (const major of [0, 1]) {
		for (const suffix of [
			[24, 0],
			[24, 23],
			[25, 0, 24],
			[25, 0, 255],
			[26, 0, 0, 1, 0],
			[26, 0, 0, 255, 255],
			[27, 0, 0, 0, 0, 255, 255, 255, 255],
		])
			rejects(new Uint8Array([(major << 5) | suffix[0], ...suffix.slice(1)]));
	}
});

it("rejects nonminimal string and container lengths at every width", () => {
	for (const major of [2, 3, 4, 5]) {
		for (const suffix of [
			[24, 0],
			[24, 23],
			[25, 0, 24],
			[26, 0, 0, 1, 0],
			[27, 0, 0, 0, 0, 0, 1, 0, 0],
		])
			rejects(new Uint8Array([(major << 5) | suffix[0], ...suffix.slice(1)]));
	}
});

it("rejects truncated arguments, payloads and container children", () => {
	const complete = [
		argument(0, 24),
		argument(0, 256),
		argument(0, 65536),
		argument(0, 4294967296n),
		argument(1, 18446744073709551615n),
		new Uint8Array([0x43, 1, 2, 3]),
		text("é😀"),
		repeatedArray(24),
		new Uint8Array([0xa1, 0x61, 0x78, 0x81, 0xf6]),
		new Uint8Array([0xf8, 32]),
		new Uint8Array([0xf9, 0, 0]),
		new Uint8Array([0xfa, 0, 0, 0, 0]),
		new Uint8Array([0xfb, 0, 0, 0, 0, 0, 0, 0, 0]),
		new Uint8Array([0xd8, 24]),
	];
	for (const input of complete)
		for (let length = 0; length < input.length; length++)
			rejects(input.subarray(0, length));
});

it("rejects malformed UTF8 including overlong, surrogate and incomplete sequences", () => {
	for (const payload of [
		[0x80],
		[0xc0, 0xaf],
		[0xc1, 0xbf],
		[0xc2],
		[0xe2, 0x82],
		[0xe0, 0x80, 0x80],
		[0xed, 0xa0, 0x80],
		[0xf0, 0x80, 0x80, 0x80],
		[0xf4, 0x90, 0x80, 0x80],
		[0xf5, 0x80, 0x80, 0x80],
		[0xff],
	])
		rejects(join([argument(3, payload.length), new Uint8Array(payload)]));
	const payload = join([
		new Uint8Array(4095).fill(0x61),
		new Uint8Array([0xe2, 0x82]),
	]);
	rejects(join([argument(3, payload.length), payload]));
});

it("classifies indefinite forms, tags, floats and other simple values as unsupported", () => {
	for (const input of [
		[0x5f, 0xff],
		[0x7f, 0xff],
		[0x9f, 0xff],
		[0xbf, 0xff],
		[0xc0, 0],
		[0xd8, 24, 0],
		[0xdb, 0, 0, 0, 1, 0, 0, 0, 0, 0],
		[0xe0],
		[0xf3],
		[0xf7],
		[0xf8, 32],
		[0xf8, 255],
		[0xf9, 0x3c, 0],
		[0xfa, 0x3f, 0x80, 0, 0],
		[0xfb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0],
	])
		rejects(new Uint8Array(input), "unsupported");
});

it("rejects reserved arguments, stray breaks and nonminimal simple values", () => {
	for (let major = 0; major < 8; major++)
		for (const additional of [28, 29, 30])
			rejects(new Uint8Array([(major << 5) | additional]));
	for (const header of [0x1f, 0x3f, 0xdf, 0xff])
		rejects(new Uint8Array([header]));
	for (const simple of [0, 20, 21, 22, 23, 24, 31])
		rejects(new Uint8Array([0xf8, simple]));
	rejects(new Uint8Array([0xd8, 0]));
});

it("rejects trailing data rather than returning a prefix", () => {
	for (const suffix of [0, 0xf6, 0xff]) {
		rejects(new Uint8Array([0, suffix]));
		rejects(join([text("content"), new Uint8Array([suffix])]));
	}
});

it("accepts the exact byte ceiling and rejects one byte beyond it", () => {
	const input = join([
		new Uint8Array([0x82]),
		argument(2, 1_000_000),
		new Uint8Array(1_000_000),
		argument(2, 999_989),
		new Uint8Array(999_989),
	]);
	expect(input.length).toBe(sourceCborLimits.maxBytes);
	expect(decodeSourceCbor(input)).toMatchObject({
		kind: "array",
		start: 0,
		end: input.length,
	});
	rejects(new Uint8Array(sourceCborLimits.maxBytes + 1), "resource-limit");
});

it("bounds array and map container nesting at exactly 64 levels", () => {
	for (const major of [4, 5]) {
		const prefix =
			major === 4 ? new Uint8Array([0x81]) : new Uint8Array([0xa1, 0]);
		const parts = Array.from(
			{ length: sourceCborLimits.maxDepth },
			() => prefix,
		);
		const input = join([...parts, new Uint8Array([0xf6])]);
		expect(decodeSourceCbor(input).end).toBe(input.length);
		rejects(join([prefix, input]), "resource-limit");
		const empty = new Uint8Array([major << 5]);
		expect(decodeSourceCbor(join([...parts.slice(1), empty])).end).toBe(
			(parts.length - 1) * prefix.length + 1,
		);
		rejects(join([...parts, empty]), "resource-limit");
	}
});

it("counts all containers, keys and values toward the value ceiling", () => {
	const prefix = new Uint8Array([0x82]);
	const input = join([prefix, repeatedArray(50_000), repeatedArray(49_997)]);
	expect(arrayItems(decodeSourceCbor(input))).toHaveLength(2);
	rejects(
		join([prefix, repeatedArray(50_000), repeatedArray(49_998)]),
		"resource-limit",
	);
	expect(decodeSourceCbor(integerMap(49_999)).kind).toBe("map");
	rejects(integerMap(50_000), "resource-limit");
});

it("bounds individual byte and UTF8 strings by encoded bytes", () => {
	for (const major of [2, 3]) {
		const payload = new Uint8Array(sourceCborLimits.maxStringBytes).fill(0x61);
		const input = join([argument(major, payload.length), payload]);
		const result = decodeSourceCbor(input);
		if (result.kind !== "bytes" && result.kind !== "text")
			throw new Error("Expected string fixture");
		expect(result.value.length).toBe(sourceCborLimits.maxStringBytes);
		rejects(
			argument(major, sourceCborLimits.maxStringBytes + 1),
			"resource-limit",
		);
	}
	rejects(text("界".repeat(333_334)), "resource-limit");
});

it("enforces entry ceilings on arrays and maps before allocating children", () => {
	expect(arrayItems(decodeSourceCbor(repeatedArray(50_000)))).toHaveLength(
		50_000,
	);
	for (const major of [4, 5])
		rejects(argument(major, 50_001), "resource-limit");
});

it("rejects hostile, forged, proxy and non-byte inputs without property hooks", () => {
	const hook = vi.fn(() => {
		throw new Error("Unexpected proxy hook");
	});
	const revoked = Proxy.revocable(new Uint8Array([0]), {});
	revoked.revoke();
	for (const input of [
		undefined,
		null,
		false,
		0,
		"bytes",
		[],
		{},
		new ArrayBuffer(1),
		new Uint16Array([0]),
		new Int8Array([0]),
		new Uint8ClampedArray([0]),
		new DataView(new ArrayBuffer(1)),
		Object.create(Uint8Array.prototype),
		{ [Symbol.toStringTag]: "Uint8Array" },
		new Proxy(new Uint8Array([0]), { get: hook }),
		revoked.proxy,
	])
		rejects(input);
	expect(hook).not.toHaveBeenCalled();
});

it("rejects shared, detached, empty and out-of-bounds byte storage", () => {
	rejects(new Uint8Array(new SharedArrayBuffer(1)));
	rejects(new Uint8Array());
	const buffer = new ArrayBuffer(1);
	const detached = new Uint8Array(buffer);
	structuredClone(buffer, { transfer: [buffer] });
	rejects(detached);
	type ResizableBuffer = ArrayBuffer & { resize(length: number): void };
	const ResizableArrayBuffer = ArrayBuffer as unknown as new (
		length: number,
		options: { maxByteLength: number },
	) => ResizableBuffer;
	const resizable = new ResizableArrayBuffer(16, { maxByteLength: 32 });
	const outOfBounds = new Uint8Array(resizable, 8, 4);
	resizable.resize(4);
	rejects(outOfBounds);
	const valid = new Uint8Array(resizable, 1, 1);
	expect(decodeSourceCbor(valid)).toEqual({
		kind: "unsigned",
		value: 0n,
		start: 0,
		end: 1,
	});
});

it("rejects null, array and primitive options and non-function checkpoints", () => {
	for (const options of [null, [], false, 0, "options", () => undefined])
		rejects(new Uint8Array([0]), "invalid-input", options);
	for (const checkpoint of [null, false, 0, "callback", {}, []])
		rejects(new Uint8Array([0]), "invalid-input", { checkpoint });
	for (const options of [undefined, {}, { checkpoint: undefined }])
		expect(decodeSourceCbor(new Uint8Array([0]), options).kind).toBe(
			"unsigned",
		);
});

it("normalizes throwing option access and revoked options into invalid input", () => {
	const hook = () => {
		throw new Error("PRIVATE_OPTION_DATA");
	};
	const options = Object.defineProperty({}, "checkpoint", { get: hook });
	rejects(new Uint8Array([0]), "invalid-input", options);
	rejects(new Uint8Array([0]), "invalid-input", new Proxy({}, { get: hook }));
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	rejects(new Uint8Array([0]), "invalid-input", revoked.proxy);
});

it("validates options before decoding or invoking a checkpoint", () => {
	rejects(new Uint8Array(sourceCborLimits.maxBytes + 1), "invalid-input", {
		checkpoint: 1,
	});
	const checkpoint = vi.fn();
	rejects(new Uint8Array(), "invalid-input", { checkpoint });
	expect(checkpoint).not.toHaveBeenCalled();
});

it("runs an initial checkpoint and propagates its exact thrown value", () => {
	const checkpoint = vi.fn();
	decodeSourceCbor(new Uint8Array([0]), { checkpoint });
	expect(checkpoint).toHaveBeenCalledTimes(1);
	for (const cancellation of [
		new Error("cancelled"),
		Symbol("cancelled"),
		undefined,
	]) {
		let caught = false;
		try {
			decodeSourceCbor(new Uint8Array([0xff]), {
				checkpoint: () => {
					throw cancellation;
				},
			});
		} catch (error) {
			caught = true;
			expect(error).toBe(cancellation);
		}
		expect(caught).toBe(true);
	}
});

it("checkpoints bounded byte work even for a single large string", () => {
	for (const major of [2, 3]) {
		const checkpoint = vi.fn();
		const input = join([
			argument(major, 20_000),
			new Uint8Array(20_000).fill(0x61),
		]);
		decodeSourceCbor(input, { checkpoint });
		expect(checkpoint.mock.calls.length).toBeGreaterThanOrEqual(5);
		expect(checkpoint.mock.calls.length).toBeLessThan(20);
	}
});

it("checkpoints bounded value work for many tiny nodes", () => {
	const checkpoint = vi.fn();
	decodeSourceCbor(repeatedArray(1024), { checkpoint });
	expect(checkpoint.mock.calls.length).toBeGreaterThanOrEqual(5);
	expect(checkpoint.mock.calls.length).toBeLessThan(20);
});

it("propagates cancellation from every checkpoint including binary map key work", () => {
	const payload = new Uint8Array(9000).fill(0x61);
	const input = join([
		new Uint8Array([0x82, 0xa1]),
		argument(2, payload.length),
		payload,
		text("界".repeat(3000)),
		repeatedArray(512),
	]);
	const checkpoint = vi.fn();
	decodeSourceCbor(input, { checkpoint });
	expect(checkpoint.mock.calls.length).toBeGreaterThanOrEqual(9);
	for (let target = 1; target <= checkpoint.mock.calls.length; target++) {
		const cancellation = new Error(`cancel ${target}`);
		let calls = 0;
		let caught: unknown;
		try {
			decodeSourceCbor(input, {
				checkpoint: () => {
					if (++calls === target) throw cancellation;
				},
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(cancellation);
		expect(calls).toBe(target);
	}
});

it("snapshots caller bytes before checkpoints can mutate or detach them", () => {
	const input = text("😀".repeat(3000));
	const expected = decodeSourceCbor(input);
	let calls = 0;
	const result = decodeSourceCbor(input, {
		checkpoint: () => {
			if (++calls === 1) {
				input.fill(255);
				structuredClone(input.buffer, { transfer: [input.buffer] });
			}
		},
	});
	expect(calls).toBeGreaterThan(1);
	expect(result).toEqual(expected);
});

it("isolates streaming UTF8 state from reentrant checkpoint decodes", () => {
	const value = `${"x".repeat(4095)}😀${"界".repeat(2000)}`;
	const checkpoint = vi.fn(() => {
		expect(decodeSourceCbor(text("\uFEFFnested😀"))).toMatchObject({
			value: "\uFEFFnested😀",
		});
	});
	expect(decodeSourceCbor(text(value), { checkpoint })).toMatchObject({
		value,
	});
	expect(checkpoint.mock.calls.length).toBeGreaterThan(2);
});

it("decodes six-element metadata-shaped tuples beyond the CTAP byte ceiling", () => {
	for (const length of [8192, 16_384]) {
		const fields = [
			text("synthetic-v1"),
			join([new Uint8Array([0x81, 0x82]), text("page-hash"), argument(0, 123)]),
			join([new Uint8Array([0x81, 0x82]), text("word-hash"), argument(0, 456)]),
			join([new Uint8Array([0xa1]), text("language"), text("en")]),
			new Uint8Array([0x80]),
			join([argument(2, length), new Uint8Array(length).fill(0xa5)]),
		];
		const input = join([new Uint8Array([0x86]), ...fields]);
		expect(input.length).toBeGreaterThan(7609);
		const result = decodeSourceCbor(input);
		const items = arrayItems(result);
		expect(items).toHaveLength(6);
		expect(result).toMatchObject({ start: 0, end: input.length });
		let offset = 1;
		for (const [index, field] of fields.entries()) {
			expect(items[index]).toMatchObject({
				start: offset,
				end: offset + field.length,
			});
			offset += field.length;
		}
		expect(items[5]).toMatchObject({
			kind: "bytes",
			value: new Uint8Array(length).fill(0xa5),
		});
	}
});

it("rejects huge announced lengths without rounding or proportional allocation", () => {
	for (const major of [2, 3, 4, 5])
		for (const length of [
			4294967296n,
			9007199254740993n,
			18446744073709551615n,
		])
			rejects(argument(major, length), "resource-limit");
});

it("rejects container map keys without accepting composite identities", () => {
	for (const key of [new Uint8Array([0x80]), new Uint8Array([0xa0])])
		rejects(
			join([new Uint8Array([0xa1]), key, new Uint8Array([0])]),
			"unsupported",
		);
});

it("accepts shortest extended lengths for every supported container and string", () => {
	for (const count of [24, 255, 256, 65535, 65536]) {
		for (const major of [2, 3]) {
			const input = join([
				argument(major, count),
				new Uint8Array(count).fill(0x61),
			]);
			expect(decodeSourceCbor(input).end).toBe(input.length);
		}
		if (count <= 256) {
			expect(arrayItems(decodeSourceCbor(repeatedArray(count)))).toHaveLength(
				count,
			);
			const result = decodeSourceCbor(integerMap(count));
			if (result.kind !== "map") throw new Error("Expected map fixture");
			expect(result.entries).toHaveLength(count);
		}
	}
});
