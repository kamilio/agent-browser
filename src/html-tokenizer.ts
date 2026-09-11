import { AgentBrowserError } from "./errors.js";
import { htmlAttributeName } from "./html-attribute-name.js";
import { createHtmlAttributes, setHtmlAttribute } from "./html-attributes.js";
import { type HtmlDoctypeToken, readHtmlDoctype } from "./html-doctype.js";
import { decodeHtmlEntities } from "./html-entities.js";
import { resourceLimitError } from "./resource-limit.js";

export type HtmlToken =
	| { kind: "text"; data: string }
	| { kind: "comment"; data: string }
	| HtmlDoctypeToken
	| {
			kind: "start" | "end";
			name: string;
			attributes: Record<string, string>;
			selfClosing: boolean;
	  };

const whitespace = (character: string | undefined) =>
	character !== undefined && /[\t\n\f\r ]/.test(character);
const needInput = Symbol("HTML input boundary");

type CommentState =
	| "start"
	| "start-dash"
	| "comment"
	| "less-than"
	| "bang"
	| "bang-dash"
	| "bang-dash-dash"
	| "end-dash"
	| "end"
	| "end-bang";

export type HtmlDiscardRawName =
	| "script"
	| "style"
	| "xmp"
	| "iframe"
	| "noembed"
	| "noframes";

export const htmlRawDiscardWindowCodeUnits = 65_536;

type ScriptState = "data" | "escaped" | "double";
type RawWorkDebit = (units: number) => void;

const rawEndings = Object.freeze({
	script: "</script",
	style: "</style",
	xmp: "</xmp",
	iframe: "</iframe",
	noembed: "</noembed",
	noframes: "</noframes",
});

const scriptTransitions = Object.freeze({
	data: Object.freeze({ state: "data", advance: 1 }),
	escaped: Object.freeze({ state: "escaped", advance: 1 }),
	double: Object.freeze({ state: "double", advance: 1 }),
	comment: Object.freeze({ state: "escaped", advance: 4 }),
	open: Object.freeze({ state: "double", advance: 7 }),
	close: Object.freeze({ state: "escaped", advance: 8 }),
	end: Object.freeze({ state: "data", advance: 0 }),
} as const);

function rawPrefix(
	input: string,
	position: number,
	prefix: string,
	insensitive: boolean,
) {
	for (let index = 0; index < prefix.length; index++) {
		let code = input.charCodeAt(position + index);
		if (insensitive && code >= 65 && code <= 90) code += 32;
		if (code !== prefix.charCodeAt(index)) return false;
	}
	return true;
}

function rawDelimiter(character: string | undefined) {
	return (
		character === "\t" ||
		character === "\n" ||
		character === "\f" ||
		character === "\r" ||
		character === " " ||
		character === "/" ||
		character === ">"
	);
}

function rawTrailingDashes(
	input: string,
	position: number,
	carry: number,
	debit?: RawWorkDebit,
) {
	debit?.(position === 0 ? 1 : 2);
	if (position === 0) return carry;
	if (input[position - 1] !== "-") return 0;
	return (position === 1 ? carry >= 1 : input[position - 2] === "-") ? 2 : 1;
}

function scriptTransition(
	input: string,
	position: number,
	initialState: ScriptState,
	carry: number,
	debit?: RawWorkDebit,
) {
	let state = initialState;
	if (state === "data") {
		debit?.(4);
		if (rawPrefix(input, position, "<!--", false))
			return scriptTransitions.comment;
	}
	if (
		state !== "data" &&
		input[position] === ">" &&
		rawTrailingDashes(input, position, carry, debit) === 2
	)
		state = "data";
	if (input[position] === "<") {
		debit?.(9);
		if (
			rawPrefix(input, position, "</script", true) &&
			rawDelimiter(input[position + 8])
		)
			return state === "double"
				? scriptTransitions.close
				: scriptTransitions.end;
		if (state === "escaped") {
			debit?.(8);
			if (
				rawPrefix(input, position, "<script", true) &&
				rawDelimiter(input[position + 7])
			)
				return scriptTransitions.open;
		}
	}
	return scriptTransitions[state];
}

