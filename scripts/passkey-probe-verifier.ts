import {
	type KeyObject,
	createHash,
	createPublicKey,
	verify,
} from "node:crypto";
import { types } from "node:util";

export interface VerifiedProbeRegistration {
	publicKey: KeyObject;
	credentialId: Uint8Array;
	credentialIdText: string;
	signCount: number;
	rpId: string;
	origin: string;
}

interface ProbeScope {
	origin: string;
	rpId: string;
	challenge: Uint8Array;
}

type Cbor = number | string | Uint8Array | Map<string | number, Cbor>;

const failureMessage = "Passkey probe verification failed";
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function requireValid(condition: unknown): asserts condition {
	if (!condition) throw new Error(failureMessage);
}

function dataProperty(value: object, key: PropertyKey): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	requireValid(descriptor && Object.hasOwn(descriptor, "value"));
	return descriptor.value;
}

function record(
	value: unknown,
	fields: readonly string[],
): Record<string, unknown> {
	requireValid(
		typeof value === "object" && value !== null && !types.isProxy(value),
	);
	const prototype = Object.getPrototypeOf(value);
	requireValid(prototype === Object.prototype || prototype === null);
	const keys = Reflect.ownKeys(value);
	requireValid(keys.length === fields.length);
	const result: Record<string, unknown> = Object.create(null);
	for (const field of fields) result[field] = dataProperty(value, field);
	return result;
}

function bytes(value: unknown, minimum: number, maximum: number): Uint8Array {
	requireValid(
		typeof value === "object" && value !== null && !types.isProxy(value),
	);
	requireValid(
		Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype,
	);
	const length = dataProperty(value, "length");
	requireValid(
		typeof length === "number" && length >= minimum && length <= maximum,
	);
	requireValid(Reflect.ownKeys(value).length === length + 1);
	const result = new Uint8Array(length);
	for (let index = 0; index < length; index++) {
		const item = dataProperty(value, String(index));
		requireValid(
			typeof item === "number" &&
				Number.isInteger(item) &&
				item >= 0 &&
				item <= 255,
		);
		result[index] = item;
	}
	return result;
}

function equalBytes(actual: Uint8Array, expected: Uint8Array): boolean {
	return (
		actual.length === expected.length &&
		actual.every((byte, index) => byte === expected[index])
	);
}

function base64url(value: Uint8Array): string {
	return Buffer.from(value).toString("base64url");
}

function hash(value: string | Uint8Array): Buffer {
	return createHash("sha256").update(value).digest();
}

function scope(expected: ProbeScope): void {
	requireValid(expected.origin === "https://passkeys.fixture.invalid");
	requireValid(expected.rpId === "passkeys.fixture.invalid");
}

function clientData(
	value: unknown,
	expected: ProbeScope,
	type: string,
): Uint8Array {
	const original = bytes(value, 1, 2048);
	const text = utf8.decode(original);
	const parsed: unknown = JSON.parse(text);
	const fields = record(parsed, ["type", "challenge", "origin", "crossOrigin"]);
	requireValid(JSON.stringify(parsed) === text);
	requireValid(
		fields.type === type && fields.challenge === base64url(expected.challenge),
	);
	requireValid(
		fields.origin === expected.origin && fields.crossOrigin === false,
	);
	return original;
}

function decodeCbor(input: Uint8Array): Cbor {
	requireValid(input.length > 0 && input.length <= 4096);
	let offset = 0;
	let entries = 0;
	function take(length: number): Uint8Array {
		requireValid(length <= input.length - offset);
		const result = input.subarray(offset, offset + length);
		offset += length;
		return result;
	}
	function read(depth: number): Cbor {
		requireValid(depth <= 4);
		const header = take(1)[0];
		const major = header >>> 5;
		const additional = header & 31;
		requireValid(
			major === 0 || major === 1 || major === 2 || major === 3 || major === 5,
		);
		requireValid(additional <= 26);
		let length = additional;
		if (additional >= 24) {
			const width = 2 ** (additional - 24);
			length = 0;
			for (const byte of take(width)) length = length * 256 + byte;
			requireValid(length >= (width === 1 ? 24 : width === 2 ? 256 : 65536));
		}
		if (major === 0) return length;
		if (major === 1) return -1 - length;
		if (major === 2) return take(length);
		if (major === 3) return utf8.decode(take(length));
		entries += length;
		requireValid(length <= 16 && entries <= 32);
		const result = new Map<string | number, Cbor>();
		for (let index = 0; index < length; index++) {
			const key = read(depth + 1);
			requireValid(typeof key === "string" || typeof key === "number");
			requireValid(!result.has(key));
			result.set(key, read(depth + 1));
		}
		return result;
	}
	const result = read(0);
	requireValid(offset === input.length);
	return result;
}

function exactMap(
	value: Cbor | undefined,
	keys: readonly (number | string)[],
): Map<string | number, Cbor> {
	requireValid(value instanceof Map && value.size === keys.length);
	for (const key of keys) requireValid(value.has(key));
	return value;
}

