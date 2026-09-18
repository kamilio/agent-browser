export const pageXmlHttpRequestBootstrapGlobal =
	"__agentBrowserXMLHttpRequestBootstrap";

export const pageXmlHttpRequestBootstrapSource = `
if (typeof __agentBrowserXMLHttpRequestBootstrap === "function") {
	const XMLHttpRequest = (() => {
		const port = __agentBrowserXMLHttpRequestBootstrap();
		const eventTypes = ["loadstart", "readystatechange", "progress", "load", "error", "timeout", "abort", "loadend"];
		const listenerLimitError = new RangeError("XMLHttpRequest listener limit exceeded");
		const eventLimitError = new RangeError("XMLHttpRequest event limit exceeded");
		class XMLHttpRequest {
			#request;
			#listeners = [];
			#listenerCount = 0;
			#handlers = Object.create(null);
			#events = 0;
			constructor() {
				this.#request = port.create();
			}
			get readyState() { return this.#request.readyState; }
			get status() { return this.#request.status; }
			get statusText() { return this.#request.statusText; }
			get responseURL() { return this.#request.responseURL; }
			get responseText() { return this.#request.responseText; }
			get response() { return this.#request.responseText; }
			get responseXML() { return null; }
			get responseType() { return this.#request.responseType; }
			set responseType(value) { this.#request.responseType = value; }
			get timeout() { return this.#request.timeout; }
			set timeout(value) { this.#request.timeout = value; }
			get withCredentials() { return this.#request.withCredentials; }
			set withCredentials(value) { this.#request.withCredentials = Boolean(value); }
			get upload() { throw new TypeError("XMLHttpRequest upload is unsupported"); }
			overrideMimeType() { throw new TypeError("XMLHttpRequest MIME overrides are unsupported"); }
			open(method, url, async = true, user, password) {
				if (user !== undefined || password !== undefined)
					throw new TypeError("XMLHttpRequest credential arguments are unsupported");
				const generation = this.#request.open(String(method), String(url), Boolean(async));
				if (generation !== undefined) this.#dispatch("readystatechange", generation);
			}
			setRequestHeader(name, value) {
				this.#request.setRequestHeader(String(name), String(value));
			}
			getResponseHeader(name) {
				return this.#request.getResponseHeader(String(name));
			}
			getAllResponseHeaders() {
				return this.#request.getAllResponseHeaders();
			}
			send(body = null) {
				const generation = this.#request.prepare(body);
				if (!this.#request.async) {
					const completed = port.sendSync(this.#request);
					if (completed !== generation || !this.#current(generation)) return;
					if (!this.#request.advance(generation, 3)) return;
					if (!this.#request.advance(generation, 4)) return;
					if (!this.#dispatch("readystatechange", generation)) return;
					if (!this.#dispatch("load", generation)) return;
					this.#dispatch("loadend", generation);
					return;
				}
				if (!this.#dispatch("loadstart", generation)) return;
				port.sendAsync(this.#request).then(
					(completed) => {
						if (completed !== generation || !this.#current(generation)) return;
						if (!this.#dispatch("readystatechange", generation)) return;
						if (!this.#request.advance(generation, 3)) return;
						if (!this.#dispatch("readystatechange", generation)) return;
						if (!this.#request.advance(generation, 4)) return;
						if (!this.#dispatch("readystatechange", generation)) return;
						if (!this.#dispatch("load", generation)) return;
						this.#dispatch("loadend", generation);
					},
					() => {
						if (!this.#current(generation)) return;
						const failure = this.#request.failure;
						if (failure === "abort") return;
						if (!this.#dispatch("readystatechange", generation)) return;
						if (!this.#dispatch(failure === "timeout" ? "timeout" : "error", generation)) return;
						this.#dispatch("loadend", generation);
					}
				);
			}
			abort() {
				const active = this.#request.abort();
				const generation = this.#request.generation;
				if (!active) return;
				if (!this.#dispatch("readystatechange", generation)) return;
				if (!this.#dispatch("abort", generation)) return;
				if (!this.#dispatch("loadend", generation)) return;
				this.#request.resetAbort(generation);
			}
			addEventListener(type, listener, options) {
				type = String(type);
				if (listener == null) return;
				if (typeof listener !== "function" && typeof listener !== "object")
					throw new TypeError("Invalid XMLHttpRequest listener");
				const capture = typeof options === "boolean" ? options : Boolean(options && options.capture);
				const once = Boolean(options && typeof options === "object" && options.once);
				if (options && typeof options === "object" && options.signal != null)
					throw new TypeError("XMLHttpRequest listener signals are unsupported");
				if (this.#listeners.some((entry) => !entry.handler && entry.type === type && entry.listener === listener && entry.capture === capture)) return;
				if (this.#listenerCount >= 32) throw listenerLimitError;
				this.#listeners.push({ type, listener, capture, once, active: true });
				this.#listenerCount++;
			}
			removeEventListener(type, listener, options) {
				type = String(type);
				const capture = typeof options === "boolean" ? options : Boolean(options && options.capture);
				for (const entry of this.#listeners.slice()) {
					if (!entry.handler && entry.type === type && entry.listener === listener && entry.capture === capture)
						this.#remove(entry);
				}
			}
			#remove(entry) {
				if (!entry.active) return;
				entry.active = false;
				if (!entry.handler) this.#listenerCount--;
				const index = this.#listeners.indexOf(entry);
				if (index !== -1) this.#listeners.splice(index, 1);
			}
			#current(generation) { return this.#request.generation === generation; }
			#dispatch(type, generation) {
				if (!this.#current(generation)) return false;
				if (++this.#events > 8192) throw eventLimitError;
				let stopped = false;
				let dispatching = true;
				const target = this;
				const event = {
					type,
					get target() { return target; },
					get currentTarget() { return dispatching ? target : null; },
					bubbles: false,
					cancelable: false,
					defaultPrevented: false,
					isTrusted: false,
					get eventPhase() { return dispatching ? 2 : 0; },
					preventDefault() {},
					stopPropagation() {},
					stopImmediatePropagation() { stopped = true; }
				};
				if (type !== "readystatechange") {
					event.lengthComputable = false;
					event.loaded = 0;
					event.total = 0;
				}
				try {
					for (const entry of this.#listeners.slice()) {
						if (!this.#current(generation)) return false;
						if (stopped) break;
						if (!entry.active || entry.type !== type) continue;
						if (entry.once) this.#remove(entry);
						try {
							if (typeof entry.listener === "function") entry.listener.call(this, event);
							else {
								const handleEvent = entry.listener.handleEvent;
								if (!this.#current(generation)) return false;
								if (typeof handleEvent === "function") handleEvent.call(entry.listener, event);
							}
						} catch (error) {
							if (error === listenerLimitError || error === eventLimitError) throw error;
						}
						if (!this.#current(generation)) return false;
					}
					return this.#current(generation);
				} finally {
					dispatching = false;
				}
			}
			static {
				for (const type of eventTypes) {
					Object.defineProperty(this.prototype, "on" + type, {
						configurable: true,
						enumerable: true,
						get() { return this.#handlers[type] ? this.#handlers[type].listener : null; },
						set(value) {
							const existing = this.#handlers[type];
							if (typeof value !== "function") {
								if (existing) this.#remove(existing);
								delete this.#handlers[type];
							} else if (existing) existing.listener = value;
							else {
								const entry = { type, listener: value, capture: false, once: false, active: true, handler: true };
								this.#handlers[type] = entry;
								this.#listeners.push(entry);
							}
						}
					});
				}
			}
		}
		const constants = {
			UNSENT: { value: 0, enumerable: true },
			OPENED: { value: 1, enumerable: true },
			HEADERS_RECEIVED: { value: 2, enumerable: true },
			LOADING: { value: 3, enumerable: true },
			DONE: { value: 4, enumerable: true }
		};
		Object.defineProperties(XMLHttpRequest, constants);
		Object.defineProperties(XMLHttpRequest.prototype, constants);
		port.publish(XMLHttpRequest);
		return XMLHttpRequest;
	})();
	Object.defineProperty(globalThis, "XMLHttpRequest", {
		value: XMLHttpRequest,
		writable: true,
		configurable: true,
		enumerable: true
	});
}
void 0;
`;
