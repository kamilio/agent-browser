import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { utf8ByteLength } from "./utf8-byte-length.js";

export interface YoutubeSearchRoute {
	readonly query: string;
}

export interface ResearchSourceVideo {
	readonly source: Readonly<{
		offset: number;
		offsetBasis: "lf-normalized-utf16";
		path: string;
	}>;
	readonly videoId: string;
	readonly url: string;
	readonly title: string;
	readonly authorText?: string;
	readonly durationText?: string;
	readonly publishedText?: string;
	readonly viewsText?: string;
	readonly snippetText?: string;
	readonly truncated: boolean;
}

export interface ResearchSourceVideos {
	readonly kind: "youtube-search-video-results-v1";
	readonly scope: "document-source";
	readonly partial: true;
	readonly rendered: false;
	readonly verified: false;
	readonly textFormat: "plain-text";
	readonly query: string;
	readonly entries: readonly ResearchSourceVideo[];
	readonly truncated: boolean;
}

const information = new WeakMap<DocumentTree, ResearchSourceVideos>();
const identifier = /^[A-Za-z0-9_-]{11}$/;

function validQuery(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= 256 &&
		value.trim().length > 0 &&
		!/[\p{Cc}\p{Cf}]/u.test(value)
	);
}

export function youtubeSearchRoute(
	value: string,
): YoutubeSearchRoute | undefined {
	if (typeof value !== "string" || value.length > 4096) return;
	try {
		const url = new URL(value);
		const queries = url.searchParams.getAll("search_query");
		if (
			!["https://www.youtube.com", "https://youtube.com"].includes(
				url.origin,
			) ||
			url.username ||
			url.password ||
			url.pathname !== "/results" ||
			queries.length !== 1 ||
			!validQuery(queries[0])
		)
			return;
		return Object.freeze({ query: queries[0] });
	} catch {
		return;
	}
}

function own(value: unknown, key: string): unknown {
	return value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.hasOwn(value, key)
		? (value as Record<string, unknown>)[key]
		: undefined;
}

function field(value: unknown, ...keys: string[]): unknown {
	let current = value;
	for (const key of keys) current = own(current, key);
	return current;
}

function text(
	value: unknown,
	limit: number,
	truncate: () => void,
): string | undefined {
	const simpleText = own(value, "simpleText");
	let result: string;
	if (typeof simpleText === "string") result = simpleText;
	else {
		const runs = own(value, "runs");
		if (!Array.isArray(runs)) return;
		if (runs.length > 32) {
			truncate();
			return;
		}
		let joined = "";
		for (const run of runs) {
			const part = own(run, "text");
			if (typeof part !== "string") return;
			if (joined.length + part.length > limit) {
				truncate();
				return;
			}
			joined += part;
		}
		result = joined;
	}
	if (result.length > limit) {
		truncate();
		return;
	}
	const escaped = result.replace(/[\p{Cc}\p{Cf}]/gu, (character) =>
		character === "\n" || character === "\t"
			? character
			: `\\u{${character.codePointAt(0)?.toString(16)}}`,
	);
	if (escaped.length <= limit) return escaped;
	truncate();
}

function snapshot(
	query: string,
	entries: readonly ResearchSourceVideo[],
	truncated: boolean,
): ResearchSourceVideos {
	return Object.freeze({
		kind: "youtube-search-video-results-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		verified: false,
		textFormat: "plain-text",
		query,
		truncated,
		entries: Object.freeze(
			entries.map((entry) =>
				Object.freeze({
					source: Object.freeze({
						offset: entry.source.offset,
						offsetBasis: entry.source.offsetBasis,
						path: entry.source.path,
					}),
					videoId: entry.videoId,
					url: entry.url,
					title: entry.title,
					...(entry.authorText === undefined
						? {}
						: { authorText: entry.authorText }),
					...(entry.durationText === undefined
						? {}
						: { durationText: entry.durationText }),
					...(entry.publishedText === undefined
						? {}
						: { publishedText: entry.publishedText }),
					...(entry.viewsText === undefined
						? {}
						: { viewsText: entry.viewsText }),
					...(entry.snippetText === undefined
						? {}
						: { snippetText: entry.snippetText }),
					truncated: entry.truncated,
				}),
			),
		),
	});
}

function validEndpoint(value: unknown, videoId: string): boolean {
	if (field(value, "watchEndpoint", "videoId") !== videoId) return false;
	const urlValue = field(value, "commandMetadata", "webCommandMetadata", "url");
	if (urlValue === undefined) return true;
	if (typeof urlValue !== "string" || urlValue.length > 4096) return false;
	try {
		const url = new URL(urlValue, "https://www.youtube.com");
		return (
			url.origin === "https://www.youtube.com" &&
			!url.username &&
			!url.password &&
			url.pathname === "/watch" &&
			url.searchParams.getAll("v").length === 1 &&
			url.searchParams.get("v") === videoId
		);
	} catch {
		return false;
	}
}

