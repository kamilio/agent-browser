import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { HtmlToken } from "./html-tokenizer.js";
import { sourceInlineDisplayHidden } from "./research-inline-visibility.js";
import { utf8ByteLength } from "./utf8-byte-length.js";

export interface ResearchSourceTemplateFallbackEntry {
	readonly template: {
		readonly offset: number;
		readonly attributes: {
			readonly id?: string;
			readonly shadowrootmode?: string;
		};
	};
	readonly source: {
		readonly offset: number;
		readonly offsetBasis: "lf-normalized-utf16";
	};
	readonly html: string;
}

export interface ResearchSourceTemplateFallbacks {
	readonly kind: "html-template-noscript-source-v1";
	readonly scope: "document-source";
	readonly partial: true;
	readonly rendered: false;
	readonly verified: false;
	readonly textFormat: "html-source";
	readonly truncated: boolean;
	readonly entries: readonly ResearchSourceTemplateFallbackEntry[];
}

const information = new WeakMap<
	DocumentTree,
	ResearchSourceTemplateFallbacks
>();
const registered = new WeakSet<DocumentTree>();
const maximumBytes = 32_768;
const maximumEntries = 16;
const maximumHtmlUnits = 8192;
const forbiddenAncestors = new Set(
	"template noscript svg math script style xmp iframe object embed canvas noembed noframes input textarea select datalist audio video".split(
		" ",
	),
);
const listContainers = new Set(["ul", "ol", "menu"]);

function templateAttributes(
	attributes: ResearchSourceTemplateFallbackEntry["template"]["attributes"],
): ResearchSourceTemplateFallbackEntry["template"]["attributes"] {
	const copied: { id?: string; shadowrootmode?: string } = {};
	for (const key of ["id", "shadowrootmode"] as const) {
		if (!Object.hasOwn(attributes, key)) continue;
		const value = attributes[key];
		if (typeof value === "string" && value.length <= 256) copied[key] = value;
	}
	return Object.freeze(copied);
}

export function sourceTemplateFallbackHidden(
	attributes: Record<string, string>,
): boolean {
	return (
		Object.hasOwn(attributes, "hidden") ||
		Object.hasOwn(attributes, "inert") ||
		(Object.hasOwn(attributes, "aria-hidden") &&
			attributes["aria-hidden"].toLowerCase() === "true") ||
		(Object.hasOwn(attributes, "style") &&
			sourceInlineDisplayHidden(attributes.style))
	);
}

function snapshot(
	entries: readonly ResearchSourceTemplateFallbackEntry[],
	truncated: boolean,
): ResearchSourceTemplateFallbacks {
	return Object.freeze({
		kind: "html-template-noscript-source-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		verified: false,
		textFormat: "html-source",
		truncated,
		entries: Object.freeze(
			entries.map((entry) =>
				Object.freeze({
					template: Object.freeze({
						offset: entry.template.offset,
						attributes: templateAttributes(entry.template.attributes),
					}),
					source: Object.freeze({
						offset: entry.source.offset,
						offsetBasis: "lf-normalized-utf16" as const,
					}),
					html: entry.html,
				}),
			),
		),
	});
}

export class ResearchSourceTemplateFallbackCollector {
	private template: ResearchSourceTemplateFallbackEntry["template"] | undefined;
	private capture:
		| { depth: number; offset: number; start: number; meaningful: boolean }
		| undefined;
	private blockedDepth = 0;
	private truncated = false;
	private readonly entries: ResearchSourceTemplateFallbackEntry[] = [];

