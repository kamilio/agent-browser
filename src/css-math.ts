import { AgentBrowserError } from "./errors.js";

export const cssMathLimits = Object.freeze({
	maxSourceCodeUnits: 4096,
	maxComputedCodeUnits: 16_384,
	maxNodes: 256,
	maxDepth: 32,
	maxArguments: 32,
});

export const cssMathCapabilities = Object.freeze({
	status: "partial",
	functions: Object.freeze(["calc", "min", "max", "clamp"]),
	profile: "finite-box-length-percentage",
	dimensionalProducts: false,
	nonFiniteValues: false,
	standardSerialization: false,
});

type Operation = "+" | "-" | "*" | "/" | "min" | "max" | "clamp";
interface Term {
	type: "number" | "length";
	percentage: boolean;
	value?: number;
	unit?: string;
	operation?: Operation;
	children?: Term[];
}
const whitespace = /[\t\n\f\r ]/;
const dimension =
	/^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(px|rem|em|cm|mm|q|in|pt|pc|vmin|vmax|vw|vh|%)?/;

export function isCssLengthMath(value: string): boolean {
	return /^(?:calc|min|max|clamp)\(/i.test(value);
}

function operationValue(operation: Operation, values: number[]): number {
	switch (operation) {
		case "+":
			return values[0] + values[1];
		case "-":
			return values[0] - values[1];
		case "*":
			return values[0] * values[1];
		case "/":
			return values[0] / values[1];
		case "min":
			return Math.min(...values);
		case "max":
			return Math.max(...values);
		case "clamp":
			return Math.max(values[0], Math.min(values[1], values[2]));
	}
}

function parse(input: string, computed = false): Term | undefined {
	if (
		input.length >
		(computed
			? cssMathLimits.maxComputedCodeUnits
			: cssMathLimits.maxSourceCodeUnits)
	)
		return;
	const source = input.trim().toLowerCase();
	if (!isCssLengthMath(source)) return;
	let position = 0;
	let nodes = 0;
	const skip = () => {
		while (position < source.length && whitespace.test(source[position]))
			position++;
	};
	function combine(operation: Operation, children: Term[]): Term | undefined {
		if (++nodes > cssMathLimits.maxNodes) return;
		let type = children[0].type;
		if (operation === "*") {
			if (children.every((child) => child.type === "length")) return;
			type = children.some((child) => child.type === "length")
				? "length"
				: "number";
		} else if (operation === "/") {
			if (children[1].type !== "number" || children[1].value === 0) return;
		} else if (children.some((child) => child.type !== type)) return;
		if (type === "number") {
			const value = operationValue(
				operation,
				children.map((child) => child.value as number),
			);
			return Number.isFinite(value)
				? { type, percentage: false, value, unit: "" }
				: undefined;
		}
		return {
			type,
			percentage: children.some((child) => child.percentage),
			operation,
			children,
		};
	}
	function atom(depth: number): Term | undefined {
		if (depth > cssMathLimits.maxDepth || ++nodes > cssMathLimits.maxNodes)
			return;
		skip();
		if (source[position] === "(") {
			position++;
			const result = sum(depth + 1);
			skip();
			if (source[position++] !== ")") return;
			return result;
		}
		const named = /^(calc|min|max|clamp)\(/.exec(source.slice(position));
		if (named) {
			position += named[0].length;
			const children: Term[] = [];
			while (children.length < cssMathLimits.maxArguments) {
				const child = sum(depth + 1);
				if (!child) return;
				children.push(child);
				skip();
				if (source[position] !== ",") break;
				position++;
			}
			if (source[position++] !== ")") return;
			if (named[1] === "calc")
				return children.length === 1 ? children[0] : undefined;
			if (named[1] === "clamp" && children.length !== 3) return;
			return combine(named[1] as Operation, children);
		}
		const matched = dimension.exec(source.slice(position));
		if (!matched) return;
		position += matched[0].length;
		const value = Number(matched[1]);
		if (!Number.isFinite(value)) return;
		const unit = matched[2] ?? "";
		return {
			type: unit ? "length" : "number",
			percentage: unit === "%",
			value,
			unit,
		};
	}
	function product(depth: number): Term | undefined {
		let result = atom(depth);
		if (!result) return;
		while (true) {
			skip();
			const operator = source[position];
			if (operator !== "*" && operator !== "/") return result;
			position++;
			const right = atom(depth);
			if (!right) return;
			result = combine(operator, [result, right]);
			if (!result) return;
		}
	}
	function sum(depth: number): Term | undefined {
		let result = product(depth);
		if (!result) return;
		while (true) {
			skip();
			const operator = source[position];
			if (operator !== "+" && operator !== "-") return result;
			if (
				!whitespace.test(source[position - 1] ?? "") ||
				!whitespace.test(source[position + 1] ?? "")
			)
				return;
			position++;
			const right = product(depth);
			if (!right) return;
			result = combine(operator, [result, right]);
			if (!result) return;
		}
	}
	const result = atom(0);
	skip();
	return position === source.length && result?.type === "length"
		? result
		: undefined;
}

export function normalizeLengthMath(
	value: string,
	allowPercentage = true,
): string | undefined {
	const parsed = parse(value);
	return parsed && (allowPercentage || !parsed.percentage)
		? value.trim().toLowerCase()
		: undefined;
}

export function splitLengthComponents(value: string): string[] | undefined {
	if (value.length > cssMathLimits.maxSourceCodeUnits) return;
	const parts: string[] = [];
	let start = 0;
	let depth = 0;
	for (let index = 0; index <= value.length; index++) {
		if (value[index] === "(" && ++depth > cssMathLimits.maxDepth) return;
		if (value[index] === ")" && --depth < 0) return;
		if (
			index === value.length ||
			(depth === 0 && whitespace.test(value[index]))
		) {
			if (depth !== 0) return;
			if (index > start) parts.push(value.slice(start, index));
			if (parts.length > 4) return;
			start = index + 1;
		}
	}
	return parts.length ? parts : undefined;
}

const fontUnits = {
	em: /(?:\d|\.)em(?![a-z])/i,
	rem: /(?:\d|\.)rem(?![a-z])/i,
};
export function lengthUsesFont(value: string, unit: "em" | "rem"): boolean {
	return fontUnits[unit].test(value);
}

export function lengthHasPercentage(value: string): boolean {
	return value.includes("%");
}

function requireTerm(value: string): Term {
	const term = parse(value, true);
	if (!term)
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported CSS length calculation",
		);
	return term;
}

function finite(value: number): number {
	if (!Number.isFinite(value))
		throw new AgentBrowserError(
			"resource-limit",
			"CSS length calculation overflow",
		);
	return value === 0 ? 0 : value;
}

function evaluate(term: Term, factor: (unit: string) => number): number {
	return finite(
		term.operation
			? operationValue(
					term.operation,
					(term.children as Term[]).map((child) => evaluate(child, factor)),
				)
			: (term.value as number) * (term.unit ? factor(term.unit) : 1),
	);
}

function serialize(
	term: Term,
	factor: (unit: string) => number,
	precedence = 0,
): string {
	if (!term.operation)
		return `${finite((term.value as number) * (term.unit && term.unit !== "%" ? factor(term.unit) : 1))}${term.unit === "%" ? "%" : term.unit ? "px" : ""}`;
	const children = term.children as Term[];
	if (["min", "max", "clamp"].includes(term.operation))
		return `${term.operation}(${children.map((child) => serialize(child, factor)).join(", ")})`;
	const priority = term.operation === "+" || term.operation === "-" ? 1 : 2;
	const source = `${serialize(children[0], factor, priority)} ${term.operation} ${serialize(children[1], factor, priority + 1)}`;
	return priority < precedence ? `(${source})` : source;
}

export function computeLengthMath(
	value: string,
	factor: (unit: string) => number,
	signed = false,
): string {
	const term = requireTerm(value);
	if (!term.percentage) {
		const pixels = evaluate(term, factor);
		return `${signed ? pixels : Math.max(0, pixels)}px`;
	}
	const serialized = serialize(term, factor);
	const computed =
		term.operation && ["min", "max", "clamp"].includes(term.operation)
			? serialized
			: `calc(${serialized})`;
	if (
		computed.length > cssMathLimits.maxComputedCodeUnits ||
		!parse(computed, true)
	)
		throw new AgentBrowserError(
			"resource-limit",
			"CSS computed calculation limit exceeded",
		);
	return computed;
}

export function resolveLengthMath(
	value: string,
	basis: number,
	signed = false,
): number {
	const result = evaluate(requireTerm(value), (unit) => {
		if (unit === "px") return 1;
		if (unit === "%") return basis / 100;
		throw new AgentBrowserError(
			"unsupported",
			"Layout requires computed CSS calculation units",
		);
	});
	return signed ? result : Math.max(0, result);
}
