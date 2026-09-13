import { readCssIdentifier } from "./css-variables.js";

export interface CssContentValue {
	readonly value: string;
	readonly text: string | null;
}

const whitespace = /[\t\n\f\r ]/;
const newline = /[\n\f\r]/;

function skipTrivia(source: string, start: number): number | undefined {
	let position = start;
	while (position < source.length) {
		if (whitespace.test(source[position])) position++;
		else if (source.startsWith("/*", position)) {
			const close = source.indexOf("*/", position + 2);
			if (close < 0) return;
			position = close + 2;
		} else break;
	}
	return position;
}

function scalarValue(code: number): string {
	return String.fromCodePoint(
		!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
			? 0xfffd
			: code,
	);
}

function readString(source: string, start: number) {
	const quote = source[start];
	const parts: string[] = [];
	let position = start + 1;
	while (position < source.length) {
		const character = source[position];
		if (character === quote) return { text: parts.join(""), end: position + 1 };
		if (newline.test(character)) return;
		if (character === "\\") {
			position++;
			if (position === source.length) return;
			if (newline.test(source[position])) {
				if (source[position] === "\r" && source[position + 1] === "\n")
					position++;
				position++;
				continue;
			}
			const digits = /^[0-9a-fA-F]{1,6}/.exec(
				source.slice(position, position + 6),
			)?.[0];
			if (digits) {
				parts.push(scalarValue(Number.parseInt(digits, 16)));
				position += digits.length;
				if (whitespace.test(source[position] ?? "")) {
					if (source[position] === "\r" && source[position + 1] === "\n")
						position++;
					position++;
				}
				continue;
			}
		}
		const code = source.codePointAt(position) as number;
		parts.push(scalarValue(code));
		position += code > 0xffff ? 2 : 1;
	}
}

function serializeString(text: string): string {
	const parts = ['"'];
	for (const character of text) {
		const code = character.codePointAt(0) as number;
		if (character === '"' || character === "\\") parts.push(`\\${character}`);
		else if (code <= 0x1f || code === 0x7f)
			parts.push(`\\${code.toString(16)} `);
		else parts.push(character);
	}
	parts.push('"');
	return parts.join("");
}

export function parseCssContent(source: string): CssContentValue | undefined {
	let position = skipTrivia(source, 0);
	if (position === undefined || position === source.length) return;
	if (source[position] !== '"' && source[position] !== "'") {
		const identifier = readCssIdentifier(source, position);
		if (!identifier || skipTrivia(source, identifier.end) !== source.length)
			return;
		const value = identifier.value.toLowerCase();
		if (value === "normal" || value === "none")
			return Object.freeze({ value, text: null });
		return;
	}
	const parts: string[] = [];
	while (position < source.length) {
		if (source[position] !== '"' && source[position] !== "'") return;
		const parsed = readString(source, position);
		if (!parsed) return;
		parts.push(parsed.text);
		position = skipTrivia(source, parsed.end);
		if (position === undefined) return;
	}
	const text = parts.join("");
	return Object.freeze({ value: serializeString(text), text });
}
