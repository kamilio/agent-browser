import {
	type DocumentMode,
	doctypeMode,
	documentMode,
	setDocumentMode,
} from "./document-mode.js";
import { type DocumentLimits, DocumentTree } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	isHtmlElement,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { htmlAttributeEntries } from "./html-attributes.js";
import { decodeHtmlEntities } from "./html-entities.js";
import {
	HtmlForeign,
	type HtmlForeignContext,
	foreignAttributes,
} from "./html-foreign.js";
import {
	HtmlFormatting,
	type HtmlParserNode,
	isHtmlParserNode,
} from "./html-formatting.js";
import { setHtmlParseInfo } from "./html-info.js";
import { HtmlScaffold } from "./html-scaffold.js";
import { HtmlScope } from "./html-scope.js";
import { HtmlTables } from "./html-tables.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import { resourceLimitError } from "./resource-limit.js";

const voidTags = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"keygen",
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
	"noframes",
	"script",
	"template",
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
const templateHeadTags = new Set([
	"base",
	"basefont",
	"bgsound",
	"link",
	"meta",
	"noframes",
	"script",
	"style",
]);

type TemplateMode = "template" | "table" | "colgroup" | "tbody" | "tr" | "body";

export interface HtmlParseOptions {
	limits?: Partial<DocumentLimits>;
	signal?: AbortSignal;
	initializeDocument?: (tree: DocumentTree) => void;
}

