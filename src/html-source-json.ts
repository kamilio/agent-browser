import { AgentBrowserError } from "./errors.js";
import {
	HtmlTokenCursor,
	type HtmlDiscardRawName,
	type HtmlRawDiscardStep,
} from "./html-token-cursor.js";
import {
	type JsonSourceSelection,
	selectJsonSource,
	validateJsonSourcePointer,
} from "./json-source-selection.js";
import { utf8ByteLength } from "./utf8-byte-length.js";

export const htmlSourceJsonLimits = Object.freeze({
	maxSourceCodeUnits: 2_000_000,
	maxScriptCodeUnits: 524_288,
	maxOutputBytes: 65_536,
	maxScriptIdCodeUnits: 256,
	maxTokens: 100_000,
});

export interface HtmlJsonSourceSelection {
	readonly scriptId: string;
	readonly pointer: string;
}

export interface HtmlJsonSourceMetadata {
	readonly kind: "html-json-script-source-v1";
	readonly scope: "lexical-html-source";
	readonly scriptingMode: "disabled";
	readonly rendered: false;
	readonly verified: false;
	readonly scriptId: string;
	readonly pointer: string;
	readonly scriptStart: number;
	readonly start: number;
	readonly end: number;
	readonly sourceCodeUnits: number;
	readonly offsetBasis: "decoder-output-utf16";
	readonly json: Readonly<JsonSourceSelection>;
	readonly counters: Readonly<{
		tokens: number;
		operations: number;
		workUnits: number;
		issues: number;
	}>;
}

function invalid(message = "Invalid HTML JSON source selection"): never {
	throw new AgentBrowserError("invalid-input", message);
}

function resourceLimit(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

export function validateHtmlJsonSourceSelection(
	value: unknown,
): Readonly<HtmlJsonSourceSelection> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		invalid();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) invalid();
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const keys = Reflect.ownKeys(descriptors);
	if (
		keys.length !== 2 ||
		!keys.every((key) => key === "scriptId" || key === "pointer") ||
		!Object.hasOwn(descriptors.scriptId ?? {}, "value") ||
		!Object.hasOwn(descriptors.pointer ?? {}, "value")
	)
		invalid();
	const scriptId: unknown = descriptors.scriptId.value;
	const pointer: unknown = descriptors.pointer.value;
	if (
		typeof scriptId !== "string" ||
		scriptId.length === 0 ||
		scriptId.length > htmlSourceJsonLimits.maxScriptIdCodeUnits ||
		/[\s\p{Cc}\p{Cf}]/u.test(scriptId)
	)
		invalid();
	return Object.freeze({
		scriptId,
		pointer: validateJsonSourcePointer(pointer),
	});
}

function discardName(name: string): name is HtmlDiscardRawName {
	return (
		name === "script" ||
		name === "style" ||
		name === "xmp" ||
		name === "iframe" ||
		name === "noembed" ||
		name === "noframes"
	);
}

export function selectHtmlJsonSource(
	source: string,
	selection: HtmlJsonSourceSelection,
	checkpoint?: () => void,
): Readonly<{ text: string; metadata: HtmlJsonSourceMetadata }> {
	if (typeof source !== "string") invalid();
	if (checkpoint !== undefined && typeof checkpoint !== "function") invalid();
	const selected = validateHtmlJsonSourceSelection(selection);
	checkpoint?.();
	if (source.length > htmlSourceJsonLimits.maxSourceCodeUnits)
		resourceLimit("HTML JSON source limit exceeded");
	let duplicateAttribute = false;
	const cursor = new HtmlTokenCursor(
		source,
		(issue) => {
			if (issue === "duplicate-attribute") duplicateAttribute = true;
		},
		{
			maxSourceCodeUnits: htmlSourceJsonLimits.maxSourceCodeUnits,
			maxWorkUnits: 16_000_000,
			timeoutMs: 10_000,
		},
	);
	let candidate:
		| { scriptStart: number; start: number; end: number }
		| undefined;
	let tokens = 0;
	function chargeToken() {
		if (++tokens > htmlSourceJsonLimits.maxTokens)
			resourceLimit("HTML JSON token limit exceeded");
	}
	try {
		while (true) {
			checkpoint?.();
			duplicateAttribute = false;
			const tokenStart = cursor.position;
			const token = cursor.next();
			if (!token) break;
			chargeToken();
			if (token.kind !== "start") continue;
			const matches = token.attributes.id === selected.scriptId;
			if (matches) {
				if (candidate !== undefined)
					invalid("Ambiguous HTML JSON script identity");
				if (
					token.name !== "script" ||
					duplicateAttribute ||
					token.selfClosing ||
					Object.hasOwn(token.attributes, "src") ||
					token.attributes.type?.trim().toLowerCase() !== "application/json"
				)
					invalid("Selection is not a closed inline JSON script");
			}
			if (discardName(token.name)) {
				const start = cursor.position;
				let step: Readonly<HtmlRawDiscardStep>;
				do {
					checkpoint?.();
					step = cursor.discardRawStep(token.name);
					if (
						matches &&
						cursor.position - start > htmlSourceJsonLimits.maxScriptCodeUnits
					)
						resourceLimit("HTML JSON script limit exceeded");
				} while (step.status === "more");
				if (matches) {
					if (step.status !== "end-tag")
						invalid("Unterminated HTML JSON script");
					const end = cursor.position;
					const closing = cursor.next();
					if (closing?.kind !== "end" || closing.name !== "script")
						invalid("Unterminated HTML JSON script");
					chargeToken();
					candidate = { scriptStart: tokenStart, start, end };
				}
			} else if (token.name === "title" || token.name === "textarea") {
				cursor.raw(token.name, true);
			} else if (token.name === "plaintext") {
				break;
			}
		}
		checkpoint?.();
		if (!candidate)
			throw new AgentBrowserError("not-found", "HTML JSON script not found");
		const json = selectJsonSource(
			source.slice(candidate.start, candidate.end),
			selected.pointer,
			checkpoint,
		);
		const bytes = utf8ByteLength(json.text);
		if (bytes > htmlSourceJsonLimits.maxOutputBytes)
			resourceLimit("HTML JSON output limit exceeded");
		checkpoint?.();
		return Object.freeze({
			text: json.text,
			metadata: Object.freeze({
				kind: "html-json-script-source-v1",
				scope: "lexical-html-source",
				scriptingMode: "disabled",
				rendered: false,
				verified: false,
				...selected,
				...candidate,
				sourceCodeUnits: source.length,
				offsetBasis: "decoder-output-utf16",
				json: json.metadata,
				counters: Object.freeze({
					tokens,
					operations: cursor.operations,
					workUnits: cursor.workUnits,
					issues: cursor.issueCount,
				}),
			}),
		});
	} finally {
		cursor.close();
	}
}
