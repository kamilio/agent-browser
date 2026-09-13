import {
	controlChecked,
	controlShowsPlaceholder,
	inputType,
	labelControl,
	isControlDisabled,
	optionSelected,
	radioGroup,
} from "./controls.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { elementNamespace, isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { activeFocus } from "./focus.js";
import { SelectorValidity } from "./selector-validity.js";

export interface QueryLimits {
	maxSelectorCodeUnits: number;
	maxComponents: number;
	maxNesting: number;
	maxIndexedNodes: number;
	maxWork: number;
	maxResults: number;
	maxCachedSelectors: number;
	maxMemoEntries: number;
}

export const selectorSyntaxLimits = Object.freeze({
	maxSelectorCodeUnits: 8192,
	maxComponents: 256,
	maxNesting: 16,
});

type Relation = " " | ">" | "+" | "~";
type SelectorComponentScope = "list" | "branch";
type AttributeOperator = "=" | "~=" | "|=" | "^=" | "$=" | "*=";
export type GeneratedPseudoElement = "before" | "after";
type SimpleSelector =
	| { kind: "tag" | "id" | "class"; value: string }
	| { kind: "pseudo-element"; name: GeneratedPseudoElement }
	| {
			kind: "attribute";
			name: string;
			operator?: AttributeOperator;
			value?: string;
			insensitive?: boolean;
	  }
	| { kind: "pseudo"; name: string }
	| {
			kind: "logical";
			name: "is" | "where" | "not" | "has";
			selectors: Selector[];
	  }
	| {
			kind: "nth";
			step: number;
			offset: number;
			reverse: boolean;
			ofType: boolean;
			of?: Selector[];
	  };
interface SelectorPart {
	tests: SimpleSelector[];
	relation?: Relation;
}
type Selector = SelectorPart[];
interface CompiledSelector {
	selectors: Selector[];
	nativeState: boolean;
	controlValue: boolean;
}

type FormulaToken =
	| { kind: "integer"; value: number; signed: boolean }
	| { kind: "dimension"; value: number; unit: string }
	| { kind: "identifier"; value: string }
	| { kind: "sign"; value: "+" | "-" };

export type SelectorSpecificity = readonly [number, number, number];

