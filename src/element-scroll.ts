import {
	type DocumentBox,
	type DocumentLayout,
	layoutDocument,
} from "./document-layout.js";
import { measureLayoutOverflow } from "./layout-overflow.js";
import {
	scrollsOverflow,
	userScrollsOverflow,
	type OverflowPort,
	type OverflowStyle,
} from "./overflow-policy.js";
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
	profile: "physical-ltr-nested-overflow",
	positions: "bounded-scrollports-zero-for-nonscrolling-elements",
	setters: "scrollports-with-nonscrolling-no-op",
	inlineMetrics: "zero-for-nonreplaced-inline",
	replacedImages: true,
	controlMetrics: false,
	nestedScrolling: true,
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
export interface ElementScrollSnapshot {
	readonly ports: ReadonlyMap<number, Readonly<OverflowPort>>;
	readonly positions: ReadonlyMap<number, Readonly<{ x: number; y: number }>>;
	readonly work: number;
}
const zeroPosition = Object.freeze({ x: 0, y: 0 });
const viewportDefault: Readonly<OverflowStyle> = Object.freeze({
	x: "auto",
	y: "auto",
});
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
	private ports = new Map<number, Readonly<OverflowPort>>();
	private portRefs = new Map<string, Readonly<OverflowPort>>();
	private positions = new Map<string, Readonly<{ x: number; y: number }>>();
	private positionKeys = new Map<number, string>();
	private hiddenPorts = new Set<number>();
	private viewportOverflow = viewportDefault;
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
		this.refresh();
		const ref = this.tree.reference(id);
		if (this.controls.has(ref))
			throw new AgentBrowserError(
				"unsupported",
				"Control scroll metrics are not implemented",
			);
		const value = this.values.get(ref) ?? empty;
		const position = this.positions.get(ref);
		return position
			? Object.freeze({
					...value,
					scrollLeft: position.x,
					scrollTop: position.y,
				})
			: value;
	}
	to(id: number, left: number, top: number): boolean {
		layoutNumber(left, true);
		layoutNumber(top, true);
		this.get(id);
		if (!this.tree.isConnected(id)) return false;
		if (this.isRoot(id)) return documentScroll(this.tree).to(left, top);
		const ref = this.tree.reference(id);
		const port = this.portRefs.get(ref);
		if (!port) return false;
		const bounds = this.portBounds(port);
		const next = Object.freeze({
			x: Math.max(0, Math.min(left, bounds.x)),
			y: Math.max(0, Math.min(top, bounds.y)),
		});
		const current = this.positions.get(ref) ?? zeroPosition;
		if (next.x === current.x && next.y === current.y) return false;
		this.positions.set(ref, next);
		this.tree.invalidatePresentation("paint");
		return true;
	}
	by(id: number, horizontal: number, vertical: number): boolean {
		layoutNumber(horizontal, true);
		layoutNumber(vertical, true);
		const current = this.get(id);
		const bounds = this.bounds(id);
		return this.to(
			id,
			Math.max(0, Math.min(current.scrollLeft + horizontal, bounds.x)),
			Math.max(0, Math.min(current.scrollTop + vertical, bounds.y)),
		);
	}
	bounds(id: number): Readonly<{ x: number; y: number }> {
		this.get(id);
		if (!this.tree.isConnected(id)) return zeroPosition;
		if (this.isRoot(id)) return documentScroll(this.tree).bounds();
		const port = this.portRefs.get(this.tree.reference(id));
		return port ? this.portBounds(port) : zeroPosition;
	}
	port(id: number): Readonly<OverflowPort> | undefined {
		this.get(id);
		if (!this.tree.isConnected(id)) return;
		if (this.isRoot(id)) {
			this.refresh();
			const viewport = documentStyles(this.tree).viewport;
			const bounds = documentScroll(this.tree).bounds();
			return Object.freeze({
				id: -1,
				x: 0,
				y: 0,
				...viewport,
				scrollWidth: viewport.width + bounds.x,
				scrollHeight: viewport.height + bounds.y,
				overflow: this.viewportOverflow,
			});
		}
		return this.portRefs.get(this.tree.reference(id));
	}
	allows(id: number, user = false): Readonly<{ x: boolean; y: boolean }> {
		const port = this.port(id);
		const allowed = user ? userScrollsOverflow : scrollsOverflow;
		if (!port || (user && this.hiddenPorts.has(port.id)))
			return Object.freeze({ x: false, y: false });
		return Object.freeze({
			x: allowed(port.overflow.x),
			y: allowed(port.overflow.y),
		});
	}
	userBy(id: number, horizontal: number, vertical: number): boolean {
		const allowed = this.allows(id, true);
		return this.by(id, allowed.x ? horizontal : 0, allowed.y ? vertical : 0);
	}
	chain(id: number, user = false, includeSelf = true): readonly number[] {
		this.tree.get(id);
		this.refresh();
		const result: number[] = [];
		const rootElement = this.tree
			.get(this.tree.root)
			.children.find((child) => this.tree.get(child).kind === "element");
		let current: number | null = includeSelf ? id : this.tree.get(id).parent;
		let depth = 0;
		while (current !== null) {
			if (++depth > 1024)
				throw new AgentBrowserError(
					"resource-limit",
					"Scroll ancestor depth limit exceeded",
				);
			const node = this.tree.get(current);
			if (node.kind === "element") {
				const root = current === rootElement;
				const port = this.portRefs.get(this.tree.reference(current));
				const overflow = root ? this.viewportOverflow : port?.overflow;
				const allowed = user ? userScrollsOverflow : scrollsOverflow;
				if (
					overflow &&
					(!user || !port || !this.hiddenPorts.has(port.id)) &&
					(allowed(overflow.x) || allowed(overflow.y))
				)
					result.push(current);
			}
			current = node.parent;
		}
		return Object.freeze(result);
	}
	snapshot(layout?: Readonly<DocumentLayout>): Readonly<ElementScrollSnapshot> {
		const builds = this.builds;
		this.refresh(layout);
		const positions = new Map<number, Readonly<{ x: number; y: number }>>();
		for (const [id, key] of this.positionKeys)
			positions.set(id, this.positions.get(key) ?? zeroPosition);
		return Object.freeze({
			ports: this.ports,
			positions,
			work: positions.size + (builds === this.builds ? 0 : this.work),
		});
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
		this.ports.clear();
		this.portRefs.clear();
		this.positions.clear();
		this.positionKeys.clear();
		this.hiddenPorts.clear();
		this.unregisterClose();
	}
	private charge() {
		if (++this.work > this.limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Element scroll extent work limit exceeded",
			);
	}
	private isRoot(id: number): boolean {
		return (
			id ===
			this.tree
				.get(this.tree.root)
				.children.find((child) => this.tree.get(child).kind === "element")
		);
	}
	private portBounds(
		port: Readonly<OverflowPort>,
	): Readonly<{ x: number; y: number }> {
		return Object.freeze({
			x: scrollsOverflow(port.overflow.x)
				? Math.max(0, port.scrollWidth - port.width)
				: 0,
			y: scrollsOverflow(port.overflow.y)
				? Math.max(0, port.scrollHeight - port.height)
				: 0,
		});
	}
	private refresh(layout?: Readonly<DocumentLayout>) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Element scrolling is closed");
		this.tree.get(this.tree.root);
		if (this.revision === this.tree.revision) return;
		if (this.revision >= 0) {
			const journal = this.tree.changesSince(this.revision);
			if (
				!journal.reset &&
				journal.changes.every(
					(change) =>
						change.kind === "style" && change.presentationOnly === true,
				)
			) {
				this.revision = this.tree.revision;
				return;
			}
		}
		this.build(layout);
	}
	private build(supplied?: Readonly<DocumentLayout>) {
		this.values.clear();
		this.controls.clear();
		this.revision = -1;
		this.work = 0;
		const layout = supplied ?? layoutDocument(this.tree);
		const formatting = layout.text.horizontal.formatting;
		this.viewportOverflow = formatting.viewportOverflow ?? viewportDefault;
		if (formatting.nodes.length > this.limits.maxElements)
			throw new AgentBrowserError(
				"resource-limit",
				"Element scroll extent element limit exceeded",
			);
		this.ports = new Map();
		this.portRefs = new Map();
		this.positionKeys = new Map();
		this.hiddenPorts = new Set();
		if (formatting.nodes.some((node) => node.overflow)) {
			const measured = measureLayoutOverflow(layout, this.limits.maxWork);
			this.work = measured.work;
			for (const node of formatting.nodes) {
				this.charge();
				if (node.control && node.ref) this.controls.add(node.ref);
			}
			const positions = new Map<string, Readonly<{ x: number; y: number }>>();
			let clamped = false;
			for (const [id, port] of measured.ports) {
				this.charge();
				const node = formatting.nodes[id];
				if (node.kind === "viewport") continue;
				this.ports.set(id, port);
				if (!node.visible) this.hiddenPorts.add(id);
				if (node.control && node.ref) this.controls.add(node.ref);
				if (node.ref && !node.control) {
					this.portRefs.set(node.ref, port);
					this.values.set(
						node.ref,
						Object.freeze({
							scrollLeft: 0,
							scrollTop: 0,
							scrollWidth: Math.round(port.scrollWidth),
							scrollHeight: Math.round(port.scrollHeight),
						}),
					);
				}
				const key =
					node.ref ??
					(node.generatedContent
						? `pseudo:${this.tree.reference(node.generatedContent.owner)}:${node.generatedContent.name}`
						: undefined);
				if (!key) continue;
				this.positionKeys.set(id, key);
				const before = this.positions.get(key) ?? zeroPosition;
				const bounds = this.portBounds(port);
				const next = Object.freeze({
					x: Math.min(before.x, bounds.x),
					y: Math.min(before.y, bounds.y),
				});
				positions.set(key, next);
				clamped ||= next.x !== before.x || next.y !== before.y;
			}
			this.collectInlineMetrics(layout, this.values);
			this.positions = positions;
			this.revision = this.tree.revision;
			this.builds++;
			if (clamped) this.tree.invalidatePresentation("paint");
			return;
		}
		this.positions.clear();
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
		this.collectInlineMetrics(layout, values);
		this.values = values;
		this.controls = controls;
		this.revision = this.tree.revision;
		this.builds++;
	}
	private collectInlineMetrics(
		layout: Readonly<DocumentLayout>,
		values: Map<string, ElementScrollMetrics>,
	) {
		const formatting = layout.text.horizontal.formatting;
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
