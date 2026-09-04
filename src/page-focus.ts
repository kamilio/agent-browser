import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { DocumentFocus, ElementFocusOptions } from "./focus.js";
import type { RootScrollRequest } from "./root-scroll.js";

export type PageFocusOperation = (...args: readonly unknown[]) => unknown;
export type PageFocusMethods = Record<"focus" | "blur", PageFocusOperation>;
export type PageFocusRegistration = <Operation extends PageFocusOperation>(
	operation: Operation,
) => Operation;

export const pageFocusLimits = Object.freeze({ maxBindings: 4096 });

export interface PageFocusBridgeOptions {
	document: DocumentTree;
	register: PageFocusRegistration;
	maxBindings?: number;
}

interface FocusSlot {
	operations?: PageFocusMethods;
	methods: PageFocusMethods;
}

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
	private readonly slots: FocusSlot[] = [];
	private nextSlot = 0;
	private readonly document?: DocumentTree;

	constructor(
		private readonly focus: DocumentFocus,
		private readonly requestScroll?: RootScrollRequest,
		bridge?: PageFocusBridgeOptions,
	) {
		if (!bridge) return;
		const maximum = bridge.maxBindings ?? pageFocusLimits.maxBindings;
		if (
			typeof bridge.register !== "function" ||
			!Number.isSafeInteger(maximum) ||
			maximum < 1 ||
			maximum > pageFocusLimits.maxBindings
		)
			throw new AgentBrowserError("invalid-input", "Invalid page focus bridge");
		this.document = bridge.document;
		try {
			for (let index = 0; index < maximum; index++) {
				const slot: FocusSlot = { methods: {} as PageFocusMethods };
				this.slots.push(slot);
				for (const name of ["focus", "blur"] as const) {
					const operation: PageFocusOperation = (...args) => {
						this.ensureOpen();
						if (!slot.operations)
							throw new AgentBrowserError(
								"invalid-input",
								"Page focus operation is not bound",
							);
						return slot.operations[name](...args);
					};
					if (bridge.register(operation) !== operation)
						throw new AgentBrowserError(
							"unsupported",
							"Focus registration must preserve operation identity",
						);
					slot.methods[name] = operation;
				}
			}
		} catch (error) {
			this.close();
			throw error;
		}
	}

	get synchronousPageMethods() {
		return this.document !== undefined;
	}

	assertDocument(document: DocumentTree) {
		this.ensureOpen();
		if (this.document !== document)
			throw new AgentBrowserError(
				"invalid-input",
				"Page focus bridge belongs to another document",
			);
	}

	bindMethods(operations: PageFocusMethods): PageFocusMethods {
		this.ensureOpen();
		if (!this.synchronousPageMethods)
			throw new AgentBrowserError(
				"unsupported",
				"Synchronous page focus requires public await-result registration",
			);
		const slot = this.slots[this.nextSlot];
		if (!slot)
			throw new AgentBrowserError(
				"resource-limit",
				"Page focus binding limit exceeded",
			);
		if (
			typeof operations.focus !== "function" ||
			typeof operations.blur !== "function"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid guarded focus methods",
			);
		this.nextSlot++;
		slot.operations = operations;
		return slot.methods;
	}

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
		for (const slot of this.slots) slot.operations = undefined;
		this.slots.length = 0;
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page focus is closed");
	}
}
