import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface ElementTraversalLimits {
	maxCachedParents: number;
	maxCachedChildren: number;
	maxWork: number;
}

interface Neighbors {
	previous?: number;
	next?: number;
}

interface ParentState {
	first?: number;
	last?: number;
	count: number;
	neighbors: Map<number, Neighbors>;
}

export class ElementTraversal {
	readonly limits: Readonly<ElementTraversalLimits>;
	private readonly parents = new Map<number, ParentState>();
	private cachedChildren = 0;
	private revision: number;
	private builds = 0;
	private hits = 0;
	private visitedChildren = 0;
	private evictions = 0;
	private closed = false;

	constructor(
		private readonly tree: DocumentTree,
		limits: Partial<ElementTraversalLimits> = {},
	) {
		const defaults: ElementTraversalLimits = {
			maxCachedParents: 256,
			maxCachedChildren: 65_536,
			maxWork: 100_000,
		};
		this.limits = Object.freeze({ ...defaults, ...limits });
		for (const key of Object.keys(defaults) as (keyof ElementTraversalLimits)[])
			if (
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > defaults[key] * 16
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid element traversal limit",
				);
		this.revision = tree.revision;
	}

	get stats() {
		return {
			parents: this.parents.size,
			cachedChildren: this.cachedChildren,
			builds: this.builds,
			hits: this.hits,
			visitedChildren: this.visitedChildren,
			evictions: this.evictions,
		};
	}

	first(id: number): number | undefined {
		return this.parent(id).first;
	}

	last(id: number): number | undefined {
		return this.parent(id).last;
	}

	count(id: number): number {
		return this.parent(id).count;
	}

	previous(id: number): number | undefined {
		return this.sibling(id, "previous");
	}

	next(id: number): number | undefined {
		return this.sibling(id, "next");
	}

	close() {
		this.closed = true;
		this.clear();
	}

	private sibling(id: number, direction: keyof Neighbors) {
		const node = this.read(id);
		if (!["element", "text", "comment"].includes(node.kind))
			throw new AgentBrowserError(
				"invalid-input",
				"Expected an element or character data node",
			);
		return node.parent === null
			? undefined
			: this.parent(node.parent).neighbors.get(id)?.[direction];
	}

	private parent(id: number): ParentState {
		const node = this.read(id);
		if (!["document", "fragment", "element"].includes(node.kind))
			throw new AgentBrowserError("invalid-input", "Expected a parent node");
		const existing = this.parents.get(id);
		if (existing) {
			this.parents.delete(id);
			this.parents.set(id, existing);
			this.hits++;
			return existing;
		}
		const children = node.children;
		if (children.length > Math.floor(this.limits.maxWork / 2))
			throw new AgentBrowserError(
				"resource-limit",
				"Element traversal work limit exceeded",
			);
		const state: ParentState = { count: 0, neighbors: new Map() };
		for (const child of children) {
			state.neighbors.set(child, { previous: state.last });
			if (this.tree.get(child).kind !== "element") continue;
			state.first ??= child;
			state.last = child;
			state.count++;
		}
		let next: number | undefined;
		for (let index = children.length - 1; index >= 0; index--) {
			const child = children[index];
			const neighbors = state.neighbors.get(child);
			if (neighbors) neighbors.next = next;
			if (this.tree.get(child).kind === "element") next = child;
		}
		this.builds++;
		this.visitedChildren += children.length * 2;
		if (children.length > this.limits.maxCachedChildren) return state;
		while (
			this.parents.size >= this.limits.maxCachedParents ||
			this.cachedChildren + children.length > this.limits.maxCachedChildren
		) {
			const oldest = this.parents.keys().next().value;
			if (oldest === undefined) break;
			this.cachedChildren -= this.parents.get(oldest)?.neighbors.size ?? 0;
			this.parents.delete(oldest);
			this.evictions++;
		}
		this.parents.set(id, state);
		this.cachedChildren += children.length;
		return state;
	}

	private read(id: number) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Element traversal is closed");
		const node = this.tree.get(id);
		if (this.revision !== this.tree.revision) {
			this.clear();
			this.revision = this.tree.revision;
		}
		return node;
	}

	private clear() {
		this.parents.clear();
		this.cachedChildren = 0;
	}
}
