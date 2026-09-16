import { utf8ByteLength } from "./utf8-byte-length.js";
import {
	type AriaTableSourceMetadata,
	extractAriaTableSource,
} from "./aria-table-source.js";
import {
	type DocumentAlternates,
	documentAlternates,
} from "./document-alternates.js";
import { documentTitle } from "./document-title.js";
import {
	type DocumentDescriptions,
	documentDescriptions,
} from "./document-descriptions.js";
import {
	type DateTimeSourceMetadata,
	extractDateTimeSource,
} from "./date-time-source.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type ContentFocusMetadata,
	selectContentFocus,
} from "./extraction-content-focus.js";
import {
	type ExtractionContentFallback,
	boundedExtractionTextPrefix,
} from "./extraction-prefix.js";
import {
	type HeadingSectionMetadata,
	selectHeadingSection,
} from "./extraction-section.js";
import {
	type HeadingTarget,
	collectHeadingTargets,
} from "./heading-discovery.js";
import { htmlParseInfo } from "./html-info.js";
import { type LinkTarget, collectLinkTargets } from "./link-discovery.js";
import {
	type MarkdownSourceLinks,
	discoverMarkdownSourceLinks,
} from "./markdown-source-links.js";
import {
	type ResearchReaderReport,
	researchReaderInfo,
} from "./research-reader-info.js";
import {
	type ResearchSourceDataTables,
	fitResearchSourceDataTables,
	researchSourceDataTables,
} from "./research-source-data-tables.js";
import {
	type ResearchSourceAccess,
	fitResearchSourceAccess,
	researchSourceAccess,
} from "./research-source-access.js";
import {
	type ResearchSourceProducts,
	fitResearchSourceProducts,
	researchSourceProducts,
} from "./research-source-products.js";
import {
	type ResearchSourceVideos,
	fitResearchSourceVideos,
	researchSourceVideos,
} from "./research-source-videos.js";
import {
	type DocumentFeeds,
	documentFeeds,
	fitDocumentFeeds,
} from "./document-feeds.js";
import {
	resourceLimitDiagnostic,
	resourceLimitError,
} from "./resource-limit.js";
import { documentStyles } from "./styles.js";
import { rustdocLineNumberAnchor } from "./rustdoc-code-gutters.js";
import {
	type GithubSourceBlock,
	githubSourceBlock,
} from "./github-source-lines.js";
import {
	type TableSourceMetadata,
	extractTableSource,
} from "./table-source.js";
import { textDocumentInfo } from "./text-document-info.js";
import {
	type MarkdownSourceOutline,
	markdownSourceOutlineLimits,
	outlineMarkdownSource,
} from "./markdown-source-outline.js";
import {
	type TextLineDiscovery,
	type TextLineDiscoveryOptions,
	discoverTextLines,
} from "./text-line-discovery.js";

export type ExtractionType =
	| "container"
	| "inline"
	| "text"
	| "paragraph"
	| "heading"
	| "list"
	| "list-item"
	| "blockquote"
	| "pre"
	| "code"
	| "strong"
	| "emphasis"
	| "link"
	| "image"
	| "break"
	| "separator"
	| "table"
	| "row"
	| "cell";

export interface ExtractedNode {
	ref: string;
	type: ExtractionType;
	text?: string;
	level?: number;
	ordered?: boolean;
	start?: number;
	url?: string;
	blocked?: true;
	tableSource?: TableSourceMetadata;
	ariaTableSource?: AriaTableSourceMetadata;
	dateTimeSource?: DateTimeSourceMetadata;
	children?: ExtractedNode[];
}

export interface ExtractionOptions {
	format?: "markdown" | "json";
	contentFocus?: "main-content-v1";
	outputLimitPolicy?: "text-prefix-v1";
	tableMetadata?: boolean;
	compactTables?: boolean;
	tableRows?: boolean;
	root?: string;
	lines?: { start: number; end: number };
	section?: string;
	maxBytes?: number;
	maxNodes?: number;
	maxDepth?: number;
}

export interface HeadingDiscoveryOptions {
	maxBytes?: number;
	maxNodes?: number;
	maxDepth?: number;
	maxEntries?: number;
	maxTitleCodeUnits?: number;
	maxSelectorCodeUnits?: number;
}

export interface DocumentHeadingOutline {
	method: "heading-outline";
	document: string;
	revision: number;
	partial: true;
	entries: HeadingTarget[];
	scannedNodes: number;
	truncated: boolean;
}

export interface DocumentTextLineDiscoveryOptions
	extends TextLineDiscoveryOptions {
	maxBytes?: number;
}

export interface LinkDiscoveryOptions {
	maxBytes?: number;
	maxNodes?: number;
	maxDepth?: number;
	maxEntries?: number;
	maxLabelCodeUnits?: number;
	maxUrlCodeUnits?: number;
	checkpoint?: () => void;
}

export interface DocumentLinkDiscovery {
	method: "link-discovery";
	document: string;
	revision: number;
	partial: true;
	query: string;
	entries: LinkTarget[];
	scannedNodes: number;
	truncated: boolean;
	sourceMarkdown?: MarkdownSourceLinks;
}

export interface DocumentTextLineDiscovery extends TextLineDiscovery {
	method: "text-line-discovery";
	document: string;
	revision: number;
	partial: true;
}