export function compareSpecificity(
	left: SelectorSpecificity,
	right: SelectorSpecificity,
) {
	return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function selectorSpecificity(selector: Selector): SelectorSpecificity {
	const total: [number, number, number] = [0, 0, 0];
	const maximum = (selectors: Selector[]) =>
		selectors
			.map(selectorSpecificity)
			.reduce<SelectorSpecificity>(
				(best, candidate) =>
					compareSpecificity(candidate, best) > 0 ? candidate : best,
				[0, 0, 0],
			);
	for (const part of selector)
		for (const test of part.tests) {
			let value: SelectorSpecificity = [0, 0, 0];
			if (test.kind === "id") value = [1, 0, 0];
			else if (test.kind === "tag") value = [0, 0, test.value === "*" ? 0 : 1];
			else if (test.kind === "pseudo-element") value = [0, 0, 1];
			else if (test.kind === "logical")
				value =
					test.name === "where"
						? [0, 0, 0]
						: maximum(
								test.name === "has"
									? test.selectors.map((relative) => relative.slice(1))
									: test.selectors,
							);
			else if (test.kind === "nth") {
				const nested = test.of ? maximum(test.of) : [0, 0, 0];
				value = [nested[0], nested[1] + 1, nested[2]];
			} else value = [0, 1, 0];
			for (let index = 0; index < 3; index++) total[index] += value[index];
		}
	return total;
}

const whitespace = /[\t\n\f\r ]/;
const nameStart = /[a-zA-Z_\u0080-\uffff]/;
const nameChar = /[a-zA-Z0-9_\-\u0080-\uffff]/;
const statePseudos = new Set([
	"checked",
	"indeterminate",
	"enabled",
	"disabled",
	"required",
	"optional",
	"valid",
	"invalid",
]);
const simplePseudos = new Set([
	"scope",
	"root",
	"target",
	"focus",
	"focus-visible",
	"focus-within",
	"placeholder-shown",
	"hover",
	"active",
	"empty",
	"first-child",
	"last-child",
	"only-child",
	"first-of-type",
	"last-of-type",
	"only-of-type",
	"link",
	"any-link",
	"visited",
	...statePseudos,
]);
const insensitiveAttributes = new Set([
	"accept",
	"accept-charset",
	"align",
	"alink",
	"axis",
	"bgcolor",
	"charset",
	"checked",
	"clear",
	"codetype",
	"color",
	"compact",
	"declare",
	"defer",
	"dir",
	"direction",
	"disabled",
	"enctype",
	"face",
	"frame",
	"hreflang",
	"http-equiv",
	"lang",
	"language",
	"link",
	"media",
	"method",
	"multiple",
	"nohref",
	"noresize",
	"noshade",
	"nowrap",
	"readonly",
	"rel",
	"rev",
	"rules",
	"scope",
	"scrolling",
	"selected",
	"shape",
	"target",
	"text",
	"type",
	"valign",
	"valuetype",
	"vlink",
]);

function asciiLower(value: string) {
	return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}
function elementTypeKey(node: Readonly<DocumentNode>) {
	return JSON.stringify([elementNamespace(node), node.tagName]);
}
function syntax(message: string): never {
	throw new AgentBrowserError("invalid-input", `Invalid selector: ${message}`);
}
function unsupported(message: string): never {
	throw new AgentBrowserError(
		"unsupported",
		`Unsupported selector: ${message}`,
	);
}

class SelectorParser {
	private position = 0;
	private components = 0;
	private nativeState = false;
	private controlValue = false;
	private readonly source: string;
	constructor(
		source: string,
		private readonly limits: Readonly<
			Pick<QueryLimits, keyof typeof selectorSyntaxLimits>
		>,
		private readonly componentScope: SelectorComponentScope = "list",
	) {
		if (typeof source !== "string") syntax("expected a string");
		if (source.length > limits.maxSelectorCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Selector text limit exceeded",
			);
		this.source = source
			.replace(/\r\n?/g, "\n")
			.replace(/\f/g, "\n")
			.replace(/\0/g, "\ufffd");
	}
	parse(): CompiledSelector {
		const selectors = this.list(0, false, false);
		if (this.position !== this.source.length) syntax("unexpected token");
		return {
			selectors,
			nativeState: this.nativeState,
			controlValue: this.controlValue,
		};
	}
	private list(
		depth: number,
		relative: boolean,
		insideHas: boolean,
	): Selector[] {
		if (depth > this.limits.maxNesting)
			throw new AgentBrowserError(
				"resource-limit",
				"Selector nesting limit exceeded",
			);
		const result: Selector[] = [];
		this.space();
		while (true) {
			if (depth === 0 && this.componentScope === "branch") this.components = 0;
			const parts: Selector = [];
			if (relative) parts.push({ tests: [{ kind: "pseudo", name: "scope" }] });
			let relation: Relation | undefined;
			if (relative) relation = this.combinator() ?? " ";
			this.space();
			parts.push({ tests: this.compound(depth, insideHas), relation });
			while (true) {
				const spaced = this.space();
				const next = this.source[this.position];
				if (!next || next === "," || next === ")") break;
				if (
					parts[parts.length - 1].tests.some(
						(test) => test.kind === "pseudo-element",
					)
				)
					unsupported("selectors after pseudo-elements");
				const explicit = this.combinator();
				if (!explicit && !spaced) syntax("expected a combinator");
				this.space();
				parts.push({
					tests: this.compound(depth, insideHas),
					relation: explicit ?? " ",
				});
			}
			result.push(parts);
			if (this.source[this.position] !== ",") break;
			this.position++;
			this.space();
		}
		return result;
	}
	private compound(depth: number, insideHas: boolean) {
		const tests: SimpleSelector[] = [];
		let pseudoElement = false;
		if (this.source[this.position] === "*") {
			this.position++;
			tests.push({ kind: "tag", value: "*" });
			this.component();
		} else if (this.startsIdentifier()) {
			tests.push({ kind: "tag", value: this.identifier() });
			this.component();
		}
		while (true) {
			this.comments();
			const next = this.source[this.position];
			if (["#", ".", "[", ":"].includes(next) && pseudoElement)
				unsupported("selectors after pseudo-elements");
			if (next === "#" || next === ".") {
				this.position++;
				tests.push({
					kind: next === "#" ? "id" : "class",
					value: this.identifier(),
				});
			} else if (next === "[") tests.push(this.attribute());
			else if (next === ":") {
				const test = this.pseudo(depth, insideHas);
				tests.push(test);
				pseudoElement = test.kind === "pseudo-element";
			} else break;
			this.component();
		}
		if (this.source[this.position] === "|")
			unsupported("namespaces and column combinators");
		if (!tests.length) syntax("expected a compound selector");
		return tests.sort(
			(left, right) =>
				Number(left.kind === "logical" || left.kind === "nth") -
				Number(right.kind === "logical" || right.kind === "nth"),
		);
	}
	private attribute(): SimpleSelector {
		this.position++;
		this.space();
		const name = this.identifier();
		this.space();
		if (this.source[this.position] === "]") {
			this.position++;
			return { kind: "attribute", name };
		}
		const pair = this.source.slice(this.position, this.position + 2);
		let operator: AttributeOperator;
		if (["~=", "|=", "^=", "$=", "*="].includes(pair)) {
			operator = pair as AttributeOperator;
			this.position += 2;
		} else if (this.source[this.position] === "=") {
			operator = "=";
			this.position++;
		} else if (this.source[this.position] === "|")
			unsupported("attribute namespaces");
		else syntax("expected an attribute operator");
		this.space();
		const quote = this.source[this.position];
		const value =
			quote === '"' || quote === "'" ? this.string() : this.identifier();
		this.space();
		let insensitive: boolean | undefined;
		if (this.source[this.position] !== "]") {
			const flag = asciiLower(this.identifier());
			if (flag !== "i" && flag !== "s") syntax("unknown attribute flag");
			insensitive = flag === "i";
			this.space();
		}
		this.expect("]");
		return { kind: "attribute", name, operator, value, insensitive };
	}
	private pseudo(depth: number, insideHas: boolean): SimpleSelector {
		this.position++;
		const doubleColon = this.source[this.position] === ":";
		if (doubleColon) this.position++;
		const name = asciiLower(this.identifier());
		if (doubleColon || name === "before" || name === "after") {
			if (
				(name !== "before" && name !== "after") ||
				this.source[this.position] === "("
			)
				unsupported("pseudo-elements");
			if (depth > 0 || insideHas) unsupported("nested pseudo-elements");
			return { kind: "pseudo-element", name };
		}
		if (this.source[this.position] !== "(") {
			if (!simplePseudos.has(name)) unsupported(`:${name}`);
			if (insideHas && name === "scope") unsupported(":scope inside :has");
			if (statePseudos.has(name)) this.nativeState = true;
			if (["placeholder-shown", "valid", "invalid"].includes(name))
				this.controlValue = true;
			return { kind: "pseudo", name };
		}
		this.position++;
		if (["is", "where", "not", "has"].includes(name)) {
			if (name === "has" && insideHas) syntax("nested :has");
			const selectors = this.list(
				depth + 1,
				name === "has",
				insideHas || name === "has",
			);
			this.expect(")");
			return {
				kind: "logical",
				name: name as "is" | "where" | "not" | "has",
				selectors,
			};
		}
		if (
			[
				"nth-child",
				"nth-last-child",
				"nth-of-type",
				"nth-last-of-type",
			].includes(name)
		) {
			const formula = this.formula();
			this.space();
			let of: Selector[] | undefined;
			if (this.source[this.position] !== ")") {
				if (name.includes("of-type"))
					syntax("of-list on a typed child selector");
				if (asciiLower(this.identifier()) !== "of")
					syntax("expected an of-list");
				of = this.list(depth + 1, false, insideHas);
			}
			this.expect(")");
			return {
				kind: "nth",
				...formula,
				of,
				reverse: name.includes("last"),
				ofType: name.includes("of-type"),
			};
		}
		unsupported(`:${name}()`);
	}
	private formulaToken(): FormulaToken | undefined {
		const numeric = /^[+-]?\d+/.exec(this.source.slice(this.position));
		if (numeric) {
			this.position += numeric[0].length;
			const value = Number(numeric[0]);
			if (this.startsIdentifier())
				return {
					kind: "dimension",
					value,
					unit: asciiLower(this.identifier()),
				};
			return { kind: "integer", value, signed: /^[+-]/.test(numeric[0]) };
		}
		if (this.startsIdentifier())
			return { kind: "identifier", value: asciiLower(this.identifier()) };
		const value = this.source[this.position];
		if (value === "+" || value === "-") {
			this.position++;
			return { kind: "sign", value };
		}
	}
	private formula() {
		this.space();
		let token = this.formulaToken();
		if (token?.kind === "sign" && token.value === "+") {
			if (this.space()) syntax("whitespace after An+B leading plus");
			token = this.formulaToken();
			if (token?.kind !== "identifier" || !/^n(?:-|$)/.test(token.value))
				syntax("invalid An+B expression");
		}
		if (token?.kind === "integer") return this.formulaNumbers(0, token.value);
		if (token?.kind === "identifier" && ["odd", "even"].includes(token.value))
			return { step: 2, offset: token.value === "odd" ? 1 : 0 };
		const unit =
			token?.kind === "dimension"
				? token.unit
				: token?.kind === "identifier"
					? token.value
					: "";
		const parts = /^(-?)n(?:-(\d*))?$/.exec(unit);
		if (!parts || (token?.kind === "dimension" && parts[1]))
			syntax("invalid An+B expression");
		const step = token?.kind === "dimension" ? token.value : parts[1] ? -1 : 1;
		let offset = 0;
		if (parts[2]) offset = -Number(parts[2]);
		else if (parts[2] === "") {
			this.space();
			const value = this.formulaToken();
			if (value?.kind !== "integer" || value.signed)
				syntax("expected an unsigned An+B offset");
			offset = -value.value;
		} else {
			const end = this.position;
			this.space();
			const next = this.formulaToken();
			if (next?.kind === "integer" && next.signed) offset = next.value;
			else if (next?.kind === "sign") {
				this.space();
				const value = this.formulaToken();
				if (value?.kind !== "integer" || value.signed)
					syntax("expected an unsigned An+B offset");
				offset = next.value === "-" ? -value.value : value.value;
			} else this.position = end;
		}
		return this.formulaNumbers(step, offset);
	}
	private formulaNumbers(step: number, offset: number) {
		if (
			!Number.isSafeInteger(step) ||
			!Number.isSafeInteger(offset) ||
			Math.abs(step) > 1_000_000_000 ||
			Math.abs(offset) > 1_000_000_000
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Selector numeric limit exceeded",
			);
		return { step, offset };
	}
	private startsIdentifier() {
		const current = this.source[this.position] ?? "";
		const next = this.source[this.position + 1] ?? "";
		return (
			nameStart.test(current) ||
			current === "\\" ||
			(current === "-" &&
				(nameStart.test(next) || next === "-" || next === "\\"))
		);
	}
	private identifier() {
		if (!this.startsIdentifier()) syntax("expected an identifier");
		let result = "";
		while (this.position < this.source.length) {
			const current = this.source[this.position];
			if (current === "\\") result += this.escape();
			else if (nameChar.test(current)) {
				result += current;
				this.position++;
			} else break;
		}
		return result;
	}
	private string() {
		const quote = this.source[this.position++];
		let result = "";
		while (this.position < this.source.length) {
			const current = this.source[this.position];
			if (current === quote) {
				this.position++;
				return result;
			}
			if (current === "\n") syntax("newline in a string");
			if (current === "\\" && this.source[this.position + 1] === "\n")
				this.position += 2;
			else if (current === "\\") result += this.escape();
			else {
				result += current;
				this.position++;
			}
		}
		syntax("unterminated string");
	}
	private escape() {
		this.position++;
		const current = this.source[this.position];
		if (!current) return "\ufffd";
		if (current === "\n") syntax("invalid escape");
		if (!/[0-9a-f]/i.test(current)) {
			this.position++;
			return current;
		}
		let hex = "";
		while (hex.length < 6 && /[0-9a-f]/i.test(this.source[this.position] ?? ""))
			hex += this.source[this.position++];
		if (whitespace.test(this.source[this.position] ?? "")) this.position++;
		const point = Number.parseInt(hex, 16);
		return String.fromCodePoint(
			point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)
				? 0xfffd
				: point,
		);
	}
	private combinator(): Relation | undefined {
		const next = this.source[this.position];
		if (next === ">" || next === "+" || next === "~") {
			this.position++;
			return next;
		}
		return undefined;
	}
	private comments() {
		while (this.source.slice(this.position, this.position + 2) === "/*") {
			const end = this.source.indexOf("*/", this.position + 2);
			if (end === -1) syntax("unterminated comment");
			this.position = end + 2;
		}
	}
	private space() {
		let spaced = false;
		while (true) {
			this.comments();
			if (!whitespace.test(this.source[this.position] ?? "")) break;
			spaced = true;
			this.position++;
		}
		return spaced;
	}
	private expect(token: string) {
		if (this.source[this.position] !== token) syntax(`expected ${token}`);
		this.position++;
	}
	private component() {
		if (++this.components > this.limits.maxComponents)
			throw new AgentBrowserError(
				"resource-limit",
				"Selector component limit exceeded",
			);
	}
}

