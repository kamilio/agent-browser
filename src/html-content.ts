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
	let ancestor = target;
	let hasFormAncestor = false;
	while (true) {
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
		{ tagName: target.tagName, hasFormAncestor, scripting: true },
		{ limits: tree.limits, signal: options.signal },
	);
	try {
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "HTML replacement aborted");
		tree.replaceChildrenFrom(id, parsed.tree, parsed.fragment);
	} finally {
		parsed.tree.close();
	}
}