export class ResearchSourceVideosCollector {
	private blocks = 0;
	private truncated = false;
	private readonly query: string;
	private readonly entries: ResearchSourceVideo[] = [];

	constructor(route: YoutubeSearchRoute) {
		if (!route || !validQuery(route.query))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid video search route",
			);
		this.query = route.query;
	}

	add(source: string, start: number, end: number, offset: number): void {
		if (
			typeof source !== "string" ||
			![start, end, offset].every(Number.isSafeInteger) ||
			offset < 0 ||
			start < offset ||
			end < start ||
			end > source.length
		)
			throw new AgentBrowserError("invalid-input", "Invalid video source span");
		const prefix =
			/^[\t\n\r\f ]*var[\t\n\r\f ]+ytInitialData[\t\n\r\f ]*=[\t\n\r\f ]*/.exec(
				source.slice(start, Math.min(end, start + 128)),
			);
		if (!prefix) return;
		if (++this.blocks !== 1) {
			this.entries.length = 0;
			return;
		}
		if (end - start > 1_048_576) {
			this.truncated = true;
			return;
		}
		const jsonStart = start + prefix[0].length;
		let jsonEnd = end;
		while (jsonEnd > jsonStart && "\t\n\r\f ".includes(source[jsonEnd - 1]))
			jsonEnd--;
		if (source[jsonEnd - 1] === ";") jsonEnd--;
		let data: unknown;
		try {
			data = JSON.parse(source.slice(jsonStart, jsonEnd));
		} catch {
			return;
		}
		const sections = field(
			data,
			"contents",
			"twoColumnSearchResultsRenderer",
			"primaryContents",
			"sectionListRenderer",
			"contents",
		);
		if (!Array.isArray(sections)) return;
		if (sections.length > 8) this.truncated = true;
		for (
			let sectionIndex = 0;
			sectionIndex < Math.min(sections.length, 8);
			sectionIndex++
		) {
			const items = field(
				sections[sectionIndex],
				"itemSectionRenderer",
				"contents",
			);
			if (!Array.isArray(items)) continue;
			if (items.length > 64) this.truncated = true;
			for (
				let itemIndex = 0;
				itemIndex < Math.min(items.length, 64);
				itemIndex++
			) {
				const value = own(items[itemIndex], "videoRenderer");
				const videoId = own(value, "videoId");
				if (
					typeof videoId !== "string" ||
					!identifier.test(videoId) ||
					!validEndpoint(own(value, "navigationEndpoint"), videoId)
				)
					continue;
				let truncated = false;
				const truncate = () => {
					truncated = true;
					this.truncated = true;
				};
				const title = text(own(value, "title"), 1024, truncate);
				if (!title?.trim()) continue;
				if (this.entries.length === 20) {
					this.truncated = true;
					return;
				}
				const optional: {
					authorText?: string;
					durationText?: string;
					publishedText?: string;
					viewsText?: string;
					snippetText?: string;
				} = {};
				for (const [output, input, limit] of [
					["authorText", "ownerText", 256],
					["durationText", "lengthText", 64],
					["publishedText", "publishedTimeText", 128],
					["viewsText", "viewCountText", 128],
				] as const) {
					const result = text(own(value, input), limit, truncate);
					if (result !== undefined) optional[output] = result;
				}
				const snippets = own(value, "detailedMetadataSnippets");
				const snippet = text(
					Array.isArray(snippets) ? own(snippets[0], "snippetText") : undefined,
					2048,
					truncate,
				);
				if (snippet !== undefined) optional.snippetText = snippet;
				this.entries.push({
					source: {
						offset,
						offsetBasis: "lf-normalized-utf16",
						path: `$.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[${sectionIndex}].itemSectionRenderer.contents[${itemIndex}].videoRenderer`,
					},
					videoId,
					url: `https://www.youtube.com/watch?v=${videoId}`,
					title,
					...optional,
					truncated,
				});
			}
		}
	}

	finish(): ResearchSourceVideos | undefined {
		if (this.blocks !== 1) return;
		return fitResearchSourceVideos(
			snapshot(this.query, this.entries, this.truncated),
			32768,
		);
	}
}

export function fitResearchSourceVideos(
	data: ResearchSourceVideos,
	maxBytes: number,
): ResearchSourceVideos | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid video source byte limit",
		);
	const limit = Math.min(maxBytes, 32768);
	for (let count = Math.min(data.entries.length, 20); count > 0; count--) {
		const prefix = snapshot(
			data.query,
			data.entries.slice(0, count),
			data.truncated || count < data.entries.length,
		);
		if (utf8ByteLength(JSON.stringify(prefix)) <= limit) return prefix;
	}
}

export function researchSourceVideos(
	tree: DocumentTree,
): ResearchSourceVideos | undefined {
	return information.get(tree);
}

export function setResearchSourceVideos(
	tree: DocumentTree,
	data: ResearchSourceVideos,
): void {
	if (!information.has(tree)) tree.onClose(() => information.delete(tree));
	information.set(tree, snapshot(data.query, data.entries, data.truncated));
}
