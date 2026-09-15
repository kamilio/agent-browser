import type { DocumentTree } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

export interface HtmlParserNode {
	tree: DocumentTree;
	id: number;
	tag: string;
}

const special = new Set([
	"address",
	"applet",
	"area",
	"article",
	"aside",
	"base",
	"basefont",
	"bgsound",
	"blockquote",
	"body",
	"br",
	"button",
	"caption",
	"center",
	"col",
	"colgroup",
	"dd",
	"details",
	"dir",
	"div",
	"dl",
	"dt",
	"embed",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"form",
	"frame",
	"frameset",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"head",
	"header",
	"hgroup",
	"hr",
	"html",
	"iframe",
	"img",
	"input",
	"keygen",
	"li",
	"link",
	"listing",
	"main",
	"marquee",
	"menu",
	"meta",
	"nav",
	"noembed",
	"noframes",
	"noscript",
	"object",
	"ol",
	"p",
	"param",
	"plaintext",
	"pre",
	"script",
	"search",
	"section",
	"select",
	"source",
	"style",
	"summary",
	"table",
	"tbody",
	"td",
	"template",
	"textarea",
	"tfoot",
	"th",
	"thead",
	"title",
	"tr",
	"track",
	"ul",
	"wbr",
	"xmp",
]);
const scopeBoundaries = new Set([
	"applet",
	"caption",
	"html",
	"table",
	"td",
	"th",
	"marquee",
	"object",
	"select",
	"template",
]);
const svgBoundaries = new Set(["foreignObject", "desc", "title"]);
const mathmlBoundaries = new Set([
	"mi",
	"mo",
	"mn",
	"ms",
	"mtext",
	"annotation-xml",
]);

export function isHtmlParserNode(node: HtmlParserNode, tag?: string): boolean {
	return (
		elementNamespace(node.tree.elementInfo(node.id)) === htmlNamespace &&
		(tag === undefined || node.tag === tag)
	);
}

function hasCategory(
	node: string | HtmlParserNode,
	htmlTags: ReadonlySet<string>,
): boolean {
	if (typeof node === "string") return htmlTags.has(node);
	const namespaceURI = elementNamespace(node.tree.elementInfo(node.id));
	if (namespaceURI === htmlNamespace) return htmlTags.has(node.tag);
	if (namespaceURI === svgNamespace) return svgBoundaries.has(node.tag);
	return namespaceURI === mathmlNamespace && mathmlBoundaries.has(node.tag);
}

export function isHtmlSpecial(node: string | HtmlParserNode): boolean {
	return hasCategory(node, special);
}

export function isHtmlScopeBoundary(node: string | HtmlParserNode): boolean {
	return hasCategory(node, scopeBoundaries);
}

interface FormattingEntry {
	node: HtmlParserNode;
	attributes: Readonly<Record<string, string>>;
}
type Entry = FormattingEntry | { marker: HtmlParserNode };

export class HtmlFormatting {
	private readonly entries: Entry[] = [];
	private work = 0;
	private text = 0;

	constructor(
		private readonly options: {
			stack: () => HtmlParserNode[];
			insert: (
				tag: string,
				attributes: Record<string, string>,
				foster: boolean,
			) => HtmlParserNode;
			place: (node: HtmlParserNode, ancestor: HtmlParserNode) => void;
			issue: (code: string) => void;
			check: () => void;
			maxWork: number;
			maxText: number;
		},
	) {
		this.options = Object.freeze({ ...options });
		if (
			!Number.isSafeInteger(this.options.maxWork) ||
			this.options.maxWork < 1 ||
			!Number.isSafeInteger(this.options.maxText) ||
			this.options.maxText < 1
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid HTML formatting work limits",
			);
	}

	sync() {
		for (let index = 0; index < this.entries.length; index++) {
			this.visit();
			const entry = this.entries[index];
			if ("marker" in entry && this.stackIndex(entry.marker) < 0) {
				this.entries.length = index;
				return;
			}
		}
	}

	mark(node: HtmlParserNode) {
		this.sync();
		this.entries.push({ marker: node });
	}

	add(node: HtmlParserNode, attributes: Record<string, string>) {
		this.sync();
		const matches: number[] = [];
		for (let index = this.entries.length - 1; index >= 0; index--) {
			this.visit();
			const entry = this.entries[index];
			if ("marker" in entry) break;
			if (
				entry.node.tag === node.tag &&
				elementNamespace(entry.node.tree.elementInfo(entry.node.id)) ===
					elementNamespace(node.tree.elementInfo(node.id)) &&
				this.sameAttributes(entry.attributes, attributes)
			)
				matches.push(index);
		}
		if (matches.length >= 3)
			this.entries.splice(matches[matches.length - 1], 1);
		this.entries.push({ node, attributes: Object.freeze({ ...attributes }) });
	}

	find(tag: string): HtmlParserNode | undefined {
		this.sync();
		for (let index = this.entries.length - 1; index >= 0; index--) {
			this.visit();
			const entry = this.entries[index];
			if ("marker" in entry) break;
			if (isHtmlParserNode(entry.node, tag)) return entry.node;
		}
		return undefined;
	}

	remove(node: HtmlParserNode) {
		const index = this.activeIndex(node);
		if (index >= 0) this.entries.splice(index, 1);
	}

	inScope(node: HtmlParserNode): boolean {
		const stack = this.options.stack();
		for (let index = stack.length - 1; index >= 0; index--) {
			this.visit();
			if (stack[index] === node) return true;
			if (isHtmlScopeBoundary(stack[index])) return false;
		}
		return false;
	}