interface ExtractionMetadata {
	document: string;
	scope: string;
	url: string;
	title: string;
	revision: number;
	partial: true;
	contentFallback?: Readonly<ExtractionContentFallback>;
	contentSelection?: Readonly<ContentFocusMetadata>;
	compactTables?: true;
	tableRows?: true;
	reader?: Readonly<ResearchReaderReport>;
	sourceDescriptions?: DocumentDescriptions;
	sourceAlternates?: DocumentAlternates;
	sourceDataTables?: ResearchSourceDataTables;
	sourceAccess?: ResearchSourceAccess;
	sourceProducts?: ResearchSourceProducts;
	sourceVideos?: ResearchSourceVideos;
	sourceFeeds?: DocumentFeeds;
	sourceMarkdown?: MarkdownSourceOutline;
	sourceCodeGutters?: Readonly<{
		kind: "rustdoc-line-number-anchors-v1";
		anchors: number;
	}>;
	sourceCodeBlocks?: Readonly<{
		kind: "github-ssr-lines-v1";
		blocks: number;
		lines: number;
		gutterLabels: number;
		lineEndings: "inferred-lf";
		terminalNewline: "unknown";
	}>;
	sectionSelection?: Readonly<HeadingSectionMetadata>;
	textSelection?: {
		method: "text-lines";
		start: number;
		end: number;
		totalLines: number;
		sourceCodeUnits: number;
		selectedCodeUnits: number;
	};
}

export type DocumentExtraction = ExtractionMetadata &
	(
		| { format: "markdown"; content: string }
		| { format: "json"; content: ExtractedNode }
	);

const omitted = new Set([
	"head",
	"script",
	"style",
	"template",
	"iframe",
	"noembed",
	"noframes",
	"object",
	"embed",
	"canvas",
	"input",
	"textarea",
	"select",
	"datalist",
]);
const kinds: Readonly<Record<string, ExtractionType>> = {
	p: "paragraph",
	h1: "heading",
	h2: "heading",
	h3: "heading",
	h4: "heading",
	h5: "heading",
	h6: "heading",
	ul: "list",
	ol: "list",
	li: "list-item",
	blockquote: "blockquote",
	pre: "pre",
	code: "code",
	strong: "strong",
	b: "strong",
	em: "emphasis",
	i: "emphasis",
	a: "link",
	img: "image",
	br: "break",
	hr: "separator",
	table: "table",
	tr: "row",
	td: "cell",
	th: "cell",
};
const inlineTypes = new Set<ExtractionType>([
	"inline",
	"text",
	"code",
	"strong",
	"emphasis",
	"link",
	"image",
	"break",
]);
const tableBoundaryMarkers: Partial<
	Record<ExtractionType, { begin: string; end: string }>
> = {
	table: {
		begin:
			"**Native table begin (selected structure only; associations unspecified)**",
		end: "**Native table end**",
	},
	row: {
		begin: "**Native row begin (selected structure only)**",
		end: "**Native row end**",
	},
	cell: {
		begin: "**Native cell begin (selected structure only)**",
		end: "**Native cell end**",
	},
};
const leafElements = new Set(["img", "br", "hr"]);

function eligibleTextLineSource(tree: DocumentTree) {
	const root = tree.get(tree.root);
	const info = textDocumentInfo(tree);
	if (!info || info.revision !== tree.revision) return undefined;
	const source = tree.get(info.textNode);
	const pre = source.parent === null ? undefined : tree.get(source.parent);
	if (
		root.kind !== "document" ||
		root.children.length !== 1 ||
		pre?.kind !== "element" ||
		pre.tagName !== "pre" ||
		pre.parent !== root.id ||
		root.children[0] !== pre.id ||
		pre.children.length !== 1 ||
		pre.children[0] !== source.id ||
		source.kind !== "text"
	)
		return undefined;
	return source;
}

function textLineSource(tree: DocumentTree) {
	const source = eligibleTextLineSource(tree);
	if (!source) {
		const info = textDocumentInfo(tree);
		throw new AgentBrowserError(
			"unsupported",
			!info || info.revision !== tree.revision
				? "Text line extraction requires an unchanged text-loader document"
				: "Text line extraction requires only the native pre and registered text node",
		);
	}
	const text = source.data;
	if (text.length > 2_000_000)
		throw new AgentBrowserError(
			"resource-limit",
			"Text line extraction scan limit exceeded",
		);
	return { textNode: source.id, text };
}

function selectTextLines(
	tree: DocumentTree,
	lines: NonNullable<ExtractionOptions["lines"]>,
) {
	if (
		lines === null ||
		typeof lines !== "object" ||
		Array.isArray(lines) ||
		!Number.isSafeInteger(lines.start) ||
		!Number.isSafeInteger(lines.end) ||
		lines.start < 1 ||
		lines.start > lines.end ||
		lines.end > 2_000_001
	)
		throw new AgentBrowserError("invalid-input", "Invalid text line range");
	const { textNode, text } = textLineSource(tree);
	let totalLines = 1;
	let startOffset = 0;
	let endOffset = text.length;
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		if (code !== 13 && code !== 10) continue;
		if (code === 13 && text.charCodeAt(index + 1) === 10) index++;
		if (totalLines === lines.end) endOffset = index + 1;
		totalLines++;
		if (totalLines === lines.start) startOffset = index + 1;
	}
	if (lines.end > totalLines)
		throw new AgentBrowserError(
			"not-found",
			"Text line range exceeds document",
		);
	return {
		textNode,
		text: text.slice(startOffset, endOffset),
		metadata: {
			method: "text-lines" as const,
			start: lines.start,
			end: lines.end,
			totalLines,
			sourceCodeUnits: text.length,
			selectedCodeUnits: endOffset - startOffset,
		},
	};
}

function clean(value: string) {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/[\p{Cc}\p{Cf}]/gu, (character) =>
			character === "\n" || character === "\t"
				? character
				: `\\u{${character.codePointAt(0)?.toString(16)}}`,
		);
}

