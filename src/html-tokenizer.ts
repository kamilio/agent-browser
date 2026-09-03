import { AgentBrowserError } from "./errors.js";
import { htmlAttributeName } from "./html-attribute-name.js";
import { createHtmlAttributes, setHtmlAttribute } from "./html-attributes.js";
import { decodeHtmlEntities } from "./html-entities.js";

export type HtmlToken =
	| { kind: "text"; data: string }
	| { kind: "comment"; data: string }
	| { kind: "doctype"; data: string }
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

export class HtmlTokenizer {
	private offset = 0;
	private input: string;
	private boundary?: number;
	private pending = false;
	private bufferedIssues?: string[];
	private work = 0;
	constructor(
		private source: string,
		private readonly onIssue: (code: string) => void,
	) {
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
		if (this.bufferedIssues) this.bufferedIssues.push(code);
		else this.onIssue(code);
	};

	private read<Result>(operation: () => Result): Result | undefined {
		const start = this.offset;
		this.pending = false;
		this.bufferedIssues = [];
		try {
			const result = operation();
			this.work += Math.max(0, this.offset - start);
			for (const issue of this.bufferedIssues) this.onIssue(issue);
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
		if (
			/^<!doctype(?:[\t\n\f\r >]|$)/i.test(
				this.source.slice(this.offset, this.offset + 11),
			)
		) {
			this.offset += 9;
			const data = this.declaration();
			return { kind: "doctype", data: data.trim() };
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
		if (this.boundary !== undefined && nameStart >= this.source.length)
			throw needInput;
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
				throw new AgentBrowserError(
					"resource-limit",
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
		let state: "data" | "escaped" | "double" = "data";
		while (this.offset < this.source.length) {
			if (state === "data" && this.source.startsWith("<!--", this.offset)) {
				state = "escaped";
				this.offset += 4;
				continue;
			}
			if (
				state !== "data" &&
				this.source[this.offset] === ">" &&
				this.source.slice(this.offset - 2, this.offset) === "--"
			)
				state = "data";
			if (this.source[this.offset] === "<") {
				const closing = /^<\/script(?=[\t\n\f\r />])/i.test(
					this.source.slice(this.offset, this.offset + 10),
				);
				if (closing) {
					if (state !== "double") return this.source.slice(start, this.offset);
					state = "escaped";
					this.offset += 8;
					continue;
				}
				if (
					state === "escaped" &&
					/^<script(?=[\t\n\f\r />])/i.test(
						this.source.slice(this.offset, this.offset + 9),
					)
				) {
					state = "double";
					this.offset += 7;
					continue;
				}
			}
			this.offset++;
		}
		this.issue("unterminated-raw-element");
		return this.source.slice(start);
	}

	remainder() {
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
