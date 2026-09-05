import {
	type BrowserIdentity,
	browserIdentityHeaders,
	defaultBrowserIdentity,
} from "./browser-identity.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

const identities = new WeakMap<DocumentTree, Readonly<BrowserIdentity>>();

export function bindDocumentIdentity(
	document: DocumentTree,
	identity: Readonly<BrowserIdentity>,
): void {
	if (document.mutationMetrics().closed)
		throw new AgentBrowserError("closed", "Identity document is closed");
	browserIdentityHeaders(identity);
	const existing = identities.get(document);
	if (existing !== undefined) {
		if (existing !== identity)
			throw new AgentBrowserError(
				"invalid-input",
				"Document identity cannot be replaced",
			);
		return;
	}
	document.onClose(() => identities.delete(document));
	identities.set(document, identity);
}

export function documentIdentity(
	document: DocumentTree,
): Readonly<BrowserIdentity> {
	if (document.mutationMetrics().closed)
		throw new AgentBrowserError("closed", "Identity document is closed");
	const identity = identities.get(document) ?? defaultBrowserIdentity;
	bindDocumentIdentity(document, identity);
	return identity;
}
