import { afterEach, expect, it, vi } from "vitest";
import * as ctapCbor from "./ctap-cbor.js";
import type { CtapCborValue } from "./ctap-cbor.js";
import {
	type CtapAssertionResponse,
	type CtapGetAssertionResult,
	decodeCtapGetAssertionResponse,
} from "./ctap-get-assertion-response.js";
import { AgentBrowserError } from "./errors.js";

const hashWire = [
	0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
	0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
	0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
];
const counterWire = [0x12, 0x34, 0x56, 0x78];
const signatureWire = [0x30, 0x01, 0x7f];
const descriptorWire = [
	0xa2, 0x62, 0x69, 0x64, 0x42, 0x07, 0x08, 0x64, 0x74, 0x79, 0x70, 0x65, 0x6a,
	0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0x2d, 0x6b, 0x65, 0x79,
];
const userWire = [
	0xa4, 0x62, 0x69, 0x64, 0x42, 0x91, 0x92, 0x64, 0x69, 0x63, 0x6f, 0x6e, 0x61,
	0x78, 0x64, 0x6e, 0x61, 0x6d, 0x65, 0x63, 0x41, 0x64, 0x61, 0x6b, 0x64, 0x69,
	0x73, 0x70, 0x6c, 0x61, 0x79, 0x4e, 0x61, 0x6d, 0x65, 0x63, 0x41, 0x64, 0x61,
];
const golden = new Uint8Array([
	0x00,
	0xa5,
	0x01,
	...descriptorWire,
	0x02,
	0x58,
	0x25,
	...hashWire,
	0x05,
	...counterWire,
	0x03,
	0x43,
	...signatureWire,
	0x04,
	...userWire,
	0x05,
	0x02,
]);

afterEach(() => {
	vi.restoreAllMocks();
});

function header(major: number, length: number): number[] {
	if (length < 24) return [major | length];
	if (length < 256) return [major | 24, length];
	return [major | 25, length >>> 8, length & 0xff];
}

function bytes(value: readonly number[] | Uint8Array): number[] {
	return [...header(0x40, value.length), ...value];
}

function text(value: string): number[] {
	const encoded = new TextEncoder().encode(value);
	return [...header(0x60, encoded.length), ...encoded];
}

function map(...entries: readonly (readonly number[])[]): number[] {
	return [...header(0xa0, entries.length), ...entries.flat()];
}

function packet(status: number, body: readonly number[] = []): Uint8Array {
	return new Uint8Array([status, ...body]);
}

function authData(flags = 0, tail: readonly number[] = []): number[] {
	return [...hashWire, flags, ...counterWire, ...tail];
}

function requiredFields(flags = 0, tail: readonly number[] = []): number[][] {
	return [
		[2, ...bytes(authData(flags, tail))],
		[3, ...bytes(signatureWire)],
	];
}

function reply(
	flags = 0,
	extras: readonly (readonly number[])[] = [],
	tail: readonly number[] = [],
): Uint8Array {
	return packet(0, map(...requiredFields(flags, tail), ...extras));
}

function assertion(input: Uint8Array): CtapAssertionResponse {
	const result: CtapGetAssertionResult = decodeCtapGetAssertionResponse(input);
	expect(result.kind).toBe("assertion");
	if (result.kind !== "assertion")
		throw new Error("Expected synthetic assertion");
	return result.assertion;
}

function rejects(
	input: unknown,
	code: "invalid-input" | "resource-limit" = "invalid-input",
): AgentBrowserError {
	let caught: unknown;
	try {
		decodeCtapGetAssertionResponse(input as Uint8Array);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ name: "AgentBrowserError", code });
	expect((caught as Error).message).not.toContain("SYNTHETIC_PRIVATE");
	expect((caught as Error).cause).toBeUndefined();
	expect(caught).not.toHaveProperty("path");
	return caught as AgentBrowserError;
}

function treeBuffers(value: CtapCborValue): Uint8Array[] {
	if (value.kind === "bytes") return [value.value];
	if (value.kind === "float") return [value.encoding];
	if (value.kind === "array") return value.items.flatMap(treeBuffers);
	if (value.kind === "map")
		return value.entries.flatMap(([key, item]) => [
			...treeBuffers(key),
			...treeBuffers(item),
		]);
	return [];
}

