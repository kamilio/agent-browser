import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { documentStyles } from "./styles.js";
import { documentScrollPosition } from "./document-scroll.js";
import type { FormattingNode } from "./formatting-tree.js";
import { isInertSubtree } from "./inertness.js";
import {
	projectSvgScene,
	svgShapeContains,
	type ProjectedSvgShape,
} from "./svg-projection.js";

export interface HitTestLimits {
	maxRegions: number;
	maxResults: number;
	maxWork: number;
	maxQueries: number;
}
export const hitTestLimits: Readonly<HitTestLimits> = Object.freeze({
	maxRegions: 250_000,
	maxResults: 4096,
	maxWork: 8_000_000,
	maxQueries: 16_384,
});
export const hitTestCapabilities = Object.freeze({
	partial: true,
	profile: "normal-relative-absolute-fixed-and-flex-stacking-paint-order",
	methods: ["elementFromPoint", "elementsFromPoint"],
	command: "hit-test",
	coordinateSpace: "viewport-css-pixels",
	textTargets: "source-parent",
	attributeInertness: true,
	selectButtonInertness: true,
	modalInertness: false,
	positionedLayout: "partial-ltr-physical-and-static-insets",
	relativePositioning: true,
	stackingContexts: true,
	pointerEventsCss: true,
	scroll: "root-viewport",
	transforms: false,
	...hitTestLimits,
});
export interface HitTarget {
	id: number;
	generated?: string;
}
interface HitRegion extends HitTarget {
	fixed: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	svg?: Readonly<{
		shape: ProjectedSvgShape;
		originX: number;
		originY: number;
		width: number;
		height: number;
	}>;
}

export class DocumentHitTesting {
	private readonly limits: typeof hitTestLimits;
	private regions: readonly HitRegion[] | undefined;
	private revision = -1;
	private queries = 0;
	private work = 0;
	private builds = 0;
	private closed = false;
	private readonly unregisterClose: () => unknown;
	constructor(
		private readonly tree: DocumentTree,
		limits: Partial<typeof hitTestLimits> = {},
	) {
		if (!limits || typeof limits !== "object" || Array.isArray(limits))
			throw new AgentBrowserError("invalid-input", "Invalid hit-test limits");
		for (const [name, value] of Object.entries(limits))
			if (
				!Object.hasOwn(hitTestLimits, name) ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > hitTestLimits[name as keyof typeof hitTestLimits]
			)
				throw new AgentBrowserError("invalid-input", "Invalid hit-test limit");
		this.limits = Object.freeze({ ...hitTestLimits, ...limits });
		tree.get(tree.root);
		this.unregisterClose = tree.onClose(() => this.close());
	}

