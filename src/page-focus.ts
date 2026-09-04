import { AgentBrowserError } from "./errors.js";
import type { DocumentFocus, ElementFocusOptions } from "./focus.js";
import type { RootScrollRequest } from "./root-scroll.js";

export const pageFocusCapabilities = Object.freeze({
	partial: true,
	synchronousPageMethods: false,
	controlledListeners: "async-host-actions-only",
	options: "own-data-dictionary",
	scroll: "instant-center-center-root-only",
	indication: "explicit-until-next-input-modality-or-focus-transition",
});

export function pageFocusOptions(argument?: unknown): ElementFocusOptions {
	if (argument === undefined || argument === null) return {};
	if (typeof argument !== "object" && typeof argument !== "function")
		throw new TypeError("Focus options require a dictionary");
	if (
		typeof argument !== "object" ||
		Array.isArray(argument) ||
		![Object.prototype, null].includes(Object.getPrototypeOf(argument))
	)
		throw new AgentBrowserError(
			"unsupported",
			"Focus options require an own-data dictionary",
		);
	const result: ElementFocusOptions = {};
	for (const property of ["focusVisible", "preventScroll"] as const) {
		const descriptor = Object.getOwnPropertyDescriptor(argument, property);
		if (!descriptor) continue;
		if (!Object.hasOwn(descriptor, "value"))
			throw new AgentBrowserError(
				"unsupported",
				"Focus option accessors are not implemented",
			);
		if (descriptor.value !== undefined)
			result[property] = Boolean(descriptor.value);
	}
	return result;
}

export class PageFocus {
	private closed = false;
	private readonly controller = new AbortController();

	constructor(
		private readonly focus: DocumentFocus,
		private readonly requestScroll?: RootScrollRequest,
	) {}

	async focusAsync(id: number, argument?: unknown): Promise<void> {
		this.ensureOpen();
		return this.focus.focusElementAsync(
			id,
			pageFocusOptions(argument),
			this.requestScroll,
			this.controller.signal,
		);
	}

	async blurAsync(id: number): Promise<void> {
		this.ensureOpen();
		return this.focus.blurElementAsync(id, this.controller.signal);
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.controller.abort();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page focus is closed");
	}
}
