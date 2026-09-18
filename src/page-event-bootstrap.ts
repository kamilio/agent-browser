export const pageEventBootstrapGlobal = "__agentBrowserEventBootstrap";

export const pageEventBootstrapSource = `
if (typeof __agentBrowserEventBootstrap === "function") {
	const constructors = (() => {
		const port = __agentBrowserEventBootstrap();
		const eventFacades = new WeakMap();
		const dispatching = new WeakSet();
		const uninitialized = new WeakSet();
		let legacyConstruction = false;
		function eventType(value) {
			if (typeof value === "symbol") throw new TypeError("Invalid event type");
			return String(value);
		}
		function dictionary(value) {
			if (value === undefined || value === null) return {};
			if (typeof value !== "object" && typeof value !== "function")
				throw new TypeError("Invalid event initialization dictionary");
			return value;
		}
		function initializeEvent(receiver, type, bubbles, cancelable) {
			const facade = eventFacades.get(receiver);
			if (!facade) throw new TypeError("initEvent requires an Event");
			const name = eventType(type);
			if (dispatching.has(receiver)) return false;
			if (!port.initialize(facade, name, Boolean(bubbles), Boolean(cancelable))) return false;
			uninitialized.delete(receiver);
			return true;
		}
		class Event {
			#event;
			constructor(type, init = undefined) {
				if (arguments.length === 0) throw new TypeError("Event requires a type");
				const name = eventType(type);
				const options = dictionary(init);
				this.#event = legacyConstruction ? port.createLegacy(this) : port.create(name, Boolean(options.bubbles), Boolean(options.cancelable), Boolean(options.composed), this);
				eventFacades.set(this, this.#event);
				if (legacyConstruction) uninitialized.add(this);
				Object.defineProperty(this, "isTrusted", {
					get: () => this.#event.isTrusted,
					enumerable: true,
					configurable: false,
				});
			}
			get type() { return this.#event.type; }
			get bubbles() { return this.#event.bubbles; }
			get cancelable() { return this.#event.cancelable; }
			get composed() { return this.#event.composed; }
			get timeStamp() { return this.#event.timeStamp; }
			get target() { return this.#event.target; }
			get srcElement() { return this.#event.target; }
			get currentTarget() { return this.#event.currentTarget; }
			get eventPhase() { return this.#event.eventPhase; }
			get defaultPrevented() { return this.#event.defaultPrevented; }
			get cancelBubble() { return this.#event.cancelBubble; }
			set cancelBubble(value) { this.#event.cancelBubble = Boolean(value); }
			get returnValue() { return this.#event.returnValue; }
			set returnValue(value) { this.#event.returnValue = Boolean(value); }
			preventDefault() { this.#event.preventDefault(); }
			stopPropagation() { this.#event.stopPropagation(); }
			stopImmediatePropagation() { this.#event.stopImmediatePropagation(); }
			composedPath() { return this.#event.composedPath(); }
			initEvent(type, bubbles = false, cancelable = false) {
				if (arguments.length === 0) throw new TypeError("initEvent requires a type");
				initializeEvent(this, type, bubbles, cancelable);
			}
		}
		class CustomEvent extends Event {
			#detail;
			constructor(type, init = undefined) {
				if (arguments.length === 0) throw new TypeError("CustomEvent requires a type");
				const name = eventType(type);
				const options = dictionary(init);
				const flags = {bubbles: Boolean(options.bubbles), cancelable: Boolean(options.cancelable), composed: Boolean(options.composed)};
				const detail = options.detail;
				super(name, flags);
				this.#detail = detail === undefined ? null : detail;
			}
			get detail() { return this.#detail; }
			initCustomEvent(type, bubbles = false, cancelable = false, detail = null) {
				if (arguments.length === 0) throw new TypeError("initCustomEvent requires a type");
				void this.#detail;
				if (initializeEvent(this, type, bubbles, cancelable)) this.#detail = detail;
			}
		}
		for (const [name, value] of [["NONE", 0], ["CAPTURING_PHASE", 1], ["AT_TARGET", 2], ["BUBBLING_PHASE", 3]]) {
			Object.defineProperty(Event, name, {value, enumerable: true});
			Object.defineProperty(Event.prototype, name, {value, enumerable: true});
		}
		for (const constructor of [Event, CustomEvent]) {
			Object.defineProperty(constructor.prototype, Symbol.toStringTag, {value: constructor.name, configurable: true});
			for (const name of Object.getOwnPropertyNames(constructor.prototype)) {
				if (name === "constructor" || Object.getOwnPropertyDescriptor(constructor.prototype, name).configurable === false) continue;
				Object.defineProperty(constructor.prototype, name, {enumerable: true});
			}
		}
		function dispatchEvent(event) {
			const facade = eventFacades.get(event);
			if (!facade) throw new TypeError("dispatchEvent requires a constructed Event");
			if (dispatching.has(event) || uninitialized.has(event)) {
				const error = new Error("Event is uninitialized or already being dispatched");
				error.name = "InvalidStateError";
				throw error;
			}
			dispatching.add(event);
			try {
				const target = this === globalThis ? port.window() : this;
				return port.dispatch(target, facade);
			} finally {
				dispatching.delete(event);
			}
		}
		function createEvent(interfaceName) {
			if (arguments.length === 0) throw new TypeError("createEvent requires an interface");
			if (!port.validateDocument(this)) throw new TypeError("createEvent requires a Document");
			const name = eventType(interfaceName).replace(/[A-Z]/g, character => character.toLowerCase());
			if (name !== "event" && name !== "events" && name !== "htmlevents" && name !== "customevent") {
				const error = new Error("Unsupported event interface");
				error.name = "NotSupportedError";
				throw error;
			}
			legacyConstruction = true;
			try {
				return name === "customevent" ? new CustomEvent("") : new Event("");
			} finally {
				legacyConstruction = false;
			}
		}
		port.publish(Event, CustomEvent, dispatchEvent);
		port.publishLegacy(createEvent);
		return {Event, CustomEvent, dispatchEvent};
	})();
	Object.defineProperty(globalThis, "Event", {value: constructors.Event, writable: true, configurable: true, enumerable: false});
	Object.defineProperty(globalThis, "CustomEvent", {value: constructors.CustomEvent, writable: true, configurable: true, enumerable: false});
	Object.defineProperty(globalThis, "dispatchEvent", {value: constructors.dispatchEvent, writable: true, configurable: true, enumerable: true});
}
void 0;
`;