export class HtmlRawDiscardSession {
	readonly #name: HtmlDiscardRawName;
	#state: ScriptState = "data";
	#trailingDashes = 0;

	constructor(name: HtmlDiscardRawName) {
		this.#name = name;
	}

	matchesName(name: HtmlDiscardRawName) {
		return this.#name === name;
	}

	step(
		input: string,
		final: boolean,
		debit: RawWorkDebit,
		emitIssue: (code: string) => void,
	): { consumed: number; status: "more" | "end-tag" | "eof" } {
		const boundary = final ? input.length : input.length - 10;
		let consumed = 0;
		while (consumed < boundary) {
			debit(1);
			if (this.#name === "script") {
				const transition = scriptTransition(
					input,
					consumed,
					this.#state,
					this.#trailingDashes,
					debit,
				);
				if (transition.advance === 0) return { consumed, status: "end-tag" };
				this.#state = transition.state;
				consumed += transition.advance;
			} else {
				if (input[consumed] === "<") {
					const ending = rawEndings[this.#name];
					debit(ending.length + 1);
					if (
						rawPrefix(input, consumed, ending, true) &&
						rawDelimiter(input[consumed + ending.length])
					)
						return { consumed, status: "end-tag" };
				}
				consumed++;
			}
		}
		if (final) {
			emitIssue("unterminated-raw-element");
			return { consumed, status: "eof" };
		}
		if (consumed === 0)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid raw discard progress",
			);
		this.#trailingDashes = rawTrailingDashes(
			input,
			consumed,
			this.#trailingDashes,
			debit,
		);
		return { consumed, status: "more" };
	}
}

export class HtmlTokenizer {
	private offset = 0;
	private input: string;
	private boundary?: number;
	private pending = false;
	private bufferedIssues?: string[];
	private work = 0;
	private issues = 0;
	constructor(
		private source: string,
		private readonly onIssue: (code: string) => void,
		private readonly maxIssues?: number,
	) {
		if (
			maxIssues !== undefined &&
			(!Number.isSafeInteger(maxIssues) || maxIssues < 0)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid HTML tokenizer issue limit",
			);
		this.input = source;
	}

	get position() {
		return this.offset;
	}
	get paused() {
		return this.pending;
	}
	get workUnits() {
		return this.work;
	}
	get issueCount() {
		return this.issues;
	}
	get bounded() {
		return this.boundary !== undefined;
	}

	insert(text: string, position: number) {
		if (
			typeof text !== "string" ||
			!Number.isSafeInteger(position) ||
			position < this.offset ||
			position > this.input.length
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid HTML insertion point",
			);
		this.input =
			this.input.slice(0, position) + text + this.input.slice(position);
		if (this.boundary !== undefined && position <= this.boundary)
			this.boundary += text.length;
		this.setBoundary(this.boundary);
	}

	setBoundary(position: number | undefined) {
		if (
			position !== undefined &&
			(!Number.isSafeInteger(position) ||
				position < this.offset ||
				position > this.input.length)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid HTML input boundary",
			);
		this.boundary = position;
		this.source =
			position === undefined ? this.input : this.input.slice(0, position);
		this.pending = false;
	}

	private readonly issue = (code: string) => {
		if (this.boundary !== undefined && code.startsWith("unterminated-"))
			throw needInput;
		this.issues++;
		this.checkIssueLimit();
		if (this.bufferedIssues) this.bufferedIssues.push(code);
		else this.onIssue(code);
	};

	private checkIssueLimit() {
		if (this.maxIssues !== undefined && this.issues > this.maxIssues)
			throw resourceLimitError(
				"html.issues",
				this.maxIssues,
				this.issues,
				"HTML tokenizer issue limit exceeded",
			);
	}

