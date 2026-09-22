import type { DocumentMutation, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";
import type { ScriptNodePublications } from "./script-node-publications.js";

export const nodeIteratorLimits = Object.freeze({
	maxCreated: 256,
	maxWork: 100000,
	maxCachedParents: 256,
	maxCachedChildren: 65536,
});
interface Cursor {
	root: number;
	reference: number;
	before: boolean;
	mask: number;
	active: boolean;
}
interface Neighbors {
	children: readonly number[];
	indices: Map<number, number>;
}
const brands = new WeakMap<
	object,
	{ owner: object; assertActive: () => void }
>();
export function scriptNodeIteratorHasInstance(
	value: unknown,
	owner: object,
): boolean {
	const brand =
		value !== null && typeof value === "object" ? brands.get(value) : undefined;
	if (!brand || brand.owner !== owner) return false;
	brand.assertActive();
	return true;
}
class Work {
	private used = 0;
	visit(count = 1) {
		this.used += count;
		if (this.used > nodeIteratorLimits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"NodeIterator work limit exceeded",
			);
	}
}
export class ScriptNodeIterators {
	private readonly cursors = new Set<Cursor>();
	private readonly parents = new Map<number, Neighbors>();
	private cachedChildren = 0;
	private created = 0;
	private closed = false;
	private failed = false;
	private readonly unregisterMutation: () => void;
	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		private readonly publications: ScriptNodePublications,
		private readonly node: (id: number) => object,
	) {
		this.unregisterMutation = tree.onMutation((record) => {
			try {
				this.removed(record);
			} catch {
				this.failed = true;
				this.clearCache();
			}
		});
	}
	create(
		root: number,
		whatToShow: unknown = 0xffffffff,
		filter: unknown = null,
	): object {
		this.ensureOpen();
		this.tree.get(root);
		if (filter !== null && filter !== undefined)
			throw new AgentBrowserError(
				"unsupported",
				"NodeIterator callback filters are unsupported",
			);
		if (typeof whatToShow === "bigint" || typeof whatToShow === "symbol")
			throw new TypeError("Invalid NodeIterator whatToShow");
		if (
			whatToShow !== null &&
			(typeof whatToShow === "object" || typeof whatToShow === "function")
		)
			throw new AgentBrowserError(
				"unsupported",
				"NodeIterator mask object conversion is unsupported",
			);
		const mask = +(whatToShow as number) >>> 0;
		if (this.created >= nodeIteratorLimits.maxCreated)
			throw new AgentBrowserError(
				"resource-limit",
				"NodeIterator creation limit exceeded",
			);
		const id = this.created++;
		const cursor: Cursor = {
			root,
			reference: root,
			before: true,
			mask,
			active: false,
		};
		this.cursors.add(cursor);
		try {
			return this.publications.publish(
				"node-iterator",
				id,
				{
					properties: {
						root: { get: () => this.node(root) },
						whatToShow: { get: () => mask },
						filter: { get: () => null },
						referenceNode: { get: () => this.node(cursor.reference) },
						pointerBeforeReferenceNode: { get: () => cursor.before },
					},
					methods: {
						nextNode: () => this.traverse(cursor, true),
						previousNode: () => this.traverse(cursor, false),
						detach: () => this.ensureOpen(),
					},
				},
				(capability) => {
					this.ensureOpen();
					brands.set(capability, {
						owner: this.factory,
						assertActive: () => this.ensureOpen(),
					});
				},
			);
		} catch (error) {
			this.cursors.delete(cursor);
			throw error;
		}
	}
	metrics() {
		return {
			created: this.created,
			cursors: this.cursors.size,
			cachedParents: this.parents.size,
			cachedChildren: this.cachedChildren,
			closed: this.closed,
			failed: this.failed,
		};
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterMutation();
		this.cursors.clear();
		this.clearCache();
	}
	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "NodeIterators are closed");
		if (this.failed)
			throw new AgentBrowserError(
				"resource-limit",
				"NodeIterator mutation work limit exceeded",
			);
		this.tree.get(this.tree.root);
	}
	private traverse(cursor: Cursor, forward: boolean): object | null {
		this.ensureOpen();
		if (cursor.active)
			throw new DOMException(
				"NodeIterator traversal is already active",
				"InvalidStateError",
			);
		cursor.active = true;
		try {
			const work = new Work();
			let current: number | null = cursor.reference;
			let before = cursor.before;
			while (current !== null) {
				work.visit();
				if (forward) {
					if (!before) current = this.following(current, cursor.root, work);
					before = false;
				} else {
					if (before) current = this.preceding(current, cursor.root, work);
					before = true;
				}
				if (current === null) return null;
				const kind = this.tree.get(current).kind;
				const bit = {
					element: 1,
					text: 4,
					comment: 128,
					document: 256,
					doctype: 512,
					fragment: 1024,
				}[kind];
				if (!(cursor.mask & bit)) continue;
				cursor.reference = current;
				cursor.before = before;
				return this.node(current);
			}
			return null;
		} finally {
			cursor.active = false;
		}
	}
	private following(id: number, root: number, work: Work): number | null {
		work.visit();
		const first = this.tree.get(id).children[0];
		return first === undefined ? this.afterSubtree(id, root, work) : first;
	}
	private afterSubtree(id: number, root: number, work: Work): number | null {
		let current = id;
		while (current !== root) {
			work.visit();
			const parent = this.tree.get(current).parent;
			if (parent === null) return null;
			const next = this.sibling(current, 1, work);
			if (next !== undefined) return next;
			current = parent;
		}
		return null;
	}
	private preceding(id: number, root: number, work: Work): number | null {
		if (id === root) return null;
		const previous = this.sibling(id, -1, work);
		if (previous !== undefined) return this.lastDescendant(previous, work);
		work.visit();
		return this.tree.get(id).parent;
	}
	private lastDescendant(id: number, work: Work): number {
		let current = id;
		while (true) {
			work.visit();
			const last = this.tree.get(current).children.at(-1);
			if (last === undefined) return current;
			current = last;
		}
	}
	private sibling(
		id: number,
		direction: number,
		work: Work,
	): number | undefined {
		work.visit();
		const parent = this.tree.get(id).parent;
		if (parent === null) return undefined;
		const children = this.tree.get(parent).children;
		let state = this.parents.get(parent);
		if (state?.children !== children) {
			if (state) {
				this.parents.delete(parent);
				this.cachedChildren -= state.children.length;
			}
			work.visit(children.length);
			state = {
				children,
				indices: new Map(children.map((child, index) => [child, index])),
			};
			if (children.length <= nodeIteratorLimits.maxCachedChildren) {
				while (
					this.parents.size >= nodeIteratorLimits.maxCachedParents ||
					this.cachedChildren + children.length >
						nodeIteratorLimits.maxCachedChildren
				) {
					const oldest = this.parents.keys().next().value;
					if (oldest === undefined) break;
					this.cachedChildren -= this.parents.get(oldest)?.children.length ?? 0;
					this.parents.delete(oldest);
				}
				this.parents.set(parent, state);
				this.cachedChildren += children.length;
			}
		}
		const index = state.indices.get(id);
		return index === undefined ? undefined : children[index + direction];
	}
	private contains(root: number, id: number, work: Work): boolean {
		let current: number | null = id;
		while (current !== null) {
			work.visit();
			if (current === root) return true;
			current = this.tree.get(current).parent;
		}
		return false;
	}
	private removed(record: DocumentMutation) {
		if (
			record.type !== "childList" ||
			!record.removedNodes.length ||
			!this.cursors.size
		)
			return;
		const work = new Work();
		work.visit(record.removedNodes.length);
		const removed = new Set(record.removedNodes);
		for (const cursor of this.cursors) {
			if (!this.contains(cursor.root, record.target, work)) continue;
			let current: number | null = cursor.reference;
			let affected = false;
			while (current !== null && current !== cursor.root) {
				work.visit();
				if (removed.has(current)) {
					affected = true;
					break;
				}
				current = this.tree.get(current).parent;
			}
			if (!affected) continue;
			if (cursor.before) {
				let next = record.nextSibling;
				if (next === null || !this.contains(cursor.root, next, work))
					next = this.afterSubtree(record.target, cursor.root, work);
				if (next !== null) {
					cursor.reference = next;
					continue;
				}
				cursor.before = false;
			}
			const previous = record.previousSibling;
			cursor.reference =
				previous !== null && this.contains(cursor.root, previous, work)
					? this.lastDescendant(previous, work)
					: record.target;
		}
	}
	private clearCache() {
		this.parents.clear();
		this.cachedChildren = 0;
	}
}
