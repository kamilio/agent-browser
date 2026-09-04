import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { documentStyles } from "./styles.js";

export interface ElementOffsets {
	readonly offsetParent: number | null;
	readonly offsetTop: number;
	readonly offsetLeft: number;
}

export const elementOffsetLimits = Object.freeze({
	maxElements: 50_000,
	maxWork: 2_000_000,
});
export const elementOffsetCapabilities = Object.freeze({
	partial: true,
	properties: ["offsetParent", "offsetTop", "offsetLeft"],
	profile: "static-and-relative-first-box-padding-edge",
	positionedContainingBlocks: "relative",
	transforms: false,
	zoom: false,
	boxlessOffsetParents: false,
	...elementOffsetLimits,
});
const empty: ElementOffsets = Object.freeze({
	offsetParent: null,
	offsetTop: 0,
	offsetLeft: 0,
});

export class DocumentElementOffsets {
	private readonly limits: Readonly<{ maxElements: number; maxWork: number }>;
	private readonly cache = new Map<number, ElementOffsets>();
	private readonly unregisterClose: () => unknown;
	private revision = -1;
	private work = 0;
	private measurements = 0;
	private closed = false;
	constructor(
		private readonly tree: DocumentTree,
		limits: Partial<{ maxElements: number; maxWork: number }> = {},
	) {
		if (!limits || typeof limits !== "object" || Array.isArray(limits))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid element offset limits",
			);
		for (const [name, value] of Object.entries(limits))
			if (
				!Object.hasOwn(elementOffsetLimits, name) ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > elementOffsetLimits[name as keyof typeof elementOffsetLimits]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid element offset limit",
				);
		this.limits = Object.freeze({ ...elementOffsetLimits, ...limits });
		tree.get(tree.root);
		this.unregisterClose = tree.onClose(() => this.close());
	}
	get(id: number): ElementOffsets {
		if (this.closed)
			throw new AgentBrowserError("closed", "Element offsets are closed");
		const node = this.tree.get(id);
		if (node.kind !== "element")
			throw new TypeError("Element offsets require an element");
		if (this.revision !== this.tree.revision) {
			this.cache.clear();
			this.work = 0;
			this.revision = this.tree.revision;
		}
		const cached = this.cache.get(id);
		if (cached) return cached;
		if (this.cache.size >= this.limits.maxElements)
			throw new AgentBrowserError(
				"resource-limit",
				"Element offset cache limit exceeded",
			);
		this.charge();
		const geometry = documentGeometry(this.tree);
		const first = geometry.getDocumentRects(id)[0];
		let result = empty;
		if (first && node.tagName !== "body") {
			const styles = documentStyles(this.tree);
			const staticPosition = styles.flow(id).position === "static";
			let offsetParent: number | null = null;
			let ancestor = node.parent;
			while (ancestor !== null && ancestor !== this.tree.root) {
				this.charge();
				const parent = this.tree.get(ancestor);
				if (
					parent.kind === "element" &&
					(parent.tagName === "body" ||
						(staticPosition &&
							["table", "td", "th"].includes(parent.tagName)) ||
						styles.flow(ancestor).position === "relative")
				) {
					offsetParent = ancestor;
					break;
				}
				ancestor = parent.parent;
			}
			const parentBox =
				offsetParent === null
					? undefined
					: geometry.getDocumentRects(offsetParent)[0];
			if (offsetParent !== null && !parentBox)
				throw new AgentBrowserError(
					"unsupported",
					"Offsets relative to a boxless offset parent are not implemented",
				);
			result = Object.freeze({
				offsetParent,
				offsetTop:
					Math.round(
						first.y -
							(parentBox?.y ?? 0) -
							(offsetParent === null
								? 0
								: (geometry.getUsedStyle(offsetParent)?.["border-top-width"] ??
									0)),
					) || 0,
				offsetLeft:
					Math.round(
						first.x -
							(parentBox?.x ?? 0) -
							(offsetParent === null
								? 0
								: (geometry.getUsedStyle(offsetParent)?.["border-left-width"] ??
									0)),
					) || 0,
			});
		}
		this.cache.set(id, result);
		this.measurements++;
		return result;
	}
	metrics() {
		return Object.freeze({
			revision: this.revision,
			retained: this.cache.size,
			work: this.work,
			measurements: this.measurements,
			closed: this.closed,
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.cache.clear();
		this.unregisterClose();
	}
	private charge() {
		if (++this.work > this.limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Element offset work limit exceeded",
			);
	}
}

const owners = new WeakMap<DocumentTree, DocumentElementOffsets>();
export function documentElementOffsets(
	tree: DocumentTree,
): DocumentElementOffsets {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentElementOffsets(tree);
		owners.set(tree, owner);
	}
	return owner;
}
