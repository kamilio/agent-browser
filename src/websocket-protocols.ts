import { AgentBrowserError } from "./errors.js";

export function validateWebSocketProtocols(
	input?: readonly string[],
): readonly string[] {
	if (input === undefined) return Object.freeze([]);
	if (!Array.isArray(input) || input.length > 32)
		throw new AgentBrowserError(
			"invalid-input",
			"WebSocket protocols must be an array of at most 32 tokens",
		);
	const protocols: string[] = [];
	const seen = new Set<string>();
	for (const protocol of input) {
		if (
			typeof protocol !== "string" ||
			protocol.length === 0 ||
			protocol.length > 256 ||
			/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/.test(protocol) ||
			seen.has(protocol)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"WebSocket protocols must be distinct ASCII HTTP tokens of at most 256 characters",
			);
		seen.add(protocol);
		protocols.push(protocol);
	}
	return Object.freeze(protocols);
}
