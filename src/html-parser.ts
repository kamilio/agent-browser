import { type DocumentLimits, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { decodeHtmlEntities } from "./html-entities.js";
import { setHtmlParseInfo } from "./html-info.js";
import { HtmlTokenizer } from "./html-tokenizer.js";

const voidTags = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);
const headTags = new Set([
	"base",
	"basefont",
	"bgsound",
	"link",
	"meta",
	"title",
	"style",
	"script",
]);
const rawTags = new Set([
	"script",
	"style",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
]);
const blocks = new Set([
	"address",
	"article",
	"aside",
	"blockquote",
	"center",
	"details",
	"dialog",
	"dir",
	"div",
	"dl",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"hgroup",
	"hr",
	"main",
	"menu",
	"nav",
	"ol",
	"p",
	"pre",
	"search",
	"section",
	"table",
	"ul",
]);
const formatting = new Set([
	"a",
	"b",
	"big",
	"code",
	"em",
	"font",
	"i",
	"nobr",
	"s",
	"small",
	"strike",
	"strong",
	"tt",
	"u",
]);
const tableContainers = new Set(["table", "tbody", "thead", "tfoot", "tr"]);
const sections = new Set(["tbody", "thead", "tfoot"]);

export interface HtmlParseOptions {
	limits?: Partial<DocumentLimits>;
	signal?: AbortSignal;
	initializeDocument?: (tree: DocumentTree) => void;
}

export interface HtmlFragmentContext {
	tagName: string;
	hasFormAncestor?: boolean;
	scripting?: boolean;
}

interface FragmentContext extends HtmlFragmentContext {
	root?: number;
}

export function parseHtmlFragment(
	source: string,
	url: string,
	context: HtmlFragmentContext,
	options: HtmlParseOptions = {},
): { tree: DocumentTree; fragment: number } {
	if (
		!context ||
		typeof context.tagName !== "string" ||
		!/^[a-z][a-z0-9:_-]*$/i.test(context.tagName)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid HTML fragment context",
		);
	const tagName = context.tagName.toLowerCase();
	if (["template", "svg", "math", "frameset", "frame"].includes(tagName))
		throw new AgentBrowserError(
			"unsupported",
			`HTML ${tagName} fragment context is not implemented`,
		);
	const fragmentContext: FragmentContext = { ...context, tagName };
	const steps = parseHtmlSteps(
		source,
		url,
		options,
		context.scripting ?? true,
		tagName === "html" ? undefined : fragmentContext,
		tagName === "html",
	);
	let step = steps.next();
	while (!step.done) step = steps.next();
	const tree = step.value;
	try {
		if (tagName === "html") {
			const html = tree
				.get(tree.root)
				.children.find((id) => tree.get(id).tagName === "html");
			if (html === undefined)
				throw new AgentBrowserError(
					"unsupported",
					"Fragment document element is missing",
				);
			const root = tree.createFragment();
			for (const child of tree.get(html).children) tree.append(root, child);
			return { tree, fragment: root };
		}
		if (fragmentContext.root === undefined)
			throw new AgentBrowserError("unsupported", "Fragment root is missing");
		return { tree, fragment: fragmentContext.root };
	} catch (error) {
		tree.close();
		throw error;
	}
}

export interface HtmlScriptHooks {
	start(tree: DocumentTree): void | Promise<void>;
	script(
		tree: DocumentTree,
		id: number,
		context: HtmlScriptContext,
	): Promise<void>;
	prepareWrittenScript?(
		tree: DocumentTree,
		id: number,
	): "blocking" | "nonblocking" | "inline";
	finish(tree: DocumentTree): Promise<void>;
	policy?(tree: DocumentTree, id: number): void;
	runParser?(step: () => void): Promise<void>;
	parsed?(tree: DocumentTree): Promise<void>;
}

export interface HtmlScriptContext {
	write(text: string): void;
}

type ParserCheckpoint =
	| {
			kind: "start";
			tree: DocumentTree;
			input: HtmlTokenizer;
			normalize: (text: string) => string;
	  }
	| { kind: "pause"; tree: DocumentTree }
	| { kind: "script" | "policy"; tree: DocumentTree; id: number };

export function parseHtmlDocument(
	source: string,
	url: string,
	options: HtmlParseOptions = {},
): DocumentTree {
	const steps = parseHtmlSteps(source, url, options, false);
	let step = steps.next();
	while (!step.done) step = steps.next();
	return step.value;
}

