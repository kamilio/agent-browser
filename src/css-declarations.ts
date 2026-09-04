import {
	cssBackgroundProperties,
	isNeutralBackgroundProperty,
	parseBackgroundComponent,
	parseBackgroundShorthand,
	serializeBackgroundValues,
} from "./css-background.js";
import { normalizeCssColor } from "./css-color.js";
import {
	borderWidthProperties,
	borderStyleProperties,
	borderColorProperties,
	borderSides,
	isBorderShorthand,
	parseBorderShorthand,
	normalizeBorderWidth,
	normalizeBorderStyle,
} from "./css-border.js";
import {
	isCssLengthMath,
	normalizeLengthMath,
	splitLengthComponents,
} from "./css-math.js";
import {
	cssDeclarationStatements,
	parseCssDeclarations,
} from "./css-parser.js";
import {
	cssTextProperties,
	isCssTextProperty,
	parseTextValue,
} from "./css-text.js";
import { AgentBrowserError } from "./errors.js";
import {
	cssDeclarationColon,
	customPropertyName,
	parseVariableValue,
	withoutCssComments,
} from "./css-variables.js";

export interface InlineDeclaration {
	name: string;
	value: string;
	important: boolean;
	pending?: boolean;
}

const wide = new Set(["initial", "inherit", "unset", "revert"]);
const sides = ["top", "right", "bottom", "left"];
const keywords: Record<string, string[]> = {
	display:
		"none contents block inline inline-block list-item flex inline-flex grid inline-grid flow-root table inline-table table-row table-cell table-row-group table-header-group table-footer-group table-column table-column-group table-caption".split(
			" ",
		),
	visibility: ["visible", "hidden", "collapse"],
	position: ["static", "relative", "absolute", "fixed", "sticky"],
	float: ["none", "left", "right", "inline-start", "inline-end"],
	clear: ["none", "left", "right", "both", "inline-start", "inline-end"],
	"box-sizing": ["content-box", "border-box"],
	overflow: ["visible", "hidden", "clip", "scroll", "auto"],
	"overflow-x": ["visible", "hidden", "clip", "scroll", "auto"],
	"overflow-y": ["visible", "hidden", "clip", "scroll", "auto"],
};
const lengths = new Set([
	...sides,
	"width",
	"height",
	"min-width",
	"min-height",
	"max-width",
	"max-height",
	...sides.map((side) => `margin-${side}`),
	...sides.map((side) => `padding-${side}`),
]);
export const inlineProperties = [
	...borderWidthProperties,
	...borderStyleProperties,
	...borderColorProperties,
	"border",
	"border-width",
	"border-style",
	"border-color",
	...borderSides.map((side) => `border-${side}`),
	...cssTextProperties,
	...Object.keys(keywords),
	...lengths,
	"all",
	"margin",
	"padding",
	"opacity",
	"z-index",
	"color",
	"background",
	...cssBackgroundProperties,
];
const supported = new Set(inlineProperties);
const trim = (value: string) =>
	value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");

export function declarationName(name: string): string {
	return name.startsWith("--")
		? (customPropertyName(name) ?? name)
		: name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function tokens(
	source: string,
): { value: string; important: boolean } | undefined {
	let output = "";
	let quote = "";
	let bang = -1;
	const stack: string[] = [];
	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		if (character === "\\") {
			if (index + 1 >= source.length) return undefined;
			output += character + source[++index];
			continue;
		}
		if (quote) {
			if (character === quote) quote = "";
			else if (/[\n\r\f]/.test(character)) return undefined;
			output += character;
			continue;
		}
		if (source.startsWith("/*", index)) {
			const end = source.indexOf("*/", index + 2);
			if (end < 0) break;
			output += source.slice(index, end + 2);
			index = end + 1;
			continue;
		}
		if (character === '"' || character === "'") quote = character;
		else if (character === "(" || character === "[" || character === "{") {
			stack.push(character === "(" ? ")" : character === "[" ? "]" : "}");
			if (stack.length > 32)
				throw new AgentBrowserError(
					"resource-limit",
					"CSS component nesting limit exceeded",
				);
		} else if (character === ")" || character === "]" || character === "}") {
			if (stack.pop() !== character) return undefined;
		} else if (!stack.length && character === ";") return undefined;
		else if (!stack.length && character === "!") {
			if (bang >= 0) return undefined;
			bang = output.length;
		}
		output += character;
	}
	if (quote || stack.length) return undefined;
	let important = false;
	if (bang >= 0) {
		if (
			!/^![\t\n\f\r ]*important[\t\n\f\r ]*$/i.test(
				withoutCssComments(output.slice(bang)),
			)
		)
			return undefined;
		important = true;
		output = output.slice(0, bang);
	}
	return { value: trim(output), important };
}