it("decodes an independent exact-wire golden without inventing fields", () => {
	const expected: CtapAssertionResponse = {
		authenticatorData: new Uint8Array([...hashWire, 5, ...counterWire]),
		signature: new Uint8Array(signatureWire),
		credentialId: new Uint8Array([7, 8]),
		user: {
			id: new Uint8Array([0x91, 0x92]),
			icon: "x",
			name: "Ada",
			displayName: "Ada",
		},
		numberOfCredentials: 2n,
	};
	expect(decodeCtapGetAssertionResponse(golden)).toEqual({
		kind: "assertion",
		assertion: expected,
	});
});

it("returns only required fields when optional credential, user and count are absent", () => {
	expect(assertion(reply())).toEqual({
		authenticatorData: new Uint8Array(authData()),
		signature: new Uint8Array(signatureWire),
	});
});

it.each([1, 0x2e, 0x7f, 0xff])(
	"accepts status %i alone or with a canonical map without interpreting its fields",
	(status) => {
		for (const body of [[], [0xa0], map([2, 0xf6], [3, 0x00])])
			expect(decodeCtapGetAssertionResponse(packet(status, body))).toEqual({
				kind: "ctap-error",
				status,
			});
	},
);

const malformedBodies = [
	{ name: "scalar", wire: [0x01] },
	{ name: "array", wire: [0x80] },
	{ name: "truncated map", wire: [0xa1, 0x01] },
	{ name: "indefinite map", wire: [0xbf, 0xff] },
	{ name: "nonminimal map length", wire: [0xb8, 0x00] },
	{ name: "trailing item", wire: [0xa0, 0x00] },
	{ name: "reordered keys", wire: [0xa2, 0x02, 0x00, 0x01, 0x00] },
	{ name: "duplicate keys", wire: [0xa2, 0x01, 0x00, 0x01, 0x01] },
	{
		name: "duplicate numeric equivalents",
		wire: [0xa2, 0x01, 0x00, 0xf9, 0x3c, 0x00, 0x01],
	},
	{ name: "truncated unknown bytes", wire: [0xa1, 0x06, 0x42, 0x01] },
	{ name: "nonminimal unknown bytes", wire: [0xa1, 0x06, 0x58, 0x01, 0x00] },
	{ name: "invalid unknown UTF-8", wire: [0xa1, 0x06, 0x61, 0xff] },
	{ name: "tagged unknown value", wire: [0xa1, 0x06, 0xc0, 0x00] },
	{ name: "complex unknown key", wire: [0xa1, 0x80, 0x01] },
];

it.each(malformedBodies)(
	"rejects $name even on a nonzero-status body",
	({ wire }) => {
		for (const status of [0, 0xee]) rejects(packet(status, wire));
	},
);

it.each([0, 0xee])("enforces decoder depth limits for status %i", (status) => {
	rejects(
		packet(status, [0xa1, 0x06, 0x81, 0x81, 0x81, 0x81, 0x80]),
		"resource-limit",
	);
});

it("rejects missing success fields and an absent success body", () => {
	const fields = requiredFields();
	for (const body of [[], map(), map(fields[0]), map(fields[1])])
		rejects(packet(0, body));
});

it.each([
	{ name: "integer", wire: [0] },
	{ name: "text", wire: [0x60] },
	{ name: "array", wire: [0x80] },
	{ name: "map", wire: [0xa0] },
	{ name: "null", wire: [0xf6] },
	{ name: "empty bytes", wire: [0x40] },
])("rejects $name for each required byte-string field", ({ wire }) => {
	rejects(packet(0, map([2, ...wire], [3, ...bytes(signatureWire)])));
	rejects(packet(0, map([2, ...bytes(authData())], [3, ...wire])));
});

it.each([1, 32, 36])(
	"rejects short authenticator data of %i bytes",
	(length) => {
		rejects(
			packet(0, map([2, ...bytes(new Uint8Array(length))], [3, 0x41, 1])),
		);
	},
);