export async function parseHtmlDocumentAsync(
	source: string,
	url: string,
	options: HtmlParseOptions,
	hooks: HtmlScriptHooks,
): Promise<DocumentTree> {
	const steps = parseHtmlSteps(source, url, options, true);
	let tree: DocumentTree | undefined;
	let input: HtmlTokenizer | undefined;
	let normalize = (text: string) => text;
	let sourceUnits = typeof source === "string" ? source.length : 0;
	let writes = 0;
	let fatalWrite: { error: unknown } | undefined;
	const pending: IteratorYieldResult<ParserCheckpoint>[] = [];
	const advance = async () => {
		let result!: ReturnType<typeof steps.next>;
		if (hooks.runParser)
			await hooks.runParser(() => {
				result = steps.next();
			});
		else result = steps.next();
		return result;
	};
	try {
		let step = await advance();
		while (!step.done) {
			tree = step.value.tree;
			if (step.value.kind === "start") {
				input = step.value.input;
				normalize = step.value.normalize;
				await hooks.start(step.value.tree);
			} else if (step.value.kind === "policy")
				hooks.policy?.(step.value.tree, step.value.id);
			else if (step.value.kind === "script") {
				const stream = input;
				if (!stream)
					throw new AgentBrowserError(
						"unsupported",
						"HTML parser input is unavailable",
					);
				const document = tree;
				let point = stream.position;
				let active = true;
				let blocked = false;
				const context: HtmlScriptContext = Object.freeze({
					write(text: string) {
						if (!active)
							throw new AgentBrowserError(
								"unsupported",
								"Parser write context expired",
							);
						try {
							if (fatalWrite) throw fatalWrite.error;
							document.get(document.root);
							if (typeof text !== "string")
								throw new AgentBrowserError(
									"invalid-input",
									"Expected document write text",
								);
							if (
								++writes > 256 ||
								sourceUnits + text.length > document.limits.maxTextCodeUnits
							)
								throw new AgentBrowserError(
									"resource-limit",
									"Document write input limit exceeded",
								);
							sourceUnits += text.length;
							const value = normalize(text);
							stream.insert(value, point);
							point += value.length;
							stream.setBoundary(point);
							if (blocked) return;
							while (true) {
								const emitted = steps.next();
								if (emitted.done)
									throw new AgentBrowserError(
										"unsupported",
										"Unexpected document write parser completion",
									);
								if (emitted.value.kind === "pause") break;
								if (emitted.value.kind === "policy")
									hooks.policy?.(document, emitted.value.id);
								else if (emitted.value.kind === "script") {
									const disposition =
										hooks.prepareWrittenScript?.(document, emitted.value.id) ??
										(Object.hasOwn(
											document.get(emitted.value.id).attributes,
											"src",
										)
											? "blocking"
											: "inline");
									if (disposition === "inline")
										throw new AgentBrowserError(
											"unsupported",
											"Nested inline document.write execution requires interpreter support",
										);
									pending.push(emitted);
									if (disposition === "blocking") {
										blocked = true;
										break;
									}
								}
							}
						} catch (error) {
							fatalWrite = { error };
							throw error;
						}
					},
				});
				try {
					await hooks.script(document, step.value.id, context);
					if (fatalWrite) throw fatalWrite.error;
				} finally {
					active = false;
					stream.setBoundary(undefined);
				}
			}
			if (options.signal?.aborted)
				throw new AgentBrowserError("aborted", "HTML parsing aborted");
			step = pending.shift() ?? (await advance());
		}
		tree = step.value;
		await hooks.parsed?.(tree);
		return step.value;
	} catch (error) {
		try {
			steps.throw(error);
		} catch {}
		tree?.close();
		throw error;
	}
}

