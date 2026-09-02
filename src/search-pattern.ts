import { AgentBrowserError } from "./errors.js";

type Predicate = (code: number, charge: () => void) => boolean;
type Expression =
	| { kind: "empty" }
	| { kind: "char"; test: Predicate }
	| { kind: "assert"; value: string }
	| { kind: "sequence"; entries: Expression[] }
	| { kind: "choice"; entries: Expression[] }
	| { kind: "repeat"; entry: Expression; minimum: number; maximum: number };
type State =
	| { kind: "match" }
	| { kind: "char"; test: Predicate; next: number }
	| { kind: "assert"; value: string; next: number }
	| { kind: "split"; left: number; right: number };
export interface SearchWork {
	remaining: number;
}

const word = (code: number) =>
	(code >= 48 && code <= 57) ||
	(code >= 65 && code <= 90) ||
	(code >= 97 && code <= 122) ||
	code === 95;
const lineEnd = (code: number) => [10, 13, 0x2028, 0x2029].includes(code);
const otherCase = (code: number) =>
	code >= 65 && code <= 90
		? code + 32
		: code >= 97 && code <= 122
			? code - 32
			: code;

class Parser {
	private offset = 0;
	private depth = 0;
	constructor(
		private readonly source: string,
		private readonly insensitive: boolean,
		private readonly dotAll: boolean,
	) {}
	parse(): Expression {
		const expression = this.choice();
		if (this.offset !== this.source.length) this.invalid();
		return expression;
	}
	private choice(): Expression {
		const entries = [this.sequence()];
		while (this.source[this.offset] === "|") {
			this.offset++;
			entries.push(this.sequence());
		}
		return entries.length === 1 ? entries[0] : { kind: "choice", entries };
	}
	private sequence(): Expression {
		const entries: Expression[] = [];
		while (
			this.offset < this.source.length &&
			!["|", ")"].includes(this.source[this.offset])
		) {
			let entry = this.atom();
			const marker = this.source[this.offset];
			let minimum: number | undefined;
			let maximum = 0;
			if (marker === "*" || marker === "+" || marker === "?") {
				this.offset++;
				minimum = marker === "+" ? 1 : 0;
				maximum = marker === "?" ? 1 : Number.POSITIVE_INFINITY;
			} else if (marker === "{") {
				this.offset++;
				minimum = this.count();
				maximum = minimum;
				if (this.source[this.offset] === ",") {
					this.offset++;
					maximum =
						this.source[this.offset] === "}"
							? Number.POSITIVE_INFINITY
							: this.count();
				}
				if (this.source[this.offset++] !== "}" || maximum < minimum)
					this.invalid();
			}
			if (minimum !== undefined) {
				if (entry.kind === "assert") this.invalid();
				entry = { kind: "repeat", entry, minimum, maximum };
				if (this.source[this.offset] === "?") this.offset++;
			}
			entries.push(entry);
		}
		return entries.length === 0
			? { kind: "empty" }
			: entries.length === 1
				? entries[0]
				: { kind: "sequence", entries };
	}
	private atom(): Expression {
		const character = this.source[this.offset++];
		if (character === "(") {
			if (++this.depth > 32)
				throw new AgentBrowserError(
					"resource-limit",
					"Search pattern nesting limit exceeded",
				);
			if (this.source[this.offset] === "?") {
				if (this.source.slice(this.offset, this.offset + 2) !== "?:")
					throw new AgentBrowserError(
						"unsupported",
						"Search lookarounds and named groups are not implemented",
					);
				this.offset += 2;
			}
			const entry = this.choice();
			if (this.source[this.offset++] !== ")") this.invalid();
			this.depth--;
			return entry;
		}
		if (character === "^" || character === "$")
			return { kind: "assert", value: character };
		if (character === ".")
			return { kind: "char", test: (code) => this.dotAll || !lineEnd(code) };
		if (character === "[") return { kind: "char", test: this.characterClass() };
		if (character === "\\") {
			if (["b", "B"].includes(this.source[this.offset] ?? ""))
				return { kind: "assert", value: this.source[this.offset++] };
			const escaped = this.escape();
			return {
				kind: "char",
				test: typeof escaped === "number" ? this.literal(escaped) : escaped,
			};
		}
		if (["*", "+", "?", "{", "}", "]"].includes(character)) this.invalid();
		return { kind: "char", test: this.literal(character.charCodeAt(0)) };
	}
	private characterClass(): Predicate {
		const negate = this.source[this.offset] === "^";
		if (negate) this.offset++;
		const predicates: Predicate[] = [];
		while (
			this.offset < this.source.length &&
			this.source[this.offset] !== "]"
		) {
			const start = this.classUnit();
			if (
				this.source[this.offset] === "-" &&
				this.source[this.offset + 1] !== "]"
			) {
				this.offset++;
				const end = this.classUnit();
				if (typeof start !== "number" || typeof end !== "number" || start > end)
					this.invalid();
				predicates.push((code) => code >= start && code <= end);
			} else
				predicates.push(
					typeof start === "number" ? (code) => code === start : start,
				);
		}
		if (this.source[this.offset++] !== "]") this.invalid();
		return (code, charge) => {
			let matched = false;
			for (const predicate of predicates) {
				charge();
				if (
					predicate(code, charge) ||
					(this.insensitive && predicate(otherCase(code), charge))
				) {
					matched = true;
					break;
				}
			}
			return negate ? !matched : matched;
		};
	}
	private classUnit(): number | Predicate {
		if (this.offset >= this.source.length) this.invalid();
		if (this.source[this.offset] === "\\") {
			this.offset++;
			return this.escape();
		}
		return this.source.charCodeAt(this.offset++);
	}
	private escape(): number | Predicate {
		const character = this.source[this.offset++];
		if (character === undefined) this.invalid();
		if ("dDwWsS".includes(character)) {
			const base = character.toLowerCase();
			return (code) => {
				const matched =
					base === "d"
						? code >= 48 && code <= 57
						: base === "w"
							? word(code)
							: String.fromCharCode(code).trim() === "";
				return character === base ? matched : !matched;
			};
		}
		const controls: Record<string, number> = {
			n: 10,
			r: 13,
			t: 9,
			v: 11,
			f: 12,
			b: 8,
		};
		if (Object.hasOwn(controls, character)) return controls[character];
		if (character === "x" || character === "u") {
			const width = character === "x" ? 2 : 4;
			const hex = this.source.slice(this.offset, this.offset + width);
			if (hex.length !== width || !/^[0-9a-fA-F]+$/.test(hex)) this.invalid();
			this.offset += width;
			return Number.parseInt(hex, 16);
		}
		if (character === "0" && !/[0-9]/.test(this.source[this.offset] ?? ""))
			return 0;
		if (/[a-zA-Z0-9]/.test(character))
			throw new AgentBrowserError(
				"unsupported",
				"Search backreferences and this escape are not implemented",
			);
		return character.charCodeAt(0);
	}
	private literal(expected: number): Predicate {
		return (code) =>
			code === expected || (this.insensitive && otherCase(code) === expected);
	}
	private count() {
		const start = this.offset;
		while (/[0-9]/.test(this.source[this.offset] ?? "")) this.offset++;
		if (start === this.offset) this.invalid();
		const value = Number(this.source.slice(start, this.offset));
		if (value > 128)
			throw new AgentBrowserError(
				"resource-limit",
				"Search repetition limit exceeded",
			);
		return value;
	}
	private invalid(): never {
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid search regular expression",
		);
	}
}

