import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { resolveInlineEdges } from "./inline-box.js";
import { documentScrollPosition } from "./document-scroll.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { projectFixedLayout } from "./out-of-flow-positioning.js";
import { projectStickyLayout } from "./sticky-positioning.js";
import { outsideMarkerRects } from "./outside-markers.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { projectSvgScene } from "./svg-projection.js";

export type UsedStyle = Readonly<Partial<Record<string, number>>>;

export interface ClientRectangle {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export const geometryLimits = Object.freeze({
	maxRectangles: 250_000,
	maxWork: 2_000_000,
});
const empty: readonly ClientRectangle[] = Object.freeze([]);

function rectangle(
	x: number,
	y: number,
	width: number,
	height: number,
): ClientRectangle {
	return Object.freeze({
		x,
		y,
		width,
		height,
		top: y,
		right: x + width,
		bottom: y + height,
		left: x,
	});
}

export class LayoutGeometry {
	private rectangles = new Map<string, readonly ClientRectangle[]>();
	private markerRectangles = new Map<string, readonly ClientRectangle[]>();
	private bounds = new Map<string, ClientRectangle>();
	private splitInlines = new Set<string>();
	private retained = 0;
	private work = 0;
	private usedStyles = new Map<string, UsedStyle>();

	getUsedStyle(ref: string): UsedStyle | undefined {
		this.getClientRects(ref);
		return this.usedStyles.get(ref);
	}

	getClientRects(ref: string): readonly ClientRectangle[] {
		if (this.splitInlines.has(ref))
			throw new AgentBrowserError(
				"unsupported",
				"Client geometry for block-in-inline splits is not implemented",
			);
		return this.rectangles.get(ref) ?? empty;
	}

	getActionableClientRects(ref: string): readonly ClientRectangle[] {
		const rects = this.getClientRects(ref);
		const markers = this.markerRectangles.get(ref);
		return markers ? Object.freeze([...rects, ...markers]) : rects;
	}

	getBoundingClientRect(ref: string): ClientRectangle {
		const rects = this.getClientRects(ref);
		if (!rects.length) return rectangle(0, 0, 0, 0);
		return this.bounds.get(ref) as ClientRectangle;
	}

	metrics() {
		return Object.freeze({
			rectangles: this.retained,
			work: this.work,
			usedStyles: this.usedStyles.size,
		});
	}

