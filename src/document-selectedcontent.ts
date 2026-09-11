import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { nearestSelect } from "./select-option-owner.js";

export class DocumentSelectedContent {
	private count = 0;
	private readonly disabled = new Set<number>();
	private readonly updating = new Set<number>();
	private readonly pending = new Set<number>();

	constructor(
		private readonly tree: DocumentTree,
		private readonly node: (id: number) => Readonly<DocumentNode>,
	) {}

	created(tag: string) {
		if (tag === "selectedcontent") this.count++;
	}

	connected(root: number) {
		if (!this.count || !this.tree.isConnected(root)) return;
		const contents = [...this.walk(root)].filter((node) =>
			isHtmlElement(node, "selectedcontent"),
		);
		for (const content of contents) {
			if (!this.tree.isConnected(content.id)) continue;
			this.disabled.delete(content.id);
			let select: number | undefined;
			for (const ancestor of this.ancestors(content.parent)) {
				if (ancestor.tagName === "select" && select === undefined) {
					select = ancestor.id;
					continue;
				}
				if (
					["select", "option", "selectedcontent"].includes(ancestor.tagName)
				) {
					this.disabled.add(content.id);
					break;
				}
			}
			if (
				this.disabled.has(content.id) ||
				select === undefined ||
				Object.hasOwn(this.node(select).attributes, "multiple")
			)
				continue;
			this.update(select);
			let first = true;
			for (const descendant of [...this.walk(select)]) {
				if (!isHtmlElement(descendant, "selectedcontent")) continue;
				if (first) first = false;
				else this.tree.replaceChildren(descendant.id);
			}
		}
	}

	removed(root: number, oldParent: number) {
		if (!this.count) return;
		for (const content of [...this.walk(root)]) {
			if (
				!isHtmlElement(content, "selectedcontent") ||
				this.disabled.has(content.id)
			)
				continue;
			if (
				[...this.ancestors(content.parent)].some(
					(node) => node.tagName === "select",
				)
			)
				continue;
			for (const ancestor of this.ancestors(oldParent)) {
				if (ancestor.tagName !== "select") continue;
				this.update(ancestor.id);
				break;
			}
		}
	}

	optionClosed(id: number) {
		if (!this.count) return;
		const option = this.node(id);
		if (!isHtmlElement(option, "option") || !option.control.selected) return;
		const select = nearestSelect(option.parent, this.node);
		if (select !== undefined) this.update(select);
	}

	update(select: number) {
		if (!this.count) return;
		const node = this.node(select);
		if (
			!isHtmlElement(node, "select") ||
			Object.hasOwn(node.attributes, "multiple")
		)
			return;
		if (this.updating.has(select)) {
			this.pending.add(select);
			return;
		}
		this.updating.add(select);
		try {
			let turns = 0;
			do {
				if (++turns > Math.min(1024, this.tree.limits.maxNodes))
					throw new AgentBrowserError(
						"resource-limit",
						"Selectedcontent update limit exceeded",
					);
				this.pending.delete(select);
				if (Object.hasOwn(this.node(select).attributes, "multiple")) return;
				let content: Readonly<DocumentNode> | undefined;
				for (const node of this.walk(select))
					if (isHtmlElement(node, "selectedcontent")) {
						content = node;
						break;
					}
				if (!content || this.disabled.has(content.id)) return;
				let option: Readonly<DocumentNode> | undefined;
				for (const node of this.walk(select))
					if (
						isHtmlElement(node, "option") &&
						node.control.selected &&
						nearestSelect(node.parent, this.node) === select
					) {
						option = node;
						break;
					}
				if (!option) this.tree.replaceChildren(content.id);
				else {
					const children = [...option.children];
					const fragment = this.tree.createFragment();
					for (const child of children)
						this.tree.append(fragment, this.tree.clone(child, true));
					this.tree.replaceChildren(content.id, fragment);
				}
			} while (this.pending.has(select));
		} finally {
			this.updating.delete(select);
			this.pending.delete(select);
		}
	}

	close() {
		this.count = 0;
		this.disabled.clear();
		this.updating.clear();
		this.pending.clear();
	}

	private *ancestors(parent: number | null): Generator<Readonly<DocumentNode>> {
		let current = parent;
		while (current !== null) {
			const node = this.node(current);
			if (isHtmlElement(node)) yield node;
			current = node.parent;
		}
	}

	private *walk(root: number): Generator<Readonly<DocumentNode>> {
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
