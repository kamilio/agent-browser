import { cssDeclarationStatements } from "./css-parser.js";

const maximumStyleLength = 8192;
const maximumDeclarations = 128;
const displayKeywords = new Set([
	"none",
	"contents",
	"block",
	"inline",
	"inline-block",
	"list-item",
	"flex",
	"inline-flex",
	"grid",
	"inline-grid",
	"flow-root",
	"table",
	"inline-table",
	"table-row",
	"table-cell",
	"table-row-group",
	"table-header-group",
	"table-footer-group",
	"table-column",
	"table-column-group",
	"table-caption",
]);

function trimCssWhitespace(value: string): string {
	return value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
}

function safeUrlEnd(source: string, position: number): number {
	let cursor = position + 1;
	while (cursor < source.length && /[\t\n\f\r ]/.test(source[cursor])) cursor++;
	const quote = source[cursor];
	if (quote === '"' || quote === "'") {
		cursor++;
		while (cursor < source.length && source[cursor] !== quote) {
			if (/[\n\f\r]/.test(source[cursor])) return -1;
			cursor++;
		}
		if (cursor === source.length) return -1;
		cursor++;
	} else {
		while (cursor < source.length && !/[\t\n\f\r )]/.test(source[cursor])) {
			if (/["'(\[\]]/.test(source[cursor])) return -1;
			cursor++;
		}
	}
	while (cursor < source.length && /[\t\n\f\r ]/.test(source[cursor])) cursor++;
	return source[cursor] === ")" ? cursor : -1;
}

function hasSafeComponents(source: string): boolean {
	if (/[\\{}]|\/\*|\*\//.test(source)) return false;
	for (const character of source) {
		const code = character.charCodeAt(0);
		if ((code < 32 && !/[\t\n\f\r]/.test(character)) || code === 127)
			return false;
	}
	const stack: string[] = [];
	let quote = "";
	let identifier = "";
	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		if (quote) {
			if (/[\n\f\r]/.test(character)) return false;
			if (character === quote) quote = "";
			continue;
		}
		if (character.charCodeAt(0) > 127) return false;
		if (character === '"' || character === "'") quote = character;
		else if (character === "(" && identifier.toLowerCase() === "url") {
			const end = safeUrlEnd(source, index);
			if (end < 0 || stack.length === 32) return false;
			index = end;
		} else if (character === "(" || character === "[") {
			stack.push(character === "(" ? ")" : "]");
			if (stack.length > 32) return false;
		} else if (character === ")" || character === "]") {
			if (stack.pop() !== character) return false;
		}
		identifier = /[a-z0-9_-]/i.test(character) ? identifier + character : "";
	}
	return quote === "" && stack.length === 0;
}

export function sourceInlineDisplayHidden(style: string | undefined): boolean {
	if (
		style === undefined ||
		style.length > maximumStyleLength ||
		!hasSafeComponents(style)
	)
		return false;
	let declarations = 0;
	let scannerIssue = false;
	let hidden = false;
	let important = false;
	try {
		for (const statement of cssDeclarationStatements(style, () => {
			scannerIssue = true;
		})) {
			if (scannerIssue) return false;
			const declaration = trimCssWhitespace(statement);
			if (!declaration) continue;
			if (++declarations > maximumDeclarations) return false;
			const colon = declaration.indexOf(":");
			if (colon < 0) return false;
			const property = trimCssWhitespace(declaration.slice(0, colon));
			if (!/^(?:-?[a-z_][a-z0-9_-]*|--[a-z0-9_-]+)$/i.test(property))
				return false;
			const name = property.toLowerCase();
			const value = trimCssWhitespace(declaration.slice(colon + 1));
			if (!value || name === "all") return false;
			if (name !== "display") continue;
			const match =
				/^([a-z]+(?:-[a-z]+)*)(?:[\t\n\f\r ]*![\t\n\f\r ]*(important))?$/i.exec(
					value,
				);
			if (!match || !displayKeywords.has(match[1].toLowerCase())) return false;
			const nextImportant = match[2] !== undefined;
			if (!important || nextImportant) {
				hidden = match[1].toLowerCase() === "none";
				important = nextImportant;
			}
		}
	} catch {
		return false;
	}
	return !scannerIssue && hidden;
}
