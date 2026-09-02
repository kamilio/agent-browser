import {
	controlChecked,
	formControls,
	inputType,
	radioGroup,
	selectOptions,
	selectedOptions,
} from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

export interface ScriptCollectionLimits {
	maxCollections: number;
	maxItems: number;
	maxCachedEntries: number;
	maxWork: number;
	maxQueryCodeUnits: number;
}

type CollectionKind =
	| "tag"
	| "class"
	| "children"
	| "options"
	| "selected-options"
	| "form-controls"
	| "form-named";
interface CollectionState {
	capability: object;
	ids: number[];
	revision: number;
}

export class ScriptCollections {
	readonly limits: Readonly<ScriptCollectionLimits>;
	private readonly collections = new Map<string, CollectionState>();
	private cachedEntries = 0;
	private refreshes = 0;
	private closed = false;
	private nextGroup = 0;

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		private readonly node: (id: number) => unknown,
		limits: Partial<ScriptCollectionLimits> = {},
	) {
		const defaults: ScriptCollectionLimits = {
			maxCollections: 256,
			maxItems: Math.min(tree.limits.maxNodes, 65_536),
			maxCachedEntries: 200_000,
			maxWork: 250_000,
			maxQueryCodeUnits: 16_384,
		};
		this.limits = Object.freeze({ ...defaults, ...limits });
		for (const key of Object.keys(defaults) as (keyof ScriptCollectionLimits)[])
			if (
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > defaults[key] * 16 ||
				(key === "maxItems" && this.limits[key] > 65_536)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid script collection limit",
				);
	}

	get stats() {
		return {
			collections: this.collections.size,
			cachedEntries: this.cachedEntries,
			refreshes: this.refreshes,
		};
	}

	get(owner: number, kind: CollectionKind, query = ""): object {
		this.ensureOpen(owner);
		this.checkQuery(query);
		const tokens =
			kind === "class"
				? [...new Set(query.split(/[\t\n\f\r ]+/).filter(Boolean))].sort()
				: [];
		const wanted =
			kind === "tag"
				? query.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
				: kind === "class"
					? tokens.join(" ")
					: query;
		const key = JSON.stringify([
			owner,
			kind,
			wanted,
			kind === "form-named" ? this.nextGroup++ : null,
		]);
		const existing = this.collections.get(key);
		if (existing) return existing.capability;
		if (this.collections.size >= this.limits.maxCollections)
			throw new AgentBrowserError(
				"resource-limit",
				"Script collection count limit exceeded",
			);
		const state: CollectionState = { capability: {}, ids: [], revision: -1 };
		const entries = (): number[] => {
			this.ensureOpen(owner);
			if (state.revision === this.tree.revision) return state.ids;
			let work = 0;
			const charge = (amount = 1) => {
				work += amount;
				if (work > this.limits.maxWork)
					throw new AgentBrowserError(
						"resource-limit",
						"Script collection work limit exceeded",
					);
			};
			const ids: number[] = [];
			for (const node of this.candidates(owner, kind)) {
				charge();
				if (node.id === owner || node.kind !== "element") continue;
				let matches =
					kind === "children" ||
					kind === "options" ||
					kind === "selected-options" ||
					kind === "form-controls" ||
					(kind === "form-named" &&
						(node.attributes.id === wanted ||
							node.attributes.name === wanted)) ||
					(kind === "tag" && (wanted === "*" || node.tagName === wanted));
				if (kind === "class" && tokens.length > 0) {
					const classes = node.attributes.class ?? "";
					charge(classes.length + tokens.length);
					const present = new Set(classes.split(/[\t\n\f\r ]+/));
					matches = tokens.every((token) => present.has(token));
				}
				if (!matches) continue;
				if (ids.length >= this.limits.maxItems)
					throw new AgentBrowserError(
						"resource-limit",
						"Script collection item limit exceeded",
					);
				ids.push(node.id);
			}
			const retained = this.cachedEntries - state.ids.length + ids.length;
			if (retained > this.limits.maxCachedEntries)
				throw new AgentBrowserError(
					"resource-limit",
					"Script collection cache limit exceeded",
				);
			this.cachedEntries = retained;
			state.ids = ids;
			state.revision = this.tree.revision;
			this.refreshes++;
			return ids;
		};
		state.capability = this.factory.createHostObject({
			...(kind === "form-named"
				? {
						properties: {
							value: {
								get: () => {
									for (const id of entries()) {
										const node = this.tree.get(id);
										if (
											node.tagName === "input" &&
											inputType(node) === "radio" &&
											controlChecked(this.tree, id)
										)
											return node.attributes.value ?? "on";
									}
									return "";
								},
								set: (value: unknown) => {
									const wanted = String(argument([value]));
									for (const id of entries()) {
										const node = this.tree.get(id);
										if (
											node.tagName !== "input" ||
											inputType(node) !== "radio" ||
											(node.attributes.value ?? "on") !== wanted
										)
											continue;
										for (const peer of radioGroup(this.tree, id))
											this.tree.setControl(peer.id, {
												checked: peer.id === id,
											});
										break;
									}
								},
							},
						},
					}
				: {}),
			indexed: {
				maxLength: this.limits.maxItems,
				length: () => entries().length,
				get: (index) => {
					const id = entries()[index];
					return id === undefined ? undefined : this.node(id);
				},
			},
			methods: {
				item: (...args) => {
					const value = argument(args);
					if (typeof value === "bigint")
						throw new AgentBrowserError(
							"unsupported",
							"BigInt index conversion is unsupported",
						);
					const number = Number(value);
					const index = Number.isFinite(number)
						? ((Math.trunc(number) % 4_294_967_296) + 4_294_967_296) %
							4_294_967_296
						: 0;
					const id = entries()[index];
					return id === undefined ? null : this.node(id);
				},
				...(kind === "form-named"
					? {}
					: {
							namedItem: (...args: readonly unknown[]) => {
								const name = String(argument(args));
								this.checkQuery(name);
								const ids = entries();
								if (!name) return null;
								let work = 0;
								let found: number | undefined;
								for (const id of ids) {
									if (++work > this.limits.maxWork)
										throw new AgentBrowserError(
											"resource-limit",
											"Script collection lookup limit exceeded",
										);
									const node = this.tree.get(id);
									if (
										node.attributes.id === name ||
										node.attributes.name === name
									) {
										if (kind !== "form-controls") return this.node(id);
										if (found !== undefined)
											return this.get(owner, "form-named", name);
										found = id;
									}
								}
								return found === undefined ? null : this.node(found);
							},
						}),
			},
		});
		if (!state.capability || typeof state.capability !== "object")
			throw new AgentBrowserError(
				"unsupported",
				"Invalid indexed host capability",
			);
		this.collections.set(key, state);
		return state.capability;
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const state of this.collections.values()) state.ids = [];
		this.collections.clear();
		this.cachedEntries = 0;
	}

	private ensureOpen(owner: number) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Script collections are closed");
		this.tree.get(owner);
	}
	private *candidates(owner: number, kind: CollectionKind) {
		if (kind === "form-controls" || kind === "form-named") {
			for (const node of formControls(this.tree, owner))
				if (!(node.tagName === "input" && inputType(node) === "image"))
					yield node;
		} else if (kind === "options" || kind === "selected-options") {
			if (this.tree.get(owner).tagName !== "select")
				throw new AgentBrowserError(
					"invalid-input",
					"Expected a select collection owner",
				);
			yield* kind === "options"
				? selectOptions(this.tree, owner)
				: selectedOptions(this.tree, owner);
		} else if (kind === "children") {
			for (const id of this.tree.get(owner).children) yield this.tree.get(id);
		} else {
			for (const { node } of this.tree.walk(owner)) yield node;
		}
	}
	private checkQuery(query: string) {
		if (query.length > this.limits.maxQueryCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Script collection query limit exceeded",
			);
	}
}

function argument(args: readonly unknown[]): unknown {
	if (args.length === 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Collection method requires an argument",
		);
	const value = args[0];
	if (value !== null && ["object", "function", "symbol"].includes(typeof value))
		throw new AgentBrowserError(
			"unsupported",
			"Object collection argument conversion is unsupported",
		);
	return value;
}