function escaped(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/[\\`*_[\]{}()#+.!|~-]/g, "\\$&");
}

function destination(value: string, base: string) {
	try {
		const url = new URL(value, base);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password
		)
			return;
		return url.href.replace(/</g, "%3C").replace(/>/g, "%3E");
	} catch {}
}

function plain(nodes: readonly ExtractedNode[]) {
	const pieces: string[] = [];
	const pending = nodes.slice().reverse();
	while (pending.length) {
		const node = pending.pop();
		if (!node) break;
		if (node.text !== undefined) pieces.push(node.text);
		else if (node.type === "break") pieces.push("\n");
		if (node.children)
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push(node.children[index]);
	}
	return pieces.join("");
}

function fence(text: string, minimum: number) {
	let length = minimum;
	for (const match of text.matchAll(/`+/g))
		length = Math.max(length, match[0].length + 1);
	return "`".repeat(length);
}

interface MarkdownLinkContext {
	url?: string;
	linked: boolean;
	preformatted: boolean;
}

function flowLinkStructure(root: ExtractedNode) {
	const blockNodes = new Set<ExtractedNode>();
	const links = new Set<ExtractedNode>();
	const wrappers = new Set<ExtractedNode>();
	const sinks = new Set<ExtractionType>([
		"heading",
		"paragraph",
		"pre",
		"code",
		"strong",
		"emphasis",
	]);
	const ordered: ExtractedNode[] = [];
	const pending = [root];
	while (pending.length) {
		const node = pending.pop();
		if (!node) break;
		ordered.push(node);
		if (!sinks.has(node.type))
			for (const child of node.children ?? []) pending.push(child);
	}
	for (let index = ordered.length - 1; index >= 0; index--) {
		const node = ordered[index];
		const children = sinks.has(node.type) ? [] : (node.children ?? []);
		const childBlock = children.some((child) => blockNodes.has(child));
		if (!inlineTypes.has(node.type) || childBlock) blockNodes.add(node);
		if (node.type === "link" && childBlock) links.add(node);
		if (links.has(node) || children.some((child) => wrappers.has(child)))
			wrappers.add(node);
	}
	return { blockNodes, links, wrappers };
}

function inline(
	nodes: readonly ExtractedNode[],
	inherited?: MarkdownLinkContext,
) {
	const pieces: string[] = [];
	const pending: (
		| { node: ExtractedNode; inLink: boolean }
		| { closingLink: string; openingIndex: number }
	)[] = nodes
		.slice()
		.reverse()
		.map((node) => ({ node, inLink: !!inherited?.url }));
	while (pending.length) {
		const current = pending.pop();
		if (!current) break;
		if ("closingLink" in current) {
			let hasLabel = false;
			for (
				let index = current.openingIndex + 1;
				index < pieces.length;
				index++
			) {
				if (pieces[index].trim()) {
					hasLabel = true;
					break;
				}
			}
			if (hasLabel) pieces.push(current.closingLink);
			else pieces.splice(current.openingIndex, 1);
			continue;
		}
		const { node, inLink } = current;
		if (node.type === "text" || node.type === "image") {
			pieces.push(escaped((node.text ?? "").replace(/\s+/gu, " ")));
			continue;
		}
		if (node.type === "break") {
			pieces.push("  \n");
			continue;
		}
		if (node.type === "code") {
			const text = plain(node.children ?? []).replace(/\n/g, " ");
			if (!text) continue;
			const marker = fence(text, 1);
			const padding = text.trim() ? " " : "";
			pieces.push(`${marker}${padding}${text}${padding}${marker}`);
			continue;
		}
		const link = node.type === "link" && !!node.url && !inLink;
		if (link) {
			const openingIndex = pieces.length;
			pieces.push("[");
			pending.push({
				closingLink: `](<${node.url?.replace(/&/g, "&amp;")}>)`,
				openingIndex,
			});
		}
		if (node.children)
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push({ node: node.children[index], inLink: inLink || link });
	}
	const text = pieces.join("").trim();
	if (text && inherited?.url) {
		inherited.linked = true;
		return `[${text}](<${inherited.url.replace(/&/g, "&amp;")}>)`;
	}
	return text;
}

interface Prefix {
	marker: string;
	item?: boolean;
	used?: boolean;
}

function validateTableStructure(
	root: ExtractedNode,
): ReadonlySet<ExtractedNode> {
	const transparentWrappers = new Set<ExtractedNode>();
	type Frame = {
		node: ExtractedNode;
		nextChild: number;
		inTrueSink: boolean;
		containsStructure: boolean;
	};
	const pending: Frame[] = [
		{
			node: root,
			nextChild: 0,
			inTrueSink: false,
			containsStructure: tableBoundaryMarkers[root.type] !== undefined,
		},
	];
	while (pending.length) {
		const current = pending[pending.length - 1];
		if (!current) break;
		const { node } = current;
		if (
			current.nextChild === 0 &&
			current.inTrueSink &&
			tableBoundaryMarkers[node.type]
		)
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported table extraction structure",
			);
		const children = node.children ?? [];
		if (current.nextChild < children.length) {
			const child = children[current.nextChild++];
			pending.push({
				node: child,
				nextChild: 0,
				inTrueSink:
					current.inTrueSink ||
					node.type === "heading" ||
					node.type === "paragraph" ||
					node.type === "pre" ||
					(node.type !== "inline" && inlineTypes.has(node.type)),
				containsStructure: tableBoundaryMarkers[child.type] !== undefined,
			});
			continue;
		}
		if (node.type === "inline" && current.containsStructure)
			transparentWrappers.add(node);
		pending.pop();
		const parent = pending[pending.length - 1];
		if (parent && current.containsStructure) parent.containsStructure = true;
	}
	return transparentWrappers;
}

function rowListCell(node: ExtractedNode): string | null {
	let children = node.children ?? [];
	const meaningful = children.filter(
		(child) => child.type !== "text" || (child.text ?? "").trim(),
	);
	if (meaningful.length === 1 && meaningful[0].type === "paragraph")
		children = meaningful[0].children ?? [];
	const pending = children.slice();
	while (pending.length) {
		const child = pending.pop();
		if (!child) break;
		if (!inlineTypes.has(child.type)) return null;
		for (const descendant of child.children ?? []) pending.push(descendant);
	}
	const text = inline(children);
	return text.includes("\n") || text.includes("\r") ? null : text;
}