export function validateSelectorSyntax(
	source: string,
	options: { pseudoElements?: boolean } = {},
): void {
	const compiled = new SelectorParser(source, selectorSyntaxLimits).parse();
	if (
		options.pseudoElements === false &&
		compiled.selectors.some((selector) =>
			selector.some((part) =>
				part.tests.some((test) => test.kind === "pseudo-element"),
			),
		)
	)
		unsupported("pseudo-element targets");
}

export function supportsCssSelector(source: string): boolean {
	try {
		return (
			new SelectorParser(source, selectorSyntaxLimits).parse().selectors
				.length === 1
		);
	} catch (error) {
		if (
			error instanceof AgentBrowserError &&
			(error.code === "invalid-input" || error.code === "unsupported")
		)
			return false;
		throw error;
	}
}

interface NodeInfo {
	node: Readonly<DocumentNode>;
	start: number;
	end: number;
	children: number[];
	previous: number | null;
	position: number;
	count: number;
	typePosition: number;
	typeCount: number;
}
type CandidateKind = "tag" | "id" | "class";
type CandidateTest = { kind: CandidateKind; value: string };
interface CandidateRange {
	start: number;
	end: number;
}
interface TreeIndex {
	root: number;
	revision: number;
	nodes: Map<number, NodeInfo>;
	elements: NodeInfo[];
	candidateIndexes: Partial<
		Record<CandidateKind, Map<string, NodeInfo[]> | null>
	>;
	candidateEntries: number;
	documentElement?: number;
	targetElement?: number;
	focusElement?: number;
	focusVisibleElement?: number;
	hoverElements: ReadonlySet<number>;
	activeElements: ReadonlySet<number>;
}
interface MatchContext {
	index: TreeIndex;
	work: number;
	workLimit: number;
	memoEntries: number;
	validity?: SelectorValidity;
	pseudoElement?: GeneratedPseudoElement;
	nth: Map<
		SimpleSelector,
		Map<string, { positions: Map<number, number>; total: number }>
	>;
}

