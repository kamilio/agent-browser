import { documentScroll } from "./document-scroll.js";
import { documentElementScroll } from "./element-scroll.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { scrollArguments, scrollCoordinate } from "./page-scroll.js";
import { documentStyles } from "./styles.js";
import { documentScrollIntoView } from "./scroll-into-view.js";

export const rootScrollProperties = Object.freeze([
	"scrollTop",
	"scrollLeft",
	"scrollWidth",
	"scrollHeight",
] as const);
export type RootScrollProperty = (typeof rootScrollProperties)[number];
export interface ScrollPositionRequest {
	left?: number;
	top?: number;
	target?: number;
	elements?: readonly { target: number; left: number; top: number }[];
}
export type RootScrollRequest = (position: ScrollPositionRequest) => void;
export const rootScrollCapabilities = Object.freeze({
	partial: true,
	profile: "standards-normal-flow-ltr-root",
	documentScrollingElement: true,
	properties: rootScrollProperties,
	notifications: "shared-programmatic-scroll-queue",
	connectedNonRoot: "normal-flow-overflow-scrollports",
	quirks: false,
	nestedScrolling: true,
	smooth: false,
});

export class RootScroll {
	constructor(
		private readonly tree: DocumentTree,
		private readonly request?: RootScrollRequest,
	) {}
	element(): number | null {
		return (
			this.tree
				.get(this.tree.root)
				.children.find((id) => this.tree.get(id).kind === "element") ?? null
		);
	}
	get(id: number, property: RootScrollProperty): number {
		if (!this.root(id))
			return documentElementScroll(this.tree).get(id)[property];
		const owner = documentScroll(this.tree);
		if (property === "scrollTop") return owner.get().y;
		if (property === "scrollLeft") return owner.get().x;
		const bounds = owner.bounds();
		const viewport = documentStyles(this.tree).viewport;
		return Math.round(
			property === "scrollWidth"
				? viewport.width + bounds.x
				: viewport.height + bounds.y,
		);
	}
	set(id: number, property: "scrollTop" | "scrollLeft", value: unknown): void {
		this.tree.get(id);
		const coordinate = scrollCoordinate(value);
		this.position(
			id,
			property === "scrollTop" ? { top: coordinate } : { left: coordinate },
		);
	}
	scroll(
		id: number,
		relative: boolean,
		args: readonly unknown[],
	): Promise<void> {
		this.tree.get(id);
		this.position(id, scrollArguments(args), relative);
		return Promise.resolve();
	}
	private position(
		id: number,
		position: { left?: number; top?: number },
		relative = false,
	): void {
		if (!this.root(id)) {
			const owner = documentElementScroll(this.tree);
			const current = owner.get(id);
			const bounds = owner.bounds(id);
			const left = Math.max(
				0,
				Math.min(
					relative
						? current.scrollLeft + (position.left ?? 0)
						: (position.left ?? current.scrollLeft),
					bounds.x,
				),
			);
			const top = Math.max(
				0,
				Math.min(
					relative
						? current.scrollTop + (position.top ?? 0)
						: (position.top ?? current.scrollTop),
					bounds.y,
				),
			);
			if (left === current.scrollLeft && top === current.scrollTop) return;
			if (!this.request)
				throw new AgentBrowserError(
					"unsupported",
					"Element scrolling requires a page scrolling host port",
				);
			this.request({ target: id, left, top });
			return;
		}
		if (!this.request)
			throw new AgentBrowserError(
				"unsupported",
				"Root scroll setters require a page scrolling host port",
			);
		if (relative) {
			const owner = documentScroll(this.tree);
			const current = owner.get();
			const bounds = owner.bounds();
			position = {
				left: Math.max(0, Math.min(current.x + (position.left ?? 0), bounds.x)),
				top: Math.max(0, Math.min(current.y + (position.top ?? 0), bounds.y)),
			};
		}
		this.request(position);
	}
	intoView(id: number, argument?: unknown): Promise<void> {
		const position = documentScrollIntoView(this.tree).plan(id, argument);
		if (position) {
			if (!this.request)
				throw new AgentBrowserError(
					"unsupported",
					"Scroll into view requires a page scrolling host port",
				);
			this.request(position);
		}
		return Promise.resolve();
	}
	private root(id: number): boolean {
		if (this.tree.get(id).kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Scroll properties require an element",
			);
		if (!this.tree.isConnected(id)) return false;
		return id === this.element();
	}
}
