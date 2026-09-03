import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { type ScriptHostObjectFactory, domString } from "./script-dom.js";

export interface ScriptDatasetLimits {
	maxMaps: number;
	maxKeys: number;
	maxKeyCodeUnits: number;
	maxWork: number;
}

function attributeName(name: string): string {
	return `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function propertyName(attribute: string): string | undefined {
	if (!attribute.startsWith("data-") || /[A-Z]/.test(attribute))
		return undefined;
	return attribute
		.slice(5)
		.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export class ScriptDatasets {
	readonly limits: Readonly<ScriptDatasetLimits>;
	private readonly maps = new Map<number, object>();
	private closed = false;

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		limits: Partial<ScriptDatasetLimits> = {},
	) {
		const defaults: ScriptDatasetLimits = {
			maxMaps: 256,
			maxKeys: 4096,
			maxKeyCodeUnits: 65_536,
			maxWork: 250_000,
		};
		this.limits = Object.freeze({ ...defaults, ...limits });
		for (const key of Object.keys(defaults) as (keyof ScriptDatasetLimits)[])
			if (
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > defaults[key] * 16
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid script dataset limit",
				);
	}

	get(id: number): object {
		this.read(id);
		const previous = this.maps.get(id);
		if (previous) return previous;
		if (this.maps.size >= this.limits.maxMaps)
			throw new AgentBrowserError(
				"resource-limit",
				"Script dataset map limit exceeded",
			);
		const capability = this.factory.createHostObject({
			named: {
				maxKeys: this.limits.maxKeys,
				maxKeyCodeUnits: this.limits.maxKeyCodeUnits,
				enumerable: true,
				keys: () => this.keys(id),
				get: (name) => {
					const attributes = this.read(id).attributes;
					this.checkName(name);
					if (/-[a-z]/.test(name)) return undefined;
					const attribute = attributeName(name);
					return Object.hasOwn(attributes, attribute)
						? attributes[attribute]
						: undefined;
				},
				set: (name, value) => {
					this.read(id);
					this.checkName(name);
					const text = domString(value);
					if (/-[a-z]/.test(name))
						throw new AgentBrowserError(
							"invalid-input",
							"Dataset property name contains a hyphen followed by a lowercase ASCII letter",
						);
					this.keys(id, name);
					this.tree.setAttribute(id, attributeName(name), text);
				},
				delete: (name) => {
					const attributes = this.read(id).attributes;
					this.checkName(name);
					if (/-[a-z]/.test(name)) return true;
					const attribute = attributeName(name);
					if (Object.hasOwn(attributes, attribute))
						this.tree.removeAttribute(id, attribute);
					return true;
				},
			},
		});
		if (!capability || typeof capability !== "object")
			throw new AgentBrowserError(
				"unsupported",
				"Invalid dataset host capability",
			);
		this.maps.set(id, capability);
		return capability;
	}

	close() {
		this.closed = true;
		this.maps.clear();
	}

	private keys(id: number, added?: string): string[] {
		const keys: string[] = [];
		let units = 0;
		let work = 0;
		for (const attribute of Object.keys(this.read(id).attributes)) {
			work += attribute.length + 1;
			if (work > this.limits.maxWork)
				throw new AgentBrowserError(
					"resource-limit",
					"Script dataset work limit exceeded",
				);
			const name = propertyName(attribute);
			if (name === undefined) continue;
			keys.push(name);
			units += name.length;
			this.checkKeys(keys.length, units);
		}
		if (added !== undefined && !keys.includes(added))
			this.checkKeys(keys.length + 1, units + added.length);
		return keys;
	}

	private checkKeys(count: number, units: number) {
		if (count > this.limits.maxKeys || units > this.limits.maxKeyCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Script dataset key limit exceeded",
			);
	}

	private checkName(name: string) {
		if (typeof name !== "string")
			throw new AgentBrowserError(
				"invalid-input",
				"Expected dataset property name",
			);
		if (name.length > this.limits.maxKeyCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Script dataset name limit exceeded",
			);
	}

	private read(id: number) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Script datasets are closed");
		const node = this.tree.get(id);
		if (node.kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Dataset requires an element",
			);
		return node;
	}
}