export class DocumentQueries {
	readonly limits: Readonly<QueryLimits>;
	private cache = new Map<string, CompiledSelector>();
	private index: TreeIndex | undefined;
	private closed = false;
	private lastWork = 0;
	private structuralBuilds = 0;
	private structuralNodesBuilt = 0;
	private stateRefreshes = 0;
	private candidateIndexBuilds = 0;
	private controlValueDependent = false;
	private unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		limits: Partial<QueryLimits> = {},
	) {
		this.limits = Object.freeze({
			...selectorSyntaxLimits,
			maxIndexedNodes: 50_000,
			maxWork: 5_000_000,
			maxResults: 10_000,
			maxCachedSelectors: 32,
			maxMemoEntries: 100_000,
			...limits,
		});
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError("invalid-input", "Invalid query limit");
		this.unregisterClose = tree.onClose(() => this.close());
	}

	querySelectorAll(selector: string, root = this.tree.root): readonly number[] {
		return Object.freeze(this.query(selector, root, false));
	}
	querySelector(selector: string, root = this.tree.root): number | null {
		return this.query(selector, root, true)[0] ?? null;
	}
	matchingSpecificities(
		selector: string,
		maxWork = this.limits.maxWork,
	): ReadonlyMap<number, SelectorSpecificity> {
		return this.styleSpecificities(selector, maxWork).elements;
	}
	matchingPseudoSpecificities(
		selector: string,
		pseudoElement: GeneratedPseudoElement,
		maxWork = this.limits.maxWork,
	): ReadonlyMap<number, SelectorSpecificity> {
		if (pseudoElement !== "before" && pseudoElement !== "after")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid generated pseudo-element",
			);
		return this.styleSpecificities(selector, maxWork, pseudoElement)[
			pseudoElement
		];
	}
	matchingStyleSpecificities(selector: string, maxWork = this.limits.maxWork) {
		return this.styleSpecificities(selector, maxWork, "all");
	}
	private styleSpecificities(
		selector: string,
		maxWork: number,
		pseudoElement?: GeneratedPseudoElement | "all",
	) {
		if (
			!Number.isSafeInteger(maxWork) ||
			maxWork < 1 ||
			maxWork > this.limits.maxWork
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid selector work budget",
			);
		return this.operation(
			selector,
			this.tree.root,
			(compiled, context) => {
				const scope = context.index.documentElement ?? this.tree.root;
				const branches = compiled.selectors.filter((branch) => {
					const tests = branch[branch.length - 1].tests;
					this.tick(context, tests.length + 1);
					const target = tests.find((test) => test.kind === "pseudo-element");
					return pseudoElement === "all" || target?.name === pseudoElement;
				});
				const selectors = this.possibleSelectors(branches, context);
				const weights = selectors.map(selectorSpecificity);
				const results = {
					elements: new Map<number, SelectorSpecificity>(),
					before: new Map<number, SelectorSpecificity>(),
					after: new Map<number, SelectorSpecificity>(),
				};
				let resultCount = 0;
				for (let index = 0; index < selectors.length; index++) {
					const branch = selectors[index];
					const tests = branch[branch.length - 1].tests;
					this.tick(context, tests.length);
					context.pseudoElement = tests.find(
						(test) => test.kind === "pseudo-element",
					)?.name;
					const result = results[context.pseudoElement ?? "elements"];
					for (const candidate of this.selectorCandidates(
						selectors[index],
						context,
					)) {
						this.tick(context);
						if (
							!this.match(
								candidate.node.id,
								selectors[index],
								selectors[index].length - 1,
								scope,
								context,
							)
						)
							continue;
						const previous = result.get(candidate.node.id);
						if (previous && compareSpecificity(weights[index], previous) <= 0)
							continue;
						if (!previous && resultCount >= this.limits.maxResults)
							throw new AgentBrowserError(
								"resource-limit",
								"Query result limit exceeded",
							);
						if (!previous) resultCount++;
						result.set(
							candidate.node.id,
							Object.freeze([...weights[index]]) as SelectorSpecificity,
						);
					}
				}
				for (const target of ["elements", "before", "after"] as const) {
					const result = results[target];
					if (selectors.length < 2 || result.size < 2) continue;
					this.tick(context, result.size);
					results[target] = new Map(
						[...result].sort(([left], [right]) => {
							this.tick(context);
							return (
								context.index.nodes.get(left)!.start -
								context.index.nodes.get(right)!.start
							);
						}),
					);
				}
				return Object.freeze(results);
			},
			maxWork,
			"branch",
		);
	}
	matches(id: number, selector: string) {
		return this.operation(selector, id, (compiled, context) => {
			this.requireElement(id, context);
			return this.matchList(id, compiled.selectors, id, context);
		});
	}
	closest(id: number, selector: string): number | null {
		return this.operation(selector, id, (compiled, context) => {
			this.requireElement(id, context);
			let current: number | null = id;
			while (current !== null) {
				if (this.matchList(current, compiled.selectors, id, context))
					return current;
				current = context.index.nodes.get(current)?.node.parent ?? null;
			}
			return null;
		});
	}
	metrics() {
		return Object.freeze({
			cachedSelectors: this.cache.size,
			indexedNodes: this.index?.nodes.size ?? 0,
			lastWork: this.lastWork,
			structuralBuilds: this.structuralBuilds,
			structuralNodesBuilt: this.structuralNodesBuilt,
			stateRefreshes: this.stateRefreshes,
			candidateIndexBuilds: this.candidateIndexBuilds,
			candidateIndexedEntries: this.index?.candidateEntries ?? 0,
			controlValueDependent: this.controlValueDependent,
			closed: this.closed,
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.cache.clear();
		this.controlValueDependent = false;
		this.index = undefined;
		this.unregisterClose();
	}
	private possibleSelectors(
		selectors: Selector[],
		context: MatchContext,
	): Selector[] {
		return selectors.filter((selector) =>
			this.selectorPossible(selector, context),
		);
	}
	private selectorPossible(selector: Selector, context: MatchContext): boolean {
		for (const part of selector) {
			const positive: CandidateTest[] = [];
			let candidates: readonly NodeInfo[] | undefined;
			for (const test of part.tests) {
				this.tick(context);
				if (
					test.kind === "logical" &&
					(test.name === "is" ||
						test.name === "where" ||
						test.name === "has") &&
					!test.selectors.some((alternative) =>
						this.selectorPossible(alternative, context),
					)
				)
					return false;
				if (test.kind !== "id" && test.kind !== "class" && test.kind !== "tag")
					continue;
				if (test.kind === "tag" && test.value === "*") continue;
				positive.push(test);
				const indexed = this.indexedCandidates(test, context);
				if (indexed === undefined) continue;
				if (indexed.length === 0) return false;
				if (candidates === undefined || indexed.length < candidates.length)
					candidates = indexed;
			}
			if (
				positive.length > 1 &&
				candidates !== undefined &&
				!candidates.some((candidate) => {
					this.tick(context);
					return positive.every((test) =>
						this.test(candidate, test, this.tree.root, context),
					);
				})
			)
				return false;
		}
		return true;
	}
	private selectorCandidates(
		selector: Selector,
		context: MatchContext,
	): readonly NodeInfo[] {
		const tests = this.candidateTests(
			selector[selector.length - 1].tests,
			context,
		);
		const identifier = tests.find((test) => test.kind === "id");
		const classes = tests.filter((test) => test.kind === "class");
		const plan = identifier ? [identifier] : classes.length ? classes : tests;
		let best: readonly NodeInfo[] | undefined;
		for (const test of plan) {
			const candidates = this.indexedCandidates(test, context);
			if (candidates === undefined) continue;
			if (best === undefined || candidates.length < best.length)
				best = candidates;
			if (best.length === 0) break;
		}
		return this.ancestorCandidates(
			selector,
			best ?? context.index.elements,
			context,
		);
	}
	private candidateTests(
		tests: SimpleSelector[],
		context: MatchContext,
	): CandidateTest[] {
		return tests.filter((test): test is CandidateTest => {
			this.tick(context);
			return (
				test.kind === "id" ||
				test.kind === "class" ||
				(test.kind === "tag" && test.value !== "*")
			);
		});
	}
	private indexedCandidates(
		test: CandidateTest,
		context: MatchContext,
	): readonly NodeInfo[] | undefined {
		const index = this.candidateIndex(test.kind, context);
		if (!index) return undefined;
		this.tick(context, test.value.length + 1);
		const candidates = index.get(test.value) ?? [];
		if (test.kind === "tag") {
			const folded = asciiLower(test.value);
			if (folded !== test.value)
				return this.mergeCandidates(
					[candidates, index.get(folded) ?? []],
					context,
				);
		}
		return candidates;
	}
	private ancestorCandidates(
		selector: Selector,
		candidates: readonly NodeInfo[],
		context: MatchContext,
	): readonly NodeInfo[] {
		if (candidates.length === 0 || selector.length === 1) return candidates;
		let best: CandidateRange[] | undefined;
		let bestCoverage = Number.POSITIVE_INFINITY;
		const visited = new Set<string>();
		for (let position = selector.length - 2; position >= 0; position--) {
			const relation = selector[position + 1].relation;
			if (relation !== " " && relation !== ">") continue;
			for (const test of this.candidateTests(
				selector[position].tests,
				context,
			)) {
				this.tick(context, test.value.length + 1);
				const key = `${test.kind}:${test.value}`;
				if (visited.has(key)) continue;
				visited.add(key);
				const ancestors = this.indexedCandidates(test, context);
				if (ancestors === undefined) continue;
				const ranges: CandidateRange[] = [];
				let coverage = 0;
				for (const ancestor of ancestors) {
					this.tick(context);
					const start = ancestor.start + 1;
					const end = ancestor.end;
					if (start >= end) continue;
					const previous = ranges[ranges.length - 1];
					if (previous && start <= previous.end) {
						coverage += Math.max(0, end - previous.end);
						previous.end = Math.max(previous.end, end);
					} else {
						ranges.push({ start, end });
						coverage += end - start;
					}
				}
				if (coverage < bestCoverage) {
					best = ranges;
					bestCoverage = coverage;
				}
			}
		}
		if (best === undefined) return candidates;
		if (best.length === 0) return [];
		if (
			best.length === 1 &&
			candidates[0].start >= best[0].start &&
			candidates[candidates.length - 1].start < best[0].end
		)
			return candidates;
		const result: NodeInfo[] = [];
		let range = 0;
		for (const candidate of candidates) {
			this.tick(context);
			while (range < best.length && candidate.start >= best[range].end) {
				this.tick(context);
				range++;
			}
			if (range === best.length) break;
			if (candidate.start >= best[range].start) result.push(candidate);
		}
		return result;
	}
	private mergeCandidates(
		branches: readonly (readonly NodeInfo[])[],
		context: MatchContext,
	): readonly NodeInfo[] {
		if (branches.length === 1) return branches[0];
		const unique = new Set<NodeInfo>();
		for (const branch of branches)
			for (const candidate of branch) {
				this.tick(context);
				unique.add(candidate);
			}
		return [...unique].sort((left, right) => {
			this.tick(context);
			return left.start - right.start;
		});
	}
	private candidateIndex(
		kind: CandidateKind,
		context: MatchContext,
	): Map<string, NodeInfo[]> | null {
		const cached = context.index.candidateIndexes[kind];
		if (cached !== undefined) return cached;
		const index = new Map<string, NodeInfo[]>();
		let entries = 0;
		for (const info of context.index.elements) {
			const value =
				kind === "tag" ? info.node.tagName : (info.node.attributes[kind] ?? "");
			this.tick(context, value.length + 1);
			const keys =
				kind === "class"
					? new Set(value.split(/[\t\n\f\r ]+/).filter(Boolean))
					: value
						? [value]
						: [];
			for (const key of keys) {
				this.tick(context);
				if (
					entries + context.index.candidateEntries >=
					this.limits.maxIndexedNodes
				) {
					context.index.candidateIndexes[kind] = null;
					return null;
				}
				const bucket = index.get(key);
				if (bucket) bucket.push(info);
				else index.set(key, [info]);
				entries++;
			}
		}
		context.index.candidateIndexes[kind] = index;
		context.index.candidateEntries += entries;
		this.candidateIndexBuilds++;
		return index;
	}
	private query(selector: string, root: number, first: boolean) {
		return this.operation(selector, root, (compiled, context) => {
			const anchor = context.index.nodes.get(root);
			if (!anchor)
				throw new AgentBrowserError("not-found", "Query root was not found");
			const scope =
				anchor.node.kind === "document"
					? (context.index.documentElement ?? root)
					: root;
			const result: number[] = [];
			for (const candidate of context.index.elements) {
				this.tick(context);
				if (candidate.start <= anchor.start || candidate.start >= anchor.end)
					continue;
				if (
					!this.matchList(candidate.node.id, compiled.selectors, scope, context)
				)
					continue;
				if (result.length >= this.limits.maxResults)
					throw new AgentBrowserError(
						"resource-limit",
						"Query result limit exceeded",
					);
				result.push(candidate.node.id);
				if (first) break;
			}
			return result;
		});
	}
	private operation<T>(
		selector: string,
		root: number,
		run: (compiled: CompiledSelector, context: MatchContext) => T,
		workLimit = this.limits.maxWork,
		componentScope: SelectorComponentScope = "list",
	): T {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document queries are closed");
		if (typeof selector !== "string") syntax("expected a string");
		const cacheKey = `${componentScope}:${selector}`;
		let compiled = this.cache.get(cacheKey);
		if (!compiled) {
			compiled = new SelectorParser(
				selector,
				this.limits,
				componentScope,
			).parse();
			this.controlValueDependent ||= compiled.controlValue;
			if (this.cache.size >= this.limits.maxCachedSelectors) {
				const oldest = this.cache.keys().next().value;
				if (oldest !== undefined) this.cache.delete(oldest);
			}
			this.cache.set(cacheKey, compiled);
		} else {
			this.cache.delete(cacheKey);
			this.cache.set(cacheKey, compiled);
		}
		const index = this.indexFor(root);
		if (compiled.nativeState && index.root !== this.tree.root)
			unsupported("native control state in detached trees");
		const context: MatchContext = {
			index,
			work: 0,
			workLimit,
			memoEntries: 0,
			nth: new Map(),
		};
		try {
			return run(compiled, context);
		} finally {
			this.lastWork = context.work;
		}
	}
	private indexFor(id: number): TreeIndex {
		let root = this.tree.get(id);
		if (!["element", "document", "fragment"].includes(root.kind))
			throw new AgentBrowserError(
				"invalid-input",
				"Query root must be an element, document or fragment",
			);
		while (root.parent !== null) root = this.tree.get(root.parent);
		if (
			this.index?.root === root.id &&
			this.index.revision === this.tree.revision
		)
			return this.index;
		if (this.index?.root === root.id) {
			const journal = this.tree.changesSince(this.index.revision);
			if (
				!journal.reset &&
				journal.changes.every((change) =>
					[
						"focus",
						"focus-indication",
						"pointer",
						"activation",
						"target",
					].includes(change.kind),
				)
			) {
				const previous = this.index;
				this.index = undefined;
				this.index = {
					...previous,
					revision: this.tree.revision,
					...this.interactionState(previous.nodes),
				};
				this.stateRefreshes++;
				return this.index;
			}
		}
		this.index = undefined;
		const nodes = new Map<number, NodeInfo>();
		const elements: NodeInfo[] = [];
		const stack: { info: NodeInfo; depth: number }[] = [];
		for (const { node, depth } of this.tree.walk(root.id)) {
			if (nodes.size >= this.limits.maxIndexedNodes)
				throw new AgentBrowserError(
					"resource-limit",
					"Query node index limit exceeded",
				);
			while (stack.length && stack[stack.length - 1].depth >= depth) {
				const previous = stack.pop();
				if (previous) previous.info.end = nodes.size;
			}
			const info: NodeInfo = {
				node,
				start: nodes.size,
				end: 0,
				children: [],
				previous: null,
				position: 1,
				count: 1,
				typePosition: 1,
				typeCount: 1,
			};
			nodes.set(node.id, info);
			stack.push({ info, depth });
			if (node.kind === "element") elements.push(info);
		}
		for (const { info } of stack) info.end = nodes.size;
		for (const parent of nodes.values()) {
			parent.children = parent.node.children.filter(
				(child) => nodes.get(child)?.node.kind === "element",
			);
			const counts = new Map<string, number>();
			for (const child of parent.children) {
				const node = nodes.get(child)?.node;
				if (!node) continue;
				const type = elementTypeKey(node);
				counts.set(type, (counts.get(type) ?? 0) + 1);
			}
			const positions = new Map<string, number>();
			for (let position = 0; position < parent.children.length; position++) {
				const child = nodes.get(parent.children[position]);
				if (!child) continue;
				child.position = position + 1;
				child.count = parent.children.length;
				child.previous = parent.children[position - 1] ?? null;
				const type = elementTypeKey(child.node);
				child.typePosition = (positions.get(type) ?? 0) + 1;
				child.typeCount = counts.get(type) ?? 1;
				positions.set(type, child.typePosition);
			}
		}
		this.index = {
			root: root.id,
			revision: this.tree.revision,
			nodes,
			elements,
			candidateIndexes: {},
			candidateEntries: 0,
			...this.interactionState(nodes),
			documentElement:
				root.kind === "document" ? nodes.get(root.id)?.children[0] : undefined,
		};
		this.structuralBuilds++;
		this.structuralNodesBuilt += nodes.size;
		return this.index;
	}
	private interactionState(nodes: ReadonlyMap<number, NodeInfo>) {
		const focused = activeFocus(this.tree) ?? undefined;
		return {
			targetElement: this.tree.targetElement ?? undefined,
			focusElement: focused,
			focusVisibleElement: this.tree.focusIndicated ? focused : undefined,
			hoverElements: this.pointerMatches(this.tree.pointerHoverElement, nodes),
			activeElements: new Set([
				...this.pointerMatches(this.tree.pointerActiveElement, nodes),
				...this.pointerMatches(this.tree.keyboardActiveElement, nodes),
			]),
		};
	}
	private pointerMatches(
		target: number | null,
		nodes: ReadonlyMap<number, NodeInfo>,
	) {
		const matches = new Set<number>();
		const controls: number[] = [];
		let current = target === null ? undefined : nodes.get(target)?.node;
		while (current) {
			if (current.kind === "element") {
				matches.add(current.id);
				if (isHtmlElement(current, "label")) {
					const control = labelControl(this.tree, current.id);
					if (control !== undefined) controls.push(control);
				}
			}
			current =
				current.parent === null ? undefined : nodes.get(current.parent)?.node;
		}
		for (const control of controls) matches.add(control);
		return matches;
	}
	private matchList(
		id: number,
		selectors: Selector[],
		scope: number,
		context: MatchContext,
	): boolean {
		return selectors.some((selector) =>
			this.match(id, selector, selector.length - 1, scope, context),
		);
	}
	private hasMatch(
		anchor: NodeInfo,
		selectors: Selector[],
		context: MatchContext,
	): boolean {
		for (const selector of selectors) {
			this.tick(context);
			const candidates = this.selectorCandidates(selector, context);
			const relation = selector[1].relation;
			const descendants = relation === " " || relation === ">";
			let start = 0;
			if (descendants) {
				let end = candidates.length;
				while (start < end) {
					this.tick(context);
					const middle = Math.floor((start + end) / 2);
					if (candidates[middle].start <= anchor.start) start = middle + 1;
					else end = middle;
				}
			}
			for (let position = start; position < candidates.length; position++) {
				this.tick(context);
				const candidate = candidates[position];
				if (descendants && candidate.start >= anchor.end) break;
				if (
					this.match(
						candidate.node.id,
						selector,
						selector.length - 1,
						anchor.node.id,
						context,
					)
				)
					return true;
			}
		}
		return false;
	}
	private match(
		id: number,
		selector: Selector,
		position: number,
		scope: number,
		context: MatchContext,
	): boolean {
		this.tick(context);
		const info = context.index.nodes.get(id);
		if (!info || info.node.kind !== "element") return false;
		const part = selector[position];
		if (!part.tests.every((test) => this.test(info, test, scope, context)))
			return false;
		if (position === 0) return true;
		const relation = part.relation;
		let previous =
			relation === "+" || relation === "~" ? info.previous : info.node.parent;
		while (previous !== null) {
			if (this.match(previous, selector, position - 1, scope, context))
				return true;
			if (relation === ">" || relation === "+") break;
			const ancestor = context.index.nodes.get(previous);
			previous =
				relation === "~"
					? (ancestor?.previous ?? null)
					: (ancestor?.node.parent ?? null);
		}
		return false;
	}
	private test(
		info: NodeInfo,
		test: SimpleSelector,
		scope: number,
		context: MatchContext,
	): boolean {
		this.tick(context);
		const node = info.node;
		if (test.kind === "pseudo-element")
			return context.pseudoElement === test.name;
		if (test.kind === "tag") {
			if (test.value === "*") return true;
			this.tick(context, node.tagName.length + test.value.length);
			return (
				node.tagName ===
				(isHtmlElement(node) ? asciiLower(test.value) : test.value)
			);
		}
		if (test.kind === "id") {
			this.tick(context, (node.attributes.id?.length ?? 0) + test.value.length);
			return node.attributes.id === test.value;
		}
		if (test.kind === "class") {
			const value = node.attributes.class ?? "";
			this.tick(context, value.length + test.value.length);
			return value.split(/[\t\n\f\r ]+/).includes(test.value);
		}
		if (test.kind === "attribute")
			return this.attributeMatches(node, test, context);
		if (test.kind === "logical") {
			if (test.name === "has")
				return this.hasMatch(info, test.selectors, context);
			const matched = this.matchList(node.id, test.selectors, scope, context);
			return test.name === "not" ? !matched : matched;
		}
		if (test.kind === "nth") return this.nth(info, test, scope, context);
		if (test.kind !== "pseudo") return false;
		switch (test.name) {
			case "scope":
				return node.id === scope;
			case "root":
				return node.id === context.index.documentElement;
			case "target":
				return node.id === context.index.targetElement;
			case "focus":
				return node.id === context.index.focusElement;
			case "focus-visible":
				return node.id === context.index.focusVisibleElement;
			case "placeholder-shown":
				return (
					isHtmlElement(node) && controlShowsPlaceholder(this.tree, node.id)
				);
			case "hover":
				return context.index.hoverElements.has(node.id);
			case "active":
				return context.index.activeElements.has(node.id);
			case "focus-within": {
				const focused =
					context.index.focusElement === undefined
						? undefined
						: context.index.nodes.get(context.index.focusElement);
				return (
					!!focused && info.start <= focused.start && info.end >= focused.end
				);
			}
			case "empty":
				return node.children.every((child) => {
					this.tick(context);
					const childNode = context.index.nodes.get(child)?.node;
					return (
						childNode?.kind !== "element" &&
						!(childNode?.kind === "text" && childNode.data.length)
					);
				});
			case "first-child":
				return info.position === 1;
			case "last-child":
				return info.position === info.count;
			case "only-child":
				return info.count === 1;
			case "first-of-type":
				return info.typePosition === 1;
			case "last-of-type":
				return info.typePosition === info.typeCount;
			case "only-of-type":
				return info.typeCount === 1;
			case "link":
			case "any-link":
				return (
					isHtmlElement(node) &&
					["a", "area"].includes(node.tagName) &&
					Object.hasOwn(node.attributes, "href")
				);
			case "visited":
				return false;
			case "valid":
			case "invalid":
				context.validity ??= new SelectorValidity(
					this.tree,
					(work) => this.tick(context, work),
					(entries) => {
						context.memoEntries += entries;
						if (context.memoEntries > this.limits.maxMemoEntries)
							throw new AgentBrowserError(
								"resource-limit",
								"Query memo limit exceeded",
							);
					},
				);
				return context.validity.matches(node.id, test.name === "valid");
			case "checked":
				return isHtmlElement(node, "option")
					? optionSelected(this.tree, node.id)
					: isHtmlElement(node, "input") &&
							["checkbox", "radio"].includes(inputType(node)) &&
							controlChecked(this.tree, node.id);
			case "indeterminate": {
				if (isHtmlElement(node, "progress"))
					return !Object.hasOwn(node.attributes, "value");
				if (!isHtmlElement(node, "input")) return false;
				if (inputType(node) === "checkbox")
					return node.control.indeterminate ?? false;
				if (inputType(node) !== "radio") return false;
				const group = radioGroup(this.tree, node.id);
				this.tick(context, group.length);
				return !group.some((candidate) =>
					controlChecked(this.tree, candidate.id),
				);
			}
			case "disabled":
			case "enabled":
				return (
					isHtmlElement(node) &&
					[
						"button",
						"input",
						"select",
						"textarea",
						"fieldset",
						"option",
						"optgroup",
					].includes(node.tagName) &&
					isControlDisabled(this.tree, node.id) === (test.name === "disabled")
				);
			case "required":
			case "optional": {
				if (!isHtmlElement(node)) return false;
				const eligible =
					["select", "textarea"].includes(node.tagName) ||
					(node.tagName === "input" &&
						![
							"hidden",
							"range",
							"color",
							"submit",
							"image",
							"reset",
							"button",
						].includes(inputType(node)));
				return (
					eligible &&
					Object.hasOwn(node.attributes, "required") ===
						(test.name === "required")
				);
			}
			default:
				return false;
		}
	}
	private attributeMatches(
		node: Readonly<DocumentNode>,
		test: Extract<SimpleSelector, { kind: "attribute" }>,
		context: MatchContext,
	) {
		this.tick(context, test.name.length);
		const html = isHtmlElement(node);
		const name = html ? asciiLower(test.name) : test.name;
		if (!Object.hasOwn(node.attributes, name)) return false;
		if (!test.operator) return true;
		let value = node.attributes[name];
		let expected = test.value ?? "";
		this.tick(context, value.length + expected.length);
		if (test.insensitive ?? (html && insensitiveAttributes.has(name))) {
			value = asciiLower(value);
			expected = asciiLower(expected);
		}
		switch (test.operator) {
			case "=":
				return value === expected;
			case "~=":
				return (
					!!expected &&
					!/[\t\n\f\r ]/.test(expected) &&
					value.split(/[\t\n\f\r ]+/).includes(expected)
				);
			case "|=":
				return value === expected || value.startsWith(`${expected}-`);
			case "^=":
				return !!expected && value.startsWith(expected);
			case "$=":
				return !!expected && value.endsWith(expected);
			case "*=":
				return !!expected && value.includes(expected);
		}
	}
	private nth(
		info: NodeInfo,
		test: Extract<SimpleSelector, { kind: "nth" }>,
		scope: number,
		context: MatchContext,
	) {
		let position = test.ofType ? info.typePosition : info.position;
		let total = test.ofType ? info.typeCount : info.count;
		if (test.of) {
			const key = `${scope}:${info.node.parent ?? "root"}`;
			let tables = context.nth.get(test);
			if (!tables) {
				tables = new Map();
				context.nth.set(test, tables);
			}
			let table = tables.get(key);
			if (!table) {
				if (++context.memoEntries > this.limits.maxMemoEntries)
					throw new AgentBrowserError(
						"resource-limit",
						"Query memo limit exceeded",
					);
				const siblings =
					info.node.parent === null
						? [info.node.id]
						: (context.index.nodes.get(info.node.parent)?.children ?? []);
				const positions = new Map<number, number>();
				for (const sibling of siblings) {
					if (!this.matchList(sibling, test.of, scope, context)) continue;
					if (++context.memoEntries > this.limits.maxMemoEntries)
						throw new AgentBrowserError(
							"resource-limit",
							"Query memo limit exceeded",
						);
					positions.set(sibling, positions.size + 1);
				}
				table = { positions, total: positions.size };
				tables.set(key, table);
			}
			position = table.positions.get(info.node.id) ?? 0;
			total = table.total;
			if (!position) return false;
		}
		if (test.reverse) position = total - position + 1;
		if (test.step === 0) return position === test.offset;
		const multiple = (position - test.offset) / test.step;
		return Number.isInteger(multiple) && multiple >= 0;
	}
	private requireElement(id: number, context: MatchContext) {
		if (context.index.nodes.get(id)?.node.kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Expected an element query target",
			);
	}
	private tick(context: MatchContext, amount = 1) {
		context.work += amount;
		if (context.work > context.workLimit)
			throw new AgentBrowserError(
				"resource-limit",
				"Query work limit exceeded",
			);
	}
}
