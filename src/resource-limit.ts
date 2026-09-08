import { AgentBrowserError } from "./errors.js";

const units = Object.freeze({
	"network.response-encoded": "bytes",
	"network.response-decoded": "bytes",
	"network.session-encoded": "bytes",
	"network.session-decoded": "bytes",
	"reader.source": "code-units",
	"reader.text": "code-units",
	"reader.output": "code-units",
	"reader.tokens": "tokens",
	"reader.depth": "levels",
	"reader.encoded": "bytes",
	"reader.decoded": "code-units",
	"text.encoded": "bytes",
	"text.decoded": "code-units",
	"html.encoded": "bytes",
	"html.source": "code-units",
	"html.work": "code-units",
	"html.tokens": "tokens",
	"html.attributes": "attributes",
	"html.issues": "issues",
	"html.reprocessing": "passes",
	"html.writes": "writes",
	"html.write-source": "code-units",
	"html.cursor-source": "code-units",
	"html.cursor-window": "code-units",
	"html.cursor-work": "code-units",
	"html.cursor-operations": "operations",
	"source.input": "bytes",
	"source.decoded": "code-units",
	"source.headings-work": "code-units",
	"source.headings-depth": "levels",
	"source.heading-extent": "code-units",
	"source.headings-output": "bytes",
	"source.section-work": "code-units",
	"source.section-headings": "headings",
	"source.section-extent": "code-units",
	"source.section-blocks": "blocks",
	"source.section-block-text": "code-units",
	"source.section-text": "code-units",
	"source.section-output": "bytes",
	"document.nodes": "nodes",
	"document.text": "code-units",
	"document.depth": "levels",
} as const);

export type ResourceLimitKind = keyof typeof units;

export interface ResourceLimitDiagnostic {
	readonly kind: ResourceLimitKind;
	readonly unit: (typeof units)[ResourceLimitKind];
	readonly limit: number;
	readonly observed: number;
}

const diagnostics = new WeakMap<object, Readonly<ResourceLimitDiagnostic>>();

export function resourceLimitError(
	kind: ResourceLimitKind,
	limit: number,
	observed: number,
	message: string,
): AgentBrowserError {
	const error = new AgentBrowserError("resource-limit", message);
	if (
		typeof kind === "string" &&
		Object.hasOwn(units, kind) &&
		Number.isSafeInteger(limit) &&
		limit >= 0 &&
		Number.isSafeInteger(observed) &&
		observed > limit
	)
		diagnostics.set(
			error,
			Object.freeze({ kind, unit: units[kind], limit, observed }),
		);
	return error;
}

export function resourceLimitDiagnostic(
	error: unknown,
): Readonly<ResourceLimitDiagnostic> | undefined {
	if (
		error === null ||
		(typeof error !== "object" && typeof error !== "function")
	)
		return undefined;
	return diagnostics.get(error);
}
