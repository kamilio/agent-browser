import {
	type CtapCborValue,
	copyCtapBytes,
	decodeCtapCbor,
} from "./ctap-cbor.js";
import { AgentBrowserError } from "./errors.js";

export interface CtapAssertionResponse {
	authenticatorData: Uint8Array;
	signature: Uint8Array;
	credentialId?: Uint8Array;
	user?: {
		id: Uint8Array;
		name?: string;
		displayName?: string;
		icon?: string;
	};
	numberOfCredentials?: bigint;
}

export type CtapGetAssertionResult =
	| { kind: "assertion"; assertion: CtapAssertionResponse }
	| { kind: "ctap-error"; status: number };

const invalid = Symbol("invalid CTAP assertion response");
const limited = Symbol("CTAP assertion response limit");

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

function textFields(value: CtapCborValue): Map<string, CtapCborValue> {
	if (value.kind !== "map") throw invalid;
	const fields = new Map<string, CtapCborValue>();
	for (const [key, item] of value.entries)
		if (key.kind === "text") fields.set(key.value, item);
	return fields;
}

function selectedBytes(
	value: CtapCborValue | undefined,
	minimum: number,
	maximum: number,
	selected: Uint8Array[],
): Uint8Array {
	if (value?.kind !== "bytes" || value.value.length < minimum) throw invalid;
	if (value.value.length > maximum) throw limited;
	const copy = copyCtapBytes(value.value);
	selected.push(copy);
	return copy;
}

function credentialId(
	value: CtapCborValue,
	selected: Uint8Array[],
): Uint8Array {
	const fields = textFields(value);
	const type = fields.get("type");
	if (type?.kind !== "text" || type.value !== "public-key") throw invalid;
	return selectedBytes(fields.get("id"), 1, 1023, selected);
}

function userEntity(
	value: CtapCborValue,
	verified: boolean,
	selected: Uint8Array[],
): NonNullable<CtapAssertionResponse["user"]> {
	const fields = textFields(value);
	const user: NonNullable<CtapAssertionResponse["user"]> = {
		id: selectedBytes(fields.get("id"), 1, 64, selected),
	};
	for (const name of ["name", "displayName", "icon"] as const) {
		const field = fields.get(name);
		if (field === undefined) continue;
		if (!verified || field.kind !== "text") throw invalid;
		if (field.value.length > (name === "icon" ? 2048 : 256)) throw limited;
		user[name] = field.value;
	}
	return user;
}

export function decodeCtapGetAssertionResponse(
	input: Uint8Array,
): CtapGetAssertionResult {
	let owned: Uint8Array | undefined;
	let root: CtapCborValue | undefined;
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
		const authenticatorData = selectedBytes(fields.get(2), 37, 7609, selected);
		const flags = authenticatorData[32];
		if (
			(flags & 64) !== 0 ||
			((flags & 128) !== 0) !== authenticatorData.length > 37 ||
			((flags & 16) !== 0 && (flags & 8) === 0)
		)
			throw invalid;
		const assertion: CtapAssertionResponse = {
			authenticatorData,
			signature: selectedBytes(fields.get(3), 1, 7609, selected),
		};
		const credential = fields.get(1);
		if (credential !== undefined)
			assertion.credentialId = credentialId(credential, selected);
		const user = fields.get(4);
		if (user !== undefined)
			assertion.user = userEntity(user, (flags & 4) !== 0, selected);
		const count = fields.get(5);
		if (count !== undefined) {
			if (count.kind !== "unsigned" || count.value === 0n) throw invalid;
			assertion.numberOfCredentials = count.value;
		}
		returned = true;
		return { kind: "assertion", assertion };
	} catch (error) {
		const resourceLimit =
			error === limited ||
			(error instanceof AgentBrowserError && error.code === "resource-limit");
		throw new AgentBrowserError(
			resourceLimit ? "resource-limit" : "invalid-input",
			resourceLimit
				? "CTAP assertion response limit exceeded."
				: "Invalid CTAP assertion response.",
		);
	} finally {
		owned?.fill(0);
		if (root !== undefined) wipe(root);
		if (!returned) for (const bytes of selected) bytes.fill(0);
	}
}
