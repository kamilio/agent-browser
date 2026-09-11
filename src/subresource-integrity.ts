import { createHash } from "node:crypto";
import { types } from "node:util";
import { AgentBrowserError } from "./errors.js";

export type IntegrityAlgorithm = "sha256" | "sha384" | "sha512";

export interface IntegrityMetadata {
	readonly algorithm: IntegrityAlgorithm;
	readonly values: readonly string[];
}

export const subresourceIntegrityLimits = Object.freeze({
	metadataCodeUnits: 16_384,
	metadataItems: 128,
});

const algorithms: readonly IntegrityAlgorithm[] = [
	"sha256",
	"sha384",
	"sha512",
];
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"buffer",
)?.get;
const offsetGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteOffset",
)?.get;
const lengthGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteLength",
)?.get;

function isAlgorithm(value: unknown): value is IntegrityAlgorithm {
	return value === "sha256" || value === "sha384" || value === "sha512";
}

function invalidInput(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid subresource integrity arguments",
	);
}

function metadataLimit(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"Subresource integrity metadata limit exceeded",
	);
}

export function parseIntegrityMetadata(
	value: string,
): Readonly<IntegrityMetadata> | null {
	if (typeof value !== "string") invalidInput();
	if (value.length > subresourceIntegrityLimits.metadataCodeUnits)
		metadataLimit();
	const items = value.split(" ");
	if (items.length > subresourceIntegrityLimits.metadataItems) metadataLimit();
	let strongest: IntegrityAlgorithm | undefined;
	let values: string[] = [];
	for (const item of items) {
		const expression = item.split("?", 1)[0];
		const [token, digest = ""] = expression.split("-", 2);
		if (token.length !== 6) continue;
		const algorithm = token.toLowerCase();
		if (!isAlgorithm(algorithm)) continue;
		if (
			strongest === undefined ||
			algorithms.indexOf(algorithm) > algorithms.indexOf(strongest)
		) {
			strongest = algorithm;
			values = [digest];
		} else if (algorithm === strongest) values.push(digest);
	}
	return strongest === undefined
		? null
		: Object.freeze({ algorithm: strongest, values: Object.freeze(values) });
}

export function verifyIntegrityMetadata(
	bytes: Uint8Array,
	metadata: Readonly<IntegrityMetadata>,
	maxBytes: number,
): boolean {
	if (
		!Number.isSafeInteger(maxBytes) ||
		maxBytes < 0 ||
		!types.isUint8Array(bytes)
	)
		invalidInput();
	let view: Uint8Array;
	try {
		view = new Uint8Array(
			bufferGetter?.call(bytes),
			offsetGetter?.call(bytes),
			lengthGetter?.call(bytes),
		);
	} catch {
		invalidInput();
	}
	if (view.byteLength > maxBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"Subresource integrity byte limit exceeded",
		);
	if (
		metadata === null ||
		typeof metadata !== "object" ||
		types.isProxy(metadata)
	)
		invalidInput();
	const algorithm = Object.getOwnPropertyDescriptor(
		metadata,
		"algorithm",
	)?.value;
	const values = Object.getOwnPropertyDescriptor(metadata, "values")?.value;
	if (
		!isAlgorithm(algorithm) ||
		types.isProxy(values) ||
		!Array.isArray(values) ||
		values.length === 0
	)
		invalidInput();
	if (values.length > subresourceIntegrityLimits.metadataItems) metadataLimit();
	let codeUnits = algorithm.length;
	const expected: string[] = [];
	for (let index = 0; index < values.length; index++) {
		const value = Object.getOwnPropertyDescriptor(values, index)?.value;
		if (typeof value !== "string") invalidInput();
		codeUnits += value.length;
		if (codeUnits > subresourceIntegrityLimits.metadataCodeUnits)
			metadataLimit();
		expected.push(value);
	}
	const actual = createHash(algorithm).update(view).digest("base64");
	return expected.some((value) => value === actual);
}
