import { parseBackgroundShorthand } from "./css-background.js";
import { parseFontWideDeclarations } from "./css-font.js";
import type {
	CssDiagnosticSink,
	CssDiagnosticSource,
} from "./css-diagnostics.js";
import {
	cssGridProperties,
	isCssGridProperty,
	gridShorthandComponents,
	parseGridDeclarations,
	type CssGridProperty,
} from "./css-grid.js";
import { canonicalCssProperty } from "./css-property-aliases.js";
import {
	cssOutlineProperties,
	isCssOutlineProperty,
	parseOutlineDeclarations,
	type CssOutlineProperty,
} from "./css-outline.js";
import {
	cssTextDecorationStyleProperties,
	isCssTextDecorationProperty,
	parseTextDecorationDeclarations,
	type CssTextDecorationProperty,
} from "./css-text-decoration.js";
import {
	cssListProperties,
	isCssListProperty,
	parseListDeclarations,
	type CssListProperty,
} from "./css-list.js";
import {
	cssTableProperties,
	isCssTableProperty,
	parseTableDeclarations,
	type CssTableProperty,
} from "./css-table.js";
import {
	cssInteractionProperties,
	isCssInteractionProperty,
	parseInteractionValue,
	type CssInteractionProperty,
} from "./css-interaction.js";
import {
	cssFlexProperties,
	isCssFlexProperty,
	flexShorthandComponents,
	parseFlexDeclarations,
	type CssFlexProperty,
} from "./css-flex.js";
import { isBorderShorthand, parseBorderShorthand } from "./css-border.js";
import { compileCssMedia, type MediaViewport } from "./css-media.js";
import { cssSupportsLimits, evaluateCssSupports } from "./css-supports.js";
import {
	supportsCssSelector,
	validateSelectorSyntax,
	type SelectorNestingContext,
} from "./selectors.js";
import {
	type CssBoxProperty,
	cssBoxProperties,
	isCssBoxProperty,
	parseBoxDeclarations,
} from "./css-box.js";
import {
	cssLogicalSpacingProperties,
	isCssLogicalSpacingProperty,
	logicalSpacingComponents,
	parseLogicalSpacingDeclarations,
	type CssLogicalSpacingProperty,
} from "./css-logical-box.js";
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
	cssFlowProperties,
	isCssFlowProperty,
	parseFlowDeclarations,
	type CssFlowProperty,
} from "./css-flow.js";
import {
	cssDeclarationColon,
	customPropertyName,
	parseVariableValue,
	readCssIdentifier,
	skipCssTrivia,
	splitCssValue,
	withoutCssComments,
} from "./css-variables.js";

import {
	cssRadiusProperties,
	isCssRadiusProperty,
	parseRadiusDeclarations,
	type CssRadiusProperty,
} from "./css-radius.js";

export type VisibilityProperty = "display" | "visibility";
import { parseCssContent } from "./css-content.js";

export type CssProperty =
	| "content"
	| VisibilityProperty
	| CssBoxProperty
	| CssLogicalSpacingProperty
	| CssRadiusProperty
	| CssTextProperty
	| CssPaintProperty
	| CssFlexProperty
	| CssGridProperty
	| CssFlowProperty
	| CssInteractionProperty
	| CssListProperty
	| CssTableProperty
	| CssOutlineProperty
	| CssTextDecorationProperty
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
	readonly issues?: Readonly<Record<string, number>>;
	readonly nesting?: SelectorNestingContext;
	readonly diagnosticSampleIds?: readonly number[];
	readonly diagnosticSource?: CssDiagnosticSource;
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
export type CssRuleDiagnosticSink = (
	issues: Readonly<Record<string, number>>,
	media: readonly string[],
) => void;

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

function trimCssWhitespace(value: string): string {
	let start = 0;
	let end = value.length;
	while (start < end && /[\t\n\f\r ]/.test(value[start])) start++;
	while (end > start && /[\t\n\f\r ]/.test(value[end - 1])) end--;
	return value.slice(start, end);
}

