import type { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";

const errorCodes = new Set<ErrorCode>([
	"invalid-input",
	"stale-reference",
	"not-found",
	"not-actionable",
	"policy-denied",
	"resource-limit",
	"unsupported",
	"network-error",
	"timeout",
	"aborted",
	"closed",
]);

export type PageNavigationTask =
	| { kind: "traverse"; delta: number }
	| { kind: "navigate"; url: string; replace: boolean }
	| { kind: "fragment"; run: (signal: AbortSignal) => Promise<unknown> };

interface Traversal {
	sequence: number;
	document: DocumentTree;
	action: PageNavigationTask;
}
export class PageTraversals {
	private readonly queue: Traversal[] = [];
	private document?: DocumentTree;
	private active?: { task: Traversal; controller: AbortController };
	private timer?: ReturnType<typeof setTimeout>;
	private closed = false;
	private accepted = 0;
	private completed = 0;
	private canceled = 0;
	private failed = 0;
	private last?: {
		sequence: number;
		kind: PageNavigationTask["kind"];
		delta?: number;
		outcome: "complete" | "canceled" | "failed";
		code?: ErrorCode;
	};
	private readonly limits: { maxPending: number; maxRequests: number };

	constructor(
		private readonly run: (
			document: DocumentTree,
			action: PageNavigationTask,
			signal: AbortSignal,
		) => Promise<unknown>,
		private readonly onError: (
			document: DocumentTree,
			code: ErrorCode,
		) => void = () => {},
		limits: Partial<{ maxPending: number; maxRequests: number }> = {},
	) {
		this.limits = { maxPending: 8, maxRequests: 256, ...limits };
		for (const [name, value] of Object.entries(this.limits))
			if (
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > (name === "maxPending" ? 8 : name === "maxRequests" ? 256 : 0)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid page traversal limits",
				);
	}

	enqueue(document: DocumentTree, delta: number) {
		if (!Number.isInteger(delta) || delta < -2147483648 || delta > 2147483647)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page traversal delta",
			);
		this.admit(document);
		this.push(document, { kind: "traverse", delta });
	}

	enqueueNavigation(document: DocumentTree, url: string, replace: boolean) {
		if (
			typeof url !== "string" ||
			url.length > 16_384 ||
			typeof replace !== "boolean"
		)
			throw new AgentBrowserError("invalid-input", "Invalid page navigation");
		this.admit(document);
		this.push(document, { kind: "navigate", url, replace });
	}

	enqueueFragment(
		document: DocumentTree,
		prepare: () => (signal: AbortSignal) => Promise<unknown>,
	) {
		this.admit(document);
		const run = prepare();
		this.push(document, { kind: "fragment", run });
	}

	private admit(document: DocumentTree) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page traversal queue is closed");
		document.get(document.root);
		if (
			this.accepted >= this.limits.maxRequests ||
			this.queue.length + Number(!!this.active) >= this.limits.maxPending
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Page traversal limit exceeded",
			);
	}

	private push(document: DocumentTree, action: PageNavigationTask) {
		this.queue.push({ document, action, sequence: ++this.accepted });
		this.schedule();
	}

	private identity(task: Traversal) {
		return {
			sequence: task.sequence,
			kind: task.action.kind,
			...(task.action.kind === "traverse" ? { delta: task.action.delta } : {}),
		};
	}

	activate(document: DocumentTree) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page traversal queue is closed");
		document.get(document.root);
		this.document = document;
		this.discard((task) => task.document !== document);
		this.schedule();
	}

	retire(document: DocumentTree) {
		this.discard((task) => task.document === document);
		if (this.document === document) {
			this.document = undefined;
			this.active?.controller.abort();
		}
	}

	cancel() {
		this.discard(() => true);
		this.active?.controller.abort();
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.cancel();
		this.document = undefined;
	}

	metrics() {
		return Object.freeze({
			accepted: this.accepted,
			completed: this.completed,
			canceled: this.canceled,
			failed: this.failed,
			pending: this.queue.length,
			active: !!this.active,
			closed: this.closed,
			...(this.last ? { last: Object.freeze({ ...this.last }) } : {}),
		});
	}

	private discard(predicate: (task: Traversal) => boolean) {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		for (let index = this.queue.length - 1; index >= 0; index--)
			if (predicate(this.queue[index])) {
				const [task] = this.queue.splice(index, 1);
				this.canceled++;
				this.last = {
					...this.identity(task),
					outcome: "canceled",
				};
			}
		this.schedule();
	}

	private schedule() {
		if (
			this.closed ||
			this.active ||
			this.timer !== undefined ||
			!this.queue.some((task) => task.document === this.document)
		)
			return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.execute();
		}, 0);
	}

	private async execute() {
		const index = this.queue.findIndex(
			(task) => task.document === this.document,
		);
		if (this.closed || this.active || index < 0) return;
		const [task] = this.queue.splice(index, 1);
		const controller = new AbortController();
		this.active = { task, controller };
		try {
			await this.run(task.document, task.action, controller.signal);
			if (controller.signal.aborted)
				throw new AgentBrowserError("aborted", "Page traversal canceled");
			this.completed++;
			this.last = {
				...this.identity(task),
				outcome: "complete",
			};
		} catch (error) {
			const code =
				error instanceof AgentBrowserError && errorCodes.has(error.code)
					? error.code
					: "unsupported";
			if (
				controller.signal.aborted ||
				code === "aborted" ||
				code === "closed"
			) {
				this.canceled++;
				this.last = {
					...this.identity(task),
					outcome: "canceled",
					code,
				};
			} else {
				this.failed++;
				this.last = {
					...this.identity(task),
					outcome: "failed",
					code,
				};
				try {
					this.onError(task.document, code);
				} catch {}
			}
		} finally {
			this.active = undefined;
			this.schedule();
		}
	}
}
