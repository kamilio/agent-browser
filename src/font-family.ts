import { bitmapFont } from "./bitmap-font.js";
import { readCssIdentifier, skipCssTrivia } from "./css-variables.js";
import { AgentBrowserError } from "./errors.js";

export interface FontFamily {
	readonly name: string;
	readonly generic: boolean;
}

const maxCodeUnits = 4096;
const maxFamilies = 64;
const genericFamilies = new Set([
	"serif",
	"sans-serif",
	"system-ui",
	"cursive",
	"fantasy",
	"math",
	"monospace",
	"ui-serif",
	"ui-sans-serif",
	"ui-monospace",
	"ui-rounded",
]);
const wideKeywords = new Set(["initial", "inherit", "unset", "revert"]);
const reservedNames = new Set([
	...wideKeywords,
	"revert-layer",
	"default",
	"caption",
	"icon",
	"menu",
	"message-box",
	"small-caption",
	"status-bar",
]);
const whitespace = /[\t\n\f\r ]/;
const nameStart = /[a-zA-Z_\u0080-\uFFFF]/;

function startsIdentifier(source: string, start: number): boolean {
	const position = source[start] === "-" ? start + 1 : start;
	const character = source[position] ?? "";
	return (
		nameStart.test(character) ||
		(position !== start && character === "-") ||
		(character === "\\" &&
			position + 1 < source.length &&
			source[position + 1] !== "\n")
	);
}

function triviaEnd(source: string, start: number): number | undefined {
	const end = skipCssTrivia(source, start, source.length);
	let position = start;
	while (position < end) {
		if (source.startsWith("/*", position)) {
			const close = source.indexOf("*/", position + 2);
			if (close < 0) return;
			position = close + 2;
		} else position++;
	}
	return end;
}

function readString(source: string, start: number) {
	const quote = source[start];
	let position = start + 1;
	let value = "";
	while (position < source.length) {
		const character = source[position++];
		if (character === quote) return { value, end: position };
		if (character === "\n") return;
		if (character !== "\\") {
			value += character;
			continue;
		}
		if (position === source.length) return;
		if (source[position] === "\n") {
			position++;
			continue;
		}
		const digits = /^[0-9a-fA-F]{1,6}/.exec(
			source.slice(position, position + 6),
		)?.[0];
		if (!digits) {
			value += source[position++];
			continue;
		}
		const code = Number.parseInt(digits, 16);
		value += String.fromCodePoint(
			!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
				? 0xfffd
				: code,
		);
		position += digits.length;
		if (whitespace.test(source[position] ?? "")) position++;
	}
}

function quoteName(name: string): string {
	let result = '"';
	for (const character of name) {
		const code = character.charCodeAt(0);
		if (character === '"' || character === "\\") result += `\\${character}`;
		else if (code < 32 || code === 127) result += `\\${code.toString(16)} `;
		else result += character;
	}
	return `${result}"`;
}

function parseValue(
	value: string,
): { families?: readonly FontFamily[]; normalized: string } | undefined {
	if (typeof value !== "string" || value.length > maxCodeUnits) return;
	const source = Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return !code || (code >= 0xd800 && code <= 0xdfff) ? "\ufffd" : character;
	})
		.join("")
		.replace(/\r\n?|\f/g, "\n");
	const families: FontFamily[] = [];
	let normalized = "";
	let position = triviaEnd(source, 0);
	while (position !== undefined && position < source.length) {
		if (families.length === maxFamilies) return;
		let family: FontFamily;
		if (source[position] === '"' || source[position] === "'") {
			const quoted = readString(source, position);
			if (!quoted) return;
			family = { name: quoted.value, generic: false };
			position = triviaEnd(source, quoted.end);
		} else {
			const identifiers: string[] = [];
			while (position !== undefined && position < source.length) {
				if (!startsIdentifier(source, position)) return;
				const identifier = readCssIdentifier(source, position);
				if (!identifier) return;
				identifiers.push(identifier.value);
				position = triviaEnd(source, identifier.end);
				if (position === source.length || source[position ?? -1] === ",") break;
			}
			const keyword = identifiers[0].toLowerCase();
			if (
				identifiers.length === 1 &&
				families.length === 0 &&
				position === source.length &&
				wideKeywords.has(keyword)
			)
				return { normalized: keyword };
			if (
				identifiers.some(
					(identifier) =>
						reservedNames.has(identifier.toLowerCase()) ||
						(identifiers.length > 1 &&
							genericFamilies.has(identifier.toLowerCase())),
				)
			)
				return;
			const generic = identifiers.length === 1 && genericFamilies.has(keyword);
			family = { name: generic ? keyword : identifiers.join(" "), generic };
		}
		if (position === undefined) return;
		normalized += `${families.length ? ", " : ""}${family.generic ? family.name : quoteName(family.name)}`;
		if (normalized.length > maxCodeUnits) return;
		families.push(family);
		if (position === source.length) return { families, normalized };
		if (source[position] !== ",") return;
		position = triviaEnd(source, position + 1);
	}
}

export function parseFontFamily(
	value: string,
): readonly FontFamily[] | undefined {
	return parseValue(value)?.families;
}

export function normalizeFontFamily(value: string): string | undefined {
	return parseValue(value)?.normalized;
}

export function resolveNativeFont(value: string): Readonly<{
	font: typeof bitmapFont;
	family: string | null;
	kind: "named" | "generic" | "fallback";
}> {
	const families = parseFontFamily(value);
	if (!families)
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported or unresolved native font-family value",
		);
	for (const family of families) {
		if (family.generic)
			return { font: bitmapFont, family: family.name, kind: "generic" };
		if (family.name.toLowerCase() === bitmapFont.family.toLowerCase())
			return { font: bitmapFont, family: bitmapFont.family, kind: "named" };
	}
	return { font: bitmapFont, family: null, kind: "fallback" };
}
