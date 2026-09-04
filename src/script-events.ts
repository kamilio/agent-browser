import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type BrowserEvent,
	type BrowserEventListener,
	type BrowserListenerError,
	type BrowserListenerOptions,
	type DocumentEvents,
	controlledEventListener,
} from "./events.js";
import { BrowserFocusEvent } from "./focus.js";
import { BrowserSubmitEvent } from "./form-actions.js";
import { BrowserHashChangeEvent, BrowserPopStateEvent } from "./history.js";
import { BrowserInputEvent } from "./input-events.js";
import { BrowserKeyboardEvent } from "./keyboard.js";
import {
	BrowserMouseEvent,
	BrowserPointerActivationEvent,
	BrowserWheelEvent,
} from "./mouse.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";
import { BrowserStorageEvent } from "./storage-events.js";
import { BrowserMediaQueryListEvent } from "./media-query-event.js";
import { BrowserDetailsToggleEvent } from "./details-toggle.js";

export interface ScriptCallbackRuntime {
	startCallback(
		callback: unknown,
		args: readonly unknown[],
		options: { thisValue: unknown },
	): {
		synchronous: Promise<void>;
		result: Promise<unknown>;
	};
	isClosed(): boolean;
}

export interface ScriptEventOptions {
	events: DocumentEvents;
	callbacks: ScriptCallbackRuntime;
	window?: object;
	storageArea?: (kind: "local" | "session") => object | null;
}

interface ScriptListener {
	handler?: boolean;
	target: number;
	type: string;
	callback: unknown;
	capture: boolean;
	once: boolean;
	listener: BrowserEventListener;
}

export class ScriptEventBindings {
	private records = new Set<ScriptListener>();
	private readonly independentTargets = new Map<number, object>();
	private capabilities = new WeakMap<BrowserEvent, object>();
	private errors: BrowserListenerError[] = [];
	private droppedErrors = 0;
	private closed = false;
	private interrupted = new Set<(error: AgentBrowserError) => void>();

	constructor(
		tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		private readonly node: (target: number) => object,
		private readonly options: ScriptEventOptions,
	) {
		if (options.events.documentRoot !== tree.root)
			throw new AgentBrowserError(
				"invalid-input",
				"Event dispatcher belongs to another document",
			);
		if (
			typeof options.callbacks?.startCallback !== "function" ||
			typeof options.callbacks.isClosed !== "function"
		)
			throw new AgentBrowserError(
				"unsupported",
				"SafeJS callback phases and realm lifecycle are required",
			);
	}

	add(target: number, type: string, callback: unknown, value: unknown) {
		this.ensureOpen();
		const options = listenerOptions(value, true);
		this.checkCallback(callback);
		if (callback == null) return;
		if (this.find(target, type, callback, Boolean(options.capture))) return;
		const record: ScriptListener = {
			target,
			type,
			callback,
			capture: Boolean(options.capture),
			once: Boolean(options.once),
			listener: controlledEventListener((current, event) => {
				if (record.once) this.records.delete(record);
				return this.invoke(record.callback, current, event);
			}),
		};
		this.options.events.addEventListener(
			target,
			type,
			record.listener,
			options,
		);
		this.records.add(record);
	}

	remove(target: number, type: string, callback: unknown, value: unknown) {
		this.ensureOpen();
		const options = listenerOptions(value, false);
		this.checkCallback(callback);
		const record = this.find(target, type, callback, Boolean(options.capture));
		if (!record) return;
		this.options.events.removeEventListener(
			target,
			type,
			record.listener,
			record.capture,
		);
		this.records.delete(record);
	}

	bindIndependentTarget(target: number, object: object) {
		this.ensureOpen();
		if (
			!this.options.events.isIndependentTarget(target) ||
			this.independentTargets.has(target)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid independent event target binding",
			);
		this.independentTargets.set(target, object);
	}

	unbindIndependentTarget(target: number) {
		for (const record of [...this.records])
			if (record.target === target) this.records.delete(record);
		this.independentTargets.delete(target);
		if (!this.options.events.metrics().closed)
			this.options.events.releaseIndependentTarget(target);
	}

	getHandler(target: number, type: string): unknown {
		this.ensureOpen();
		return (
			[...this.records].find(
				(record) =>
					record.handler && record.target === target && record.type === type,
			)?.callback ?? null
		);
	}

	setHandler(target: number, type: string, callback: unknown) {
		this.ensureOpen();
		const previous = [...this.records].find(
			(record) =>
				record.handler && record.target === target && record.type === type,
		);
		if (
			callback === null ||
			(typeof callback !== "function" && typeof callback !== "object")
		) {
			if (previous) {
				this.options.events.removeEventListener(
					target,
					type,
					previous.listener,
				);
				this.records.delete(previous);
			}
			return;
		}
		if (previous) {
			previous.callback = callback;
			return;
		}
		const record: ScriptListener = {
			target,
			type,
			callback,
			capture: false,
			once: false,
			handler: true,
			listener: controlledEventListener((current, event) =>
				typeof record.callback === "function"
					? this.invoke(record.callback, current, event)
					: Promise.resolve(),
			),
		};
		this.options.events.addEventListener(target, type, record.listener);
		this.records.add(record);
	}

