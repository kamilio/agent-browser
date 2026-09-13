import {
	cssBackgroundProperties,
	isNeutralBackgroundProperty,
	parseBackgroundComponent,
	parseBackgroundShorthand,
	serializeBackgroundValues,
} from "./css-background.js";
import { normalizeCssColor } from "./css-color.js";
import {
	cssGridProperties,
	isCssGridProperty,
	gridShorthandComponents,
	parseGridDeclarations,
	parseGridValue,
	serializeGridShorthand,
} from "./css-grid.js";
import { parsePaintValue } from "./css-paint.js";
import { canonicalCssProperty } from "./css-property-aliases.js";
import {
	cssOutlineProperties,
	isCssOutlineProperty,
	parseOutlineDeclarations,
	parseOutlineValue,
} from "./css-outline.js";
import {
	cssTextDecorationProperties,
	isCssTextDecorationProperty,
	parseTextDecorationDeclarations,
	parseTextDecorationValue,
} from "./css-text-decoration.js";
import {
	cssListProperties,
	isCssListProperty,
	parseListValue,
	parseListDeclarations,
	serializeListStyle,
} from "./css-list.js";
import {
	cssTableProperties,
	isCssTableProperty,
	parseTableValue,
} from "./css-table.js";
import {
	cssInteractionProperties,
	isCssInteractionProperty,
	parseInteractionValue,
} from "./css-interaction.js";
import {
	cssFlexProperties,
	isCssFlexProperty,
	parseFlexValue,
	flexShorthandComponents,
	parseFlexDeclarations,
	serializeFlexShorthand,
} from "./css-flex.js";
import {
	cssFlowProperties,
	isCssFlowProperty,
	parseFlowValue,
	parseFlowDeclarations,
	serializeOverflow,
} from "./css-flow.js";
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
	pending?: string;
}

const wide = new Set(["initial", "inherit", "unset", "revert"]);
const sides = ["top", "right", "bottom", "left"];
const keywords: Record<string, string[]> = {
	display:
		"none contents block inline inline-block list-item flex inline-flex grid inline-grid flow-root table inline-table table-row table-cell table-row-group table-header-group table-footer-group table-column table-column-group table-caption".split(
			" ",
		),
	visibility: ["visible", "hidden", "collapse"],
	"box-sizing": ["content-box", "border-box"],
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
	...cssTextDecorationProperties,
	"text-decoration",
	...cssOutlineProperties,
	"outline",
	...cssListProperties,
	"list-style",
	...cssTableProperties,
	...cssInteractionProperties,
	...cssGridProperties,
	"grid-row",
	"grid-column",
	"grid-area",
	...cssFlexProperties,
	"flex",
	"flex-flow",
	"gap",
	...cssFlowProperties,
	"overflow",
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
	"color",
	"caret-color",
	"accent-color",
	"stop-color",
	"stop-opacity",
	"fill",
	"fill-opacity",
	"fill-rule",
	"clip-path",
	"clip-rule",
	"stroke",
	"stroke-opacity",
	"stroke-width",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-miterlimit",
	"background",
	...cssBackgroundProperties,
];
const supported = new Set(inlineProperties);
let allComponents: readonly string[] | undefined;
function trim(value: string): string {
	let start = 0;
	let end = value.length;
	while (start < end && /[\t\n\f\r ]/.test(value[start])) start++;
	while (end > start && /[\t\n\f\r ]/.test(value[end - 1])) end--;
	return value.slice(start, end);
}

