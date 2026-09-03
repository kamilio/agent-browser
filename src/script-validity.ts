import {
	type ControlValidity,
	type ValidityProperty,
	controlValidity,
	validityProperties,
} from "./control-validity.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { supportsConstraintValidation } from "./form-validation.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

interface State {
	capability?: object;
	revision: number;
	flags?: ControlValidity;
}

export class ScriptValidity {
	private readonly states = new Map<number, State>();
	private closed = false;
	private evaluations = 0;
	private readonly unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		private readonly maxStates = 1024,
	) {
		if (!Number.isSafeInteger(maxStates) || maxStates < 1 || maxStates > 1024)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid validity state limit",
			);
		if (typeof factory?.createHostObject !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Validity states require a host-object factory",
			);
		this.unregisterClose = tree.onClose(() => this.close());
	}

	get(id: number): object {
		this.read(id);
		const existing = this.states.get(id);
		if (existing) {
			if (existing.capability) return existing.capability;
			throw new AgentBrowserError(
				"unsupported",
				"Recursive validity state creation",
			);
		}
		if (this.states.size >= this.maxStates)
			throw new AgentBrowserError(
				"resource-limit",
				"Validity state count limit exceeded",
			);
		const state: State = { revision: -1 };
		this.states.set(id, state);
		try {
			const capability = this.factory.createHostObject({
				properties: Object.fromEntries(
					validityProperties.map((property) => [
						property,
						{ get: () => this.flag(id, property, state) },
					]),
				),
			});
			this.read(id);
			if (!capability || typeof capability !== "object")
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid validity host object",
				);
			state.capability = capability;
			return capability;
		} catch (error) {
			state.flags = undefined;
			state.capability = undefined;
			this.states.delete(id);
			throw error;
		}
	}

	metrics() {
		return Object.freeze({
			states: this.states.size,
			evaluations: this.evaluations,
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const state of this.states.values()) {
			state.flags = undefined;
			state.capability = undefined;
		}
		this.states.clear();
		this.unregisterClose();
	}

	private read(id: number) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Validity states are closed");
		if (!supportsConstraintValidation(this.tree.get(id).tagName))
			throw new AgentBrowserError(
				"invalid-input",
				"Expected a validation control",
			);
	}

	private flag(id: number, property: ValidityProperty, state: State): boolean {
		this.read(id);
		if (this.states.get(id) !== state)
			throw new AgentBrowserError("closed", "Validity state is unavailable");
		const custom = this.tree.getCustomValidity(id) !== "";
		if (property === "customError") return custom;
		if (property === "valid" && custom) return false;
		if (!state.flags || state.revision !== this.tree.revision) {
			state.flags = controlValidity(this.tree, id);
			state.revision = this.tree.revision;
			this.evaluations++;
		}
		return state.flags[property];
	}
}
