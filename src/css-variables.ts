import { AgentBrowserError } from "./errors.js";

export const cssVariableLimits = Object.freeze({
	maxValueCodeUnits: 65_536,
	maxProperties: 512,
	maxDepth: 128,
	maxRetainedBindings: 16_384,
	maxRetainedCodeUnits: 2_000_000,
});
export const cssVariableCapabilities = Object.freeze({
	partial: true,
	profile: "unregistered-custom-properties",
	inheritance: true,
	fallbacks: true,
	computedStyleReads: true,
	dynamicReferenceNames: true,
	registeredProperties: false,
	animationTaint: false,
	inlinePendingShorthands: "raw-declaration-not-expanded-cssom-enumeration",
	partialPendingShorthandRemoval: false,
	lowerPriorityPendingComponentReplacement: false,
	limits: cssVariableLimits,
});
type Part =
	| string
	| { prefix: string; parts: Part[]; suffix: string }
	| {
			name: Part[];
			fallback?: Part[];
	  };
export interface VariableValue {
	readonly parts: readonly Part[];
	readonly variables: boolean;
}
const whitespace = /[\t\n\f\r ]/;
const nameCharacter = /[a-zA-Z0-9_\-\u0080-\uFFFF]/;
const nameStart = /^(?:--|-?[a-zA-Z_\u0080-\uFFFF]|\\)/;

function limit(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"CSS variable resource limit exceeded",
	);
}

function identifier(source: string, start: number) {
	let position = start;
	let value = "";
	while (position < source.length) {
		const character = source[position];
		if (nameCharacter.test(character)) {
			value += character;
			position++;
		} else if (character === "\\") {
			position++;
			if (position === source.length || /[\n\r\f]/.test(source[position]))
				return;
			const digits = /^[0-9a-fA-F]{1,6}/.exec(
				source.slice(position, position + 6),
			)?.[0];
			if (digits) {
				const code = Number.parseInt(digits, 16);
				value += String.fromCodePoint(
					!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
						? 0xfffd
						: code,
				);
				position += digits.length;
				if (whitespace.test(source[position] ?? "")) {
					if (source[position] === "\r" && source[position + 1] === "\n")
						position++;
					position++;
				}
			} else value += source[position++];
		} else break;
	}
	return { value, end: position };
}

export function customPropertyName(source: string): string | undefined {
	if (source.length > 1024) return;
	const parsed = identifier(source, 0);
	return parsed?.end === source.length &&
		parsed.value.startsWith("--") &&
		parsed.value.length > 2
		? parsed.value
		: undefined;
}

export function withoutCssComments(source: string): string {
	let output = "";
	let quote = "";
	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		if (character === "\\") {
			output += source.slice(index, index + 2);
			index++;
		} else if (quote) {
			output += character;
			if (character === quote) quote = "";
		} else if (character === '"' || character === "'") {
			quote = character;
			output += character;
		} else if (source.startsWith("/*", index)) {
			const end = source.indexOf("*/", index + 2);
			output += " ";
			if (end < 0) break;
			index = end + 1;
		} else output += character;
	}
	return output;
}

export function cssDeclarationColon(source: string): number {
	for (let index = 0; index < source.length; index++) {
		if (source.startsWith("/*", index)) {
			const end = source.indexOf("*/", index + 2);
			if (end < 0) return -1;
			index = end + 1;
		} else if (source[index] === "\\") index++;
		else if (source[index] === ":") return index;
	}
	return -1;
}

export function splitCssValue(
	source: string,
): { value: string; important: boolean } | undefined {
	let quote = "";
	let bang = -1;
	const stack: string[] = [];
	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		if (character === "\\") {
			if (++index >= source.length) return;
			continue;
		}
		if (quote) {
			if (character === quote) quote = "";
			else if (/[\n\r\f]/.test(character)) return;
			continue;
		}
		if (source.startsWith("/*", index)) {
			const end = source.indexOf("*/", index + 2);
			if (end < 0) return;
			index = end + 1;
			continue;
		}
		if (character === '"' || character === "'") quote = character;
		else if ("([{".includes(character)) {
			stack.push(character === "(" ? ")" : character === "[" ? "]" : "}");
			if (stack.length > 32) limit();
		} else if (")]}".includes(character)) {
			if (stack.pop() !== character) return;
		} else if (!stack.length && character === ";") return;
		else if (!stack.length && character === "!") {
			if (bang >= 0) return;
			bang = index;
		}
	}
	if (quote || stack.length) return;
	if (
		bang >= 0 &&
		!/^!\s*important\s*$/i.test(withoutCssComments(source.slice(bang)))
	)
		return;
	return {
		value: (bang < 0 ? source : source.slice(0, bang)).trim(),
		important: bang >= 0,
	};
}

