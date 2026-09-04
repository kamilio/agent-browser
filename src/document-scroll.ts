import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

export const viewportScrollLimits = Object.freeze({
	maxWork: 2_000_000,
	maxUpdates: 16_384,
});
export const viewportScrollCapabilities = Object.freeze({
	partial: true,
	profile: "normal-flow-ltr-root-viewport",
	positionedOverflow: "absolute-included-fixed-excluded",
	command: "mousewheel",
	elementScrolling: false,
	smooth: false,
	scrollbars: false,
	programmaticGuestScrolling: true,
	scrollEvents: "command-step-and-coalesced-programmatic-host-task",
	automaticClampEvents: false,
	...viewportScrollLimits,
});
const zero: Readonly<{ x: number; y: number }> = Object.freeze({ x: 0, y: 0 });

export class DocumentScroll {
	private position = zero;
	private revision = -1;
	private maximum = zero;
	private builds = 0;
	private updates = 0;
	private work = 0;
	private closed = false;
	private readonly unregisterClose: () => unknown;
	constructor(private readonly tree: DocumentTree) {
		this.unregisterClose = tree.onClose(() => this.close());
	}
	get() {
		this.refresh();
		return this.position;
	}
	bounds() {
		this.refresh();
		return this.maximum;
	}
	by(x: number, y: number) {
		layoutNumber(x, true);
		layoutNumber(y, true);
		const current = this.get();
		return this.to(
			Math.max(0, Math.min(current.x + x, this.maximum.x)),
			Math.max(0, Math.min(current.y + y, this.maximum.y)),
		);
	}
	to(x: number, y: number) {
		layoutNumber(x, true);
		layoutNumber(y, true);
		this.refresh();
		if (++this.updates > viewportScrollLimits.maxUpdates)
			throw new AgentBrowserError(
				"resource-limit",
				"Viewport scroll update limit exceeded",
			);
		const next = Object.freeze({
			x: Math.max(0, Math.min(x, this.maximum.x)),
			y: Math.max(0, Math.min(y, this.maximum.y)),
		});
		if (next.x === this.position.x && next.y === this.position.y) return false;
		this.position = next;
		this.tree.invalidatePresentation("paint");
		return true;
	}
	metrics() {
		return Object.freeze({
			...this.position,
			maximum: this.maximum,
			revision: this.revision,
			builds: this.builds,
			updates: this.updates,
			work: this.work,
			closed: this.closed,
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.position = zero;
		this.maximum = zero;
		this.unregisterClose();
	}
	private refresh() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Viewport scrolling is closed");
		this.tree.get(this.tree.root);
		if (this.revision === this.tree.revision) return;
		const layout = layoutDocument(this.tree);
		const viewport = layout.text.horizontal.formatting.viewport;
		const fixed = new Set(layout.fixedIds);
		let right = viewport.width;
		let bottom = Math.max(viewport.height, layout.flowHeight);
		this.work = 0;
		const include = (x: number, y: number, width: number, height: number) => {
			if (++this.work > viewportScrollLimits.maxWork)
				throw new AgentBrowserError(
					"resource-limit",
					"Viewport scroll extent work limit exceeded",
				);
			right = Math.max(right, layoutNumber(x + width, true));
			bottom = Math.max(bottom, layoutNumber(y + height, true));
		};
		for (const box of layout.boxes) {
			if (fixed.has(box.id)) continue;
			include(
				box.borderX,
				box.borderY,
				box.borderBoxWidth + Math.max(0, box.marginRight),
				box.borderBoxHeight + Math.max(0, box.marginBottom),
			);
		}
		for (const context of layout.contexts) {
			for (const fragment of context.fragments) {
				if (fixed.has(fragment.formattingId)) continue;
				include(
					fragment.x,
					fragment.y,
					fragment.width + Math.max(0, fragment.marginRight ?? 0),
					fragment.height + Math.max(0, fragment.marginBottom ?? 0),
				);
			}
			for (const glyph of context.glyphs) {
				if (fixed.has(glyph.formattingId)) continue;
				include(glyph.x, glyph.y, glyph.advance, glyph.fontSize);
			}
		}
		this.maximum = Object.freeze({
			x: Math.max(0, right - viewport.width),
			y: Math.max(0, bottom - viewport.height),
		});
		this.revision = this.tree.revision;
		this.builds++;
		const next = Object.freeze({
			x: Math.min(this.position.x, this.maximum.x),
			y: Math.min(this.position.y, this.maximum.y),
		});
		if (next.x !== this.position.x || next.y !== this.position.y) {
			this.position = next;
			this.tree.invalidatePresentation("paint");
		}
	}
}

const owners = new WeakMap<DocumentTree, DocumentScroll>();
export function documentScroll(tree: DocumentTree) {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentScroll(tree);
		owners.set(tree, owner);
	}
	return owner;
}
export function documentScrollPosition(
	tree: DocumentTree,
): Readonly<{ x: number; y: number }> {
	tree.get(tree.root);
	return owners.get(tree)?.get() ?? zero;
}
