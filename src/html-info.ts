import type { DocumentTree } from "./document.js";
import type { DocumentMode } from "./document-mode.js";

export interface HtmlParseInfo {
	parser: "independent-html-subset";
	partial: true;
	scripting: boolean;
	encoding?: string;
	mode?: DocumentMode;
	issues: Readonly<Record<string, number>>;
}

const information = new WeakMap<DocumentTree, Readonly<HtmlParseInfo>>();

export function htmlParseInfo(tree: DocumentTree) {
	return information.get(tree);
}

export function setHtmlParseInfo(tree: DocumentTree, info: HtmlParseInfo) {
	if (!information.has(tree)) tree.onClose(() => information.delete(tree));
	information.set(
		tree,
		Object.freeze({ ...info, issues: Object.freeze({ ...info.issues }) }),
	);
}
