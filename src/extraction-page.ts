import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { type DocumentExtraction, extractDocument } from "./extraction.js";
import { researchReaderInfo } from "./research-reader-info.js";
import { resourceLimitError } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import { utf8ByteLength } from "./utf8-byte-length.js";

export interface ExtractionPageOptions {
	cursor?: string;
	limit?: number;
	format?: "markdown" | "json";
	readerMetadata?: "entry" | "page";
	maxBytes?: number;
	itemMaxBytes?: number;
	maxNodes?: number;
	maxDepth?: number;
	tableRows?: boolean;
	compactTables?: boolean;
}

export interface DocumentExtractionPage {
	method: "selector-extraction-page-v1";
	document: string;
	revision: number;
	selector: string;
	start: number;
	totalMatches: number;
	partial: true;
	readerMetadata?: "page";
	reader?: DocumentExtraction["reader"];
	entries: DocumentExtraction[];
	nextCursor: string | null;
	selectionExhausted: boolean;
}

type ExtractionCursor = [1, string, number, string, number];

function pageLimit(
	name: string,
	value: number | undefined,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	const limit = value === undefined ? fallback : value;
	if (!Number.isSafeInteger(limit) || limit < minimum || limit > maximum)
		throw new AgentBrowserError(
			"invalid-input",
			`Invalid extraction page limit: ${name}`,
		);
	return limit;
}

function parseCursor(
	cursor: string | undefined,
	selector: string,
): ExtractionCursor | undefined {
	if (cursor === undefined) return undefined;
	if (typeof cursor !== "string" || cursor.length > 32_768)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid extraction page cursor",
		);
	let value: unknown;
	try {
		value = JSON.parse(cursor);
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid extraction page cursor",
		);
	}
	if (
		!Array.isArray(value) ||
		value.length !== 5 ||
		value[0] !== 1 ||
		typeof value[1] !== "string" ||
		!/^e[1-9][0-9]*$/.test(value[1]) ||
		!Number.isSafeInteger(Number(value[1].slice(1))) ||
		!Number.isSafeInteger(value[2]) ||
		value[2] < 0 ||
		value[3] !== selector ||
		!Number.isSafeInteger(value[4]) ||
		value[4] < 0 ||
		JSON.stringify(value) !== cursor
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid extraction page cursor",
		);
	return value as ExtractionCursor;
}

export function extractDocumentPage(
	tree: DocumentTree,
	selector: string,
	options: ExtractionPageOptions = {},
): DocumentExtractionPage {
	if (
		typeof selector !== "string" ||
		selector.trim().length === 0 ||
		selector.length > 4096
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Extraction page requires a nonempty bounded selector",
		);
	if (options === null || typeof options !== "object" || Array.isArray(options))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid extraction page options",
		);
	const readerMetadata = options.readerMetadata;
	if (
		readerMetadata !== undefined &&
		readerMetadata !== "entry" &&
		readerMetadata !== "page"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Extraction page reader metadata must be entry or page",
		);
	const format = options.format === undefined ? "markdown" : options.format;
	if (format !== "markdown" && format !== "json")
		throw new AgentBrowserError(
			"unsupported",
			"Extraction format must be markdown or json",
		);
	for (const name of ["tableRows", "compactTables"] as const) {
		if (
			(options[name] !== undefined && typeof options[name] !== "boolean") ||
			(options[name] === true && format !== "markdown")
		)
			throw new AgentBrowserError(
				"invalid-input",
				`${name} requires a boolean option and Markdown extraction`,
			);
	}
	const limit = pageLimit("limit", options.limit, 20, 1, 100);
	const maxBytes = pageLimit(
		"maxBytes",
		options.maxBytes,
		256_000,
		1024,
		1_048_576,
	);
	const itemMaxBytes = pageLimit(
		"itemMaxBytes",
		options.itemMaxBytes,
		Math.min(65_536, maxBytes),
		256,
		maxBytes,
	);
	const maxNodes = pageLimit("maxNodes", options.maxNodes, 10_000, 1, 50_000);
	const maxDepth = pageLimit("maxDepth", options.maxDepth, 128, 0, 1024);
	const cursor = parseCursor(options.cursor, selector);
	const document = tree.reference(tree.root);
	const revision = tree.revision;
	if (cursor && (cursor[1] !== document || cursor[2] !== revision))
		throw new AgentBrowserError(
			"stale-reference",
			"Extraction page cursor belongs to a different document or revision",
		);
	const start = cursor?.[4] ?? 0;
	const reader =
		readerMetadata === "page" ? researchReaderInfo(tree) : undefined;
	const queries = new DocumentQueries(tree);
	try {
		const matches = queries.querySelectorAll(selector);
		if (start > matches.length)
			throw new AgentBrowserError(
				"invalid-input",
				"Extraction page cursor is outside the selector matches",
			);
		const continuation = (nextIndex: number) => ({
			nextCursor:
				nextIndex === matches.length
					? null
					: JSON.stringify([1, document, revision, selector, nextIndex]),
			selectionExhausted: nextIndex === matches.length,
		});
		const page: DocumentExtractionPage = {
			method: "selector-extraction-page-v1",
			document,
			revision,
			selector,
			start,
			totalMatches: matches.length,
			partial: true,
			...(readerMetadata === "page"
				? { readerMetadata, ...(reader ? { reader } : {}) }
				: {}),
			entries: [],
			...continuation(start),
		};
		const envelopeBytes = utf8ByteLength(JSON.stringify(page));
		if (envelopeBytes > maxBytes)
			throw resourceLimitError(
				"extraction.output",
				maxBytes,
				envelopeBytes,
				"Extraction page envelope exceeds byte limit",
			);
		let entriesBytes = 0;
		const end = Math.min(matches.length, start + limit);
		for (let index = start; index < end; index++) {
			let entry = extractDocument(tree, {
				root: tree.reference(matches[index]),
				format,
				maxBytes: itemMaxBytes,
				maxNodes,
				maxDepth,
				tableRows: options.tableRows,
				compactTables: options.compactTables,
			});
			if (readerMetadata === "page") {
				const { reader: entryReader, ...sharedEntry } = entry;
				if (entryReader !== reader)
					throw new AgentBrowserError(
						"invalid-input",
						"Extraction page reader metadata mismatch",
					);
				entry = sharedEntry;
			}
			const next = continuation(index + 1);
			const candidateEntriesBytes =
				entriesBytes +
				utf8ByteLength(JSON.stringify(entry)) +
				(page.entries.length === 0 ? 0 : 1);
			const bytes =
				candidateEntriesBytes +
				utf8ByteLength(JSON.stringify({ ...page, entries: [], ...next }));
			if (bytes > maxBytes) {
				if (page.entries.length === 0)
					throw resourceLimitError(
						"extraction.output",
						maxBytes,
						bytes,
						"First extraction page entry exceeds byte limit",
					);
				break;
			}
			page.entries.push(entry);
			entriesBytes = candidateEntriesBytes;
			page.nextCursor = next.nextCursor;
			page.selectionExhausted = next.selectionExhausted;
		}
		return page;
	} finally {
		queries.close();
	}
}
