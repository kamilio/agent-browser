import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { documentStyles } from "./styles.js";

export const elementSizeProperties = Object.freeze([
	"clientWidth",
	"clientHeight",
	"clientTop",
	"clientLeft",
	"offsetWidth",
	"offsetHeight",
] as const);
export type ElementSizes = Readonly<
	Record<(typeof elementSizeProperties)[number], number>
>;
export const elementSizeLimits = Object.freeze({
	maxElements: 50_000,
	maxWork: 2_000_000,
});
const empty: ElementSizes = Object.freeze({
	clientWidth: 0,
	clientHeight: 0,
	clientTop: 0,
	clientLeft: 0,
	offsetWidth: 0,
	offsetHeight: 0,
});

export class DocumentElementSizes {
	private readonly limits: Readonly<{ maxElements: number; maxWork: number }>;
	private readonly cache = new Map<number, ElementSizes>();
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
				"Invalid element size limits",
			);
		for (const [name, value] of Object.entries(limits))
			if (
				!Object.hasOwn(elementSizeLimits, name) ||
				!Number.isInteger(value) ||
				value < 1 ||
				value > elementSizeLimits[name as keyof typeof elementSizeLimits]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid element size limit",
				);
		this.limits = Object.freeze({ ...elementSizeLimits, ...limits });
		tree.get(tree.root);
		this.unregisterClose = tree.onClose(() => this.close());
	}

	get(id: number): ElementSizes {
		if (this.closed)
			throw new AgentBrowserError("closed", "Element sizes are closed");
		const node = this.tree.get(id);
		if (node.kind !== "element")
			throw new TypeError("Element sizes require an element");
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
				"Element size cache limit exceeded",
			);
		this.charge();
		const geometry = documentGeometry(this.tree);
		const rects = geometry.getClientRects(id);
		let result = empty;
		if (rects.length) {
			let left = Number.POSITIVE_INFINITY;
			let top = Number.POSITIVE_INFINITY;
			let right = Number.NEGATIVE_INFINITY;
			let bottom = Number.NEGATIVE_INFINITY;
			for (const rect of rects) {
				this.charge();
				left = Math.min(left, rect.left);
				top = Math.min(top, rect.top);
				right = Math.max(right, rect.right);
				bottom = Math.max(bottom, rect.bottom);
			}
			let clientWidth = 0;
			let clientHeight = 0;
			const used = geometry.getUsedStyle(id);
			if (used?.width !== undefined && used.height !== undefined) {
				const styles = documentStyles(this.tree);
				if (node.parent === this.tree.root) {
					clientWidth = styles.viewport.width;
					clientHeight = styles.viewport.height;
				} else {
					const borderBox = styles.box(id)["box-sizing"] === "border-box";
					clientWidth =
						used.width +
						(borderBox
							? 0
							: (used["padding-left"] ?? 0) + (used["padding-right"] ?? 0));
					clientHeight =
						used.height +
						(borderBox
							? 0
							: (used["padding-top"] ?? 0) + (used["padding-bottom"] ?? 0));
				}
			}
			result = Object.freeze({
				clientWidth: Math.round(clientWidth),
				clientHeight: Math.round(clientHeight),
				clientTop: 0,
				clientLeft: 0,
				offsetWidth: Math.round(right - left),
				offsetHeight: Math.round(bottom - top),
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
				"Element size work limit exceeded",
			);
	}
}

const owners = new WeakMap<DocumentTree, DocumentElementSizes>();
export function documentElementSizes(tree: DocumentTree): DocumentElementSizes {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentElementSizes(tree);
		owners.set(tree, owner);
	}
	return owner;
}