	drainErrors(): readonly BrowserListenerError[] {
		const errors = this.errors;
		this.errors = [];
		return Object.freeze(errors);
	}

	metrics() {
		return Object.freeze({
			listeners: this.records.size,
			retainedErrors: this.errors.length,
			droppedErrors: this.droppedErrors,
			closed: this.closed || this.options.events.metrics().closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		const error = new AgentBrowserError(
			"closed",
			"Script event bindings are closed",
		);
		for (const reject of this.interrupted) reject(error);
		this.interrupted.clear();
		if (!this.options.events.metrics().closed)
			for (const record of this.records)
				this.options.events.removeEventListener(
					record.target,
					record.type,
					record.listener,
					record.capture,
				);
		this.records.clear();
		this.independentTargets.clear();
		this.capabilities = new WeakMap();
	}

	private invoke(callback: unknown, target: number, event: BrowserEvent) {
		this.ensureOpen();
		let invocation: ReturnType<ScriptCallbackRuntime["startCallback"]>;
		try {
			invocation = this.options.callbacks.startCallback(
				callback,
				[this.event(event)],
				{ thisValue: this.target(target) },
			);
		} catch (error) {
			this.ensureOpen();
			throw error;
		}
		const checked = invocation.synchronous.then(
			() => this.ensureOpen(),
			(error) => {
				this.ensureOpen();
				throw error;
			},
		);
		const prefix = new Promise<void>((resolve, reject) => {
			const interrupt = (error: AgentBrowserError) => reject(error);
			this.interrupted.add(interrupt);
			checked.then(
				() => {
					this.interrupted.delete(interrupt);
					resolve();
				},
				(error) => {
					this.interrupted.delete(interrupt);
					reject(error);
				},
			);
			if (this.closed || this.options.callbacks.isClosed()) {
				this.interrupted.delete(interrupt);
				this.close();
				reject(
					new AgentBrowserError("closed", "Script event bindings are closed"),
				);
			}
		});
		void invocation.result
			.catch((error) => {
				if (this.options.callbacks.isClosed()) this.close();
				return prefix.then(
					() => this.report(event.type, target, error),
					() => undefined,
				);
			})
			.catch(() => this.close());
		return prefix;
	}

	private event(event: BrowserEvent): object {
		const existing = this.capabilities.get(event);
		if (existing) return existing;
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> =
			{};
		for (const name of [
			"type",
			"bubbles",
			"cancelable",
			"composed",
			"timeStamp",
			"eventPhase",
			"defaultPrevented",
			"isTrusted",
		] as const)
			properties[name] = {
				get: () => {
					this.ensureOpen();
					return event[name];
				},
			};
		for (const name of ["target", "currentTarget"] as const)
			properties[name] = {
				get: () => {
					this.ensureOpen();
					const target = event[name];
					return target === null ? null : this.target(target);
				},
			};
		for (const name of ["cancelBubble", "returnValue"] as const)
			properties[name] = {
				get: () => {
					this.ensureOpen();
					return event[name];
				},
				set: (value) => {
					this.ensureOpen();
					event[name] = Boolean(value);
				},
			};
		if (event instanceof BrowserMediaQueryListEvent)
			for (const name of ["media", "matches"] as const)
				properties[name] = {
					get: () => {
						this.ensureOpen();
						return event[name];
					},
				};
		if (event instanceof BrowserDetailsToggleEvent)
			for (const name of ["oldState", "newState", "source"] as const)
				properties[name] = {
					get: () => {
						this.ensureOpen();
						return event[name];
					},
				};
		if (event instanceof BrowserPopStateEvent)
			properties.state = {
				get: () => {
					this.ensureOpen();
					return event.state;
				},
			};
		if (event instanceof BrowserHashChangeEvent)
			for (const name of ["oldURL", "newURL"] as const)
				properties[name] = {
					get: () => {
						this.ensureOpen();
						return event[name];
					},
				};
		if (event instanceof BrowserStorageEvent) {
			for (const name of ["key", "oldValue", "newValue", "url"] as const)
				properties[name] = {
					get: () => {
						this.ensureOpen();
						return event[name];
					},
				};
			properties.storageArea = {
				get: () => {
					this.ensureOpen();
					return this.options.storageArea?.(event.storageKind) ?? null;
				},
			};
		}
		if (event instanceof BrowserInputEvent)
			for (const name of ["data", "inputType", "isComposing"] as const)
				properties[name] = {
					get: () => {
						this.ensureOpen();
						return event[name];
					},
				};
		if (event instanceof BrowserKeyboardEvent)
			for (const name of [
				"key",
				"code",
				"shiftKey",
				"ctrlKey",
				"metaKey",
				"altKey",
				"repeat",
				"isComposing",
				"location",
			] as const)
				properties[name] = {
					get: () => {
						this.ensureOpen();
						return event[name];
					},
				};
		if (event instanceof BrowserWheelEvent)
			for (const name of ["deltaX", "deltaY", "deltaZ", "deltaMode"] as const)
				properties[name] = {
					get: () => {
						this.ensureOpen();
						return event[name];
					},
				};
		if (event instanceof BrowserMouseEvent) {
			for (const name of [
				"clientX",
				"clientY",
				"x",
				"y",
				"pageX",
				"pageY",
				"button",
				"buttons",
				"detail",
				"movementX",
				"movementY",
				"shiftKey",
				"ctrlKey",
				"altKey",
				"metaKey",
			] as const)
				properties[name] = {
					get: () => {
						this.ensureOpen();
						return event[name];
					},
				};
			properties.view = {
				get: () => {
					this.ensureOpen();
					return this.options.window ?? null;
				},
			};
		}
		if (event instanceof BrowserPointerActivationEvent)
			for (const name of [
				"pointerId",
				"pointerType",
				"width",
				"height",
				"pressure",
				"tangentialPressure",
				"tiltX",
				"tiltY",
				"twist",
				"altitudeAngle",
				"azimuthAngle",
				"isPrimary",
				"persistentDeviceId",
			] as const)
				properties[name] = {
					get: () => {
						this.ensureOpen();
						return event[name];
					},
				};
		if (
			event instanceof BrowserFocusEvent ||
			event instanceof BrowserMouseEvent
		)
			properties.relatedTarget = {
				get: () => {
					this.ensureOpen();
					return event.relatedTarget === null
						? null
						: this.target(event.relatedTarget);
				},
			};
		if (event instanceof BrowserSubmitEvent)
			properties.submitter = {
				get: () => {
					this.ensureOpen();
					return event.submitter === null ? null : this.target(event.submitter);
				},
			};
		const methods: NonNullable<ScriptHostObjectDefinition["methods"]> = {
			composedPath: () => {
				this.ensureOpen();
				return event.composedPath().map((target) => this.target(target));
			},
		};
		if (event instanceof BrowserMouseEvent)
			methods.getModifierState = (key) => {
				this.ensureOpen();
				return event.getModifierState(String(key));
			};
		for (const name of [
			"preventDefault",
			"stopPropagation",
			"stopImmediatePropagation",
		] as const)
			methods[name] = () => {
				this.ensureOpen();
				event[name]();
			};
		const capability = this.factory.createHostObject({ properties, methods });
		this.capabilities.set(event, capability);
		return capability;
	}

	private target(target: number): object {
		const independent = this.independentTargets.get(target);
		if (independent) return independent;
		if (target === this.options.events.windowTarget) {
			if (!this.options.window)
				throw new AgentBrowserError(
					"unsupported",
					"Window event target is not bound",
				);
			return this.options.window;
		}
		return this.node(target);
	}

	private find(
		target: number,
		type: string,
		callback: unknown,
		capture: boolean,
	) {
		return [...this.records].find(
			(record) =>
				!record.handler &&
				record.target === target &&
				record.type === type &&
				record.callback === callback &&
				record.capture === capture,
		);
	}

	private checkCallback(callback: unknown) {
		if (callback == null || typeof callback === "function") return;
		throw new AgentBrowserError(
			"unsupported",
			"Event listener objects are not implemented; use a function",
		);
	}

	private report(type: string, target: number, error: unknown) {
		if (this.closed) return;
		if (this.errors.length >= this.options.events.limits.maxErrors) {
			this.droppedErrors++;
			return;
		}
		let message = "Asynchronous event listener failed";
		try {
			if (typeof error === "string") message = error.slice(0, 512);
			else if (error instanceof Error && typeof error.message === "string")
				message = error.message.slice(0, 512);
		} catch {}
		this.errors.push(Object.freeze({ type, target, message }));
	}

	private ensureOpen() {
		if (
			this.closed ||
			this.options.events.metrics().closed ||
			this.options.callbacks.isClosed()
		) {
			this.close();
			throw new AgentBrowserError("closed", "Script event bindings are closed");
		}
	}
}

function listenerOptions(
	value: unknown,
	adding: boolean,
): BrowserListenerOptions {
	if (value == null) return {};
	if (typeof value === "boolean") return { capture: value };
	if (typeof value !== "object")
		throw new AgentBrowserError("invalid-input", "Invalid listener options");
	const read = (key: string) => {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor) return undefined;
		if (!("value" in descriptor))
			throw new AgentBrowserError(
				"unsupported",
				"Listener option accessors are not supported",
			);
		return descriptor.value;
	};
	const options: BrowserListenerOptions = { capture: Boolean(read("capture")) };
	if (adding) {
		options.once = Boolean(read("once"));
		options.passive = Boolean(read("passive"));
		if (read("signal") != null)
			throw new AgentBrowserError(
				"unsupported",
				"Guest AbortSignal bindings are not implemented",
			);
	}
	return options;
}
