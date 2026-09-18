import type { DocumentTree } from "./document.js";
import {
	DocumentWebSockets,
	type DocumentWebSocketLimits,
	type DocumentWebSocketOptions,
} from "./document-websockets.js";
import { AgentBrowserError } from "./errors.js";
import type { WebSocketTransport } from "./websocket-transport.js";

interface Owner {
	transport: WebSocketTransport;
	options: {
		headerValues: readonly string[];
		limits: Readonly<Partial<DocumentWebSocketLimits>>;
	};
	sockets: DocumentWebSockets;
}

const owners = new WeakMap<DocumentTree, Owner>();

export function existingDocumentWebSockets(
	tree: DocumentTree,
): DocumentWebSockets | undefined {
	return owners.get(tree)?.sockets;
}

export function bindDocumentWebSockets(
	tree: DocumentTree,
	transport: WebSocketTransport,
	options: DocumentWebSocketOptions = {},
): DocumentWebSockets {
	if (!options || typeof options !== "object" || Array.isArray(options))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid document WebSocket options",
		);
	const headers =
		options.headerValues === undefined ? [] : options.headerValues;
	if (!Array.isArray(headers))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid document WebSocket headers",
		);
	const limits = options.limits === undefined ? {} : options.limits;
	if (!limits || typeof limits !== "object" || Array.isArray(limits))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid document WebSocket limits",
		);
	const snapshot: Owner["options"] = Object.freeze({
		headerValues: Object.freeze([...headers]),
		limits: Object.freeze({ ...limits }),
	});
	const existing = owners.get(tree);
	if (existing) {
		if (
			existing.transport !== transport ||
			existing.options.headerValues?.length !== headers.length ||
			existing.options.headerValues.some(
				(value, index) => value !== headers[index],
			) ||
			Object.keys(existing.options.limits ?? {}).length !==
				Object.keys(limits).length ||
			Object.entries(existing.options.limits ?? {}).some(
				([key, value]) => value !== limits[key as keyof typeof limits],
			)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Document WebSocket owner is already configured",
			);
		return existing.sockets;
	}
	const sockets = new DocumentWebSockets(tree, transport, snapshot);
	try {
		tree.onClose(() => owners.delete(tree));
	} catch (error) {
		sockets.close();
		throw error;
	}
	owners.set(tree, { transport, options: snapshot, sockets });
	return sockets;
}
