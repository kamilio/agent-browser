import type { ObservedDocumentMutation } from "./document-observers.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

export interface ScriptMutationRecordLimits {
	maxRecords: number;
	maxCodeUnits: number;
	maxNodeReferences: number;
}

interface RecordState {
	record: ObservedDocumentMutation | null;
	lists: Partial<Record<"addedNodes" | "removedNodes", object>>;
	creating: Set<string>;
}

export class ScriptMutationRecords {
	private tree: DocumentTree | null;
	private factory: ScriptHostObjectFactory | null;
	private node: ((id: number) => object) | null;
	private readonly limits: ScriptMutationRecordLimits;
	private readonly states = new Set<RecordState>();
	private readonly capabilities = new Set<object>();
	private unregisterClose: (() => unknown) | null;
	private records = 0;
	private codeUnits = 0;
	private nodeReferences = 0;
	private closed = false;

	constructor(
		tree: DocumentTree,
		factory: ScriptHostObjectFactory,
		node: (id: number) => object,
		limits: Partial<ScriptMutationRecordLimits> = {},
	) {
		this.tree = tree;
		this.factory = factory;
		this.node = node;
		this.limits = {
			maxRecords: 1024,
			maxCodeUnits: 2_000_000,
			maxNodeReferences: 65_536,
			...limits,
		};
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid mutation record limit",
				);
		if (
			typeof factory?.createHostObject !== "function" ||
			typeof node !== "function"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid mutation record capability provider",
			);
		this.unregisterClose = tree.onClose(() => this.close());
	}

	wrap(records: readonly ObservedDocumentMutation[]): readonly object[] {
		this.ensureOpen();
		if (records.length > this.limits.maxRecords - this.records)
			throw this.limitError();
		let codeUnits = 0;
		let nodeReferences = 0;
		for (const record of records) {
			codeUnits +=
				(record.oldValue?.length ?? 0) + (record.attributeName?.length ?? 0);
			nodeReferences +=
				1 +
				record.addedNodes.length +
				record.removedNodes.length +
				Number(record.previousSibling !== null) +
				Number(record.nextSibling !== null);
			if (
				codeUnits > this.limits.maxCodeUnits - this.codeUnits ||
				nodeReferences > this.limits.maxNodeReferences - this.nodeReferences
			)
				throw this.limitError();
		}
		for (const record of records) {
			this.tree?.get(record.target);
			for (const id of record.addedNodes) this.tree?.get(id);
			for (const id of record.removedNodes) this.tree?.get(id);
			if (record.previousSibling !== null)
				this.tree?.get(record.previousSibling);
			if (record.nextSibling !== null) this.tree?.get(record.nextSibling);
		}
		this.records += records.length;
		this.codeUnits += codeUnits;
		this.nodeReferences += nodeReferences;
		try {
			const states = records.map(
				(record): RecordState => ({
					record: Object.freeze({
						type: record.type,
						target: record.target,
						addedNodes: Object.freeze([...record.addedNodes]),
						removedNodes: Object.freeze([...record.removedNodes]),
						previousSibling: record.previousSibling,
						nextSibling: record.nextSibling,
						attributeName: record.attributeName,
						attributeNamespace: record.attributeNamespace,
						oldValue: record.oldValue,
					}),
					lists: {},
					creating: new Set(),
				}),
			);
			for (const state of states) this.states.add(state);
			return Object.freeze(
				states.map((state) => {
					this.ensureOpen();
					const properties: NonNullable<
						ScriptHostObjectDefinition["properties"]
					> = {};
					for (const name of [
						"type",
						"oldValue",
						"attributeName",
						"attributeNamespace",
					] as const)
						properties[name] = { get: () => this.read(state)[name] };
					for (const name of [
						"target",
						"previousSibling",
						"nextSibling",
					] as const)
						properties[name] = {
							get: () => {
								const id = this.read(state)[name];
								return id === null ? null : this.resolve(id);
							},
						};
					for (const name of ["addedNodes", "removedNodes"] as const)
						properties[name] = { get: () => this.list(state, name) };
					return this.capability({ properties });
				}),
			);
		} catch (error) {
			this.close();
			throw error;
		}
	}

	metrics() {
		return Object.freeze({
			records: this.records,
			codeUnits: this.codeUnits,
			nodeReferences: this.nodeReferences,
			capabilities: this.capabilities.size,
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const state of this.states) {
			state.record = null;
			state.lists = {};
			state.creating.clear();
		}
		this.states.clear();
		this.capabilities.clear();
		this.records = 0;
		this.codeUnits = 0;
		this.nodeReferences = 0;
		this.tree = null;
		this.factory = null;
		this.node = null;
		this.unregisterClose?.();
		this.unregisterClose = null;
	}

	private list(state: RecordState, name: "addedNodes" | "removedNodes") {
		this.read(state);
		const existing = state.lists[name];
		if (existing) return existing;
		if (state.creating.has(name)) {
			this.close();
			throw new AgentBrowserError(
				"unsupported",
				"Reentrant mutation list construction",
			);
		}
		state.creating.add(name);
		try {
			const capability = this.capability({
				indexed: {
					maxLength: this.limits.maxNodeReferences,
					length: () => this.read(state)[name].length,
					get: (index) => {
						const ids = this.read(state)[name];
						if (!Number.isInteger(index) || index < 0 || index >= ids.length)
							return undefined;
						return this.resolve(ids[index]);
					},
				},
				methods: {
					item: (...args) => {
						const ids = this.read(state)[name];
						if (!args.length)
							throw new TypeError("NodeList.item requires an index");
						const value = args[0];
						if (
							(typeof value === "object" && value !== null) ||
							["function", "bigint", "symbol"].includes(typeof value)
						)
							throw new TypeError(
								"NodeList.item requires a primitive numeric index",
							);
						if (typeof value === "string" && value.length > 4096)
							throw this.limitError();
						const number = Number(value);
						const index = Number.isFinite(number)
							? ((Math.trunc(number) % 4_294_967_296) + 4_294_967_296) %
								4_294_967_296
							: 0;
						const id = ids[index];
						return id === undefined ? null : this.resolve(id);
					},
				},
			});
			state.lists[name] = capability;
			return capability;
		} catch (error) {
			this.close();
			throw error;
		} finally {
			state.creating.delete(name);
		}
	}

	private capability(definition: ScriptHostObjectDefinition) {
		this.ensureOpen();
		const capability = this.factory?.createHostObject(definition);
		this.ensureOpen();
		if (
			!capability ||
			typeof capability !== "object" ||
			this.capabilities.has(capability)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Invalid mutation record capability",
			);
		this.capabilities.add(capability);
		return capability;
	}

	private resolve(id: number) {
		this.ensureOpen();
		try {
			const node = this.node?.(id);
			this.ensureOpen();
			if (!node || typeof node !== "object")
				throw new AgentBrowserError(
					"unsupported",
					"Invalid mutation node capability",
				);
			return node;
		} catch (error) {
			this.close();
			throw error;
		}
	}

	private read(state: RecordState) {
		this.ensureOpen();
		if (!state.record)
			throw new AgentBrowserError("closed", "Mutation record is closed");
		return state.record;
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Mutation record owner is closed");
	}

	private limitError() {
		return new AgentBrowserError(
			"resource-limit",
			"Mutation record retention limit exceeded",
		);
	}
}
