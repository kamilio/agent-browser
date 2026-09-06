import {
	type CtapCborValue,
	copyCtapBytes,
	decodeCtapCbor,
} from "./ctap-cbor.js";
import {
	type CtapRegistrationAuthenticatorData,
	decodeCtapRegistrationAuthenticatorData,
} from "./ctap-registration-authenticator-data.js";
import { AgentBrowserError } from "./errors.js";

export interface CtapCredentialResponse {
	format: string;
	authenticatorData: Uint8Array;
	attestationStatement: Extract<CtapCborValue, { kind: "map" }>;
	attestedCredentialData: CtapRegistrationAuthenticatorData;
}

export type CtapMakeCredentialResult =
	| { kind: "credential"; credential: CtapCredentialResponse }
	| { kind: "ctap-error"; status: number };

const invalid = Symbol("invalid CTAP MakeCredential response");
const limited = Symbol("CTAP MakeCredential response limit");
const unsupported = Symbol("unsupported CTAP MakeCredential response");
const intrinsicFill = Uint8Array.prototype.fill;

function wipeBytes(bytes: Uint8Array): void {
	try {
		intrinsicFill.call(bytes, 0);
	} catch {}
}

function wipeTree(value: CtapCborValue): void {
	if (value.kind === "bytes") wipeBytes(value.value);
	else if (value.kind === "float") wipeBytes(value.encoding);
	else if (value.kind === "array") {
		for (const item of value.items) wipeTree(item);
	} else if (value.kind === "map") {
		for (const [key, item] of value.entries) {
			wipeTree(key);
			wipeTree(item);
		}
	}
}

function wipeRegistration(data: CtapRegistrationAuthenticatorData): void {
	wipeBytes(data.rpIdHash);
	wipeBytes(data.aaguid);
	wipeBytes(data.credentialId);
	wipeBytes(data.credentialPublicKeyBytes);
	const key = data.credentialPublicKey;
	if (key.kind === "rsa") {
		wipeBytes(key.modulus);
		wipeBytes(key.exponent);
	} else {
		wipeBytes(key.x);
		if (key.kind === "ec2" && typeof key.y !== "boolean") wipeBytes(key.y);
	}
	if (data.extensions !== undefined) wipeTree(data.extensions);
}

export function wipeCtapCredentialResponse(
	credential: CtapCredentialResponse,
): void {
	wipeBytes(credential.authenticatorData);
	wipeTree(credential.attestationStatement);
	wipeRegistration(credential.attestedCredentialData);
}

function fieldNumber(key: CtapCborValue): number | undefined {
	if (key.kind === "unsigned" && key.value >= 1n && key.value <= 5n)
		return Number(key.value);
	if (
		key.kind === "float" &&
		Number.isInteger(key.value) &&
		key.value >= 1 &&
		key.value <= 5
	)
		return key.value;
	return undefined;
}

function cloneBytes(source: Uint8Array, selected: Uint8Array[]): Uint8Array {
	const copy = source.slice();
	selected.push(copy);
	return copy;
}

function cloneTree(
	value: CtapCborValue,
	selected: Uint8Array[],
): CtapCborValue {
	switch (value.kind) {
		case "bytes":
			return { kind: "bytes", value: cloneBytes(value.value, selected) };
		case "float":
			return {
				kind: "float",
				value: value.value,
				encoding: cloneBytes(value.encoding, selected),
			};
		case "array":
			return {
				kind: "array",
				items: value.items.map((item) => cloneTree(item, selected)),
			};
		case "map":
			return {
				kind: "map",
				entries: value.entries.map(
					([key, item]) =>
						[cloneTree(key, selected), cloneTree(item, selected)] as const,
				),
			};
		default:
			return { ...value };
	}
}

export function decodeCtapMakeCredentialResponse(
	input: Uint8Array,
): CtapMakeCredentialResult {
	let owned: Uint8Array | undefined;
	let root: CtapCborValue | undefined;
	let parsed: CtapRegistrationAuthenticatorData | undefined;
	const selected: Uint8Array[] = [];
	let returned = false;
	try {
		owned = copyCtapBytes(input);
		const status = owned[0];
		if (status !== 0 && owned.length === 1)
			return { kind: "ctap-error", status };
		root = decodeCtapCbor(owned.subarray(1));
		if (root.kind !== "map") throw invalid;
		if (status !== 0) return { kind: "ctap-error", status };
		const fields = new Map<number, CtapCborValue>();
		for (const [key, value] of root.entries) {
			const number = fieldNumber(key);
			if (number !== undefined) fields.set(number, value);
		}
		const format = fields.get(1);
		const data = fields.get(2);
		const statement = fields.get(3);
		if (format?.kind !== "text" || format.value.length === 0) throw invalid;
		if (format.value.length > 64) throw limited;
		if (data?.kind !== "bytes" || statement?.kind !== "map") throw invalid;
		const authenticatorData = cloneBytes(data.value, selected);
		parsed = decodeCtapRegistrationAuthenticatorData(authenticatorData);
		const attestationStatement = cloneTree(statement, selected);
		if (attestationStatement.kind !== "map") throw invalid;
		const enterprise = fields.get(4);
		if (enterprise !== undefined) {
			if (
				enterprise.kind !== "simple" ||
				(enterprise.value !== 20 && enterprise.value !== 21)
			)
				throw invalid;
			if (enterprise.value === 21) throw unsupported;
		}
		const largeBlobKey = fields.get(5);
		if (largeBlobKey !== undefined) {
			if (largeBlobKey.kind !== "bytes") throw invalid;
			throw unsupported;
		}
		const credential: CtapCredentialResponse = {
			format: format.value,
			authenticatorData,
			attestationStatement,
			attestedCredentialData: parsed,
		};
		returned = true;
		return { kind: "credential", credential };
	} catch (error) {
		const code =
			error === limited ||
			(error instanceof AgentBrowserError && error.code === "resource-limit")
				? "resource-limit"
				: error === unsupported ||
						(error instanceof AgentBrowserError && error.code === "unsupported")
					? "unsupported"
					: "invalid-input";
		throw new AgentBrowserError(
			code,
			code === "resource-limit"
				? "CTAP MakeCredential response limit exceeded."
				: code === "unsupported"
					? "Unsupported CTAP MakeCredential response."
					: "Invalid CTAP MakeCredential response.",
		);
	} finally {
		if (owned !== undefined) wipeBytes(owned);
		if (root !== undefined) wipeTree(root);
		if (!returned) {
			for (const bytes of selected) wipeBytes(bytes);
			if (parsed !== undefined) wipeRegistration(parsed);
		}
	}
}
