import { documentScroll } from "./document-scroll.js";
import { documentElementScroll } from "./element-scroll.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import type { ScrollPositionRequest } from "./root-scroll.js";

export const pageScrollLimits = Object.freeze({
	maxRequests: 4096,
	maxEvents: 4096,
});
export const pageScrollCapabilities = Object.freeze({
	partial: true,
	methods: ["scroll", "scrollTo", "scrollBy"],
	behavior: ["auto", "instant"],
	completion: "resolved-promise-after-position-update",
	notifications: "coalesced-programmatic-host-task",
	smooth: false,
	...pageScrollLimits,
});

export function scrollCoordinate(value: unknown) {
	if (
		(typeof value === "object" && value !== null) ||
		typeof value === "function"
	)
		throw new AgentBrowserError(
			"unsupported",
			"Object-to-scroll-coordinate conversion is not implemented",
		);
	const number = +(value as number);
	return Number.isFinite(number) ? number : 0;
}

function dictionary(value: unknown) {
	if (value === undefined || value === null) return {};
	if (typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Scroll options require a dictionary");
	if (![null, Object.prototype].includes(Object.getPrototypeOf(value)))
		throw new AgentBrowserError(
			"unsupported",
			"Inherited scroll options are not implemented",
		);
	const result: Record<string, unknown> = {};
	for (const name of ["behavior", "left", "top"]) {
		const descriptor = Object.getOwnPropertyDescriptor(value, name);
		if (descriptor && !Object.hasOwn(descriptor, "value"))
			throw new AgentBrowserError(
				"unsupported",
				"Scroll option accessors are not implemented",
			);
		result[name] = descriptor?.value;
	}
	return result;
}

export function scrollArguments(args: readonly unknown[]): {
	left?: number;
	top?: number;
} {
	const options =
		args.length >= 2 ? { left: args[0], top: args[1] } : dictionary(args[0]);
	const behavior = "behavior" in options ? options.behavior : undefined;
	if (
		behavior !== undefined &&
		!["auto", "instant", "smooth"].includes(behavior as string)
	)
		throw new TypeError("Invalid scroll behavior");
	if (behavior === "smooth")
		throw new AgentBrowserError(
			"unsupported",
			"Smooth scrolling is not implemented",
		);
	return {
		left:
			options.left === undefined && args.length < 2
				? undefined
				: scrollCoordinate(options.left),
		top:
			options.top === undefined && args.length < 2
				? undefined
				: scrollCoordinate(options.top),
	};
}

export class PageScroll {
	readonly methods = {
		scroll: (...args: unknown[]) => this.request(false, args),
		scrollTo: (...args: unknown[]) => this.request(false, args),
		scrollBy: (...args: unknown[]) => this.request(true, args),
	};
	private requests = 0;
	private delivered = 0;
	private readonly dirty = new Set<number>();
	private running = false;
	private closed = false;
	private timer?: ReturnType<typeof setTimeout>;
	private controller?: AbortController;
	private readonly unregisterClose: () => unknown;
	constructor(
		private readonly tree: DocumentTree,
		private readonly events: DocumentEvents,
		private readonly isBusy: () => boolean,
		private readonly fail: (error: unknown) => void,
	) {
		if (
			events.documentRoot !== tree.root ||
			events.windowTarget === null ||
			events.metrics().closed
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Page scrolling requires the document Window dispatcher",
			);
		this.unregisterClose = tree.onClose(() => this.close());
	}
	private request(relative: boolean, args: unknown[]): Promise<void> {
		this.beginRequest();
		const { left, top } = scrollArguments(args);
		const owner = documentScroll(this.tree);
		const current = owner.get();
		this.move(
			undefined,
			relative ? current.x + (left ?? 0) : left,
			relative ? current.y + (top ?? 0) : top,
		);
		return Promise.resolve();
	}
	requestPosition(position: ScrollPositionRequest): Promise<void> {
		const hasPosition =
			position.target !== undefined ||
			position.left !== undefined ||
			position.top !== undefined ||
			position.elements === undefined;
		this.beginRequest(
			Math.max(1, (position.elements?.length ?? 0) + Number(hasPosition)),
		);
		for (const element of position.elements ?? [])
			this.move(element.target, element.left, element.top);
		if (hasPosition) this.move(position.target, position.left, position.top);
		return Promise.resolve();
	}
	private beginRequest(count = 1) {
		this.ensureOpen();
		this.requests += count;
		if (this.requests > pageScrollLimits.maxRequests)
			throw new AgentBrowserError(
				"resource-limit",
				"Page scroll request limit exceeded",
			);
	}
	private move(target: number | undefined, left?: number, top?: number) {
		const root = this.tree
			.get(this.tree.root)
			.children.find((id) => this.tree.get(id).kind === "element");
		let changed: boolean;
		if (target === undefined || target === root) {
			const owner = documentScroll(this.tree);
			const current = owner.get();
			const bounds = owner.bounds();
			changed = owner.to(
				Math.max(0, Math.min(left ?? current.x, bounds.x)),
				Math.max(0, Math.min(top ?? current.y, bounds.y)),
			);
			target = this.tree.root;
		} else {
			const owner = documentElementScroll(this.tree);
			const current =
				left === undefined || top === undefined ? owner.get(target) : undefined;
			const bounds = owner.bounds(target);
			changed = owner.to(
				target,
				Math.max(0, Math.min(left ?? current?.scrollLeft ?? 0, bounds.x)),
				Math.max(0, Math.min(top ?? current?.scrollTop ?? 0, bounds.y)),
			);
		}
		if (changed) {
			this.dirty.add(target);
			this.wake();
		}
	}
	wake() {
		if (
			this.closed ||
			this.dirty.size === 0 ||
			this.running ||
			this.timer !== undefined ||
			this.isBusy()
		)
			return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			if (this.closed || this.isBusy()) return;
			void this.deliver().catch((error) => {
				if (!this.closed) {
					this.close();
					this.fail(error);
				}
			});
		}, 0);
	}
	metrics() {
		return Object.freeze({
			partial: true,
			requests: this.requests,
			events: this.delivered,
			pending: this.dirty.size > 0,
			queued: this.timer !== undefined,
			running: this.running,
			closed: this.closed,
			limits: pageScrollLimits,
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		if (this.timer !== undefined) clearTimeout(this.timer);
		this.timer = undefined;
		this.dirty.clear();
		this.controller?.abort();
		this.unregisterClose();
	}
	private async deliver() {
		this.ensureOpen();
		this.running = true;
		const controller = new AbortController();
		this.controller = controller;
		try {
			await this.events.whenIdle(controller.signal);
			if (this.closed || this.isBusy()) return;
			const target = this.dirty.values().next().value;
			if (target === undefined) return;
			this.dirty.delete(target);
			if (target !== this.tree.root) {
				try {
					this.tree.resolve(`e${target}`);
				} catch (error) {
					if (
						error instanceof AgentBrowserError &&
						error.code === "stale-reference"
					)
						return;
					throw error;
				}
			}
			if (this.delivered >= pageScrollLimits.maxEvents)
				throw new AgentBrowserError(
					"resource-limit",
					"Page scroll notification limit exceeded",
				);
			this.delivered++;
			await this.events.dispatchEventAsync(
				target,
				new BrowserEvent("scroll", { bubbles: target === this.tree.root }),
				controller.signal,
			);
		} finally {
			this.running = false;
			this.controller = undefined;
			this.wake();
		}
	}
	private ensureOpen() {
		if (this.closed || this.events.metrics().closed)
			throw new AgentBrowserError("closed", "Page scrolling is closed");
	}
}