export class CssScanner {
	position = 0;
	constructor(
		readonly source: string,
		readonly issue: CssIssue,
	) {}
	skipStylesheetMarker(): boolean {
		const position = skipCssTrivia(
			this.source,
			this.position === 0 && this.source[0] === "\ufeff" ? 1 : this.position,
			this.source.length,
		);
		const width = this.source.startsWith("<!--", position)
			? 4
			: this.source.startsWith("-->", position)
				? 3
				: 0;
		if (width === 0) return false;
		this.position = position + width;
		return true;
	}
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
	diagnostic?: CssDiagnosticSink,
): CssDeclaration[] {
	const declarations: CssDeclaration[] = [];
	for (const statement of cssDeclarationStatements(source, issue)) {
		const colon = cssDeclarationColon(statement);
		if (colon < 0) {
			if (withoutComments(statement).trim()) {
				issue("invalid-css-declaration");
				diagnostic?.("invalid-css-declaration");
			}
			continue;
		}
		if (++budget.declarations > budget.maxDeclarations)
			throw new AgentBrowserError(
				"resource-limit",
				"CSS declaration limit exceeded",
			);
		const rawProperty = withoutComments(statement.slice(0, colon)).trim();
		const custom = customPropertyName(rawProperty);
		const property = custom ?? canonicalCssProperty(rawProperty.toLowerCase());
		const valueSource = statement.slice(colon + 1);
		const raw = splitCssValue(valueSource);
		const reject = (code: string) => {
			issue(code);
			diagnostic?.(code, {
				authoredProperty: rawProperty,
				property,
				value: trimCssWhitespace(valueSource),
				...(raw ? { important: raw.important } : {}),
			});
		};
		if (!raw) {
			reject("unimplemented-or-invalid-css-value");
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
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		const grid =
			isCssGridProperty(property) || gridShorthandComponents(property);
		raw.value = trimCssWhitespace(
			raw.important
				? new CssScanner(valueSource, issue).read("!", true).text
				: valueSource,
		);
		let value = trimCssWhitespace(
			property === "content" ? raw.value : withoutCssComments(raw.value),
		);
		if (
			!grid &&
			property !== "content" &&
			property !== "font-family" &&
			property !== "fill" &&
			property !== "stroke" &&
			property !== "clip-path" &&
			property !== "background" &&
			property !== "background-image"
		)
			value = value
				.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
				.replace(/[\t\n\f\r ]+/g, " ");
		if (
			![
				"display",
				"visibility",
				"all",
				"margin",
				"padding",
				"background",
				"font",
				"content",
			].includes(property) &&
			!isBorderShorthand(property) &&
			property !== "border-radius" &&
			!isCssRadiusProperty(property) &&
			!isCssBoxProperty(property) &&
			!isCssLogicalSpacingProperty(property) &&
			!logicalSpacingComponents(property) &&
			!isCssTextProperty(property) &&
			!isCssPaintProperty(property) &&
			!isCssFlexProperty(property) &&
			!grid &&
			!isCssFlowProperty(property) &&
			!isCssInteractionProperty(property) &&
			!isCssListProperty(property) &&
			!isCssTableProperty(property) &&
			!isCssOutlineProperty(property) &&
			property !== "outline" &&
			!isCssTextDecorationProperty(property) &&
			property !== "text-decoration" &&
			property !== "list-style" &&
			property !== "overflow" &&
			!flexShorthandComponents(property)
		) {
			reject("unimplemented-css-property");
			continue;
		}
		if (
			(isCssTextDecorationProperty(property) ||
				property === "text-decoration") &&
			raw.value.length > 4096
		) {
			reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (/var\s*\(|\\/i.test(raw.value)) {
			const parsed = parseVariableValue(raw.value);
			if (!parsed) {
				reject("unimplemented-or-invalid-css-value");
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
				{ property: "content", value, important },
				...cssTextDecorationStyleProperties.map((property) => ({
					property,
					value,
					important,
				})),
				...cssOutlineProperties.map((property) => ({
					property,
					value,
					important,
				})),
				...cssListProperties.map((property) => ({
					property,
					value,
					important,
				})),
				...cssTableProperties.map((property) => ({
					property,
					value,
					important,
				})),
				{ property: "display", value, important },
				{ property: "visibility", value, important },
				...cssInteractionProperties.map((property) => ({
					property,
					value,
					important,
				})),
				...cssBoxProperties.map((property) => ({ property, value, important })),
				...cssLogicalSpacingProperties.map((property) => ({
					property,
					value,
					important,
				})),
				...cssGridProperties.map((property) => ({
					property,
					value,
					important,
				})),
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
				...cssRadiusProperties.map((property) => ({
					property,
					value,
					important,
				})),
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
		if (property === "font") {
			const expanded = parseFontWideDeclarations(value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (property === "content") {
			const keyword = trimCssWhitespace(
				withoutCssComments(value),
			).toLowerCase();
			const parsed = globals.has(keyword)
				? keyword
				: parseCssContent(value)?.value;
			if (parsed !== undefined)
				declarations.push({ property, value: parsed, important });
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (
			isCssTextDecorationProperty(property) ||
			property === "text-decoration"
		) {
			const expanded = parseTextDecorationDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssOutlineProperty(property) || property === "outline") {
			const expanded = parseOutlineDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssTableProperty(property)) {
			const expanded = parseTableDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssListProperty(property) || property === "list-style") {
			const expanded = parseListDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssInteractionProperty(property)) {
			const normalized = parseInteractionValue(value, property);
			if (normalized !== undefined)
				declarations.push({ property, value: normalized, important });
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssFlowProperty(property) || property === "overflow") {
			const expanded = parseFlowDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (grid) {
			const expanded = parseGridDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssFlexProperty(property) || flexShorthandComponents(property)) {
			const expanded = parseFlexDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssRadiusProperty(property) || property === "border-radius") {
			const expanded = parseRadiusDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isBorderShorthand(property)) {
			const expanded = parseBorderShorthand(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssTextProperty(property)) {
			const normalized = parseTextValue(property, value);
			if (normalized !== undefined)
				declarations.push({ property, value: normalized, important });
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (property === "background") {
			const expanded = parseBackgroundShorthand(value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (isCssPaintProperty(property)) {
			const normalized = parsePaintValue(value, property);
			if (normalized !== undefined)
				declarations.push({ property, value: normalized, important });
			else reject("unimplemented-or-invalid-css-value");
			continue;
		}
		if (
			isCssLogicalSpacingProperty(property) ||
			logicalSpacingComponents(property)
		) {
			const expanded = parseLogicalSpacingDeclarations(property, value);
			if (expanded)
				declarations.push(
					...expanded.map((entry) => ({ ...entry, important })),
				);
			else reject("unimplemented-or-invalid-css-value");
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
			else reject("unimplemented-or-invalid-css-value");
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
		else reject("unimplemented-or-invalid-css-value");
	}
	return declarations;
}

export function cssSupportsDeclaration(
	property: string,
	value: string,
): boolean {
	if (property.length + value.length + 1 > cssSupportsLimits.maxSourceCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"CSS support query limit exceeded",
		);
	const name = readCssIdentifier(property, 0);
	if (
		!name ||
		name.end !== property.length ||
		name.value !== property ||
		!property
	)
		return false;
	if (!splitCssValue(value)) return false;
	let invalid = false;
	const declarations = parseCssDeclarations(
		`${property}:${value}`,
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 1 },
		() => {
			invalid = true;
		},
	);
	return (
		!invalid &&
		declarations.length > 0 &&
		declarations.every((declaration) => {
			if (declaration.substitution || globals.has(declaration.value))
				return true;
			if (declaration.property === "display")
				return [
					"none",
					"contents",
					"block",
					"inline",
					"inline-block",
					"flow-root",
					"flex",
					"inline-flex",
					"block flow",
					"inline flow",
					"block flow-root",
					"inline flow-root",
					"block flex",
					"inline flex",
				].includes(declaration.value);
			if (declaration.property === "position")
				return ["static", "relative", "absolute", "fixed"].includes(
					declaration.value,
				);
			if (declaration.property === "float" || declaration.property === "clear")
				return declaration.value === "none";
			if (
				declaration.property === "overflow-x" ||
				declaration.property === "overflow-y"
			)
				return declaration.value === "visible";
			return true;
		})
	);
}

export function cssSupportsCondition(
	source: string,
	allowBareDeclaration = false,
): boolean {
	return evaluateCssSupports(
		source,
		cssSupportsDeclaration,
		allowBareDeclaration,
		supportsCssSelector,
	);
}

function parseStyleRuleBody(
	source: string,
	selector: string,
	media: string[],
	depth: number,
	budget: CssParseBudget,
	issue: CssIssue,
	diagnostics?: CssRuleDiagnosticSink,
	nesting?: SelectorNestingContext,
	scopedGlobalIssue?: CssIssue,
	diagnostic?: CssDiagnosticSink,
): CssRule[] {
	if (depth > 16)
		throw new AgentBrowserError(
			"resource-limit",
			"CSS rule nesting limit exceeded",
		);
	const result: CssRule[] = [];
	const scanner = new CssScanner(source, () => {});
	let segmentStart = 0;
	const globalIssue =
		scopedGlobalIssue ??
		((code: string) => {
			issue(code);
			diagnostics?.(Object.freeze({ [code]: 1 }), Object.freeze([...media]));
		});
	const nestedIssue = (code: string) => {
		issue(code);
		if (diagnostics)
			result.push({
				selector,
				declarations: [],
				media,
				issues: Object.freeze({ [code]: 1 }),
				...(nesting ? { nesting } : {}),
				...(diagnostic?.source ? { diagnosticSource: diagnostic.source } : {}),
			});
	};
	const declarations = (end: number) => {
		const diagnosticSampleIds: number[] | undefined = diagnostic
			? []
			: undefined;
		const ruleIssues: Record<string, number> | undefined = diagnostics
			? Object.create(null)
			: undefined;
		const parsed = parseCssDeclarations(
			source.slice(segmentStart, end),
			budget,
			(code) => {
				if (
					code === "unterminated-css-comment" ||
					code === "unterminated-css-string"
				) {
					globalIssue(code);
					return;
				}
				issue(code);
				if (ruleIssues) ruleIssues[code] = (ruleIssues[code] ?? 0) + 1;
			},
			diagnostic
				? (code, context) => {
						const id = diagnostic(code, {
							...context,
							selector,
							scope: "rule",
							...(nesting ? { nesting } : {}),
						});
						if (id !== undefined) diagnosticSampleIds!.push(id);
						return id;
					}
				: undefined,
		);
		const retained =
			ruleIssues && Object.keys(ruleIssues).length
				? Object.freeze(ruleIssues)
				: undefined;
		if (parsed.length || retained || diagnosticSampleIds?.length)
			result.push({
				selector,
				declarations: parsed,
				media,
				...(retained ? { issues: retained } : {}),
				...(nesting ? { nesting } : {}),
				...(diagnosticSampleIds?.length
					? { diagnosticSampleIds: Object.freeze(diagnosticSampleIds) }
					: {}),
				...(diagnostic?.source ? { diagnosticSource: diagnostic.source } : {}),
			});
	};
	const parent: SelectorNestingContext = Object.freeze({
		selector,
		...(nesting ? { parent: nesting } : {}),
	});
	while (scanner.position < source.length) {
		const start = scanner.position;
		const prelude = scanner.read(";{}");
		const preludeStart = skipCssTrivia(prelude.text, 0, prelude.text.length);
		const atName =
			prelude.text[preludeStart] === "@"
				? readCssIdentifier(prelude.text, preludeStart + 1)
				: undefined;
		if (prelude.stop !== "{") {
			if (atName) {
				declarations(start);
				globalIssue("unimplemented-css-at-rule");
				segmentStart = scanner.position;
			}
			continue;
		}
		const colon = cssDeclarationColon(prelude.text);
		if (
			colon >= 0 &&
			customPropertyName(
				withoutCssComments(prelude.text.slice(0, colon)).trim(),
			)
		) {
			scanner.position = start;
			scanner.read(";", true);
			continue;
		}
		declarations(start);
		const body = scanner.read("}", true);
		segmentStart = scanner.position;
		if (!body.stop) globalIssue("unterminated-css-rule");
		if (++budget.rules > budget.maxRules)
			throw new AgentBrowserError("resource-limit", "CSS rule limit exceeded");
		const name = atName?.value.toLowerCase();
		if (name === "media" || name === "supports") {
			const condition = prelude.text.slice(atName!.end).trim();
			const active = name === "media" || cssSupportsCondition(condition);
			const nested = parseStyleRuleBody(
				body.text,
				selector,
				name === "media" ? [...media, condition] : media,
				depth + 1,
				budget,
				active ? issue : () => {},
				active ? diagnostics : undefined,
				nesting,
				name === "supports" ? (active ? globalIssue : () => {}) : undefined,
				active ? diagnostic : undefined,
			);
			if (active) result.push(...nested);
			continue;
		}
		if (atName) {
			globalIssue("unimplemented-css-at-rule");
			continue;
		}
		const nestedSelector = prelude.text.slice(preludeStart).trim();
		let accepted = true;
		try {
			validateSelectorSyntax(nestedSelector, { nesting: parent });
		} catch (error) {
			if (
				!(error instanceof AgentBrowserError) ||
				(error.code !== "invalid-input" && error.code !== "unsupported")
			)
				throw error;
			accepted = false;
			if (error.code === "invalid-input")
				nestedIssue("discarded-invalid-nested-css-rule");
			else globalIssue("unimplemented-nested-css-selector");
		}
		const nested = parseStyleRuleBody(
			body.text,
			nestedSelector,
			media,
			depth + 1,
			budget,
			accepted ? issue : () => {},
			accepted ? diagnostics : undefined,
			parent,
			accepted ? globalIssue : () => {},
			accepted ? diagnostic : undefined,
		);
		if (accepted) result.push(...nested);
	}
	declarations(source.length);
	return result;
}

export function parseCssRules(
	source: string,
	budget: CssParseBudget,
	issue: CssIssue,
	media: string[] = [],
	depth = 0,
	resolveImport?: (
		start: number,
		media: readonly string[],
		depth: number,
	) => readonly CssRule[] | undefined,
	diagnostics?: CssRuleDiagnosticSink,
	topLevel = true,
	diagnostic?: CssDiagnosticSink,
): CssRule[] {
	if (typeof topLevel !== "boolean")
		throw new AgentBrowserError("invalid-input", "Invalid stylesheet context");
	if (depth > 16)
		throw new AgentBrowserError(
			"resource-limit",
			"CSS rule nesting limit exceeded",
		);
	const globalIssues: Record<string, number> | undefined = diagnostics
		? Object.create(null)
		: undefined;
	const globalIssue = globalIssues
		? (code: string) => {
				issue(code);
				globalIssues[code] = (globalIssues[code] ?? 0) + 1;
			}
		: issue;
	let scannerIssues = 0;
	const scanner = new CssScanner(source, (code) => {
		scannerIssues++;
		globalIssue(code);
	});
	const result: CssRule[] = [];
	while (scanner.position < source.length) {
		if (topLevel && scanner.skipStylesheetMarker()) continue;
		const start = scanner.position;
		const beforeIssues = scannerIssues;
		const prelude = scanner.read(";{}");
		const normalized = withoutCssComments(prelude.text).trim();
		const preludeStart = skipCssTrivia(
			prelude.text,
			start === 0 && prelude.text[0] === "\ufeff" ? 1 : 0,
			prelude.text.length,
		);
		const atName =
			prelude.text[preludeStart] === "@"
				? readCssIdentifier(prelude.text, preludeStart + 1)
				: undefined;
		if (!normalized && !prelude.stop) break;
		if (prelude.stop !== "{") {
			if (atName?.value.toLowerCase() === "import") {
				const imported =
					prelude.stop === ";"
						? resolveImport?.(start, media, depth)
						: undefined;
				if (imported) result.push(...imported);
				else globalIssue("css-import-not-loaded");
			} else if (normalized && !/^@charset\b/i.test(normalized))
				globalIssue(
					!atName &&
						prelude.stop === undefined &&
						scannerIssues === beforeIssues
						? "discarded-incomplete-css-rule"
						: "unimplemented-or-invalid-css-rule",
				);
			continue;
		}
		const body = scanner.read("}", true);
		if (!body.stop) globalIssue("unterminated-css-rule");
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
					undefined,
					diagnostics,
					false,
					diagnostic,
				),
			);
			continue;
		}
		if (atName?.value.toLowerCase() === "supports") {
			const active = cssSupportsCondition(prelude.text.slice(atName.end));
			const nested = parseCssRules(
				body.text,
				budget,
				active ? issue : () => {},
				media,
				depth + 1,
				undefined,
				active ? diagnostics : undefined,
				false,
				active ? diagnostic : undefined,
			);
			if (active) result.push(...nested);
			continue;
		}
		if (normalized.startsWith("@")) {
			globalIssue("unimplemented-css-at-rule");
			continue;
		}
		result.push(
			...parseStyleRuleBody(
				body.text,
				prelude.text.slice(preludeStart).trim(),
				media,
				depth,
				budget,
				issue,
				diagnostics,
				undefined,
				globalIssue,
				diagnostic,
			),
		);
	}
	if (diagnostics && globalIssues && Object.keys(globalIssues).length)
		diagnostics(Object.freeze(globalIssues), Object.freeze([...media]));
	return result;
}

export function cssMediaMatches(
	source: string,
	viewport: MediaViewport,
	issue: CssIssue,
): boolean {
	const compiled = compileCssMedia(source);
	if (compiled.unsupported) issue("unimplemented-or-invalid-media-query");
	return compiled.matches(viewport);
}
