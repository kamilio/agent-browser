import { AgentBrowserError } from "./errors.js";

export type SourceLiteralValue =
	| null
	| boolean
	| number
	| string
	| readonly SourceLiteralValue[]
	| { readonly [key: string]: SourceLiteralValue };

export const sourceLiteralLimits = Object.freeze({
	inputCodeUnits: 65_536,
	depth: 16,
	values: 4096,
	entries: 256,
	stringCodeUnits: 4096,
	outputBytes: 65_536,
});

const reservedKeys = new Set(["__proto__", "prototype", "constructor"]);
const encoder = new TextEncoder();

class LiteralParser {
	private offset = 0;
	private values = 0;

	constructor(private readonly source: string) {}

	parse(): SourceLiteralValue {
		const value = this.value(0);
		this.whitespace();
		if (this.offset !== this.source.length) this.invalid();
		if (
			encoder.encode(JSON.stringify(value)).length >
			sourceLiteralLimits.outputBytes
		)
			this.limit("output");
		return value;
	}

	private invalid(): never {
		throw new AgentBrowserError(
			"invalid-input",
			`Unsupported source literal syntax at offset ${this.offset}`,
		);
	}

	private limit(name: string): never {
		throw new AgentBrowserError(
			"resource-limit",
			`Source literal ${name} limit exceeded`,
		);
	}

	private whitespace(): void {
		while (/^[ \t\r\n]$/.test(this.source[this.offset] ?? "")) this.offset++;
	}

	private take(character: string): boolean {
		this.whitespace();
		if (this.source[this.offset] !== character) return false;
		this.offset++;
		return true;
	}

	private value(depth: number): SourceLiteralValue {
		if (depth > sourceLiteralLimits.depth) this.limit("depth");
		if (++this.values > sourceLiteralLimits.values) this.limit("values");
		this.whitespace();
		const first = this.source[this.offset];
		if (first === "[" || first === "{") {
			this.offset++;
			return first === "[" ? this.array(depth) : this.object(depth);
		}
		if (first === '"' || first === "'") return this.string();
		for (const [word, result] of [
			["true", true],
			["false", false],
			["null", null],
		] as const) {
			if (this.source.startsWith(word, this.offset)) {
				this.offset += word.length;
				return result;
			}
		}
		const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
			this.source.slice(this.offset),
		);
		if (!match) this.invalid();
		const number = Number(match[0]);
		if (
			!Number.isFinite(number) ||
			(Number.isInteger(number) && !Number.isSafeInteger(number))
		)
			this.invalid();
		this.offset += match[0].length;
		return number;
	}

	private array(depth: number): readonly SourceLiteralValue[] {
		const result: SourceLiteralValue[] = [];
		if (this.take("]")) return Object.freeze(result);
		while (true) {
			if (result.length >= sourceLiteralLimits.entries) this.limit("entries");
			result.push(this.value(depth + 1));
			if (this.take("]")) return Object.freeze(result);
			if (!this.take(",")) this.invalid();
			if (this.take("]")) return Object.freeze(result);
		}
	}

	private object(depth: number): {
		readonly [key: string]: SourceLiteralValue;
	} {
		const result: Record<string, SourceLiteralValue> = Object.create(null);
		let entries = 0;
		if (this.take("}")) return Object.freeze(result);
		while (true) {
			if (++entries > sourceLiteralLimits.entries) this.limit("entries");
			this.whitespace();
			let key: string;
			if (
				this.source[this.offset] === '"' ||
				this.source[this.offset] === "'"
			) {
				key = this.string();
			} else {
				const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(
					this.source.slice(this.offset),
				);
				if (!match) this.invalid();
				key = match[0];
				if (key.length > sourceLiteralLimits.stringCodeUnits)
					this.limit("string");
				this.offset += key.length;
			}
			if (
				reservedKeys.has(key) ||
				Object.hasOwn(result, key) ||
				!this.take(":")
			)
				this.invalid();
			result[key] = this.value(depth + 1);
			if (this.take("}")) return Object.freeze(result);
			if (!this.take(",")) this.invalid();
			if (this.take("}")) return Object.freeze(result);
		}
	}

	private string(): string {
		const quote = this.source[this.offset++];
		let result = "";
		while (this.offset < this.source.length) {
			let character = this.source[this.offset++];
			if (character === quote) return result;
			if (character.charCodeAt(0) < 0x20) this.invalid();
			if (character === "\\") {
				character = this.source[this.offset++];
				if (character === "u") {
					const digits = this.source.slice(this.offset, this.offset + 4);
					if (!/^[0-9a-fA-F]{4}$/.test(digits)) this.invalid();
					character = String.fromCharCode(Number.parseInt(digits, 16));
					this.offset += 4;
				} else {
					const escapes: Record<string, string> = {
						'"': '"',
						"'": "'",
						"\\": "\\",
						"/": "/",
						b: "\b",
						f: "\f",
						n: "\n",
						r: "\r",
						t: "\t",
					};
					if (!Object.hasOwn(escapes, character)) this.invalid();
					character = escapes[character];
				}
			}
			result += character;
			if (result.length > sourceLiteralLimits.stringCodeUnits)
				this.limit("string");
		}
		this.invalid();
	}
}

export function parseSourceLiteral(source: unknown): SourceLiteralValue {
	if (typeof source !== "string")
		throw new AgentBrowserError(
			"invalid-input",
			"Source literal must be a string",
		);
	if (source.length > sourceLiteralLimits.inputCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Source literal input limit exceeded",
		);
	return new LiteralParser(source).parse();
}
