import { AgentBrowserError } from "./errors.js";
import { type HtmlToken, HtmlTokenizer } from "./html-tokenizer.js";
import {
	resourceLimitDiagnostic,
	resourceLimitError,
} from "./resource-limit.js";

export const htmlTokenCursorLimits = Object.freeze({
	maxSourceCodeUnits: 4_000_000,
	maxWindowCodeUnits: 65_536,
	maxWorkUnits: 32_000_000,
	maxOperations: 200_000,
	maxIssues: 1_024,
	timeoutMs: 120_000,
});

export type HtmlTokenCursorLimits = {
	-readonly [Name in keyof typeof htmlTokenCursorLimits]: number;
};

export type HtmlTokenCursorOptions = Partial<HtmlTokenCursorLimits>;

export interface HtmlTokenCursorWindowDiagnostic {
	readonly kind: "html-cursor-window";
	readonly operation: "next" | "raw" | "remainder";
	readonly position: number;
	readonly positionSemantics: "last-committed-source-utf16";
}

const windowDiagnostics = new WeakMap<
	object,
	Readonly<HtmlTokenCursorWindowDiagnostic>
>();

export function htmlTokenCursorWindowDiagnostic(
	error: unknown,
): Readonly<HtmlTokenCursorWindowDiagnostic> | undefined {
	if (
		error === null ||
		(typeof error !== "object" && typeof error !== "function")
	)
		return undefined;
	return windowDiagnostics.get(error);
}

function invalidCursor() {
	return new AgentBrowserError(
		"invalid-input",
		"Invalid HTML token cursor input",
	);
}

function cursorLimits(options: HtmlTokenCursorOptions) {
	try {
		if (
			options === null ||
			typeof options !== "object" ||
			Array.isArray(options)
		)
			throw invalidCursor();
		const prototype = Object.getPrototypeOf(options);
		if (prototype !== Object.prototype && prototype !== null)
			throw invalidCursor();
		const selected: HtmlTokenCursorLimits = { ...htmlTokenCursorLimits };
		for (const key of Reflect.ownKeys(options)) {
			if (typeof key !== "string" || !Object.hasOwn(selected, key))
				throw invalidCursor();
			const descriptor = Object.getOwnPropertyDescriptor(options, key);
			if (!descriptor || !Object.hasOwn(descriptor, "value"))
				throw invalidCursor();
			const name = key as keyof HtmlTokenCursorLimits;
			const value: unknown = descriptor.value;
			if (
				typeof value !== "number" ||
				!Number.isSafeInteger(value) ||
				value < (name === "maxIssues" ? 0 : 1) ||
				value > htmlTokenCursorLimits[name]
			)
				throw invalidCursor();
			selected[name] = value;
		}
		return Object.freeze(selected);
	} catch {
		throw invalidCursor();
	}
}

interface CursorRead<Value> {
	value: Value;
	position: number;
}

export class HtmlTokenCursor {
	readonly limits: Readonly<HtmlTokenCursorLimits>;
	private source: string;
	private readonly sourceLength: number;
	private readonly deadline: number;
	private cursorPosition = 0;
	private chargedWork = 0;
	private chargedOperations = 0;
	private chargedIssues = 0;
	private stopped = false;
	private busy = false;
	private window?: HtmlTokenizer;
	private windowStart = 0;
	private windowEnd = 0;

	constructor(
		source: string,
		private readonly onIssue: (code: string) => void,
		options: HtmlTokenCursorOptions = {},
		private readonly signal?: AbortSignal,
	) {
		const started = performance.now();
		this.limits = cursorLimits(options);
		Object.defineProperty(this, "limits", {
			value: this.limits,
			writable: false,
			configurable: false,
			enumerable: true,
		});
		if (typeof source !== "string" || typeof onIssue !== "function")
			throw invalidCursor();
		if (source.length > this.limits.maxSourceCodeUnits)
			throw resourceLimitError(
				"html.cursor-source",
				this.limits.maxSourceCodeUnits,
				source.length,
				"HTML cursor source limit exceeded",
			);
		this.source = source;
		this.sourceLength = source.length;
		this.deadline = started + this.limits.timeoutMs;
		try {
			this.checkpoint();
		} catch (error) {
			this.close();
			throw error;
		}
	}

	get position() {
		return this.cursorPosition;
	}

	get workUnits() {
		return this.chargedWork;
	}

	get operations() {
		return this.chargedOperations;
	}

	get issueCount() {
		return this.chargedIssues;
	}

	get closed() {
		return this.stopped;
	}

	close() {
		this.stopped = true;
		this.source = "";
		this.window = undefined;
	}

	next(): HtmlToken | undefined {
		return this.perform(() => {
			if (this.cursorPosition === this.sourceLength)
				return { value: undefined, position: this.cursorPosition };
			let native = this.window;
			if (
				!native ||
				this.windowStart + native.position !== this.cursorPosition ||
				this.windowEnd === this.cursorPosition
			)
				native = this.createWindow();
			let value = this.invoke(native, (tokenizer) => tokenizer.next());
			if (native.paused) {
				if (this.windowStart === this.cursorPosition) this.windowLimit("next");
				native = this.createWindow();
				value = this.invoke(native, (tokenizer) => tokenizer.next());
				if (native.paused) this.windowLimit("next");
			}
			return { value, position: this.windowStart + native.position };
		});
	}