	constructor(layout: DocumentLayout, includeUsedStyles = false) {
		const rectangles = new Map<string, ClientRectangle[]>();
		const markers = new Map<string, ClientRectangle[]>();
		const images = new Map(
			layout.text.horizontal.images.map((image) => [image.id, image]),
		);
		const charge = (amount = 1) => {
			this.work += amount;
			if (this.work > geometryLimits.maxWork)
				throw new AgentBrowserError(
					"resource-limit",
					"Client geometry work limit exceeded",
				);
		};
		let count = 0;
		const append = (
			ref: string,
			value: ClientRectangle,
			destination = rectangles,
		) => {
			charge();
			if (++count > geometryLimits.maxRectangles)
				throw new AgentBrowserError(
					"resource-limit",
					"Client geometry rectangle limit exceeded",
				);
			const list = destination.get(ref);
			if (list) list.push(value);
			else destination.set(ref, [value]);
		};
		let hasSvg = false;
		let hasTableGeometry = false;
		for (const node of layout.text.horizontal.formatting.nodes) {
			charge();
			if (node.svg) hasSvg = true;
			if (node.tableWrapper !== undefined || node.tableCaptions !== undefined)
				hasTableGeometry = true;
			if (node.ref && (node.fragmentCount ?? 0) > 1)
				this.splitInlines.add(node.ref);
		}
		const boxesById = new Map<number, DocumentLayout["boxes"][number]>();
		if (hasTableGeometry)
			for (const box of layout.boxes) {
				charge();
				boxesById.set(box.id, box);
			}
		for (const box of layout.boxes) {
			charge();
			const node = layout.text.horizontal.formatting.nodes[box.id];
			if (includeUsedStyles && box.ref) {
				const sizing = node.box?.["box-sizing"];
				const margins =
					node.tableWrapper === undefined
						? box
						: boxesById.get(node.tableWrapper);
				if (!margins)
					throw new AgentBrowserError(
						"unsupported",
						"Used table margins require a retained table wrapper",
					);
				this.usedStyles.set(
					box.ref,
					Object.freeze({
						width:
							sizing === "border-box" ? box.borderBoxWidth : box.contentWidth,
						height:
							sizing === "border-box" ? box.borderBoxHeight : box.contentHeight,
						"margin-top": margins.marginTop,
						"margin-right": margins.marginRight,
						"margin-bottom": margins.marginBottom,
						"margin-left": margins.marginLeft,
						"padding-top": box.paddingTop,
						"padding-right": box.paddingRight,
						"padding-bottom": box.paddingBottom,
						"padding-left": box.paddingLeft,
						"border-top-width": box.borderTop,
						"border-right-width": box.borderRight,
						"border-bottom-width": box.borderBottom,
						"border-left-width": box.borderLeft,
					}),
				);
			}
			const reference = box.ref ?? node.generated?.ref;
			if (reference)
				append(
					reference,
					rectangle(
						box.borderX,
						box.borderY,
						box.borderBoxWidth,
						box.borderBoxHeight,
					),
				);
			if (box.ref)
				for (const captionId of node.tableCaptions ?? []) {
					charge();
					const caption = boxesById.get(captionId);
					if (caption)
						append(
							box.ref,
							rectangle(
								caption.borderX,
								caption.borderY,
								caption.borderBoxWidth,
								caption.borderBoxHeight,
							),
						);
				}
		}
		for (const context of layout.contexts) {
			charge();
			for (const fragment of context.fragments) {
				charge();
				if (fragment.atomic) continue;
				if (
					layout.text.horizontal.formatting.nodes[fragment.formattingId].marker
				)
					continue;
				if (
					includeUsedStyles &&
					fragment.ref &&
					!this.usedStyles.has(fragment.ref)
				) {
					const style =
						layout.text.horizontal.formatting.nodes[fragment.formattingId].box;
					const image = images.get(fragment.formattingId);
					this.usedStyles.set(
						fragment.ref,
						Object.freeze(
							image
								? {
										width:
											style?.["box-sizing"] === "border-box"
												? image.borderBoxWidth
												: image.contentWidth,
										height:
											style?.["box-sizing"] === "border-box"
												? image.borderBoxHeight
												: image.contentHeight,
										"margin-left": image.marginLeft,
										"margin-right": image.marginRight,
										"margin-top": image.marginTop,
										"margin-bottom": image.marginBottom,
										"padding-left": image.paddingLeft,
										"padding-right": image.paddingRight,
										"padding-top": image.paddingTop,
										"padding-bottom": image.paddingBottom,
										"border-top-width": image.borderTop,
										"border-right-width": image.borderRight,
										"border-bottom-width": image.borderBottom,
										"border-left-width": image.borderLeft,
									}
								: resolveInlineEdges(context.contentWidth, style),
						),
					);
				}
				if (fragment.ref)
					append(
						fragment.ref,
						rectangle(fragment.x, fragment.y, fragment.width, fragment.height),
					);
			}
		}
		if (hasSvg)
			for (const item of layoutContentItems(layout, charge)) {
				if (item.kind !== "image" && item.kind !== "fragment") continue;
				const id =
					item.kind === "image" ? item.box.id : item.fragment.formattingId;
				const node = layout.text.horizontal.formatting.nodes[id];
				const image = images.get(id);
				if (!node.svg || !image) continue;
				const borderX =
					item.kind === "image" ? item.box.borderX : item.fragment.x;
				const borderY =
					item.kind === "image" ? item.box.borderY : item.fragment.y;
				const originX = borderX + image.borderLeft + image.paddingLeft;
				const originY = borderY + image.borderTop + image.paddingTop;
				const projection = projectSvgScene(
					node.svg,
					image.contentWidth,
					image.contentHeight,
					charge,
				);
				const bounds = new Map<string, ClientRectangle>();
				for (const shape of projection.shapes) {
					charge();
					if (!shape.bounds) continue;
					const box = rectangle(
						originX + shape.bounds.x,
						originY + shape.bounds.y,
						shape.bounds.width,
						shape.bounds.height,
					);
					for (const ref of [shape.ref, ...shape.ancestors]) {
						charge();
						const previous = bounds.get(ref);
						if (!previous) bounds.set(ref, box);
						else {
							const left = Math.min(previous.left, box.left);
							const top = Math.min(previous.top, box.top);
							bounds.set(
								ref,
								rectangle(
									left,
									top,
									Math.max(previous.right, box.right) - left,
									Math.max(previous.bottom, box.bottom) - top,
								),
							);
						}
					}
				}
				for (const [ref, boundsValue] of bounds) append(ref, boundsValue);
			}
		for (const marker of outsideMarkerRects(layout, charge)) {
			charge();
			const node = layout.text.horizontal.formatting.nodes[marker.id];
			if (node.ref && node.visible)
				append(
					node.ref,
					rectangle(marker.x, marker.y, marker.width, marker.height),
					markers,
				);
		}
		for (const [ref, list] of markers) {
			charge();
			this.markerRectangles.set(ref, Object.freeze(list));
		}
		if (includeUsedStyles)
			for (const position of layout.relativePositions ?? []) {
				charge();
				const ref = layout.text.horizontal.formatting.nodes[position.id].ref;
				if (ref)
					this.usedStyles.set(
						ref,
						Object.freeze({
							...this.usedStyles.get(ref),
							left: position.left,
							right: -position.left || 0,
							top: position.top,
							bottom: -position.top || 0,
						}),
					);
			}
		if (includeUsedStyles)
			for (const position of layout.positionedInsets ?? []) {
				charge();
				const ref = layout.text.horizontal.formatting.nodes[position.id].ref;
				if (ref)
					this.usedStyles.set(
						ref,
						Object.freeze({
							...this.usedStyles.get(ref),
							left: position.left,
							right: position.right,
							top: position.top,
							bottom: position.bottom,
						}),
					);
			}
		const frozen = new Map<string, readonly ClientRectangle[]>();
		const bounds = new Map<string, ClientRectangle>();
		for (const [ref, list] of rectangles) {
			charge();
			let left = Number.POSITIVE_INFINITY;
			let top = Number.POSITIVE_INFINITY;
			let right = Number.NEGATIVE_INFINITY;
			let bottom = Number.NEGATIVE_INFINITY;
			let nonempty = false;
			for (const rect of list) {
				charge();
				if (rect.width !== 0 && rect.height !== 0) nonempty = true;
				if (rect.width === 0 && rect.height === 0) continue;
				left = Math.min(left, rect.left);
				top = Math.min(top, rect.top);
				right = Math.max(right, rect.right);
				bottom = Math.max(bottom, rect.bottom);
			}
			bounds.set(
				ref,
				nonempty ? rectangle(left, top, right - left, bottom - top) : list[0],
			);
			frozen.set(ref, Object.freeze(list));
		}
		this.rectangles = frozen;
		this.bounds = bounds;
		this.retained = count;
	}
}

export class DocumentGeometry {
	private revision = -1;
	private builds = 0;
	private work = 0;
	private closed = false;
	private snapshot?: LayoutGeometry;
	private readonly unregisterClose: () => unknown;