	private read<Result>(operation: () => Result): Result | undefined {
		this.checkIssueLimit();
		const start = this.offset;
		this.pending = false;
		this.bufferedIssues = [];
		try {
			const result = operation();
			this.work += Math.max(0, this.offset - start);
			for (const issue of this.bufferedIssues) {
				this.checkIssueLimit();
				this.onIssue(issue);
			}
			this.checkIssueLimit();
			return result;
		} catch (error) {
			this.work += Math.max(0, this.offset - start);
			if (error !== needInput) throw error;
			this.offset = start;
			this.pending = true;
			return undefined;
		} finally {
			this.bufferedIssues = undefined;
		}
	}

	next(): HtmlToken | undefined {
		this.checkIssueLimit();
		if (this.offset >= this.source.length) {
			this.pending = this.boundary !== undefined;
			return undefined;
		}
		return this.read(() => this.readToken());
	}

	private readToken(): HtmlToken | undefined {
		if (this.source[this.offset] !== "<") {
			const nextTag = this.source.indexOf("<", this.offset);
			let end = nextTag < 0 ? this.source.length : nextTag;
			if (this.boundary !== undefined && end === this.source.length) {
				this.work += end - this.offset;
				const partial = /&(?:#(?:[xX][0-9a-fA-F]*|[0-9]*)?|[a-zA-Z0-9]*)$/.exec(
					this.source.slice(this.offset, end),
				);
				if (partial) end = this.offset + partial.index;
				if (end === this.offset) throw needInput;
			}
			const data = this.source.slice(this.offset, end);
			this.offset = end;
			return {
				kind: "text",
				data: decodeHtmlEntities(data, false, this.issue),
			};
		}
		if (this.source.startsWith("<!--", this.offset)) {
			return this.comment();
		}
		if (/^<!doctype/i.test(this.source.slice(this.offset, this.offset + 9))) {
			this.offset += 9;
			const result = readHtmlDoctype(this.source, this.offset, this.issue);
			this.offset = result.position;
			if (!result.terminated && this.boundary !== undefined) throw needInput;
			return result.token;
		}
		if (this.source[this.offset + 1] === "!") {
			this.issue("bogus-declaration");
			return this.bogusComment(this.offset + 2);
		}
		if (this.source[this.offset + 1] === "?") {
			this.issue("bogus-declaration");
			this.offset += 2;
			return { kind: "comment", data: this.declaration() };
		}
		const endTag = this.source[this.offset + 1] === "/";
		const nameStart = this.offset + (endTag ? 2 : 1);
		if (nameStart >= this.source.length) {
			if (this.boundary !== undefined) throw needInput;
			this.offset = this.source.length;
			this.issue("eof-before-tag-name");
			return { kind: "text", data: endTag ? "</" : "<" };
		}
		if (!/[a-zA-Z]/.test(this.source[nameStart] ?? "")) {
			if (
				endTag &&
				nameStart < this.source.length &&
				this.source[nameStart] !== ">"
			) {
				this.issue("invalid-first-character-of-tag-name");
				return this.bogusComment(nameStart);
			}
			this.offset++;
			return { kind: "text", data: "<" };
		}
		this.offset = nameStart;
		while (
			this.offset < this.source.length &&
			!/[\t\n\f\r />]/.test(this.source[this.offset])
		)
			this.offset++;
		const name = this.source.slice(nameStart, this.offset).toLowerCase();
		if (!/^[a-z][a-z0-9:_-]*$/.test(name))
			throw new AgentBrowserError(
				"unsupported",
				"HTML tag name is outside the document model",
			);
		const attributes = createHtmlAttributes();
		let count = 0;
		while (this.offset < this.source.length) {
			this.skipWhitespace();
			if (this.source[this.offset] === ">") {
				this.offset++;
				return {
					kind: endTag ? "end" : "start",
					name,
					attributes,
					selfClosing: false,
				};
			}
			if (this.source[this.offset] === "/") {
				this.offset++;
				if (this.source[this.offset] === ">") {
					this.offset++;
					return {
						kind: endTag ? "end" : "start",
						name,
						attributes,
						selfClosing: true,
					};
				}
				this.issue("unexpected-solidus");
				continue;
			}
			if (this.offset >= this.source.length) break;
			const attributeStart = this.offset;
			if (this.source[this.offset] === "=") this.offset++;
			while (
				this.offset < this.source.length &&
				!/[\t\n\f\r />=]/.test(this.source[this.offset])
			)
				this.offset++;
			const attribute = htmlAttributeName(
				this.source.slice(attributeStart, this.offset),
			);
			if (!attribute || /[\t\n\f\r "'/>=]/.test(attribute))
				throw new AgentBrowserError(
					"unsupported",
					"Malformed HTML attribute name is not implemented",
				);
			if (++count > 1024)
				throw resourceLimitError(
					"html.attributes",
					1024,
					count,
					"HTML attributes per token limit exceeded",
				);
			this.skipWhitespace();
			let value = "";
			if (this.source[this.offset] === "=") {
				this.offset++;
				this.skipWhitespace();
				const quote = this.source[this.offset];
				if (quote === '"' || quote === "'") {
					const start = ++this.offset;
					const end = this.source.indexOf(quote, start);
					if (end < 0) {
						this.offset = this.source.length;
						break;
					}
					value = this.source.slice(start, end);
					this.offset = end + 1;
				} else {
					const start = this.offset;
					while (
						this.offset < this.source.length &&
						!/[\t\n\f\r >]/.test(this.source[this.offset])
					)
						this.offset++;
					value = this.source.slice(start, this.offset);
				}
			}
			const duplicate = Object.hasOwn(attributes, attribute);
			if (duplicate) this.issue("duplicate-attribute");
			const decoded = decodeHtmlEntities(value, true, this.issue);
			if (!duplicate) setHtmlAttribute(attributes, attribute, decoded);
		}
		this.issue("unterminated-tag");
		return undefined;
	}

	private bogusComment(start: number): HtmlToken {
		const end = this.source.indexOf(">", start);
		this.offset = end < 0 ? this.source.length : end + 1;
		if (end < 0 && this.boundary !== undefined) throw needInput;
		return {
			kind: "comment",
			data: this.source
				.slice(start, end < 0 ? undefined : end)
				.replace(/\0/g, () => {
					this.issue("unexpected-null-character");
					return "\ufffd";
				}),
		};
	}

	private comment(): HtmlToken {
		this.offset += 4;
		const start = this.offset;
		let length = 0;
		let state: CommentState = "start";
		const token = (): HtmlToken => ({
			kind: "comment",
			data: this.source.slice(start, start + length).replace(/\0/g, "\ufffd"),
		});
		while (this.offset < this.source.length) {
			const character = this.source[this.offset++];
			switch (state) {
				case "start":
					if (character === "-") state = "start-dash";
					else if (character === ">") {
						this.issue("abrupt-closing-of-empty-comment");
						return token();
					} else {
						state = "comment";
						this.offset--;
					}
					break;
				case "start-dash":
					if (character === "-") state = "end";
					else if (character === ">") {
						this.issue("abrupt-closing-of-empty-comment");
						return token();
					} else {
						length++;
						state = "comment";
						this.offset--;
					}
					break;
				case "comment":
					if (character === "-") state = "end-dash";
					else {
						length++;
						if (character === "<") state = "less-than";
						else if (character === "\0")
							this.issue("unexpected-null-character");
					}
					break;
				case "less-than":
					if (character === "!") {
						length++;
						state = "bang";
					} else if (character === "<") length++;
					else {
						state = "comment";
						this.offset--;
					}
					break;
				case "bang":
					if (character === "-") state = "bang-dash";
					else {
						state = "comment";
						this.offset--;
					}
					break;
				case "bang-dash":
					if (character === "-") state = "bang-dash-dash";
					else {
						state = "end-dash";
						this.offset--;
					}
					break;
				case "bang-dash-dash":
					if (character !== ">") this.issue("nested-comment");
					state = "end";
					this.offset--;
					break;
				case "end-dash":
					if (character === "-") state = "end";
					else {
						length++;
						state = "comment";
						this.offset--;
					}
					break;
				case "end":
					if (character === ">") return token();
					if (character === "!") state = "end-bang";
					else if (character === "-") length++;
					else {
						length += 2;
						state = "comment";
						this.offset--;
					}
					break;
				case "end-bang":
					if (character === ">") {
						this.issue("incorrectly-closed-comment");
						return token();
					}
					length += 3;
					if (character === "-") state = "end-dash";
					else {
						state = "comment";
						this.offset--;
					}
					break;
			}
		}
		this.issue("unterminated-comment");
		return token();
	}

	raw(name: string, entities = false): string | undefined {
		return this.read(() => this.readRaw(name, entities));
	}

	discardRaw(
		name: HtmlDiscardRawName,
		debit: (units: number) => void,
	): Readonly<{ discardedCodeUnits: number; steps: number }> {
		if (
			typeof name !== "string" ||
			!Object.hasOwn(rawEndings, name) ||
			typeof debit !== "function" ||
			this.bounded
		)
			throw new AgentBrowserError("invalid-input", "Invalid raw discard input");
		this.checkIssueLimit();
		const start = this.offset;
		const session = new HtmlRawDiscardSession(name);
		let steps = 0;
		this.pending = false;
		try {
			for (;;) {
				const windowStart = this.offset;
				const length = Math.min(
					this.source.length - windowStart,
					htmlRawDiscardWindowCodeUnits,
				);
				debit(length);
				const input = this.source.slice(windowStart, windowStart + length);
				const result = session.step(
					input,
					windowStart + length === this.source.length,
					debit,
					(code) => {
						this.offset = windowStart + length;
						this.issue(code);
					},
				);
				this.offset = windowStart + result.consumed;
				steps++;
				if (result.status !== "more")
					return Object.freeze({
						discardedCodeUnits: this.offset - start,
						steps,
					});
			}
		} finally {
			this.work += Math.max(0, this.offset - start);
		}
	}

	private readRaw(name: string, entities: boolean): string {
		if (name === "script") return this.script();
		const ending = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, "ig");
		ending.lastIndex = this.offset;
		const match = ending.exec(this.source);
		const data = this.source.slice(this.offset, match?.index);
		this.offset = match?.index ?? this.source.length;
		if (!match) this.issue("unterminated-raw-element");
		return entities ? decodeHtmlEntities(data, false, this.issue) : data;
	}

	private script() {
		const start = this.offset;
		let state: ScriptState = "data";
		while (this.offset < this.source.length) {
			const transition = scriptTransition(this.source, this.offset, state, 0);
			if (transition.advance === 0)
				return this.source.slice(start, this.offset);
			state = transition.state;
			this.offset += transition.advance;
		}
		this.issue("unterminated-raw-element");
		return this.source.slice(start);
	}

	remainder() {
		this.checkIssueLimit();
		const value = this.source.slice(this.offset);
		this.work += value.length;
		this.offset = this.source.length;
		return value;
	}

	private skipWhitespace() {
		while (whitespace(this.source[this.offset])) this.offset++;
	}

	private declaration() {
		const start = this.offset;
		let quote = "";
		while (this.offset < this.source.length) {
			const character = this.source[this.offset++];
			if (quote) {
				if (character === quote) quote = "";
			} else if (character === '"' || character === "'") quote = character;
			else if (character === ">")
				return this.source.slice(start, this.offset - 1);
		}
		this.issue("unterminated-declaration");
		return this.source.slice(start);
	}
}