export function parseVariableValue(
	source: string,
	charge: (work: number) => void = () => {},
): VariableValue | undefined {
	if (source.length > cssVariableLimits.maxValueCodeUnits) limit();
	charge(source.length + 1);
	let position = 0;
	let variables = false;
	let failed = false;
	function read(
		stop: string,
		depth: number,
		comma = false,
		valueRoot = false,
	): Part[] {
		if (depth > 32) limit();
		const parts: Part[] = [];
		let literal = "";
		const flush = () => {
			if (literal) parts.push(literal);
			literal = "";
		};
		while (position < source.length) {
			const character = source[position];
			if (character === stop || (comma && character === ",")) break;
			if (source.startsWith("/*", position)) {
				const end = source.indexOf("*/", position + 2);
				if (end < 0) {
					failed = true;
					break;
				}
				literal += source.slice(position, end + 2);
				position = end + 2;
				continue;
			}
			if (character === '"' || character === "'") {
				const start = position++;
				while (position < source.length && source[position] !== character) {
					if (/[\n\r\f]/.test(source[position])) {
						failed = true;
						break;
					}
					if (source[position] === "\\") position++;
					position++;
				}
				if (source[position] !== character) {
					failed = true;
					break;
				}
				literal += source.slice(start, ++position);
				continue;
			}
			let prefix = "";
			let functionName = "";
			if (
				(character === "#" &&
					(nameCharacter.test(source[position + 1] ?? "") ||
						source[position + 1] === "\\")) ||
				(character === "@" &&
					nameStart.test(source.slice(position + 1, position + 3)))
			) {
				const parsed = identifier(source, position + 1);
				if (!parsed) {
					failed = true;
					break;
				}
				literal += source.slice(position, parsed.end);
				position = parsed.end;
				continue;
			}
			if (nameCharacter.test(character) || character === "\\") {
				const parsed = identifier(source, position);
				if (!parsed) {
					failed = true;
					break;
				}
				const token = source.slice(position, parsed.end);
				position = parsed.end;
				if (source[position] !== "(" || !nameStart.test(token)) {
					literal += token;
					continue;
				}
				prefix = `${token}(`;
				functionName = parsed.value.toLowerCase();
			} else if ("([{".includes(character)) prefix = character;
			else {
				if (
					")]}".includes(character) ||
					((!depth || valueRoot) && ";!".includes(character))
				) {
					failed = true;
					break;
				}
				literal += character;
				position++;
				continue;
			}
			flush();
			const closing =
				source[position] === "(" ? ")" : source[position] === "[" ? "]" : "}";
			position++;
			if (functionName === "var") {
				variables = true;
				const name = read(closing, depth + 1, true, true);
				if (
					!name.length ||
					name.every(
						(part) =>
							typeof part === "string" && !withoutCssComments(part).trim(),
					)
				)
					failed = true;
				let fallback: Part[] | undefined;
				if (source[position] === ",") {
					position++;
					fallback = read(closing, depth + 1, false, true);
				}
				parts.push({ name, ...(fallback === undefined ? {} : { fallback }) });
			} else {
				if (functionName === "url") {
					const start = position;
					while (whitespace.test(source[position] ?? "")) position++;
					if (source[position] !== '"' && source[position] !== "'") {
						while (position < source.length && source[position] !== ")") {
							if (source[position] === "\\") position++;
							else if (whitespace.test(source[position])) {
								while (whitespace.test(source[position] ?? "")) position++;
								if (source[position] !== ")") failed = true;
								break;
							} else if (
								/["'(]/.test(source[position]) ||
								source.charCodeAt(position) <= 8 ||
								source.charCodeAt(position) === 11 ||
								(source.charCodeAt(position) >= 14 &&
									source.charCodeAt(position) <= 31)
							) {
								failed = true;
							}
							position++;
						}
						parts.push(`${prefix}${source.slice(start, position)})`);
						if (source[position] !== ")") failed = true;
						position++;
						continue;
					}
					position = start;
				}
				parts.push({
					prefix,
					parts: read(closing, depth + 1),
					suffix: closing,
				});
			}
			if (source[position] !== closing) {
				failed = true;
				break;
			}
			position++;
		}
		flush();
		return parts;
	}
	const parts = read("", 0);
	return failed || position !== source.length
		? undefined
		: { parts, variables };
}

export function substituteVariables(
	value: VariableValue,
	lookup: (name: string, depth: number) => string | null,
	charge: (work: number) => void,
): string | null {
	function expand(parts: readonly Part[], depth: number): string | null {
		if (depth > cssVariableLimits.maxDepth) limit();
		let output = "";
		let invalid = false;
		let previousVariable = false;
		for (const part of parts) {
			charge(1);
			const variable = typeof part !== "string" && "name" in part;
			let replacement: string | null;
			if (typeof part === "string") replacement = part;
			else if ("name" in part) {
				const argument = expand(part.name, depth + 1);
				const name =
					argument === null
						? undefined
						: customPropertyName(withoutCssComments(argument).trim());
				replacement = name ? lookup(name, depth + 1) : null;
				if (replacement === null && part.fallback !== undefined)
					replacement = expand(part.fallback, depth + 1)?.trim() ?? null;
			} else {
				const content = expand(part.parts, depth + 1);
				replacement =
					content === null ? null : part.prefix + content + part.suffix;
			}
			if (replacement === null) {
				invalid = true;
				previousVariable ||= variable;
				continue;
			}
			const tail = output.slice(-1);
			const head = replacement.slice(0, 1);
			const merges =
				(/[\w\-\u0080-\uFFFF\\]/.test(tail) &&
					/[\w\-\u0080-\uFFFF\\(]/.test(head)) ||
				(/[0-9.+-]/.test(tail) && /[0-9.%]/.test(head)) ||
				(/[\#@]/.test(tail) && /[\w\-\u0080-\uFFFF\\]/.test(head)) ||
				(tail === "/" && head === "*") ||
				tail === "\\";
			const separator =
				output && replacement && (previousVariable || variable) && merges
					? "/**/"
					: "";
			if (
				output.length + separator.length + replacement.length >
				cssVariableLimits.maxValueCodeUnits
			)
				limit();
			charge(replacement.length + separator.length);
			output += separator + replacement;
			previousVariable = variable || (!replacement && previousVariable);
		}
		return invalid ? null : output;
	}
	return expand(value.parts, 0);
}

export function resolveCustomProperties(
	specified: ReadonlyMap<string, string>,
	parent: ReadonlyMap<string, string | null>,
	charge: (work: number) => void,
): ReadonlyMap<string, string | null> {
	if (
		parent.size > cssVariableLimits.maxProperties ||
		specified.size > cssVariableLimits.maxProperties
	)
		limit();
	if (!specified.size) return parent;
	const result = new Map(parent);
	const active: string[] = [];
	let substitutionDepth = 0;
	const cycles = new Set<string>();
	const resolved = new Set<string>();
	if (
		new Set([...parent.keys(), ...specified.keys()]).size >
		cssVariableLimits.maxProperties
	)
		limit();
	function resolve(name: string, nesting = 1): string | null {
		charge(active.length + 1);
		if (resolved.has(name) || !specified.has(name))
			return result.get(name) ?? null;
		const cycle = active.indexOf(name);
		if (cycle >= 0) {
			for (const member of active.slice(cycle)) cycles.add(member);
			return null;
		}
		if (
			active.length >= cssVariableLimits.maxDepth ||
			substitutionDepth + nesting > cssVariableLimits.maxDepth
		)
			limit();
		substitutionDepth += nesting;
		active.push(name);
		const source = specified.get(name) as string;
		const plain = withoutCssComments(source).trim();
		const token = identifier(plain, 0);
		const keyword =
			token?.end === plain.length
				? token.value.toLowerCase()
				: plain.toLowerCase();
		let computed: string | null;
		if (keyword === "initial") computed = null;
		else if (["inherit", "unset", "revert", "revert-layer"].includes(keyword))
			computed = parent.get(name) ?? null;
		else {
			const parsed = parseVariableValue(source, charge);
			computed = parsed ? substituteVariables(parsed, resolve, charge) : null;
		}
		active.pop();
		substitutionDepth -= nesting;
		if (cycles.has(name)) computed = null;
		result.set(name, computed);
		resolved.add(name);
		return computed;
	}
	charge(parent.size);
	for (const name of specified.keys()) resolve(name);
	return result;
}
