import { documentGeometry } from "./document-geometry.js";
import { documentScroll, documentScrollPosition } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { EventAction } from "./event-actions.js";
import { BrowserEvent } from "./events.js";
import { documentStyles } from "./styles.js";

export type ScrollAlignment = "start" | "center" | "end" | "nearest";
export interface ScrollIntoViewOptions {
	block?: ScrollAlignment;
	inline?: ScrollAlignment;
	behavior?: "auto" | "instant";
	container?: "all" | "nearest";
}
export const scrollIntoViewCapabilities = Object.freeze({
	partial: true,
	profile: "instant-normal-flow-ltr-root",
	command: null,
	method: "scrollIntoView",
	alignments: ["start", "center", "end", "nearest"],
	defaults: { block: "start", inline: "nearest" },
	containers: ["all", "nearest"],
	containerScope: "root-only",
	smooth: false,
	scrollMarginPadding: false,
	scrollSnap: false,
	maxRequests: 16_384,
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
		id: number,
		argument?: unknown,
	): Readonly<{ left: number; top: number }> | null {
		if (this.closed)
			throw new AgentBrowserError("closed", "Scroll into view is closed");
		if (++this.requests > scrollIntoViewCapabilities.maxRequests)
			throw new AgentBrowserError(
				"resource-limit",
				"Scroll-into-view request limit exceeded",
			);
		if (this.tree.get(id).kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Scroll into view requires an element",
			);
		const alignment = scrollIntoViewOptions(argument);
		if (!this.tree.isConnected(id)) return null;
		const geometry = documentGeometry(this.tree);
		if (!geometry.getDocumentRects(id).length) return null;
		const owner = documentScroll(this.tree);
		const current = owner.get();
		const maximum = owner.bounds();
		const rectangle = geometry.getBoundingClientRect(id);
		const viewport = documentStyles(this.tree).viewport;
		return Object.freeze({
			left: Math.max(
				0,
				Math.min(
					maximum.x,
					current.x +
						offset(
							rectangle.left,
							rectangle.right,
							viewport.width,
							alignment.inline,
						),
				),
			),
			top: Math.max(
				0,
				Math.min(
					maximum.y,
					current.y +
						offset(
							rectangle.top,
							rectangle.bottom,
							viewport.height,
							alignment.block,
						),
				),
			),
		});
	}
	*action(id: number, argument?: unknown): EventAction<ScrollIntoViewResult> {
		const plan = this.plan(id, argument);
		const reference = this.tree.reference(id);
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
		const changed = owner.to(plan.left, plan.top);
		if (changed)
			yield {
				target: this.tree.root,
				event: new BrowserEvent("scroll", { bubbles: true }),
			};
		const scroll = owner.get();
		return {
			reference,
			revision: this.tree.revision,
			hasBox: true,
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
