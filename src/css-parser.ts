import { parseBackgroundShorthand } from "./css-background.js";
import {
	cssFlexProperties,
	isCssFlexProperty,
	flexShorthandComponents,
	parseFlexDeclarations,
	type CssFlexProperty,
} from "./css-flex.js";
import {
	cssFlowProperties,
	isCssFlowProperty,
	parseFlowDeclarations,
	type CssFlowProperty,
} from "./css-flow.js";
import { isBorderShorthand, parseBorderShorthand } from "./css-border.js";
import { compileCssMedia } from "./css-media.js";
import {
	type CssBoxProperty,
	cssBoxProperties,
	isCssBoxProperty,
	parseBoxDeclarations,
} from "./css-box.js";
import {
	type CssPaintProperty,
	cssPaintProperties,
	isCssPaintProperty,
	parsePaintValue,
} from "./css-paint.js";
import {
	type CssTextProperty,
	cssTextProperties,
	isCssTextProperty,
	parseTextValue,
} from "./css-text.js";
import { AgentBrowserError } from "./errors.js";
import {
	cssDeclarationColon,
	customPropertyName,
	parseVariableValue,
	splitCssValue,
	withoutCssComments,
} from "./css-variables.js";

export type VisibilityProperty = "display" | "visibility";
export type CssProperty =
	| VisibilityProperty
	| CssBoxProperty
	| CssTextProperty
	| CssPaintProperty
	| CssFlowProperty
	| CssFlexProperty
	| `--${string}`;
export interface CssDeclaration {
	property: CssProperty;
	value: string;
	important: boolean;
	substitution?: string;
}
export interface CssRule {
	selector: string;
	declarations: CssDeclaration[];
	media: string[];
}
export interface CssParseBudget {
	rules: number;
	declarations: number;
	maxRules: number;
	maxDeclarations: number;
}
export interface StyleViewport {
	width: number;
	height: number;
}
export type CssIssue = (code: string) => void;

const globals = new Set(["initial", "inherit", "unset", "revert"]);
const displays = new Set([
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
	"block flow",
	"inline flow",
	"block flow-root",
	"inline flow-root",
	"block flex",
	"inline flex",
	"block grid",
	"inline grid",
	"block table",
	"inline table",
]);
const withoutComments = (value: string) =>
	value.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");

class CssScanner {
	position = 0;
	constructor(
		readonly source: string,
		readonly issue: CssIssue,
	) {}
	read(stops: string, braces = false) {
		const start = this.position;
		const stack: string[] = [];
		while (this.position < this.source.length) {
			const character = this.source[this.position];
			if (this.source.startsWith("/*", this.position)) {
				const end = this.source.indexOf("*/", this.position + 2);
				if (end < 0) {
					this.issue("unterminated-css-comment");
					this.position = this.source.length;
					break;
				}
				this.position = end + 2;
				continue;
			}
			if (character === "\\") {
				this.position = Math.min(this.position + 2, this.source.length);
				continue;
			}
			if (character === '"' || character === "'") {
				const quote = character;
				this.position++;
				while (
					this.position < this.source.length &&
					this.source[this.position] !== quote
				) {
					if (this.source[this.position] === "\\") this.position++;
					this.position++;
				}
				if (this.position < this.source.length) this.position++;
				else this.issue("unterminated-css-string");
				continue;
			}
			if (!stack.length && stops.includes(character)) {
				this.position++;
				return {
					text: this.source.slice(start, this.position - 1),
					stop: character,
				};
			}
			if (
				character === "(" ||
				character === "[" ||
				(braces && character === "{")
			) {
				stack.push(character === "(" ? ")" : character === "[" ? "]" : "}");
				if (stack.length > 32)
					throw new AgentBrowserError(
						"resource-limit",
						"CSS component nesting limit exceeded",
					);
			} else if (stack[stack.length - 1] === character) stack.pop();
			this.position++;
		}
		return { text: this.source.slice(start), stop: undefined };
	}
}

export function* cssDeclarationStatements(source: string, issue: CssIssue) {
	const scanner = new CssScanner(source, issue);
	while (scanner.position < source.length) yield scanner.read(";", true).text;
}

