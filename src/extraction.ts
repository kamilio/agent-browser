import { documentBaseUrl } from "./document-url.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { htmlParseInfo } from "./html-info.js";
import { documentStyles } from "./styles.js";

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
	children?: ExtractedNode[];
}

export interface ExtractionOptions {
	format?: "markdown" | "json";
	root?: string;
	maxBytes?: number;
	maxNodes?: number;
	maxDepth?: number;
}

interface ExtractionMetadata {
	document: string;
	scope: string;
	url: string;
	title: string;
	revision: number;
	partial: true;
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
const encoder = new TextEncoder();

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

function inline(nodes: readonly ExtractedNode[]) {
	const pieces: string[] = [];
	const pending: (
		| { node: ExtractedNode; inLink: boolean }
		| { text: string }
	)[] = nodes
		.slice()
		.reverse()
		.map((node) => ({ node, inLink: false }));
	while (pending.length) {
		const current = pending.pop();
		if (!current) break;
		if ("text" in current) {
			pieces.push(current.text);
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
			pieces.push("[");
			pending.push({ text: `](<${node.url?.replace(/&/g, "&amp;")}>)` });
		}
		if (node.children)
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push({ node: node.children[index], inLink: inLink || link });
	}
	return pieces.join("").trim();
}

interface Prefix {
	marker: string;
	item?: boolean;
	used?: boolean;
}

function markdown(root: ExtractedNode, maxBytes: number) {
	const output: string[] = [];
	let bytes = 0;
	type Task =
		| { node: ExtractedNode; prefixes: Prefix[]; ordinal?: number }
		| { nodes: ExtractedNode[]; prefixes: Prefix[] }
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
			bytes += encoder.encode(line).byteLength;
			if (bytes > maxBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"Markdown extraction output limit exceeded",
				);
			output.push(line);
		}
		for (const part of prefixes) if (part.item) part.used = true;
		bytes++;
		if (bytes > maxBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Markdown extraction output limit exceeded",
			);
		output.push("\n");
	};
	const schedule = (children: ExtractedNode[], prefixes: Prefix[]) => {
		const tasks: Task[] = [];
		let group: ExtractedNode[] = [];
		for (const node of children) {
			if (inlineTypes.has(node.type)) group.push(node);
			else {
				if (group.length) tasks.push({ nodes: group, prefixes });
				group = [];
				tasks.push({ node, prefixes });
			}
		}
		if (group.length) tasks.push({ nodes: group, prefixes });
		for (let index = tasks.length - 1; index >= 0; index--)
			pending.push(tasks[index]);
	};
	while (pending.length) {
		const task = pending.pop();
		if (!task) break;
		if ("emptyItem" in task) {
			if (!task.emptyItem.used) emit(" ", task.prefixes);
			continue;
		}
		if ("nodes" in task) {
			emit(inline(task.nodes), task.prefixes);
			continue;
		}
		const { node, prefixes } = task;
		const children = node.children ?? [];
		if (node.type === "heading")
			emit(`${"#".repeat(node.level ?? 1)} ${inline(children)}`, prefixes);
		else if (node.type === "paragraph") emit(inline(children), prefixes);
		else if (node.type === "pre") {
			const text = plain(children);
			const marker = fence(text, 3);
			emit(
				`${marker}\n${text}${text.endsWith("\n") ? "" : "\n"}${marker}`,
				prefixes,
			);
		} else if (node.type === "separator") emit("---", prefixes);
		else if (node.type === "blockquote")
			schedule(children, [...prefixes, { marker: "> " }]);
		else if (node.type === "list") {
			let ordinal = node.start ?? 1;
			const tasks: Task[] = children.map((child) => ({
				node: child,
				prefixes,
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
			schedule(children, nested);
		} else if (inlineTypes.has(node.type)) emit(inline([node]), prefixes);
		else schedule(children, prefixes);
	}
	return output.length ? output.join("").slice(0, -1) : "";
}

export function extractDocument(
	tree: DocumentTree,
	options: ExtractionOptions = {},
): DocumentExtraction {
	const format = options.format ?? "markdown";
	if (format !== "markdown" && format !== "json")
		throw new AgentBrowserError(
			"unsupported",
			"Extraction format must be markdown or json",
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
	const start =
		options.root === undefined ? tree.root : tree.resolve(options.root).id;
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
	let title = "";
	for (const { node } of tree.walk())
		if (node.tagName === "title") {
			title = clean(tree.textContent(node.id)).replace(/\s+/gu, " ").trim();
			break;
		}
	const safeUrl = new URL(tree.url);
	safeUrl.username = "";
	safeUrl.password = "";
	const metadata: ExtractionMetadata = {
		document: tree.reference(tree.root),
		scope: tree.reference(start),
		url: safeUrl.href,
		title,
		revision: tree.revision,
		partial: true,
	};
	if (encoder.encode(JSON.stringify(metadata)).byteLength > maxBytes)
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
	const pending = hidden ? [] : [{ id: start, parent: holder, depth: 0 }];
	const base = documentBaseUrl(tree);
	let nodes = 0;
	let intermediateBytes = 0;
	while (pending.length) {
		const current = pending.pop();
		if (!current) break;
		const source = tree.get(current.id);
		if (skip(source)) continue;
		const visible = styles.get(source.id).visible;
		if (!visible && source.kind === "text") continue;
		if (++nodes > maxNodes || current.depth > maxDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Extraction structure limit exceeded",
			);
		const fallback =
			source.kind === "element" &&
			styles.get(source.id).display.startsWith("inline")
				? "inline"
				: "container";
		const node: ExtractedNode = {
			ref: tree.reference(source.id),
			type:
				source.kind === "text"
					? "text"
					: visible && Object.hasOwn(kinds, source.tagName)
						? kinds[source.tagName]
						: fallback,
		};
		if (node.type === "text") node.text = clean(source.data);
		else if (node.type === "image")
			node.text = clean(source.attributes.alt ?? "");
		else if (node.type !== "break" && node.type !== "separator")
			node.children = [];
		if (node.type === "heading") node.level = Number(source.tagName.slice(1));
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
		intermediateBytes += encoder.encode(JSON.stringify(node)).byteLength + 1;
		if (intermediateBytes > 4_194_304)
			throw new AgentBrowserError(
				"resource-limit",
				"Extraction intermediate limit exceeded",
			);
		current.parent.children?.push(node);
		if (node.children)
			for (let index = source.children.length - 1; index >= 0; index--)
				pending.push({
					id: source.children[index],
					parent: node,
					depth: current.depth + 1,
				});
	}
	const root = holder.children?.[0] ?? {
		ref: metadata.scope,
		type: "container" as const,
		children: [],
	};
	const result: DocumentExtraction =
		format === "json"
			? { ...metadata, format, content: root }
			: { ...metadata, format, content: markdown(root, maxBytes) };
	if (encoder.encode(JSON.stringify(result)).byteLength > maxBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"Extraction output limit exceeded",
		);
	return result;
}
