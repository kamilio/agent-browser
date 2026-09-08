import { expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { projectNoneAttestationObject } from "./passkey-none-attestation.js";

type Wire = readonly number[];
type RejectionCode = "invalid-input" | "unsupported" | "resource-limit";

const privateSentinel = "SYNTHETIC_PRIVATE_NONE";
const messages: Record<RejectionCode, string> = {
	"invalid-input": "Invalid none attestation object",
	unsupported: "Unsupported none attestation object",
	"resource-limit": "None attestation object exceeds limits",
};
const rpHash = Array.from({ length: 32 }, (_value, index) => index + 1);
const nonzeroAaguid = Array.from(
	{ length: 16 },
	(_value, index) => 0x80 + index,
);
const credentialId = [0x91, 0x92, 0x93];

function lengthWire(major: number, length: number): number[] {
	if (!Number.isInteger(length) || length < 0 || length > 7610)
		throw new Error("Unbounded synthetic wire length");
	if (length < 24) return [(major << 5) | length];
	if (length < 256) return [(major << 5) | 24, length];
	return [(major << 5) | 25, length >>> 8, length & 0xff];
}

function bytesWire(value: Wire): number[] {
	return [...lengthWire(2, value.length), ...value];
}

function textWire(value: string): number[] {
	const encoded = new TextEncoder().encode(value);
	return [...lengthWire(3, encoded.length), ...encoded];
}

function mapWire(entries: readonly (readonly [Wire, Wire])[]): number[] {
	if (entries.length > 23) throw new Error("Too many synthetic map fields");
	return [
		0xa0 | entries.length,
		...entries.flatMap(([key, value]) => [...key, ...value]),
	];
}

function ec2Key({
	algorithm = [0x26],
	curve = 1,
	width = 32,
	compressed = false,
}: {
	algorithm?: Wire;
	curve?: number;
	width?: number;
	compressed?: boolean;
} = {}): number[] {
	const coordinate = Array.from(
		{ length: width },
		(_value, index) => index + 1,
	);
	return mapWire([
		[[0x01], [0x02]],
		[[0x03], algorithm],
		[[0x20], [curve]],
		[[0x21], bytesWire(coordinate)],
		[
			[0x22],
			compressed ? [0xf5] : bytesWire(coordinate.map((value) => value + 0x40)),
		],
	]);
}

function okpKey(curve: number, width: number): number[] {
	return mapWire([
		[[0x01], [0x01]],
		[[0x03], [0x27]],
		[[0x20], [curve]],
		[
			[0x21],
			bytesWire(Array.from({ length: width }, (_value, index) => index + 1)),
		],
	]);
}

function rsaKey(): number[] {
	return mapWire([
		[[0x01], [0x03]],
		[[0x03], [0x39, 0x01, 0x00]],
		[[0x20], bytesWire([0x80, ...Array.from({ length: 255 }, () => 0x51)])],
		[[0x21], bytesWire([0x01, 0x00, 0x01])],
	]);
}

function registration({
	flags = 0x40,
	aaguid = Array.from({ length: 16 }, () => 0),
	identifier = credentialId,
	declaredLength = identifier.length,
	key = ec2Key(),
	tail = [],
}: {
	flags?: number;
	aaguid?: Wire;
	identifier?: Wire;
	declaredLength?: number;
	key?: Wire;
	tail?: Wire;
} = {}): Uint8Array {
	return new Uint8Array([
		...rpHash,
		flags,
		0x12,
		0x34,
		0x56,
		0x78,
		...aaguid,
		declaredLength >>> 8,
		declaredLength & 0xff,
		...identifier,
		...key,
		...tail,
	]);
}

function selfStatement(
	algorithm: Wire = [0x26],
	signature: Wire = bytesWire([0x51]),
): number[] {
	return mapWire([
		[textWire("alg"), algorithm],
		[textWire("sig"), signature],
	]);
}

function envelope({
	format = "packed",
	authData = registration(),
	statement = selfStatement(),
}: {
	format?: string;
	authData?: Uint8Array;
	statement?: Wire;
} = {}): Uint8Array {
	return new Uint8Array(
		mapWire([
			[textWire("fmt"), textWire(format)],
			[textWire("attStmt"), statement],
			[textWire("authData"), bytesWire([...authData])],
		]),
	);
}

function rejects(
	input: unknown,
	code: RejectionCode = "invalid-input",
): AgentBrowserError {
	let caught: unknown;
	try {
		projectNoneAttestationObject(input as Uint8Array);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected synthetic none-attestation rejection");
	expect(caught.name).toBe("AgentBrowserError");
	expect(caught.code).toBe(code);
	expect(caught.message).toBe(messages[code]);
	expect(caught.message).not.toContain(privateSentinel);
	expect(caught.cause).toBeUndefined();
	expect(caught).not.toHaveProperty("path");
	expect(JSON.stringify(caught)).not.toContain(privateSentinel);
	return caught;
}

function retains(input: Uint8Array): Uint8Array {
	const expected = input.slice();
	const output = projectNoneAttestationObject(input);
	expect(output).toBeInstanceOf(Uint8Array);
	expect(output).toEqual(expected);
	expect(input).toEqual(expected);
	expect(output).not.toBe(input);
	expect(output.buffer).not.toBe(input.buffer);
	return output;
}

function rewrites(input: Uint8Array, authData: Uint8Array): Uint8Array {
	const original = input.slice();
	const expected = envelope({ format: "none", authData, statement: [0xa0] });
	const output = projectNoneAttestationObject(input);
	expect(output).toBeInstanceOf(Uint8Array);
	expect(output).toEqual(expected);
	expect(input).toEqual(original);
	expect(output).not.toBe(input);
	expect(output.buffer).not.toBe(input.buffer);
	return output;
}

it.each([
	{ name: "EC2 full coordinates", key: () => ec2Key(), algorithm: [0x26] },
	{
		name: "EC2 compressed ordinate",
		key: () =>
			ec2Key({
				algorithm: [0x38, 0x22],
				curve: 2,
				width: 48,
				compressed: true,
			}),
		algorithm: [0x38, 0x22],
	},
	{ name: "OKP curve 6", key: () => okpKey(6, 32), algorithm: [0x27] },
	{ name: "OKP curve 7", key: () => okpKey(7, 57), algorithm: [0x27] },
	{ name: "RSA structural fields", key: rsaKey, algorithm: [0x39, 0x01, 0x00] },
])(
	"retains provisional packed bytes and rewrites none for $name without crypto claims",
	({ key, algorithm }) => {
		const authData = registration({ key: key() });
		const packed = envelope({ authData, statement: selfStatement(algorithm) });
		retains(packed);
		rewrites(
			envelope({ format: "none", authData, statement: [0xa0] }),
			authData,
		);
	},
);

it.each([
	{
		name: "synthetic certificate bytes in array",
		value: [0x81, ...bytesWire([...new TextEncoder().encode(privateSentinel)])],
	},
	{ name: "empty array", value: [0x80] },
	{ name: "null", value: [0xf6] },
	{ name: "CBOR undefined", value: [0xf7] },
	{
		name: "byte string",
		value: bytesWire([...new TextEncoder().encode(privateSentinel)]),
	},
	{ name: "text", value: textWire(privateSentinel) },
	{ name: "false", value: [0xf4] },
	{ name: "unsigned zero", value: [0x00] },
])(
	"treats present exact text x5c with $name as reconstruction, not absence",
	({ value }) => {
		const authData = registration();
		const statement = mapWire([
			[textWire("alg"), [0x26]],
			[textWire("sig"), bytesWire([0x51])],
			[textWire("x5c"), value],
		]);
		const output = rewrites(envelope({ authData, statement }), authData);
		expect(new TextDecoder().decode(output)).not.toContain(privateSentinel);
	},
);

it.each(
	[
		{ presence: "null", value: [0xf6] },
		{ presence: "undefined", value: [0xf7] },
	].flatMap((entry) => [
		{ ...entry, shape: "missing" },
		{ ...entry, shape: "bad with extra" },
	]),
)(
	"checks present $presence x5c before $shape self fields",
	({ value, shape }) => {
		const authData = registration();
		const statement =
			shape === "missing"
				? mapWire([[textWire("x5c"), value]])
				: mapWire([
						[textWire("alg"), textWire(privateSentinel)],
						[textWire("sig"), bytesWire([])],
						[textWire("x5c"), value],
						[textWire("zzz"), textWire(privateSentinel)],
					]);
		rewrites(envelope({ authData, statement }), authData);
	},
);

it.each([
	{
		name: "packed nonzero AAGUID",
		format: "packed",
		aaguid: nonzeroAaguid,
		empty: false,
	},
	{
		name: "packed final AAGUID byte nonzero",
		format: "packed",
		aaguid: [...Array.from({ length: 15 }, () => 0), 1],
		empty: false,
	},
	{
		name: "other format",
		format: privateSentinel,
		aaguid: undefined,
		empty: false,
	},
	{
		name: "case-distinct Packed",
		format: "Packed",
		aaguid: undefined,
		empty: false,
	},
	{ name: "none zero AAGUID", format: "none", aaguid: undefined, empty: true },
	{
		name: "none nonzero AAGUID",
		format: "none",
		aaguid: nonzeroAaguid,
		empty: true,
	},
	{
		name: "none nonempty statement",
		format: "none",
		aaguid: undefined,
		empty: false,
	},
	{
		name: "64-code-unit format",
		format: "z".repeat(64),
		aaguid: undefined,
		empty: false,
	},
])(
	"reconstructs $name without validating discarded self fields or altering authData",
	({ format, aaguid, empty }) => {
		const authData = registration({ aaguid, flags: 0x58 });
		const statement = empty
			? [0xa0]
			: mapWire([
					[textWire("alg"), textWire(privateSentinel)],
					[textWire("zzz"), bytesWire([0x81, 0x82])],
				]);
		rewrites(envelope({ format, authData, statement }), authData);
	},
);

it.each([
	{ name: "both missing", statement: () => [0xa0] },
	{
		name: "alg missing",
		statement: () => mapWire([[textWire("sig"), bytesWire([1])]]),
	},
	{
		name: "sig missing",
		statement: () => mapWire([[textWire("alg"), [0x26]]]),
	},
	{
		name: "empty signature",
		statement: () => selfStatement([0x26], bytesWire([])),
	},
	{
		name: "text signature",
		statement: () => selfStatement([0x26], textWire(privateSentinel)),
	},
	{ name: "array signature", statement: () => selfStatement([0x26], [0x80]) },
	{ name: "text algorithm", statement: () => selfStatement(textWire("-7")) },
	{
		name: "integral float algorithm",
		statement: () => selfStatement([0xfa, 0xc0, 0xe0, 0x00, 0x00]),
	},
	{
		name: "unsigned algorithm mismatch",
		statement: () => selfStatement([0x07]),
	},
	{
		name: "negative algorithm mismatch",
		statement: () => selfStatement([0x27]),
	},
	{ name: "null algorithm", statement: () => selfStatement([0xf6]) },
	{
		name: "large bigint algorithm mismatch",
		statement: () => selfStatement([0x3b, 0x00, 0x20, 0, 0, 0, 0, 0, 0]),
	},
])("rejects eligible packed self shape with $name", ({ statement }) => {
	rejects(envelope({ statement: statement() }));
});

it.each([
	{
		name: "extra text with required fields",
		statement: () =>
			mapWire([
				[textWire("alg"), [0x26]],
				[textWire("sig"), bytesWire([1])],
				[textWire("zzz"), textWire(privateSentinel)],
			]),
	},
	{
		name: "extra with both required fields missing",
		statement: () => mapWire([[textWire("zzz"), textWire(privateSentinel)]]),
	},
	{
		name: "extra with wrong alg and missing sig",
		statement: () =>
			mapWire([
				[textWire("alg"), textWire(privateSentinel)],
				[textWire("zzz"), [0x00]],
			]),
	},
	{
		name: "byte-string x5c key",
		statement: () =>
			mapWire([
				[bytesWire([0x78, 0x35, 0x63]), [0xf7]],
				[textWire("alg"), [0x26]],
				[textWire("sig"), bytesWire([1])],
			]),
	},
	{
		name: "numeric extra with alg missing",
		statement: () =>
			mapWire([
				[[0x00], [0xf6]],
				[textWire("sig"), bytesWire([1])],
			]),
	},
	{
		name: "case-distinct X5C with required fields missing",
		statement: () => mapWire([[textWire("X5C"), [0xf7]]]),
	},
])(
	"rejects $name as unsupported before missing or wrong required self fields",
	({ statement }) => {
		rejects(envelope({ statement: statement() }), "unsupported");
	},
);

function envelopeEntries(): [Wire, Wire][] {
	return [
		[textWire("fmt"), textWire("none")],
		[textWire("attStmt"), [0xa0]],
		[textWire("authData"), bytesWire([...registration()])],
	];
}

it.each([
	{ name: "missing fmt", wire: () => mapWire(envelopeEntries().slice(1)) },
	{
		name: "missing attStmt",
		wire: () =>
			mapWire(envelopeEntries().filter((_entry, index) => index !== 1)),
	},
	{
		name: "missing authData",
		wire: () => mapWire(envelopeEntries().slice(0, 2)),
	},
	{
		name: "top-level x5c",
		wire: () => {
			const entries = envelopeEntries();
			entries.splice(1, 0, [textWire("x5c"), [0xf7]]);
			return mapWire(entries);
		},
	},
	{
		name: "unknown outer member",
		wire: () =>
			mapWire([...envelopeEntries(), [textWire(privateSentinel), [0xf6]]]),
	},
	{
		name: "non-text outer key",
		wire: () =>
			mapWire([[[0x00], textWire("none")], ...envelopeEntries().slice(1)]),
	},
	{ name: "non-map root", wire: () => [0x80] },
	{
		name: "empty fmt",
		wire: () => [...envelope({ format: "", statement: [0xa0] })],
	},
	{
		name: "overlong fmt",
		wire: () => [...envelope({ format: "z".repeat(65), statement: [0xa0] })],
		code: "resource-limit" as const,
	},
	{
		name: "non-text fmt",
		wire: () =>
			mapWire([[textWire("fmt"), [0xf6]], ...envelopeEntries().slice(1)]),
	},
	{
		name: "non-byte authData",
		wire: () =>
			mapWire([
				...envelopeEntries().slice(0, 2),
				[textWire("authData"), textWire(privateSentinel)],
			]),
	},
	{
		name: "non-map attStmt",
		wire: () =>
			mapWire([
				envelopeEntries()[0],
				[textWire("attStmt"), textWire(privateSentinel)],
				envelopeEntries()[2],
			]),
	},
	{ name: "empty outer map", wire: () => [0xa0] },
])("rejects strict envelope violation: $name", ({ wire, code }) => {
	rejects(new Uint8Array(wire()), code ?? "invalid-input");
});

it.each([
	{
		name: "duplicate outer key",
		wire: () => mapWire([envelopeEntries()[0], ...envelopeEntries()]),
		code: "invalid-input",
	},
	{
		name: "unsorted outer map",
		wire: () => mapWire([...envelopeEntries().slice(1), envelopeEntries()[0]]),
		code: "invalid-input",
	},
	{
		name: "nonminimal map length",
		wire: () => [0xb8, 0x03, ...envelope().slice(1)],
		code: "invalid-input",
	},
	{
		name: "nonminimal format length",
		wire: () =>
			mapWire([
				[textWire("fmt"), [0x78, 0x04, 0x6e, 0x6f, 0x6e, 0x65]],
				...envelopeEntries().slice(1),
			]),
		code: "invalid-input",
	},
	{
		name: "nonminimal integer",
		wire: () => [...envelope({ statement: selfStatement([0x38, 0x06]) })],
		code: "invalid-input",
	},
	{
		name: "trailing item",
		wire: () => [...envelope(), 0x00],
		code: "invalid-input",
	},
	{ name: "tag", wire: () => [0xc0, ...envelope()], code: "invalid-input" },
	{
		name: "indefinite map",
		wire: () => [0xbf, ...envelope().slice(1), 0xff],
		code: "invalid-input",
	},
	{
		name: "invalid UTF8 format",
		wire: () =>
			mapWire([[textWire("fmt"), [0x61, 0xff]], ...envelopeEntries().slice(1)]),
		code: "invalid-input",
	},
	{
		name: "truncated envelope",
		wire: () => [...envelope().slice(0, -1)],
		code: "invalid-input",
	},
	{
		name: "complex discarded statement key",
		wire: () => [
			...envelope({ format: "none", statement: [0xa1, 0x80, 0xf6] }),
		],
		code: "unsupported",
	},
	{
		name: "duplicate discarded statement key",
		wire: () => [
			...envelope({
				format: "none",
				statement: mapWire([
					[textWire("zzz"), [0xf6]],
					[textWire("zzz"), [0xf7]],
				]),
			}),
		],
		code: "invalid-input",
	},
] as const)("preserves strict CBOR failure for $name", ({ wire, code }) => {
	rejects(new Uint8Array(wire()), code);
});

it.each([
	{
		name: "short authData",
		authData: () => new Uint8Array(54),
		code: "invalid-input",
	},
	{
		name: "missing AT",
		authData: () => registration({ flags: 0 }),
		code: "invalid-input",
	},
	{
		name: "BS without BE",
		authData: () => registration({ flags: 0x50 }),
		code: "invalid-input",
	},
	{
		name: "empty credential ID",
		authData: () => registration({ identifier: [] }),
		code: "invalid-input",
	},
	{
		name: "credential/key boundary mismatch",
		authData: () => registration({ declaredLength: 4 }),
		code: "invalid-input",
	},
	{
		name: "1024-byte credential ID",
		authData: () =>
			registration({ identifier: Array.from({ length: 1024 }, () => 0x51) }),
		code: "resource-limit",
	},
	{
		name: "non-map COSE",
		authData: () => registration({ key: [0x00] }),
		code: "invalid-input",
	},
	{
		name: "unsupported COSE key type",
		authData: () => registration({ key: [0xa2, 0x01, 0x04, 0x03, 0x26] }),
		code: "unsupported",
	},
	{
		name: "unsupported COSE algorithm",
		authData: () => registration({ key: ec2Key({ algorithm: [0x20] }) }),
		code: "unsupported",
	},
	{
		name: "COSE type/algorithm mismatch",
		authData: () => registration({ key: ec2Key({ algorithm: [0x27] }) }),
		code: "invalid-input",
	},
	{
		name: "short EC2 coordinates",
		authData: () => registration({ key: ec2Key({ width: 31 }) }),
		code: "invalid-input",
	},
	{
		name: "extra COSE label",
		authData: () =>
			registration({
				key: [0xa6, 0x01, 0x02, 0x03, 0x26, 0x04, 0x00, ...ec2Key().slice(5)],
			}),
		code: "invalid-input",
	},
	{
		name: "ED without tail",
		authData: () => registration({ flags: 0xc0 }),
		code: "invalid-input",
	},
	{
		name: "tail without ED",
		authData: () => registration({ tail: [0xa0] }),
		code: "invalid-input",
	},
	{
		name: "non-map extension",
		authData: () => registration({ flags: 0xc0, tail: [0x80] }),
		code: "invalid-input",
	},
	{
		name: "non-text extension key",
		authData: () => registration({ flags: 0xc0, tail: [0xa1, 0x01, 0xf6] }),
		code: "invalid-input",
	},
	{
		name: "empty extension key",
		authData: () => registration({ flags: 0xc0, tail: [0xa1, 0x60, 0xf6] }),
		code: "invalid-input",
	},
	{
		name: "trailing extension item",
		authData: () => registration({ flags: 0xc0, tail: [0xa0, 0x00] }),
		code: "invalid-input",
	},
] as const)(
	"admits complete authData before x5c reconstruction: $name",
	({ authData, code }) => {
		rejects(
			envelope({
				authData: authData(),
				statement: mapWire([[textWire("x5c"), [0xf7]]]),
			}),
			code,
		);
	},
);

it("admits separate depth-four outer and extension scopes without rewriting embedded bytes", () => {
	const authData = registration({
		flags: 0xc0,
		tail: mapWire([
			[textWire("x"), [0x81, 0x81, 0x80]],
			[textWire("y"), [0xfb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0]],
			[
				textWire("z"),
				bytesWire([...new TextEncoder().encode(privateSentinel)]),
			],
		]),
	});
	retains(envelope({ authData }));
	const output = rewrites(
		envelope({
			authData,
			statement: mapWire([[textWire("x5c"), [0x81, 0x80]]]),
		}),
		authData,
	);
	expect(new TextDecoder().decode(output)).toContain(privateSentinel);
});

it.each(["outer", "embedded"])(
	"rejects a fifth container in the %s CBOR scope",
	(scope) => {
		const authData =
			scope === "embedded"
				? registration({
						flags: 0xc0,
						tail: [0xa1, 0x61, 0x78, 0x81, 0x81, 0x81, 0x80],
					})
				: registration();
		const statement =
			scope === "outer"
				? mapWire([[textWire("x5c"), [0x81, 0x81, 0x80]]])
				: mapWire([[textWire("x5c"), [0xf7]]]);
		rejects(envelope({ authData, statement }), "resource-limit");
	},
);

it.each([7430, 7431])(
	"enforces the original envelope ceiling with a %s-byte synthetic signature",
	(length) => {
		const statement = selfStatement(
			[0x26],
			bytesWire(Array.from({ length }, () => 0x51)),
		);
		const input = envelope({ statement });
		expect(input.length).toBe(length + 179);
		if (length === 7430) retains(input);
		else rejects(input, "resource-limit");
	},
);

it.each([7435, 7436])(
	"independently bounds output expansion with %s extension bytes",
	(length) => {
		const authData = registration({
			flags: 0xc0,
			tail: mapWire([
				[textWire("pad"), bytesWire(Array.from({ length }, () => 0x61))],
			]),
		});
		const input = envelope({ format: "a", authData, statement: [0xa0] });
		const expected = envelope({ format: "none", authData, statement: [0xa0] });
		expect(input.length).toBe(length + 171);
		expect(expected.length).toBe(length + 174);
		if (length === 7435) rewrites(input, authData);
		else rejects(input, "resource-limit");
	},
);

it.each(["retention", "reconstruction"])(
	"isolates selected views, repeated outputs and mutations for %s",
	(branch) => {
		const authData = registration();
		const original = envelope({
			authData,
			statement:
				branch === "retention"
					? selfStatement()
					: mapWire([[textWire("x5c"), [0xf7]]]),
		});
		const expected =
			branch === "retention"
				? original.slice()
				: envelope({ format: "none", authData, statement: [0xa0] });
		const backing = new Uint8Array(original.length + 7).fill(0xff);
		backing.set(original, 3);
		const input = backing.subarray(3, 3 + original.length);
		const unchanged = backing.slice();
		const hook = vi.fn(() => {
			throw new Error(privateSentinel);
		});
		for (const property of [
			"buffer",
			"byteOffset",
			"byteLength",
			"length",
			"slice",
			"subarray",
			"constructor",
			Symbol.toStringTag,
			Symbol.iterator,
		])
			Object.defineProperty(input, property, { get: hook });
		const first = projectNoneAttestationObject(input);
		const second = projectNoneAttestationObject(input);
		expect(first).toEqual(expected);
		expect(second).toEqual(expected);
		expect(first).not.toBe(second);
		expect(first.buffer).not.toBe(second.buffer);
		expect(first.buffer).not.toBe(backing.buffer);
		expect(second.buffer).not.toBe(backing.buffer);
		expect(backing).toEqual(unchanged);
		first.fill(0);
		expect(second).toEqual(expected);
		expect(backing).toEqual(unchanged);
		backing.fill(0);
		expect(second).toEqual(expected);
		expect(hook).not.toHaveBeenCalled();
	},
);

it.each([
	{ name: "undefined", make: () => undefined },
	{ name: "null", make: () => null },
	{ name: "boolean", make: () => false },
	{ name: "number", make: () => 0 },
	{ name: "string", make: () => privateSentinel },
	{ name: "array", make: () => [0xa0] },
	{ name: "object", make: () => ({}) },
	{ name: "decoded map", make: () => ({ kind: "map", entries: [] }) },
	{ name: "ArrayBuffer", make: () => new ArrayBuffer(1) },
	{ name: "DataView", make: () => new DataView(new ArrayBuffer(1)) },
	{ name: "Uint16Array", make: () => new Uint16Array([0xa0]) },
	{ name: "Uint8ClampedArray", make: () => new Uint8ClampedArray([0xa0]) },
	{ name: "empty Uint8Array", make: () => new Uint8Array() },
])("rejects $name rather than widening native byte admission", ({ make }) => {
	rejects(make());
});

it.each(["object proxy", "typed proxy", "revoked proxy"])(
	"rejects %s without inspecting hostile properties",
	(shape) => {
		const hook = vi.fn(() => {
			throw new Error(privateSentinel);
		});
		const target = shape === "object proxy" ? {} : envelope();
		const proxy = Proxy.revocable(target, {
			get: hook,
			getPrototypeOf: hook,
			ownKeys: hook,
			getOwnPropertyDescriptor: hook,
			has: hook,
		});
		if (shape === "revoked proxy") proxy.revoke();
		rejects(proxy.proxy);
		expect(hook).not.toHaveBeenCalled();
	},
);

it.each(["shared", "detached"])("rejects %s byte storage", (storage) => {
	if (storage === "shared") {
		const bytes = new Uint8Array(new SharedArrayBuffer(1));
		bytes[0] = 0xa0;
		rejects(bytes);
		expect(bytes[0]).toBe(0xa0);
	} else {
		const buffer = new ArrayBuffer(1);
		const input = new Uint8Array(buffer);
		structuredClone(buffer, { transfer: [buffer] });
		rejects(input);
	}
});

it("issues fresh fixed scrubbed errors for all three categories", () => {
	const cases: { input: Uint8Array; code: RejectionCode }[] = [
		{
			input: new Uint8Array(
				mapWire([
					[textWire("fmt"), textWire(privateSentinel)],
					[textWire("attStmt"), textWire(privateSentinel)],
					[textWire("authData"), bytesWire([...registration()])],
				]),
			),
			code: "invalid-input",
		},
		{
			input: envelope({
				statement: mapWire([[textWire(privateSentinel), [0xf7]]]),
			}),
			code: "unsupported",
		},
		{
			input: envelope({
				statement: mapWire([
					[textWire("x5c"), [0x81, 0x81, 0x81, ...textWire(privateSentinel)]],
				]),
			}),
			code: "resource-limit",
		},
	];
	for (const { input, code } of cases) {
		const original = input.slice();
		const first = rejects(input, code);
		const second = rejects(input, code);
		expect(first).not.toBe(second);
		expect(input).toEqual(original);
	}
});