	constructor(private readonly tree: DocumentTree) {
		this.unregisterClose = tree.onClose(() => this.close());
	}

	getClientRects(id: number): readonly ClientRectangle[] {
		if (!this.connectedElement(id)) return empty;
		const scroll = documentScrollPosition(this.tree);
		const rects = this.getDocumentRects(id);
		if (scroll.x === 0 && scroll.y === 0) return rects;
		return Object.freeze(
			rects.map((rect) =>
				rectangle(
					rect.x - scroll.x,
					rect.y - scroll.y,
					rect.width,
					rect.height,
				),
			),
		);
	}

	getDocumentRects(id: number): readonly ClientRectangle[] {
		if (!this.connectedElement(id)) return empty;
		return this.refresh().getClientRects(this.tree.reference(id));
	}

	getActionableClientRects(id: number): readonly ClientRectangle[] {
		if (!this.connectedElement(id)) return empty;
		const scroll = documentScrollPosition(this.tree);
		const rects = this.refresh().getActionableClientRects(
			this.tree.reference(id),
		);
		if (scroll.x === 0 && scroll.y === 0) return rects;
		return Object.freeze(
			rects.map((rect) =>
				rectangle(
					rect.x - scroll.x,
					rect.y - scroll.y,
					rect.width,
					rect.height,
				),
			),
		);
	}

