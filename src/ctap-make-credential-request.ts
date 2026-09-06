import { encodeCtapCbor } from "./ctap-cbor-encoder.js";
import {
	type CtapCborValue,
	copyCtapBytes,
	ctapCborLimits,
} from "./ctap-cbor.js";
import { AgentBrowserError } from "./errors.js";

export interface CtapMakeCredentialDescriptor {
	type: "public-key";
	id: Uint8Array;
}

export interface CtapMakeCredentialParameter {
	type: "public-key";
	alg: number;
}

export interface CtapMakeCredentialRequest {
	clientDataHash: Uint8Array;
	rp: { id: string; name?: string };
	user: { id: Uint8Array; name?: string; displayName?: string };
	pubKeyCredParams: readonly CtapMakeCredentialParameter[];
	excludeList?: readonly CtapMakeCredentialDescriptor[];
	residentKey?: boolean;
	userVerification?: boolean;
}

const invalid = Symbol("invalid CTAP registration request");
const limited = Symbol("CTAP registration request limit");
const maximumUnsigned = (1n << 64n) - 1n;
type Entries = [CtapCborValue, CtapCborValue][];

function record(input: unknown, keys: readonly string[]) {
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw invalid;
	const descriptors = Object.getOwnPropertyDescriptors(input);
	const result: Record<string, unknown> = Object.create(null);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (typeof key !== "string" || !keys.includes(key)) throw invalid;
		const descriptor = descriptors[key];
		if (!Object.hasOwn(descriptor, "value")) throw invalid;
		result[key] = descriptor.value;
	}
	return result;
}

function copied(
	input: unknown,
	owned: Uint8Array[],
	maximum: number,
	exact = false,
): Uint8Array {
	let bytes: Uint8Array;
	try {
		bytes = copyCtapBytes(input as Uint8Array);
	} catch (error) {
		if (
			!exact &&
			error instanceof AgentBrowserError &&
			error.code === "resource-limit"
		)
			throw limited;
		throw invalid;
	}
	owned.push(bytes);
	if (exact && bytes.length !== maximum) throw invalid;
	if (bytes.length > maximum) throw limited;
	return bytes;
}

function text(
	value: unknown,
	maximum: number,
	required = false,
): CtapCborValue {
	if (typeof value !== "string" || (required && value.length === 0))
		throw invalid;
	if (value.length > maximum) throw limited;
	return { kind: "text", value };
}

function named(
	name: string,
	value: CtapCborValue,
): [CtapCborValue, CtapCborValue] {
	return [{ kind: "text", value: name }, value];
}

function entity(
	input: unknown,
	user: boolean,
	owned: Uint8Array[],
): CtapCborValue {
	const fields = record(
		input,
		user ? ["id", "name", "displayName"] : ["id", "name"],
	);
	const entries: Entries = [
		named(
			"id",
			user
				? { kind: "bytes", value: copied(fields.id, owned, 64) }
				: text(fields.id, ctapCborLimits.maxBytes, true),
		),
	];
	for (const name of user ? ["name", "displayName"] : ["name"])
		if (fields[name] !== undefined)
			entries.push(named(name, text(fields[name], 256)));
	return { kind: "map", entries };
}

function sequence(
	input: unknown,
	maximum: number,
	convert: (item: unknown) => CtapCborValue,
): CtapCborValue {
	if (!Array.isArray(input)) throw invalid;
	const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
	if (!Number.isSafeInteger(length) || length < 1) throw invalid;
	if (length > maximum) throw limited;
	const items: CtapCborValue[] = [];
	for (let index = 0; index < length; index++) {
		const slot = Object.getOwnPropertyDescriptor(input, String(index));
		if (!slot || !Object.hasOwn(slot, "value")) throw invalid;
		items.push(convert(slot.value));
	}
	return { kind: "array", items };
}

function algorithm(input: unknown): CtapCborValue {
	const fields = record(input, ["type", "alg"]);
	if (
		fields.type !== "public-key" ||
		typeof fields.alg !== "number" ||
		!Number.isSafeInteger(fields.alg) ||
		fields.alg === 0
	)
		throw invalid;
	return {
		kind: "map",
		entries: [
			named("type", { kind: "text", value: "public-key" }),
			named("alg", {
				kind: fields.alg < 0 ? "negative" : "unsigned",
				value: BigInt(fields.alg),
			}),
		],
	};
}

function descriptor(input: unknown, owned: Uint8Array[]): CtapCborValue {
	const fields = record(input, ["type", "id"]);
	if (fields.type !== "public-key") throw invalid;
	return {
		kind: "map",
		entries: [
			named("type", { kind: "text", value: "public-key" }),
			named("id", { kind: "bytes", value: copied(fields.id, owned, 1023) }),
		],
	};
}

export function encodeCtapMakeCredentialRequest(
	input: CtapMakeCredentialRequest,
	maxMessageSize = 1024n,
): Uint8Array {
	const owned: Uint8Array[] = [];
	let parameters: Uint8Array | undefined;
	let output: Uint8Array | undefined;
	try {
		if (
			typeof maxMessageSize !== "bigint" ||
			maxMessageSize < 1n ||
			maxMessageSize > maximumUnsigned
		)
			throw invalid;
		const request = record(input, [
			"clientDataHash",
			"rp",
			"user",
			"pubKeyCredParams",
			"excludeList",
			"residentKey",
			"userVerification",
		]);
		for (const name of ["residentKey", "userVerification"])
			if (request[name] !== undefined && typeof request[name] !== "boolean")
				throw invalid;
		const entries: Entries = [
			[
				{ kind: "unsigned", value: 1n },
				{
					kind: "bytes",
					value: copied(request.clientDataHash, owned, 32, true),
				},
			],
			[{ kind: "unsigned", value: 2n }, entity(request.rp, false, owned)],
			[{ kind: "unsigned", value: 3n }, entity(request.user, true, owned)],
			[
				{ kind: "unsigned", value: 4n },
				sequence(request.pubKeyCredParams, 16, algorithm),
			],
		];
		if (request.excludeList !== undefined)
			entries.push([
				{ kind: "unsigned", value: 5n },
				sequence(request.excludeList, 64, (item) => descriptor(item, owned)),
			]);
		entries.push([
			{ kind: "unsigned", value: 7n },
			{
				kind: "map",
				entries: [
					named("rk", {
						kind: "simple",
						value: request.residentKey === true ? 21 : 20,
					}),
					named("uv", {
						kind: "simple",
						value: request.userVerification === true ? 21 : 20,
					}),
				],
			},
		]);
		try {
			parameters = encodeCtapCbor({ kind: "map", entries });
		} catch (error) {
			if (error instanceof AgentBrowserError && error.code === "resource-limit")
				throw limited;
			throw invalid;
		}
		const length = parameters.length + 1;
		if (length > ctapCborLimits.maxBytes || BigInt(length) > maxMessageSize)
			throw limited;
		output = new Uint8Array(length);
		output[0] = 0x01;
		output.set(parameters, 1);
		return output;
	} catch (error) {
		output?.fill(0);
		throw new AgentBrowserError(
			error === limited ? "resource-limit" : "invalid-input",
			error === limited
				? "CTAP registration request limit exceeded."
				: "Invalid CTAP registration request.",
		);
	} finally {
		parameters?.fill(0);
		for (const bytes of owned) bytes.fill(0);
	}
}