export function declarationName(name: string): string {
	return name.startsWith("--")
		? (customPropertyName(name) ?? name)
		: canonicalCssProperty(
				name.replace(/[A-Z]/g, (letter) => letter.toLowerCase()),
			);
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
	if (name === "font-family") return parseTextValue(name, source);
	if (isCssGridProperty(name)) return parseGridValue(name, source);
	if (isCssTableProperty(name)) return parseTableValue(name, source);
	if (name === "fill" || name === "stroke" || name === "clip-path")
		return parsePaintValue(source, name);
	const value = source.toLowerCase().replace(/[\t\n\f\r ]+/g, " ");
	if (wide.has(value)) return value;
	if (isCssOutlineProperty(name)) return parseOutlineValue(name, value);
	if (isCssTextDecorationProperty(name))
		return parseTextDecorationValue(name, value);
	if (isCssFlowProperty(name)) return parseFlowValue(name, value);
	if (isCssFlexProperty(name)) return parseFlexValue(name, value);
	if (name.startsWith("border-")) {
		if (name.endsWith("-width")) return normalizeBorderWidth(value);
		if (name.endsWith("-style")) return normalizeBorderStyle(value);
		if (name.endsWith("-color")) return normalizeCssColor(value);
	}
	if (isNeutralBackgroundProperty(name))
		return parseBackgroundComponent(name, value);
	if (isCssInteractionProperty(name)) return parseInteractionValue(value);
	if (isCssListProperty(name)) return parseListValue(name, value);
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
	if (name === "color" || name === "background-color") {
		return normalizeCssColor(value);
	}
	if (
		name === "caret-color" ||
		name === "accent-color" ||
		name === "stop-color" ||
		name === "stop-opacity" ||
		name === "fill-opacity" ||
		name === "fill-rule" ||
		name === "clip-rule" ||
		name === "stroke-opacity" ||
		name === "stroke-width" ||
		name === "stroke-linecap" ||
		name === "stroke-linejoin" ||
		name === "stroke-miterlimit"
	)
		return parsePaintValue(value, name);
	return undefined;
}

