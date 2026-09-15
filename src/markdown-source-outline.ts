import { AgentBrowserError } from "./errors.js";

export const markdownSourceOutlineLimits = Object.freeze({
	maxSourceCodeUnits: 2_000_000,
	maxEntries: 128,
	maxTitleCodeUnits: 128,
});

export interface MarkdownSourceHeading {
	readonly level: number;
	readonly title: string;
	readonly titleTruncated: boolean;
	readonly startLine: number;
	readonly endLine: number;
}

export interface MarkdownSourceOutline {
	readonly kind: "markdown-source-outline-v1";
	readonly partial: true;
	readonly sourceCodeUnits: number;
	readonly totalLines: number;
	readonly matchedHeadings: number;
	readonly leadingMetadataLines: number;
	readonly truncated: boolean;
	readonly entries: readonly MarkdownSourceHeading[];
}

function* sourceLines(source: string) {
	let start = 0;
	let line = 1;
	for (let offset = 0; offset < source.length; offset++) {
		const code = source.charCodeAt(offset);
		if (code !== 10 && code !== 13) continue;
		yield { line, text: source.slice(start, offset), end: offset };
		if (code === 13 && source.charCodeAt(offset + 1) === 10) offset++;
		line++;
		start = offset + 1;
	}
	yield { line, text: source.slice(start), end: source.length };
}

function leadingMetadataLines(source: string): number {
	let marker = "";
	for (const row of sourceLines(source)) {
		if (row.line > 128 || row.end > 16_384) break;
		const text = row.line === 1 ? row.text.replace(/^\uFEFF/, "") : row.text;
		if (row.line === 1) {
			if (text !== "---" && text !== "+++") return 0;
			marker = text;
		} else if (text === marker || (marker === "---" && text === "..."))
			return row.line;
	}
	return 0;
}

function sourceTitle(value: string) {
	const horizontalSpace = (character: string | undefined) =>
		character === " " || character === "\t";
	let start = 0;
	let finish = value.length;
	while (start < finish && horizontalSpace(value[start])) start++;
	while (finish > start && horizontalSpace(value[finish - 1])) finish--;
	let hashes = finish;
	while (hashes > 0 && value[hashes - 1] === "#") hashes--;
	if (hashes < finish && hashes > 0 && horizontalSpace(value[hashes - 1])) {
		finish = hashes;
		while (finish > start && horizontalSpace(value[finish - 1])) finish--;
	}
	finish = Math.max(start, finish);
	let end = Math.min(
		finish,
		start + markdownSourceOutlineLimits.maxTitleCodeUnits,
	);
	if (
		end < finish &&
		/[\uD800-\uDBFF]/.test(value.charAt(end - 1)) &&
		/[\uDC00-\uDFFF]/.test(value.charAt(end))
	)
		end--;
	return {
		title: value
			.slice(start, end)
			.replace(/[\p{Cc}\p{Cf}]/gu, (character) =>
				character === "\t"
					? character
					: `\\u{${character.codePointAt(0)?.toString(16)}}`,
			),
		titleTruncated: end < finish,
	};
}

export function outlineMarkdownSource(source: string): MarkdownSourceOutline {
	if (typeof source !== "string")
		throw new AgentBrowserError(
			"invalid-input",
			"Expected Markdown source text",
		);
	if (source.length > markdownSourceOutlineLimits.maxSourceCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Markdown source outline limit exceeded",
		);
	const metadataLines = leadingMetadataLines(source);
	const entries: {
		-readonly [Key in keyof MarkdownSourceHeading]: MarkdownSourceHeading[Key];
	}[] = [];
	const pending: typeof entries = [];
	let totalLines = 1;
	let matchedHeadings = 0;
	let fence: { marker: string; length: number } | undefined;
	let opaque: RegExp | "blank" | undefined;
	for (const row of sourceLines(source)) {
		totalLines = row.line;
		if (row.line <= metadataLines) continue;
		const text = row.line === 1 ? row.text.replace(/^\uFEFF/, "") : row.text;
		if (opaque) {
			if (opaque === "blank" ? /^[ \t]*$/.test(text) : opaque.test(text))
				opaque = undefined;
			continue;
		}
		const fenceRun = /^ {0,3}(`{3,}|~{3,})/.exec(text);
		const fenced = fenceRun
			? {
					marker: fenceRun[1][0],
					length: fenceRun[1].length,
					info: text.slice(fenceRun[0].length),
				}
			: undefined;
		if (fence) {
			if (
				fenced &&
				fenced.marker === fence.marker &&
				fenced.length >= fence.length &&
				/^[ \t]*$/.test(fenced.info)
			)
				fence = undefined;
			continue;
		}
		if (fenced && (fenced.marker !== "`" || !fenced.info.includes("`"))) {
			fence = { marker: fenced.marker, length: fenced.length };
			continue;
		}
		if (/^[ \t]*$/.test(text)) continue;
		const raw = /^ {0,3}<(script|style|pre|textarea)(?:[ \t>]|$)/i.exec(text);
		if (raw) opaque = new RegExp(`</${raw[1]}[ \\t]*>`, "i");
		else if (/^ {0,3}<!--/.test(text)) opaque = /-->/;
		else if (/^ {0,3}<!\[CDATA\[/.test(text)) opaque = /\]\]>/;
		else if (/^ {0,3}<\?/.test(text)) opaque = /\?>/;
		else if (/^ {0,3}<![A-Z]/.test(text)) opaque = />/;
		else if (/^ {0,3}<\/?[A-Za-z][\w-]*(?:[ \t/>]|$)/.test(text))
			opaque = "blank";
		if (opaque) {
			if (opaque !== "blank" && opaque.test(text)) opaque = undefined;
			continue;
		}
		const heading = /^ {0,3}(#{1,6})(?=[ \t]|$)/.exec(text);
		if (!heading) continue;
		const level = heading[1].length;
		matchedHeadings++;
		while (pending.length && pending[pending.length - 1].level >= level) {
			const previous = pending.pop();
			if (previous) previous.endLine = row.line - 1;
		}
		if (entries.length === markdownSourceOutlineLimits.maxEntries) continue;
		const entry = {
			level,
			...sourceTitle(text.slice(heading[0].length)),
			startLine: row.line,
			endLine: row.line,
		};
		entries.push(entry);
		pending.push(entry);
	}
	for (const entry of pending) entry.endLine = totalLines;
	return Object.freeze({
		kind: "markdown-source-outline-v1",
		partial: true,
		sourceCodeUnits: source.length,
		totalLines,
		matchedHeadings,
		leadingMetadataLines: metadataLines,
		truncated: matchedHeadings > entries.length,
		entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
	});
}
