import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { compileSearchPattern } from "./search-pattern.js";
import { renderSnapshotEntry, scanSnapshotEntries } from "./snapshot.js";

export interface SnapshotSearchOptions {
	regex?: boolean;
	maxResults?: number;
	context?: number;
	maxBytes?: number;
}
export interface SnapshotSearchMatch {
	ref: string;
	line: number;
	path: string[];
	context: { line: number; ref: string; text: string }[];
}
export interface SnapshotSearch {
	partial: true;
	document: string;
	revision: number;
	matched: number;
	scannedEntries: number;
	matches: SnapshotSearchMatch[];
	snapshotTruncated: boolean;
	resultsTruncated: boolean;
	truncated: boolean;
	workUsed: number;
	limits: { maxResults: number; context: number; maxBytes: number };
}

export function findInDocument(
	tree: DocumentTree,
	query: string,
	options: SnapshotSearchOptions = {},
): SnapshotSearch {
	if (
		typeof query !== "string" ||
		!query.length ||
		query.length > 1024 ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some(
			(key) => !["regex", "maxResults", "context", "maxBytes"].includes(key),
		) ||
		(options.regex !== undefined && typeof options.regex !== "boolean")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid snapshot search options or query",
		);
	const limits = {
		maxResults: options.maxResults ?? 100,
		context: options.context ?? 3,
		maxBytes: options.maxBytes ?? 32_768,
	};
	for (const [value, minimum, maximum] of [
		[limits.maxResults, 1, 500],
		[limits.context, 0, 10],
		[limits.maxBytes, 1024, 262_144],
	])
		if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid snapshot search limits",
			);
	const pattern = options.regex ? compileSearchPattern(query) : undefined;
	const work = { remaining: 4_000_000 };
	const result: SnapshotSearch = {
		partial: true,
		document: tree.reference(tree.root),
		revision: tree.revision,
		matched: 0,
		scannedEntries: 0,
		matches: [],
		snapshotTruncated: false,
		resultsTruncated: false,
		truncated: false,
		workUsed: 0,
		limits,
	};
	const encoder = new TextEncoder();
	let bytes = encoder.encode(JSON.stringify(result)).byteLength + 64;
	let outputStopped = false;
	const recent: SnapshotSearchMatch["context"] = [];
	const ancestors: { ref: string; depth: number }[] = [];
	const pending: SnapshotSearchMatch[] = [];
	const finish = (match: SnapshotSearchMatch) => {
		const cost = encoder.encode(JSON.stringify(match)).byteLength + 1;
		if (bytes + cost > limits.maxBytes) {
			outputStopped = true;
			pending.length = 0;
			return;
		}
		result.matches.push(match);
		bytes += cost;
	};
	const scan = scanSnapshotEntries(tree, (entry) => {
		const line = {
			line: ++result.scannedEntries,
			ref: entry.ref,
			text: renderSnapshotEntry(entry),
		};
		while (ancestors.length && (ancestors.at(-1)?.depth ?? -1) >= entry.depth)
			ancestors.pop();
		let matched: boolean;
		if (pattern) matched = pattern.test(line.text, work);
		else {
			work.remaining -= line.text.length + query.length;
			if (work.remaining < 0)
				throw new AgentBrowserError(
					"resource-limit",
					"Search work limit exceeded",
				);
			matched = line.text.includes(query);
		}
		for (const match of pending) match.context.push(line);
		if (matched) {
			result.matched++;
			if (!outputStopped && result.matched <= limits.maxResults)
				pending.push({
					ref: entry.ref,
					line: line.line,
					path: ancestors.map((parent) => parent.ref),
					context: [...recent, line],
				});
		}
		while (pending.length && pending[0].line + limits.context <= line.line) {
			const match = pending.shift();
			if (match) finish(match);
		}
		ancestors.push({ ref: entry.ref, depth: entry.depth });
		if (limits.context) {
			recent.push(line);
			if (recent.length > limits.context) recent.shift();
		}
	});
	while (pending.length) {
		const match = pending.shift();
		if (match) finish(match);
	}
	result.snapshotTruncated = scan.truncated;
	result.truncated = scan.truncated;
	result.workUsed = 4_000_000 - work.remaining;
	result.resultsTruncated = result.matches.length < result.matched;
	result.truncated ||= result.resultsTruncated;
	while (
		encoder.encode(JSON.stringify(result)).byteLength > limits.maxBytes &&
		result.matches.length
	) {
		result.matches.pop();
		result.resultsTruncated = true;
		result.truncated = true;
	}
	return result;
}

export function renderSnapshotSearch(search: SnapshotSearch): string {
	const lines = [
		`${search.matched} matching snapshot nodes${search.snapshotTruncated ? " (in a partial snapshot)" : ""}; ${search.matches.length} returned`,
	];
	for (const match of search.matches) {
		lines.push(`\nPath: ${[...match.path, match.ref].join(" > ")}`);
		for (const line of match.context)
			lines.push(
				`${line.line === match.line ? ">" : " "} ${line.line}: ${line.text}`,
			);
	}
	if (search.truncated) lines.push("… search truncated");
	return lines.join("\n");
}
