import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import type { PageBindingContext } from "./page-bindings.js";
import type { ScriptEventBindings } from "./script-events.js";

export const pageEventConstructorLimits = Object.freeze({
	maxEvents: 1024,
	maxDispatches: 8192,
	maxBindings: 4096,
});

interface TargetRecord {
	target: number;
	assertActive?: () => void;
}
interface EventRecord {
	event: BrowserEvent;
	receiver: object;
	bindings?: ScriptEventBindings;
	released: boolean;
}

const ownedReferences = new WeakSet<object>();
const claimedCapabilities = new WeakSet<object>();

function reference(value: unknown): value is object {
	return (
		value !== null && (typeof value === "object" || typeof value === "function")
	);
}

export class PageEventConstructors {
	readonly bootstrap: () => object;
	private readonly records = new Set<EventRecord>();
	private readonly eventFacades = new Map<object, EventRecord>();
	private readonly targets = new Map<object, TargetRecord>();
	private readonly targetIds = new Set<number>();
	private readonly controller = new AbortController();
	private unregisterClose: () => unknown = () => {};
	private eventConstructor?: object;
	private customEventConstructor?: object;
	private dispatchEvent?: object;
	private createLegacyEvent?: object;
	private windowCapability?: object;
	private bootstrapped = false;
	private published = false;
	private closed = false;
	private created = 0;
	private dispatches = 0;
	private pending = 0;
	private pendingReleases = 0;
	private cleanupFailures = 0;

	constructor(
		private readonly tree: DocumentTree,
		private readonly context: PageBindingContext,
		private readonly events: DocumentEvents,
		private readonly bindings: () => ScriptEventBindings | undefined,
	) {
		if (events.documentRoot !== tree.root || typeof bindings !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid event constructor document",
			);
		if (typeof context.nestedOperation !== "function")
			throw new AgentBrowserError(
				"unsupported",
				"Event dispatch requires await-result host operations",
			);
		try {
			this.unregisterClose = tree.onClose(() => this.close());
			this.ensureOpen();
			const dispatch = (target: unknown, facade: unknown) =>
				this.dispatch(target, facade);
			if (context.nestedOperation(dispatch) !== dispatch)
				throw new AgentBrowserError(
					"unsupported",
					"Event registration must preserve operation identity",
				);
			this.ensureOpen();
			const create = context.retainGuestArguments(
				(
					type: unknown,
					bubbles: unknown,
					cancelable: unknown,
					composed: unknown,
					receiver: unknown,
				) => this.create(type, bubbles, cancelable, composed, receiver, true),
				4,
			);
			const createLegacy = context.retainGuestArguments(
				(...args: unknown[]) => {
					if (args.length !== 1) {
						for (const value of new Set(args)) this.releaseInvalid(value);
						throw new AgentBrowserError(
							"invalid-input",
							"Invalid legacy event construction",
						);
					}
					return this.create("", false, false, false, args[0], false);
				},
				0,
			);
			const publish = context.retainGuestArguments(
				(
					eventConstructor: unknown,
					customEventConstructor: unknown,
					dispatchEvent: unknown,
				) =>
					this.publish(eventConstructor, customEventConstructor, dispatchEvent),
				0,
			);
			const publishLegacy = context.retainGuestArguments(
				(...args: unknown[]) => {
					const factory = args[0];
					try {
						this.ensureOpen();
						if (
							args.length !== 1 ||
							!this.published ||
							this.createLegacyEvent ||
							!reference(factory) ||
							ownedReferences.has(factory)
						)
							throw new AgentBrowserError(
								"invalid-input",
								"Invalid legacy event factory publication",
							);
						ownedReferences.add(factory);
						this.createLegacyEvent = factory;
					} catch (error) {
						for (const value of new Set(args)) this.releaseInvalid(value);
						throw error;
					}
				},
				0,
			);
			this.ensureOpen();
			if (
				typeof create !== "function" ||
				typeof createLegacy !== "function" ||
				typeof publish !== "function" ||
				typeof publishLegacy !== "function"
			)
				throw new AgentBrowserError(
					"unsupported",
					"Invalid retained event operations",
				);
			this.bootstrap = () => {
				this.ensureOpen();
				if (this.bootstrapped)
					throw new AgentBrowserError(
						"invalid-input",
						"Event bootstrap is available once",
					);
				this.bootstrapped = true;
				const port = context.createHostObject({
					methods: {
						create,
						createLegacy,
						publish,
						publishLegacy,
						initialize: (facade, type, bubbles, cancelable) =>
							this.initialize(facade, type, bubbles, cancelable),
						validateDocument: (capability) => {
							this.ensureOpen();
							const target = reference(capability)
								? this.targets.get(capability)
								: undefined;
							if (!target || target.target !== this.tree.root) return false;
							target.assertActive?.();
							this.ensureOpen();
							return true;
						},
						dispatch,
						window: () => {
							this.ensureOpen();
							if (!this.windowCapability)
								throw new AgentBrowserError(
									"invalid-input",
									"Event Window target is not registered",
								);
							return this.windowCapability;
						},
					},
				});
				this.ensureOpen();
				if (
					!port ||
					typeof port !== "object" ||
					claimedCapabilities.has(port) ||
					ownedReferences.has(port)
				)
					throw new AgentBrowserError(
						"unsupported",
						"Invalid event bootstrap capability",
					);
				claimedCapabilities.add(port);
				return port;
			};
		} catch (error) {
			this.close();
			throw error;
		}
	}

