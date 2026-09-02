import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import type { StorageArea, StorageMutation } from "./storage.js";

type Change = Pick<
	StorageMutation,
	"kind" | "key" | "oldValue" | "newValue" | "url"
>;

export class BrowserStorageEvent extends BrowserEvent {
	readonly key: string | null;
	readonly oldValue: string | null;
	readonly newValue: string | null;
	readonly url: string;
	readonly storageKind: "local" | "session";
	constructor(
		change: Change,
		readonly storageArea: StorageArea,
	) {
		super("storage");
		this.key = change.key;
		this.oldValue = change.oldValue;
		this.newValue = change.newValue;
		this.url = change.url;
		this.storageKind = change.kind;
		Object.freeze(this);
	}
}

interface Recipient {
	document: DocumentTree;
	tabId: string;
	origin: string;
	events: DocumentEvents;
	area: (kind: "local" | "session") => StorageArea;
	active: boolean;
	unregister: () => unknown;
}
interface Notification {
	recipient: Recipient;
	change: Change;
	bytes: number;
}
const maximum = {
	maxDocuments: 256,
	maxPending: 128,
	maxPendingBytes: 1_048_576,
	maxEvents: 4096,
};

export class PageStorageEvents {
	private readonly recipients = new Map<DocumentTree, Recipient>();
	private readonly queue: Notification[] = [];
	private readonly limits: typeof maximum;
	private running?: { notification: Notification; controller: AbortController };
	private timer?: ReturnType<typeof setTimeout>;
	private closed = false;
	private accepted = 0;
	private delivered = 0;
	private canceled = 0;
	private dropped = 0;
	private failed = 0;
	private retainedBytes = 0;
	private peakBytes = 0;

	constructor(limits: Partial<typeof maximum> = {}) {
		this.limits = { ...maximum, ...limits };
		for (const [name, value] of Object.entries(this.limits))
			if (
				!Object.hasOwn(maximum, name) ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > maximum[name as keyof typeof maximum]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid storage event limits",
				);
	}

	register(
		document: DocumentTree,
		tabId: string,
		events: DocumentEvents,
		area: Recipient["area"],
	) {
		this.ensureOpen();
		document.get(document.root);
		if (
			this.recipients.has(document) ||
			events.documentRoot !== document.root ||
			typeof tabId !== "string" ||
			!tabId ||
			tabId.length > 64 ||
			typeof area !== "function"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid storage event document",
			);
		if (this.recipients.size >= this.limits.maxDocuments)
			throw new AgentBrowserError(
				"resource-limit",
				"Storage event document limit exceeded",
			);
		const recipient: Recipient = {
			document,
			tabId,
			events,
			area,
			origin: new URL(document.url).origin,
			active: false,
			unregister: document.onClose(() => this.retire(document)),
		};
		this.recipients.set(document, recipient);
	}

	activate(document: DocumentTree) {
		this.ensureOpen();
		const recipient = this.recipients.get(document);
		if (!recipient)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing storage event document",
			);
		recipient.active = true;
		this.schedule();
	}

	publish(mutation: StorageMutation) {
		if (this.closed) return;
		const change: Change = Object.freeze({
			kind: mutation.kind,
			key: mutation.key,
			oldValue: mutation.oldValue,
			newValue: mutation.newValue,
			url: mutation.url,
		});
		const bytes =
			64 +
			2 *
				(change.url.length +
					(change.key?.length ?? 0) +
					(change.oldValue?.length ?? 0) +
					(change.newValue?.length ?? 0));
		for (const recipient of this.recipients.values()) {
			if (
				recipient.document === mutation.source ||
				recipient.origin !== mutation.origin ||
				(mutation.kind === "session" && recipient.tabId !== mutation.tabId)
			)
				continue;
			if (
				this.accepted >= this.limits.maxEvents ||
				this.queue.length + Number(!!this.running) >= this.limits.maxPending ||
				this.retainedBytes + bytes > this.limits.maxPendingBytes
			) {
				this.dropped++;
				continue;
			}
			this.queue.push({ recipient, change, bytes });
			this.accepted++;
			this.retainedBytes += bytes;
			this.peakBytes = Math.max(this.peakBytes, this.retainedBytes);
		}
		this.schedule();
	}

	retire(document: DocumentTree) {
		const recipient = this.recipients.get(document);
		if (!recipient) return;
		this.recipients.delete(document);
		recipient.unregister();
		for (let index = this.queue.length - 1; index >= 0; index--)
			if (this.queue[index].recipient === recipient) {
				const [notification] = this.queue.splice(index, 1);
				this.retainedBytes -= notification.bytes;
				this.canceled++;
			}
		if (this.running?.notification.recipient === recipient)
			this.running.controller.abort();
		this.schedule();
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		if (this.timer !== undefined) clearTimeout(this.timer);
		this.timer = undefined;
		for (const document of this.recipients.keys()) this.retire(document);
	}

	metrics() {
		return Object.freeze({
			documents: this.recipients.size,
			accepted: this.accepted,
			delivered: this.delivered,
			canceled: this.canceled,
			dropped: this.dropped,
			failed: this.failed,
			pending: this.queue.length,
			active: !!this.running,
			retainedBytes: this.retainedBytes,
			peakBytes: this.peakBytes,
			closed: this.closed,
		});
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Storage events are closed");
	}

	private schedule() {
		if (
			this.closed ||
			this.running ||
			this.timer !== undefined ||
			!this.queue.some((notification) => notification.recipient.active)
		)
			return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.dispatch();
		}, 0);
	}

	private async dispatch() {
		if (this.closed || this.running) return;
		const index = this.queue.findIndex(
			(notification) => notification.recipient.active,
		);
		if (index < 0) return;
		const [notification] = this.queue.splice(index, 1);
		const controller = new AbortController();
		this.running = { notification, controller };
		try {
			const { recipient, change } = notification;
			await recipient.events.whenIdle(controller.signal);
			if (
				controller.signal.aborted ||
				this.recipients.get(recipient.document) !== recipient
			)
				throw new AgentBrowserError(
					"closed",
					"Storage event recipient was retired",
				);
			const target = recipient.events.windowTarget;
			if (target === null)
				throw new AgentBrowserError(
					"unsupported",
					"Storage event requires a Window",
				);
			const event = new BrowserStorageEvent(
				change,
				recipient.area(change.kind),
			);
			await recipient.events.dispatchEventAsync(
				target,
				event,
				controller.signal,
			);
			if (controller.signal.aborted)
				throw new AgentBrowserError("aborted", "Storage event canceled");
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
			this.retainedBytes -= notification.bytes;
			this.running = undefined;
			this.schedule();
		}
	}
}
