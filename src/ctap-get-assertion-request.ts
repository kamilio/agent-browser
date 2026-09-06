import { encodeCtapCbor } from "./ctap-cbor-encoder.js";
import {
	type CtapCborValue,
	copyCtapBytes,
	ctapCborLimits,
} from "./ctap-cbor.js";
import { AgentBrowserError } from "./errors.js";

export interface CtapGetAssertionCredential {
	type: "public-key";
	id: Uint8Array;
}

export interface CtapGetAssertionRequest {
	rpId: string;
	clientDataHash: Uint8Array;
	allowList?: readonly CtapGetAssertionCredential[];
	userVerification?: boolean;
}

const invalid = Symbol("invalid CTAP assertion request");
const limited = Symbol("CTAP assertion request limit");
const maximumUnsigned = (1n << 64n) - 1n;

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
	exactLength?: number,
): Uint8Array {
	let bytes: Uint8Array;
	try {
		bytes = copyCtapBytes(input as Uint8Array);
	} catch (error) {
		if (
			exactLength === undefined &&
			error instanceof AgentBrowserError &&
			error.code === "resource-limit"
		)
			throw limited;
		throw invalid;
	}
	owned.push(bytes);
	if (exactLength !== undefined && bytes.length !== exactLength) throw invalid;
	return bytes;
}

function credentials(input: unknown, owned: Uint8Array[]): CtapCborValue {
	if (!Array.isArray(input)) throw invalid;
	const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
	if (!Number.isSafeInteger(length) || length < 1) throw invalid;
	if (length > 64) throw limited;
	const items: CtapCborValue[] = [];
	for (let index = 0; index < length; index++) {
		const slot = Object.getOwnPropertyDescriptor(input, String(index));
		if (!slot || !Object.hasOwn(slot, "value")) throw invalid;
		const credential = record(slot.value, ["type", "id"]);
		if (credential.type !== "public-key") throw invalid;
		const identifier = copied(credential.id, owned);
		if (identifier.length > 1023) throw limited;
		items.push({
			kind: "map",
			entries: [
				[
					{ kind: "text", value: "type" },
					{ kind: "text", value: "public-key" },
				],
				[
					{ kind: "text", value: "id" },
					{ kind: "bytes", value: identifier },
				],
			],
		});
	}
	return { kind: "array", items };
}

export function encodeCtapGetAssertionRequest(
	input: CtapGetAssertionRequest,
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
			"rpId",
			"clientDataHash",
			"allowList",
			"userVerification",
		]);
		if (typeof request.rpId !== "string" || request.rpId.length === 0)
			throw invalid;
		if (request.rpId.length > ctapCborLimits.maxBytes) throw limited;
		const hash = copied(request.clientDataHash, owned, 32);
		const verification = request.userVerification;
		if (verification !== undefined && typeof verification !== "boolean")
			throw invalid;
		const entries: [CtapCborValue, CtapCborValue][] = [
			[
				{ kind: "unsigned", value: 1n },
				{ kind: "text", value: request.rpId },
			],
			[
				{ kind: "unsigned", value: 2n },
				{ kind: "bytes", value: hash },
			],
		];
		if (request.allowList !== undefined)
			entries.push([
				{ kind: "unsigned", value: 3n },
				credentials(request.allowList, owned),
			]);
		entries.push([
			{ kind: "unsigned", value: 5n },
			{
				kind: "map",
				entries: [
					[
						{ kind: "text", value: "up" },
						{ kind: "simple", value: 21 },
					],
					[
						{ kind: "text", value: "uv" },
						{ kind: "simple", value: verification === true ? 21 : 20 },
					],
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
		output[0] = 0x02;
		output.set(parameters, 1);
		return output;
	} catch (error) {
		output?.fill(0);
		throw new AgentBrowserError(
			error === limited ? "resource-limit" : "invalid-input",
			error === limited
				? "CTAP assertion request limit exceeded."
				: "Invalid CTAP assertion request.",
		);
	} finally {
		parameters?.fill(0);
		for (const bytes of owned) bytes.fill(0);
	}
}
