import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { DocumentQueries } from "./selectors.js";
import { snapshotRoleCandidates } from "./snapshot.js";
import {
	type TextTargetLocator,
	textLocatorCandidates,
} from "./text-locator.js";

export type TargetLocator =
	| TextTargetLocator
	| { kind: "css"; value: string }
	| { kind: "test-id"; value: string }
	| { kind: "role"; role: string; name?: string; exact: boolean };

class LocatorParser {
	private offset = 0;
	constructor(private readonly source: string) {}

	parse(): TargetLocator {
		const method = this.identifier();
		const textMethods: Record<string, TextTargetLocator["kind"]> = {
			getByText: "text",
			getByLabel: "label",
			getByPlaceholder: "placeholder",
			getByAltText: "alt-text",
			getByTitle: "title",
		};
		if (
			method !== "getByRole" &&
			method !== "getByTestId" &&
			method !== "locator" &&
			!Object.hasOwn(textMethods, method)
		)
			throw new AgentBrowserError(
				"unsupported",
				"This locator method is not implemented",
			);
		this.expect("(");
		const value = this.string();
		let name: string | undefined;
		let exact = false;
		if (method !== "getByTestId" && method !== "locator" && this.consume(",")) {
			this.expect("{");
			const seen = new Set<string>();
			if (!this.consume("}")) {
				while (true) {
					this.whitespace();
					const key = ["'", '"'].includes(this.source[this.offset])
						? this.string()
						: this.identifier();
					if (
						!(method === "getByRole" ? ["name", "exact"] : ["exact"]).includes(
							key,
						)
					)
						throw new AgentBrowserError(
							"unsupported",
							"This locator option is not implemented",
						);
					if (seen.has(key)) this.invalid();
					seen.add(key);
					this.expect(":");
					if (key === "name") name = this.string();
					else {
						const boolean = this.identifier();
						if (boolean !== "true" && boolean !== "false") this.invalid();
						exact = boolean === "true";
					}
					if (this.consume("}")) break;
					this.expect(",");
					if (this.consume("}")) break;
				}
			}
		}
		this.expect(")");
		this.whitespace();
		if (this.offset !== this.source.length)
			throw new AgentBrowserError(
				"unsupported",
				"Locator chaining and executable expressions are not implemented",
			);
		if (method === "locator") return { kind: "css", value };
		if (method === "getByTestId") return { kind: "test-id", value };
		if (Object.hasOwn(textMethods, method))
			return { kind: textMethods[method], value, exact };
		if (!/^[a-z][a-z0-9-]{0,63}$/.test(value)) this.invalid();
		return {
			kind: "role",
			role: value,
			...(name === undefined ? {} : { name }),
			exact,
		};
	}

	private whitespace() {
		while (
			/\s/.test(this.source[this.offset] ?? "") &&
			this.offset < this.source.length
		)
			this.offset++;
	}
	private consume(token: string) {
		this.whitespace();
		if (!this.source.startsWith(token, this.offset)) return false;
		this.offset += token.length;
		return true;
	}
	private expect(token: string) {
		if (!this.consume(token)) this.invalid();
	}
	private identifier() {
		this.whitespace();
		const value = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(
			this.source.slice(this.offset),
		)?.[0];
		if (!value) return this.invalid();
		this.offset += value.length;
		return value;
	}
	private string(): string {
		this.whitespace();
		const quote = this.source[this.offset++];
		if (quote !== "'" && quote !== '"') return this.invalid();
		let result = "";
		while (this.offset < this.source.length) {
			let character = this.source[this.offset++];
			if (character === quote) return result;
			if (
				character.charCodeAt(0) < 32 ||
				character === "\u2028" ||
				character === "\u2029"
			)
				return this.invalid();
			if (character === "\\") {
				character = this.source[this.offset++];
				const escapes: Record<string, string> = {
					"'": "'",
					'"': '"',
					"\\": "\\",
					n: "\n",
					r: "\r",
					t: "\t",
					b: "\b",
					f: "\f",
					v: "\v",
				};
				if (Object.hasOwn(escapes, character)) result += escapes[character];
				else if (character === "x" || character === "u") {
					const length = character === "x" ? 2 : 4;
					const digits = this.source.slice(this.offset, this.offset + length);
					if (digits.length !== length || !/^[0-9a-f]+$/i.test(digits))
						return this.invalid();
					this.offset += length;
					result += String.fromCharCode(Number.parseInt(digits, 16));
				} else return this.invalid();
			} else result += character;
			if (result.length > 4096)
				throw new AgentBrowserError(
					"resource-limit",
					"Locator string limit exceeded",
				);
		}
		return this.invalid();
	}
	private invalid(): never {
		throw new AgentBrowserError(
			"invalid-input",
			"Expected a supported locator with literal arguments",
		);
	}
}

export function parseTargetLocator(source: string): TargetLocator | undefined {
	if (typeof source !== "string")
		throw new AgentBrowserError("invalid-input", "Invalid browser target");
	if (source.length > 8192)
		throw new AgentBrowserError(
			"resource-limit",
			"Locator source limit exceeded",
		);
	if (!/^\s*(?:getBy[A-Za-z]+|locator)\s*\(/.test(source)) return undefined;
	return new LocatorParser(source).parse();
}

function normalizeName(value: string) {
	return value
		.replace(/\s+/gu, " ")
		.replace(/[\p{Cc}\p{Cf}]/gu, "")
		.trim();
}

export function resolveBrowserTarget(
	tree: DocumentTree,
	queries: DocumentQueries,
	source: string,
): string {
	if (/^e[1-9][0-9]*$/.test(source)) {
		tree.resolve(source);
		return source;
	}
	const locator = parseTargetLocator(source);
	let references: readonly string[];
	if (!locator || locator.kind === "css")
		references = queries
			.querySelectorAll(locator?.value ?? source)
			.map((id) => tree.reference(id));
	else if (locator.kind === "test-id") {
		references = queries
			.querySelectorAll("[data-testid]")
			.filter((id) => tree.get(id).attributes["data-testid"] === locator.value)
			.map((id) => tree.reference(id));
	} else if (locator.kind !== "role") {
		references = textLocatorCandidates(tree, locator).map((id) =>
			tree.reference(id),
		);
	} else {
		const name =
			locator.name === undefined ? undefined : normalizeName(locator.name);
		references = snapshotRoleCandidates(tree, locator.role)
			.filter(
				(entry) =>
					name === undefined ||
					(locator.exact
						? entry.name === name
						: entry.name.toLowerCase().includes(name.toLowerCase())),
			)
			.map((entry) => entry.ref);
	}
	if (!references.length)
		throw new AgentBrowserError("not-found", "Target matched no elements");
	if (references.length !== 1)
		throw new AgentBrowserError(
			"not-actionable",
			"Target matched multiple elements",
		);
	return references[0];
}
