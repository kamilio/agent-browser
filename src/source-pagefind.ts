import { AgentBrowserError } from "./errors.js";
import { decodeSourceCbor, type SourceCborValue } from "./source-cbor.js";

export const sourcePagefindLimits = Object.freeze({
	maxBytes: 2_000_000,
	maxChunks: 16,
	maxTerms: 32,
	maxTermCodeUnits: 256,
	maxHashCodeUnits: 128,
	defaultLimit: 20,
	maxLimit: 100,
});

export interface PagefindSourceChunk {
	readonly hash: string;
	readonly bytes: Uint8Array;
}

export interface PagefindSourceSearchOptions {
	readonly limit?: number;
	readonly checkpoint?: () => void;
}

export interface PagefindSourceSearchMatch {
	readonly documentId: number;
	readonly fragmentHash: string;
	readonly wordCount: number;
}

export interface PagefindSourceSearchResult {
	readonly version: "1.5.2";
	readonly scope: "supplied-chunks";
	readonly matching: "literal-stored-term";
	readonly ordering: "document-id";
	readonly totalDocuments: number;
	readonly suppliedChunks: readonly string[];
	readonly terms: readonly string[];
	readonly missingTerms: readonly string[];
	readonly totalMatches: number;
	readonly truncated: boolean;
	readonly results: readonly PagefindSourceSearchMatch[];
	readonly unverified: true;
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
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
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid Pagefind source input.",
	);
}

function limitExceeded(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"Pagefind source limit exceeded.",
	);
}

function readCaller<Value>(read: () => Value): Value {
	try {
		return read();
	} catch {
		return invalidInput();
	}
}

function callerArray(input: unknown, maximum: number): readonly unknown[] {
	if (!readCaller(() => Array.isArray(input))) invalidInput();
	const values = input as readonly unknown[];
	const length = readCaller(() => values.length);
	if (!Number.isSafeInteger(length) || length < 1) invalidInput();
	if (length > maximum) limitExceeded();
	const copy: unknown[] = [];
	for (let index = 0; index < length; index++)
		copy.push(readCaller(() => values[index]));
	return copy;
}

function hashString(input: unknown): string {
	if (
		typeof input !== "string" ||
		input.length === 0 ||
		input.length > sourcePagefindLimits.maxHashCodeUnits ||
		/[^A-Za-z0-9_-]/.test(input)
	)
		invalidInput();
	return input;
}

function byteView(input: Uint8Array): Uint8Array {
	return readCaller(() => {
		if (typedArrayTag?.call(input) !== "Uint8Array") invalidInput();
		const buffer = typedArrayBuffer?.call(input) as ArrayBuffer;
		const offset = typedArrayOffset?.call(input) as number;
		const length = typedArrayLength?.call(input) as number;
		arrayBufferLength?.call(buffer);
		if (length === 0) invalidInput();
		return new Uint8Array(buffer, offset, length);
	});
}

function arrayValue(
	value: SourceCborValue,
	length?: number,
): readonly SourceCborValue[] {
	if (value.kind !== "array") invalidInput();
	if (length !== undefined && value.items.length !== length) invalidInput();
	return value.items;
}

function textValue(value: SourceCborValue): string {
	if (value.kind !== "text") invalidInput();
	return value.value;
}

function unsignedValue(value: SourceCborValue): bigint {
	if (value.kind !== "unsigned") invalidInput();
	return value.value;
}

