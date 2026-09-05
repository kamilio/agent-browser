import {
	type KeyObject,
	createHash,
	generateKeyPairSync,
	sign,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	verifyPasskeyProbeAssertion,
	verifyPasskeyProbeRegistration,
} from "../scripts/passkey-probe-verifier.js";
import { scriptJsonResult } from "./safejs.js";

const origin = "https://passkeys.fixture.invalid";
const rpId = "passkeys.fixture.invalid";
const challenge = new Uint8Array([251, 255, 0, 42]);
const userHandle = new Uint8Array([7, 8, 9]);
const expected = { origin, rpId, challenge };
const safeError = "Passkey probe verification failed";
type Encodable = number | string | Uint8Array | Map<string | number, Encodable>;

function header(major: number, value: number): Buffer {
	if (value < 24) return Buffer.from([(major << 5) | value]);
	if (value < 256) return Buffer.from([(major << 5) | 24, value]);
	return Buffer.from([(major << 5) | 25, value >>> 8, value & 255]);
}

function encode(value: Encodable): Buffer {
	if (typeof value === "number")
		return header(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
	if (typeof value === "string") {
		const text = Buffer.from(value);
		return Buffer.concat([header(3, text.length), text]);
	}
	if (value instanceof Uint8Array)
		return Buffer.concat([header(2, value.length), value]);
	return Buffer.concat([
		header(5, value.size),
		...[...value].flatMap(([key, entry]) => [encode(key), encode(entry)]),
	]);
}

function digest(value: string | Uint8Array): Buffer {
	return createHash("sha256").update(value).digest();
}

function client(type: string): Record<string, unknown> {
	return {
		type,
		challenge: Buffer.from(challenge).toString("base64url"),
		origin,
		crossOrigin: false,
	};
}

function fixture() {
	const { privateKey, publicKey } = generateKeyPairSync("ec", {
		namedCurve: "prime256v1",
	});
	const publicJwk = publicKey.export({ format: "jwk" });
	const credentialId = Buffer.alloc(32, 19);
	const cose = new Map<string | number, Encodable>([
		[1, 2],
		[3, -7],
		[-1, 1],
		[-2, Buffer.from(publicJwk.x as string, "base64url")],
		[-3, Buffer.from(publicJwk.y as string, "base64url")],
	]);
	const registrationHeader = Buffer.concat([
		digest(rpId),
		Buffer.from([0x41, 0, 0, 0, 0]),
		Buffer.alloc(16),
		Buffer.from([0, 32]),
		credentialId,
	]);
	function attestation(
		authData = Buffer.concat([registrationHeader, encode(cose)]),
	): number[] {
		return [
			...encode(
				new Map<string, Encodable>([
					["fmt", "none"],
					["attStmt", new Map()],
					["authData", authData],
				]),
			),
		];
	}
	const registration = {
		id: credentialId.toString("base64url"),
		type: "public-key",
		rawId: [...credentialId],
		clientDataJSON: [...Buffer.from(JSON.stringify(client("webauthn.create")))],
		attestationObject: attestation(),
	};
	const assertion = {
		id: registration.id,
		type: "public-key",
		rawId: [...credentialId],
		clientDataJSON: [...Buffer.from(JSON.stringify(client("webauthn.get")))],
		authenticatorData: [
			...Buffer.concat([digest(rpId), Buffer.from([1, 0, 0, 0, 1])]),
		],
		signature: [] as number[],
		userHandle: [...userHandle],
	};
	function resign(key: KeyObject = privateKey): void {
		assertion.signature = [
			...sign(
				"sha256",
				Buffer.concat([
					Buffer.from(assertion.authenticatorData),
					digest(Buffer.from(assertion.clientDataJSON)),
				]),
				{ key, dsaEncoding: "der" },
			),
		];
	}
	resign();
	const verified = verifyPasskeyProbeRegistration(registration, expected);
	const assertionExpected = { ...expected, userHandle, registration: verified };
	expect(verifyPasskeyProbeAssertion(assertion, assertionExpected)).toEqual({
		signCount: 1,
	});
	return {
		registration,
		assertion,
		verified,
		assertionExpected,
		publicKey,
		cose,
		registrationHeader,
		attestation,
		resign,
	};
}

function rejected(operation: () => unknown): void {
	expect(operation).toThrow(new Error(safeError));
	try {
		operation();
	} catch (error) {
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(safeError);
		expect(Object.hasOwn(error as Error, "cause")).toBe(false);
	}
}

it("independently extracts a P-256 public key and verifies the first assertion", () => {
	const current = fixture();
	expect(current.verified.publicKey).not.toBe(current.publicKey);
	expect(current.verified.publicKey.export({ format: "jwk" })).toEqual(
		current.publicKey.export({ format: "jwk" }),
	);
	expect(current.verified).toMatchObject({
		origin,
		rpId,
		signCount: 0,
		credentialIdText: current.registration.id,
	});
	expect(current.verified.credentialId).toBeInstanceOf(Uint8Array);
	current.registration.rawId[0] ^= 1;
	expect(current.verified.credentialId[0]).toBe(19);
	expect(
		verifyPasskeyProbeAssertion(current.assertion, current.assertionExpected),
	).toEqual({ signCount: 1 });
});

it("accepts canonical JSON in another key order and hashes its original bytes", () => {
	const current = fixture();
	for (const [credential, type] of [
		[current.registration, "webauthn.create"],
		[current.assertion, "webauthn.get"],
	] as const) {
		credential.clientDataJSON = [
			...Buffer.from(
				JSON.stringify({
					crossOrigin: false,
					origin,
					challenge: client(type).challenge,
					type,
				}),
			),
		];
	}
	current.resign();
	const registration = verifyPasskeyProbeRegistration(
		current.registration,
		expected,
	);
	expect(
		verifyPasskeyProbeAssertion(current.assertion, {
			...current.assertionExpected,
			registration,
		}),
	).toEqual({ signCount: 1 });
});

const clientMutations: [string, (text: string) => string][] = [
	["challenge", (text) => text.replace('"challenge":"', '"challenge":"wrong')],
	[
		"padded challenge",
		(text) =>
			text.replace(
				Buffer.from(challenge).toString("base64url"),
				`${Buffer.from(challenge).toString("base64url")}=`,
			),
	],
	["origin", (text) => text.replace(origin, "https://other.fixture.invalid")],
	["type", (text) => text.replace("webauthn.", "invalid.")],
	["crossOrigin", (text) => text.replace("false", "true")],
	["missing field", (text) => text.replace(',"crossOrigin":false', "")],
	["extra field", (text) => text.replace("}", ',"extra":0}')],
	["duplicate key", (text) => text.replace("}", ',"crossOrigin":false}')],
	["whitespace", (text) => ` ${text}`],
	["noncanonical escape", (text) => text.replace("webauthn", "\\u0077ebauthn")],
	["BOM", (text) => `\uFEFF${text}`],
	["malformed", () => "{"],
	["array", () => "[]"],
];

for (const operation of ["registration", "assertion"] as const) {
	it.each(clientMutations)(
		`rejects ${operation} client data: %s`,
		(_label, mutate) => {
			const current = fixture();
			const credential = current[operation];
			credential.clientDataJSON = [
				...Buffer.from(
					mutate(Buffer.from(credential.clientDataJSON).toString("utf8")),
				),
			];
			current.resign();
			rejected(() =>
				operation === "registration"
					? verifyPasskeyProbeRegistration(credential, expected)
					: verifyPasskeyProbeAssertion(credential, current.assertionExpected),
			);
		},
	);
	it(`rejects ${operation} invalid UTF8 client data`, () => {
		const current = fixture();
		current[operation].clientDataJSON = [0xff];
		current.resign();
		rejected(() =>
			operation === "registration"
				? verifyPasskeyProbeRegistration(current.registration, expected)
				: verifyPasskeyProbeAssertion(
						current.assertion,
						current.assertionExpected,
					),
		);
	});
}

it.each([0, 32, 33, 36, 37, 53, 54, 55])(
	"rejects altered registration authData at offset %i",
	(offset) => {
		const current = fixture();
		current.registrationHeader[offset] ^= 1;
		current.registration.attestationObject = current.attestation();
		rejected(() =>
			verifyPasskeyProbeRegistration(current.registration, expected),
		);
	},
);

it.each([0, 4, 8, 16, 32, 64, 128, 0x45, 0x49, 0x51, 0xc1])(
	"rejects registration flags %i",
	(flags) => {
		const current = fixture();
		current.registrationHeader[32] = flags;
		current.registration.attestationObject = current.attestation();
		rejected(() =>
			verifyPasskeyProbeRegistration(current.registration, expected),
		);
	},
);

it.each([0, 5, 9, 17, 33, 65, 129])(
	"rejects assertion flags %i with a valid signature",
	(flags) => {
		const current = fixture();
		current.assertion.authenticatorData[32] = flags;
		current.resign();
		rejected(() =>
			verifyPasskeyProbeAssertion(current.assertion, current.assertionExpected),
		);
	},
);

it.each([0, 2, 255, 256, 0xffffffff])(
	"rejects assertion counter %i with a valid signature",
	(counter) => {
		const current = fixture();
		const authData = Buffer.from(current.assertion.authenticatorData);
		authData.writeUInt32BE(counter, 33);
		current.assertion.authenticatorData = [...authData];
		current.resign();
		rejected(() =>
			verifyPasskeyProbeAssertion(current.assertion, current.assertionExpected),
		);
	},
);

it("rejects a wrong assertion RP hash even with a valid signature", () => {
	const current = fixture();
	current.assertion.authenticatorData[0] ^= 1;
	current.resign();
	rejected(() =>
		verifyPasskeyProbeAssertion(current.assertion, current.assertionExpected),
	);
});

it("rejects mismatched expectation and registration scopes or counters", () => {
	const current = fixture();
	for (const change of [
		{ origin: `${origin}/` },
		{ rpId: "fixture.invalid" },
		{ signCount: 1 },
	]) {
		rejected(() =>
			verifyPasskeyProbeAssertion(current.assertion, {
				...current.assertionExpected,
				registration: { ...current.verified, ...change },
			}),
		);
	}
	for (const change of [
		{ origin: `${origin}/` },
		{ rpId: "fixture.invalid" },
		{ challenge: new Uint8Array([1]) },
	]) {
		rejected(() =>
			verifyPasskeyProbeRegistration(current.registration, {
				...expected,
				...change,
			}),
		);
		rejected(() =>
			verifyPasskeyProbeAssertion(current.assertion, {
				...current.assertionExpected,
				...change,
			}),
		);
	}
});

it("rejects mismatched credential identifiers, types and user handles", () => {
	const current = fixture();
	const otherId = [...Buffer.alloc(32, 20)];
	for (const change of [
		{ id: `${current.registration.id}=` },
		{ id: 12 },
		{ type: "password" },
		{ rawId: otherId },
		{ rawId: otherId, id: Buffer.from(otherId).toString("base64url") },
	]) {
		rejected(() =>
			verifyPasskeyProbeRegistration(
				{ ...current.registration, ...change },
				expected,
			),
		);
		rejected(() =>
			verifyPasskeyProbeAssertion(
				{ ...current.assertion, ...change },
				current.assertionExpected,
			),
		);
	}
	rejected(() =>
		verifyPasskeyProbeAssertion(
			{ ...current.assertion, userHandle: [1] },
			current.assertionExpected,
		),
	);
	rejected(() =>
		verifyPasskeyProbeAssertion(current.assertion, {
			...current.assertionExpected,
			userHandle: new Uint8Array([1]),
		}),
	);
});

it("rejects signatures made by a different key and tampered signatures", () => {
	const current = fixture();
	current.resign(
		generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey,
	);
	rejected(() =>
		verifyPasskeyProbeAssertion(current.assertion, current.assertionExpected),
	);
	current.resign();
	current.assertion.signature[current.assertion.signature.length - 1] ^= 1;
	rejected(() =>
		verifyPasskeyProbeAssertion(current.assertion, current.assertionExpected),
	);
});

it("verifies against the independently extracted key rather than another registration key", () => {
	const current = fixture();
	const other = fixture();
	rejected(() =>
		verifyPasskeyProbeAssertion(current.assertion, {
			...current.assertionExpected,
			registration: other.verified,
		}),
	);
});

const invalidDer: [string, number[]][] = [
	["raw P1363", Array(64).fill(1)],
	["negative", [0x30, 6, 2, 1, 0x80, 2, 1, 1]],
	["zero", [0x30, 6, 2, 1, 0, 2, 1, 1]],
	["redundant padding", [0x30, 7, 2, 2, 0, 1, 2, 1, 1]],
	["empty integer", [0x30, 6, 2, 0, 2, 2, 1, 1]],
	["truncated integer", [0x30, 6, 2, 1, 1, 2, 2, 1]],
	["wrong integer tag", [0x30, 6, 3, 1, 1, 2, 1, 1]],
	["long-form sequence", [0x30, 0x81, 6, 2, 1, 1, 2, 1, 1]],
	["long-form integer", [0x30, 7, 2, 0x81, 1, 1, 2, 1, 1]],
	["extra integer", [0x30, 9, 2, 1, 1, 2, 1, 1, 2, 1, 1]],
	["overwide integer", [0x30, 38, 2, 33, ...Array(33).fill(1), 2, 1, 1]],
];

it.each(invalidDer)("rejects DER: %s", (_label, signature) => {
	const current = fixture();
	current.assertion.signature = signature;
	rejected(() =>
		verifyPasskeyProbeAssertion(current.assertion, current.assertionExpected),
	);
});

it("rejects trailing, truncated and nonminimal encodings of a real signature", () => {
	const current = fixture();
	const original = Buffer.from(current.assertion.signature);
	const firstScalar = original.subarray(4, 4 + original[3]);
	const secondScalar = BigInt(
		`0x${original.subarray(6 + original[3]).toString("hex")}`,
	);
	const curveOrder = BigInt(
		"0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
	);
	const lowScalar =
		secondScalar > curveOrder / 2n ? curveOrder - secondScalar : secondScalar;
	const scalarHex = lowScalar.toString(16);
	const scalarBytes = Buffer.from(
		scalarHex.length % 2 ? `0${scalarHex}` : scalarHex,
		"hex",
	);
	const signature = [
		...Buffer.concat([
			Buffer.from([
				0x30,
				4 + firstScalar.length + scalarBytes.length,
				0x02,
				firstScalar.length,
			]),
			firstScalar,
			Buffer.from([0x02, scalarBytes.length]),
			scalarBytes,
		]),
	];
	expect(signature.length).toBeLessThanOrEqual(71);
	expect(
		verifyPasskeyProbeAssertion(
			{ ...current.assertion, signature },
			current.assertionExpected,
		),
	).toEqual({ signCount: 1 });
	const paddedInteger = [...signature.slice(0, 4), 0, ...signature.slice(4)];
	paddedInteger[1]++;
	paddedInteger[3]++;
	const variants = [
		[...signature, 0],
		signature.slice(0, -1),
		[0x30, 0x81, signature[1], ...signature.slice(2)],
		paddedInteger,
	];
	for (const candidate of variants) {
		expect(candidate.length).toBeGreaterThanOrEqual(8);
		expect(candidate.length).toBeLessThanOrEqual(72);
		rejected(() =>
			verifyPasskeyProbeAssertion(
				{ ...current.assertion, signature: candidate },
				current.assertionExpected,
			),
		);
	}
});

const invalidCbor: [string, number[]][] = [
	["empty", []],
	["truncated map", [0xa1]],
	["indefinite", [0xbf, 0xff]],
	["array", [0x80]],
	["tag", [0xc0, 0xa0]],
	["float", [0xf9, 0, 0]],
	["nonminimal map", [0xb8, 0]],
	["nonminimal uint8", [0xa1, 0x18, 1, 0]],
	["nonminimal uint16", [0xa1, 0x19, 0, 24, 0]],
	["nonminimal uint32", [0xa1, 0x1a, 0, 0, 1, 0, 0]],
	["uint64", [0xa1, 0x1b, 0, 0, 0, 0, 0, 0, 0, 1, 0]],
	["truncated length", [0x5a, 0]],
	["oversized string", [0x5a, 0xff, 0xff, 0xff, 0xff]],
	["invalid UTF8", [0xa1, 0x61, 0xff, 0]],
	["byte key", [0xa1, 0x40, 0]],
	["map key", [0xa1, 0xa0, 0]],
	["duplicate key", [0xa2, 1, 0, 1, 1]],
	["too many entries", [0xb1]],
	["too deep", [0xa1, 0, 0xa1, 0, 0xa1, 0, 0xa1, 0, 0xa1, 0, 0]],
];

it.each(invalidCbor)(
	"rejects bounded CBOR: %s",
	(_label, attestationObject) => {
		const current = fixture();
		rejected(() =>
			verifyPasskeyProbeRegistration(
				{ ...current.registration, attestationObject },
				expected,
			),
		);
	},
);

it("rejects truncated and trailing attestation and COSE payloads", () => {
	const current = fixture();
	for (const attestationObject of [
		current.registration.attestationObject.slice(0, -1),
		[...current.registration.attestationObject, 0],
		current.attestation(
			Buffer.concat([
				current.registrationHeader,
				encode(current.cose),
				Buffer.from([0]),
			]),
		),
		current.attestation(current.registrationHeader.subarray(0, 54)),
	]) {
		rejected(() =>
			verifyPasskeyProbeRegistration(
				{ ...current.registration, attestationObject },
				expected,
			),
		);
	}
});

it("rejects truncated inner COSE inside a complete outer attestation", () => {
	const current = fixture();
	const encodedKey = encode(current.cose);
	const valid = current.attestation(
		Buffer.concat([current.registrationHeader, encodedKey]),
	);
	expect(
		verifyPasskeyProbeRegistration(
			{ ...current.registration, attestationObject: valid },
			expected,
		),
	).toMatchObject({ signCount: 0 });
	const truncated = current.attestation(
		Buffer.concat([current.registrationHeader, encodedKey.subarray(0, -1)]),
	);
	rejected(() =>
		verifyPasskeyProbeRegistration(
			{ ...current.registration, attestationObject: truncated },
			expected,
		),
	);
});

it("rejects non-none, nonempty, mistyped, missing and extra attestation fields", () => {
	const current = fixture();
	const base = new Map<string | number, Encodable>([
		["fmt", "none"],
		["attStmt", new Map()],
		[
			"authData",
			Buffer.concat([current.registrationHeader, encode(current.cose)]),
		],
	]);
	for (const [key, value] of [
		["fmt", "packed"],
		["attStmt", new Map([[1, 1]])],
		["attStmt", 0],
		["authData", "bytes"],
		["extra", 0],
	] as [string, Encodable][]) {
		const changed = new Map(base);
		changed.set(key, value);
		rejected(() =>
			verifyPasskeyProbeRegistration(
				{ ...current.registration, attestationObject: [...encode(changed)] },
				expected,
			),
		);
	}
	base.delete("fmt");
	rejected(() =>
		verifyPasskeyProbeRegistration(
			{ ...current.registration, attestationObject: [...encode(base)] },
			expected,
		),
	);
});

it("rejects duplicate outer keys and duplicate COSE keys in otherwise complete records", () => {
	const current = fixture();
	const outer = Buffer.from(current.registration.attestationObject);
	outer[0] = 0xa4;
	const duplicateOuter = Buffer.concat([outer, encode("fmt"), encode("none")]);
	rejected(() =>
		verifyPasskeyProbeRegistration(
			{ ...current.registration, attestationObject: [...duplicateOuter] },
			expected,
		),
	);
	const cose = encode(current.cose);
	cose[0] = 0xa6;
	const duplicateCose = Buffer.concat([
		current.registrationHeader,
		cose,
		encode(1),
		encode(2),
	]);
	rejected(() =>
		verifyPasskeyProbeRegistration(
			{
				...current.registration,
				attestationObject: current.attestation(duplicateCose),
			},
			expected,
		),
	);
});

it("bounds the aggregate CBOR entry count independently of depth", () => {
	const current = fixture();
	const child = new Map<string | number, Encodable>(
		Array.from({ length: 16 }, (_, index): [number, Encodable] => [index, 0]),
	);
	const payload = encode(
		new Map<string, Encodable>([
			["one", child],
			["two", child],
		]),
	);
	rejected(() =>
		verifyPasskeyProbeRegistration(
			{ ...current.registration, attestationObject: [...payload] },
			expected,
		),
	);
});

it.each([
	[1, 3],
	[3, -8],
	[-1, 2],
	[-2, Buffer.alloc(31)],
	[-3, Buffer.alloc(33)],
	[-2, "not bytes"],
	[-3, 0],
	[4, 0],
	["1", 2],
] as [string | number, Encodable][])(
	"rejects invalid COSE field %s",
	(key, value) => {
		const current = fixture();
		current.cose.set(key, value);
		current.registration.attestationObject = current.attestation();
		rejected(() =>
			verifyPasskeyProbeRegistration(current.registration, expected),
		);
	},
);

it("rejects missing COSE fields and an off-curve point", () => {
	const current = fixture();
	for (const key of [1, 3, -1, -2, -3]) {
		const changed = new Map(current.cose);
		changed.delete(key);
		rejected(() =>
			verifyPasskeyProbeRegistration(
				{
					...current.registration,
					attestationObject: current.attestation(
						Buffer.concat([current.registrationHeader, encode(changed)]),
					),
				},
				expected,
			),
		);
	}
	current.cose.set(-2, Buffer.alloc(32));
	current.cose.set(-3, Buffer.alloc(32));
	current.registration.attestationObject = current.attestation();
	rejected(() =>
		verifyPasskeyProbeRegistration(current.registration, expected),
	);
});

for (const operation of ["registration", "assertion"] as const) {
	it(`rejects ${operation} hostile records and arrays without invoking hooks`, () => {
		const current = fixture();
		const credential = current[operation];
		let hooks = 0;
		const hook = () => {
			hooks++;
			throw new Error("secret hook");
		};
		const traps = {
			get: hook,
			getPrototypeOf: hook,
			ownKeys: hook,
			getOwnPropertyDescriptor: hook,
			has: hook,
		};
		const revoked = Proxy.revocable({}, traps);
		revoked.revoke();
		const arrayAccessor = [...credential.rawId];
		Object.defineProperty(arrayAccessor, "0", { get: hook });
		const hiddenHook = Object.defineProperty(
			[...credential.rawId],
			Symbol.iterator,
			{ value: hook },
		);
		const candidates: unknown[] = [
			new Proxy(credential, traps),
			revoked.proxy,
			Object.defineProperty({ ...credential }, "id", { get: hook }),
			Object.defineProperty({ ...credential }, "rawId", { get: hook }),
			Object.defineProperty({ ...credential }, "extra", { get: hook }),
			{ ...credential, rawId: new Proxy(credential.rawId, traps) },
			{ ...credential, rawId: arrayAccessor },
			{ ...credential, rawId: hiddenHook },
			{ ...credential, id: { toString: hook, valueOf: hook, toJSON: hook } },
			{ ...credential, [Symbol("extra")]: 1 },
			Object.create(credential),
			Object.setPrototypeOf({ ...credential }, new Proxy({}, traps)),
		];
		for (const candidate of candidates)
			rejected(() =>
				operation === "registration"
					? verifyPasskeyProbeRegistration(candidate, expected)
					: verifyPasskeyProbeAssertion(candidate, current.assertionExpected),
			);
		expect(hooks).toBe(0);
	});

	it(`rejects ${operation} non-byte elements, holes and nonplain arrays`, () => {
		const current = fixture();
		const arrays: unknown[] = [
			new Uint8Array(32),
			Array(32),
			Object.assign(Array(32), { extra: 0 }),
			Object.setPrototypeOf(Array(32).fill(0), null),
		];
		for (const invalid of [
			-1,
			256,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"1",
			null,
			undefined,
			1n,
			{},
		])
			arrays.push([invalid, ...Array(31).fill(0)]);
		for (const rawId of arrays)
			rejected(() =>
				operation === "registration"
					? verifyPasskeyProbeRegistration(
							{ ...current.registration, rawId },
							expected,
						)
					: verifyPasskeyProbeAssertion(
							{ ...current.assertion, rawId },
							current.assertionExpected,
						),
			);
	});
}

it.each([
	["registration", "rawId", 31],
	["registration", "rawId", 33],
	["registration", "clientDataJSON", 0],
	["registration", "clientDataJSON", 2049],
	["registration", "attestationObject", 4097],
	["assertion", "rawId", 31],
	["assertion", "rawId", 33],
	["assertion", "clientDataJSON", 0],
	["assertion", "clientDataJSON", 2049],
	["assertion", "authenticatorData", 36],
	["assertion", "authenticatorData", 38],
	["assertion", "signature", 7],
	["assertion", "signature", 73],
	["assertion", "userHandle", 0],
	["assertion", "userHandle", 65],
] as const)("bounds %s %s at %i bytes", (operation, field, length) => {
	const current = fixture();
	const candidate = { ...current[operation], [field]: Array(length).fill(0) };
	rejected(() =>
		operation === "registration"
			? verifyPasskeyProbeRegistration(candidate, expected)
			: verifyPasskeyProbeAssertion(candidate, current.assertionExpected),
	);
});

it("rejects oversized sparse arrays before visiting elements", () => {
	const current = fixture();
	let hooks = 0;
	const oversized: number[] = [];
	oversized.length = 0xffffffff;
	Object.defineProperty(oversized, "0", {
		get: () => {
			hooks++;
			return 0;
		},
	});
	rejected(() =>
		verifyPasskeyProbeRegistration(
			{ ...current.registration, attestationObject: oversized },
			expected,
		),
	);
	expect(hooks).toBe(0);
});

it("accepts null-prototype data records without relaxing their exact fields", () => {
	const current = fixture();
	const registration = verifyPasskeyProbeRegistration(
		Object.assign(Object.create(null), current.registration),
		expected,
	);
	expect(
		verifyPasskeyProbeAssertion(
			Object.assign(Object.create(null), current.assertion),
			{ ...current.assertionExpected, registration },
		),
	).toEqual({ signCount: 1 });
});

it.each([null, undefined, true, 1, "secret", [], new Date()])(
	"uses fixed safe errors for invalid input %#",
	(value) => {
		rejected(() => verifyPasskeyProbeRegistration(value, expected));
		const current = fixture();
		rejected(() =>
			verifyPasskeyProbeAssertion(value, current.assertionExpected),
		);
	},
);

describe("transport only: maximal dummy byte-array packets, not ceremonies", () => {
	function maximalPacket(operation: "registration" | "assertion") {
		const common = {
			id: "A".repeat(43),
			type: "public-key",
			rawId: Array(32).fill(255),
			clientDataJSON: Array(2048).fill(255),
		};
		const credential =
			operation === "registration"
				? { ...common, attestationObject: Array(4096).fill(255) }
				: {
						...common,
						authenticatorData: Array(37).fill(255),
						signature: Array(72).fill(255),
						userHandle: Array(64).fill(255),
					};
		return { passed: true, credential };
	}

	it.each(["registration", "assertion"] as const)(
		"exports all %s field maxima within the 327680 result cap",
		(operation) => {
			const packet = maximalPacket(operation);
			const exported = scriptJsonResult(packet, 327680);
			expect(exported).toEqual(packet);
			expect(exported).not.toBe(packet);
		},
	);

	it("rejects the maximal registration packet at the former 8192 cap", () => {
		const packet = maximalPacket("registration");
		expect(() => scriptJsonResult(packet, 8192)).toThrow(
			"Script result byte limit exceeded",
		);
	});
});
