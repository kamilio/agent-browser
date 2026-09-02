import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { compileSearchPattern } from "./search-pattern.js";
import { renderSnapshotEntry, snapshotDocument } from "./snapshot.js";

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
	const snapshot = snapshotDocument(tree, {
		maxBytes: 1_048_576,
		maxEntries: 10_000,
		maxDepth: 256,
		maxStringLength: 4096,
	});
	const lines = snapshot.entries.map(renderSnapshotEntry);
	const parents: number[] = [];
	const stack: number[] = [];
	const indexes: number[] = [];
	const work = { remaining: 4_000_000 };
	for (let index = 0; index < lines.length; index++) {
		const entry = snapshot.entries[index];
		while (
			stack.length &&
			snapshot.entries[stack[stack.length - 1]].depth >= entry.depth
		)
			stack.pop();
		parents.push(stack.at(-1) ?? -1);
		stack.push(index);
		let matched: boolean;
		if (pattern) matched = pattern.test(lines[index], work);
		else {
			work.remaining -= lines[index].length + query.length;
			if (work.remaining < 0)
				throw new AgentBrowserError(
					"resource-limit",
					"Search work limit exceeded",
				);
			matched = lines[index].includes(query);
		}
		if (matched) indexes.push(index);
	}
	const result: SnapshotSearch = {
		partial: true,
		document: snapshot.document,
		revision: snapshot.revision,
		matched: indexes.length,
		scannedEntries: lines.length,
		matches: [],
		snapshotTruncated: snapshot.truncated,
		resultsTruncated: false,
		truncated: snapshot.truncated,
		workUsed: 4_000_000 - work.remaining,
		limits,
	};
	const encoder = new TextEncoder();
	let bytes = encoder.encode(JSON.stringify(result)).byteLength + 64;
	for (const index of indexes.slice(0, limits.maxResults)) {
		const path: string[] = [];
		for (let parent = parents[index]; parent >= 0; parent = parents[parent])
			path.unshift(snapshot.entries[parent].ref);
		const context: SnapshotSearchMatch["context"] = [];
		for (
			let line = Math.max(0, index - limits.context);
			line <= Math.min(lines.length - 1, index + limits.context);
			line++
		)
			context.push({
				line: line + 1,
				ref: snapshot.entries[line].ref,
				text: lines[line],
			});
		const match = {
			ref: snapshot.entries[index].ref,
			line: index + 1,
			path,
			context,
		};
		const cost = encoder.encode(JSON.stringify(match)).byteLength + 1;
		if (bytes + cost > limits.maxBytes) break;
		result.matches.push(match);
		bytes += cost;
	}
	result.resultsTruncated = result.matches.length < indexes.length;
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
