export type ErrorCode =
	| "invalid-input"
	| "stale-reference"
	| "not-found"
	| "not-actionable"
	| "policy-denied"
	| "resource-limit"
	| "unsupported"
	| "network-error"
	| "timeout"
	| "aborted"
	| "closed";

export class AgentBrowserError extends Error {
	readonly code: ErrorCode;

	constructor(code: ErrorCode, message: string) {
		super(message);
		this.name = "AgentBrowserError";
		this.code = code;
	}
}
