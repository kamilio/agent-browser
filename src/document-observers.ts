import type { DocumentMutation, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface DocumentObserverOptions {
	childList?: boolean;
	attributes?: boolean;
	characterData?: boolean;
	subtree?: boolean;
	attributeOldValue?: boolean;
	characterDataOldValue?: boolean;
	attributeFilter?: readonly string[];
}

export interface DocumentObserverLimits {
	maxObservers: number;
	maxRegistrations: number;
	maxRecordsPerObserver: number;
	maxRecords: number;
	maxRecordCodeUnits: number;
	maxRecordNodeReferences: number;
	maxFilterNames: number;
	maxFilterCodeUnits: number;
}

export type ObservedDocumentMutation = Omit<DocumentMutation, "ancestors">;

export interface DocumentObserverDelivery {
	readonly observer: number;
	readonly records: readonly ObservedDocumentMutation[];
}

interface ObserverOptions {
	childList: boolean;
	attributes: boolean;
	characterData: boolean;
	subtree: boolean;
	attributeOldValue: boolean;
	characterDataOldValue: boolean;
	attributeFilter: ReadonlySet<string> | null;
}

interface Observer {
	id: number;
	registrations: Set<Registration>;
	records: ObservedDocumentMutation[];
	codeUnits: number;
	nodeReferences: number;
}

interface Registration {
	id: number;
	observer: Observer;
	target: number;
	options: ObserverOptions;
	source: number | null;
}

const defaultLimits: DocumentObserverLimits = {
	maxObservers: 256,
	maxRegistrations: 2048,
	maxRecordsPerObserver: 1024,
	maxRecords: 4096,
	maxRecordCodeUnits: 2_000_000,
	maxRecordNodeReferences: 65_536,
	maxFilterNames: 128,
	maxFilterCodeUnits: 4096,
};

export class DocumentObservers {
	private tree: DocumentTree | null;
	private readonly limits: DocumentObserverLimits;
	private readonly observers = new Map<number, Observer>();
	private readonly nodes = new Map<number, Set<Registration>>();
	private readonly pending = new Set<number>();
	private delivery: number[] | null = null;
	private deliveryIndex = 0;
	private nextObserver = 1;
	private nextRegistration = 1;
	private registrationCount = 0;
	private recordCount = 0;
	private codeUnits = 0;
	private nodeReferences = 0;
	private closed = false;
	private failed = false;
	private unsubscribeMutation: (() => void) | null = null;
	private unsubscribeClose: (() => void) | null = null;

	constructor(
		tree: DocumentTree,
		limits: Partial<DocumentObserverLimits> = {},
	) {
		this.tree = tree;
		this.limits = { ...defaultLimits, ...limits };
		for (const value of Object.values(this.limits)) {
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError("invalid-input", "Invalid observer limit");
		}
		this.unsubscribeMutation = tree.onMutation((record) =>
			this.capture(record),
		);
		try {
			this.unsubscribeClose = tree.onClose(() => this.close());
		} catch (error) {
			this.unsubscribeMutation();
			this.unsubscribeMutation = null;
			throw error;
		}
	}

	create() {
		this.assertHealthy();
		if (
			this.observers.size >= this.limits.maxObservers ||
			this.nextObserver >= Number.MAX_SAFE_INTEGER
		)
			throw this.limitError();
		const id = this.nextObserver++;
		this.observers.set(id, {
			id,
			registrations: new Set(),
			records: [],
			codeUnits: 0,
			nodeReferences: 0,
		});
		return id;
	}

	observe(id: number, target: number, options: DocumentObserverOptions = {}) {
		const observer = this.observer(id);
		this.tree?.get(target);
		const normalized = this.normalizeOptions(options);
		const existing = [...(this.nodes.get(target) ?? [])].filter(
			(registration) => registration.observer === observer,
		);
		if (existing.length) {
			for (const registration of existing) {
				for (const candidate of observer.registrations) {
					if (candidate.source === registration.id) this.remove(candidate);
				}
				registration.options = normalized;
			}
			return;
		}
		if (!this.canRegister()) throw this.limitError();
		this.register(observer, target, normalized, null);
	}

	takeRecords(id: number): readonly ObservedDocumentMutation[] {
		return this.drain(this.observer(id));
	}

	disconnect(id: number) {
		const observer = this.observer(id);
		for (const registration of observer.registrations)
			this.remove(registration);
		this.drain(observer);
	}

	release(id: number) {
		this.disconnect(id);
		this.observers.delete(id);
		this.pending.delete(id);
	}

	hasPending() {
		this.assertHealthy();
		return this.pending.size > 0;
	}

	beginDelivery() {
		this.assertHealthy();
		if (this.delivery !== null)
			throw new AgentBrowserError(
				"invalid-input",
				"Observer delivery is active",
			);
		if (!this.pending.size) return false;
		this.delivery = [...this.pending];
		this.deliveryIndex = 0;
		this.pending.clear();
		return true;
	}

	nextDelivery(): DocumentObserverDelivery | null {
		this.assertHealthy();
		while (this.delivery && this.deliveryIndex < this.delivery.length) {
			const observer = this.observers.get(this.delivery[this.deliveryIndex++]);
			if (!observer) continue;
			const records = this.drain(observer);
			for (const registration of observer.registrations) {
				if (registration.source !== null) this.remove(registration);
			}
			if (records.length)
				return Object.freeze({ observer: observer.id, records });
		}
		this.delivery = null;
		this.deliveryIndex = 0;
		return null;
	}

	assertHealthy() {
		if (this.failed) throw this.limitError();
		if (this.closed)
			throw new AgentBrowserError("closed", "Document observers are closed");
	}

	metrics() {
		return Object.freeze({
			observers: this.observers.size,
			registrations: this.registrationCount,
			records: this.recordCount,
			codeUnits: this.codeUnits,
			nodeReferences: this.nodeReferences,
			pending: this.pending.size,
			delivering: this.delivery !== null,
			closed: this.closed,
			failed: this.failed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.clear();
	}

	private observer(id: number) {
		this.assertHealthy();
		const observer = this.observers.get(id);
		if (!observer)
			throw new AgentBrowserError("not-found", "Unknown document observer");
		return observer;
	}

	private normalizeOptions(options: DocumentObserverOptions): ObserverOptions {
		if (!options || typeof options !== "object")
			throw new TypeError("Invalid observer options");
		for (const name of [
			"childList",
			"attributes",
			"characterData",
			"subtree",
			"attributeOldValue",
			"characterDataOldValue",
		] as const) {
			if (options[name] !== undefined && typeof options[name] !== "boolean")
				throw new TypeError("Observer flags must be booleans");
		}
		const attributes =
			options.attributes ??
			(options.attributeOldValue !== undefined ||
				options.attributeFilter !== undefined);
		const characterData =
			options.characterData ?? options.characterDataOldValue !== undefined;
		if (
			(!options.childList && !attributes && !characterData) ||
			(!attributes &&
				(options.attributeOldValue || options.attributeFilter !== undefined)) ||
			(!characterData && options.characterDataOldValue)
		)
			throw new TypeError("Inconsistent observer options");
		let attributeFilter: Set<string> | null = null;
		if (options.attributeFilter !== undefined) {
			if (!Array.isArray(options.attributeFilter))
				throw new TypeError("Observer attribute filter must be an array");
			if (options.attributeFilter.length > this.limits.maxFilterNames)
				throw this.limitError();
			attributeFilter = new Set();
			let codeUnits = 0;
			for (const name of options.attributeFilter) {
				if (typeof name !== "string")
					throw new TypeError("Observer attribute names must be strings");
				codeUnits += name.length;
				if (codeUnits > this.limits.maxFilterCodeUnits) throw this.limitError();
				attributeFilter.add(name);
			}
		}
		return {
			childList: options.childList ?? false,
			attributes,
			characterData,
			subtree: options.subtree ?? false,
			attributeOldValue: options.attributeOldValue ?? false,
			characterDataOldValue: options.characterDataOldValue ?? false,
			attributeFilter,
		};
	}

	private canRegister() {
		return (
			this.registrationCount < this.limits.maxRegistrations &&
			this.nextRegistration < Number.MAX_SAFE_INTEGER
		);
	}

	private register(
		observer: Observer,
		target: number,
		options: ObserverOptions,
		source: number | null,
	) {
		const registration = {
			id: this.nextRegistration++,
			observer,
			target,
			options,
			source,
		};
		let registrations = this.nodes.get(target);
		if (!registrations) {
			registrations = new Set();
			this.nodes.set(target, registrations);
		}
		registrations.add(registration);
		observer.registrations.add(registration);
		this.registrationCount++;
	}

	private remove(registration: Registration) {
		if (!registration.observer.registrations.delete(registration)) return;
		const registrations = this.nodes.get(registration.target);
		registrations?.delete(registration);
		if (!registrations?.size) this.nodes.delete(registration.target);
		this.registrationCount--;
	}

	private capture(record: DocumentMutation) {
		const interested = new Map<Observer, boolean>();
		const registrations = record.ancestors.flatMap((target) => [
			...(this.nodes.get(target) ?? []),
		]);
		for (const registration of registrations) {
			const { observer, options, target } = registration;
			if (record.type === "childList" && options.subtree) {
				for (const removed of record.removedNodes) {
					if (!this.canRegister()) return this.fail();
					this.register(observer, removed, options, registration.id);
				}
			}
			if (target !== record.target && !options.subtree) continue;
			if (!options[record.type]) continue;
			if (
				record.type === "attributes" &&
				options.attributeFilter &&
				(record.attributeNamespace !== null ||
					!options.attributeFilter.has(record.attributeName ?? ""))
			)
				continue;
			const oldValue =
				(record.type === "attributes" && options.attributeOldValue) ||
				(record.type === "characterData" && options.characterDataOldValue);
			interested.set(observer, oldValue || (interested.get(observer) ?? false));
		}
		for (const [observer, keepOldValue] of interested) {
			const oldValue = keepOldValue ? record.oldValue : null;
			const codeUnits =
				(oldValue?.length ?? 0) + (record.attributeName?.length ?? 0);
			const nodeReferences =
				1 +
				record.addedNodes.length +
				record.removedNodes.length +
				Number(record.previousSibling !== null) +
				Number(record.nextSibling !== null);
			if (
				observer.records.length >= this.limits.maxRecordsPerObserver ||
				this.recordCount >= this.limits.maxRecords ||
				codeUnits > this.limits.maxRecordCodeUnits - this.codeUnits ||
				nodeReferences >
					this.limits.maxRecordNodeReferences - this.nodeReferences
			)
				return this.fail();
			observer.records.push(
				Object.freeze({
					type: record.type,
					target: record.target,
					addedNodes: record.addedNodes,
					removedNodes: record.removedNodes,
					previousSibling: record.previousSibling,
					nextSibling: record.nextSibling,
					attributeName: record.attributeName,
					attributeNamespace: record.attributeNamespace,
					oldValue,
				}),
			);
			observer.codeUnits += codeUnits;
			observer.nodeReferences += nodeReferences;
			this.recordCount++;
			this.codeUnits += codeUnits;
			this.nodeReferences += nodeReferences;
			this.pending.add(observer.id);
		}
	}

	private drain(observer: Observer) {
		const records = observer.records;
		this.recordCount -= records.length;
		this.codeUnits -= observer.codeUnits;
		this.nodeReferences -= observer.nodeReferences;
		observer.records = [];
		observer.codeUnits = 0;
		observer.nodeReferences = 0;
		return Object.freeze(records);
	}

	private fail() {
		this.failed = true;
		this.clear();
	}

	private clear() {
		this.unsubscribeMutation?.();
		this.unsubscribeClose?.();
		this.unsubscribeMutation = null;
		this.unsubscribeClose = null;
		this.tree = null;
		this.observers.clear();
		this.nodes.clear();
		this.pending.clear();
		this.delivery = null;
		this.deliveryIndex = 0;
		this.registrationCount = 0;
		this.recordCount = 0;
		this.codeUnits = 0;
		this.nodeReferences = 0;
	}

	private limitError() {
		return new AgentBrowserError(
			"resource-limit",
			"Document observer limit exceeded",
		);
	}
}