export function parseCssDeclarations(
	source: string,
	budget: CssParseBudget,
	issue: CssIssue,
): CssDeclaration[] {
	const declarations: CssDeclaration[] = [];
	for (const statement of cssDeclarationStatements(source, issue)) {
		const colon = cssDeclarationColon(statement);
		if (colon < 0) {
			if (withoutComments(statement).trim()) issue("invalid-css-declaration");
			continue;
		}
		if (++budget.declarations > budget.maxDeclarations)
			throw new AgentBrowserError(
				"resource-limit",
				"CSS declaration limit exceeded",
			);
		const rawProperty = withoutComments(statement.slice(0, colon)).trim();
		const custom = customPropertyName(rawProperty);
		const property = custom ?? rawProperty.toLowerCase();
		const raw = splitCssValue(statement.slice(colon + 1));
		if (!raw) {
			issue("unimplemented-or-invalid-css-value");
			continue;
		}
		const { important } = raw;
		if (custom) {
			if (parseVariableValue(raw.value))
				declarations.push({
					property: custom as `--${string}`,
					value: raw.value,
					important,
				});
			else issue("unimplemented-or-invalid-css-value");
			continue;
		}
		let value = withoutCssComments(raw.value).trim().toLowerCase();
		value = value.replace(/[\t\n\f\r ]+/g, " ");
		if (
			![
				"display",
				"visibility",
				"all",
				"margin",
				"padding",
				"background",
			].includes(property) &&
			!isBorderShorthand(property) &&
			!isCssBoxProperty(property) &&
			!isCssTextProperty(property) &&
			!isCssPaintProperty(property) &&
			!isCssFlowProperty(property) &&
			property !== "overflow" &&
			!isCssFlexProperty(property) &&
			!flexShorthandComponents(property)
		) {
			issue("unimplemented-css-property");
			continue;
		}
		if (/var\s*\(|\\/i.test(raw.value)) {
			const parsed = parseVariableValue(raw.value);
			if (!parsed) {
				issue("unimplemented-or-invalid-css-value");
				continue;
			}
			if (parsed.variables) {
				const targets = parseCssDeclarations(
					`${property}:initial`,
					{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 1 },
					issue,
				);
				for (const target of targets)
					declarations.push({
						property: target.property,
						value: raw.value,
						important,
						substitution: property,
					});
				continue;
			}
		}
		if (property === "all" && globals.has(value)) {
			declarations.push(
				{ property: "display", value, important },
				{ property: "visibility", value, important },
				...cssFlexProperties.map((property) => ({
					property,
					value,
					important,
				})),
				...cssFlowProperties.map((property) => ({
					property,
					value,
					important,
				})),
				...cssBoxProperties.map((property) => ({ property, value, important })),
				...cssPaintProperties.map((property) => ({
					property,
					value,
					important,
				})),
				...cssTextProperties.map((property) => ({
					property,
					value,
					important,
				})),
			);
			continue;
		}
		if (isCssFlowProperty(property) || property === "overflow") {
			const expanded = parseFlowDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else issue("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssFlexProperty(property) || flexShorthandComponents(property)) {
			const expanded = parseFlexDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else issue("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isBorderShorthand(property)) {
			const expanded = parseBorderShorthand(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else issue("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssTextProperty(property)) {
			const normalized = parseTextValue(property, value);
			if (normalized !== undefined)
				declarations.push({ property, value: normalized, important });
			else issue("unimplemented-or-invalid-css-value");
			continue;
		}
		if (property === "background") {
			const expanded = parseBackgroundShorthand(value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else issue("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssPaintProperty(property)) {
			const normalized = parsePaintValue(value, property);
			if (normalized !== undefined)
				declarations.push({ property, value: normalized, important });
			else issue("unimplemented-or-invalid-css-value");
			continue;
		}
		if (
			isCssBoxProperty(property) ||
			property === "margin" ||
			property === "padding"
		) {
			const expanded = parseBoxDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((declaration) => ({ ...declaration, important })),
				);
			else issue("unimplemented-or-invalid-css-value");
			continue;
		}
		if (
			(property === "display" && (displays.has(value) || globals.has(value))) ||
			(property === "visibility" &&
				(["visible", "hidden", "collapse"].includes(value) ||
					globals.has(value)))
		)
			declarations.push({
				property: property as VisibilityProperty,
				value,
				important,
			});
		else issue("unimplemented-or-invalid-css-value");
	}
	return declarations;
}

export function parseCssRules(
	source: string,
	budget: CssParseBudget,
	issue: CssIssue,
	media: string[] = [],
	depth = 0,
): CssRule[] {
	if (depth > 16)
		throw new AgentBrowserError(
			"resource-limit",
			"CSS rule nesting limit exceeded",
		);
	const scanner = new CssScanner(source, issue);
	const result: CssRule[] = [];
	while (scanner.position < source.length) {
		const prelude = scanner.read(";{}");
		const normalized = withoutComments(prelude.text).trim();
		if (!normalized && !prelude.stop) break;
		if (prelude.stop !== "{") {
			if (/^@import\b/i.test(normalized)) issue("css-import-not-loaded");
			else if (normalized && !/^@charset\b/i.test(normalized))
				issue("unimplemented-or-invalid-css-rule");
			continue;
		}
		const body = scanner.read("}", true);
		if (!body.stop) issue("unterminated-css-rule");
		if (++budget.rules > budget.maxRules)
			throw new AgentBrowserError("resource-limit", "CSS rule limit exceeded");
		if (/^@media\b/i.test(normalized)) {
			result.push(
				...parseCssRules(
					body.text,
					budget,
					issue,
					[...media, normalized.slice(6).trim()],
					depth + 1,
				),
			);
			continue;
		}
		if (normalized.startsWith("@")) {
			issue("unimplemented-css-at-rule");
			continue;
		}
		const declarations = parseCssDeclarations(body.text, budget, issue);
		if (declarations.length)
			result.push({ selector: prelude.text.trim(), declarations, media });
	}
	return result;
}

export function cssMediaMatches(
	source: string,
	viewport: StyleViewport,
	issue: CssIssue,
): boolean {
	const compiled = compileCssMedia(source);
	if (compiled.unsupported) issue("unimplemented-or-invalid-media-query");
	return compiled.matches(viewport);
}
