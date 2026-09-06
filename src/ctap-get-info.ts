import {
	type CtapCborValue,
	copyCtapBytes,
	decodeCtapCbor,
} from "./ctap-cbor.js";
import { AgentBrowserError } from "./errors.js";
import type {
	FidoHidCborConnection,
	FidoHidExchangeOptions,
} from "./fido-hid-connection.js";
import type { FidoHidResponseError } from "./fido-hid-response-control.js";

export type CtapConfiguredCapability =
	| "unsupported"
	| "unconfigured"
	| "configured";

export interface CtapGetInfo {
	versions: readonly string[];
	extensions?: readonly string[];
	aaguid: Uint8Array;
	options: {
		platform: boolean;
		residentKey: boolean;
		userPresence: boolean;
		clientPin: CtapConfiguredCapability;
		userVerification: CtapConfiguredCapability;
	};
	maxMessageSize?: bigint;
	pinProtocols?: readonly bigint[];
}

export type CtapGetInfoResult =
	| { kind: "info"; info: CtapGetInfo }
	| { kind: "ctap-error"; status: number };

function invalidInput(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid CTAP GetInfo response.",
	);
}

function strings(value: CtapCborValue): readonly string[] {
	if (value.kind !== "array") invalidInput();
	return value.items.map((item) => {
		if (item.kind !== "text") invalidInput();
		return item.value;
	});
}

function unsigned(value: CtapCborValue): bigint {
	if (value.kind !== "unsigned") invalidInput();
	return value.value;
}

function boolean(value: CtapCborValue): boolean {
	if (value.kind !== "simple" || (value.value !== 20 && value.value !== 21))
		invalidInput();
	return value.value === 21;
}

function defaultOptions(): CtapGetInfo["options"] {
	return {
		platform: false,
		residentKey: false,
		userPresence: true,
		clientPin: "unsupported",
		userVerification: "unsupported",
	};
}

function decodeOptions(value: CtapCborValue): CtapGetInfo["options"] {
	if (value.kind !== "map") invalidInput();
	const options = defaultOptions();
	for (const [key, option] of value.entries) {
		if (key.kind !== "text") continue;
		switch (key.value) {
			case "plat":
				options.platform = boolean(option);
				break;
			case "rk":
				options.residentKey = boolean(option);
				break;
			case "up":
				options.userPresence = boolean(option);
				break;
			case "clientPin":
				options.clientPin = boolean(option) ? "configured" : "unconfigured";
				break;
			case "uv":
				options.userVerification = boolean(option)
					? "configured"
					: "unconfigured";
				break;
		}
	}
	return options;
}

function fieldNumber(key: CtapCborValue): number | undefined {
	if (key.kind === "unsigned" && key.value >= 1n && key.value <= 6n)
		return Number(key.value);
	if (
		key.kind === "float" &&
		Number.isInteger(key.value) &&
		key.value >= 1 &&
		key.value <= 6
	)
		return key.value;
	return undefined;
}

export function encodeCtapGetInfoRequest(): Uint8Array {
	return new Uint8Array([0x04]);
}

export function decodeCtapGetInfoResponse(
	input: Uint8Array,
): CtapGetInfoResult {
	const owned = copyCtapBytes(input);
	try {
		const status = owned[0];
		if (status !== 0 && owned.length === 1)
			return { kind: "ctap-error", status };
		const root = decodeCtapCbor(owned.subarray(1));
		if (root.kind !== "map") invalidInput();
		if (status !== 0) return { kind: "ctap-error", status };
		let versions: readonly string[] | undefined;
		let aaguid: Uint8Array | undefined;
		let options = defaultOptions();
		const optional: Pick<
			CtapGetInfo,
			"extensions" | "maxMessageSize" | "pinProtocols"
		> = {};
		for (const [key, value] of root.entries) {
			switch (fieldNumber(key)) {
				case 1:
					versions = strings(value);
					break;
				case 2:
					optional.extensions = strings(value);
					break;
				case 3:
					if (value.kind !== "bytes" || value.value.length !== 16)
						invalidInput();
					aaguid = value.value;
					break;
				case 4:
					options = decodeOptions(value);
					break;
				case 5:
					optional.maxMessageSize = unsigned(value);
					break;
				case 6:
					if (value.kind !== "array") invalidInput();
					optional.pinProtocols = value.items.map(unsigned);
					break;
			}
		}
		if (versions === undefined || aaguid === undefined) invalidInput();
		return { kind: "info", info: { versions, aaguid, options, ...optional } };
	} finally {
		owned.fill(0);
	}
}

export async function queryCtapGetInfo(
	connection: FidoHidCborConnection,
	options?: FidoHidExchangeOptions,
): Promise<
	| CtapGetInfoResult
	| { kind: "hid-error"; code: number; error: FidoHidResponseError }
> {
	const response = await connection.exchange(
		encodeCtapGetInfoRequest(),
		options,
	);
	if (response.kind === "error")
		return { kind: "hid-error", code: response.code, error: response.error };
	try {
		return decodeCtapGetInfoResponse(response.payload);
	} catch (error) {
		void connection.close().catch(() => undefined);
		throw error;
	} finally {
		response.payload.fill(0);
	}
}
