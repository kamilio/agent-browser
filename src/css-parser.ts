import { AgentBrowserError } from "./errors.js";

export type VisibilityProperty = "display" | "visibility";
export interface CssDeclaration {
	property: VisibilityProperty;
	value: string;
	important: boolean;
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
		const colon = statement.indexOf(":");
		if (colon < 0) {
			if (withoutComments(statement).trim()) issue("invalid-css-declaration");
			continue;
		}
		if (++budget.declarations > budget.maxDeclarations)
			throw new AgentBrowserError(
				"resource-limit",
				"CSS declaration limit exceeded",
			);
		const property = withoutComments(statement.slice(0, colon))
			.trim()
			.toLowerCase();
		let value = withoutComments(statement.slice(colon + 1))
			.trim()
			.toLowerCase();
		const important = /!\s*important\s*$/.test(value);
		if (important) value = value.replace(/!\s*important\s*$/, "").trim();
		value = value.replace(/[\t\n\f\r ]+/g, " ");
		if (!["display", "visibility", "all"].includes(property)) {
			issue("unimplemented-css-property");
			continue;
		}
		if (property === "all" && globals.has(value)) {
			declarations.push(
				{ property: "display", value, important },
				{ property: "visibility", value, important },
			);
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
	if (!source.trim()) return true;
	const scanner = new CssScanner(withoutComments(source).toLowerCase(), issue);
	let matches = false;
	while (scanner.position < scanner.source.length) {
		let query = scanner.read(",").text.trim();
		const modifier = /^(not|only)\s+/.exec(query);
		const negate = modifier?.[1] === "not";
		const only = modifier?.[1] === "only";
		if (modifier) query = query.slice(modifier[0].length);
		const type = /^(all|screen|print)\b/.exec(query);
		let result = type?.[1] !== "print";
		if (type) query = query.slice(type[0].length).trim();
		let first = !type;
		let supported = !only || !!type;
		while (query) {
			if (!first) {
				const conjunction = /^and\s+/.exec(query);
				if (!conjunction) {
					supported = false;
					break;
				}
				query = query.slice(conjunction[0].length);
			}
			first = false;
			const feature =
				/^\(\s*((?:min-|max-)?(?:width|height))\s*:\s*(\d+(?:\.\d+)?)(px)?\s*\)/.exec(
					query,
				);
			if (!feature || (!feature[3] && Number(feature[2]) !== 0)) {
				supported = false;
				break;
			}
			const value = viewport[feature[1].endsWith("width") ? "width" : "height"];
			const expected = Number(feature[2]);
			result =
				result &&
				(feature[1].startsWith("min-")
					? value >= expected
					: feature[1].startsWith("max-")
						? value <= expected
						: value === expected);
			query = query.slice(feature[0].length).trim();
		}
		if (!supported || (!type && first))
			issue("unimplemented-or-invalid-media-query");
		else matches ||= negate ? !result : result;
	}
	return matches;
}