export function compileSearchPattern(pattern: string) {
	if (typeof pattern !== "string" || pattern.length > 1024)
		throw new AgentBrowserError(
			"invalid-input",
			"Search pattern must contain at most 1024 code units",
		);
	let source = pattern;
	let flags = "";
	const delimiter = pattern.lastIndexOf("/");
	if (pattern.startsWith("/") && delimiter > 0) {
		source = pattern.slice(1, delimiter);
		flags = pattern.slice(delimiter + 1);
	}
	if (!/^[ims]*$/.test(flags) || new Set(flags).size !== flags.length)
		throw new AgentBrowserError(
			"unsupported",
			"Search supports only i, m and s regular expression flags",
		);
	const expression = new Parser(
		source,
		flags.includes("i"),
		flags.includes("s"),
	).parse();
	const states: State[] = [{ kind: "match" }];
	const add = (state: State) => {
		if (states.length >= 2048)
			throw new AgentBrowserError(
				"resource-limit",
				"Search automaton state limit exceeded",
			);
		states.push(state);
		return states.length - 1;
	};
	let compilationWork = 0;
	const compile = (entry: Expression, next: number): number => {
		if (++compilationWork > 8192)
			throw new AgentBrowserError(
				"resource-limit",
				"Search compilation work limit exceeded",
			);
		if (entry.kind === "empty") return next;
		if (entry.kind === "char" || entry.kind === "assert")
			return add({ ...entry, next });
		if (entry.kind === "sequence") {
			let cursor = next;
			for (const child of [...entry.entries].reverse())
				cursor = compile(child, cursor);
			return cursor;
		}
		if (entry.kind === "choice")
			return entry.entries
				.map((child) => compile(child, next))
				.reduce((left, right) => add({ kind: "split", left, right }));
		let cursor = next;
		if (entry.maximum === Number.POSITIVE_INFINITY) {
			cursor = add({ kind: "split", left: next, right: next });
			states[cursor] = {
				kind: "split",
				left: compile(entry.entry, cursor),
				right: next,
			};
		} else
			for (let count = entry.minimum; count < entry.maximum; count++)
				cursor = add({
					kind: "split",
					left: compile(entry.entry, cursor),
					right: cursor,
				});
		for (let count = 0; count < entry.minimum; count++)
			cursor = compile(entry.entry, cursor);
		return cursor;
	};
	const start = compile(expression, 0);
	return {
		states: states.length,
		test(text: string, work: SearchWork = { remaining: 1_000_000 }) {
			if (
				typeof text !== "string" ||
				!work ||
				!Number.isSafeInteger(work.remaining) ||
				work.remaining < 0
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid search work budget",
				);
			const charge = () => {
				if (--work.remaining < 0)
					throw new AgentBrowserError(
						"resource-limit",
						"Search work limit exceeded",
					);
			};
			let active: number[] = [];
			for (let offset = 0; offset <= text.length; offset++) {
				const pending = [...active, start];
				const visited = new Set<number>();
				const next: number[] = [];
				while (pending.length) {
					charge();
					const index = pending.pop();
					if (index === undefined || visited.has(index)) continue;
					visited.add(index);
					const state = states[index];
					if (state.kind === "match") return true;
					if (state.kind === "split") pending.push(state.left, state.right);
					else if (state.kind === "assert") {
						const before = text.charCodeAt(offset - 1);
						const after = text.charCodeAt(offset);
						const matches =
							state.value === "^"
								? offset === 0 || (flags.includes("m") && lineEnd(before))
								: state.value === "$"
									? offset === text.length ||
										(flags.includes("m") && lineEnd(after))
									: state.value === "b"
										? word(before) !== word(after)
										: word(before) === word(after);
						if (matches) pending.push(state.next);
					} else if (
						offset < text.length &&
						state.test(text.charCodeAt(offset), charge)
					)
						next.push(state.next);
				}
				active = next;
			}
			return false;
		},
	};
}
