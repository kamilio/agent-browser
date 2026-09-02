import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { type ScriptHostObjectFactory, domString } from "./script-dom.js";

const maximum = {
	maxLists: 1024,
	maxTokens: 4096,
	maxCodeUnits: 65_536,
	maxCachedCodeUnits: 1_048_576,
	maxArguments: 256,
};
export type ClassListLimits = typeof maximum;
interface ListState {
	capability: object;
	raw?: string;
	tokens: string[];
	charge: number;
}

export class ScriptClassLists {
	private readonly lists = new Map<number, ListState>();
	private readonly limits: ClassListLimits;
	private readonly unregisterClose: () => unknown;
	private cachedCodeUnits = 0;
	private refreshes = 0;
	private closed = false;

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		limits: Partial<ClassListLimits> = {},
	) {
		this.limits = { ...maximum, ...limits };
		for (const [key, value] of Object.entries(this.limits))
			if (
				!Object.hasOwn(maximum, key) ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > maximum[key as keyof ClassListLimits]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid class list limits",
				);
		this.unregisterClose = tree.onClose(() => this.close());
	}

	get(id: number) {
		return this.state(id).capability;
	}

	setValue(id: number, value: unknown) {
		const state = this.state(id);
		const raw = this.string(value);
		this.write(id, state, raw, this.parse(raw));
	}

	metrics() {
		return Object.freeze({
			lists: this.lists.size,
			cachedCodeUnits: this.cachedCodeUnits,
			refreshes: this.refreshes,
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const state of this.lists.values()) {
			state.raw = undefined;
			state.tokens = [];
			state.charge = 0;
		}
		this.lists.clear();
		this.cachedCodeUnits = 0;
		this.unregisterClose();
	}

	private read(id: number) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Class lists are closed");
		const node = this.tree.get(id);
		if (node.kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Class list requires an element",
			);
		return node;
	}

	private raw(id: number) {
		const value = this.read(id).attributes.class ?? "";
		this.checkSize(value);
		return value;
	}

	private state(id: number): ListState {
		this.read(id);
		const existing = this.lists.get(id);
		if (existing) return existing;
		if (this.lists.size >= this.limits.maxLists)
			throw new AgentBrowserError(
				"resource-limit",
				"Class list count limit exceeded",
			);
		const state: ListState = { capability: {}, tokens: [], charge: 0 };
		const tokens = () => this.tokens(id, state);
		state.capability = this.factory.createHostObject({
			indexed: {
				maxLength: this.limits.maxTokens,
				length: () => tokens().length,
				get: (index) => tokens()[index],
			},
			properties: {
				value: {
					get: () => this.raw(id),
					set: (value) => this.setValue(id, value),
				},
			},
			methods: {
				toString: () => this.raw(id),
				item: (...args) => {
					this.require(id, args, 1);
					const value = args[0];
					if (
						value !== null &&
						["object", "function", "symbol", "bigint"].includes(typeof value)
					)
						throw new AgentBrowserError(
							"unsupported",
							"Class list index requires primitive conversion",
						);
					const number = Number(value);
					const index = Number.isFinite(number)
						? ((Math.trunc(number) % 4294967296) + 4294967296) % 4294967296
						: 0;
					return tokens()[index] ?? null;
				},
				contains: (...args) => {
					this.require(id, args, 1);
					const token = this.string(args[0]);
					return tokens().includes(token);
				},
				add: (...args) => {
					this.require(id, args, 0);
					const additions = this.validate(args);
					const next = [...new Set([...tokens(), ...additions])];
					this.update(id, state, next);
				},
				remove: (...args) => {
					this.require(id, args, 0);
					const removals = new Set(this.validate(args));
					this.update(
						id,
						state,
						tokens().filter((token) => !removals.has(token)),
					);
				},
				toggle: (...args) => {
					this.require(id, args, 1);
					const [token] = this.validate(args.slice(0, 1));
					const current = tokens();
					const present = current.includes(token);
					const wanted = args[1] === undefined ? !present : Boolean(args[1]);
					if (wanted !== present)
						this.update(
							id,
							state,
							wanted
								? [...current, token]
								: current.filter((value) => value !== token),
						);
					return wanted;
				},
				replace: (...args) => {
					this.require(id, args, 2);
					const [token, replacement] = this.validate(args.slice(0, 2));
					const current = tokens();
					if (!current.includes(token)) return false;
					const next: string[] = [];
					let inserted = false;
					for (const value of current) {
						if (value !== token && value !== replacement) next.push(value);
						else if (!inserted) {
							next.push(replacement);
							inserted = true;
						}
					}
					this.update(id, state, next);
					return true;
				},
				supports: (...args) => {
					this.require(id, args, 1);
					this.string(args[0]);
					throw new TypeError("classList has no supported token vocabulary");
				},
			},
		});
		if (!state.capability || typeof state.capability !== "object")
			throw new AgentBrowserError(
				"unsupported",
				"Invalid class list host capability",
			);
		this.lists.set(id, state);
		return state;
	}

	private require(id: number, args: readonly unknown[], count: number) {
		this.read(id);
		if (args.length < count)
			throw new AgentBrowserError(
				"invalid-input",
				"Class list method requires more arguments",
			);
		if (args.length > this.limits.maxArguments)
			throw new AgentBrowserError(
				"resource-limit",
				"Class list argument limit exceeded",
			);
	}

	private checkSize(value: string) {
		if (value.length > this.limits.maxCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Class list string limit exceeded",
			);
	}

	private string(value: unknown) {
		const text = domString(value);
		this.checkSize(text);
		return text;
	}

	private validate(args: readonly unknown[]) {
		const tokens = args.map((value) => this.string(value));
		let size = 0;
		for (const token of tokens) {
			if (!token)
				throw new AgentBrowserError(
					"invalid-input",
					"Class token cannot be empty",
				);
			if (/[\t\n\f\r ]/.test(token))
				throw new AgentBrowserError(
					"invalid-input",
					"Class token cannot contain ASCII whitespace",
				);
			size += token.length;
			if (size > this.limits.maxCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Class list argument size limit exceeded",
				);
		}
		return tokens;
	}

	private parse(raw: string) {
		this.checkSize(raw);
		const tokens = new Set<string>();
		for (const match of raw.matchAll(/[^\t\n\f\r ]+/g)) {
			tokens.add(match[0]);
			if (tokens.size > this.limits.maxTokens)
				throw new AgentBrowserError(
					"resource-limit",
					"Class list token limit exceeded",
				);
		}
		return [...tokens];
	}

	private charge(state: ListState, raw: string, tokens: readonly string[]) {
		if (tokens.length > this.limits.maxTokens)
			throw new AgentBrowserError(
				"resource-limit",
				"Class list token limit exceeded",
			);
		const charge =
			raw.length +
			tokens.reduce((total, token) => total + token.length + 16, 0);
		if (
			this.cachedCodeUnits - state.charge + charge >
			this.limits.maxCachedCodeUnits
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Class list cache limit exceeded",
			);
		return charge;
	}

	private cache(
		state: ListState,
		raw: string,
		tokens: string[],
		charge: number,
	) {
		this.cachedCodeUnits += charge - state.charge;
		state.raw = raw;
		state.tokens = tokens;
		state.charge = charge;
		this.refreshes++;
	}

	private tokens(id: number, state: ListState) {
		const raw = this.raw(id);
		if (state.raw !== raw) {
			const tokens = this.parse(raw);
			this.cache(state, raw, tokens, this.charge(state, raw, tokens));
		}
		return state.tokens;
	}

	private update(id: number, state: ListState, tokens: string[]) {
		if (!tokens.length && !Object.hasOwn(this.read(id).attributes, "class"))
			return;
		const raw = tokens.join(" ");
		this.checkSize(raw);
		this.write(id, state, raw, tokens);
	}

	private write(id: number, state: ListState, raw: string, tokens: string[]) {
		const charge = this.charge(state, raw, tokens);
		this.tree.setAttribute(id, "class", raw);
		this.cache(state, raw, tokens, charge);
	}
}