function rowListCells(row: ExtractedNode): string[] | null {
	const cells: string[] = [];
	const pending = (row.children ?? []).slice().reverse();
	while (pending.length) {
		const node = pending.pop();
		if (!node) break;
		if (node.type === "cell") {
			const text = rowListCell(node);
			if (text === null) return null;
			cells.push(text);
		} else if (node.type === "container" || node.type === "inline") {
			const children = node.children ?? [];
			for (let index = children.length - 1; index >= 0; index--)
				pending.push(children[index]);
		} else if (node.type !== "text" || (node.text ?? "").trim()) return null;
	}
	return cells;
}

function tableRowList(table: ExtractedNode): string[][] | null {
	const rows: string[][] = [];
	const pending = (table.children ?? []).slice().reverse();
	while (pending.length) {
		const node = pending.pop();
		if (!node) break;
		if (node.type === "row") {
			const cells = rowListCells(node);
			if (cells === null) return null;
			rows.push(cells);
		} else if (node.type === "container" || node.type === "inline") {
			const children = node.children ?? [];
			for (let index = children.length - 1; index >= 0; index--)
				pending.push(children[index]);
		} else if (node.type !== "text" || (node.text ?? "").trim()) return null;
	}
	return rows;
}

function markdown(
	root: ExtractedNode,
	maxBytes: number,
	compactTables: boolean,
	tableRows: boolean,
) {
	const transparentWrappers = validateTableStructure(root);
	const flow = flowLinkStructure(root);
	const output: string[] = [];
	let bytes = 0;
	let tableDepth = 0;
	type Task =
		| {
				node: ExtractedNode;
				prefixes: Prefix[];
				ordinal?: number;
				link?: MarkdownLinkContext;
		  }
		| {
				nodes: ExtractedNode[];
				prefixes: Prefix[];
				link?: MarkdownLinkContext;
		  }
		| { closingMarker: string; prefixes: Prefix[]; closesTable: boolean }
		| { closingFlowLink: MarkdownLinkContext; prefixes: Prefix[] }
		| { emptyItem: Prefix; prefixes: Prefix[] };
	const pending: Task[] = [{ node: root, prefixes: [] }];
	const emit = (text: string, prefixes: Prefix[]) => {
		if (!text) return;
		const lines = text.split("\n");
		for (let index = 0; index < lines.length; index++) {
			const prefix = prefixes
				.map((part) =>
					part.item && (part.used || index > 0)
						? " ".repeat(part.marker.length)
						: part.marker,
				)
				.join("");
			const line = `${prefix}${lines[index]}\n`;
			bytes += utf8ByteLength(line);
			if (bytes > maxBytes)
				throw resourceLimitError(
					"extraction.output",
					maxBytes,
					bytes,
					"Markdown extraction output limit exceeded",
				);
			output.push(line);
		}
		for (const part of prefixes) if (part.item) part.used = true;
		bytes++;
		if (bytes > maxBytes)
			throw resourceLimitError(
				"extraction.output",
				maxBytes,
				bytes,
				"Markdown extraction output limit exceeded",
			);
		output.push("\n");
	};
	const schedule = (
		children: ExtractedNode[],
		prefixes: Prefix[],
		link?: MarkdownLinkContext,
	) => {
		const tasks: Task[] = [];
		let group: ExtractedNode[] = [];
		for (const node of children) {
			if (
				inlineTypes.has(node.type) &&
				!transparentWrappers.has(node) &&
				!flow.wrappers.has(node) &&
				!(link && flow.blockNodes.has(node))
			)
				group.push(node);
			else {
				if (group.length) tasks.push({ nodes: group, prefixes, link });
				group = [];
				tasks.push({ node, prefixes, link });
			}
		}
		if (group.length) tasks.push({ nodes: group, prefixes, link });
		for (let index = tasks.length - 1; index >= 0; index--)
			pending.push(tasks[index]);
	};
	while (pending.length) {
		const task = pending.pop();
		if (!task) break;
		if ("closingFlowLink" in task) {
			const link = task.closingFlowLink;
			if (link.url && !link.linked && link.preformatted)
				emit(`<${link.url.replace(/&/g, "&amp;")}>`, task.prefixes);
			continue;
		}
		if ("closingMarker" in task) {
			emit(task.closingMarker, task.prefixes);
			if (task.closesTable) tableDepth--;
			continue;
		}
		if ("emptyItem" in task) {
			if (!task.emptyItem.used) emit(" ", task.prefixes);
			continue;
		}
		if ("nodes" in task) {
			emit(inline(task.nodes, task.link), task.prefixes);
			continue;
		}
		const { node, prefixes, link } = task;
		const children = node.children ?? [];
		if (flow.links.has(node)) {
			const nested = link?.url
				? link
				: { url: node.url, linked: false, preformatted: false };
			if (nested !== link) pending.push({ closingFlowLink: nested, prefixes });
			schedule(children, prefixes, nested);
			continue;
		}
		const boundary = tableBoundaryMarkers[node.type];
		if (boundary) {
			if (tableRows && node.type === "table") {
				const rows = tableRowList(node);
				if (rows !== null) {
					const lines = [boundary.begin];
					for (const [rowIndex, cells] of rows.entries()) {
						lines.push(`- Row ${rowIndex + 1}`);
						for (const [cellIndex, text] of cells.entries())
							lines.push(`  - Cell ${cellIndex + 1}:${text ? ` ${text}` : ""}`);
					}
					lines.push(boundary.end);
					emit(lines.join("\n"), prefixes);
					continue;
				}
			}
			const enclosed =
				compactTables &&
				tableDepth > 0 &&
				(node.type === "row" || node.type === "cell");
			emit(
				enclosed ? `**Native ${node.type} begin**` : boundary.begin,
				prefixes,
			);
			const closesTable = node.type === "table";
			if (closesTable) tableDepth++;
			pending.push({ closingMarker: boundary.end, prefixes, closesTable });
			schedule(children, prefixes, link);
		} else if (node.type === "heading")
			emit(
				`${"#".repeat(node.level ?? 1)} ${inline(children, link)}`,
				prefixes,
			);
		else if (node.type === "paragraph") emit(inline(children, link), prefixes);
		else if (node.type === "pre") {
			const text = plain(children);
			if (link && text.trim()) link.preformatted = true;
			const marker = fence(text, 3);
			emit(
				`${marker}\n${text}${text.endsWith("\n") ? "" : "\n"}${marker}`,
				prefixes,
			);
		} else if (node.type === "separator") emit("---", prefixes);
		else if (node.type === "blockquote")
			schedule(children, [...prefixes, { marker: "> " }], link);
		else if (node.type === "list") {
			let ordinal = node.start ?? 1;
			const tasks: Task[] = children.map((child) => ({
				node: child,
				prefixes,
				link,
				...(node.ordered && child.type === "list-item"
					? { ordinal: ordinal++ }
					: {}),
			}));
			for (let index = tasks.length - 1; index >= 0; index--)
				pending.push(tasks[index]);
		} else if (node.type === "list-item") {
			const marker =
				task.ordinal === undefined
					? "- "
					: task.ordinal >= 0 && task.ordinal <= 999_999_999
						? `${task.ordinal}. `
						: `- ${task.ordinal}. `;
			const item = { marker, item: true };
			const nested = [...prefixes, item];
			pending.push({ emptyItem: item, prefixes: nested });
			schedule(children, nested, link);
		} else if (
			transparentWrappers.has(node) ||
			flow.wrappers.has(node) ||
			(link && flow.blockNodes.has(node))
		)
			schedule(children, prefixes, link);
		else if (inlineTypes.has(node.type)) emit(inline([node], link), prefixes);
		else schedule(children, prefixes, link);
	}
	return output.length ? output.join("").slice(0, -1) : "";
}