	constructor(private readonly source: string) {
		if (typeof source !== "string")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid template fallback source",
			);
	}

	begin(attributes: Record<string, string>, offset: number): void {
		if (
			!Number.isSafeInteger(offset) ||
			offset < 0 ||
			offset > this.source.length
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid template fallback offset",
			);
		this.template = Object.freeze({
			offset,
			attributes: templateAttributes(attributes),
		});
		this.capture = undefined;
		this.blockedDepth = sourceTemplateFallbackHidden(attributes) ? 1 : 0;
	}

	observe(
		token: HtmlToken,
		offset: number,
		end: number,
		parents: readonly string[],
	): void {
		if (!this.template) return;
		if (
			!Number.isSafeInteger(offset) ||
			!Number.isSafeInteger(end) ||
			offset < 0 ||
			end < offset ||
			end > this.source.length
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid template fallback span",
			);
		if (
			parents[0] !== "template" ||
			(token.kind === "end" &&
				token.name === "template" &&
				parents.length === 1)
		) {
			this.template = undefined;
			this.capture = undefined;
			this.blockedDepth = 0;
			return;
		}
		let depth = parents.length;
		if (
			(token.kind === "start" || token.kind === "end") &&
			!parents.some((ancestor) => ancestor === "svg" || ancestor === "math")
		) {
			if (
				token.kind === "start" &&
				token.name === "p" &&
				parents[depth - 1] === "p"
			)
				depth--;
			if (
				parents[depth - 1] === "li" &&
				listContainers.has(parents[depth - 2]) &&
				((token.kind === "start" && token.name === "li") ||
					(token.kind === "end" && token.name === parents[depth - 2]))
			)
				depth--;
		}
		if (this.blockedDepth > depth) this.blockedDepth = 0;
		if (this.capture && depth < this.capture.depth) this.capture = undefined;
		if (this.blockedDepth) return;
		if (token.kind === "start") {
			if (sourceTemplateFallbackHidden(token.attributes)) {
				this.blockedDepth = depth + 1;
				this.capture = undefined;
				return;
			}
			if (this.capture && forbiddenAncestors.has(token.name)) {
				this.capture = undefined;
				return;
			}
			if (
				token.name === "noscript" &&
				!token.selfClosing &&
				!parents.some(
					(ancestor, index) => index > 0 && forbiddenAncestors.has(ancestor),
				)
			)
				this.capture = {
					depth: parents.length + 1,
					offset,
					start: end,
					meaningful: false,
				};
			return;
		}
		if (!this.capture) return;
		if (token.kind === "text" && token.data.trim())
			this.capture.meaningful = true;
		if (
			token.kind !== "end" ||
			token.name !== "noscript" ||
			parents.length !== this.capture.depth ||
			parents.at(-1) !== "noscript"
		)
			return;
		const capture = this.capture;
		this.capture = undefined;
		if (!capture.meaningful || offset < capture.start) return;
		if (
			offset - capture.start > maximumHtmlUnits ||
			this.entries.length >= maximumEntries
		) {
			this.truncated = true;
			return;
		}
		this.entries.push({
			template: this.template,
			source: {
				offset: capture.offset,
				offsetBasis: "lf-normalized-utf16",
			},
			html: this.source.slice(capture.start, offset),
		});
	}

	finish(): ResearchSourceTemplateFallbacks | undefined {
		if (!this.entries.length && !this.truncated) return;
		return fitResearchSourceTemplateFallbacks(
			snapshot(this.entries, this.truncated),
			maximumBytes,
		);
	}
}

export function fitResearchSourceTemplateFallbacks(
	data: ResearchSourceTemplateFallbacks,
	maxBytes: number,
): ResearchSourceTemplateFallbacks | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"resource-limit",
			"Invalid template fallback byte limit",
		);
	const limit = Math.min(maxBytes, maximumBytes);
	let count = Math.min(data.entries.length, maximumEntries);
	for (let index = 0; index < count; index++) {
		if (data.entries[index].html.length > maximumHtmlUnits) {
			count = index;
			break;
		}
	}
	for (; count >= 0; count--) {
		const prefix = snapshot(
			data.entries.slice(0, count),
			data.truncated || count === 0 || count < data.entries.length,
		);
		if (utf8ByteLength(JSON.stringify(prefix)) <= limit) return prefix;
	}
	return;
}

export function researchSourceTemplateFallbacks(
	tree: DocumentTree,
): ResearchSourceTemplateFallbacks | undefined {
	return information.get(tree);
}

export function setResearchSourceTemplateFallbacks(
	tree: DocumentTree,
	data: ResearchSourceTemplateFallbacks,
): void {
	const copied = fitResearchSourceTemplateFallbacks(data, maximumBytes);
	if (!registered.has(tree)) {
		tree.onClose(() => {
			information.delete(tree);
			registered.delete(tree);
		});
		registered.add(tree);
	}
	if (copied) information.set(tree, copied);
	else information.delete(tree);
}
