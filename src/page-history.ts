import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { HistoryValue } from "./history.js";

export interface PageHistoryPort {
	snapshot(): { state: HistoryValue; length: number };
	pushState(state: HistoryValue, url?: string | null): void;
	replaceState(state: HistoryValue, url?: string | null): void;
	traverse(delta: number): void;
	navigate(url: string, replace: boolean): void;
}
const ports = new WeakMap<DocumentTree, PageHistoryPort>();

export function bindPageHistory(tree: DocumentTree, port: PageHistoryPort) {
	if (ports.has(tree))
		throw new AgentBrowserError(
			"invalid-input",
			"Document history port already exists",
		);
	tree.onClose(() => ports.delete(tree));
	ports.set(tree, port);
}

export function pageHistoryPort(tree: DocumentTree) {
	return ports.get(tree);
}
