import { compileCssMedia, cssMediaLimits } from "./css-media.js";
import { CssScanner } from "./css-parser.js";
import {
	readCssIdentifier,
	skipCssTrivia,
	withoutCssComments,
} from "./css-variables.js";
import { AgentBrowserError } from "./errors.js";

export const cssImportLimits = Object.freeze({
	maxCodeUnits: 524_288,
	maxImports: 64,
	maxWork: 4_000_000,
	maxUrlCodeUnits: 16_384,
	maxMediaCodeUnits: 16_384,
});

export interface CssImportOptions {
	readonly maxCodeUnits?: number;
	readonly maxImports?: number;
	readonly maxWork?: number;
}

export interface CssImport {
	readonly start: number;
	readonly end: number;
	readonly url: string;
	readonly media: string;
}

export interface CssImportsResult {
	readonly imports: readonly CssImport[];
	readonly issues: Readonly<Record<string, number>>;
	readonly metrics: Readonly<{ work: number }>;
}

const whitespace = /[\t\n\f\r ]/;
const newline = /[\n\r\f]/;

function resourceLimit(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

function callerLimit(value: number | undefined, maximum: number): number {
	if (value === undefined) return maximum;
	if (!Number.isInteger(value) || value <= 0 || value > maximum)
		throw new AgentBrowserError(
			"invalid-input",
			"CSS import limits must be positive integers no larger than defaults",
		);
	return value;
}

function scalar(source: string, position: number) {
	const code = source.codePointAt(position) as number;
	return {
		value: String.fromCodePoint(
			!code || (code >= 0xd800 && code <= 0xdfff) ? 0xfffd : code,
		),
		end: position + (code > 0xffff ? 2 : 1),
	};
}

function escape(source: string, position: number, quoted: boolean) {
	const next = source[position + 1];
	if (next === undefined) return;
	if (newline.test(next)) {
		if (!quoted) return;
		return {
			value: "",
			end: position + (next === "\r" && source[position + 2] === "\n" ? 3 : 2),
		};
	}
	const digits = /^[0-9a-fA-F]{1,6}/.exec(
		source.slice(position + 1, position + 7),
	)?.[0];
	if (!digits) return scalar(source, position + 1);
	let end = position + 1 + digits.length;
	if (whitespace.test(source[end] ?? "")) {
		if (source[end] === "\r" && source[end + 1] === "\n") end++;
		end++;
	}
	const decoded = readCssIdentifier(source.slice(position, end), 0);
	return decoded && { value: decoded.value, end };
}

function readUrlValue(source: string, start: number, quote: string) {
	let position = start;
	let value = "";
	while (position < source.length) {
		const character = source[position];
		if (quote ? character === quote : character === ")")
			return { value, end: position + 1 };
		if (!quote && whitespace.test(character)) {
			while (whitespace.test(source[position] ?? "")) position++;
			return source[position] === ")"
				? { value, end: position + 1 }
				: undefined;
		}
		if (
			quote
				? newline.test(character)
				: /["'(\u0001-\u0008\u000b\u000e-\u001f\u007f]/.test(character)
		)
			return;
		const decoded =
			character === "\\"
				? escape(source, position, Boolean(quote))
				: scalar(source, position);
		if (!decoded) return;
		if (value.length + decoded.value.length > cssImportLimits.maxUrlCodeUnits)
			resourceLimit("CSS import URL limit exceeded");
		value += decoded.value;
		position = decoded.end;
	}
}

function readImportUrl(source: string, start: number) {
	let position = skipCssTrivia(source, start, source.length);
	const quote = source[position];
	if (quote === '"' || quote === "'")
		return readUrlValue(source, position + 1, quote);
	const name = readCssIdentifier(source, position);
	if (name?.value.toLowerCase() !== "url" || source[name.end] !== "(") return;
	position = name.end + 1;
	while (whitespace.test(source[position] ?? "")) position++;
	const urlQuote = source[position];
	if (urlQuote !== '"' && urlQuote !== "'")
		return readUrlValue(source, position, "");
	const parsed = readUrlValue(source, position + 1, urlQuote);
	if (!parsed) return;
	position = skipCssTrivia(source, parsed.end, source.length);
	return source[position] === ")"
		? { value: parsed.value, end: position + 1 }
		: undefined;
}

function readImport(
	source: string,
	start: number,
	charge: (amount: number) => void,
	issue: (code: string) => void,
) {
	const parsed = readImportUrl(source, start);
	if (!parsed || !parsed.value.trim()) {
		issue("invalid-css-import");
		return;
	}
	const media = source.slice(parsed.end).trim();
	if (media.length > cssImportLimits.maxMediaCodeUnits)
		resourceLimit("CSS import media limit exceeded");
	const mediaStart = skipCssTrivia(media, 0, media.length);
	const modifier = readCssIdentifier(media, mediaStart)?.value.toLowerCase();
	if (modifier === "layer" || modifier === "supports") {
		issue("unsupported-css-import-modifier");
		return;
	}
	charge(media.length * (2 * cssMediaLimits.maxDepth + 8));
	if (compileCssMedia(media).unsupported) {
		issue("unsupported-css-import-media");
		return;
	}
	return {
		url: parsed.value,
		media: withoutCssComments(media).trim() ? media : "",
	};
}

export function parseCssImports(
	source: string,
	options: CssImportOptions = {},
): CssImportsResult {
	if (
		typeof source !== "string" ||
		options === null ||
		typeof options !== "object" ||
		Array.isArray(options)
	)
		throw new AgentBrowserError("invalid-input", "Invalid CSS import input");
	const maxCodeUnits = callerLimit(
		options.maxCodeUnits,
		cssImportLimits.maxCodeUnits,
	);
	const maxImports = callerLimit(
		options.maxImports,
		cssImportLimits.maxImports,
	);
	const maxWork = callerLimit(options.maxWork, cssImportLimits.maxWork);
	if (source.length > maxCodeUnits)
		resourceLimit("CSS import source limit exceeded");
	let work = 0;
	const charge = (amount: number) => {
		if (amount > maxWork - work)
			resourceLimit("CSS import work limit exceeded");
		work += amount;
	};
	charge(source.length * 6);
	const imports: CssImport[] = [];
	const issues: Record<string, number> = {};
	const issue = (code: string) => {
		issues[code] = (issues[code] ?? 0) + 1;
	};
	const scanner = new CssScanner(source, issue);
	let importsAllowed = true;
	while (scanner.position < source.length) {
		const start = scanner.position;
		const prelude = scanner.read(";{}");
		const end = scanner.position;
		const position = skipCssTrivia(
			prelude.text,
			start === 0 && prelude.text[0] === "\ufeff" ? 1 : 0,
			prelude.text.length,
		);
		if (position === prelude.text.length && !prelude.stop) break;
		const name =
			prelude.text[position] === "@"
				? readCssIdentifier(prelude.text, position + 1)
				: undefined;
		const atRule = name?.value.toLowerCase();
		if (atRule === "import" && name) {
			if (!importsAllowed) issue("late-css-import");
			else if (prelude.stop !== ";") issue("invalid-css-import");
			else {
				const parsed = readImport(prelude.text, name.end, charge, issue);
				if (parsed) {
					if (imports.length >= maxImports)
						resourceLimit("CSS import entry limit exceeded");
					imports.push(Object.freeze({ start, end, ...parsed }));
				}
			}
		} else if (atRule === "layer" && prelude.stop === ";") {
			issue("unsupported-css-import-layer-order");
			importsAllowed = false;
		} else if (atRule !== "charset" || prelude.stop !== ";")
			importsAllowed = false;
		if (prelude.stop === "{") {
			importsAllowed = false;
			if (!scanner.read("}", true).stop) issue("unterminated-css-rule");
		} else if (prelude.stop === "}") importsAllowed = false;
	}
	return Object.freeze({
		imports: Object.freeze(imports),
		issues: Object.freeze(issues),
		metrics: Object.freeze({ work }),
	});
}