function extractionAdmission(tree: DocumentTree) {
	const styles = documentStyles(tree);
	const scripting = htmlParseInfo(tree)?.scripting ?? false;
	const skip = (node: Readonly<DocumentNode>) =>
		omitted.has(node.tagName) ||
		node.kind === "comment" ||
		Object.hasOwn(node.attributes, "hidden") ||
		Object.hasOwn(node.attributes, "inert") ||
		node.attributes["aria-hidden"]?.toLowerCase() === "true" ||
		(node.tagName === "noscript" && scripting) ||
		!styles.get(node.id).displayed;
	return {
		styles,
		skip,
		visible: (id: number) => styles.get(id).visible,
		descend: (node: Readonly<DocumentNode>) =>
			node.kind !== "element" ||
			!leafElements.has(node.tagName) ||
			!styles.get(node.id).visible,
	};
}

export function discoverDocumentLinks(
	tree: DocumentTree,
	query: string,
	options: LinkDiscoveryOptions = {},
): DocumentLinkDiscovery {
	if (
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
			"Invalid link discovery options",
		);
	const maxBytes = options.maxBytes ?? 262_144;
	const maxNodes = options.maxNodes ?? 50_000;
	const maxDepth = options.maxDepth ?? 128;
	const maxEntries = options.maxEntries ?? 32;
	const maxLabelCodeUnits = options.maxLabelCodeUnits ?? 256;
	const maxUrlCodeUnits = options.maxUrlCodeUnits ?? 4096;
	for (const [name, value, minimum, maximum] of [
		["maxBytes", maxBytes, 256, 1_048_576],
		["maxNodes", maxNodes, 1, 50_000],
		["maxDepth", maxDepth, 0, 1024],
		["maxEntries", maxEntries, 1, 256],
		["maxLabelCodeUnits", maxLabelCodeUnits, 1, 1024],
		["maxUrlCodeUnits", maxUrlCodeUnits, 1, 4096],
	] as const) {
		if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
			throw new AgentBrowserError(
				"invalid-input",
				`Invalid link limit: ${name}`,
			);
	}
	options.checkpoint?.();
	const { skip, visible, descend } = extractionAdmission(tree);
	const targets = collectLinkTargets(tree, query, {
		maxNodes,
		maxDepth,
		maxEntries,
		maxLabelCodeUnits,
		maxUrlCodeUnits,
		baseUrl: documentBaseUrl(tree),
		skip,
		visible,
		descend,
		checkpoint: options.checkpoint,
	});
	const source =
		textDocumentInfo(tree)?.mime === "text/markdown"
			? eligibleTextLineSource(tree)
			: undefined;
	const sourceMarkdown = source
		? discoverMarkdownSourceLinks(source.data, tree.url, query, {
				maxEntries,
				maxLabelCodeUnits,
				maxUrlCodeUnits,
				checkpoint: options.checkpoint,
			})
		: undefined;
	const result: DocumentLinkDiscovery = {
		method: "link-discovery",
		document: tree.reference(tree.root),
		revision: tree.revision,
		partial: true,
		query,
		...targets,
		...(sourceMarkdown &&
		(sourceMarkdown.entries.length || sourceMarkdown.truncated)
			? {
					sourceMarkdown,
					truncated: targets.truncated || sourceMarkdown.truncated,
				}
			: {}),
	};
	if (utf8ByteLength(JSON.stringify(result)) > maxBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"Link discovery byte limit exceeded",
		);
	options.checkpoint?.();
	return result;
}

