import type { StyleViewport } from "./css-parser.js";
import { compileCssMedia, type CompiledCssMedia } from "./css-media.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import { BrowserMediaQueryListEvent } from "./media-query-event.js";
import { domString, type ScriptHostObjectFactory } from "./script-dom.js";
import type { ScriptEventBindings } from "./script-events.js";
import { documentStyles } from "./styles.js";

export const pageMediaLimits = Object.freeze({
	maxLists: 256,
	maxQueryCodeUnits: 4096,
	maxRetainedCodeUnits: 65536,
	maxEvents: 4096,
	maxTurns: 4096,
});
interface MediaList {
	media: string;
	query: CompiledCssMedia;
	target: number;
	reported: boolean;
}

export class PageMedia {
	private readonly styles;
	private readonly records: MediaList[] = [];
	private readonly unregisterMedia: () => void;
	private readonly unregisterClose: () => unknown;
	private timer?: ReturnType<typeof setTimeout>;
	private controller?: AbortController;
	private previousViewport: Readonly<StyleViewport>;
	private dirty = false;
	private running = false;
	private closed = false;
	private retainedCodeUnits = 0;
	private eventsDelivered = 0;
	private turns = 0;
	private invalidOrUnsupportedQueries = 0;

	constructor(
		tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		private readonly events: DocumentEvents,
		private readonly bindings: ScriptEventBindings,
		private readonly fail: (error: unknown) => void,
	) {
		if (events.documentRoot !== tree.root || events.windowTarget === null)
			throw new AgentBrowserError(
				"invalid-input",
				"Media queries require the document Window dispatcher",
			);
		this.styles = documentStyles(tree);
		this.previousViewport = this.styles.viewport;
		this.unregisterMedia = this.styles.onMediaChange(() => {
			this.dirty = true;
			this.schedule();
		});
		try {
			this.unregisterClose = tree.onClose(() => this.close());
		} catch (error) {
			this.unregisterMedia();
			throw error;
		}
	}

	get width() {
		this.ensureOpen();
		return this.styles.viewport.width;
	}
	get height() {
		this.ensureOpen();
		return this.styles.viewport.height;
	}

	matchMedia(...args: unknown[]): object {
		this.ensureOpen();
		if (!args.length) throw new TypeError("matchMedia requires a query");
		const source = domString(args[0]);
		if (
			source.length > pageMediaLimits.maxQueryCodeUnits ||
			this.records.length >= pageMediaLimits.maxLists
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Media query list limit exceeded",
			);
		const query = compileCssMedia(source);
		const { media, unsupported } = query;
		if (
			this.retainedCodeUnits + media.length >
			pageMediaLimits.maxRetainedCodeUnits
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Media query text limit exceeded",
			);
		const record: MediaList = {
			media,
			query,
			target: this.events.createIndependentTarget(),
			reported: query.matches(this.styles.mediaEnvironment),
		};
		const read = () => {
			this.ensureOpen();
			return record;
		};
		const readonly = () => {
			this.ensureOpen();
			throw new TypeError("Media query properties are read-only");
		};
		const type = (values: readonly unknown[]) => {
			this.ensureOpen();
			if (values.length < 2)
				throw new TypeError("Media query listener requires type and callback");
			return domString(values[0]);
		};
		const object = this.factory.createHostObject({
			properties: {
				media: { get: () => read().media, set: readonly },
				matches: {
					get: () => read().query.matches(this.styles.mediaEnvironment),
					set: readonly,
				},
				onchange: {
					get: () => this.bindings.getHandler(read().target, "change"),
					set: (value) =>
						this.bindings.setHandler(read().target, "change", value),
				},
			},
			methods: {
				addEventListener: (...values) =>
					this.bindings.add(record.target, type(values), values[1], values[2]),
				removeEventListener: (...values) =>
					this.bindings.remove(
						record.target,
						type(values),
						values[1],
						values[2],
					),
				addListener: (...values) => {
					read();
					if (!values.length)
						throw new TypeError("addListener requires a callback");
					this.bindings.add(record.target, "change", values[0], undefined);
				},
				removeListener: (...values) => {
					read();
					if (!values.length)
						throw new TypeError("removeListener requires a callback");
					this.bindings.remove(record.target, "change", values[0], undefined);
				},
			},
		});
		this.bindings.bindIndependentTarget(record.target, object);
		this.records.push(record);
		this.retainedCodeUnits += media.length;
		if (unsupported) this.invalidOrUnsupportedQueries++;
		return object;
	}

	metrics() {
		return Object.freeze({
			partial: true,
			lists: this.records.length,
			retainedCodeUnits: this.retainedCodeUnits,
			invalidOrUnsupportedQueries: this.invalidOrUnsupportedQueries,
			eventsDelivered: this.eventsDelivered,
			turns: this.turns,
			queued: this.timer !== undefined,
			running: this.running,
			closed: this.closed,
			limits: pageMediaLimits,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		if (this.timer !== undefined) clearTimeout(this.timer);
		this.timer = undefined;
		this.controller?.abort();
		this.unregisterMedia();
		this.unregisterClose?.();
		for (const record of this.records)
			this.bindings.unbindIndependentTarget(record.target);
		this.records.length = 0;
		this.retainedCodeUnits = 0;
		this.dirty = false;
	}

	private schedule() {
		if (this.closed || this.running || this.timer !== undefined) return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.deliver().catch((error) => {
				if (!this.closed) {
					this.close();
					this.fail(error);
				}
			});
		}, 0);
	}
	private async deliver() {
		if (this.closed) return;
		if (++this.turns > pageMediaLimits.maxTurns)
			throw new AgentBrowserError(
				"resource-limit",
				"Media query update turn limit exceeded",
			);
		this.running = true;
		this.dirty = false;
		const controller = new AbortController();
		this.controller = controller;
		try {
			const viewport = this.styles.viewport;
			const changed =
				viewport.width !== this.previousViewport.width ||
				viewport.height !== this.previousViewport.height;
			this.previousViewport = viewport;
			const batch = [...this.records];
			if (changed)
				await this.dispatch(
					this.events.windowTarget as number,
					new BrowserEvent("resize"),
					controller.signal,
				);
			for (const record of batch) {
				if (this.closed) return;
				const matches = record.query.matches(this.styles.mediaEnvironment);
				if (matches === record.reported) continue;
				record.reported = matches;
				await this.dispatch(
					record.target,
					new BrowserMediaQueryListEvent(record.media, matches),
					controller.signal,
				);
			}
		} finally {
			this.running = false;
			this.controller = undefined;
			if (this.dirty && !this.closed) this.schedule();
		}
	}
	private async dispatch(
		target: number,
		event: BrowserEvent,
		signal: AbortSignal,
	) {
		if (this.eventsDelivered >= pageMediaLimits.maxEvents)
			throw new AgentBrowserError(
				"resource-limit",
				"Media query event limit exceeded",
			);
		this.eventsDelivered++;
		await this.events.whenIdle(signal);
		await this.events.dispatchEventAsync(target, event, signal);
	}
	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page media queries are closed");
	}
}
