import { AgentBrowserError } from "./errors.js";
import type { DocumentTree } from "./document.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";

export class BrowserDetailsToggleEvent extends BrowserEvent {
	readonly source = null;
	constructor(
		readonly oldState: string,
		readonly newState: string,
	) {
		super("toggle");
		Object.freeze(this);
	}
}

interface Notification {
	target: number;
	oldState: string;
	newState: string;
}

export const detailsToggleLimits = Object.freeze({
	maxPending: 512,
	maxTasks: 4096,
});

export class DetailsToggleTasks {
	private readonly queue = new Set<Notification>();
	private readonly trackers = new Map<number, Notification>();
	private events?: DocumentEvents;
	private timer?: ReturnType<typeof setTimeout>;
	private controller?: AbortController;
	private closed = false;
	private scheduled = 0;
	private delivered = 0;
	private coalesced = 0;
	private canceled = 0;
	private failed = 0;

	constructor(private readonly tree: DocumentTree) {}

	connect(events: DocumentEvents) {
		if (events.documentRoot !== this.tree.root)
			throw new AgentBrowserError(
				"invalid-input",
				"Disclosure dispatcher belongs to another document",
			);
		if (this.closed || events.metrics().closed)
			throw new AgentBrowserError(
				"closed",
				"Disclosure notifications are closed",
			);
		if (this.events && !this.events.metrics().closed && this.events !== events)
			return;
		this.events = events;
	}

	disconnect(events: DocumentEvents) {
		if (this.events !== events) return;
		this.events = undefined;
		this.cancel();
	}

	checkAdditional(count: number) {
		if (!Number.isSafeInteger(count) || count < 0)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid disclosure notification count",
			);
		if (this.closed)
			throw new AgentBrowserError(
				"closed",
				"Disclosure notifications are closed",
			);
		if (
			this.queue.size + count > detailsToggleLimits.maxPending ||
			this.scheduled + count > detailsToggleLimits.maxTasks
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Disclosure notification limit exceeded",
			);
	}

	check(target: number, previous: boolean, next: boolean) {
		if (this.closed)
			throw new AgentBrowserError(
				"closed",
				"Disclosure notifications are closed",
			);
		if (previous === next) return;
		const tracked = this.trackers.get(target);
		if (
			this.scheduled >= detailsToggleLimits.maxTasks ||
			(this.queue.size >= detailsToggleLimits.maxPending &&
				(!tracked || !this.queue.has(tracked)))
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Disclosure notification limit exceeded",
			);
	}

	record(target: number, previous: boolean, next: boolean) {
		this.check(target, previous, next);
		if (previous === next) return;
		const tracked = this.trackers.get(target);
		const notification: Notification = {
			target,
			oldState: tracked?.oldState ?? (previous ? "open" : "closed"),
			newState: next ? "open" : "closed",
		};
		if (tracked) {
			this.queue.delete(tracked);
			this.coalesced++;
		}
		this.queue.add(notification);
		this.trackers.set(target, notification);
		this.scheduled++;
		this.schedule();
	}

	metrics() {
		return Object.freeze({
			pending: this.queue.size,
			active: !!this.controller,
			scheduled: this.scheduled,
			delivered: this.delivered,
			coalesced: this.coalesced,
			canceled: this.canceled,
			failed: this.failed,
			closed: this.closed,
			limits: detailsToggleLimits,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.events = undefined;
		this.cancel();
	}

	private cancel() {
		if (this.timer !== undefined) clearTimeout(this.timer);
		this.timer = undefined;
		this.canceled += this.queue.size;
		this.queue.clear();
		this.trackers.clear();
		this.controller?.abort();
	}

	private schedule() {
		if (
			this.closed ||
			this.timer !== undefined ||
			this.controller ||
			!this.queue.size
		)
			return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.dispatch();
		}, 0);
	}

	private async dispatch() {
		if (this.closed || this.controller || !this.queue.size) return;
		const controller = new AbortController();
		this.controller = controller;
		let notification: Notification | undefined;
		try {
			const events = this.events;
			if (events && !events.metrics().closed)
				await events.whenIdle(controller.signal);
			if (controller.signal.aborted || this.closed) return;
			notification = this.queue.values().next().value;
			if (!notification) return;
			this.queue.delete(notification);
			if (!events || events !== this.events || events.metrics().closed) {
				this.canceled++;
				return;
			}
			await events.dispatchEventAsync(
				notification.target,
				new BrowserDetailsToggleEvent(
					notification.oldState,
					notification.newState,
				),
				controller.signal,
			);
			this.delivered++;
		} catch (error) {
			if (
				controller.signal.aborted ||
				(error instanceof AgentBrowserError &&
					(error.code === "closed" || error.code === "aborted"))
			)
				this.canceled++;
			else this.failed++;
		} finally {
			if (notification) this.trackers.delete(notification.target);
			this.controller = undefined;
			this.schedule();
		}
	}
}
