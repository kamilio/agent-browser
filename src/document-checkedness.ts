import type { ControlState, DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

interface CheckedNode extends Omit<DocumentNode, "control"> {
	control: ControlState;
}

function radio(node: CheckedNode) {
	return (
		isHtmlElement(node, "input") &&
		node.attributes.type?.replace(/[A-Z]/g, (letter) =>
			letter.toLowerCase(),
		) === "radio"
	);
}

export class DocumentCheckedness {
	private readonly dirty = new Set<number>();
	private readonly members = new Map<number, string>();
	private readonly selected = new Map<string, number>();
	private readonly references = new Map<number, string>();
	private readonly formReferences = new Map<string, Set<number>>();
	private readonly formLookups = new Map<string, number | null>();
	private readonly radios = new Set<number>();

	constructor(
		private readonly node: (id: number) => CheckedNode,
		private readonly changed: (id: number) => void,
		private readonly parserOwner: (id: number) => number | undefined = () =>
			undefined,
	) {}

	initialize(id: number, source?: { state: DocumentCheckedness; id: number }) {
		if (!isHtmlElement(this.node(id), "input")) return;
		if (source?.state.dirty.has(source.id)) this.dirty.add(id);
		this.track(id);
		if (radio(this.node(id))) this.regroup([id]);
	}

	set(id: number, checked: boolean, dirty = true) {
		if (!isHtmlElement(this.node(id), "input"))
			throw new AgentBrowserError("invalid-input", "Expected an input");
		if (dirty) this.dirty.add(id);
		this.write(id, checked);
		if (checked) this.select(id);
	}

	clear(id: number) {
		if (!isHtmlElement(this.node(id), "input"))
			throw new AgentBrowserError("invalid-input", "Expected an input");
		const wasDirty = this.dirty.delete(id);
		this.set(id, Object.hasOwn(this.node(id).attributes, "checked"), false);
		if (wasDirty) this.changed(id);
	}

	attribute(id: number, name: string, previous: string | undefined) {
		const node = this.node(id);
		if (isHtmlElement(node, "input") && name === "checked") {
			const present = Object.hasOwn(node.attributes, "checked");
			if (!this.dirty.has(id) && present !== (previous !== undefined))
				this.set(id, present, false);
		} else if (
			isHtmlElement(node, "input") &&
			["type", "name", "form"].includes(name)
		) {
			this.track(id);
			this.regroup([id]);
		} else if (name === "id") {
			const affected = new Set<number>();
			for (const value of [previous, node.attributes.id])
				if (value !== undefined) {
					this.formLookups.delete(value);
					for (const target of this.formReferences.get(value) ?? [])
						affected.add(target);
				}
			this.regroup(affected);
		}
	}

	moved(root: number) {
		if (!this.radios.size) return;
		const affected = new Set<number>();
		const referenced = new Set<number>();
		for (const node of this.walk(root)) {
			if (radio(node)) affected.add(node.id);
			if (Object.hasOwn(node.attributes, "id")) {
				this.formLookups.delete(node.attributes.id);
				for (const target of this.formReferences.get(node.attributes.id) ?? [])
					referenced.add(target);
			}
		}
		for (const target of referenced) affected.add(target);
		this.regroup(affected);
	}

	close() {
		this.dirty.clear();
		this.members.clear();
		this.selected.clear();
		this.references.clear();
		this.formReferences.clear();
		this.formLookups.clear();
		this.radios.clear();
	}

	private track(id: number) {
		const node = this.node(id);
		const isRadio = radio(node);
		if (isRadio) this.radios.add(id);
		else this.radios.delete(id);
		const reference =
			isRadio && Object.hasOwn(node.attributes, "form")
				? node.attributes.form
				: undefined;
		const previous = this.references.get(id);
		if (previous === reference) return;
		if (previous !== undefined) {
			const entries = this.formReferences.get(previous);
			entries?.delete(id);
			if (!entries?.size) {
				this.formReferences.delete(previous);
				this.formLookups.delete(previous);
			}
			this.references.delete(id);
		}
		if (reference !== undefined) {
			const entries = this.formReferences.get(reference) ?? new Set<number>();
			entries.add(id);
			this.formReferences.set(reference, entries);
			this.references.set(id, reference);
		}
	}

	private regroup(ids: Iterable<number>) {
		const changes: { id: number; key: string | undefined }[] = [];
		for (const id of ids) {
			const key = this.key(id);
			if (key === this.members.get(id)) continue;
			this.leave(id);
			changes.push({ id, key });
		}
		const pending = new Map<string, Set<number>>();
		for (const { id, key } of changes) {
			if (key === undefined) continue;
			this.members.set(id, key);
			if (this.checked(id)) {
				const entries = pending.get(key) ?? new Set<number>();
				entries.add(id);
				pending.set(key, entries);
			}
		}
		for (const { id, key } of changes) {
			if (key === undefined || !this.checked(id)) continue;
			for (const peer of pending.get(key) ?? [])
				if (peer !== id) this.write(peer, false);
			pending.delete(key);
			this.select(id);
		}
	}

	private leave(id: number) {
		const key = this.members.get(id);
		if (key !== undefined && this.selected.get(key) === id)
			this.selected.delete(key);
		this.members.delete(id);
	}

	private checked(id: number) {
		const node = this.node(id);
		return node.control.checked ?? Object.hasOwn(node.attributes, "checked");
	}

	private write(id: number, checked: boolean) {
		const node = this.node(id);
		const previous = node.control.checked;
		if (
			!this.dirty.has(id) &&
			checked === Object.hasOwn(node.attributes, "checked")
		)
			Reflect.deleteProperty(node.control, "checked");
		else node.control.checked = checked;
		const key = this.members.get(id);
		if (!checked && key !== undefined && this.selected.get(key) === id)
			this.selected.delete(key);
		if (previous !== node.control.checked) this.changed(id);
	}

	private select(id: number) {
		const key = this.members.get(id);
		if (key === undefined) return;
		const previous = this.selected.get(key);
		if (previous !== undefined && previous !== id) this.write(previous, false);
		this.selected.set(key, id);
	}

	private key(id: number) {
		const node = this.node(id);
		if (!radio(node) || !node.attributes.name) return undefined;
		let root = node;
		let owner: number | null = null;
		while (root.parent !== null) {
			root = this.node(root.parent);
			if (owner === null && isHtmlElement(root, "form")) owner = root.id;
		}
		const parserOwner = this.parserOwner(id);
		if (
			parserOwner !== undefined &&
			isHtmlElement(this.node(parserOwner), "form")
		)
			owner = parserOwner;
		if (root.kind === "document" && Object.hasOwn(node.attributes, "form")) {
			if (!this.formLookups.has(node.attributes.form)) {
				const lookup = new Map<string, number>();
				for (const entry of this.walk(root.id))
					if (entry.attributes.id && !lookup.has(entry.attributes.id))
						lookup.set(entry.attributes.id, entry.id);
				for (const reference of this.formReferences.keys())
					this.formLookups.set(reference, lookup.get(reference) ?? null);
			}
			const target = this.formLookups.get(node.attributes.form);
			owner =
				target != null && isHtmlElement(this.node(target), "form")
					? target
					: null;
		}
		return JSON.stringify([root.id, owner, node.attributes.name]);
	}

	private *walk(root: number): Generator<CheckedNode> {
		const pending = [root];
		while (pending.length) {
			const id = pending.pop();
			if (id === undefined) break;
			const node = this.node(id);
			yield node;
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push(node.children[index]);
		}
	}
}
