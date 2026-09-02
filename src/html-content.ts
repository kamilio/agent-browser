import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { type HtmlParseOptions, parseHtmlFragment } from "./html-parser.js";

export function setInnerHtml(
	tree: DocumentTree,
	id: number,
	source: string,
	options: Pick<HtmlParseOptions, "signal"> = {},
) {
	const target = tree.get(id);
	if (target.kind !== "element")
		throw new AgentBrowserError(
			"invalid-input",
			"HTML replacement requires an element",
		);
	withFragment(tree, id, source, options, (sourceTree, fragment) => {
		tree.replaceChildrenFrom(id, sourceTree, fragment);
	});
}

export function setOuterHtml(
	tree: DocumentTree,
	id: number,
	source: string,
	options: Pick<HtmlParseOptions, "signal"> = {},
) {
	const target = tree.get(id);
	if (target.kind !== "element")
		throw new AgentBrowserError(
			"invalid-input",
			"HTML replacement requires an element",
		);
	const parent = target.parent;
	if (parent === null) return;
	if (tree.get(parent).kind === "document")
		throw new AgentBrowserError(
			"invalid-input",
			"Cannot replace a document root using outerHTML",
		);
	withFragment(tree, parent, source, options, (sourceTree, fragment) => {
		tree.replaceChildFrom(parent, sourceTree, fragment, id);
	});
}

export function insertAdjacentHtml(
	tree: DocumentTree,
	id: number,
	position: string,
	source: string,
	options: Pick<HtmlParseOptions, "signal"> = {},
) {
	const target = tree.get(id);
	if (target.kind !== "element")
		throw new AgentBrowserError(
			"invalid-input",
			"Adjacent HTML requires an element",
		);
	if (typeof position !== "string" || position.length > 11)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid adjacent HTML position",
		);
	const where = position.toLowerCase();
	let parent: number;
	let before: number | undefined;
	if (where === "beforebegin" || where === "afterend") {
		if (target.parent === null || tree.get(target.parent).kind === "document")
			throw new AgentBrowserError(
				"invalid-input",
				"Adjacent HTML requires an element or fragment parent",
			);
		parent = target.parent;
		const siblings = tree.get(parent).children;
		before = where === "beforebegin" ? id : siblings[siblings.indexOf(id) + 1];
	} else if (where === "afterbegin" || where === "beforeend") {
		parent = id;
		before = where === "afterbegin" ? target.children[0] : undefined;
	} else
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid adjacent HTML position",
		);
	withFragment(
		tree,
		parent,
		source,
		options,
		(sourceTree, fragment) => {
			tree.insertChildrenFrom(parent, sourceTree, fragment, before);
		},
		true,
	);
}

function withFragment(
	tree: DocumentTree,
	context: number,
	source: string,
	options: Pick<HtmlParseOptions, "signal">,
	commit: (sourceTree: DocumentTree, fragment: number) => void,
	bodyForHtml = false,
) {
	const target = tree.get(context);
	const syntheticBody =
		target.kind !== "element" || (bodyForHtml && target.tagName === "html");
	let ancestor = syntheticBody ? null : target;
	let hasFormAncestor = false;
	while (ancestor) {
		if (ancestor.tagName === "form") {
			hasFormAncestor = true;
			break;
		}
		if (ancestor.parent === null) break;
		ancestor = tree.get(ancestor.parent);
	}
	const parsed = parseHtmlFragment(
		source,
		tree.url,
		{
			tagName: syntheticBody ? "body" : target.tagName,
			hasFormAncestor,
			scripting: true,
		},
		{ limits: tree.limits, signal: options.signal },
	);
	try {
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "HTML replacement aborted");
		commit(parsed.tree, parsed.fragment);
	} finally {
		parsed.tree.close();
	}
}