	raw(name: string, entities = false): string {
		return this.perform(() => {
			if (
				typeof name !== "string" ||
				!/^[a-z][a-z0-9-]{0,31}$/.test(name) ||
				typeof entities !== "boolean"
			)
				throw invalidCursor();
			const native = this.createWindow();
			const value = this.invoke(native, (tokenizer) =>
				tokenizer.raw(name, entities),
			);
			if (native.paused) this.windowLimit("raw");
			if (value === undefined) throw invalidCursor();
			return { value, position: this.windowStart + native.position };
		});
	}

	remainder(): string {
		return this.perform(() => {
			const remaining = this.sourceLength - this.cursorPosition;
			if (remaining > this.limits.maxWindowCodeUnits)
				this.windowLimit("remainder", remaining);
			const native = this.createWindow();
			const value = this.invoke(native, (tokenizer) => tokenizer.remainder());
			return { value, position: this.windowStart + native.position };
		});
	}

	private checkpoint() {
		if (this.stopped)
			throw new AgentBrowserError("closed", "HTML token cursor is closed");
		if (this.signal?.aborted)
			throw new AgentBrowserError("aborted", "HTML token cursor aborted");
		if (performance.now() >= this.deadline)
			throw new AgentBrowserError(
				"timeout",
				"HTML token cursor deadline exceeded",
			);
	}

	private checkWork() {
		if (this.chargedWork > this.limits.maxWorkUnits)
			throw resourceLimitError(
				"html.cursor-work",
				this.limits.maxWorkUnits,
				this.chargedWork,
				"HTML cursor work limit exceeded",
			);
	}

	private windowLimit(
		operation: HtmlTokenCursorWindowDiagnostic["operation"],
		requested = this.limits.maxWindowCodeUnits + 1,
	): never {
		const error = resourceLimitError(
			"html.cursor-window",
			this.limits.maxWindowCodeUnits,
			requested,
			"HTML cursor input window limit exceeded",
		);
		const position = this.cursorPosition;
		if (
			resourceLimitDiagnostic(error)?.kind === "html.cursor-window" &&
			(operation === "next" ||
				operation === "raw" ||
				operation === "remainder") &&
			Number.isSafeInteger(position) &&
			position >= 0 &&
			position <= htmlTokenCursorLimits.maxSourceCodeUnits
		)
			windowDiagnostics.set(
				error,
				Object.freeze({
					kind: "html-cursor-window",
					operation,
					position,
					positionSemantics: "last-committed-source-utf16",
				}),
			);
		throw error;
	}

	private createWindow() {
		this.checkpoint();
		const length = Math.min(
			this.sourceLength - this.cursorPosition,
			this.limits.maxWindowCodeUnits,
		);
		this.chargedWork += length;
		this.checkWork();
		const start = this.cursorPosition;
		const input = this.source.slice(start, start + length);
		const onIssue = this.onIssue;
		const native = new HtmlTokenizer(
			input,
			(code) => {
				this.checkpoint();
				onIssue(code);
				this.checkpoint();
			},
			this.limits.maxIssues - this.chargedIssues,
		);
		if (start + length < this.sourceLength) native.setBoundary(length);
		this.window = native;
		this.windowStart = start;
		this.windowEnd = start + length;
		this.checkpoint();
		return native;
	}

	private invoke<Value>(
		native: HtmlTokenizer,
		read: (tokenizer: HtmlTokenizer) => Value,
	): Value {
		const beforeWork = native.workUnits;
		const beforeIssues = native.issueCount;
		let value: Value | undefined;
		let failed = false;
		let failure: unknown;
		try {
			value = read(native);
		} catch (error) {
			failed = true;
			failure = error;
		} finally {
			this.chargedWork += native.workUnits - beforeWork;
			this.chargedIssues += native.issueCount - beforeIssues;
		}
		if (failed) {
			if (
				this.chargedIssues > this.limits.maxIssues &&
				resourceLimitDiagnostic(failure)?.kind === "html.issues"
			)
				throw resourceLimitError(
					"html.issues",
					this.limits.maxIssues,
					this.chargedIssues,
					"HTML cursor issue limit exceeded",
				);
			throw failure;
		}
		this.checkpoint();
		this.checkWork();
		return value as Value;
	}

	private perform<Value>(read: () => CursorRead<Value>): Value {
		if (this.busy) {
			this.close();
			throw new AgentBrowserError(
				"invalid-input",
				"HTML token cursor cannot be reentered",
			);
		}
		this.busy = true;
		try {
			this.checkpoint();
			this.chargedOperations++;
			if (this.chargedOperations > this.limits.maxOperations)
				throw resourceLimitError(
					"html.cursor-operations",
					this.limits.maxOperations,
					this.chargedOperations,
					"HTML cursor operation limit exceeded",
				);
			const result = read();
			this.checkpoint();
			this.checkWork();
			this.cursorPosition = result.position;
			return result.value;
		} catch (error) {
			this.close();
			throw error;
		} finally {
			this.busy = false;
		}
	}
}
