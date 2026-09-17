import { AgentBrowserError } from "./errors.js";
import {
	type JsonSourceSelection,
	type JsonSourceSelectionProfile,
	type JsonSourceSpanOptions,
	jsonSourceSpanProfiles,
	selectJsonSourceSpans,
} from "./json-source-selection.js";

export const sourceSearchIndexLimits = Object.freeze({
	maxSourceCodeUnits: jsonSourceSpanProfiles.default.maxSourceCodeUnits,
	longSourceCodeUnits: jsonSourceSpanProfiles["long-v1"].maxSourceCodeUnits,
	maxDocuments: 10_000,
	maxDocumentCodeUnits: 4096,
	maxInputTerms: 8,
	maxTerms: 8,
	maxTermCodeUnits: 128,
	maxLimit: 100,
	defaultLimit: 20,
});

export interface SourceIndexSearchOptions extends JsonSourceSpanOptions {
	readonly limit?: number;
}

export interface SourceIndexSearchDocument {
	readonly docId: number;
	readonly docname: string;
	readonly title: string;
	readonly titleMatches: number;
}

export interface SourceIndexSearchResult {
	readonly kind: "source-index-search-v1";
	readonly semantics: "source-only-literal-term-intersection";
	readonly semanticValidation: "selected-fields-only";
	readonly titleFormat: "index-source";
	readonly profile: JsonSourceSelectionProfile;
	readonly terms: readonly string[];
	readonly totalMatches: number;
	readonly truncated: boolean;
	readonly documents: readonly SourceIndexSearchDocument[];
	readonly jsonRange: {
		readonly start: number;
		readonly end: number;
		readonly offsetBasis: "document-text-utf16";
	};
	readonly provenance: {
		readonly offsetBasis: "json-text-utf16";
		readonly selections: readonly (JsonSourceSelection | null)[];
	};
}

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function resourceLimit(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

function isJsonWhitespace(source: string, position: number): boolean {
	const code = source.charCodeAt(position);
	return code === 0x20 || code === 0x09 || code === 0x0d || code === 0x0a;
}

function pointerSegment(term: string): string {
	return term.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function searchSourceIndex(
	source: string,
	terms: readonly string[],
	options: SourceIndexSearchOptions = {},
): SourceIndexSearchResult {
	if (
		options === null ||
		typeof options !== "object" ||
		Array.isArray(options)
	) {
		invalid("Source index options must be an object");
	}
	const { checkpoint } = options;
	if (checkpoint !== undefined && typeof checkpoint !== "function") {
		invalid("Checkpoint must be a function");
	}
	checkpoint?.();
	const profile = options.profile === undefined ? "default" : options.profile;
	if (profile !== "default" && profile !== "long-v1") {
		invalid("Unsupported source index profile");
	}
	const limit =
		options.limit === undefined
			? sourceSearchIndexLimits.defaultLimit
			: options.limit;
	if (
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > sourceSearchIndexLimits.maxLimit
	) {
		invalid("Source index result limit must be an integer from 1 to 100");
	}
	if (typeof source !== "string") invalid("Source index must be a string");
	const maxSourceCodeUnits =
		profile === "long-v1"
			? sourceSearchIndexLimits.longSourceCodeUnits
			: sourceSearchIndexLimits.maxSourceCodeUnits;
	if (source.length > maxSourceCodeUnits) {
		resourceLimit("Source index envelope exceeds the code-unit limit");
	}
	if (!Array.isArray(terms) || terms.length === 0) {
		invalid("Source index query requires nonempty literal terms");
	}
	if (terms.length > sourceSearchIndexLimits.maxInputTerms) {
		resourceLimit("Source index query exceeds the eight input-term limit");
	}
	const distinctTerms = new Set<string>();
	for (const term of terms) {
		checkpoint?.();
		if (typeof term !== "string" || term.length === 0) {
			invalid("Source index terms must be nonempty strings");
		}
		if (term.length > sourceSearchIndexLimits.maxTermCodeUnits) {
			resourceLimit("Source index term exceeds the code-unit limit");
		}
		distinctTerms.add(term);
		if (distinctTerms.size > sourceSearchIndexLimits.maxTerms) {
			resourceLimit("Source index query exceeds the distinct-term limit");
		}
	}
	let start = 0;
	let end = source.length;
	while (isJsonWhitespace(source, start)) {
		if (start % 1024 === 0) checkpoint?.();
		start++;
	}
	function trimEnd() {
		while (end > start && isJsonWhitespace(source, end - 1)) {
			if (end % 1024 === 0) checkpoint?.();
			end--;
		}
	}
	trimEnd();
	if (source[end - 1] === ";") {
		end--;
		trimEnd();
	}
	const prefix = "Search.setIndex(";
	if (!source.startsWith(prefix, start) || source[end - 1] !== ")") {
		invalid("Source index must be an inert Search.setIndex(JSON) envelope");
	}
	start += prefix.length;
	end--;
	const json = source.slice(start, end);
	const queryTerms = [...distinctTerms];
	const pointers = ["", "/docnames", "/titles", "/terms", "/titleterms"];
	for (const term of queryTerms) {
		const segment = pointerSegment(term);
		pointers.push(`/terms/${segment}`, `/titleterms/${segment}`);
	}
	const { selections } = selectJsonSourceSpans(json, pointers, {
		profile,
		checkpoint,
	});
	function requireKind(
		position: number,
		valueKind: JsonSourceSelection["valueKind"],
	) {
		const selection = selections[position];
		if (!selection || selection.valueKind !== valueKind) {
			invalid(
				`Source index ${pointers[position] || "root"} must be an ${valueKind}`,
			);
		}
		return selection;
	}
	function parseSelection(selection: JsonSourceSelection): unknown {
		checkpoint?.();
		const parsed: unknown = JSON.parse(
			json.slice(selection.start, selection.end),
		);
		checkpoint?.();
		return parsed;
	}
	requireKind(0, "object");
	requireKind(3, "object");
	requireKind(4, "object");
	function documentStrings(position: number): string[] {
		const values = parseSelection(requireKind(position, "array")) as unknown[];
		if (values.length > sourceSearchIndexLimits.maxDocuments) {
			resourceLimit("Source index exceeds the document limit");
		}
		for (const value of values) {
			checkpoint?.();
			if (typeof value !== "string" || value.length === 0) {
				invalid(
					`Source index ${pointers[position]} must contain nonempty strings`,
				);
			}
			if (value.length > sourceSearchIndexLimits.maxDocumentCodeUnits) {
				resourceLimit(
					"Source index document string exceeds the code-unit limit",
				);
			}
		}
		return values as string[];
	}
	const docnames = documentStrings(1);
	const titles = documentStrings(2);
	if (docnames.length !== titles.length) {
		invalid("Source index docnames and titles must have equal lengths");
	}
	function posting(position: number): Set<number> {
		const selection = selections[position];
		const identifiers = new Set<number>();
		if (selection === null) return identifiers;
		if (
			!selection ||
			(selection.valueKind !== "number" && selection.valueKind !== "array")
		) {
			invalid(
				`Source index ${pointers[position]} must be a document ID or ID array`,
			);
		}
		const parsed = parseSelection(selection);
		const values = Array.isArray(parsed) ? parsed : [parsed];
		for (const value of values) {
			checkpoint?.();
			if (
				typeof value !== "number" ||
				!Number.isSafeInteger(value) ||
				value < 0 ||
				value >= docnames.length
			) {
				invalid(
					`Source index ${pointers[position]} contains an invalid document ID`,
				);
			}
			if (identifiers.has(value)) {
				invalid(
					`Source index ${pointers[position]} contains a duplicate document ID`,
				);
			}
			identifiers.add(value);
		}
		return identifiers;
	}
	const matches = new Uint8Array(docnames.length);
	const titleMatches = new Uint8Array(docnames.length);
	for (let termIndex = 0; termIndex < queryTerms.length; termIndex++) {
		const body = posting(5 + termIndex * 2);
		const heading = posting(6 + termIndex * 2);
		for (const docId of heading) {
			checkpoint?.();
			body.add(docId);
			titleMatches[docId]++;
		}
		for (const docId of body) {
			checkpoint?.();
			matches[docId]++;
		}
	}
	const documents: SourceIndexSearchDocument[] = [];
	for (let docId = 0; docId < docnames.length; docId++) {
		checkpoint?.();
		if (matches[docId] === queryTerms.length) {
			documents.push(
				Object.freeze({
					docId,
					docname: docnames[docId],
					title: titles[docId],
					titleMatches: titleMatches[docId],
				}),
			);
		}
	}
	documents.sort((left, right) => {
		checkpoint?.();
		return right.titleMatches - left.titleMatches || left.docId - right.docId;
	});
	checkpoint?.();
	return Object.freeze({
		kind: "source-index-search-v1",
		semantics: "source-only-literal-term-intersection",
		semanticValidation: "selected-fields-only",
		titleFormat: "index-source",
		profile,
		terms: Object.freeze(queryTerms),
		totalMatches: documents.length,
		truncated: documents.length > limit,
		documents: Object.freeze(documents.slice(0, limit)),
		jsonRange: Object.freeze({
			start,
			end,
			offsetBasis: "document-text-utf16",
		}),
		provenance: Object.freeze({
			offsetBasis: "json-text-utf16",
			selections,
		}),
	});
}
