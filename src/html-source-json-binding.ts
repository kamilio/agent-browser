import { AgentBrowserError } from "./errors.js";
import { htmlSourceJsonLimits } from "./html-source-json.js";
import {
	HtmlTokenCursor,
	type HtmlDiscardRawName,
	type HtmlRawDiscardStep,
} from "./html-token-cursor.js";
import {
	type JsonSourceSelection,
	jsonSourceSelectionLimits,
	selectJsonSource,
	validateJsonSourcePointer,
} from "./json-source-selection.js";
import { utf8ByteLength } from "./utf8-byte-length.js";

export const htmlSourceJsonBindingLimits = Object.freeze({
	...htmlSourceJsonLimits,
	maxBindingCodeUnits: 256,
});

export interface HtmlJsonBindingSourceSelection {
	readonly scriptId: string;
	readonly binding: string;
	readonly pointer: string;
}

interface SourceSpan {
	readonly start: number;
	readonly end: number;
	readonly offsetBasis: "decoder-output-utf16";
}

export interface HtmlJsonBindingSourceMetadata {
	readonly kind: "html-json-binding-source-v1";
	readonly scope: "lexical-html-source";
	readonly valueBasis: "initial-const-json-literal";
	readonly scriptingMode: "disabled";
	readonly rendered: false;
	readonly verified: false;
	readonly scriptId: string;
	readonly binding: string;
	readonly pointer: string;
	readonly scriptStart: number;
	readonly start: number;
	readonly end: number;
	readonly sourceCodeUnits: number;
	readonly offsetBasis: "decoder-output-utf16";
	readonly literal: Readonly<SourceSpan>;
	readonly json: Readonly<JsonSourceSelection>;
	readonly jsonOffsetBasis: "literal-relative-utf16";
	readonly trailingSource: Readonly<SourceSpan & { evaluated: false }>;
	readonly counters: Readonly<{
		tokens: number;
		operations: number;
		workUnits: number;
		issues: number;
	}>;
}

function invalid(
	message = "Invalid HTML JSON binding source selection",
): never {
	throw new AgentBrowserError("invalid-input", message);
}