	reconstruct(foster: boolean) {
		this.sync();
		let index = this.entries.length;
		while (index > 0) {
			this.visit();
			const entry = this.entries[index - 1];
			if ("marker" in entry || this.stackIndex(entry.node) >= 0) break;
			index--;
		}
		for (; index < this.entries.length; index++) {
			this.visit();
			const entry = this.entries[index];
			if ("marker" in entry) continue;
			const node = this.options.insert(
				entry.node.tag,
				{ ...entry.attributes },
				foster,
			);
			this.options.stack().push(node);
			entry.node = node;
		}
	}

	end(tag: string) {
		this.sync();
		const stack = this.options.stack();
		const current = stack[stack.length - 1];
		if (
			isHtmlParserNode(current, tag) &&
			this.activeIndex(current) < 0 &&
			stack.length > 1
		) {
			stack.pop();
			return;
		}
		for (let outer = 0; outer < 8; outer++) {
			this.visit();
			const formatting = this.find(tag);
			if (!formatting) {
				for (let index = stack.length - 1; index > 0; index--) {
					this.visit();
					if (isHtmlParserNode(stack[index], tag)) {
						stack.length = index;
						return;
					}
					if (isHtmlSpecial(stack[index])) break;
				}
				this.options.issue("unmatched-formatting-end");
				return;
			}
			const formattingIndex = this.stackIndex(formatting);
			if (formattingIndex < 0) {
				this.remove(formatting);
				this.options.issue("detached-formatting-end");
				return;
			}
			if (!this.inScope(formatting)) {
				this.options.issue("formatting-end-out-of-scope");
				return;
			}
			if (formattingIndex !== stack.length - 1)
				this.options.issue("misnested-formatting-repaired");
			let furthestIndex = formattingIndex + 1;
			while (
				furthestIndex < stack.length &&
				!isHtmlSpecial(stack[furthestIndex])
			) {
				this.visit();
				furthestIndex++;
			}
			if (furthestIndex === stack.length) {
				stack.length = formattingIndex;
				this.remove(formatting);
				return;
			}
			const ancestor = stack[formattingIndex - 1];
			const furthest = stack[furthestIndex];
			let bookmark = this.activeIndex(formatting);
			let last = furthest;
			let inner = 0;
			for (let index = furthestIndex - 1; index > formattingIndex; index--) {
				this.visit();
				inner++;
				const node = stack[index];
				let active = this.activeIndex(node);
				if (inner > 3 && active >= 0) {
					this.entries.splice(active, 1);
					if (active < bookmark) bookmark--;
					active = -1;
				}
				if (active < 0) {
					stack.splice(index, 1);
					continue;
				}
				const entry = this.entries[active] as FormattingEntry;
				const copy = this.copy(entry, furthest.tree);
				entry.node = copy;
				stack[index] = copy;
				if (last === furthest) bookmark = active + 1;
				this.append(copy, last);
				last = copy;
			}
			this.options.place(last, ancestor);
			const active = this.activeIndex(formatting);
			const entry = this.entries[active] as FormattingEntry;
			const copy = this.copy(entry, furthest.tree);
			for (const child of furthest.tree.get(furthest.id).children) {
				this.visit();
				copy.tree.append(copy.id, child);
			}
			this.append(furthest, copy);
			this.entries.splice(active, 1);
			if (active < bookmark) bookmark--;
			this.entries.splice(bookmark, 0, {
				node: copy,
				attributes: entry.attributes,
			});
			stack.splice(this.stackIndex(formatting), 1);
			stack.splice(this.stackIndex(furthest) + 1, 0, copy);
		}
	}

	private copy(entry: FormattingEntry, tree: DocumentTree): HtmlParserNode {
		this.visit();
		return {
			tree,
			id: tree.createParserElement(entry.node.tag, { ...entry.attributes }),
			tag: entry.node.tag,
		};
	}
	private append(parent: HtmlParserNode, child: HtmlParserNode) {
		this.visit();
		if (parent.tree !== child.tree)
			throw new AgentBrowserError(
				"unsupported",
				"Formatting repair cannot cross document owners",
			);
		parent.tree.append(parent.id, child.id);
	}
	private stackIndex(node: HtmlParserNode) {
		const stack = this.options.stack();
		for (let index = stack.length - 1; index >= 0; index--) {
			this.visit();
			if (stack[index] === node) return index;
		}
		return -1;
	}
	private activeIndex(node: HtmlParserNode) {
		for (let index = this.entries.length - 1; index >= 0; index--) {
			this.visit();
			const entry = this.entries[index];
			if ("node" in entry && entry.node === node) return index;
		}
		return -1;
	}
	private sameAttributes(
		first: Readonly<Record<string, string>>,
		second: Record<string, string>,
	) {
		const names = Object.keys(first);
		const otherNames = Object.keys(second);
		this.visit(names.length + otherNames.length);
		if (names.length !== otherNames.length) return false;
		for (const name of names) {
			this.visit();
			this.text +=
				name.length + first[name].length + (second[name]?.length ?? 0);
			if (this.text > this.options.maxText)
				throw new AgentBrowserError(
					"resource-limit",
					"HTML formatting text work limit exceeded",
				);
			if (!Object.hasOwn(second, name) || first[name] !== second[name])
				return false;
		}
		return true;
	}
	private visit(count = 1) {
		this.options.check();
		this.work += count;
		if (this.work > this.options.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"HTML formatting work limit exceeded",
			);
	}
}
