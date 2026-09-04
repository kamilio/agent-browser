import type { DocumentNode } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { nearestSelect } from "./select-option-owner.js";

interface SelectionNode extends Omit<DocumentNode, "control"> {
	control: { selected?: boolean };
}

export class DocumentSelection {
	private readonly dirty = new Set<number>();
	private readonly owners = new Map<number, number>();
	private readonly selected = new Map<number, Set<number>>();
	private readonly eligible = new Map<number, Set<number>>();

	constructor(
		private readonly node: (id: number) => SelectionNode,
		private readonly changed: (id: number) => void,
	) {}

	initialize(id: number, source?: { state: DocumentSelection; id: number }) {
		const node = this.node(id);
		if (node.tagName !== "option") return;
		node.control.selected = source
			? (source.state.node(source.id).control.selected ?? false)
			: Object.hasOwn(node.attributes, "selected");
		if (source?.state.dirty.has(source.id)) this.dirty.add(id);
	}

	setOption(id: number, selected: boolean, dirty = true, reset = true) {
		const node = this.node(id);
		if (node.tagName !== "option")
			throw new AgentBrowserError("invalid-input", "Expected an option");
		const wasDirty = this.dirty.has(id);
		if (dirty) this.dirty.add(id);
		const changed =
			node.control.selected !== selected || wasDirty !== this.dirty.has(id);
		node.control.selected = selected;
		const owner = this.owners.get(id);
		if (owner !== undefined) {
			const entries = this.selected.get(owner) ?? new Set<number>();
			if (selected) entries.add(id);
			else entries.delete(id);
			this.selected.set(owner, entries);
		}
		if (changed) this.changed(id);
		if (reset && owner !== undefined)
			this.reset(owner, selected ? id : undefined);
	}

	setSelect(id: number, selected: readonly number[], dirtyAll: boolean) {
		const node = this.node(id);
		if (
			node.tagName !== "select" ||
			!Array.isArray(selected) ||
			selected.length > 50_000 ||
			selected.some((option) => this.owners.get(option) !== id)
		)
			throw new AgentBrowserError("invalid-input", "Invalid select selection");
		const wanted = new Set(selected);
		if (!Object.hasOwn(node.attributes, "multiple") && wanted.size > 1)
			throw new AgentBrowserError(
				"invalid-input",
				"Single select requires at most one option",
			);
		for (const option of this.options(id))
			this.setOption(
				option.id,
				wanted.has(option.id),
				dirtyAll || wanted.has(option.id),
				false,
			);
	}

	clearOption(id: number) {
		const changed = this.dirty.delete(id);
		this.setOption(
			id,
			Object.hasOwn(this.node(id).attributes, "selected"),
			false,
		);
		if (changed) this.changed(id);
	}

	attribute(id: number, name: string) {
		const node = this.node(id);
		if (
			name === "disabled" &&
			(node.tagName === "option" || node.tagName === "optgroup")
		)
			for (const option of this.walk(id)) {
				const owner = this.owners.get(option.id);
				if (option.tagName === "option" && owner !== undefined)
					this.updateEligibility(option, owner);
			}
		if (node.tagName === "option" && name === "selected" && !this.dirty.has(id))
			this.setOption(id, Object.hasOwn(node.attributes, "selected"), false);
		else if (
			node.tagName === "select" &&
			(name === "multiple" || name === "size")
		)
			this.reset(id);
	}

	moved(root: number) {
		const entries = [...this.walk(root)];
		const internal = new Set(
			entries
				.filter((node) => node.tagName === "select")
				.map((node) => node.id),
		);
		const affected = new Set<number>();
		const preferred = new Map<number, number>();
		for (const option of entries) {
			if (option.tagName !== "option") continue;
			const previous = this.owners.get(option.id);
			if (previous !== undefined) {
				this.selected.get(previous)?.delete(option.id);
				this.eligible.get(previous)?.delete(option.id);
				if (!internal.has(previous)) affected.add(previous);
			}
			this.owners.delete(option.id);
			const owner = nearestSelect(option.parent, this.node);
			if (owner === undefined) continue;
			this.owners.set(option.id, owner);
			this.updateEligibility(option, owner);
			const selected = this.selected.get(owner) ?? new Set<number>();
			if (option.control.selected) {
				selected.add(option.id);
				preferred.set(owner, option.id);
			}
			this.selected.set(owner, selected);
			if (!internal.has(owner)) affected.add(owner);
		}
		for (const owner of affected) this.reset(owner, preferred.get(owner));
	}

	close() {
		this.dirty.clear();
		this.owners.clear();
		this.selected.clear();
		this.eligible.clear();
	}

	private reset(id: number, preferred?: number) {
		const select = this.node(id);
		if (Object.hasOwn(select.attributes, "multiple")) return;
		const selected = this.selected.get(id) ?? new Set<number>();
		if (selected.size > 1) {
			const winner =
				preferred !== undefined && selected.has(preferred)
					? preferred
					: [...this.options(id)]
							.filter((option) => selected.has(option.id))
							.at(-1)?.id;
			for (const option of [...selected])
				if (option !== winner) this.setOption(option, false, false, false);
		} else if (
			!selected.size &&
			this.eligible.get(id)?.size &&
			!(Number.parseInt(select.attributes.size ?? "", 10) > 1)
		) {
			for (const option of this.options(id)) {
				if (this.eligible.get(id)?.has(option.id)) {
					this.setOption(option.id, true, false, false);
					break;
				}
			}
		}
	}

	private updateEligibility(option: SelectionNode, owner: number) {
		let disabled = Object.hasOwn(option.attributes, "disabled");
		let parent = option.parent === null ? undefined : this.node(option.parent);
		while (parent && parent.id !== owner) {
			if (
				parent.tagName === "optgroup" &&
				Object.hasOwn(parent.attributes, "disabled")
			)
				disabled = true;
			parent = parent.parent === null ? undefined : this.node(parent.parent);
		}
		const entries = this.eligible.get(owner) ?? new Set<number>();
		if (disabled) entries.delete(option.id);
		else entries.add(option.id);
		this.eligible.set(owner, entries);
	}

	private *options(id: number) {
		for (const node of this.walk(id))
			if (node.tagName === "option" && this.owners.get(node.id) === id)
				yield node;
	}

	private *walk(id: number): Generator<SelectionNode> {
		const pending = [id];
		while (pending.length) {
			const target = pending.pop();
			if (target === undefined) break;
			const node = this.node(target);
			yield node;
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push(node.children[index]);
		}
	}
}