it("recognizes all five known fields through integral float keys", () => {
	const wire = packet(
		0,
		map(
			[0xf9, 0x3c, 0x00, ...descriptorWire],
			[0xf9, 0x40, 0x00, ...bytes(authData(5))],
			[0xf9, 0x42, 0x00, ...bytes(signatureWire)],
			[0xf9, 0x44, 0x00, ...userWire],
			[0xf9, 0x45, 0x00, 0x02],
		),
	);
	expect(assertion(wire)).toEqual(assertion(golden));
});

it.each([
	{ name: "binary32", key: [0xfa, 0x40, 0x00, 0x00, 0x00] },
	{
		name: "binary64",
		key: [0xfb, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
	},
])("recognizes an integral $name key after integer keys", ({ key }) => {
	const wire = packet(
		0,
		map([3, ...bytes(signatureWire)], [...key, ...bytes(authData())]),
	);
	expect(assertion(wire)).toEqual(assertion(reply()));
});

it("does not treat text or fractional numeric keys as required fields", () => {
	for (const key of [text("2"), [0xf9, 0x3e, 0x00]])
		rejects(
			packet(
				0,
				map([3, ...bytes(signatureWire)], [...key, ...bytes(authData())]),
			),
		);
});

it("ignores unknown root, descriptor and user fields without returning them", () => {
	const descriptor = map(
		[...text("id"), ...bytes([7, 8])],
		[...text("type"), ...text("public-key")],
		[...text("transports"), 0x81, ...text("usb")],
	);
	const user = map(
		[...text("id"), ...bytes([9])],
		[...text("unknown"), ...bytes([0xaa])],
	);
	const wire = packet(
		0,
		map(
			[1, ...descriptor],
			...requiredFields(),
			[4, ...user],
			[6, ...map([0x41, 0xbb, 0x82, 0x41, 0xcc, 0xf9, 0x3e, 0x00])],
			[0x20, 0x41, 0xdd],
			[0x41, 0xee, 0x00],
			[...text("x"), 0x00],
			[0xf4, 0x00],
			[0xf9, 0x3e, 0x00, 0x00],
		),
	);
	expect(assertion(wire)).toEqual({
		authenticatorData: new Uint8Array(authData()),
		signature: new Uint8Array(signatureWire),
		credentialId: new Uint8Array([7, 8]),
		user: { id: new Uint8Array([9]) },
	});
});

const invalidDescriptors = [
	{ name: "non-map", wire: [0x80] },
	{ name: "empty map", wire: [0xa0] },
	{ name: "missing type", wire: map([...text("id"), ...bytes([1])]) },
	{ name: "missing ID", wire: map([...text("type"), ...text("public-key")]) },
	{
		name: "unsupported type",
		wire: map(
			[...text("id"), ...bytes([1])],
			[...text("type"), ...text("password")],
		),
	},
	{
		name: "nontext type",
		wire: map([...text("id"), ...bytes([1])], [...text("type"), 0x00]),
	},
	{
		name: "nonbyte ID",
		wire: map(
			[...text("id"), ...text("id")],
			[...text("type"), ...text("public-key")],
		),
	},
	{
		name: "empty ID",
		wire: map([...text("id"), 0x40], [...text("type"), ...text("public-key")]),
	},
];

it.each(invalidDescriptors)("rejects descriptor $name", ({ wire }) => {
	rejects(packet(0, map([1, ...wire], ...requiredFields())));
});

it.each([1, 1023])("accepts the local credential-ID boundary %i", (length) => {
	const identifier = new Uint8Array(length).fill(0x91);
	const descriptor = map(
		[...text("id"), ...bytes(identifier)],
		[...text("type"), ...text("public-key")],
	);
	const result = assertion(
		packet(0, map([1, ...descriptor], ...requiredFields())),
	);
	expect(result.credentialId).toEqual(identifier);
});

it("rejects credential IDs beyond the local 1023-byte cap", () => {
	const descriptor = map(
		[...text("id"), ...bytes(new Uint8Array(1024))],
		[...text("type"), ...text("public-key")],
	);
	rejects(
		packet(0, map([1, ...descriptor], ...requiredFields())),
		"resource-limit",
	);
});

it.each([
	{ name: "non-map", wire: [0x80] },
	{ name: "missing ID", wire: [0xa0] },
	{ name: "text ID", wire: map([...text("id"), ...text("id")]) },
	{ name: "empty ID", wire: map([...text("id"), 0x40]) },
])("rejects user $name without a fallback", ({ wire }) => {
	rejects(reply(4, [[4, ...wire]]));
});

it.each([1, 64])(
	"accepts the local user-ID boundary %i without requiring UV",
	(length) => {
		const identifier = new Uint8Array(length).fill(0x92);
		const user = map([...text("id"), ...bytes(identifier)]);
		expect(assertion(reply(0, [[4, ...user]])).user).toEqual({
			id: identifier,
		});
	},
);

it("rejects user IDs beyond the local 64-byte cap", () => {
	const user = map([...text("id"), ...bytes(new Uint8Array(65))]);
	rejects(reply(0, [[4, ...user]]), "resource-limit");
});

it.each(["name", "displayName", "icon"])(
	"rejects presence of user %s without UV even when empty",
	(name) => {
		for (const flags of [0, 1, 8, 24]) {
			for (const value of ["", "SYNTHETIC_PRIVATE"]) {
				const user = map(
					[...text("id"), ...bytes([1])],
					[...text(name), ...text(value)],
				);
				rejects(reply(flags, [[4, ...user]]));
			}
		}
	},
);

it.each([
	{ name: "name", maximum: 256 },
	{ name: "displayName", maximum: 256 },
	{ name: "icon", maximum: 2048 },
])("bounds UV-gated $name in UTF-16 units, not bytes", ({ name, maximum }) => {
	for (const value of ["", "x".repeat(maximum), "😀".repeat(maximum / 2)]) {
		const user = map(
			[...text("id"), ...bytes([1])],
			[...text(name), ...text(value)],
		);
		expect(assertion(reply(4, [[4, ...user]])).user).toEqual({
			id: new Uint8Array([1]),
			[name]: value,
		});
	}
	for (const value of ["x".repeat(maximum + 1), "😀".repeat(maximum / 2 + 1)]) {
		const user = map(
			[...text("id"), ...bytes([1])],
			[...text(name), ...text(value)],
		);
		rejects(reply(4, [[4, ...user]]), "resource-limit");
	}
});

it.each(["name", "displayName", "icon"])(
	"requires text for user %s even with UV",
	(name) => {
		for (const value of [[0xf6], [0x00], bytes([1]), [0x80]]) {
			const user = map(
				[...text("id"), ...bytes([1])],
				[...text(name), ...value],
			);
			rejects(reply(4, [[4, ...user]]));
		}
	},
);

it.each([0, 1, 4, 5, 8, 9, 12, 13, 24, 25, 28, 29, 2, 32, 34])(
	"preserves flags %i without requiring UP/UV or interpreting RFU bits as trust",
	(flags) => {
		expect(assertion(reply(flags))).toEqual({
			authenticatorData: new Uint8Array(authData(flags)),
			signature: new Uint8Array(signatureWire),
		});
	},
);

it.each([
	{ flags: 0x40, tail: [] },
	{ flags: 0x40, tail: [0xa0] },
	{ flags: 0xc0, tail: [] },
	{ flags: 0xc0, tail: [0xa0] },
	{ flags: 0x00, tail: [0x00] },
	{ flags: 0x01, tail: [0xa0, 0x00] },
	{ flags: 0x80, tail: [] },
])("rejects assertion AT/ED inconsistency %#", ({ flags, tail }) => {
	rejects(reply(flags, [], tail));
});

it.each([0x10, 0x11, 0x14, 0x15, 0x90])(
	"rejects BS without BE for flags %i",
	(flags) => {
		rejects(reply(flags, [], flags & 128 ? [0xa0] : []));
	},
);

it.each([0x80, 0x81, 0x84, 0x98])(
	"preserves opaque ED tails and counter bytes for flags %i",
	(flags) => {
		for (const tail of [[0xa0], [0xa1, 0x61, 0x78, 0xf5], [0xff]]) {
			const decoded = assertion(reply(flags, [], tail));
			expect(decoded.authenticatorData).toEqual(
				new Uint8Array(authData(flags, tail)),
			);
			expect(new DataView(decoded.authenticatorData.buffer).getUint32(33)).toBe(
				0x12345678,
			);
		}
	},
);

it.each([
	{ count: 1n, wire: [0x01] },
	{ count: 64n, wire: [0x18, 0x40] },
	{ count: 65n, wire: [0x18, 0x41] },
	{
		count: 9007199254740993n,
		wire: [0x1b, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01],
	},
	{
		count: 18446744073709551615n,
		wire: [0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
	},
])(
	"preserves unsigned credential count $count without a collector cap",
	({ count, wire }) => {
		expect(assertion(reply(0, [[5, ...wire]])).numberOfCredentials).toBe(count);
	},
);

it.each([
	{ name: "zero", wire: [0x00] },
	{ name: "negative", wire: [0x20] },
	{ name: "integral float", wire: [0xf9, 0x3c, 0x00] },
	{ name: "text", wire: [0x61, 0x31] },
	{ name: "boolean", wire: [0xf5] },
	{ name: "null", wire: [0xf6] },
])("rejects $name count as unusable protocol data", ({ wire }) => {
	rejects(reply(0, [[5, ...wire]]));
});

it("counts the status byte in the exact 7609-byte message cap", () => {
	const exact = reply(0, [[6, ...bytes(new Uint8Array(7558))]]);
	expect(exact).toHaveLength(7609);
	expect(assertion(exact).signature).toEqual(new Uint8Array(signatureWire));
	const excessive = reply(0, [[6, ...bytes(new Uint8Array(7559))]]);
	expect(excessive).toHaveLength(7610);
	rejects(excessive, "resource-limit");
	excessive[0] = 0xee;
	rejects(excessive, "resource-limit");
});

it("returns distinct owned buffers from an offset caller view", () => {
	const backing = new Uint8Array([0xee, ...golden, 0xff]);
	const input = backing.subarray(1, 1 + golden.length);
	const first = assertion(input);
	const second = assertion(input);
	expect(backing).toEqual(new Uint8Array([0xee, ...golden, 0xff]));
	const firstBuffers = [
		first.authenticatorData,
		first.signature,
		first.credentialId,
		first.user?.id,
	];
	const secondBuffers = [
		second.authenticatorData,
		second.signature,
		second.credentialId,
		second.user?.id,
	];
	expect(new Set(firstBuffers.map((value) => value?.buffer)).size).toBe(4);
	for (const [index, value] of firstBuffers.entries()) {
		if (value === undefined) throw new Error("Missing synthetic buffer");
		expect(value.buffer).not.toBe(backing.buffer);
		expect(value.buffer).not.toBe(secondBuffers[index]?.buffer);
		value.fill(0);
	}
	expect(input).toEqual(golden);
	expect(second).toEqual(assertion(golden));
	backing.fill(0);
	expect(second).toEqual(assertion(golden));
});

it("ignores caller byte slot, iterator and slice overrides", () => {
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	const input = golden.slice();
	for (const property of [
		"length",
		"byteLength",
		"byteOffset",
		"buffer",
		"constructor",
		"slice",
		"subarray",
		Symbol.iterator,
		Symbol.toStringTag,
	])
		Object.defineProperty(input, property, { get: hook });
	expect(assertion(input)).toEqual(assertion(golden));
	expect(hook).not.toHaveBeenCalled();
});

it("rejects non-Uint8Array, shared, detached and proxy input without caller hooks", () => {
	const buffer = new ArrayBuffer(2);
	const detached = new Uint8Array(buffer);
	structuredClone(buffer, { transfer: [buffer] });
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	const proxy = new Proxy(golden, { get: hook, getPrototypeOf: hook });
	for (const input of [
		null,
		undefined,
		[],
		{},
		new Uint8Array(0),
		golden.buffer,
		new DataView(golden.buffer),
		new Int8Array(golden.length),
		new Uint8ClampedArray(golden.length),
		new Uint8Array(new SharedArrayBuffer(golden.length)),
		detached,
		proxy,
	])
		rejects(input);
	expect(hook).not.toHaveBeenCalled();
});

it.each(["success", "ctap-error", "late-field-error", "late-local-limit"])(
	"wipes returned decoder trees including ignored bytes and float keys on %s",
	(outcome) => {
		const copied = vi.spyOn(ctapCbor, "copyCtapBytes");
		const decoded = vi.spyOn(ctapCbor, "decodeCtapCbor");
		const nested = map([0x41, 0xaa, 0x82, 0x41, 0xbb, 0xf9, 0x3e, 0x00]);
		const user =
			outcome === "late-local-limit"
				? map(
						[...text("id"), ...bytes([0x91, 0x92])],
						[...text("name"), ...text("x".repeat(257))],
					)
				: userWire;
		const input = packet(
			outcome === "ctap-error" ? 0xee : 0,
			map(
				[1, ...descriptorWire],
				...requiredFields(5),
				[4, ...user],
				[5, outcome === "late-field-error" ? 0x00 : 0x02],
				[6, ...nested],
				[0xf9, 0x3e, 0x00, 0x41, 0xcc],
			),
		);
		const original = input.slice();
		if (outcome === "late-field-error") rejects(input);
		else if (outcome === "late-local-limit") rejects(input, "resource-limit");
		else if (outcome === "ctap-error")
			expect(decodeCtapGetAssertionResponse(input)).toEqual({
				kind: "ctap-error",
				status: 0xee,
			});
		else {
			const result = assertion(input);
			expect(result.authenticatorData).toEqual(new Uint8Array(authData(5)));
			expect(result.signature).toEqual(new Uint8Array(signatureWire));
		}
		const tree = decoded.mock.results[0];
		expect(tree.type).toBe("return");
		if (tree.type !== "return") throw new Error("Expected synthetic tree");
		const buffers = treeBuffers(tree.value);
		expect(buffers.length).toBeGreaterThanOrEqual(9);
		for (const value of buffers)
			expect(value).toEqual(new Uint8Array(value.length));
		const copies = copied.mock.results.filter(
			(result) => result.type === "return",
		);
		expect(copies[0].value).toEqual(new Uint8Array(input.length));
		if (outcome !== "success") {
			for (const copy of copies)
				expect(copy.value).toEqual(new Uint8Array(copy.value.length));
		}
		if (outcome.startsWith("late-"))
			expect(copies.length).toBeGreaterThanOrEqual(5);
		expect(input).toEqual(original);
	},
);

it.each([
	{ wire: [0] },
	{ wire: [0, 0xa1, 0x01] },
	{ wire: [0, 0x81, 0x41, 0xaa] },
	{ wire: [0xee] },
	{ wire: [0xee, 0xa1, 0x01] },
])("wipes the owned input on early outcomes %#", ({ wire }) => {
	const copied = vi.spyOn(ctapCbor, "copyCtapBytes");
	const input = new Uint8Array(wire);
	if (wire.length === 1 && wire[0] !== 0)
		expect(decodeCtapGetAssertionResponse(input)).toEqual({
			kind: "ctap-error",
			status: wire[0],
		});
	else rejects(input);
	const owned = copied.mock.results[0];
	expect(owned.type).toBe("return");
	expect(owned.value).toEqual(new Uint8Array(input.length));
	expect(input).toEqual(new Uint8Array(wire));
});

it.each([
	{ error: new Error("SYNTHETIC_PRIVATE"), code: "invalid-input" as const },
	{
		error: new AgentBrowserError("unsupported", "SYNTHETIC_PRIVATE"),
		code: "invalid-input" as const,
	},
	{
		error: new AgentBrowserError("resource-limit", "SYNTHETIC_PRIVATE"),
		code: "resource-limit" as const,
	},
])("redacts decoder failures into fresh fixed errors %#", ({ error, code }) => {
	const expected =
		code === "resource-limit"
			? rejects(new Uint8Array(7610), code)
			: rejects(packet(0));
	vi.spyOn(ctapCbor, "decodeCtapCbor").mockImplementation(() => {
		throw error;
	});
	const first = rejects(reply(), code);
	const second = rejects(reply(), code);
	expect(first).not.toBe(error);
	expect(second).not.toBe(first);
	expect(first.message).toBe(expected.message);
	expect(second.message).toBe(expected.message);
});