function normalize(name: string, source: string): string | undefined {
	if (name.startsWith("--"))
		return customPropertyName(name) && parseVariableValue(source)
			? source || " "
			: undefined;
	if (!supported.has(name)) return undefined;
	const value = source.toLowerCase().replace(/[\t\n\f\r ]+/g, " ");
	if (wide.has(value)) return value;
	if (name.startsWith("border-")) {
		if (name.endsWith("-width")) return normalizeBorderWidth(value);
		if (name.endsWith("-style")) return normalizeBorderStyle(value);
		if (name.endsWith("-color")) return normalizeCssColor(value);
	}
	if (isNeutralBackgroundProperty(name))
		return parseBackgroundComponent(name, value);
	if (isCssTextProperty(name)) return parseTextValue(name, value);
	if (keywords[name]?.includes(value)) return value;
	if (
		name === "display" &&
		/^(block|inline) (flow|flow-root|flex|grid|table)$/.test(value)
	)
		return value;
	if (lengths.has(name)) {
		if (isCssLengthMath(value)) return normalizeLengthMath(value);
		if (
			value === "auto" &&
			!name.startsWith("padding-") &&
			!name.startsWith("max-")
		)
			return value;
		if (value === "none" && name.startsWith("max-")) return value;
		const match =
			/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|em|rem|ex|ch|vw|vh|vmin|vmax|cm|mm|q|in|pt|pc|%)?$/.exec(
				value,
			);
		if (!match) return undefined;
		const number = Number(match[1]);
		if (!Number.isFinite(number) || (!match[2] && number !== 0))
			return undefined;
		if (number < 0 && !sides.includes(name) && !name.startsWith("margin-"))
			return undefined;
		return `${number}${match[2] ?? "px"}`;
	}
	if (
		name === "opacity" &&
		/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) &&
		Number.isFinite(Number(value))
	)
		return String(Number(value));
	if (
		name === "z-index" &&
		(value === "auto" ||
			(/^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value))))
	)
		return value === "auto" ? value : String(Number(value));
	if (name === "color" || name === "background-color") {
		return normalizeCssColor(value);
	}
	return undefined;
}

