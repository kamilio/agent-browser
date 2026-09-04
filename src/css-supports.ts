import { AgentBrowserError } from "./errors.js";
import { readCssIdentifier, withoutCssComments } from "./css-variables.js";

export const cssSupportsLimits = Object.freeze({
	maxSourceCodeUnits: 65_536,
	maxDepth: 32,
	maxConditions: 1024,
});
type DeclarationSupport = (property: string, value: string) => boolean;
const whitespace = /[\t\n\f\r ]/;
const nameStart = /[a-zA-Z_\u0080-\uffff]/;

function limit(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"CSS support query limit exceeded",
	);
}

function blockPairs(source: string): Map<number, number> | undefined {
	const pairs = new Map<number, number>();
	const stack: { start: number; close: string }[] = [];
	let quote = "";
	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		if (character === "\\") {
			if (index + 1 === source.length || (!quote && source[index + 1] === "\n"))
				return;
			index++;
		} else if (quote) {
			if (character === "\n") return;
			if (character === quote) quote = "";
		} else if (character === "'" || character === '"') quote = character;
		else if ("([{".includes(character)) {
			stack.push({
				start: index,
				close: character === "(" ? ")" : character === "[" ? "]" : "}",
			});
			if (stack.length > cssSupportsLimits.maxDepth) limit();
		} else if (")]}".includes(character)) {
			const opening = stack.pop();
			if (!opening || opening.close !== character) return;
			pairs.set(opening.start, index);
		}
	}
	return quote || stack.length ? undefined : pairs;
}

class SupportsParser {
	private conditions = 0;
	constructor(
		private readonly source: string,
		private readonly pairs: ReadonlyMap<number, number>,
		private readonly supports: DeclarationSupport,
	) {}
	private space(start: number, end: number) {
		let position = start;
		while (position < end && whitespace.test(this.source[position])) position++;
		return position;
	}
	private name(start: number) {
		const first = this.source[start] ?? "";
		const second = this.source[start + 1] ?? "";
		if (
			!nameStart.test(first) &&
			first !== "\\" &&
			!(
				first === "-" &&
				(nameStart.test(second) || second === "-" || second === "\\")
			)
		)
			return;
		return readCssIdentifier(this.source, start);
	}
	declaration(start: number, end: number): boolean | undefined {
		const name = this.name(this.space(start, end));
		if (!name || name.end >= end) return;
		const colon = this.space(name.end, end);
		if (this.source[colon] !== ":") return;
		return this.supports(name.value, this.source.slice(colon + 1, end));
	}
	condition(startOffset: number, end: number): boolean | undefined {
		const start = this.space(startOffset, end);
		const name = this.name(start);
		if (name?.value.toLowerCase() === "not" && this.source[name.end] !== "(") {
			const term = this.term(this.space(name.end, end), end);
			return term && this.space(term.end, end) === end
				? !term.value
				: undefined;
		}
		const first = this.term(start, end);
		if (!first) return;
		let result = first.value;
		let position = this.space(first.end, end);
		let operator: string | undefined;
		while (position < end) {
			const name = this.name(position);
			const next = name?.value.toLowerCase();
			if (
				!name ||
				(next !== "and" && next !== "or") ||
				this.source[name.end] === "(" ||
				(operator !== undefined && operator !== next)
			)
				return;
			operator = next;
			const term = this.term(this.space(name.end, end), end);
			if (!term) return;
			result = operator === "and" ? result && term.value : result || term.value;
			position = this.space(term.end, end);
		}
		return result;
	}
	private term(
		start: number,
		end: number,
	): { value: boolean; end: number } | undefined {
		if (++this.conditions > cssSupportsLimits.maxConditions) limit();
		if (this.source[start] === "(") {
			const close = this.pairs.get(start);
			if (close === undefined || close >= end) return;
			return {
				value:
					this.declaration(start + 1, close) ??
					this.condition(start + 1, close) ??
					false,
				end: close + 1,
			};
		}
		const name = this.name(start);
		if (!name || this.source[name.end] !== "(") return;
		const close = this.pairs.get(name.end);
		return close !== undefined && close < end
			? { value: false, end: close + 1 }
			: undefined;
	}
}

export function evaluateCssSupports(
	source: string,
	supports: DeclarationSupport,
	allowBareDeclaration = false,
): boolean {
	if (source.length > cssSupportsLimits.maxSourceCodeUnits) limit();
	const normalized = withoutCssComments(source)
		.replace(/\r\n?|\f/g, "\n")
		.replace(/\0/g, "\ufffd");
	const pairs = blockPairs(normalized);
	if (!pairs) return false;
	const parser = new SupportsParser(normalized, pairs, supports);
	return (
		parser.condition(0, normalized.length) ||
		(allowBareDeclaration && parser.declaration(0, normalized.length)) ||
		false
	);
}