function authHeader(
	value: Uint8Array,
	rpId: string,
	flags: number,
	counter: number,
): void {
	requireValid(
		value.length >= 37 && equalBytes(value.subarray(0, 32), hash(rpId)),
	);
	requireValid(value[32] === flags);
	requireValid(
		new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(
			33,
		) === counter,
	);
}

function strictDer(signature: Uint8Array): void {
	requireValid(signature[0] === 0x30 && signature[1] === signature.length - 2);
	let offset = 2;
	for (let index = 0; index < 2; index++) {
		requireValid(signature[offset++] === 0x02);
		const length = signature[offset++];
		requireValid(
			length >= 1 && length <= 33 && offset + length <= signature.length,
		);
		const integer = signature.subarray(offset, offset + length);
		requireValid((integer[0] & 0x80) === 0);
		if (integer[0] === 0) {
			requireValid(length > 1 && (integer[1] & 0x80) !== 0);
		} else {
			requireValid(length <= 32);
		}
		offset += length;
	}
	requireValid(offset === signature.length);
}

export function verifyPasskeyProbeRegistration(
	value: unknown,
	expected: ProbeScope,
): VerifiedProbeRegistration {
	try {
		scope(expected);
		const fields = record(value, [
			"id",
			"type",
			"rawId",
			"clientDataJSON",
			"attestationObject",
		]);
		const credentialId = bytes(fields.rawId, 32, 32);
		const credentialIdText = base64url(credentialId);
		requireValid(
			fields.id === credentialIdText && fields.type === "public-key",
		);
		clientData(fields.clientDataJSON, expected, "webauthn.create");
		const attestation = exactMap(
			decodeCbor(bytes(fields.attestationObject, 1, 4096)),
			["fmt", "attStmt", "authData"],
		);
		requireValid(attestation.get("fmt") === "none");
		exactMap(attestation.get("attStmt"), []);
		const authData = attestation.get("authData");
		requireValid(authData instanceof Uint8Array && authData.length > 87);
		authHeader(authData, expected.rpId, 0x41, 0);
		requireValid(authData.subarray(37, 53).every((byte) => byte === 0));
		requireValid(authData[53] === 0 && authData[54] === 32);
		requireValid(equalBytes(authData.subarray(55, 87), credentialId));
		const cose = exactMap(
			decodeCbor(authData.subarray(87)),
			[1, 3, -1, -2, -3],
		);
		requireValid(cose.get(1) === 2 && cose.get(3) === -7 && cose.get(-1) === 1);
		const coordinateX = cose.get(-2);
		const coordinateY = cose.get(-3);
		requireValid(
			coordinateX instanceof Uint8Array && coordinateX.length === 32,
		);
		requireValid(
			coordinateY instanceof Uint8Array && coordinateY.length === 32,
		);
		const publicKey = createPublicKey({
			format: "jwk",
			key: {
				kty: "EC",
				crv: "P-256",
				x: base64url(coordinateX),
				y: base64url(coordinateY),
			},
		});
		return {
			publicKey,
			credentialId,
			credentialIdText,
			signCount: 0,
			rpId: expected.rpId,
			origin: expected.origin,
		};
	} catch {
		throw new Error(failureMessage);
	}
}

export function verifyPasskeyProbeAssertion(
	value: unknown,
	expected: ProbeScope & {
		userHandle: Uint8Array;
		registration: VerifiedProbeRegistration;
	},
): { signCount: number } {
	try {
		scope(expected);
		const registration = expected.registration;
		requireValid(
			registration.rpId === expected.rpId &&
				registration.origin === expected.origin,
		);
		requireValid(registration.signCount === 0);
		const fields = record(value, [
			"id",
			"type",
			"rawId",
			"clientDataJSON",
			"authenticatorData",
			"signature",
			"userHandle",
		]);
		const credentialId = bytes(fields.rawId, 32, 32);
		requireValid(
			fields.id === base64url(credentialId) && fields.type === "public-key",
		);
		requireValid(
			fields.id === registration.credentialIdText &&
				equalBytes(credentialId, registration.credentialId),
		);
		requireValid(
			equalBytes(bytes(fields.userHandle, 1, 64), expected.userHandle),
		);
		const originalClientData = clientData(
			fields.clientDataJSON,
			expected,
			"webauthn.get",
		);
		const authData = bytes(fields.authenticatorData, 37, 37);
		authHeader(authData, expected.rpId, 1, 1);
		requireValid(1 > registration.signCount);
		const signature = bytes(fields.signature, 8, 72);
		strictDer(signature);
		requireValid(
			verify(
				"sha256",
				Buffer.concat([authData, hash(originalClientData)]),
				{ key: registration.publicKey, dsaEncoding: "der" },
				signature,
			),
		);
		return { signCount: 1 };
	} catch {
		throw new Error(failureMessage);
	}
}
