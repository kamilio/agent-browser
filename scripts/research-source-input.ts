import { createHash } from "node:crypto";
import { types } from "node:util";
import { AgentBrowserError } from "../src/errors.js";
import { htmlEncoding } from "../src/html-encoding.js";
import { decodeResponseText, parseNetworkUrl } from "../src/network.js";
import { resourceLimitError } from "../src/resource-limit.js";

export interface ResearchHtmlSourceIdentity {
	readonly kind: "decoded-html-source-v1";
	readonly reportedFinalUrl: string;
	readonly contentType: string;
	readonly bytes: {
		readonly length: number;
		readonly sha256: string;
	};
	readonly decoder: {
		readonly policy: "native-research-html-v1";
		readonly encoding: string;
		readonly bomConsumed: boolean;
	};
	readonly text: {
		readonly codeUnits: number;
		readonly sha256: string;
		readonly digestEncoding: "utf-8";
		readonly coordinates: "decoder-output-utf16-before-parser-normalization";
	};
}

const inputFields = ["finalUrl", "contentType", "body"];
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayAt = Uint8Array.prototype.at;
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

function invalidInput(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid research HTML source input",
	);
}

function snapshotInput(input: unknown): Record<string, unknown> {
	if (
		typeof input !== "object" ||
		input === null ||
		types.isProxy(input) ||
		Array.isArray(input)
	)
		invalidInput();
	const prototype = Object.getPrototypeOf(input);
	if (prototype !== Object.prototype && prototype !== null) invalidInput();
	const keys = Reflect.ownKeys(input);
	if (
		keys.length !== inputFields.length ||
		!keys.every((key) => typeof key === "string" && inputFields.includes(key))
	)
		invalidInput();
	const fields: Record<string, unknown> = Object.create(null);
	for (const name of inputFields) {
		const descriptor = Object.getOwnPropertyDescriptor(input, name);
		if (!descriptor || !Object.hasOwn(descriptor, "value")) invalidInput();
		fields[name] = descriptor.value;
	}
	return fields;
}

function sourceUrl(value: unknown): string {
	if (typeof value !== "string" || value.length > 8192 || value.includes("#"))
		invalidInput();
	try {
		if (parseNetworkUrl(value).href !== value) invalidInput();
	} catch {
		invalidInput();
	}
	return value;
}

function sourceContentType(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length > 1024 ||
		value.includes(",") ||
		/\p{Cc}/u.test(value) ||
		value.split(";", 1)[0].trim().toLowerCase() !== "text/html"
	)
		invalidInput();
	return value;
}

function copyBody(value: unknown, maxInputBytes: number): Uint8Array {
	if (types.isProxy(value) || !types.isUint8Array(value)) invalidInput();
	let view: Uint8Array;
	try {
		typedArrayAt.call(value, 0);
		const backing = bufferGetter?.call(value) as ArrayBuffer;
		if (!types.isArrayBuffer(backing)) invalidInput();
		const offset = byteOffsetGetter?.call(value) as number;
		const length = byteLengthGetter?.call(value) as number;
		view = new Uint8Array(backing, offset, length);
	} catch {
		invalidInput();
	}
	if (view.byteLength > maxInputBytes)
		throw resourceLimitError(
			"source.input",
			maxInputBytes,
			view.byteLength,
			"Research source input byte limit exceeded",
		);
	return new Uint8Array(view);
}

export function admitResearchHtmlSource(
	input: unknown,
	maxInputBytes: number,
	maxSourceCodeUnits: number,
	checkpoint: () => void,
): Readonly<{ text: string; identity: ResearchHtmlSourceIdentity }> {
	if (typeof checkpoint !== "function") invalidInput();
	checkpoint();
	for (const limit of [maxInputBytes, maxSourceCodeUnits]) {
		if (
			typeof limit !== "number" ||
			!Number.isSafeInteger(limit) ||
			limit < 1 ||
			limit > 4_000_000
		)
			invalidInput();
	}
	const fields = snapshotInput(input);
	const finalUrl = sourceUrl(fields.finalUrl);
	const contentType = sourceContentType(fields.contentType);
	checkpoint();
	const owned = copyBody(fields.body, maxInputBytes);
	let admitted: Readonly<{
		text: string;
		identity: ResearchHtmlSourceIdentity;
	}>;
	try {
		checkpoint();
		const fallbackEncoding = htmlEncoding(owned);
		checkpoint();
		const decoded = decodeResponseText(
			{ headers: { "content-type": [contentType] }, body: owned },
			fallbackEncoding,
		);
		checkpoint();
		if (decoded.text.length > maxSourceCodeUnits)
			throw resourceLimitError(
				"source.decoded",
				maxSourceCodeUnits,
				decoded.text.length,
				"Decoded research source limit exceeded",
			);
		const bomConsumed =
			(owned[0] === 0xef && owned[1] === 0xbb && owned[2] === 0xbf) ||
			(owned[0] === 0xff && owned[1] === 0xfe) ||
			(owned[0] === 0xfe && owned[1] === 0xff);
		checkpoint();
		const byteSha256 = createHash("sha256").update(owned).digest("hex");
		checkpoint();
		const textSha256 = createHash("sha256")
			.update(decoded.text, "utf8")
			.digest("hex");
		checkpoint();
		const identity: ResearchHtmlSourceIdentity = Object.freeze({
			kind: "decoded-html-source-v1",
			reportedFinalUrl: finalUrl,
			contentType,
			bytes: Object.freeze({ length: owned.byteLength, sha256: byteSha256 }),
			decoder: Object.freeze({
				policy: "native-research-html-v1",
				encoding: decoded.encoding,
				bomConsumed,
			}),
			text: Object.freeze({
				codeUnits: decoded.text.length,
				sha256: textSha256,
				digestEncoding: "utf-8",
				coordinates: "decoder-output-utf16-before-parser-normalization",
			}),
		});
		admitted = Object.freeze({ text: decoded.text, identity });
	} finally {
		owned.fill(0);
	}
	checkpoint();
	return admitted;
}