	get eventConstructorValue() {
		this.ensureOpen();
		return this.eventConstructor;
	}

	get customEventConstructorValue() {
		this.ensureOpen();
		return this.customEventConstructor;
	}

	get dispatchEventValue() {
		this.ensureOpen();
		return this.dispatchEvent;
	}

	get createEventValue() {
		this.ensureOpen();
		return this.createLegacyEvent;
	}

	assertDocument(tree: DocumentTree): void {
		this.ensureOpen();
		if (this.tree !== tree)
			throw new AgentBrowserError(
				"invalid-input",
				"Page event constructors belong to another document",
			);
	}

	registerTarget(
		target: number,
		capability: object,
		assertActive?: () => void,
	): void {
		this.ensureOpen();
		if (
			!Number.isSafeInteger(target) ||
			!capability ||
			typeof capability !== "object" ||
			(assertActive !== undefined && typeof assertActive !== "function")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid event dispatch target",
			);
		if (target !== this.events.windowTarget) this.tree.get(target);
		if (
			this.targetIds.has(target) ||
			claimedCapabilities.has(capability) ||
			ownedReferences.has(capability)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Event target capability is already registered",
			);
		if (this.targets.size >= pageEventConstructorLimits.maxBindings)
			throw new AgentBrowserError(
				"resource-limit",
				"Event dispatch binding limit exceeded",
			);
		claimedCapabilities.add(capability);
		this.targets.set(capability, { target, assertActive });
		this.targetIds.add(target);
		if (target === this.events.windowTarget) this.windowCapability = capability;
	}

