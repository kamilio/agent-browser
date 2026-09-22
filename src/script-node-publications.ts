import { AgentBrowserError } from "./errors.js";
import type { PageFocusMethods } from "./page-focus.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

type PublicationKind =
	| "node"
	| "attribute"
	| "attribute-map"
	| "implementation"
	| "node-iterator";
const usedCapabilities = new WeakSet<object>();

export class ScriptNodePublications {
	private readonly active = {
		node: new Set<number>(),
		attribute: new Set<number>(),
		"attribute-map": new Set<number>(),
		implementation: new Set<number>(),
		"node-iterator": new Set<number>(),
	};
	private closed = false;
	private published = 0;
	private failed = 0;
	private readonly domExpandos: boolean;

	constructor(
		private readonly factory: ScriptHostObjectFactory,
		private readonly assertOwnerOpen: () => unknown,
	) {
		if (
			typeof factory?.createHostObject !== "function" ||
			typeof assertOwnerOpen !== "function"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid script publication provider",
			);
		this.domExpandos = factory.domExpandos === "bounded-v1";
	}

	pending(kind: PublicationKind) {
		return this.active[kind].size;
	}

	metrics() {
		return {
			pending:
				this.active.node.size +
				this.active.attribute.size +
				this.active["attribute-map"].size +
				this.active.implementation.size +
				this.active["node-iterator"].size,
			published: this.published,
			failed: this.failed,
			closed: this.closed,
		};
	}

	publish(
		kind: PublicationKind,
		id: number,
		definition: ScriptHostObjectDefinition,
		commit: (capability: object) => void,
		focusMethods?: (operations: PageFocusMethods) => PageFocusMethods,
		eventTarget?: (capability: object, assertActive: () => void) => void,
	): object {
		this.ensureOpen();
		const active = this.active[kind];
		if (active.has(id))
			throw new AgentBrowserError(
				"invalid-input",
				"Reentrant script node publication",
			);
		if (this.metrics().pending >= 128)
			throw new AgentBrowserError(
				"resource-limit",
				"Script node publication depth limit exceeded",
			);
		active.add(id);
		let ready = false;
		const read = () => {
			this.ensureOpen();
			if (!ready)
				throw new AgentBrowserError(
					"invalid-input",
					"Script node capability is not published",
				);
		};
		const guard =
			<Arguments extends readonly unknown[], Result>(
				operation: (...args: Arguments) => Result,
			) =>
			(...args: Arguments): Result => {
				read();
				const result = operation(...args);
				read();
				return result;
			};
		const guardFocus =
			(operation: (...args: readonly unknown[]) => unknown) =>
			async (...args: readonly unknown[]) => {
				read();
				await operation(...args);
				read();
			};
		try {
			const guarded: ScriptHostObjectDefinition = {
				...(this.domExpandos && kind === "node"
					? {
							expandos: {
								maxKeys: 64,
								maxKeyCodeUnits: 4096,
								assertActive: () => {
									read();
								},
							},
						}
					: {}),
				...(definition.properties
					? {
							properties: Object.fromEntries(
								Object.entries(definition.properties).map(
									([name, property]) => [
										name,
										{
											get: guard(property.get),
											...(property.set ? { set: guard(property.set) } : {}),
										},
									],
								),
							),
						}
					: {}),
				...(definition.methods
					? {
							methods: Object.fromEntries(
								Object.entries(definition.methods).map(([name, method]) => [
									name,
									focusMethods && (name === "focus" || name === "blur")
										? guardFocus(method)
										: guard(method),
								]),
							),
						}
					: {}),
				...(definition.indexed
					? {
							indexed: {
								...definition.indexed,
								length: guard(definition.indexed.length),
								get: guard(definition.indexed.get),
							},
						}
					: {}),
				...(definition.named
					? {
							named: {
								...definition.named,
								keys: guard(definition.named.keys),
								get: guard(definition.named.get),
								...(definition.named.set
									? { set: guard(definition.named.set) }
									: {}),
								...(definition.named.delete
									? { delete: guard(definition.named.delete) }
									: {}),
							},
						}
					: {}),
			};
			if (focusMethods) {
				if (!guarded.methods?.focus || !guarded.methods.blur)
					throw new AgentBrowserError(
						"invalid-input",
						"Focus publication requires both guarded methods",
					);
				Object.assign(
					guarded.methods,
					focusMethods({
						focus: guarded.methods.focus,
						blur: guarded.methods.blur,
					}),
				);
			}
			const capability = this.factory.createHostObject(guarded);
			if (capability === null || typeof capability !== "object")
				throw new AgentBrowserError(
					"unsupported",
					"Invalid script node capability",
				);
			if (usedCapabilities.has(capability))
				throw new AgentBrowserError(
					"invalid-input",
					"Script capability identity was already published",
				);
			usedCapabilities.add(capability);
			this.ensureOpen();
			eventTarget?.(capability, read);
			this.ensureOpen();
			commit(capability);
			this.ensureOpen();
			ready = true;
			this.published++;
			return capability;
		} catch (error) {
			this.failed++;
			throw error;
		} finally {
			active.delete(id);
		}
	}

	close() {
		this.closed = true;
		for (const active of Object.values(this.active)) active.clear();
	}

	private ensureOpen() {
		if (!this.closed) this.assertOwnerOpen();
		if (this.closed)
			throw new AgentBrowserError(
				"closed",
				"Script node publications are closed",
			);
	}
}
