import {
	type CtapCborValue,
	copyCtapBytes,
	decodeCtapCbor,
} from "./ctap-cbor.js";
import {
	type CtapCredentialPublicKey,
	decodeCtapCredentialPublicKeyPrefix,
} from "./ctap-credential-public-key.js";
import { AgentBrowserError } from "./errors.js";

export interface CtapRegistrationAuthenticatorData {
	rpIdHash: Uint8Array;
	flags: number;
	signatureCounter: number;
	aaguid: Uint8Array;
	credentialId: Uint8Array;
	credentialPublicKey: CtapCredentialPublicKey;
	credentialPublicKeyBytes: Uint8Array;
	extensions?: Extract<CtapCborValue, { kind: "map" }>;
}

const invalid = Symbol("invalid CTAP registration authenticator data");
const limited = Symbol("CTAP registration authenticator data limit");

function wipe(value: CtapCborValue): void {
	if (value.kind === "bytes") value.value.fill(0);
	else if (value.kind === "float") value.encoding.fill(0);
	else if (value.kind === "array") {
		for (const item of value.items) wipe(item);
	} else if (value.kind === "map") {
		for (const [key, item] of value.entries) {
			wipe(key);
			wipe(item);
		}
	}
}

function wipeKey(key: CtapCredentialPublicKey): void {
	if (key.kind === "rsa") {
		key.modulus.fill(0);
		key.exponent.fill(0);
	} else {
		key.x.fill(0);
		if (key.kind === "ec2" && typeof key.y !== "boolean") key.y.fill(0);
	}
}

export function decodeCtapRegistrationAuthenticatorData(
	input: Uint8Array,
): CtapRegistrationAuthenticatorData {
	let owned: Uint8Array | undefined;
	let key: CtapCredentialPublicKey | undefined;
	let extension: CtapCborValue | undefined;
	const selected: Uint8Array[] = [];
	let returned = false;
	try {
		owned = copyCtapBytes(input);
		if (owned.length < 55) throw invalid;
		const flags = owned[32];
		if ((flags & 0x40) === 0 || (flags & 0x18) === 0x10) throw invalid;
		const credentialLength = owned[53] * 256 + owned[54];
		if (credentialLength > 1023) throw limited;
		if (credentialLength === 0 || owned.length <= 55 + credentialLength)
			throw invalid;
		const keyStart = 55 + credentialLength;
		const decoded = decodeCtapCredentialPublicKeyPrefix(
			owned.subarray(keyStart),
		);
		key = decoded.publicKey;
		const keyEnd = keyStart + decoded.bytesRead;
		if ((flags & 0x80) !== 0) {
			if (keyEnd === owned.length) throw invalid;
			extension = decodeCtapCbor(owned.subarray(keyEnd));
			if (
				extension.kind !== "map" ||
				extension.entries.some(
					([label]) => label.kind !== "text" || label.value.length === 0,
				)
			)
				throw invalid;
		} else if (keyEnd !== owned.length) throw invalid;
		const copy = (start: number, end: number): Uint8Array => {
			const bytes = owned?.slice(start, end);
			if (bytes === undefined) throw invalid;
			selected.push(bytes);
			return bytes;
		};
		const result: CtapRegistrationAuthenticatorData = {
			rpIdHash: copy(0, 32),
			flags,
			signatureCounter:
				owned[33] * 0x1000000 +
				owned[34] * 0x10000 +
				owned[35] * 256 +
				owned[36],
			aaguid: copy(37, 53),
			credentialId: copy(55, keyStart),
			credentialPublicKey: key,
			credentialPublicKeyBytes: copy(keyStart, keyEnd),
		};
		if (extension?.kind === "map") result.extensions = extension;
		returned = true;
		return result;
	} catch (error) {
		const code =
			error === limited ||
			(error instanceof AgentBrowserError && error.code === "resource-limit")
				? "resource-limit"
				: error instanceof AgentBrowserError && error.code === "unsupported"
					? "unsupported"
					: "invalid-input";
		throw new AgentBrowserError(
			code,
			code === "resource-limit"
				? "CTAP registration authenticator data limit exceeded."
				: code === "unsupported"
					? "Unsupported CTAP registration authenticator data."
					: "Invalid CTAP registration authenticator data.",
		);
	} finally {
		owned?.fill(0);
		if (!returned) {
			for (const bytes of selected) bytes.fill(0);
			if (key !== undefined) wipeKey(key);
			if (extension !== undefined) wipe(extension);
		}
	}
}