function* parseHtmlSteps(
	source: string,
	url: string,
	options: HtmlParseOptions,
	scripting: boolean,
	fragment?: FragmentContext,
	fragmentDocument = false,
): Generator<ParserCheckpoint, DocumentTree, void> {
	if (typeof source !== "string")
		throw new AgentBrowserError("invalid-input", "Expected HTML text");
	if (options.signal?.aborted)
		throw new AgentBrowserError("aborted", "HTML parsing aborted");
	const tree = new DocumentTree(url, options.limits);
	const issues: Record<string, number> = Object.create(null);
	const issue = (code: string) => {
		issues[code] = (issues[code] ?? 0) + 1;
	};
	try {
		if (source.length > tree.limits.maxTextCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"HTML source text limit exceeded",
			);
		if (!fragment && !fragmentDocument) options.initializeDocument?.(tree);
		const normalize = (text: string) =>
			text.replace(/\r\n?/g, "\n").replace(/\0|\p{Cs}/gu, () => {
				issue("invalid-unicode-replaced");
				return "\ufffd";
			});
		const normalized = normalize(
			fragment || fragmentDocument ? source : source.replace(/^\ufeff/, ""),
		);
		const tokenizer = new HtmlTokenizer(normalized, issue);
		const html = fragment ? tree.createFragment() : tree.createElement("html");
		const head = fragment ? html : tree.createElement("head");
		const body = fragment ? html : tree.createElement("body");
		if (fragment) fragment.root = html;
		else {
			tree.append(tree.root, html);
			tree.append(html, head);
		}
		let bodyStarted = !!fragment;
		if (scripting && !fragment)
			yield { kind: "start", tree, input: tokenizer, normalize };
		let mode: "before" | "head" | "body" | "after" = fragment
			? "body"
			: "before";
		let stack = [{ id: body, tag: fragment?.tagName ?? "body" }];
		let form: number | undefined =
			fragment?.hasFormAncestor || fragment?.tagName === "form"
				? -1
				: undefined;
		let doctype = !!fragment;
		let tokens = 0;
		let stripNewline = false;
		let lastText: { id: number; parent: number; before?: number } | undefined;
		const fosterTexts = new Map<number, number>();
		const current = () => stack[stack.length - 1];
		const position = (tag: string) => {
			for (let index = stack.length - 1; index >= 0; index--)
				if (stack[index].tag === tag) return index;
			return -1;
		};
		const pop = (tag: string) => {
			const index = position(tag);
			if (index > 0) {
				stack.length = index;
				return true;
			}
			return false;
		};
		const inBody = () => {
			if (!bodyStarted) {
				tree.append(html, body);
				bodyStarted = true;
			}
			stack = [{ id: body, tag: "body" }];
			return "body" as const;
		};
		const location = (foster: boolean) => {
			if (foster && tableContainers.has(current().tag)) {
				const table = stack[position("table")];
				if (table) {
					const parent = tree.get(table.id).parent;
					if (parent !== null) {
						issue("table-foster-parenting");
						return { parent, before: table.id };
					}
				}
			}
			return { parent: current().id, before: undefined };
		};
		const insert = (
			name: string,
			attributes: Record<string, string> = {},
			foster = false,
		) => {
			const target = location(foster);
			const id = tree.createElement(name, attributes);
			tree.insert(target.parent, id, target.before);
			if (target.before !== undefined) fosterTexts.delete(target.before);
			lastText = undefined;
			return id;
		};
		const text = (data: string, foster = false) => {
			if (!data) return;
			const target = location(foster);
			const fosterText =
				target.before === undefined
					? undefined
					: fosterTexts.get(target.before);
			if (fosterText !== undefined)
				tree.setData(fosterText, tree.get(fosterText).data + data);
			else if (
				lastText?.parent === target.parent &&
				lastText.before === target.before
			)
				tree.setData(lastText.id, tree.get(lastText.id).data + data);
			else {
				const id = tree.createText(data);
				tree.insert(target.parent, id, target.before);
				lastText = { id, ...target };
				if (target.before !== undefined) fosterTexts.set(target.before, id);
			}
		};
		const merge = (id: number, attributes: Record<string, string>) => {
			for (const [name, value] of Object.entries(attributes))
				if (!Object.hasOwn(tree.get(id).attributes, name))
					tree.setAttribute(id, name, value);
		};
		const push = (
			tag: string,
			attributes: Record<string, string> = {},
			foster = false,
		) => {
			const id = insert(tag, attributes, foster);
			stack.push({ id, tag });
			return id;
		};
		const checkInput = () => {
			if (options.signal?.aborted)
				throw new AgentBrowserError("aborted", "HTML parsing aborted");
			if (tokenizer.workUnits > tree.limits.maxTextCodeUnits * 8)
				throw new AgentBrowserError(
					"resource-limit",
					"HTML input work limit exceeded",
				);
		};
		const nextToken = () => {
			const token = tokenizer.next();
			checkInput();
			if (token && ++tokens > tree.limits.maxNodes * 8)
				throw new AgentBrowserError(
					"resource-limit",
					"HTML token limit exceeded",
				);
			return token;
		};
		if (
			fragment &&
			(rawTags.has(fragment.tagName) ||
				["title", "textarea", "plaintext"].includes(fragment.tagName) ||
				(fragment.tagName === "noscript" && scripting))
		) {
			const data = tokenizer.remainder();
			text(
				["title", "textarea"].includes(fragment.tagName)
					? decodeHtmlEntities(data, false, issue)
					: data,
			);
			checkInput();
		}
		while (true) {
			let token = nextToken();
			while (!token && tokenizer.paused) {
				yield { kind: "pause", tree };
				token = nextToken();
			}
			if (!token) break;
			if (token.kind === "doctype") {
				if (doctype || mode !== "before") issue("misplaced-doctype");
				doctype = true;
				if (!/^html$/i.test(token.data)) issue("doctype-mode-not-implemented");
				continue;
			}
			if (token.kind === "comment") {
				const comment = tree.createComment(token.data);
				if (mode === "before" && fragmentDocument)
					tree.insert(html, comment, head);
				else if (mode === "before") tree.insert(tree.root, comment, html);
				else tree.append(mode === "after" ? html : current().id, comment);
				lastText = undefined;
				continue;
			}
			if (token.kind === "text") {
				let data = token.data;
				if (
					fragment?.tagName === "colgroup" &&
					stack.length === 1 &&
					/[^\t\n\f\r ]/.test(data)
				) {
					issue("ignored-text-in-colgroup");
					data = data.replace(/[^\t\n\f\r ]/g, "");
				}
				if (stripNewline && data.startsWith("\n")) data = data.slice(1);
				stripNewline = false;
				if (mode === "before" && /^[\t\n\f\r ]*$/.test(data)) continue;
				if (
					mode === "before" ||
					mode === "after" ||
					(mode === "head" && stack.length === 1 && /[^\t\n\f\r ]/.test(data))
				)
					mode = inBody();
				text(data, /[^\t\n\f\r ]/.test(data));
				continue;
			}
			stripNewline = false;
			const { name, attributes } = token;
			if (fragment && ["html", "head", "body"].includes(name)) {
				issue("ignored-fragment-document-tag");
				continue;
			}
			if (
				fragment?.tagName === "colgroup" &&
				stack.length === 1 &&
				name !== "col"
			) {
				issue("ignored-tag-in-colgroup");
				continue;
			}
			if (
				token.kind === "start" &&
				["svg", "math", "template", "frameset", "frame"].includes(name)
			)
				throw new AgentBrowserError(
					"unsupported",
					`HTML ${name} tree construction is not implemented`,
				);
			if (name === "html") {
				if (token.kind === "start") merge(html, attributes);
				else if (mode === "body") mode = "after";
				continue;
			}
			if (name === "head") {
				if (token.kind === "start" && mode === "before") {
					mode = "head";
					stack = [{ id: head, tag: "head" }];
					merge(head, attributes);
				} else if (token.kind === "end" && mode === "head") mode = inBody();
				else issue("unexpected-head");
				continue;
			}
			if (name === "body") {
				if (token.kind === "start") {
					merge(body, attributes);
					if (mode !== "body") mode = inBody();
				} else {
					mode = "after";
					stack = [{ id: body, tag: "body" }];
				}
				continue;
			}
			if (mode === "before") {
				if (token.kind === "start" && headTags.has(name)) {
					mode = "head";
					stack = [{ id: head, tag: "head" }];
				} else mode = inBody();
			}
			if (mode === "head" && stack.length === 1 && !headTags.has(name))
				mode = inBody();
			if (mode === "after") {
				issue("content-after-body");
				mode = inBody();
			}
			if (token.kind === "end") {
				if (name === "form") {
					if (form !== undefined) {
						stack = stack.filter((entry) => entry.id !== form);
						form = undefined;
					} else issue("unmatched-end-tag");
					continue;
				}
				if (name === "br") {
					insert("br", {}, true);
					issue("end-br-as-start");
					continue;
				}
				const index = position(name);
				if (index < 1) {
					issue("unmatched-end-tag");
					continue;
				}
				if (index !== stack.length - 1 && formatting.has(name))
					issue("formatting-reconstruction-not-implemented");
				stack.length = index;
				continue;
			}
			if (position("select") >= 0) {
				if (name === "select") {
					pop("select");
					issue("nested-select");
					continue;
				}
				if (["input", "textarea", "keygen"].includes(name)) {
					if (fragment && position("select") === 0) {
						issue("ignored-control-in-select-fragment");
						continue;
					}
					pop("select");
					issue("select-closed-by-control");
				} else if (!["option", "optgroup", "script"].includes(name)) {
					issue("ignored-tag-in-select");
					continue;
				}
			}
			if (name === "form" && form !== undefined) {
				issue("nested-form-ignored");
				continue;
			}
			if (blocks.has(name)) pop("p");
			if (name === "li") {
				for (let index = stack.length - 1; index > 0; index--) {
					if (["ul", "ol", "menu"].includes(stack[index].tag)) break;
					if (stack[index].tag === "li") {
						stack.length = index;
						break;
					}
				}
				pop("p");
			}
			if (name === "dd" || name === "dt") {
				const index = Math.max(position("dd"), position("dt"));
				if (index > 0) stack.length = index;
				pop("p");
			}
			if (
				stack.length > 1 &&
				/^h[1-6]$/.test(name) &&
				/^h[1-6]$/.test(current().tag)
			)
				stack.pop();
			if (["a", "button", "nobr"].includes(name) && pop(name))
				issue("nested-interactive-or-formatting");
			if (name === "option" && current().tag === "option" && stack.length > 1)
				stack.pop();
			if (name === "optgroup") {
				if (current().tag === "option" && stack.length > 1) stack.pop();
				if (current().tag === "optgroup" && stack.length > 1) stack.pop();
			}
			if (
				[
					"caption",
					"colgroup",
					"col",
					"tbody",
					"thead",
					"tfoot",
					"tr",
					"td",
					"th",
				].includes(name)
			) {
				const actualTable = position("table");
				const tableIndex =
					actualTable >= 0
						? actualTable
						: fragment &&
								(sections.has(fragment.tagName) ||
									["tr", "colgroup"].includes(fragment.tagName))
							? 0
							: -1;
				if (tableIndex < 0 || (tableIndex === 0 && !fragment)) {
					issue("table-tag-outside-table");
					continue;
				}
				if (
					fragment &&
					stack.length === 1 &&
					((sections.has(fragment.tagName) && sections.has(name)) ||
						(fragment.tagName === "tr" &&
							["tr", "tbody", "thead", "tfoot"].includes(name)))
				) {
					issue("ignored-table-fragment-container");
					continue;
				}
				if (sections.has(name) || name === "caption" || name === "colgroup")
					stack.length = tableIndex + 1;
				if (name === "tr") {
					const sectionIndex = Math.max(
						position("tbody"),
						position("thead"),
						position("tfoot"),
					);
					stack.length = Math.max(tableIndex, sectionIndex) + 1;
					if (!sections.has(current().tag)) push("tbody");
				}
				if (name === "td" || name === "th") {
					const row = position("tr");
					if (row >= tableIndex && row >= 0) stack.length = row + 1;
					else {
						if (current().tag === "table") push("tbody");
						push("tr");
						issue("implicit-table-row");
					}
				}
				if (name === "col" && current().tag !== "colgroup") {
					stack.length = tableIndex + 1;
					push("colgroup");
				}
			}
			const foster = ![
				"caption",
				"colgroup",
				"col",
				"tbody",
				"thead",
				"tfoot",
				"tr",
				"td",
				"th",
				"style",
				"script",
				"input",
				"form",
			].includes(name);
			const id = insert(name, attributes, foster);
			if (
				scripting &&
				!fragment &&
				name === "meta" &&
				attributes["http-equiv"]?.trim().toLowerCase() ===
					"content-security-policy"
			)
				yield { kind: "policy", tree, id };
			if (name === "form") form = id;
			if (voidTags.has(name) || ["basefont", "bgsound"].includes(name))
				continue;
			if (token.selfClosing) issue("nonvoid-self-close-ignored");
			stack.push({ id, tag: name });
			if (
				rawTags.has(name) ||
				name === "title" ||
				name === "textarea" ||
				(name === "noscript" && scripting)
			) {
				let data = tokenizer.raw(name, name === "title" || name === "textarea");
				checkInput();
				while (data === undefined) {
					yield { kind: "pause", tree };
					data = tokenizer.raw(name, name === "title" || name === "textarea");
					checkInput();
				}
				if (name === "textarea" && data.startsWith("\n")) data = data.slice(1);
				text(data);
				if (name === "script") {
					let closing = nextToken();
					while (!closing && tokenizer.paused) {
						yield { kind: "pause", tree };
						closing = nextToken();
					}
					pop("script");
					if (scripting && closing && !fragment)
						yield { kind: "script", tree, id };
					else if (scripting && !fragment)
						issue("unterminated-script-not-executed");
					else issue("script-not-executed");
				}
				if (name === "iframe") issue("iframe-not-loaded");
			} else if (name === "plaintext") {
				while (true) {
					text(tokenizer.remainder());
					checkInput();
					if (!tokenizer.bounded) break;
					yield { kind: "pause", tree };
				}
			} else if (name === "pre" || name === "listing") stripNewline = true;
		}
		if (!bodyStarted) tree.append(html, body);
		if (!doctype) issue("missing-doctype-quirks-not-implemented");
		setHtmlParseInfo(tree, {
			parser: "independent-html-subset",
			partial: true,
			scripting,
			issues,
		});
		return tree;
	} catch (error) {
		tree.close();
		throw error;
	}
}
