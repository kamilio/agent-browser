import {
	type InlineDeclaration,
	declarationName,
	directDeclaration,
	inlineProperties,
	parseInlineDeclarations,
	propertyDeclarations,
	propertyPriority,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import {
	canonicalCssProperty,
	cssPropertyAccessors,
	cssPropertyAliases,
} from "./css-property-aliases.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

export interface InlineStyleLimits {
	maxObjects: number;
	maxCodeUnits: number;
	maxDeclarations: number;
	maxCachedCodeUnits: number;
}

interface StyleState {
	capability: object;
	source?: string;
	shared?: readonly InlineDeclaration[];
	entries: readonly InlineDeclaration[];
}

function scalar(value: unknown, nullEmpty = false): string {
	if (value === null && nullEmpty) return "";
	if (
		(typeof value === "object" && value !== null) ||
		typeof value === "function" ||
		typeof value === "symbol"
	)
		throw new AgentBrowserError(
			"unsupported",
			"CSS object coercion is unsupported",
		);
	return String(value);
}

export class InlineStyles {
	readonly limits: Readonly<InlineStyleLimits>;
	private readonly objects = new Map<number, StyleState>();
	private cachedCodeUnits = 0;
	private closed = false;
	private readonly unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		limits: Partial<InlineStyleLimits> = {},
	) {
		const defaults: InlineStyleLimits = {
			maxObjects: 256,
			maxCodeUnits: 65_536,
			maxDeclarations: 1024,
			maxCachedCodeUnits: 524_288,
		};
		this.limits = Object.freeze({ ...defaults, ...limits });
		for (const key of Object.keys(defaults) as (keyof InlineStyleLimits)[])
			if (
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > defaults[key] * 16
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid inline style limit",
				);
		this.unregisterClose = tree.onClose(() => this.close());
	}

	get stats() {
		return {
			objects: this.objects.size,
			cachedCodeUnits: this.cachedCodeUnits,
		};
	}

	get(id: number): object {
		this.ensureOpen(id);
		const existing = this.objects.get(id);
		if (existing) return existing.capability;
		if (this.objects.size >= this.limits.maxObjects)
			throw new AgentBrowserError(
				"resource-limit",
				"Inline style object limit exceeded",
			);
		const state: StyleState = { capability: {}, entries: [] };
		const read = () => this.read(id, state);
		const property = (name: string) => ({
			get: () => propertyValue(read(), name),
			set: (value: unknown) =>
				this.set(id, state, name, scalar(value, true), ""),
		});
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> = {
			cssText: {
				get: () => serializeDeclarations(read()),
				set: (value) => this.replace(id, scalar(value, true), state),
			},
			parentRule: {
				get: () => {
					this.ensureOpen(id);
					return null;
				},
			},
		};
		for (const name of [
			...inlineProperties,
			...Object.keys(cssPropertyAliases),
		]) {
			const canonical = canonicalCssProperty(name);
			for (const accessor of cssPropertyAccessors(name))
				properties[accessor] = property(canonical);
		}
		properties.cssFloat = property("float");
		const argument = (args: readonly unknown[], minimum: number) => {
			this.ensureOpen(id);
			if (args.length < minimum)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing CSS declaration argument",
				);
			const name = scalar(args[0]);
			this.checkSize(name);
			return declarationName(name);
		};
		state.capability = this.factory.createHostObject({
			properties,
			indexed: {
				maxLength: this.limits.maxDeclarations,
				length: () => read().length,
				get: (index) => read()[index]?.name,
			},
			methods: {
				getPropertyValue: (...args) => propertyValue(read(), argument(args, 1)),
				getPropertyPriority: (...args) => {
					const name = argument(args, 1);
					return propertyPriority(read(), name);
				},
				setProperty: (...args) =>
					this.set(
						id,
						state,
						argument(args, 2),
						scalar(args[1], true),
						args[2] === undefined ? "" : scalar(args[2], true),
					),
				removeProperty: (...args) => this.remove(id, state, argument(args, 1)),
				item: (...args) => {
					argument(args, 1);
					const numeric = Number(args[0]);
					const index = Number.isFinite(numeric)
						? ((Math.trunc(numeric) % 4_294_967_296) + 4_294_967_296) %
							4_294_967_296
						: 0;
					return read()[index]?.name ?? "";
				},
			},
		});
		this.objects.set(id, state);
		return state.capability;
	}

	replace(id: number, source: string, state = this.objects.get(id)) {
		this.ensureOpen(id);
		this.checkSize(source);
		const entries = parseInlineDeclarations(
			source,
			this.limits.maxDeclarations,
		);
		this.commit(id, entries, state);
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const state of this.objects.values()) {
			state.source = undefined;
			state.shared = undefined;
			state.entries = [];
		}
		this.objects.clear();
		this.cachedCodeUnits = 0;
		this.unregisterClose();
	}

	private read(id: number, state: StyleState): readonly InlineDeclaration[] {
		this.ensureOpen(id);
		const source = this.tree.get(id).attributes.style ?? "";
		const shared = this.tree.getInlineDeclarations(id);
		if (state.source === source && state.shared === shared)
			return state.entries;
		this.checkSize(source);
		const entries =
			shared ?? parseInlineDeclarations(source, this.limits.maxDeclarations);
		if (entries.length > this.limits.maxDeclarations)
			throw new AgentBrowserError(
				"resource-limit",
				"CSS declaration limit exceeded",
			);
		this.cache(source, entries, state, shared);
		return entries;
	}

	private set(
		id: number,
		state: StyleState,
		name: string,
		value: string,
		priority: string,
	) {
		this.ensureOpen(id);
		this.checkSize(name);
		this.checkSize(value);
		this.checkSize(priority);
		if (value === "") {
			this.remove(id, state, name);
			return;
		}
		if (priority !== "" && priority.toLowerCase() !== "important") return;
		const additions = directDeclaration(name, value, priority !== "");
		if (!additions.length) return;
		const previous = this.read(id, state);
		const entries = previous.map((entry) => ({ ...entry }));
		for (const entry of additions) {
			const index = entries.findIndex((current) => current.name === entry.name);
			if (index < 0) entries.push(entry);
			else entries[index] = entry;
		}
		if (
			entries.length === previous.length &&
			entries.every(
				(entry, index) =>
					entry.name === previous[index].name &&
					entry.value === previous[index].value &&
					entry.pending === previous[index].pending &&
					entry.important === previous[index].important,
			)
		)
			return;
		this.commit(id, entries, state);
	}

	private remove(id: number, state: StyleState, name: string): string {
		this.checkSize(name);
		const previous = this.read(id, state);
		const value = propertyValue(previous, name);
		const names = new Set(
			propertyDeclarations(previous, name).map((entry) => entry.name),
		);
		if (names.size)
			this.commit(
				id,
				previous.filter((entry) => !names.has(entry.name)),
				state,
			);
		return value;
	}

	private commit(id: number, entries: InlineDeclaration[], state?: StyleState) {
		if (entries.length > this.limits.maxDeclarations)
			throw new AgentBrowserError(
				"resource-limit",
				"CSS declaration limit exceeded",
			);
		const source = serializeDeclarations(entries);
		this.checkSize(source);
		if (state) this.checkCache(source, state);
		this.tree.setInlineDeclarations(id, source, entries);
		if (state) this.read(id, state);
	}

	private checkSize(source: string) {
		if (source.length > this.limits.maxCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Inline CSS source limit exceeded",
			);
	}

	private checkCache(source: string, state: StyleState) {
		if (
			this.cachedCodeUnits - (state.source?.length ?? 0) + source.length >
			this.limits.maxCachedCodeUnits
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Inline CSS cache limit exceeded",
			);
	}

	private cache(
		source: string,
		entries: readonly InlineDeclaration[],
		state: StyleState,
		shared?: readonly InlineDeclaration[],
	) {
		this.checkCache(source, state);
		this.cachedCodeUnits += source.length - (state.source?.length ?? 0);
		state.source = source;
		state.entries = entries;
		state.shared = shared;
	}

	private ensureOpen(id: number) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Inline styles are closed");
		if (this.tree.get(id).kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Inline styles require an element",
			);
	}
}
