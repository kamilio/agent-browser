import { createHash } from "node:crypto";
import { types } from "node:util";
import { AgentBrowserError } from "../src/errors.js";

export const researchBodyCaptureLimit = 2_000_000;

export interface ResearchBodyCapture {
	encoding: "base64";
	decodedBytes: number;
	sha256: string;
	data: string;
}

const captureFields = ["encoding", "decodedBytes", "sha256", "data"];
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteLength",
)?.get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteOffset",
)?.get;
const bufferGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"buffer",
)?.get;

function invalidCapture(): never {
	throw new AgentBrowserError("invalid-input", "Invalid research body capture");
}

export function captureResearchBody(body: Uint8Array): ResearchBodyCapture {
	if (!types.isUint8Array(body) || types.isProxy(body)) invalidCapture();
	const decodedBytes = byteLengthGetter?.call(body) as number;
	if (decodedBytes > researchBodyCaptureLimit)
		throw new AgentBrowserError(
			"resource-limit",
			"Research body capture limit exceeded",
		);
	try {
		const backing = bufferGetter?.call(body) as ArrayBuffer;
		if (!types.isArrayBuffer(backing)) invalidCapture();
		const offset = byteOffsetGetter?.call(body) as number;
		const bytes = Buffer.from(new Uint8Array(backing, offset, decodedBytes));
		return {
			encoding: "base64",
			decodedBytes,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			data: bytes.toString("base64"),
		};
	} catch {
		invalidCapture();
	}
}

export function decodeResearchBodyCapture(value: unknown): Uint8Array {
	if (typeof value !== "object" || value === null || types.isProxy(value))
		invalidCapture();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) invalidCapture();
	const keys = Reflect.ownKeys(value);
	if (
		keys.length !== captureFields.length ||
		!keys.every((key) => typeof key === "string" && captureFields.includes(key))
	)
		invalidCapture();
	const fields: Record<string, unknown> = Object.create(null);
	for (const key of captureFields) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !Object.hasOwn(descriptor, "value")) invalidCapture();
		fields[key] = descriptor.value;
	}
	const { encoding, decodedBytes, sha256, data } = fields;
	if (
		encoding !== "base64" ||
		typeof decodedBytes !== "number" ||
		!Number.isInteger(decodedBytes) ||
		decodedBytes < 0 ||
		decodedBytes > researchBodyCaptureLimit ||
		typeof sha256 !== "string" ||
		!/^[a-f0-9]{64}$/.test(sha256) ||
		typeof data !== "string" ||
		data.length !== Math.ceil(decodedBytes / 3) * 4 ||
		!/^[A-Za-z0-9+/]*={0,2}$/.test(data)
	)
		invalidCapture();
	const bytes = Buffer.from(data, "base64");
	if (
		bytes.byteLength !== decodedBytes ||
		bytes.toString("base64") !== data ||
		createHash("sha256").update(bytes).digest("hex") !== sha256
	)
		invalidCapture();
	return new Uint8Array(bytes);
}
