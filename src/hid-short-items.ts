import { AgentBrowserError } from "./errors.js";

export interface HidShortItemOptions {
	maxBytes?: number;
	maxItems?: number;
}

export interface HidShortItem {
	offset: number;
	header: number;
	type: "main" | "global" | "local";
	tag: number;
	data: Uint8Array;
}

const policyLimit = 4096;
const itemTypes = ["main", "global", "local"] as const;
const payloadSizes = [0, 1, 2, 4] as const;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayValues = Uint8Array.prototype.values;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"buffer",
)?.get;
const typedArrayOffset = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteOffset",
)?.get;
const typedArrayLength = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteLength",
)?.get;
const typedArrayTag = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	Symbol.toStringTag,
)?.get;
const arrayBufferLength = Object.getOwnPropertyDescriptor(
	ArrayBuffer.prototype,
	"byteLength",
)?.get;

function invalidInput(): never {
	throw new AgentBrowserError("invalid-input", "Invalid HID short-item input.");
}

function readOptions(
	options: HidShortItemOptions | undefined,
): Required<HidShortItemOptions> {
	try {
		if (options === undefined)
			return { maxBytes: policyLimit, maxItems: policyLimit };
		if (
			typeof options !== "object" ||
			options === null ||
			Array.isArray(options)
		)
			invalidInput();
		const suppliedBytes = options.maxBytes;
		const suppliedItems = options.maxItems;
		const maxBytes = suppliedBytes === undefined ? policyLimit : suppliedBytes;
		const maxItems = suppliedItems === undefined ? policyLimit : suppliedItems;
		if (
			!Number.isInteger(maxBytes) ||
			!Number.isInteger(maxItems) ||
			maxBytes < 1 ||
			maxBytes > policyLimit ||
			maxItems < 1 ||
			maxItems > policyLimit
		)
			invalidInput();
		return { maxBytes, maxItems };
	} catch {
		return invalidInput();
	}
}

function byteView(value: Uint8Array): Uint8Array {
	try {
		if (typedArrayTag?.call(value) !== "Uint8Array") invalidInput();
		typedArrayValues.call(value);
		const buffer = typedArrayBuffer?.call(value) as ArrayBuffer;
		const offset = typedArrayOffset?.call(value) as number;
		const length = typedArrayLength?.call(value) as number;
		arrayBufferLength?.call(buffer);
		return new Uint8Array(buffer, offset, length);
	} catch {
		return invalidInput();
	}
}

export function tokenizeHidShortItems(
	bytes: Uint8Array,
	options?: HidShortItemOptions,
): readonly HidShortItem[] {
	const { maxBytes, maxItems } = readOptions(options);
	const view = byteView(bytes);
	if (view.length > maxBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"HID descriptor byte limit exceeded.",
		);
	const items: HidShortItem[] = [];
	let offset = 0;
	while (offset < view.length) {
		if (items.length >= maxItems)
			throw new AgentBrowserError(
				"resource-limit",
				"HID item count limit exceeded.",
			);
		const header = view[offset];
		const tag = header >>> 4;
		if (tag === 15)
			throw new AgentBrowserError(
				"unsupported",
				"Long HID items are unsupported.",
			);
		const type = (header >>> 2) & 3;
		if (type === 3)
			throw new AgentBrowserError(
				"unsupported",
				"Reserved HID item types are unsupported.",
			);
		const size = payloadSizes[header & 3];
		if (view.length - offset - 1 < size) invalidInput();
		const data = new Uint8Array(size);
		for (let index = 0; index < size; index++)
			data[index] = view[offset + 1 + index];
		items.push({ offset, header, type: itemTypes[type], tag, data });
		offset += 1 + size;
	}
	return items;
}
