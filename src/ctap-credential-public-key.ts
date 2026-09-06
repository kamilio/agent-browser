import {
	type CtapCborValue,
	decodeCtapCbor,
	decodeCtapCborPrefix,
} from "./ctap-cbor.js";
import { AgentBrowserError } from "./errors.js";

export type CtapCredentialPublicKey =
	| {
			kind: "ec2";
			algorithm: -7 | -35 | -36;
			curve: 1 | 2 | 3;
			x: Uint8Array;
			y: Uint8Array | boolean;
	  }
	| {
			kind: "okp";
			algorithm: -8;
			curve: 6 | 7;
			x: Uint8Array;
	  }
	| {
			kind: "rsa";
			algorithm: -37 | -38 | -39 | -257 | -258 | -259;
			modulus: Uint8Array;
			exponent: Uint8Array;
	  };

export interface CtapCredentialPublicKeyPrefix {
	publicKey: CtapCredentialPublicKey;
	bytesRead: number;
}

const invalid = Symbol("invalid CTAP credential public key");
const limited = Symbol("CTAP credential public key limit");
const unsupported = Symbol("unsupported CTAP credential public key");
const ecAlgorithms = new Set([-7n, -35n, -36n]);
const rsaAlgorithms = new Set([-37n, -38n, -39n, -257n, -258n, -259n]);

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

function integer(value: CtapCborValue | undefined): bigint {
	if (value?.kind !== "unsigned" && value?.kind !== "negative") throw invalid;
	return value.value;
}

function bytes(value: CtapCborValue | undefined): Uint8Array {
	if (value?.kind !== "bytes") throw invalid;
	return value.value;
}

function publicKey(
	root: CtapCborValue,
	selected: Uint8Array[],
): CtapCredentialPublicKey {
	if (root.kind !== "map") throw invalid;
	const fields = new Map<bigint, CtapCborValue>();
	for (const [key, value] of root.entries) fields.set(integer(key), value);
	const keyType = integer(fields.get(1n));
	const algorithm = integer(fields.get(3n));
	if (keyType !== 1n && keyType !== 2n && keyType !== 3n) throw unsupported;
	const algorithmKeyType =
		algorithm === -8n
			? 1n
			: ecAlgorithms.has(algorithm)
				? 2n
				: rsaAlgorithms.has(algorithm)
					? 3n
					: undefined;
	if (algorithmKeyType === undefined) throw unsupported;
	if (keyType !== algorithmKeyType) throw invalid;
	const labels = keyType === 2n ? [1n, 3n, -1n, -2n, -3n] : [1n, 3n, -1n, -2n];
	if (
		fields.size !== labels.length ||
		labels.some((label) => !fields.has(label))
	)
		throw invalid;
	const copy = (source: Uint8Array): Uint8Array => {
		const owned = source.slice();
		selected.push(owned);
		return owned;
	};
	if (keyType === 3n) {
		const modulus = bytes(fields.get(-1n));
		const exponent = bytes(fields.get(-2n));
		if (modulus.length > 2048 || exponent.length > 2048) throw limited;
		if (
			modulus.length < 256 ||
			modulus[0] === 0 ||
			(modulus.length === 256 && modulus[0] < 128) ||
			exponent.length === 0 ||
			exponent[0] === 0
		)
			throw invalid;
		return {
			kind: "rsa",
			algorithm: Number(algorithm) as -37 | -38 | -39 | -257 | -258 | -259,
			modulus: copy(modulus),
			exponent: copy(exponent),
		};
	}
	const curve = integer(fields.get(-1n));
	const coordinate = bytes(fields.get(-2n));
	if (keyType === 1n) {
		if (curve !== 6n && curve !== 7n) throw unsupported;
		if (coordinate.length !== (curve === 6n ? 32 : 57)) throw invalid;
		return {
			kind: "okp",
			algorithm: -8,
			curve: Number(curve) as 6 | 7,
			x: copy(coordinate),
		};
	}
	if (curve !== 1n && curve !== 2n && curve !== 3n) throw unsupported;
	const coordinateLength = curve === 1n ? 32 : curve === 2n ? 48 : 66;
	if (coordinate.length !== coordinateLength) throw invalid;
	const ordinate = fields.get(-3n);
	if (ordinate?.kind === "bytes") {
		if (ordinate.value.length !== coordinateLength) throw invalid;
	} else if (
		ordinate?.kind !== "simple" ||
		(ordinate.value !== 20 && ordinate.value !== 21)
	)
		throw invalid;
	return {
		kind: "ec2",
		algorithm: Number(algorithm) as -7 | -35 | -36,
		curve: Number(curve) as 1 | 2 | 3,
		x: copy(coordinate),
		y: ordinate.kind === "bytes" ? copy(ordinate.value) : ordinate.value === 21,
	};
}

function decode(
	input: Uint8Array,
	complete: boolean,
): CtapCredentialPublicKeyPrefix {
	let root: CtapCborValue | undefined;
	const selected: Uint8Array[] = [];
	let returned = false;
	try {
		const decoded = complete
			? { value: decodeCtapCbor(input), bytesRead: 0 }
			: decodeCtapCborPrefix(input);
		root = decoded.value;
		const result = {
			publicKey: publicKey(root, selected),
			bytesRead: decoded.bytesRead,
		};
		returned = true;
		return result;
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
				? "CTAP credential public key limit exceeded."
				: code === "unsupported"
					? "Unsupported CTAP credential public key."
					: "Invalid CTAP credential public key.",
		);
	} finally {
		if (root !== undefined) wipe(root);
		if (!returned) for (const owned of selected) owned.fill(0);
	}
}

export function decodeCtapCredentialPublicKey(
	input: Uint8Array,
): CtapCredentialPublicKey {
	return decode(input, true).publicKey;
}

export function decodeCtapCredentialPublicKeyPrefix(
	input: Uint8Array,
): CtapCredentialPublicKeyPrefix {
	return decode(input, false);
}
