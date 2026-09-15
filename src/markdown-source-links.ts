import { AgentBrowserError } from "./errors.js";
import { parseNetworkUrl } from "./network.js";

export const markdownSourceLinkLimits = Object.freeze({
	maxSourceCodeUnits: 2_000_000,
	maxEntries: 32,
	maxLabelCodeUnits: 256,
	maxUrlCodeUnits: 4096,
	maxWorkCodeUnits: 8_000_000,
	maxNesting: 16,
});

export interface MarkdownSourceLinks {
	readonly kind: "markdown-source-links-v1";
	readonly partial: true;
	readonly query: string;
	readonly sourceCodeUnits: number;
	readonly scannedCodeUnits: number;
	readonly truncated: boolean;
	readonly entries: readonly {
		readonly url: string;
		readonly label: string;
		readonly labelTruncated: boolean;
		readonly startLine: number;
		readonly column: number;
	}[];
}

export function discoverMarkdownSourceLinks(
	source: string,
	baseUrl: string,
	query: string,
	options: {
		maxEntries?: number;
		maxLabelCodeUnits?: number;
		maxUrlCodeUnits?: number;
		checkpoint?: () => void;
	} = {},
): MarkdownSourceLinks {
	if (
		typeof source !== "string" ||
		typeof query !== "string" ||
		!query.length ||
		query.length > 256 ||
		Array.from(query).some(
			(character) =>
				character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
		) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		(options.checkpoint !== undefined &&
			typeof options.checkpoint !== "function")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid Markdown source link options",
		);
	if (source.length > markdownSourceLinkLimits.maxSourceCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Markdown source link limit exceeded",
		);
	const maxEntries = options.maxEntries ?? markdownSourceLinkLimits.maxEntries;
	const maxLabelCodeUnits =
		options.maxLabelCodeUnits ?? markdownSourceLinkLimits.maxLabelCodeUnits;
	const maxUrlCodeUnits =
		options.maxUrlCodeUnits ?? markdownSourceLinkLimits.maxUrlCodeUnits;
	for (const [name, value, maximum] of [
		["maxEntries", maxEntries, 256],
		["maxLabelCodeUnits", maxLabelCodeUnits, 1024],
		["maxUrlCodeUnits", maxUrlCodeUnits, 4096],
	] as const) {
		if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
			throw new AgentBrowserError(
				"invalid-input",
				`Invalid link limit: ${name}`,
			);
	}
	options.checkpoint?.();
	const base = parseNetworkUrl(baseUrl).href;
	const needle = query.toLowerCase();
	const entries: MarkdownSourceLinks["entries"][number][] = [];
	const exhausted = Symbol("Markdown source scan exhausted");
	let work = 0;
	let nextCheckpoint = 1024;
	let scannedCodeUnits = 0;
	let truncated = false;
	const spend = (units: number) => {
		if (units > markdownSourceLinkLimits.maxWorkCodeUnits - work)
			throw exhausted;
		work += units;
		while (work >= nextCheckpoint) {
			nextCheckpoint += 1024;
			options.checkpoint?.();
		}
	};
	const read = (offset: number) => {
		spend(1);
		scannedCodeUnits = Math.max(scannedCodeUnits, offset + 1);
		return source[offset];
	};
	const matches = (offset: number, end: number, value: string) => {
		if (offset + value.length > end) return false;
		spend(value.length);
		return source.startsWith(value, offset);
	};
	const blank = (start: number, end: number) => {
		for (let offset = start; offset < end; offset++) {
			const character = read(offset);
			if (character !== " " && character !== "\t") return false;
		}
		return true;
	};
	const add = (
		destinationStart: number,
		destinationEnd: number,
		labelStart: number,
		labelEnd: number,
		startLine: number,
		column: number,
	) => {
		const length = destinationEnd - destinationStart;
		if (!length || length > maxUrlCodeUnits) return;
		spend(length + base.length);
		const destination = source.slice(destinationStart, destinationEnd);
		if (/[\s\p{Cc}\p{Cf}\\<>"'`\[\]]/u.test(destination)) return;
		spend(length);
		if (/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]*);/i.test(destination)) return;
		let url: string;
		try {
			const resolved = new URL(destination, base).href;
			if (resolved.length > maxUrlCodeUnits) return;
			url = parseNetworkUrl(resolved).href;
		} catch {
			return;
		}
		spend(url.length * 2);
		if (!url.toLowerCase().includes(needle)) return;
		if (entries.length === maxEntries) throw exhausted;
		let label = "";
		let offset = labelStart;
		while (offset < labelEnd) {
			spend(2);
			const point = source.codePointAt(offset);
			if (point === undefined) break;
			const character = String.fromCodePoint(point);
			const escaped =
				character !== "\t" && /[\p{Cc}\p{Cf}]/u.test(character)
					? `\\u{${point.toString(16)}}`
					: character;
			if (label.length + escaped.length > maxLabelCodeUnits) break;
			label += escaped;
			offset += character.length;
		}
		entries.push({
			url,
			label,
			labelTruncated: offset < labelEnd,
			startLine,
			column,
		});
	};
	let line = 0;
	let position = 0;
	let metadata: string | undefined;
	let fence:
		| { marker: string; length: number; quoteDepth: number; listIndent: number }
		| undefined;
	let suppressContainerTail = false;
	let listContext: { indent: number; quoteDepth: number } | undefined;
	let opaque: string | "blank" | undefined;
	let rawTag: string | undefined;
	let inlineTicks = 0;
	const consumeTicks = (start: number, end: number) => {
		let cursor = start + 1;
		while (cursor < end && read(cursor) === "`") cursor++;
		const length = cursor - start;
		if (!inlineTicks) inlineTicks = length;
		else if (length === inlineTicks) inlineTicks = 0;
		return cursor;
	};
	const closeOpaque = (start: number, end: number) => {
		for (let cursor = start; cursor < end; cursor++) {
			if (opaque && matches(cursor, end, opaque)) {
				opaque = undefined;
				return;
			}
			if (!rawTag || read(cursor) !== "<") continue;
			spend(32);
			if (
				new RegExp(`^</${rawTag}[ \\t]{0,16}>`, "i").test(
					source.slice(cursor, Math.min(end, cursor + 32)),
				)
			) {
				rawTag = undefined;
				return;
			}
		}
	};
	const openOpaque = (start: number, end: number) => {
		for (const [opening, closing] of [
			["<!--", "-->"],
			["<![CDATA[", "]]>"],
			["<?", "?>"],
		] as const) {
			if (!matches(start, end, opening)) continue;
			opaque = closing;
			closeOpaque(start + opening.length, end);
			return true;
		}
		spend(64);
		const prefix = source.slice(start, Math.min(end, start + 64));
		const raw = /^<(script|style|pre|textarea)(?:[ \t/>]|$)/i.exec(prefix);
		if (raw) {
			rawTag = raw[1];
			closeOpaque(start + raw[0].length, end);
			return true;
		}
		if (/^<\/?[a-z][\w-]*(?:[ \t/>]|$)|^<![A-Z]/i.test(prefix)) {
			opaque = "blank";
			return true;
		}
		return false;
	};
	try {
		scanSource: while (position < source.length) {
			const lineStart = position;
			line++;
			while (position < source.length) {
				if (metadata && (line > 128 || position > 16_384)) throw exhausted;
				const character = read(position);
				if (character === "\r" || character === "\n") break;
				position++;
			}
			const end = position;
			if (position < source.length) {
				const newline = source[position++];
				if (
					newline === "\r" &&
					position < source.length &&
					read(position) === "\n"
				)
					position++;
			}
			if (suppressContainerTail) continue;
			let cursor = lineStart;
			if (line === 1 && source[cursor] === "\uFEFF") cursor++;
			const marker = end - cursor === 3 ? source.slice(cursor, end) : undefined;
			if (line === 1 && (marker === "---" || marker === "+++")) {
				metadata = marker;
				continue;
			}
			if (metadata) {
				if (line > 128 || end > 16_384) throw exhausted;
				if (marker === metadata || (metadata === "---" && marker === "..."))
					metadata = undefined;
				continue;
			}
			if (opaque === "blank") {
				if (blank(cursor, end)) opaque = undefined;
				continue;
			}
			if (opaque || rawTag) {
				closeOpaque(cursor, end);
				continue;
			}
			if (fence) {
				for (let quote = 0; quote < fence.quoteDepth; quote++) {
					let indent = 0;
					while (cursor < end && indent < 3 && read(cursor) === " ") {
						cursor++;
						indent++;
					}
					if (cursor === end || read(cursor++) !== ">") continue scanSource;
					if (cursor < end && source[cursor] === " ") cursor++;
				}
				let indent = 0;
				while (
					cursor < end &&
					indent <= fence.listIndent + 3 &&
					read(cursor) === " "
				) {
					cursor++;
					indent++;
				}
				if (indent < fence.listIndent || indent > fence.listIndent + 3)
					continue;
				const start = cursor;
				while (cursor < end && read(cursor) === fence.marker) cursor++;
				if (cursor - start >= fence.length && blank(cursor, end))
					fence = undefined;
				continue;
			}
			let quoteDepth = 0;
			let listIndent = 0;
			let contentOrigin = cursor;
			let containerDepth = 0;
			let listPadding = false;
			let suppressContinuation = false;
			while (cursor < end) {
				if (!listIndent && listContext?.quoteDepth === quoteDepth) {
					let finish = cursor;
					while (
						finish < end &&
						finish - cursor < listContext.indent &&
						read(finish) === " "
					)
						finish++;
					if (finish - cursor === listContext.indent) {
						cursor = finish;
						listIndent = listContext.indent;
						suppressContinuation = true;
					}
				}
				let indent = 0;
				while (cursor < end && indent < 4 && read(cursor) === " ") {
					cursor++;
					indent++;
				}
				if (indent === 4 || source[cursor] === "\t") continue scanSource;
				if (listPadding) {
					listIndent = cursor - contentOrigin;
					listPadding = false;
				}
				if (source[cursor] === ">") {
					if (listIndent) {
						suppressContainerTail = true;
						continue scanSource;
					}
					if (++containerDepth > markdownSourceLinkLimits.maxNesting)
						throw exhausted;
					quoteDepth++;
					cursor++;
					if (cursor < end && source[cursor] === " ") cursor++;
					contentOrigin = cursor;
					continue;
				}
				if (cursor === end || !/[-+*\d]/.test(source[cursor])) break;
				spend(12);
				const item = /^(?:[-+*]|\d{1,9}[.)])[ \t]/.exec(
					source.slice(cursor, Math.min(end, cursor + 12)),
				);
				if (!item) break;
				if (++containerDepth > markdownSourceLinkLimits.maxNesting)
					throw exhausted;
				if (item[0].endsWith("\t")) {
					suppressContainerTail = true;
					continue scanSource;
				}
				cursor += item[0].length;
				listIndent = cursor - contentOrigin;
				listPadding = true;
			}
			if (listIndent) listContext = { indent: listIndent, quoteDepth };
			if (!inlineTicks) {
				const first = source[cursor];
				if (first === "`" || first === "~") {
					let finish = cursor;
					while (finish < end && read(finish) === first) finish++;
					const length = finish - cursor;
					if (length >= 3) {
						fence = { marker: first, length, quoteDepth, listIndent };
						continue;
					}
				}
			}
			if (suppressContinuation) continue;
			scanLine: while (cursor < end) {
				const start = cursor;
				const character = read(cursor++);
				if (character === "`") {
					cursor = consumeTicks(start, end);
					continue;
				}
				if (inlineTicks) continue;
				if (character === "\\") {
					if (cursor < end && read(cursor) === "[") break;
					if (cursor < end) cursor++;
					continue;
				}
				if (character === "<") {
					if (openOpaque(start, end)) break;
					spend(8);
					if (
						!/^https?:\/\//i.test(
							source.slice(cursor, Math.min(end, cursor + 8)),
						)
					)
						break;
					const destinationStart = cursor;
					while (cursor < end) {
						const destinationCharacter = read(cursor);
						if (destinationCharacter === "`") {
							cursor = consumeTicks(cursor, end);
							continue scanLine;
						}
						if (destinationCharacter === "<" && openOpaque(cursor, end))
							break scanLine;
						if (destinationCharacter === ">") break;
						cursor++;
					}
					if (cursor === end) break;
					add(
						destinationStart,
						cursor,
						destinationStart,
						cursor,
						line,
						start - lineStart + 1,
					);
					cursor++;
					continue;
				}
				if (character !== "[") continue;
				const image = start > lineStart && source[start - 1] === "!";
				const labelStart = cursor;
				let depth = 1;
				let literal = true;
				while (cursor < end && depth) {
					const labelCharacter = read(cursor++);
					if (labelCharacter === "`") {
						literal = false;
						cursor = consumeTicks(cursor - 1, end);
						continue;
					}
					if (inlineTicks) continue;
					if (labelCharacter === "<" && openOpaque(cursor - 1, end))
						break scanLine;
					if (labelCharacter === "[") {
						literal = false;
						if (++depth > markdownSourceLinkLimits.maxNesting) throw exhausted;
					} else if (labelCharacter === "]") depth--;
					else if ("\\`<>".includes(labelCharacter)) literal = false;
				}
				if (depth) break;
				const labelEnd = cursor - 1;
				if (cursor === end || read(cursor++) !== "(") break;
				const angle = cursor < end && read(cursor) === "<";
				if (angle && matches(cursor, end, "<!") && openOpaque(cursor, end))
					break;
				if (angle) cursor++;
				const destinationStart = cursor;
				depth = 1;
				let destinationEnd = cursor;
				let closed = false;
				while (cursor < end) {
					const destinationCharacter = read(cursor++);
					if (destinationCharacter === "`") {
						literal = false;
						cursor = consumeTicks(cursor - 1, end);
						continue;
					}
					if (inlineTicks) continue;
					if (destinationCharacter === "\\") break scanLine;
					if (destinationCharacter === "<" && openOpaque(cursor - 1, end))
						break scanLine;
					if (
						angle ? destinationCharacter === ">" : destinationCharacter === ")"
					) {
						if (angle || --depth === 0) {
							destinationEnd = cursor - 1;
							closed = !angle || (cursor < end && read(cursor++) === ")");
							break;
						}
					} else if (!angle && destinationCharacter === "(") {
						if (++depth > markdownSourceLinkLimits.maxNesting) throw exhausted;
					}
				}
				if (!closed) break;
				if (!image && literal)
					add(
						destinationStart,
						destinationEnd,
						labelStart,
						labelEnd,
						line,
						start - lineStart + 1,
					);
			}
		}
	} catch (error) {
		if (error !== exhausted) throw error;
		truncated = true;
	}
	options.checkpoint?.();
	return {
		kind: "markdown-source-links-v1",
		partial: true,
		query,
		sourceCodeUnits: source.length,
		scannedCodeUnits,
		truncated,
		entries,
	};
}