	elementFromPoint(x: number, y: number): number | null {
		return this.query(x, y, true)[0]?.id ?? null;
	}
	elementsFromPoint(x: number, y: number): readonly number[] {
		return Object.freeze(this.query(x, y, false).map((target) => target.id));
	}
	targetFromPoint(x: number, y: number): Readonly<HitTarget> | null {
		return this.query(x, y, true)[0] ?? null;
	}
	metrics() {
		return Object.freeze({
			revision: this.revision,
			builds: this.builds,
			regions: this.regions?.length ?? 0,
			queries: this.queries,
			work: this.work,
			closed: this.closed,
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.regions = undefined;
		this.unregisterClose();
	}
	private charge = (amount = 1) => {
		this.work += amount;
		if (this.work > this.limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Hit-test work limit exceeded",
			);
	};
	private query(x: number, y: number, first: boolean): Readonly<HitTarget>[] {
		if (this.closed)
			throw new AgentBrowserError("closed", "Hit testing is closed");
		if (
			typeof x !== "number" ||
			typeof y !== "number" ||
			!Number.isFinite(x) ||
			!Number.isFinite(y)
		)
			throw new TypeError("Hit testing requires finite coordinates");
		if (++this.queries > this.limits.maxQueries)
			throw new AgentBrowserError(
				"resource-limit",
				"Hit-test query limit exceeded",
			);
		const scroll = documentScrollPosition(this.tree);
		if (this.revision !== this.tree.revision) {
			this.regions = undefined;
			this.work = 0;
			this.revision = this.tree.revision;
		}
		const viewport = documentStyles(this.tree).viewport;
		if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) return [];
		const documentX = x + scroll.x;
		const documentY = y + scroll.y;
		let root: number | undefined;
		for (const child of this.tree.get(this.tree.root).children) {
			this.charge();
			if (this.tree.get(child).kind === "element") {
				root = child;
				break;
			}
		}
		if (root === undefined) return [];
		const regions = this.regions ?? this.build();
		const result: Readonly<HitTarget>[] = [];
		const seen = new Set<number>();
		const append = (id: number, generated?: string) => {
			if (result.length >= this.limits.maxResults)
				throw new AgentBrowserError(
					"resource-limit",
					"Hit-test result limit exceeded",
				);
			result.push(Object.freeze({ id, ...(generated ? { generated } : {}) }));
			seen.add(id);
		};
		for (let index = regions.length - 1; index >= 0; index--) {
			this.charge();
			const region = regions[index];
			const targetX = region.fixed ? x : documentX;
			const targetY = region.fixed ? y : documentY;
			if (
				seen.has(region.id) ||
				targetX < region.x ||
				targetY < region.y ||
				targetX >= region.x + region.width ||
				targetY >= region.y + region.height
			)
				continue;
			if (region.svg) {
				const across = targetX - region.svg.originX;
				const down = targetY - region.svg.originY;
				if (
					across < 0 ||
					down < 0 ||
					across >= region.svg.width ||
					down >= region.svg.height ||
					!svgShapeContains(region.svg.shape, across, down, this.charge)
				)
					continue;
			}
			append(region.id, region.generated);
			if (first) return result;
		}
		if (result.at(-1)?.id !== root) append(root);
		return result;
	}
	private build(): readonly HitRegion[] {
		const layout = layoutDocument(this.tree);
		const nodes = layout.text.horizontal.formatting.nodes;
		const images = new Map(
			layout.text.horizontal.images.map((image) => [image.id, image]),
		);
		const fixed = new Set(layout.fixedIds);
		const regions: HitRegion[] = [];
		const owners = new Map<number, number | null>();
		const inert = new Map<number, boolean>();
		const styles = documentStyles(this.tree);
		const isInert = (id: number) => {
			if (inert.has(id)) return inert.get(id);
			const blocked = isInertSubtree(this.tree, id, this.charge);
			inert.set(id, blocked);
			return blocked;
		};
		const owner = (formattingId: number) => {
			if (owners.has(formattingId)) return owners.get(formattingId) ?? null;
			let current: number | null = formattingId;
			let target: number | null = null;
			while (current !== null) {
				this.charge();
				const node: Readonly<FormattingNode> = nodes[current];
				if (node.generated) {
					target = node.generated.owner;
					break;
				}
				if (node.kind === "text" && node.ref) {
					const source = this.tree.resolve(node.ref);
					if (source.kind === "text" && source.parent !== null) {
						const parent = this.tree.get(source.parent);
						if (parent.kind === "element") {
							target = parent.id;
							break;
						}
					}
				}
				if (
					node.ref &&
					(["inline", "block", "replaced"].includes(node.kind) ||
						node.contentMode === "flex")
				) {
					const candidate = this.tree.resolve(node.ref);
					if (candidate.kind === "element") {
						target = candidate.id;
						break;
					}
				}
				current = node.parent;
			}
			owners.set(formattingId, target);
			return target;
		};
		const append = (
			formattingId: number,
			x: number,
			y: number,
			width: number,
			height: number,
		) => {
			this.charge();
			if (!nodes[formattingId].visible || width <= 0 || height <= 0) return;
			const id = owner(formattingId);
			if (id === null || styles.pointerEvents(id) === "none" || isInert(id))
				return;
			if (regions.length >= this.limits.maxRegions)
				throw new AgentBrowserError(
					"resource-limit",
					"Hit-test region limit exceeded",
				);
			const generated = nodes[formattingId].generated?.ref;
			regions.push(
				Object.freeze({
					id,
					fixed: fixed.has(formattingId),
					x,
					y,
					width,
					height,
					...(generated ? { generated } : {}),
				}),
			);
		};
		const appendSvg = (id: number, borderX: number, borderY: number) => {
			const svg = nodes[id].svg;
			const image = images.get(id);
			if (svg && image) {
				const originX = borderX + image.borderLeft + image.paddingLeft;
				const originY = borderY + image.borderTop + image.paddingTop;
				const projection = projectSvgScene(
					svg,
					image.contentWidth,
					image.contentHeight,
					this.charge,
				);
				for (const shape of projection.shapes) {
					this.charge();
					if (
						!shape.visible ||
						!shape.pointerEvents ||
						shape.fill === null ||
						!shape.bounds ||
						shape.bounds.width <= 0 ||
						shape.bounds.height <= 0 ||
						isInert(shape.id)
					)
						continue;
					if (regions.length >= this.limits.maxRegions)
						throw new AgentBrowserError(
							"resource-limit",
							"Hit-test region limit exceeded",
						);
					regions.push(
						Object.freeze({
							id: shape.id,
							fixed: fixed.has(id),
							x: originX + shape.bounds.x,
							y: originY + shape.bounds.y,
							width: shape.bounds.width,
							height: shape.bounds.height,
							svg: Object.freeze({
								shape,
								originX,
								originY,
								width: image.contentWidth,
								height: image.contentHeight,
							}),
						}),
					);
				}
			}
		};
		for (const item of layoutContentItems(layout, this.charge)) {
			if (item.kind === "marker") {
				const marker = item.marker;
				append(marker.id, marker.x, marker.y, marker.width, marker.height);
			} else if (item.kind === "image" || item.kind === "box") {
				const box = item.box;
				append(
					box.id,
					box.borderX,
					box.borderY,
					box.borderBoxWidth,
					box.borderBoxHeight,
				);
				appendSvg(box.id, box.borderX, box.borderY);
			} else if (item.kind === "fragment") {
				const fragment = item.fragment;
				append(
					fragment.formattingId,
					fragment.x,
					fragment.y,
					fragment.width,
					fragment.height,
				);
				appendSvg(fragment.formattingId, fragment.x, fragment.y);
			} else {
				const glyph = item.glyph;
				if (glyph.visible)
					append(
						glyph.formattingId,
						glyph.x,
						item.contentY + glyph.y,
						glyph.advance,
						glyph.fontSize,
					);
			}
		}
		this.regions = Object.freeze(regions);
		this.builds++;
		return this.regions;
	}
}

const owners = new WeakMap<DocumentTree, DocumentHitTesting>();
export function documentHitTesting(tree: DocumentTree): DocumentHitTesting {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentHitTesting(tree);
		owners.set(tree, owner);
	}
	return owner;
}