function resourceLimit(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

const restrictedBindings = new Set([
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"enum",
	"export",
	"extends",
	"false",
	"finally",
	"for",
	"function",
	"if",
	"import",
	"in",
	"instanceof",
	"new",
	"null",
	"return",
	"super",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",
	"let",
	"yield",
	"await",
	"implements",
	"interface",
	"package",
	"private",
	"protected",
	"public",
	"static",
	"eval",
	"arguments",
]);

export function validateHtmlJsonBindingSourceSelection(
	value: unknown,
): Readonly<HtmlJsonBindingSourceSelection> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		invalid();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) invalid();
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const keys = Reflect.ownKeys(descriptors);
	if (
		keys.length !== 3 ||
		!keys.every(
			(key) => key === "scriptId" || key === "binding" || key === "pointer",
		) ||
		!Object.hasOwn(descriptors.scriptId ?? {}, "value") ||
		!Object.hasOwn(descriptors.binding ?? {}, "value") ||
		!Object.hasOwn(descriptors.pointer ?? {}, "value")
	)
		invalid();
	const scriptId: unknown = descriptors.scriptId.value;
	const binding: unknown = descriptors.binding.value;
	const pointer: unknown = descriptors.pointer.value;
	if (
		typeof scriptId !== "string" ||
		scriptId.length === 0 ||
		scriptId.length > htmlSourceJsonBindingLimits.maxScriptIdCodeUnits ||
		/[\s\p{Cc}\p{Cf}]/u.test(scriptId) ||
		typeof binding !== "string" ||
		binding.length > htmlSourceJsonBindingLimits.maxBindingCodeUnits ||
		!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(binding) ||
		restrictedBindings.has(binding)
	)
		invalid();
	return Object.freeze({
		scriptId,
		binding,
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

function whitespace(character: string | undefined): boolean {
	return (
		character === " " ||
		character === "\t" ||
		character === "\r" ||
		character === "\n"
	);
}

function bindingLiteral(
	source: string,
	start: number,
	end: number,
	binding: string,
	checkpoint?: () => void,
): { start: number; end: number; trailingStart: number } {
	let position = start;
	let nextCheckpoint = start;
	function scanCheckpoint() {
		if (position >= nextCheckpoint) {
			checkpoint?.();
			nextCheckpoint = position + 1024;
		}
	}
	function skipWhitespace() {
		while (position < end && whitespace(source[position])) {
			scanCheckpoint();
			position++;
		}
	}
	skipWhitespace();
	if (
		position + 5 >= end ||
		!source.startsWith("const", position) ||
		!whitespace(source[position + 5])
	)
		invalid("Expected an initial const JSON binding");
	position += 5;
	skipWhitespace();
	if (position + binding.length >= end || !source.startsWith(binding, position))
		invalid("Initial JSON binding does not match");
	position += binding.length;
	skipWhitespace();
	if (position >= end || source[position++] !== "=")
		invalid("Expected a JSON binding initializer");
	skipWhitespace();
	const literalStart = position;
	if (position >= end || (source[position] !== "{" && source[position] !== "["))
		invalid("JSON binding initializer must be an object or array");
	const closing: string[] = [];
	let inString = false;
	let escaped = false;
	while (position < end) {
		scanCheckpoint();
		const character = source[position++];
		if (inString) {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') inString = true;
		else if (character === "{" || character === "[") {
			closing.push(character === "{" ? "}" : "]");
			if (closing.length > jsonSourceSelectionLimits.maxDepth + 1)
				resourceLimit("JSON binding depth limit exceeded");
		} else if (character === "}" || character === "]") {
			if (closing.pop() !== character) invalid("Unbalanced JSON binding");
			if (closing.length === 0) {
				const literalEnd = position;
				skipWhitespace();
				if (position >= end || source[position++] !== ";")
					invalid("JSON binding must end with a semicolon");
				checkpoint?.();
				return {
					start: literalStart,
					end: literalEnd,
					trailingStart: position,
				};
			}
		}
	}
	invalid("Unterminated JSON binding literal");
}

export function selectHtmlJsonBindingSource(
	source: string,
	selection: HtmlJsonBindingSourceSelection,
	checkpoint?: () => void,
): Readonly<{ text: string; metadata: HtmlJsonBindingSourceMetadata }> {
	if (typeof source !== "string") invalid();
	if (checkpoint !== undefined && typeof checkpoint !== "function") invalid();
	const selected = validateHtmlJsonBindingSourceSelection(selection);
	checkpoint?.();
	if (source.length > htmlSourceJsonBindingLimits.maxSourceCodeUnits)
		resourceLimit("HTML JSON binding source limit exceeded");
	let duplicateAttribute = false;
	const cursor = new HtmlTokenCursor(
		source,
		(issue) => {
			if (issue === "duplicate-attribute") duplicateAttribute = true;
		},
		{
			maxSourceCodeUnits: htmlSourceJsonBindingLimits.maxSourceCodeUnits,
			maxWorkUnits: 16_000_000,
			timeoutMs: 10_000,
		},
	);
	let candidate:
		| { scriptStart: number; start: number; end: number }
		| undefined;
	let tokens = 0;
	function chargeToken() {
		if (++tokens > htmlSourceJsonBindingLimits.maxTokens)
			resourceLimit("HTML JSON binding token limit exceeded");
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
					invalid("Ambiguous HTML JSON binding script identity");
				const type = token.attributes.type?.trim().toLowerCase();
				if (
					token.name !== "script" ||
					duplicateAttribute ||
					token.selfClosing ||
					Object.hasOwn(token.attributes, "src") ||
					(type !== undefined &&
						type !== "text/javascript" &&
						type !== "application/javascript")
				)
					invalid("Selection is not a closed inline classic script");
			}
			if (discardName(token.name)) {
				const start = cursor.position;
				let step: Readonly<HtmlRawDiscardStep>;
				do {
					checkpoint?.();
					step = cursor.discardRawStep(token.name);
					if (
						matches &&
						cursor.position - start >
							htmlSourceJsonBindingLimits.maxScriptCodeUnits
					)
						resourceLimit("HTML JSON binding script limit exceeded");
				} while (step.status === "more");
				if (matches) {
					if (step.status !== "end-tag")
						invalid("Unterminated HTML JSON binding script");
					const end = cursor.position;
					const closing = cursor.next();
					if (closing?.kind !== "end" || closing.name !== "script")
						invalid("Unterminated HTML JSON binding script");
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
			throw new AgentBrowserError(
				"not-found",
				"HTML JSON binding script not found",
			);
		const literal = bindingLiteral(
			source,
			candidate.start,
			candidate.end,
			selected.binding,
			checkpoint,
		);
		const json = selectJsonSource(
			source.slice(literal.start, literal.end),
			selected.pointer,
			checkpoint,
		);
		if (utf8ByteLength(json.text) > htmlSourceJsonBindingLimits.maxOutputBytes)
			resourceLimit("HTML JSON binding output limit exceeded");
		checkpoint?.();
		return Object.freeze({
			text: json.text,
			metadata: Object.freeze({
				kind: "html-json-binding-source-v1",
				scope: "lexical-html-source",
				valueBasis: "initial-const-json-literal",
				scriptingMode: "disabled",
				rendered: false,
				verified: false,
				...selected,
				...candidate,
				sourceCodeUnits: source.length,
				offsetBasis: "decoder-output-utf16",
				literal: Object.freeze({
					start: literal.start,
					end: literal.end,
					offsetBasis: "decoder-output-utf16",
				}),
				json: json.metadata,
				jsonOffsetBasis: "literal-relative-utf16",
				trailingSource: Object.freeze({
					start: literal.trailingStart,
					end: candidate.end,
					offsetBasis: "decoder-output-utf16",
					evaluated: false,
				}),
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
