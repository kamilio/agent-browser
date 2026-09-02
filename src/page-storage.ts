import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { StorageArea } from "./storage.js";

export interface PageStoragePort {
	area(kind: "local" | "session"): StorageArea;
	readCookie(): string;
	writeCookie(value: string): void;
}

const ports = new WeakMap<DocumentTree, PageStoragePort>();

export function bindPageStorage(tree: DocumentTree, port: PageStoragePort) {
	if (ports.has(tree))
		throw new AgentBrowserError(
			"invalid-input",
			"Document storage port already exists",
		);
	tree.onClose(() => ports.delete(tree));
	ports.set(tree, port);
}

export function pageStoragePort(tree: DocumentTree) {
	return ports.get(tree);
}