export function searchPagefindSource(
	metadata: Uint8Array,
	chunks: readonly PagefindSourceChunk[],
	terms: readonly string[],
	options: PagefindSourceSearchOptions = {},
): PagefindSourceSearchResult {
	if (
		options === null ||
		typeof options !== "object" ||
		readCaller(() => Array.isArray(options))
	)
		invalidInput();
	const requestedLimit = readCaller(() => options.limit);
	const limit =
		requestedLimit === undefined
			? sourcePagefindLimits.defaultLimit
			: requestedLimit;
	const checkpoint = readCaller(() => options.checkpoint);
	if (
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > sourcePagefindLimits.maxLimit ||
		(checkpoint !== undefined && typeof checkpoint !== "function")
	)
		invalidInput();
	const queryTerms: string[] = [];
	const memberships = new Map<string, Set<number>>();
	for (const term of callerArray(terms, sourcePagefindLimits.maxTerms)) {
		if (typeof term !== "string" || term.length === 0) invalidInput();
		if (term.length > sourcePagefindLimits.maxTermCodeUnits) limitExceeded();
		if (memberships.has(term)) invalidInput();
		queryTerms.push(term);
		memberships.set(term, new Set());
	}
	const descriptors: PagefindSourceChunk[] = [];
	const suppliedHashes = new Set<string>();
	for (const chunk of callerArray(chunks, sourcePagefindLimits.maxChunks)) {
		if (
			chunk === null ||
			typeof chunk !== "object" ||
			readCaller(() => Array.isArray(chunk))
		)
			invalidInput();
		const descriptor = chunk as PagefindSourceChunk;
		const hash = hashString(readCaller(() => descriptor.hash));
		const bytes = readCaller(() => descriptor.bytes);
		if (suppliedHashes.has(hash)) invalidInput();
		suppliedHashes.add(hash);
		descriptors.push({ hash, bytes });
	}
	const metadataView = byteView(metadata);
	let totalBytes = metadataView.length;
	if (totalBytes > sourcePagefindLimits.maxBytes) limitExceeded();
	const views: PagefindSourceChunk[] = [];
	for (const descriptor of descriptors) {
		const bytes = byteView(descriptor.bytes);
		totalBytes += bytes.length;
		if (totalBytes > sourcePagefindLimits.maxBytes) limitExceeded();
		views.push({ hash: descriptor.hash, bytes });
	}
	const metadataBytes = new Uint8Array(metadataView);
	const capturedChunks = views.map(({ hash, bytes }) => ({
		hash,
		bytes: new Uint8Array(bytes),
	}));
	checkpoint?.();
	let workCount = 0;
	function work(): void {
		if (++workCount % 256 === 0) checkpoint?.();
	}
	const fields = arrayValue(decodeSourceCbor(metadataBytes, { checkpoint }), 6);
	if (textValue(fields[0]) !== "1.5.2")
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported Pagefind source version.",
		);
	const documents: { fragmentHash: string; wordCount: number }[] = [];
	const fragmentHashes = new Set<string>();
	for (const value of arrayValue(fields[1])) {
		work();
		const document = arrayValue(value, 2);
		const hash = hashString(textValue(document[0]));
		const wordCount = unsignedValue(document[1]);
		if (wordCount > BigInt(Number.MAX_SAFE_INTEGER)) invalidInput();
		if (fragmentHashes.has(hash)) invalidInput();
		fragmentHashes.add(hash);
		documents.push({ fragmentHash: hash, wordCount: Number(wordCount) });
	}
	const indexHashes = new Set<string>();
	for (const value of arrayValue(fields[2])) {
		work();
		const range = arrayValue(value, 3);
		const lower = textValue(range[0]);
		const upper = textValue(range[1]);
		const hash = hashString(textValue(range[2]));
		if (lower > upper || indexHashes.has(hash)) invalidInput();
		indexHashes.add(hash);
	}
	arrayValue(fields[3]);
	arrayValue(fields[4]);
	arrayValue(fields[5]);
	const observed = new Set<string>();
	const directTerms = new Set<string>();
	const variantNames = new Set<string>();
	const documentCount = BigInt(documents.length);
	function postings(value: SourceCborValue, literal: string): void {
		const matches = memberships.get(literal);
		if (matches) observed.add(literal);
		let documentId = 0n;
		let first = true;
		for (const item of arrayValue(value)) {
			work();
			const posting = arrayValue(item, 3);
			const delta = unsignedValue(posting[0]);
			if (!first && delta === 0n) invalidInput();
			first = false;
			documentId += delta;
			if (documentId >= documentCount) invalidInput();
			for (const positions of [posting[1], posting[2]]) {
				for (const position of arrayValue(positions)) {
					work();
					if (position.kind !== "unsigned" && position.kind !== "negative")
						invalidInput();
				}
			}
			matches?.add(Number(documentId));
		}
	}
	for (const chunk of capturedChunks) {
		checkpoint?.();
		if (!indexHashes.has(chunk.hash)) invalidInput();
		const root = arrayValue(decodeSourceCbor(chunk.bytes, { checkpoint }), 1);
		for (const value of arrayValue(root[0])) {
			work();
			const record = arrayValue(value, 3);
			const term = textValue(record[0]);
			if (directTerms.has(term)) invalidInput();
			directTerms.add(term);
			postings(record[1], term);
			for (const item of arrayValue(record[2])) {
				work();
				const variant = arrayValue(item, 2);
				const literal = textValue(variant[0]);
				if (variantNames.has(literal)) invalidInput();
				variantNames.add(literal);
				postings(variant[1], literal);
			}
		}
	}
	const missingTerms = queryTerms.filter((term) => !observed.has(term));
	const requiredMemberships = [...memberships.values()];
	const results: PagefindSourceSearchMatch[] = [];
	let totalMatches = 0;
	for (let documentId = 0; documentId < documents.length; documentId++) {
		work();
		let matches = true;
		for (const membership of requiredMemberships) {
			work();
			if (!membership.has(documentId)) {
				matches = false;
				break;
			}
		}
		if (!matches) continue;
		totalMatches++;
		if (results.length < limit)
			results.push({ documentId, ...documents[documentId] });
	}
	checkpoint?.();
	return {
		version: "1.5.2",
		scope: "supplied-chunks",
		matching: "literal-stored-term",
		ordering: "document-id",
		totalDocuments: documents.length,
		suppliedChunks: capturedChunks.map(({ hash }) => hash),
		terms: queryTerms,
		missingTerms,
		totalMatches,
		truncated: totalMatches > results.length,
		results,
		unverified: true,
	};
}