export function discoverDocumentHeadings(
	tree: DocumentTree,
	options: HeadingDiscoveryOptions = {},
): DocumentHeadingOutline {
	const maxBytes = options.maxBytes ?? 262_144;
	const maxNodes = options.maxNodes ?? 50_000;
	const maxDepth = options.maxDepth ?? 128;
	const maxEntries = options.maxEntries ?? 256;
	const maxTitleCodeUnits = options.maxTitleCodeUnits ?? 256;
	const maxSelectorCodeUnits = options.maxSelectorCodeUnits ?? 4096;
	for (const [name, value, minimum, maximum] of [
		["maxBytes", maxBytes, 256, 1_048_576],
		["maxNodes", maxNodes, 1, 50_000],
		["maxDepth", maxDepth, 0, 1024],
		["maxEntries", maxEntries, 1, 256],
		["maxTitleCodeUnits", maxTitleCodeUnits, 1, 1024],
		["maxSelectorCodeUnits", maxSelectorCodeUnits, 1, 4096],
	] as const) {
		if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
			throw new AgentBrowserError(
				"invalid-input",
				`Invalid heading limit: ${name}`,
			);
	}
	const { skip, visible, descend } = extractionAdmission(tree);
	const targets = collectHeadingTargets(tree, {
		maxNodes,
		maxDepth,
		maxEntries,
		maxTitleCodeUnits,
		maxSelectorCodeUnits,
		skip,
		visible,
		descend,
	});
	const outline: DocumentHeadingOutline = {
		method: "heading-outline",
		document: tree.reference(tree.root),
		revision: tree.revision,
		partial: true,
		...targets,
		entries: targets.entries.map((entry) => ({
			...entry,
			title: clean(entry.title).replace(/\s+/g, " ").trim(),
		})),
	};
	if (utf8ByteLength(JSON.stringify(outline)) > maxBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"Heading outline byte limit exceeded",
		);
	return outline;
}

export function discoverDocumentTextLines(
	tree: DocumentTree,
	query: string,
	options: DocumentTextLineDiscoveryOptions = {},
): DocumentTextLineDiscovery {
	let maxBytes: number;
	let maxEntries: number | undefined;
	try {
		if (
			options === null ||
			typeof options !== "object" ||
			Array.isArray(options)
		)
			throw new Error();
		const byteLimit = options.maxBytes;
		maxBytes = byteLimit === undefined ? 262_144 : byteLimit;
		maxEntries = options.maxEntries;
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid text discovery options",
		);
	}
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 256 || maxBytes > 1_048_576)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid text discovery byte limit",
		);
	const { text } = textLineSource(tree);
	const result: DocumentTextLineDiscovery = {
		method: "text-line-discovery",
		document: tree.reference(tree.root),
		revision: tree.revision,
		partial: true,
		...discoverTextLines(text, query, { maxEntries }),
	};
	if (utf8ByteLength(JSON.stringify(result)) > maxBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"Text discovery byte limit exceeded",
		);
	return result;
}

