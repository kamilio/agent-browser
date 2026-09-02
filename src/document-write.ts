import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { HtmlScriptContext } from "./html-parser.js";

const writers = new WeakMap<DocumentTree, HtmlScriptContext>();

export async function withDocumentWrite<Result>(
	tree: DocumentTree,
	context: HtmlScriptContext | undefined,
	execute: () => Promise<Result>,
): Promise<Result> {
	if (!context) return execute();
	tree.get(tree.root);
	if (writers.has(tree))
		throw new AgentBrowserError(
			"unsupported",
			"Nested parser writer ownership is not supported",
		);
	writers.set(tree, context);
	const unsubscribe = tree.onClose(() => writers.delete(tree));
	try {
		return await execute();
	} finally {
		writers.delete(tree);
		unsubscribe();
	}
}

export function writeDocument(tree: DocumentTree, text: string) {
	tree.get(tree.root);
	const writer = writers.get(tree);
	if (!writer)
		throw new AgentBrowserError(
			"unsupported",
			"Document writes outside a blocking parser script are not implemented",
		);
	writer.write(text);
}
