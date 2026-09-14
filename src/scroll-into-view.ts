import { documentGeometry, LayoutGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { projectScrollLayout } from "./document-overflow.js";
import { documentScroll, documentScrollPosition } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { AgentBrowserError } from "./errors.js";
import type { EventAction } from "./event-actions.js";
import { BrowserEvent } from "./events.js";
import { documentStyles } from "./styles.js";
import { resolveVisualTarget } from "./generated-controls.js";
import { projectFixedLayout } from "./out-of-flow-positioning.js";
import type { ScrollPositionRequest } from "./root-scroll.js";

export type ScrollAlignment = "start" | "center" | "end" | "nearest";
export interface ScrollIntoViewOptions {
	block?: ScrollAlignment;
	inline?: ScrollAlignment;
	behavior?: "auto" | "instant";
	container?: "all" | "nearest";
}
export const scrollIntoViewCapabilities = Object.freeze({
	partial: true,
	profile: "instant-ltr-nested-scrollports",
	fixedTargets: "root-stationary",
	command: "scroll-into-view",
	method: "scrollIntoView",
	alignments: ["start", "center", "end", "nearest"],
	defaults: { block: "start", inline: "nearest" },
	containers: ["all", "nearest"],
	containerScope: "nested-scrollports",
	smooth: false,
	scrollMarginPadding: false,
	scrollSnap: false,
	maxRequests: 16_384,
	maxAncestors: 1024,
	maxWork: 2_000_000,
});
export interface ScrollIntoViewResult {
	reference: string;
	revision: number;
	hasBox: boolean;
	changed: boolean;
	scroll: Readonly<{ x: number; y: number }>;
}

export function scrollIntoViewOptions(
	argument: unknown,
): Required<ScrollIntoViewOptions> {
	const result: Required<ScrollIntoViewOptions> = {
		block: "start",
		inline: "nearest",
		behavior: "auto",
		container: "all",
	};
	if (argument === undefined || argument === null) return result;
	if (typeof argument !== "object" && typeof argument !== "function") {
		if (!argument) result.block = "end";
		return result;
	}
	if (
		typeof argument !== "object" ||
		Array.isArray(argument) ||
		![Object.prototype, null].includes(Object.getPrototypeOf(argument))
	)
		throw new AgentBrowserError(
			"unsupported",
			"Scroll-into-view options require an own-data dictionary",
		);
	for (const property of [
		"block",
		"inline",
		"behavior",
		"container",
	] as const) {
		const descriptor = Object.getOwnPropertyDescriptor(argument, property);
		if (!descriptor) continue;
		if (!Object.hasOwn(descriptor, "value"))
			throw new AgentBrowserError(
				"unsupported",
				"Scroll-into-view option accessors are not implemented",
			);
		const value = descriptor.value;
		if (value === undefined) continue;
		if (property === "block" || property === "inline") {
			if (!["start", "center", "end", "nearest"].includes(value))
				throw new TypeError(`Invalid ${property} scroll alignment`);
			result[property] = value;
		} else if (property === "behavior") {
			if (!["auto", "instant", "smooth"].includes(value))
				throw new TypeError("Invalid scroll behavior");
			if (value === "smooth")
				throw new AgentBrowserError(
					"unsupported",
					"Smooth scrolling is not implemented",
				);
			result.behavior = value;
		} else {
			if (!["all", "nearest"].includes(value))
				throw new TypeError("Invalid scroll container");
			result.container = value;
		}
	}
	return result;
}

function offset(
	start: number,
	end: number,
	viewport: number,
	alignment: ScrollAlignment,
) {
	if (alignment === "start") return start;
	if (alignment === "end") return end - viewport;
	if (alignment === "center") return (start + end - viewport) / 2;
	if (start >= 0 && end <= viewport) return 0;
	if (start < 0 && end > viewport) return 0;
	if (start < 0) return end - start <= viewport ? start : end - viewport;
	if (end > viewport) return end - start <= viewport ? end - viewport : start;
	return 0;
}

export class DocumentScrollIntoView {
	private requests = 0;
	private closed = false;
	private readonly unregisterClose: () => unknown;
	constructor(private readonly tree: DocumentTree) {
		tree.get(tree.root);
		this.unregisterClose = tree.onClose(() => this.close());
	}
	plan(
		target: number | string,
		argument?: unknown,
		includeOutsideMarkers = false,
	): Readonly<ScrollPositionRequest & { left: number; top: number }> | null {
		if (this.closed)
			throw new AgentBrowserError("closed", "Scroll into view is closed");
		if (++this.requests > scrollIntoViewCapabilities.maxRequests)
			throw new AgentBrowserError(
				"resource-limit",
				"Scroll-into-view request limit exceeded",
			);
		const resolved =
			typeof target === "string"
				? resolveVisualTarget(this.tree, target)
				: undefined;
		const id = resolved?.node.id ?? (target as number);
		if (this.tree.get(id).kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Scroll into view requires an element",
			);
		const alignment = scrollIntoViewOptions(argument);
		if (!this.tree.isConnected(id)) return null;
		const owner = documentScroll(this.tree);
		const current = owner.get();
		const styles = documentStyles(this.tree);
		const normal = layoutDocument(this.tree);
		const scrolling = documentElementScroll(this.tree);
		scrolling.snapshot(normal);
		const rootElement = this.tree
			.get(this.tree.root)
			.children.find((target) => this.tree.get(target).kind === "element");
		const ancestors = new Set<number>();
		let ancestor: number | null = id;
		let depth = 0;
		let work = 0;
		const charge = (amount = 1) => {
			work += amount;
			if (work > scrollIntoViewCapabilities.maxWork)
				throw new AgentBrowserError(
					"resource-limit",
					"Scroll-into-view planning work limit exceeded",
				);
		};
		while (ancestor !== null) {
			charge();
			if (++depth > scrollIntoViewCapabilities.maxAncestors)
				throw new AgentBrowserError(
					"resource-limit",
					"Scroll-into-view ancestor limit exceeded",
				);
			const node = this.tree.get(ancestor);
			if (ancestor !== id || ancestor === rootElement) ancestors.add(ancestor);
			if (
				node.kind === "element" &&
				styles.get(ancestor).display !== "contents" &&
				styles.flow(ancestor).position === "fixed"
			)
				break;
			ancestor = node.parent;
		}
		const chain = scrolling
			.chain(id, false, id === rootElement)
			.filter((target) => {
				charge();
				return ancestors.has(target);
			});
		const overrides = new Map<number, Readonly<{ x: number; y: number }>>();
		const elements: { target: number; left: number; top: number }[] = [];
		let root = current;
		const reference = resolved?.generated?.ref ?? this.tree.reference(id);
		const project = () => {
			charge();
			const limit =
				normal.metrics.work + scrollIntoViewCapabilities.maxWork - work;
			const layout = projectFixedLayout(
				projectScrollLayout(this.tree, normal, limit, {
					elements: overrides,
					root,
				}),
				root,
				limit,
			);
			charge(Math.max(0, layout.metrics.work - normal.metrics.work));
			const geometry = new LayoutGeometry(layout);
			charge(geometry.metrics().work);
			const candidates =
				includeOutsideMarkers && !resolved?.generated
					? geometry.getActionableClientRects(reference).filter((rect) => {
							charge();
							return rect.width > 0 && rect.height > 0;
						})
					: geometry.getClientRects(reference);
			if (!candidates.length) return null;
			const rectangle = candidates.reduce(
				(bounds, rect) => {
					charge();
					return {
						left: Math.min(bounds.left, rect.left),
						right: Math.max(bounds.right, rect.right),
						top: Math.min(bounds.top, rect.top),
						bottom: Math.max(bounds.bottom, rect.bottom),
					};
				},
				{
					left: Number.POSITIVE_INFINITY,
					right: Number.NEGATIVE_INFINITY,
					top: Number.POSITIVE_INFINITY,
					bottom: Number.NEGATIVE_INFINITY,
				},
			);
			return {
				layout,
				rectangle:
					resolved?.generated || includeOutsideMarkers
						? rectangle
						: geometry.getBoundingClientRect(reference),
			};
		};
		let frame = project();
		if (!frame) return null;
		for (const [index, target] of chain.entries()) {
			charge();
			const port = scrolling.port(target);
			if (!port) continue;
			const position = scrolling.get(target);
			const maximum = scrolling.bounds(target);
			const allowed = scrolling.allows(target);
			let left = root.x;
			let top = root.y;
			if (port.id !== -1) {
				const box = frame.layout.boxes.find((box) => {
					charge();
					return box.id === port.id;
				});
				if (!box)
					throw new AgentBrowserError(
						"invalid-input",
						"Missing scrollport box",
					);
				left = box.borderX + box.borderLeft;
				top = box.borderY + box.borderTop;
			}
			const next = Object.freeze({
				x: allowed.x
					? Math.max(
							0,
							Math.min(
								maximum.x,
								position.scrollLeft +
									offset(
										frame.rectangle.left - left,
										frame.rectangle.right - left,
										port.width,
										alignment.inline,
									),
							),
						)
					: position.scrollLeft,
				y: allowed.y
					? Math.max(
							0,
							Math.min(
								maximum.y,
								position.scrollTop +
									offset(
										frame.rectangle.top - top,
										frame.rectangle.bottom - top,
										port.height,
										alignment.block,
									),
							),
						)
					: position.scrollTop,
			});
			const changed =
				next.x !== position.scrollLeft || next.y !== position.scrollTop;
			if (port.id === -1) root = next;
			else if (changed) {
				overrides.set(target, next);
				elements.push(Object.freeze({ target, left: next.x, top: next.y }));
			}
			if (alignment.container === "nearest") break;
			if (changed && index + 1 < chain.length) {
				frame = project();
				if (!frame) return null;
			}
		}
		return Object.freeze(
			elements.length
				? { left: root.x, top: root.y, elements: Object.freeze(elements) }
				: { left: root.x, top: root.y },
		);
	}
	*action(
		target: number | string,
		argument?: unknown,
		includeOutsideMarkers = false,
	): EventAction<ScrollIntoViewResult> {
		const plan = this.plan(target, argument, includeOutsideMarkers);
		const reference =
			typeof target === "string" ? target : this.tree.reference(target);
		if (!plan) {
			const scroll = documentScrollPosition(this.tree);
			return {
				reference,
				revision: this.tree.revision,
				hasBox: false,
				changed: false,
				scroll,
			};
		}
		const owner = documentScroll(this.tree);
		let changed = false;
		for (const element of plan.elements ?? []) {
			if (!this.tree.isConnected(element.target)) continue;
			if (
				documentElementScroll(this.tree).to(
					element.target,
					element.left,
					element.top,
				)
			) {
				changed = true;
				yield {
					target: element.target,
					event: new BrowserEvent("scroll"),
				};
				if (this.closed)
					throw new AgentBrowserError("closed", "Scroll into view is closed");
			}
		}
		if (owner.to(plan.left, plan.top)) {
			changed = true;
			yield {
				target: this.tree.root,
				event: new BrowserEvent("scroll", { bubbles: true }),
			};
		}
		const scroll = owner.get();
		const generated =
			typeof target === "string"
				? resolveVisualTarget(this.tree, target).generated
				: undefined;
		return {
			reference,
			revision: this.tree.revision,
			hasBox: generated
				? documentGeometry(this.tree).getGeneratedClientRects(generated.ref)
						.length > 0
				: true,
			changed,
			scroll,
		};
	}
	metrics() {
		return Object.freeze({ requests: this.requests, closed: this.closed });
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterClose();
	}
}

const owners = new WeakMap<DocumentTree, DocumentScrollIntoView>();
export function documentScrollIntoView(
	tree: DocumentTree,
): DocumentScrollIntoView {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentScrollIntoView(tree);
		owners.set(tree, owner);
	}
	return owner;
}