export function extractDocument(
	tree: DocumentTree,
	options: ExtractionOptions = {},
): DocumentExtraction {
	if (
		options.contentFocus !== undefined &&
		(options.contentFocus !== "main-content-v1" ||
			options.root !== undefined ||
			options.section !== undefined ||
			options.lines !== undefined)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Content focus requires main-content-v1 without root, section or lines",
		);
	if (options.lines !== undefined && options.root !== undefined)
		throw new AgentBrowserError(
			"invalid-input",
			"Text line extraction cannot be combined with root",
		);
	if (
		options.section !== undefined &&
		(options.lines !== undefined || options.root !== undefined)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Section extraction cannot be combined with root or lines",
		);
	const format = options.format ?? "markdown";
	if (format !== "markdown" && format !== "json")
		throw new AgentBrowserError(
			"unsupported",
			"Extraction format must be markdown or json",
		);
	if (
		options.outputLimitPolicy !== undefined &&
		(options.outputLimitPolicy !== "text-prefix-v1" || format !== "markdown")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Text-prefix output policy requires Markdown extraction",
		);
	if (
		(options.tableMetadata !== undefined &&
			typeof options.tableMetadata !== "boolean") ||
		(options.tableMetadata === true && format !== "json")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Table metadata requires a boolean option and JSON extraction",
		);
	if (
		(options.compactTables !== undefined &&
			typeof options.compactTables !== "boolean") ||
		(options.compactTables === true && format !== "markdown")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Compact tables require a boolean option and Markdown extraction",
		);
	if (
		(options.tableRows !== undefined &&
			typeof options.tableRows !== "boolean") ||
		(options.tableRows === true && format !== "markdown")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Table rows require a boolean option and Markdown extraction",
		);
	const maxBytes = options.maxBytes ?? 262_144;
	const maxNodes = options.maxNodes ?? 10_000;
	const maxDepth = options.maxDepth ?? 256;
	for (const [name, value, minimum, maximum] of [
		["maxBytes", maxBytes, 256, 1_048_576],
		["maxNodes", maxNodes, 1, 50_000],
		["maxDepth", maxDepth, 0, 1024],
	] as const) {
		if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
			throw new AgentBrowserError(
				"invalid-input",
				`Invalid extraction limit: ${name}`,
			);
	}
	const selection =
		options.lines === undefined
			? undefined
			: selectTextLines(tree, options.lines);
	const requestedRoot =
		options.root === undefined ? tree.root : tree.resolve(options.root).id;
	const { styles, skip, visible, descend } = extractionAdmission(tree);
	const focus =
		options.contentFocus === undefined
			? undefined
			: selectContentFocus(tree, {
					maxNodes,
					maxDepth,
					skip,
					visible,
					descend,
				});
	const start = focus?.root ?? requestedRoot;
	const section =
		options.section === undefined
			? undefined
			: selectHeadingSection(tree, options.section, {
					maxNodes,
					maxDepth,
					skip,
					visible,
					descend,
				});
	const title = clean(documentTitle(tree));
	const safeUrl = new URL(tree.url);
	safeUrl.username = "";
	safeUrl.password = "";
	const reader = researchReaderInfo(tree);
	const descriptions = documentDescriptions(tree);
	const alternates = documentAlternates(tree);
	const textInfo = textDocumentInfo(tree);
	const markdownSource =
		textInfo?.mime === "text/markdown"
			? eligibleTextLineSource(tree)
			: undefined;
	const sourceMarkdown =
		markdownSource &&
		markdownSource.data.length <= markdownSourceOutlineLimits.maxSourceCodeUnits
			? outlineMarkdownSource(markdownSource.data)
			: undefined;
	const metadata: ExtractionMetadata = {
		document: tree.reference(tree.root),
		scope: tree.reference(start),
		url: safeUrl.href,
		title,
		revision: tree.revision,
		partial: true,
		...(options.compactTables === true ? { compactTables: true as const } : {}),
		...(focus ? { contentSelection: focus.metadata } : {}),
		...(options.tableRows === true ? { tableRows: true as const } : {}),
		...(reader ? { reader } : {}),
		...(descriptions ? { sourceDescriptions: descriptions } : {}),
		...(alternates ? { sourceAlternates: alternates } : {}),
		...(sourceMarkdown?.entries.length ? { sourceMarkdown } : {}),
		...(selection ? { textSelection: selection.metadata } : {}),
		...(section ? { sectionSelection: section.metadata } : {}),
	};
	if (utf8ByteLength(JSON.stringify(metadata)) > maxBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"Extraction metadata limit exceeded",
		);
	const holder: ExtractedNode = {
		ref: metadata.scope,
		type: "container",
		children: [],
	};
	let hidden = false;
	for (
		let ancestor: Readonly<DocumentNode> | undefined = tree.get(start);
		ancestor;
		ancestor = ancestor.parent === null ? undefined : tree.get(ancestor.parent)
	)
		if (skip(ancestor)) {
			hidden = true;
			break;
		}
	const pending: {
		id: number;
		parent: ExtractedNode;
		depth: number;
		lineState?: { atLineStart: boolean };
		sourceCode?: GithubSourceBlock;
		omitContent?: boolean;
	}[] = hidden ? [] : [{ id: start, parent: holder, depth: 0 }];
	const base = documentBaseUrl(tree);
	let nodes = 0;
	let intermediateBytes = 0;
	let gutterAnchors = 0;
	let sourceBlocks = 0;
	let sourceLines = 0;
	let sourceGutters = 0;
	while (pending.length) {
		const current = pending.pop();
		if (!current) break;
		if (section && !section.included.has(current.id)) continue;
		const source = tree.get(current.id);
		if (skip(source)) continue;
		const visible = styles.get(source.id).visible;
		if (!visible && source.kind === "text") continue;
		if (++nodes > maxNodes || current.depth > maxDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Extraction structure limit exceeded",
			);
		if (
			current.omitContent ||
			current.sourceCode?.gutter === source.id ||
			(current.sourceCode && source.kind === "text")
		) {
			for (let index = source.children.length - 1; index >= 0; index--)
				pending.push({
					id: source.children[index],
					parent: current.parent,
					depth: current.depth + 1,
					omitContent: true,
				});
			continue;
		}
		const sourceBlock =
			visible && !section && !selection && !current.sourceCode
				? githubSourceBlock(
						tree,
						source,
						(node) => !skip(node) && styles.get(node.id).visible,
						{ maxNodes: maxNodes - nodes, maxDepth: maxDepth - current.depth },
					)
				: undefined;
		const sourceCode = current.sourceCode ?? sourceBlock;
		const sourceLine = sourceCode?.lines.get(source.id);
		if (sourceBlock) {
			sourceBlocks++;
			sourceLines += sourceBlock.lines.size;
			if (sourceBlock.gutter !== null) sourceGutters += sourceBlock.lines.size;
		}
		if (sourceCode && !sourceBlock && sourceLine === undefined) {
			for (let index = source.children.length - 1; index >= 0; index--)
				pending.push({
					id: source.children[index],
					parent: current.parent,
					depth: current.depth + 1,
					sourceCode,
				});
			continue;
		}
		const lineState =
			current.lineState ??
			(isHtmlElement(source, "code") ? { atLineStart: true } : undefined);
		if (
			visible &&
			current.id !== start &&
			lineState !== undefined &&
			rustdocLineNumberAnchor(tree, source, lineState.atLineStart)
		) {
			if (++nodes > maxNodes || current.depth + 1 > maxDepth)
				throw new AgentBrowserError(
					"resource-limit",
					"Extraction structure limit exceeded",
				);
			gutterAnchors++;
			continue;
		}
		if (lineState && source.kind === "text" && source.data.length)
			lineState.atLineStart = source.data.endsWith("\n");
		else if (lineState && leafElements.has(source.tagName))
			lineState.atLineStart = false;
		const fallback =
			source.kind === "element" &&
			styles.get(source.id).display.startsWith("inline")
				? "inline"
				: "container";
		const node: ExtractedNode = {
			ref: tree.reference(source.id),
			type: sourceBlock
				? "pre"
				: sourceLine !== undefined
					? "text"
					: section?.context.has(source.id)
						? "container"
						: source.kind === "text"
							? "text"
							: visible && Object.hasOwn(kinds, source.tagName)
								? kinds[source.tagName]
								: fallback,
		};
		if (node.type === "text")
			node.text = clean(
				sourceLine ??
					(selection?.textNode === source.id ? selection.text : source.data),
			);
		else if (node.type === "image")
			node.text = clean(source.attributes.alt ?? "");
		else if (node.type !== "break" && node.type !== "separator")
			node.children = [];
		if (node.type === "heading") node.level = Number(source.tagName.slice(1));
		if (
			format === "json" &&
			visible &&
			source.kind === "element" &&
			isHtmlElement(source) &&
			!section?.context.has(source.id)
		) {
			const dateTimeSource = extractDateTimeSource(
				source.tagName,
				source.attributes,
			);
			if (dateTimeSource) node.dateTimeSource = dateTimeSource;
		}
		if (
			options.tableMetadata &&
			visible &&
			source.kind === "element" &&
			!section?.context.has(source.id)
		) {
			const tableSource = extractTableSource(source.tagName, source.attributes);
			if (tableSource) node.tableSource = tableSource;
			const ariaTableSource = extractAriaTableSource(
				source.tagName,
				source.attributes,
			);
			if (ariaTableSource) node.ariaTableSource = ariaTableSource;
		}
		if (node.type === "list") {
			node.ordered = source.tagName === "ol";
			const ordinal = Number(source.attributes.start ?? 1);
			if (node.ordered)
				node.start = Number.isSafeInteger(ordinal) ? ordinal : 1;
		}
		if (node.type === "link" && source.attributes.href !== undefined) {
			const url = destination(source.attributes.href, base);
			if (url) node.url = url;
			else node.blocked = true;
		}
		intermediateBytes += utf8ByteLength(JSON.stringify(node)) + 1;
		if (intermediateBytes > 4_194_304)
			throw new AgentBrowserError(
				"resource-limit",
				"Extraction intermediate limit exceeded",
			);
		current.parent.children?.push(node);
		if (node.children || sourceLine !== undefined) {
			const children = section
				? (section.children.get(source.id) ?? [])
				: source.children;
			for (let index = children.length - 1; index >= 0; index--) {
				pending.push({
					id: children[index],
					parent: node,
					depth: current.depth + 1,
					...(lineState === undefined ? {} : { lineState }),
					...(sourceCode === undefined ? {} : { sourceCode }),
					...(sourceLine === undefined ? {} : { omitContent: true }),
				});
			}
		}
	}
	if (gutterAnchors)
		metadata.sourceCodeGutters = Object.freeze({
			kind: "rustdoc-line-number-anchors-v1",
			anchors: gutterAnchors,
		});
	if (sourceBlocks)
		metadata.sourceCodeBlocks = Object.freeze({
			kind: "github-ssr-lines-v1",
			blocks: sourceBlocks,
			lines: sourceLines,
			gutterLabels: sourceGutters,
			lineEndings: "inferred-lf",
			terminalNewline: "unknown",
		});
	const root = holder.children?.[0] ?? {
		ref: metadata.scope,
		type: "container" as const,
		children: [],
	};
	let result: DocumentExtraction;
	let outputBytes: number;
	try {
		result =
			format === "json"
				? { ...metadata, format, content: root }
				: {
						...metadata,
						format,
						content: markdown(
							root,
							maxBytes,
							options.compactTables === true,
							options.tableRows === true,
						),
					};
		outputBytes = utf8ByteLength(JSON.stringify(result));
		if (outputBytes > maxBytes)
			throw resourceLimitError(
				"extraction.output",
				maxBytes,
				outputBytes,
				"Extraction output limit exceeded",
			);
	} catch (error) {
		const trigger = resourceLimitDiagnostic(error);
		if (
			options.outputLimitPolicy !== "text-prefix-v1" ||
			format !== "markdown" ||
			trigger?.kind !== "extraction.output" ||
			trigger.limit !== maxBytes
		)
			throw error;
		const prefix = boundedExtractionTextPrefix(
			root,
			metadata,
			maxBytes,
			trigger,
		);
		if (!prefix) throw error;
		result = { ...metadata, format, ...prefix };
		outputBytes = utf8ByteLength(JSON.stringify(result));
	}
	if (outputBytes > maxBytes)
		throw resourceLimitError(
			"extraction.output",
			maxBytes,
			outputBytes,
			"Extraction output limit exceeded",
		);
	const sourceData = researchSourceDataTables(tree);
	if (sourceData) {
		const remaining =
			maxBytes - outputBytes - utf8ByteLength(',"sourceDataTables":');
		if (remaining >= 0) {
			const sourceDataTables = fitResearchSourceDataTables(
				sourceData,
				remaining,
			);
			if (sourceDataTables) {
				result = { ...result, sourceDataTables };
				outputBytes = utf8ByteLength(JSON.stringify(result));
			}
		}
	}
	const access = researchSourceAccess(tree);
	if (access) {
		const remaining =
			maxBytes - outputBytes - utf8ByteLength(',"sourceAccess":');
		if (remaining >= 0) {
			const sourceAccess = fitResearchSourceAccess(access, remaining);
			if (sourceAccess) {
				result = { ...result, sourceAccess };
				outputBytes = utf8ByteLength(JSON.stringify(result));
			}
		}
	}
	const products = researchSourceProducts(tree);
	const videos = researchSourceVideos(tree);
	const feeds = documentFeeds(tree);
	if (feeds) {
		const remaining =
			maxBytes - outputBytes - utf8ByteLength(',"sourceFeeds":');
		if (remaining >= 0) {
			const sourceFeeds = fitDocumentFeeds(feeds, remaining);
			if (sourceFeeds) {
				if (!products && !videos) return { ...result, sourceFeeds };
				result = { ...result, sourceFeeds };
				outputBytes = utf8ByteLength(JSON.stringify(result));
			}
		}
	}
	if (products) {
		const remaining =
			maxBytes - outputBytes - utf8ByteLength(',"sourceProducts":');
		if (remaining >= 0) {
			const sourceProducts = fitResearchSourceProducts(products, remaining);
			if (sourceProducts) {
				if (!videos) return { ...result, sourceProducts };
				result = { ...result, sourceProducts };
				outputBytes = utf8ByteLength(JSON.stringify(result));
			}
		}
	}
	if (videos) {
		const remaining =
			maxBytes - outputBytes - utf8ByteLength(',"sourceVideos":');
		if (remaining >= 0) {
			const sourceVideos = fitResearchSourceVideos(videos, remaining);
			if (sourceVideos) return { ...result, sourceVideos };
		}
	}
	return result;
}
