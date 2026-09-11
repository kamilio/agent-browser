import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

export class DocumentDetailsGroups {
	private readonly names = new Map<number, string>();
	private readonly members = new Map<string, Set<number>>();

	constructor(private readonly node: (id: number) => Readonly<DocumentNode>) {}

	sync(id: number) {
		const node = this.node(id);
		if (!isHtmlElement(node, "details")) return;
		const name = Object.hasOwn(node.attributes, "open")
			? node.attributes.name || undefined
			: undefined;
		const previous = this.names.get(id);
		if (previous === name) return;
		if (previous !== undefined) {
			const group = this.members.get(previous);
			group?.delete(id);
			if (!group?.size) this.members.delete(previous);
			this.names.delete(id);
		}
		if (name !== undefined) {
			let group = this.members.get(name);
			if (!group) {
				group = new Set();
				this.members.set(name, group);
			}
			group.add(id);
			this.names.set(id, name);
		}
	}

	attributeClosure(id: number, key: string, value: string): number | undefined {
		const node = this.node(id);
		if (!isHtmlElement(node, "details")) return;
		const open = Object.hasOwn(node.attributes, "open");
		const opening = key === "open" && !open;
		if (!opening && !(key === "name" && open)) return;
		const name = key === "name" ? value : node.attributes.name;
		if (!name) return;
		const root = this.root(id);
		for (const other of this.members.get(name) ?? [])
			if (other !== id && this.root(other) === root)
				return opening ? other : id;
	}

	insertionClosures(
		parent: number,
		roots: readonly number[],
		removed: readonly number[] = [],
	): number[] {
		if (!this.names.size || !roots.length) return [];
		const affected: number[] = [];
		const pending = [...roots].reverse();
		while (pending.length) {
			const id = pending.pop();
			if (id === undefined) break;
			if (this.names.has(id)) affected.push(id);
			const node = this.node(id);
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push(node.children[index]);
		}
		const moving = new Set(affected);
		const remaining = new Set(affected);
		const excluded = new Set(removed);
		const destination = this.root(parent);
		const closed: number[] = [];
		for (const id of affected) {
			const name = this.names.get(id);
			if (name === undefined) continue;
			for (const other of this.members.get(name) ?? []) {
				if (other === id) continue;
				if (
					remaining.has(other) ||
					(!moving.has(other) &&
						!this.within(other, excluded) &&
						this.root(other) === destination)
				) {
					closed.push(id);
					remaining.delete(id);
					break;
				}
			}
		}
		return closed;
	}

	close() {
		this.names.clear();
		this.members.clear();
	}

	private root(id: number) {
		let node = this.node(id);
		while (node.parent !== null) node = this.node(node.parent);
		return node.id;
	}

	private within(id: number, roots: ReadonlySet<number>) {
		let current: number | null = id;
		while (current !== null) {
			if (roots.has(current)) return true;
			current = this.node(current).parent;
		}
		return false;
	}
}
