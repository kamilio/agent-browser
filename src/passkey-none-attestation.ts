import { encodeCtapCbor } from "./ctap-cbor-encoder.js";
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

const invalid = Symbol("invalid none attestation object");
const limited = Symbol("none attestation object limit");
const unsupported = Symbol("unsupported none attestation object");
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

export function projectNoneAttestationObject(input: Uint8Array): Uint8Array {
	let owned: Uint8Array | undefined;
	let root: CtapCborValue | undefined;
	let registration: CtapRegistrationAuthenticatorData | undefined;
	let output: Uint8Array | undefined;
	let returned = false;
	try {
		owned = copyCtapBytes(input);
		root = decodeCtapCbor(owned);
		if (root.kind !== "map" || root.entries.length !== 3) throw invalid;
		const fields = new Map<string, CtapCborValue>();
		for (const [key, value] of root.entries) {
			if (
				key.kind !== "text" ||
				(key.value !== "fmt" &&
					key.value !== "authData" &&
					key.value !== "attStmt")
			)
				throw invalid;
			fields.set(key.value, value);
		}
		const format = fields.get("fmt");
		const authData = fields.get("authData");
		const statement = fields.get("attStmt");
		if (format?.kind !== "text" || format.value.length === 0) throw invalid;
		if (format.value.length > 64) throw limited;
		if (authData?.kind !== "bytes" || statement?.kind !== "map") throw invalid;
		registration = decodeCtapRegistrationAuthenticatorData(authData.value);
		const retain =
			format.value === "packed" &&
			registration.aaguid.every((byte) => byte === 0) &&
			!statement.entries.some(
				([key]) => key.kind === "text" && key.value === "x5c",
			);
		if (retain) {
			let algorithm: CtapCborValue | undefined;
			let signature: CtapCborValue | undefined;
			for (const [key, value] of statement.entries) {
				if (key.kind !== "text" || (key.value !== "alg" && key.value !== "sig"))
					throw unsupported;
				if (key.value === "alg") algorithm = value;
				else signature = value;
			}
			if (
				(algorithm?.kind !== "unsigned" && algorithm?.kind !== "negative") ||
				algorithm.value !==
					BigInt(registration.credentialPublicKey.algorithm) ||
				signature?.kind !== "bytes" ||
				signature.value.length === 0
			)
				throw invalid;
			output = copyCtapBytes(owned);
		} else {
			output = encodeCtapCbor({
				kind: "map",
				entries: [
					[
						{ kind: "text", value: "fmt" },
						{ kind: "text", value: "none" },
					],
					[{ kind: "text", value: "authData" }, authData],
					[
						{ kind: "text", value: "attStmt" },
						{ kind: "map", entries: [] },
					],
				],
			});
		}
		returned = true;
		return output;
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
				? "None attestation object exceeds limits"
				: code === "unsupported"
					? "Unsupported none attestation object"
					: "Invalid none attestation object",
		);
	} finally {
		if (owned !== undefined) wipeBytes(owned);
		if (root !== undefined) wipeTree(root);
		if (registration !== undefined) wipeRegistration(registration);
		if (!returned && output !== undefined) wipeBytes(output);
	}
}
