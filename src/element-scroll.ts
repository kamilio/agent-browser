import { type DocumentBox, layoutDocument } from "./document-layout.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";
import { documentStyles } from "./styles.js";

export interface ElementScrollLimits {
	maxWork: number;
	maxQueries: number;
	maxElements: number;
}
export const elementScrollLimits: Readonly<ElementScrollLimits> = Object.freeze(
	{ maxWork: 2_000_000, maxQueries: 16_384, maxElements: 50_000 },
);
export const elementScrollCapabilities = Object.freeze({
	partial: true,
	profile: "normal-flow-ltr-visible-overflow",
	positions: "zero-for-nonscrolling-elements",
	setters: "no-op-for-nonscrolling-elements",
	inlineMetrics: "zero-for-nonreplaced-inline",
	replacedImages: true,
	controlMetrics: false,
	nestedScrolling: false,
	...elementScrollLimits,
});
export interface ElementScrollMetrics {
	readonly scrollTop: number;
	readonly scrollLeft: number;
	readonly scrollWidth: number;
	readonly scrollHeight: number;
}
interface Extent {
	right: number;
	bottom: number;
}
const empty: ElementScrollMetrics = Object.freeze({
	scrollTop: 0,
	scrollLeft: 0,
	scrollWidth: 0,
	scrollHeight: 0,
});