export interface HtmlFragmentContext extends HtmlForeignContext {
	hasFormAncestor?: boolean;
	scripting?: boolean;
	documentMode?: DocumentMode;
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
	const htmlContext = elementNamespace(context) === htmlNamespace;
	if (
		![htmlNamespace, svgNamespace, mathmlNamespace].includes(
			elementNamespace(context),
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid HTML fragment namespace",
		);
	const tagName = htmlContext ? context.tagName.toLowerCase() : context.tagName;
	if (htmlContext && ["frameset", "frame"].includes(tagName))
		throw new AgentBrowserError(
			"unsupported",
			`HTML ${tagName} fragment context is not implemented`,
		);
	const fragmentContext: FragmentContext = { ...context, tagName };
	const documentContext = htmlContext && tagName === "html";
	const steps = parseHtmlSteps(
		source,
		url,
		options,
		context.scripting ?? true,
		documentContext ? undefined : fragmentContext,
		documentContext ? fragmentContext : undefined,
	);
	let step = steps.next();
	while (!step.done) step = steps.next();
	const tree = step.value;
	try {
		if (documentContext) {
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
								throw resourceLimitError(
									writes > 256 ? "html.writes" : "html.write-source",
									writes > 256 ? 256 : document.limits.maxTextCodeUnits,
									writes > 256 ? writes : sourceUnits + text.length,
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
	fragmentDocument?: FragmentContext,
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
			throw resourceLimitError(
				"html.source",
				tree.limits.maxTextCodeUnits,
				source.length,
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
		const root = fragment ? tree.createFragment() : tree.root;
		const htmlFragment =
			fragment && elementNamespace(fragment) === htmlNamespace
				? fragment
				: undefined;
		const scaffold = new HtmlScaffold(tree, fragment ? root : undefined);
		if (fragment) fragment.root = root;
		if (fragmentDocument) scaffold.startHtml();
		if (scripting && !fragment)
			yield { kind: "start", tree, input: tokenizer, normalize };
		let mode:
			| "before"
			| "before-head"
			| "head"
			| "head-noscript"
			| "after-head"
			| "body"
			| "after"
			| "after-after" = fragment
			? "body"
			: fragmentDocument
				? "before-head"
				: "before";
		let stack = [
			{
				tree,
				id: fragmentDocument ? scaffold.html : root,
				tag: htmlFragment?.tagName ?? "html",
			},
		];
		const templates: { index: number; mode: TemplateMode }[] =
			htmlFragment?.tagName === "template"
				? [{ index: 0, mode: "template" }]
				: [];
		const templateScope = () => templates[templates.length - 1];
		const inTemplate = () => templates.length > 0;
		let form: number | undefined =
			fragment?.hasFormAncestor || htmlFragment?.tagName === "form"
				? -1
				: undefined;
		let initial = !fragment && !fragmentDocument;
		const setMode = (value: DocumentMode) => {
			setDocumentMode(tree, value);
			if (value !== "no-quirks") issue(`${value}-layout-not-implemented`);
		};
		if (fragment || fragmentDocument)
			setMode((fragment ?? fragmentDocument)?.documentMode ?? "no-quirks");
		const missingDoctype = () => {
			initial = false;
			issue("missing-doctype");
			setMode("quirks");
		};
		let tokens = 0;
		let stripNewline = false;
		let lastText:
			| { tree: DocumentTree; id: number; parent: number; before?: number }
			| undefined;
		let tableFoster = false;
		let lateHeadInsertion = false;
		const current = () => stack[stack.length - 1];
		const openOptions = new Map<
			number,
			{ node: HtmlParserNode; index: number }
		>();
		const finishOptions = (all = false) => {
			if (!openOptions.size) return;
			for (const entry of [...openOptions.values()].reverse()) {
				if (!all) {
					if (stack[entry.index] === entry.node) continue;
					entry.index = stack.findIndex((node) => node.id === entry.node.id);
					if (entry.index !== -1) continue;
				}
				openOptions.delete(entry.node.id);
				entry.node.tree.finishParserOption(entry.node.id);
			}
		};
		const insertionTarget = (entry = current()) => {
			if (isHtmlElement(entry.tree.get(entry.id), "template"))
				return entry.tree.templateContent(entry.id);
			return entry;
		};
		const contextTag = () => {
			const scope = templateScope();
			return scope && stack.length === scope.index + 1
				? scope.mode
				: current().tag;
		};
		const position = (tag: string) => {
			for (
				let index = stack.length - 1;
				index >= (templateScope()?.index ?? 0);
				index--
			)
				if (
					stack[index].tag === tag &&
					elementNamespace(stack[index].tree.get(stack[index].id)) ===
						htmlNamespace
				)
					return index;
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
		const inHtml = (attributes?: Record<string, string>) => {
			const html = scaffold.startHtml(attributes);
			stack = [{ tree, id: html, tag: "html" }];
			return "before-head" as const;
		};
		const inBody = (attributes?: Record<string, string>) => {
			const body = scaffold.startBody(attributes);
			stack = [{ tree, id: body, tag: "body" }];
			return "body" as const;
		};
		const inHead = (attributes?: Record<string, string>) => {
			const head = scaffold.startHead(attributes);
			stack = [{ tree, id: head, tag: "head" }];
			lastText = undefined;
			return "head" as const;
		};
		const afterHead = () => {
			stack = [{ tree, id: scaffold.html, tag: "html" }];
			lastText = undefined;
			return "after-head" as const;
		};
		const location = (foster: boolean, override?: HtmlParserNode) => {
			if (
				(foster || tableFoster) &&
				isHtmlParserNode(override ?? current()) &&
				tableContainers.has(override?.tag ?? contextTag())
			) {
				const tableIndex = position("table");
				const table = stack[tableIndex];
				if (table) {
					const parent = table.tree.get(table.id).parent;
					if (parent !== null) {
						issue("table-foster-parenting");
						return {
							tree: table.tree,
							parent,
							before: table.id,
							fostered: true,
						};
					}
					const target = insertionTarget(stack[Math.max(0, tableIndex - 1)]);
					return {
						tree: target.tree,
						parent: target.id,
						before: undefined,
						fostered: true,
					};
				}
				if (templateScope()) {
					const target = insertionTarget(stack[templateScope().index]);
					return {
						tree: target.tree,
						parent: target.id,
						before: undefined,
						fostered: true,
					};
				}
			}
			const target = insertionTarget(override);
			return {
				tree: target.tree,
				parent: target.id,
				before: undefined,
				fostered: false,
			};
		};
		const insert = (
			name: string,
			attributes: Record<string, string> = {},
			foster = false,
			namespaceURI = htmlNamespace,
		) => {
			finishOptions();
			const target = location(
				foster,
				lateHeadInsertion
					? { tree, id: scaffold.head, tag: "head" }
					: undefined,
			);
			lateHeadInsertion = false;
			const id = target.tree.createParserElement(
				name,
				attributes,
				namespaceURI,
			);
			if (
				namespaceURI === htmlNamespace &&
				form !== undefined &&
				form > 0 &&
				!inTemplate() &&
				target.tree === tree
			)
				tree.insertParserElement(target.parent, id, form, target.before);
			else target.tree.insert(target.parent, id, target.before);
			lastText = undefined;
			return { tree: target.tree, id };
		};
		const text = (data: string, foster = false, inspectAdjacent = false) => {
			if (!data) return;
			const target = location(foster);
			let previousText: number | undefined;
			if (
				inspectAdjacent ||
				target.fostered ||
				(lastText?.tree === target.tree &&
					lastText.parent === target.parent &&
					lastText.before === target.before)
			) {
				const siblings = target.tree.get(target.parent).children;
				tables.scan(siblings.length * 3);
				const index =
					target.before === undefined
						? siblings.length
						: siblings.indexOf(target.before);
				const previous = siblings[index - 1];
				if (previous !== undefined && target.tree.get(previous).kind === "text")
					previousText = previous;
			}
			if (previousText !== undefined) {
				target.tree.setData(
					previousText,
					target.tree.get(previousText).data + data,
				);
				lastText = { id: previousText, ...target };
			} else {
				const id = target.tree.createText(data);
				target.tree.insert(target.parent, id, target.before);
				lastText = { id, ...target };
			}
		};
		const merge = (id: number, attributes: Record<string, string>) => {
			for (const [name, value] of htmlAttributeEntries(attributes))
				if (!Object.hasOwn(tree.get(id).attributes, name))
					tree.setParserAttribute(id, name, value);
		};
		const push = (
			tag: string,
			attributes: Record<string, string> = {},
			foster = false,
		) => {
			const entry = insert(tag, attributes, foster);
			stack.push({ ...entry, tag });
			return entry;
		};
		const checkInput = () => {
			if (options.signal?.aborted)
				throw new AgentBrowserError("aborted", "HTML parsing aborted");
			if (tokenizer.workUnits > tree.limits.maxTextCodeUnits * 8)
				throw resourceLimitError(
					"html.work",
					tree.limits.maxTextCodeUnits * 8,
					tokenizer.workUnits,
					"HTML input work limit exceeded",
				);
		};
		const activeFormatting = new HtmlFormatting({
			stack: () => stack,
			insert: (tag, attributes, foster) => ({
				...insert(tag, attributes, foster),
				tag,
			}),
			place: (node, ancestor) => {
				const target = location(true, ancestor);
				if (target.tree !== node.tree)
					throw new AgentBrowserError(
						"unsupported",
						"Formatting repair cannot cross document owners",
					);
				target.tree.insert(target.parent, node.id, target.before);
				lastText = undefined;
			},
			issue,
			check: checkInput,
			maxWork: Math.min(1_600_000, tree.limits.maxNodes * 64),
			maxText: Math.min(16_000_000, tree.limits.maxTextCodeUnits * 8),
		});
		if (htmlFragment?.tagName === "template") activeFormatting.mark(current());
		const bodyScope = new HtmlScope({
			stack: () => stack,
			reset: () => {
				activeFormatting.sync();
				finishOptions();
				lastText = undefined;
			},
			issue,
			check: checkInput,
			maxWork: Math.min(1_600_000, tree.limits.maxNodes * 64),
		});
		const closeParagraph = () =>
			bodyScope.close(bodyScope.find("p", "button"), "p");
		const tables = new HtmlTables({
			stack: () => stack,
			template: templateScope,
			push: (tag, attributes) => {
				push(tag, attributes);
				if (["caption", "td", "th"].includes(tag))
					activeFormatting.mark(current());
			},
			insert: (tag, attributes) => {
				insert(tag, attributes);
			},
			form: (attributes) => {
				if (form !== undefined || inTemplate()) {
					issue("table-form-ignored");
					return;
				}
				form = insert("form", attributes).id;
			},
			emit: (data, foster, reconstruct) => {
				if (!data) return;
				if (reconstruct) activeFormatting.reconstruct(foster);
				text(data, foster);
			},
			reset: () => {
				activeFormatting.sync();
				lastText = undefined;
			},
			issue,
			check: checkInput,
			maxWork: Math.min(1_600_000, tree.limits.maxNodes * 64),
			maxText: tree.limits.maxTextCodeUnits,
		});
		const foreign = new HtmlForeign({
			stack: () => stack,
			context: fragment,
			insert: (name, attributes, namespaceURI) => ({
				...insert(name, attributes, false, namespaceURI),
				tag: name,
			}),
			text,
			issue,
			check: checkInput,
			maxWork: Math.min(1_600_000, tree.limits.maxNodes * 64),
		});
		const nextToken = () => {
			const token = tokenizer.next(
				elementNamespace(foreign.current()) !== htmlNamespace,
			);
			checkInput();
			if (token && ++tokens > tree.limits.maxNodes * 8)
				throw resourceLimitError(
					"html.tokens",
					tree.limits.maxNodes * 8,
					tokens,
					"HTML token limit exceeded",
				);
			return token;
		};
		if (
			htmlFragment &&
			(rawTags.has(htmlFragment.tagName) ||
				["title", "textarea", "plaintext"].includes(htmlFragment.tagName) ||
				(htmlFragment.tagName === "noscript" && scripting))
		) {
			const data = tokenizer.remainder();
			text(
				["title", "textarea"].includes(htmlFragment.tagName)
					? decodeHtmlEntities(data, false, issue)
					: data,
			);
			checkInput();
		}
		while (true) {
			finishOptions();
			let token = nextToken();
			while (!token && tokenizer.paused) {
				yield { kind: "pause", tree };
				token = nextToken();
			}
			if (!token) {
				tables.flush();
				if (mode === "head-noscript") issue("unclosed-head-noscript");
				while (templates.length && templateScope().index > 0) {
					checkInput();
					issue("unclosed-template");
					stack.length = templateScope().index;
					templates.pop();
					activeFormatting.sync();
				}
				if (mode === "body" && !inTemplate()) bodyScope.endOfFile();
				break;
			}
			tableFoster = false;
			lateHeadInsertion = false;
			if (token.kind !== "text") tables.flush();
			activeFormatting.sync();
			if (foreign.process(token)) {
				stripNewline = false;
				continue;
			}
			if (token.kind === "doctype") {
				if (!initial) {
					issue("misplaced-doctype");
					continue;
				}
				initial = false;
				if (
					token.name !== "html" ||
					token.publicId !== null ||
					(token.systemId !== null && token.systemId !== "about:legacy-compat")
				)
					issue("nonconforming-doctype");
				const doctype = tree.createDocumentType(
					token.name ?? "",
					token.publicId ?? "",
					token.systemId ?? "",
				);
				if (
					!tree
						.get(tree.root)
						.children.some((child) => tree.get(child).kind === "doctype")
				)
					tree.append(tree.root, doctype);
				setMode(doctypeMode(token));
				continue;
			}
			if (
				initial &&
				token.kind !== "comment" &&
				(token.kind !== "text" || /[^\t\n\f\r ]/.test(token.data))
			)
				missingDoctype();
			if (token.kind === "comment") {
				const target = location(false);
				const comment = target.tree.createComment(token.data);
				if (mode === "before-head") tree.append(scaffold.html, comment);
				else if (mode === "before") tree.append(tree.root, comment);
				else
					target.tree.append(
						mode === "after"
							? scaffold.html
							: mode === "after-after"
								? tree.root
								: target.parent,
						comment,
					);
				if (mode !== "after" && mode !== "after-after") lastText = undefined;
				continue;
			}
			if (token.kind === "text") {
				let data = token.data;
				if (stripNewline && data.startsWith("\n")) data = data.slice(1);
				stripNewline = false;
				if (!fragment && !inTemplate()) {
					if (mode === "before" || mode === "before-head") {
						data = data.replace(/^[\t\n\f\r ]+/, "");
						if (!data) continue;
						mode = inHead();
					}
					if (
						mode === "head" ||
						mode === "head-noscript" ||
						mode === "after-head"
					) {
						const leading = /^[\t\n\f\r ]*/.exec(data)?.[0] ?? "";
						text(leading, false, true);
						data = data.slice(leading.length);
						if (!data) continue;
						if (mode === "head-noscript") {
							issue("content-in-head-noscript");
							pop("noscript");
							mode = "head";
						}
						if (mode === "head") mode = afterHead();
						mode = inBody();
					}
				}
				if (
					(mode === "after" || mode === "after-after") &&
					/[^\t\n\f\r ]/.test(data)
				) {
					issue("content-after-body");
					mode = "body";
				}
				tables.characters(data);
				continue;
			}
			stripNewline = false;
			const { name, attributes } = token;
			if (
				(fragment || inTemplate()) &&
				["html", "head", "body"].includes(name)
			) {
				issue("ignored-fragment-document-tag");
				continue;
			}
			if (!fragment && !inTemplate()) {
				let ignored = false;
				for (let pass = 0; ; pass++) {
					checkInput();
					if (pass >= 8)
						throw new AgentBrowserError(
							"resource-limit",
							"HTML head reprocessing limit exceeded",
						);
					const start = token.kind === "start";
					if (mode === "before") {
						if (!start && !["head", "body", "html", "br"].includes(name)) {
							issue("ignored-head-tag");
							ignored = true;
							break;
						}
						mode = inHtml(start && name === "html" ? attributes : undefined);
						if (start && name === "html") {
							ignored = true;
							break;
						}
						continue;
					}
					if (start && name === "html") break;
					if (mode === "before-head") {
						if (!start && !["head", "body", "html", "br"].includes(name)) {
							issue("ignored-head-tag");
							ignored = true;
							break;
						}
						mode = inHead(start && name === "head" ? attributes : undefined);
						if (start && name === "head") {
							ignored = true;
							break;
						}
						continue;
					}
					if (mode === "head-noscript") {
						if (!start && name === "noscript") {
							pop("noscript");
							mode = "head";
							ignored = true;
							break;
						}
						if (
							start &&
							[
								"basefont",
								"bgsound",
								"link",
								"meta",
								"noframes",
								"style",
							].includes(name)
						)
							break;
						if (
							(!start && name !== "br") ||
							(start && ["head", "noscript"].includes(name))
						) {
							issue("ignored-head-tag");
							ignored = true;
							break;
						}
						issue("content-in-head-noscript");
						pop("noscript");
						mode = "head";
						continue;
					}
					if (mode === "head") {
						if (start && (headTags.has(name) || name === "noscript")) {
							if (name === "noscript" && !scripting) mode = "head-noscript";
							break;
						}
						if (!start && name === "head") {
							mode = afterHead();
							ignored = true;
							break;
						}
						if (!start && name === "template") break;
						if (
							(start && name === "head") ||
							(!start && !["body", "html", "br"].includes(name))
						) {
							issue("ignored-head-tag");
							ignored = true;
							break;
						}
						mode = afterHead();
						continue;
					}
					if (mode === "after-head") {
						if (start && headTags.has(name)) {
							issue("late-head-element");
							lateHeadInsertion = true;
							break;
						}
						if (!start && name === "template") break;
						if (
							(start && name === "head") ||
							(!start && !["body", "html", "br"].includes(name))
						) {
							issue("ignored-head-tag");
							ignored = true;
							break;
						}
						mode = inBody(start && name === "body" ? attributes : undefined);
						if (start && name === "body") {
							ignored = true;
							break;
						}
						continue;
					}
					break;
				}
				if (ignored) continue;
			}
			if (mode === "after" || mode === "after-after") {
				if (mode === "after" && token.kind === "end" && name === "html") {
					if (fragmentDocument) issue("ignored-fragment-document-tag");
					else mode = "after-after";
					continue;
				}
				if (!(token.kind === "start" && name === "html")) {
					issue("content-after-body");
					mode = "body";
				}
			}
			if (token.kind === "end" && (name === "body" || name === "html")) {
				if (!bodyScope.canEndBody()) issue("body-not-in-scope");
				else {
					mode = name === "html" && !fragmentDocument ? "after-after" : "after";
					if (name === "html" && fragmentDocument)
						issue("ignored-fragment-document-tag");
				}
				continue;
			}
			if (token.kind === "start" && ["frameset", "frame"].includes(name))
				throw new AgentBrowserError(
					"unsupported",
					`HTML ${name} tree construction is not implemented`,
				);
			if (name === "html") {
				if (token.kind === "start") merge(scaffold.html, attributes);
				continue;
			}
			if (name === "head") {
				issue("unexpected-head");
				continue;
			}
			if (name === "body") {
				merge(scaffold.body, attributes);
				continue;
			}
			if (name === "template") {
				if (token.kind === "start") {
					if (
						Object.hasOwn(attributes, "shadowrootmode") ||
						Object.hasOwn(attributes, "for")
					)
						issue("template-extensions-not-implemented");
					push("template", attributes);
					activeFormatting.mark(current());
					templates.push({ index: stack.length - 1, mode: "template" });
					if (token.selfClosing) issue("nonvoid-self-close-ignored");
				} else {
					const scope = templateScope();
					if (!scope || scope.index === 0) issue("unmatched-template-end");
					else {
						stack.length = scope.index;
						templates.pop();
						lastText = undefined;
					}
				}
				continue;
			}
			const scope = templateScope();
			if (
				scope?.mode === "template" &&
				(token.kind === "end" || !templateHeadTags.has(name))
			) {
				if (token.kind === "end") {
					issue("ignored-end-in-template");
					continue;
				}
				scope.mode = [
					"caption",
					"colgroup",
					"tbody",
					"tfoot",
					"thead",
				].includes(name)
					? "table"
					: name === "col"
						? "colgroup"
						: name === "tr"
							? "tbody"
							: name === "td" || name === "th"
								? "tr"
								: "body";
			}
			const tableAction = tables.tag(token);
			if (tableAction.handled) continue;
			tableFoster = tableAction.foster;
			if (token.kind === "end") {
				if (formatting.has(name)) {
					activeFormatting.end(name);
					lastText = undefined;
					continue;
				}
				if (name === "form") {
					if (inTemplate()) {
						if (!bodyScope.close(bodyScope.find("form")))
							issue("unmatched-end-tag");
					} else {
						const index = bodyScope.find("form");
						const node = index > 0 ? stack[index] : undefined;
						const matches = node?.tree === tree && node.id === form;
						form = undefined;
						if (matches) {
							bodyScope.imply();
							if (current() !== node) issue("misnested-body-end");
							stack.splice(index, 1);
						} else issue("unmatched-end-tag");
					}
					continue;
				}
				if (name === "br") {
					activeFormatting.reconstruct(true);
					insert("br", {}, true);
					issue("end-br-as-start");
					continue;
				}
				if (name === "p") {
					if (bodyScope.find("p", "button") < 0) {
						issue("unmatched-end-tag");
						push("p", {}, true);
					}
					closeParagraph();
					continue;
				}
				const heading = /^h[1-6]$/.test(name);
				const scoped =
					blocks.has(name) ||
					[
						"li",
						"dd",
						"dt",
						"button",
						"listing",
						"summary",
						"applet",
						"marquee",
						"object",
						"select",
					].includes(name);
				const closed = scoped
					? bodyScope.close(
							heading
								? bodyScope.findHeading()
								: bodyScope.find(name, name === "li" ? "list" : "normal"),
							["li", "dd", "dt"].includes(name) ? name : undefined,
							name,
						)
					: bodyScope.ordinaryEnd(name);
				if (!closed) issue("unmatched-end-tag");
				continue;
			}
			if (name === "select" || name === "input") {
				const index = bodyScope.find("select");
				if (htmlFragment?.tagName === "select") {
					issue(
						name === "select"
							? "nested-select"
							: "ignored-control-in-select-fragment",
					);
					continue;
				}
				if (index > 0) {
					stack.length = index;
					lastText = undefined;
					activeFormatting.sync();
					issue(
						name === "select" ? "nested-select" : "select-closed-by-control",
					);
					if (name === "select") continue;
				}
			}
			if (name === "form" && form !== undefined && !inTemplate()) {
				issue("nested-form-ignored");
				continue;
			}
			if (
				(blocks.has(name) ||
					["listing", "summary", "xmp", "plaintext"].includes(name)) &&
				(name !== "table" || documentMode(tree) !== "quirks")
			)
				closeParagraph();
			if (name === "li" || name === "dd" || name === "dt") {
				bodyScope.startList(name);
				closeParagraph();
			}
			if (
				stack.length > 1 &&
				/^h[1-6]$/.test(name) &&
				isHtmlParserNode(current()) &&
				/^h[1-6]$/.test(current().tag)
			)
				stack.pop();
			if (name === "button" && bodyScope.close(bodyScope.find(name)))
				issue("nested-interactive-or-formatting");
			if (
				["rb", "rtc", "rp", "rt"].includes(name) &&
				bodyScope.find("ruby") > 0
			) {
				const annotation = name === "rp" || name === "rt";
				bodyScope.imply(annotation ? "rtc" : undefined);
				if (
					!isHtmlParserNode(current(), "ruby") &&
					!(annotation && isHtmlParserNode(current(), "rtc"))
				)
					issue("misnested-ruby-start");
			}
			if (["option", "optgroup", "hr"].includes(name)) {
				if (bodyScope.find("select") > 0) {
					bodyScope.imply(name === "option" ? "optgroup" : undefined);
					if (
						bodyScope.find("option") > 0 ||
						(name !== "option" && bodyScope.find("optgroup") > 0)
					)
						issue(`misnested-${name}-in-select`);
				} else if (
					name !== "hr" &&
					isHtmlParserNode(current(), "option") &&
					stack.length > 1
				)
					stack.pop();
			}
			activeFormatting.sync();
			if (name === "a") {
				const previous = activeFormatting.find("a");
				if (previous) {
					issue("nested-interactive-or-formatting");
					activeFormatting.end("a");
					activeFormatting.remove(previous);
					stack = stack.filter((entry) => entry !== previous);
				}
			}
			if (
				!blocks.has(name) &&
				!headTags.has(name) &&
				![
					"li",
					"dd",
					"dt",
					"caption",
					"colgroup",
					"col",
					"tbody",
					"thead",
					"tfoot",
					"tr",
					"td",
					"th",
					"textarea",
					"iframe",
					"noembed",
					"noframes",
					"plaintext",
					"listing",
					"summary",
					"rb",
					"rtc",
					"rp",
					"rt",
				].includes(name) &&
				!(name === "noscript" && scripting)
			)
				activeFormatting.reconstruct(true);
			if (name === "nobr") {
				const previous = activeFormatting.find("nobr");
				if (previous && activeFormatting.inScope(previous)) {
					issue("nested-interactive-or-formatting");
					activeFormatting.end("nobr");
					activeFormatting.reconstruct(true);
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
			if (name === "svg" || name === "math") {
				const namespaceURI = name === "svg" ? svgNamespace : mathmlNamespace;
				const entry = insert(
					name,
					foreignAttributes(attributes, namespaceURI, issue),
					foster,
					namespaceURI,
				);
				if (!token.selfClosing) stack.push({ ...entry, tag: name });
				continue;
			}
			const entry = insert(name, attributes, foster);
			const { id } = entry;
			if (
				scripting &&
				!fragment &&
				!inTemplate() &&
				name === "meta" &&
				attributes["http-equiv"]?.trim().toLowerCase() ===
					"content-security-policy"
			)
				yield { kind: "policy", tree, id };
			if (name === "form" && !inTemplate()) form = id;
			if (voidTags.has(name) || ["basefont", "bgsound"].includes(name))
				continue;
			if (token.selfClosing) issue("nonvoid-self-close-ignored");
			stack.push({ ...entry, tag: name });
			if (name === "option")
				openOptions.set(id, { node: current(), index: stack.length - 1 });
			if (formatting.has(name)) activeFormatting.add(current(), attributes);
			if (["applet", "marquee", "object", "caption", "td", "th"].includes(name))
				activeFormatting.mark(current());
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
				let closing = nextToken();
				while (!closing && tokenizer.paused) {
					yield { kind: "pause", tree };
					closing = nextToken();
				}
				if (!closing) issue("eof-in-text");
				pop(name);
				if (name === "script") {
					if (scripting && closing && !fragment && !inTemplate())
						yield { kind: "script", tree, id };
					else if (scripting && !fragment && !inTemplate())
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
		finishOptions(true);
		if (initial) missingDoctype();
		if (!scaffold.hasBody) scaffold.startBody();
		setHtmlParseInfo(tree, {
			parser: "independent-html-subset",
			partial: true,
			scripting,
			mode: documentMode(tree),
			issues,
		});
		return tree;
	} catch (error) {
		tree.close();
		throw error;
	}
}
