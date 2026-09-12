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

interface HtmlInformation {
	scripting: boolean;
	parsed?: Readonly<HtmlParseInfo>;
}

const information = new WeakMap<DocumentTree, HtmlInformation>();

function retainInformation(tree: DocumentTree, state: HtmlInformation) {
	if (!information.has(tree)) tree.onClose(() => information.delete(tree));
	information.set(tree, state);
}

export function initializeHtmlScripting(
	tree: DocumentTree,
	scripting: boolean,
) {
	retainInformation(tree, { scripting });
}

export function htmlScriptingEnabled(tree: DocumentTree) {
	return information.get(tree)?.scripting ?? false;
}

export function htmlParseInfo(tree: DocumentTree) {
	return information.get(tree)?.parsed;
}

export function setHtmlParseInfo(tree: DocumentTree, info: HtmlParseInfo) {
	const scriptingChanged = htmlScriptingEnabled(tree) !== info.scripting;
	retainInformation(tree, {
		scripting: info.scripting,
		parsed: Object.freeze({
			...info,
			issues: Object.freeze({ ...info.issues }),
		}),
	});
	if (scriptingChanged) tree.invalidatePresentation();
}