export class DocumentElementScroll {
	private readonly limits: typeof elementScrollLimits;
	private values = new Map<string, ElementScrollMetrics>();
	private controls = new Set<string>();
	private revision = -1;
	private work = 0;
	private queries = 0;
	private builds = 0;
	private closed = false;
	private readonly unregisterClose: () => unknown;
	constructor(
		private readonly tree: DocumentTree,
		limits: Partial<typeof elementScrollLimits> = {},
	) {
		if (!limits || typeof limits !== "object" || Array.isArray(limits))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid element scroll limits",
			);
		for (const [name, value] of Object.entries(limits))
			if (
				!Object.hasOwn(elementScrollLimits, name) ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > elementScrollLimits[name as keyof typeof elementScrollLimits]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid element scroll limits",
				);
		this.limits = Object.freeze({ ...elementScrollLimits, ...limits });
		tree.get(tree.root);
		this.unregisterClose = tree.onClose(() => this.close());
	}
	get(id: number): ElementScrollMetrics {
		if (this.closed)
			throw new AgentBrowserError(
				"closed",
				"Element scroll metrics are closed",
			);
		if (++this.queries > this.limits.maxQueries)
			throw new AgentBrowserError(
				"resource-limit",
				"Element scroll query limit exceeded",
			);
		if (this.tree.get(id).kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Scroll metrics require an element",
			);
		if (!this.tree.isConnected(id)) return empty;
		if (
			id ===
			this.tree
				.get(this.tree.root)
				.children.find((child) => this.tree.get(child).kind === "element")
		) {
			const owner = documentScroll(this.tree);
			const position = owner.get();
			const bounds = owner.bounds();
			const viewport = documentStyles(this.tree).viewport;
			return Object.freeze({
				scrollTop: position.y,
				scrollLeft: position.x,
				scrollWidth: Math.round(viewport.width + bounds.x),
				scrollHeight: Math.round(viewport.height + bounds.y),
			});
		}
		if (this.revision !== this.tree.revision) this.build();
		const ref = this.tree.reference(id);
		if (this.controls.has(ref))
			throw new AgentBrowserError(
				"unsupported",
				"Control scroll metrics are not implemented",
			);
		return this.values.get(ref) ?? empty;
	}
	metrics() {
		return Object.freeze({
			revision: this.revision,
			work: this.work,
			queries: this.queries,
			builds: this.builds,
			elements: this.values.size,
			closed: this.closed,
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.values.clear();
		this.controls.clear();
		this.unregisterClose();
	}
	private charge() {
		if (++this.work > this.limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Element scroll extent work limit exceeded",
			);
	}
	private build() {
		this.values.clear();
		this.controls.clear();
		this.revision = -1;
		this.work = 0;
		const layout = layoutDocument(this.tree);
		const formatting = layout.text.horizontal.formatting;
		if (formatting.nodes.length > this.limits.maxElements)
			throw new AgentBrowserError(
				"resource-limit",
				"Element scroll extent element limit exceeded",
			);
		const boxes = new Map<number, Readonly<DocumentBox>>();
		for (const box of layout.boxes) {
			this.charge();
			boxes.set(box.id, box);
		}
		const contents = new Map<number, Extent>();
		const own = new Map<number, Extent>();
		const add = (
			map: Map<number, Extent>,
			id: number,
			right: number,
			bottom: number,
		) => {
			this.charge();
			layoutNumber(right, true);
			layoutNumber(bottom, true);
			const previous = map.get(id);
			map.set(id, {
				right: Math.max(previous?.right ?? Number.NEGATIVE_INFINITY, right),
				bottom: Math.max(previous?.bottom ?? Number.NEGATIVE_INFINITY, bottom),
			});
		};
		for (const box of layout.boxes)
			add(
				own,
				box.id,
				box.borderX + box.borderBoxWidth,
				box.borderY + box.borderBoxHeight,
			);
		for (const context of layout.contexts) {
			const box = boxes.get(context.id);
			for (const line of context.lines)
				add(
					contents,
					context.id,
					context.contentX + line.width + (box?.paddingRight ?? 0),
					line.top + line.height + (box?.paddingBottom ?? 0),
				);
			for (const fragment of context.fragments)
				add(
					own,
					fragment.formattingId,
					fragment.x + fragment.width + Math.max(0, fragment.marginRight ?? 0),
					fragment.y +
						fragment.height +
						Math.max(0, fragment.marginBottom ?? 0),
				);
			for (const glyph of context.glyphs)
				add(
					own,
					glyph.formattingId,
					glyph.x + glyph.advance,
					glyph.y + glyph.fontSize,
				);
		}
		const values = new Map<string, ElementScrollMetrics>();
		const controls = new Set<string>();
		const stack: { id: number; visited: boolean }[] = [
			{ id: formatting.root, visited: false },
		];
		while (stack.length) {
			this.charge();
			const entry = stack.pop();
			if (!entry) break;
			const node = formatting.nodes[entry.id];
			if (!entry.visited) {
				stack.push({ id: entry.id, visited: true });
				for (const child of node.children) {
					this.charge();
					stack.push({ id: child, visited: false });
				}
				continue;
			}
			const box = boxes.get(node.id);
			for (let index = 0; index < node.children.length; index++) {
				this.charge();
				const child = node.children[index];
				const childBox = boxes.get(child);
				const extent = own.get(child);
				if (extent) add(contents, node.id, extent.right, extent.bottom);
				if (box && childBox) {
					let bottom = childBox.borderY + childBox.borderBoxHeight;
					if (
						!box.marginCollapse.withLastChild ||
						index !== node.children.length - 1
					) {
						const next = boxes.get(node.children[index + 1]);
						const marginEdge =
							bottom + Math.max(0, childBox.marginCollapse.bottom.value);
						bottom = next
							? Math.max(bottom, Math.min(marginEdge, next.borderY))
							: marginEdge;
					}
					add(
						contents,
						node.id,
						childBox.borderX +
							childBox.borderBoxWidth +
							Math.max(0, childBox.marginRight) +
							box.paddingRight,
						bottom + box.paddingBottom,
					);
				}
			}
			if (node.control && node.ref) controls.add(node.ref);
			if (box) {
				const extent = contents.get(node.id);
				const left = box.borderX + box.borderLeft;
				const top = box.borderY + box.borderTop;
				const right = Math.max(
					box.borderX + box.borderBoxWidth - box.borderRight,
					extent?.right ?? left,
				);
				const bottom = Math.max(
					box.borderY + box.borderBoxHeight - box.borderBottom,
					extent?.bottom ?? top,
				);
				if (node.ref && !node.control)
					values.set(
						node.ref,
						Object.freeze({
							scrollTop: 0,
							scrollLeft: 0,
							scrollWidth: Math.round(layoutNumber(right - left)),
							scrollHeight: Math.round(layoutNumber(bottom - top)),
						}),
					);
				add(own, node.id, right, bottom);
			} else {
				const extent = contents.get(node.id);
				if (extent) add(own, node.id, extent.right, extent.bottom);
			}
		}
		for (const image of layout.text.horizontal.images) {
			this.charge();
			const node = formatting.nodes[image.id];
			if (node.control) continue;
			values.set(
				image.ref,
				Object.freeze({
					scrollTop: 0,
					scrollLeft: 0,
					scrollWidth: Math.round(
						image.contentWidth + image.paddingLeft + image.paddingRight,
					),
					scrollHeight: Math.round(
						image.contentHeight + image.paddingTop + image.paddingBottom,
					),
				}),
			);
		}
		this.values = values;
		this.controls = controls;
		this.revision = this.tree.revision;
		this.builds++;
	}
}

const owners = new WeakMap<DocumentTree, DocumentElementScroll>();
export function documentElementScroll(
	tree: DocumentTree,
): DocumentElementScroll {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentElementScroll(tree);
		owners.set(tree, owner);
	}
	return owner;
}