export function expandDeclaration(
	name: string,
	input: string,
	important: boolean,
): InlineDeclaration[] {
	if (
		!name.startsWith("--") &&
		supported.has(name) &&
		/var\s*\(|\\/i.test(input)
	) {
		const parsed = parseVariableValue(input);
		if (!parsed) return [];
		if (parsed.variables)
			return [
				{
					name,
					value: input,
					important,
					...(inlineDeclarationComponents(name).length > 1
						? { pending: true }
						: {}),
				},
			];
	}
	const source = name.startsWith("--")
		? input
		: withoutCssComments(input).trim();
	if (isBorderShorthand(name))
		return (
			parseBorderShorthand(
				name,
				source.toLowerCase().replace(/[\t\n\f\r ]+/g, " "),
			)?.map(({ property, value }) => ({ name: property, value, important })) ??
			[]
		);
	if (name === "background")
		return (
			parseBackgroundShorthand(source)?.map(({ property, value }) => ({
				name: property,
				value,
				important,
			})) ?? []
		);
	if (name === "margin" || name === "padding") {
		const parts = splitLengthComponents(source.toLowerCase());
		if (
			!parts ||
			parts.length < 1 ||
			parts.length > 4 ||
			(parts.length > 1 && parts.some((part) => wide.has(part)))
		)
			return [];
		const values = [
			parts[0],
			parts[1] ?? parts[0],
			parts[2] ?? parts[0],
			parts[3] ?? parts[1] ?? parts[0],
		];
		const expanded = sides.map((side, index) => ({
			name: `${name}-${side}`,
			value: normalize(`${name}-${side}`, values[index]),
			important,
		}));
		return expanded.every((entry) => entry.value !== undefined)
			? (expanded as InlineDeclaration[])
			: [];
	}
	const value = normalize(name, source);
	return value === undefined ? [] : [{ name, value, important }];
}

export function parseInlineDeclarations(
	source: string,
	maxDeclarations: number,
): InlineDeclaration[] {
	let count = 0;
	const result: InlineDeclaration[] = [];
	for (const statement of cssDeclarationStatements(source, () => {})) {
		if (!trim(statement)) continue;
		if (++count > maxDeclarations)
			throw new AgentBrowserError(
				"resource-limit",
				"CSS declaration limit exceeded",
			);
		const parsed = tokens(statement);
		if (!parsed) continue;
		const colon = cssDeclarationColon(parsed.value);
		if (colon < 0) continue;
		const name = declarationName(
			trim(withoutCssComments(parsed.value.slice(0, colon))),
		);
		for (const entry of expandDeclaration(
			name,
			trim(parsed.value.slice(colon + 1)),
			parsed.important,
		)) {
			const previous = result.findIndex(
				(existing) => existing.name === entry.name,
			);
			if (previous >= 0) {
				if (result[previous].important && !entry.important) continue;
				result.splice(previous, 1);
			}
			result.push(entry);
			if (result.length > maxDeclarations)
				throw new AgentBrowserError(
					"resource-limit",
					"CSS declaration limit exceeded",
				);
		}
	}
	return result;
}

export function inlineDeclarationComponents(name: string): readonly string[] {
	if (name === "all")
		return parseCssDeclarations(
			"all:initial",
			{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 1 },
			() => {},
		).map((entry) => entry.property);
	return isBorderShorthand(name)
		? (parseBorderShorthand(name, "initial")?.map((entry) => entry.property) ??
				[])
		: name === "margin" || name === "padding"
			? sides.map((side) => `${name}-${side}`)
			: name === "background"
				? cssBackgroundProperties
				: [name];
}

export function propertyDeclarations(
	entries: InlineDeclaration[],
	name: string,
): InlineDeclaration[] {
	const names = inlineDeclarationComponents(name);
	return [
		...names.flatMap((wanted) =>
			entries.filter((entry) => entry.name === wanted),
		),
		...entries.filter((entry) => entry.name === name && !names.includes(name)),
	];
}

function winningEntry(
	entries: InlineDeclaration[],
	name: string,
): InlineDeclaration | undefined {
	let winner: InlineDeclaration | undefined;
	for (const entry of entries) {
		if (
			entry.name !== name &&
			!(entry.pending && inlineDeclarationComponents(entry.name).includes(name))
		)
			continue;
		if (!winner || entry.important || !winner.important) winner = entry;
	}
	return winner;
}

export function propertyValue(
	entries: InlineDeclaration[],
	name: string,
): string {
	const components = inlineDeclarationComponents(name);
	const pending = entries.find((entry) => entry.name === name && entry.pending);
	if (
		pending &&
		components.every(
			(component) => winningEntry(entries, component) === pending,
		)
	)
		return pending.value;
	if (components.some((component) => winningEntry(entries, component)?.pending))
		return "";
	const found = propertyDeclarations(entries, name).filter(
		(entry) => !entry.pending,
	);
	if (isBorderShorthand(name)) {
		const expected = parseBorderShorthand(name, "initial")?.length;
		if (
			found.length !== expected ||
			found.some((entry) => entry.important !== found[0]?.important)
		)
			return "";
		const values = found.map((entry) => entry.value);
		if (values.some((value) => wide.has(value)))
			return values.every((value) => value === values[0]) ? values[0] : "";
		if (["border-width", "border-style", "border-color"].includes(name)) {
			if (values[3] === values[1]) values.pop();
			if (values.length === 3 && values[2] === values[0]) values.pop();
			if (values.length === 2 && values[1] === values[0]) values.pop();
			return values.join(" ");
		}
		if (
			name === "border" &&
			values.some((value, index) => value !== values[index % 3])
		)
			return "";
		return values.slice(0, 3).join(" ");
	}
	if (name !== "margin" && name !== "padding" && name !== "background")
		return found[0]?.value ?? "";
	if (
		found.length !==
			(name === "background" ? cssBackgroundProperties.length : 4) ||
		found.some((entry) => entry.important !== found[0].important)
	)
		return "";
	const values = found.map((entry) => entry.value);
	if (name === "background") return serializeBackgroundValues(values);
	if (values.some((value) => wide.has(value)))
		return values.every((value) => value === values[0]) ? values[0] : "";
	if (values[3] === values[1]) values.pop();
	if (values.length === 3 && values[2] === values[0]) values.pop();
	if (values.length === 2 && values[1] === values[0]) values.pop();
	return values.join(" ");
}

export function serializeDeclarations(entries: InlineDeclaration[]): string {
	const emitted = new Set<string>();
	const output: string[] = [];
	for (const entry of entries) {
		if (emitted.has(entry.name)) continue;
		if (entry.pending) {
			output.push(
				`${entry.name}: ${entry.value}${entry.important ? " !important" : ""};`,
			);
			continue;
		}
		const shorthand = /^(margin|padding|background)-/.exec(entry.name)?.[1];
		const value =
			shorthand &&
			!entries.some(
				(candidate) => candidate.name === "all" || candidate.pending,
			)
				? propertyValue(entries, shorthand)
				: "";
		if (shorthand && value) {
			for (const component of propertyDeclarations(entries, shorthand))
				emitted.add(component.name);
			output.push(
				`${shorthand}: ${value}${entry.important ? " !important" : ""};`,
			);
		} else
			output.push(
				`${entry.name}: ${entry.value}${entry.important ? " !important" : ""};`,
			);
	}
	return output.join(" ");
}

export function directDeclaration(
	name: string,
	source: string,
	important: boolean,
): InlineDeclaration[] {
	const parsed = tokens(source);
	return parsed && !parsed.important
		? expandDeclaration(name, parsed.value, important)
		: [];
}