	getGeneratedClientRects(reference: string): readonly ClientRectangle[] {
		const scroll = documentScrollPosition(this.tree);
		const rects = this.getGeneratedDocumentRects(reference);
		if (scroll.x === 0 && scroll.y === 0) return rects;
		return Object.freeze(
			rects.map((rect) =>
				rectangle(
					rect.x - scroll.x,
					rect.y - scroll.y,
					rect.width,
					rect.height,
				),
			),
		);
	}

	getGeneratedDocumentRects(reference: string): readonly ClientRectangle[] {
		return this.generatedSnapshot(reference).getClientRects(reference);
	}

	getGeneratedBoundingClientRect(reference: string): ClientRectangle {
		const snapshot = this.generatedSnapshot(reference);
		const rect = snapshot.getBoundingClientRect(reference);
		const scroll = documentScrollPosition(this.tree);
		if ((!scroll.x && !scroll.y) || !snapshot.getClientRects(reference).length)
			return rect;
		return rectangle(
			rect.x - scroll.x,
			rect.y - scroll.y,
			rect.width,
			rect.height,
		);
	}

	private generatedSnapshot(reference: string) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document geometry is closed");
		documentGeneratedControls(this.tree).resolve(reference);
		return this.refresh();
	}

	getBoundingClientRect(id: number): ClientRectangle {
		if (!this.connectedElement(id)) return rectangle(0, 0, 0, 0);
		const scroll = documentScrollPosition(this.tree);
		const snapshot = this.refresh();
		const ref = this.tree.reference(id);
		const rect = snapshot.getBoundingClientRect(ref);
		if (
			(scroll.x === 0 && scroll.y === 0) ||
			snapshot.getClientRects(ref).length === 0
		)
			return rect;
		return rectangle(
			rect.x - scroll.x,
			rect.y - scroll.y,
			rect.width,
			rect.height,
		);
	}

	getUsedStyle(id: number): UsedStyle | undefined {
		if (!this.connectedElement(id)) return;
		return this.refresh().getUsedStyle(this.tree.reference(id));
	}

	metrics() {
		return Object.freeze({
			revision: this.revision,
			builds: this.builds,
			rectangles: this.snapshot?.metrics().rectangles ?? 0,
			usedStyles: this.snapshot?.metrics().usedStyles ?? 0,
			work: this.work,
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.snapshot = undefined;
		this.unregisterClose();
	}

	private connectedElement(id: number) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document geometry is closed");
		if (this.tree.get(id).kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Geometry requires an element",
			);
		return this.tree.isConnected(id);
	}

	private refresh() {
		const scroll = documentScrollPosition(this.tree);
		if (this.snapshot && this.revision === this.tree.revision)
			return this.snapshot;
		this.snapshot = undefined;
		this.work = 0;
		const layout = layoutDocument(this.tree);
		const snapshot = new LayoutGeometry(
			projectFixedLayout(
				projectStickyLayout(
					layout,
					scroll,
					layout.metrics.work + geometryLimits.maxWork,
				),
				scroll,
				layout.metrics.work + geometryLimits.maxWork,
			),
			true,
		);
		this.snapshot = snapshot;
		this.work = snapshot.metrics().work;
		this.revision = this.tree.revision;
		this.builds++;
		return snapshot;
	}
}

const owners = new WeakMap<DocumentTree, DocumentGeometry>();
export function documentGeometry(tree: DocumentTree) {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentGeometry(tree);
		owners.set(tree, owner);
	}
	return owner;
}