	metrics() {
		return Object.freeze({
			closed: this.closed,
			events: this.records.size,
			created: this.created,
			bindings: this.targets.size,
			dispatches: this.dispatches,
			pending: this.pending,
			constructorReferences:
				Number(this.eventConstructor !== undefined) +
				Number(this.customEventConstructor !== undefined),
			dispatchReferences: Number(this.dispatchEvent !== undefined),
			legacyFactoryReferences: Number(this.createLegacyEvent !== undefined),
			pendingReleases: this.pendingReleases,
			cleanupFailures: this.cleanupFailures,
			partial: true,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		const records = [...this.records.values()];
		this.records.clear();
		this.eventFacades.clear();
		const constructors = [
			this.eventConstructor,
			this.customEventConstructor,
			this.dispatchEvent,
			this.createLegacyEvent,
		];
		this.eventConstructor = undefined;
		this.customEventConstructor = undefined;
		this.dispatchEvent = undefined;
		this.createLegacyEvent = undefined;
		this.windowCapability = undefined;
		this.targets.clear();
		this.targetIds.clear();
		this.controller.abort();
		for (const record of records) this.releaseRecord(record);
		for (const constructorReference of constructors)
			if (constructorReference) this.release(constructorReference);
		this.unregisterClose();
	}

	private ensureOpen() {
		if (this.closed || this.events.metrics().closed)
			throw new AgentBrowserError(
				"closed",
				"Page event constructors are closed",
			);
	}

	private publish(
		eventConstructor: unknown,
		customEventConstructor: unknown,
		dispatchEvent: unknown,
	) {
		try {
			this.ensureOpen();
			if (
				!this.bootstrapped ||
				this.published ||
				!reference(eventConstructor) ||
				!reference(customEventConstructor) ||
				!reference(dispatchEvent) ||
				eventConstructor === customEventConstructor ||
				eventConstructor === dispatchEvent ||
				customEventConstructor === dispatchEvent ||
				ownedReferences.has(eventConstructor) ||
				ownedReferences.has(customEventConstructor) ||
				ownedReferences.has(dispatchEvent)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid event constructor publication",
				);
			this.eventConstructor = eventConstructor;
			this.customEventConstructor = customEventConstructor;
			this.dispatchEvent = dispatchEvent;
			ownedReferences.add(eventConstructor);
			ownedReferences.add(customEventConstructor);
			ownedReferences.add(dispatchEvent);
			this.published = true;
		} catch (error) {
			this.releaseInvalid(eventConstructor);
			if (customEventConstructor !== eventConstructor)
				this.releaseInvalid(customEventConstructor);
			if (
				dispatchEvent !== eventConstructor &&
				dispatchEvent !== customEventConstructor
			)
				this.releaseInvalid(dispatchEvent);
			throw error;
		}
	}

	private create(
		type: unknown,
		bubbles: unknown,
		cancelable: unknown,
		composed: unknown,
		receiver: unknown,
		initialized: unknown,
	): object {
		let record: EventRecord | undefined;
		try {
			this.ensureOpen();
			if (
				!this.published ||
				typeof type !== "string" ||
				type.length > 256 ||
				typeof bubbles !== "boolean" ||
				typeof cancelable !== "boolean" ||
				typeof composed !== "boolean" ||
				typeof initialized !== "boolean" ||
				(!initialized && (type !== "" || bubbles || cancelable || composed)) ||
				!reference(receiver) ||
				ownedReferences.has(receiver)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid event construction",
				);
			if (this.created >= pageEventConstructorLimits.maxEvents)
				throw new AgentBrowserError(
					"resource-limit",
					"Event construction limit exceeded",
				);
			this.created++;
			record = {
				event: initialized
					? new BrowserEvent(type, { bubbles, cancelable, composed })
					: BrowserEvent.createLegacy(),
				receiver,
				released: false,
			};
			ownedReferences.add(receiver);
			this.records.add(record);
			const bindings = this.bindings();
			this.ensureOpen();
			if (!bindings)
				throw new AgentBrowserError(
					"unsupported",
					"Script event bindings are unavailable",
				);
			record.bindings = bindings;
			bindings.bindGuestEvent(record.event, receiver);
			this.ensureOpen();
			const facade = bindings.nativeEvent(record.event);
			this.ensureOpen();
			if (
				!facade ||
				typeof facade !== "object" ||
				claimedCapabilities.has(facade) ||
				ownedReferences.has(facade)
			)
				throw new AgentBrowserError(
					"unsupported",
					"Invalid event facade capability",
				);
			claimedCapabilities.add(facade);
			this.eventFacades.set(facade, record);
			return facade;
		} catch (error) {
			if (record) {
				this.records.delete(record);
				this.releaseRecord(record);
			} else this.releaseInvalid(receiver);
			this.releaseInvalid(initialized);
			throw error;
		}
	}

	private initialize(
		facade: unknown,
		type: unknown,
		bubbles: unknown,
		cancelable: unknown,
	): boolean {
		this.ensureOpen();
		const record = reference(facade)
			? this.eventFacades.get(facade)
			: undefined;
		if (
			!record ||
			typeof type !== "string" ||
			type.length > 256 ||
			typeof bubbles !== "boolean" ||
			typeof cancelable !== "boolean"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid event initialization",
			);
		if (record.bindings?.metrics().closed)
			throw new AgentBrowserError(
				"closed",
				"Constructed event bindings are closed",
			);
		if (record.event.eventPhase !== 0) return false;
		record.event.initEvent(type, bubbles, cancelable);
		return true;
	}

	private async dispatch(
		targetCapability: unknown,
		facade: unknown,
	): Promise<boolean> {
		this.ensureOpen();
		if (this.dispatches >= pageEventConstructorLimits.maxDispatches)
			throw new AgentBrowserError(
				"resource-limit",
				"Event dispatch limit exceeded",
			);
		this.dispatches++;
		const target = reference(targetCapability)
			? this.targets.get(targetCapability)
			: undefined;
		const record = reference(facade)
			? this.eventFacades.get(facade)
			: undefined;
		if (!this.published || !target || !record)
			throw new AgentBrowserError(
				"invalid-input",
				"Unknown event facade or dispatch target",
			);
		target.assertActive?.();
		this.ensureOpen();
		if (record.bindings?.metrics().closed)
			throw new AgentBrowserError(
				"closed",
				"Constructed event bindings are closed",
			);
		this.pending++;
		try {
			const result = await this.events.dispatchEventAsync(
				target.target,
				record.event,
				this.controller.signal,
			);
			target.assertActive?.();
			this.ensureOpen();
			return result;
		} finally {
			this.pending--;
		}
	}

	private releaseRecord(record: EventRecord) {
		record.bindings?.unbindGuestEvent(record.event);
		if (record.released) return;
		record.released = true;
		this.release(record.receiver);
	}

	private releaseInvalid(value: unknown) {
		if (reference(value) && !ownedReferences.has(value)) this.release(value);
	}

	private release(value: object) {
		ownedReferences.add(value);
		this.pendingReleases++;
		const settled = () => {
			ownedReferences.delete(value);
			this.pendingReleases--;
		};
		try {
			void Promise.resolve(this.context.releaseGuestReference(value)).then(
				settled,
				() => {
					this.cleanupFailures++;
					settled();
				},
			);
		} catch {
			this.cleanupFailures++;
			settled();
		}
	}
}