export function expandDeclaration(
	name: string,
	input: string,
	important: boolean,
): InlineDeclaration[] {
	const canonical = canonicalCssProperty(name);
	if (canonical !== name) return expandDeclaration(canonical, input, important);
	if (
		(isCssTextDecorationProperty(name) || name === "text-decoration") &&
		input.length > 4096
	)
		return [];
	if (
		!name.startsWith("--") &&
		supported.has(name) &&
		/var\s*\(|\\/i.test(input)
	) {
		const parsed = parseVariableValue(input);
		if (!parsed) return [];
		if (parsed.variables)
			return inlineDeclarationComponents(name).map((component) => ({
				name: component,
				value: input,
				important,
				...(inlineDeclarationComponents(name).length > 1
					? { pending: name }
					: {}),
			}));
	}
	const source = name.startsWith("--")
		? input
		: withoutCssComments(input).trim();
	if (name === "all") {
		const value = source.toLowerCase();
		return wide.has(value)
			? inlineDeclarationComponents(name).map((component) => ({
					name: component,
					value,
					important,
				}))
			: [];
	}
	if (name === "list-style")
		return (
			parseListDeclarations(
				name,
				source.toLowerCase().replace(/[\t\n\f\r ]+/g, " "),
			) ?? []
		).map((entry) => ({ name: entry.property, value: entry.value, important }));
	if (name === "text-decoration")
		return (parseTextDecorationDeclarations(name, source) ?? []).map(
			(entry) => ({ name: entry.property, value: entry.value, important }),
		);
	if (name === "outline")
		return (
			parseOutlineDeclarations(
				name,
				source.toLowerCase().replace(/[\t\n\f\r ]+/g, " "),
			) ?? []
		).map((entry) => ({ name: entry.property, value: entry.value, important }));
	if (name === "overflow")
		return (parseFlowDeclarations(name, source) ?? []).map((entry) => ({
			name: entry.property,
			value: entry.value,
			important,
		}));
	if (gridShorthandComponents(name))
		return (
			parseGridDeclarations(name, source)?.map(({ property, value }) => ({
				name: property,
				value,
				important,
			})) ?? []
		);
	if (flexShorthandComponents(name))
		return (
			parseFlexDeclarations(
				name,
				source.toLowerCase().replace(/[\t\n\f\r ]+/g, " "),
			)?.map(({ property, value }) => ({ name: property, value, important })) ??
			[]
		);
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
	const canonical = canonicalCssProperty(name);
	if (canonical !== name) return inlineDeclarationComponents(canonical);
	if (name === "list-style") return cssListProperties;
	if (name === "outline") return cssOutlineProperties.slice(0, 3);
	if (name === "text-decoration") return cssTextDecorationProperties;
	const grid = gridShorthandComponents(name);
	if (grid) return grid;
	const flex = flexShorthandComponents(name);
	if (flex) return flex;
	if (name === "overflow") return ["overflow-x", "overflow-y"];
	if (name === "all") {
		allComponents ??= Object.freeze([
			...new Set(
				parseCssDeclarations(
					"all:initial",
					{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 1 },
					() => {},
				).map((entry) => entry.property),
			),
		]);
		return allComponents;
	}
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
	entries: readonly InlineDeclaration[],
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
	entries: readonly InlineDeclaration[],
	name: string,
): InlineDeclaration | undefined {
	let winner: InlineDeclaration | undefined;
	for (const entry of entries) {
		if (entry.name !== name) continue;
		if (!winner || entry.important || !winner.important) winner = entry;
	}
	return winner;
}

export function propertyPriority(
	entries: readonly InlineDeclaration[],
	name: string,
): string {
	const components = inlineDeclarationComponents(name);
	if (
		components.length &&
		components.every((component) => winningEntry(entries, component)?.important)
	)
		return "important";
	return entries.find((entry) => entry.name === name && !entry.pending)
		?.important
		? "important"
		: "";
}

export function propertyValue(
	entries: readonly InlineDeclaration[],
	name: string,
): string {
	const canonical = canonicalCssProperty(name);
	if (canonical !== name) return propertyValue(entries, canonical);
	const components = inlineDeclarationComponents(name);
	const pending = entries.find((entry) => entry.pending === name);
	if (
		pending &&
		components.every((component) => {
			const entry = winningEntry(entries, component);
			return (
				entry?.pending === name &&
				entry.value === pending.value &&
				entry.important === pending.important
			);
		})
	)
		return pending.value;
	if (components.some((component) => winningEntry(entries, component)?.pending))
		return "";
	const found = propertyDeclarations(entries, name).filter(
		(entry) => !entry.pending,
	);
	if (name === "all") {
		const first = found[0];
		return first &&
			wide.has(first.value) &&
			found.length === components.length &&
			found.every(
				(entry) =>
					entry.value === first.value && entry.important === first.important,
			)
			? first.value
			: "";
	}
	const grid = gridShorthandComponents(name);
	if (grid) {
		if (
			found.length !== grid.length ||
			found.some((entry) => entry.important !== found[0]?.important)
		)
			return "";
		return serializeGridShorthand(
			name,
			grid.map(
				(property) =>
					found.find((entry) => entry.name === property)?.value ?? "",
			),
		);
	}
	const flex = flexShorthandComponents(name);
	if (flex) {
		if (
			found.length !== flex.length ||
			found.some((entry) => entry.important !== found[0]?.important)
		)
			return "";
		return serializeFlexShorthand(
			name,
			flex.map(
				(property) =>
					found.find((entry) => entry.name === property)?.value ?? "",
			),
		);
	}
	if (name === "overflow") {
		if (found.length !== 2 || found[0].important !== found[1].important)
			return "";
		return serializeOverflow(
			found.find((entry) => entry.name === "overflow-x")?.value ?? "",
			found.find((entry) => entry.name === "overflow-y")?.value ?? "",
		);
	}
	if (name === "list-style") {
		if (
			found.length !== cssListProperties.length ||
			found.some((entry) => entry.important !== found[0].important)
		)
			return "";
		return serializeListStyle({
			"list-style-type":
				found.find((entry) => entry.name === "list-style-type")?.value ?? "",
			"list-style-position":
				found.find((entry) => entry.name === "list-style-position")?.value ??
				"",
			"list-style-image":
				found.find((entry) => entry.name === "list-style-image")?.value ?? "",
		});
	}
	if (name === "outline" || name === "text-decoration") {
		if (
			found.length !== 3 ||
			found.some((entry) => entry.important !== found[0].important)
		)
			return "";
		const values = components.map(
			(property) => found.find((entry) => entry.name === property)?.value ?? "",
		);
		if (values.some((value) => wide.has(value)))
			return values.every((value) => value === values[0]) ? values[0] : "";
		return values.join(" ");
	}
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

interface SerializationShorthand {
	name: string;
	components: readonly string[];
}
let serializationShorthands:
	| ReadonlyMap<string, readonly SerializationShorthand[]>
	| undefined;

function shorthandsFor(name: string): readonly SerializationShorthand[] {
	if (!serializationShorthands) {
		const shorthands = [...supported]
			.map((name) => ({ name, components: inlineDeclarationComponents(name) }))
			.filter((shorthand) => shorthand.components.length > 1)
			.sort(
				(left, right) =>
					right.components.length - left.components.length ||
					(left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
			);
		const byComponent = new Map<string, SerializationShorthand[]>();
		for (const shorthand of shorthands) {
			for (const component of shorthand.components) {
				const candidates = byComponent.get(component) ?? [];
				candidates.push(shorthand);
				byComponent.set(component, candidates);
			}
		}
		serializationShorthands = byComponent;
	}
	return serializationShorthands.get(name) ?? [];
}

export function serializeDeclarations(
	entries: readonly InlineDeclaration[],
): string {
	const present = new Set(entries.map((entry) => entry.name));
	const emitted = new Set<string>();
	const output: string[] = [];
	const pendingSources = new Map<string, InlineDeclaration>();
	for (const entry of entries)
		if (entry.pending && !pendingSources.has(entry.pending))
			pendingSources.set(entry.pending, entry);
	for (const entry of entries) {
		if (emitted.has(entry.name)) continue;
		for (const shorthand of shorthandsFor(entry.name)) {
			const pending = pendingSources.get(shorthand.name);
			if (!pending) continue;
			const found = shorthand.components.map((component) =>
				winningEntry(entries, component),
			);
			if (
				found.every((candidate) => {
					if (!candidate) return false;
					if (candidate.pending)
						return (
							candidate.pending === pending.pending &&
							candidate.value === pending.value &&
							candidate.important === pending.important &&
							!emitted.has(candidate.name)
						);
					return (
						(!pending.important || candidate.important) &&
						(!emitted.has(candidate.name) ||
							(candidate.important && !pending.important))
					);
				})
			) {
				output.push(
					`${pending.pending}: ${pending.value}${pending.important ? " !important" : ""};`,
				);
				for (const candidate of found)
					if (candidate && candidate.pending === pending.pending)
						emitted.add(candidate.name);
				pendingSources.delete(shorthand.name);
				break;
			}
		}
		if (emitted.has(entry.name)) continue;
		let name = entry.name;
		let value = entry.pending ? "" : entry.value;
		for (const shorthand of shorthandsFor(entry.name)) {
			if (
				!shorthand.components.every(
					(component) => present.has(component) && !emitted.has(component),
				)
			)
				continue;
			const serialized = propertyValue(entries, shorthand.name);
			if (!serialized) continue;
			if (
				expandDeclaration(shorthand.name, serialized, entry.important)
					.length !== shorthand.components.length
			)
				continue;
			name = shorthand.name;
			value = serialized;
			for (const component of shorthand.components) emitted.add(component);
			break;
		}
		emitted.add(entry.name);
		output.push(`${name}: ${value}${entry.important ? " !important" : ""};`);
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
