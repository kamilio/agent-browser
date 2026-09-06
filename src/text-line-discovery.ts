import { AgentBrowserError } from "./errors.js";

export interface TextLineDiscoveryOptions {
	maxEntries?: number;
}

export interface TextLineTarget {
	line: number;
	column: number;
}

export interface TextLineDiscovery {
	entries: TextLineTarget[];
	totalLines: number;
	matchedLines: number;
	sourceCodeUnits: number;
	truncated: boolean;
}

function invalidInput(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid text line discovery input.",
	);
}

function entryLimit(options: TextLineDiscoveryOptions): number {
	try {
		if (
			options === null ||
			typeof options !== "object" ||
			Array.isArray(options)
		)
			invalidInput();
		const maxEntries = options.maxEntries;
		if (maxEntries === undefined) return 50;
		if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 200)
			invalidInput();
		return maxEntries;
	} catch {
		invalidInput();
	}
}

export function discoverTextLines(
	source: string,
	query: string,
	options: TextLineDiscoveryOptions = {},
): TextLineDiscovery {
	if (
		typeof source !== "string" ||
		typeof query !== "string" ||
		query.length < 1 ||
		query.length > 256
	)
		invalidInput();
	for (let offset = 0; offset < query.length; offset++) {
		const codeUnit = query.charCodeAt(offset);
		if (codeUnit === 10 || codeUnit === 13) invalidInput();
	}
	const maxEntries = entryLimit(options);
	if (source.length > 2_000_000)
		throw new AgentBrowserError(
			"resource-limit",
			"Text line discovery source limit exceeded.",
		);

	const prefixes = new Array<number>(query.length).fill(0);
	let matchedPrefix = 0;
	for (let offset = 1; offset < query.length; offset++) {
		while (matchedPrefix > 0 && query[offset] !== query[matchedPrefix])
			matchedPrefix = prefixes[matchedPrefix - 1];
		if (query[offset] === query[matchedPrefix]) matchedPrefix++;
		prefixes[offset] = matchedPrefix;
	}

	const entries: TextLineTarget[] = [];
	let totalLines = 1;
	let matchedLines = 0;
	let lineStart = 0;
	let lineMatched = false;
	matchedPrefix = 0;
	for (let offset = 0; offset < source.length; offset++) {
		const codeUnit = source.charCodeAt(offset);
		if (codeUnit === 10 || codeUnit === 13) {
			if (codeUnit === 13 && source.charCodeAt(offset + 1) === 10) offset++;
			totalLines++;
			lineStart = offset + 1;
			matchedPrefix = 0;
			lineMatched = false;
			continue;
		}
		if (lineMatched) continue;
		while (matchedPrefix > 0 && codeUnit !== query.charCodeAt(matchedPrefix))
			matchedPrefix = prefixes[matchedPrefix - 1];
		if (codeUnit === query.charCodeAt(matchedPrefix)) matchedPrefix++;
		if (matchedPrefix === query.length) {
			matchedLines++;
			lineMatched = true;
			if (entries.length < maxEntries)
				entries.push({
					line: totalLines,
					column: offset - query.length + 2 - lineStart,
				});
		}
	}
	return {
		entries,
		totalLines,
		matchedLines,
		sourceCodeUnits: source.length,
		truncated: matchedLines > entries.length,
	};
}
