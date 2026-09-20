export const pageWebSocketBootstrapGlobal = "__agentBrowserWebSocketBootstrap";

export const pageWebSocketBootstrapSource = `
(() => {
	const port = __agentBrowserWebSocketBootstrap();
	class WebSocket {
		#socket;
		constructor(url, protocols) {
			this.#socket = port.create(url, protocols, this);
		}
		get url() { return this.#socket.url; }
		get readyState() { return this.#socket.readyState; }
		get protocol() { return this.#socket.protocol; }
		get extensions() { return this.#socket.extensions; }
		get bufferedAmount() { return this.#socket.bufferedAmount; }
		get binaryType() { return this.#socket.binaryType; }
		set binaryType(value) { this.#socket.binaryType = value; }
		get onopen() { return this.#socket.onopen; }
		set onopen(value) { this.#socket.onopen = value; }
		get onmessage() { return this.#socket.onmessage; }
		set onmessage(value) { this.#socket.onmessage = value; }
		get onerror() { return this.#socket.onerror; }
		set onerror(value) { this.#socket.onerror = value; }
		get onclose() { return this.#socket.onclose; }
		set onclose(value) { this.#socket.onclose = value; }
		send(data) { return this.#socket.send(data); }
		close(code, reason) { return this.#socket.close(code, reason); }
		addEventListener(type, listener, options) {
			return this.#socket.addEventListener(type, listener, options);
		}
		removeEventListener(type, listener, options) {
			return this.#socket.removeEventListener(type, listener, options);
		}
	}
	const constants = {
		CONNECTING: { value: 0, enumerable: true },
		OPEN: { value: 1, enumerable: true },
		CLOSING: { value: 2, enumerable: true },
		CLOSED: { value: 3, enumerable: true }
	};
	Object.defineProperties(WebSocket, constants);
	Object.defineProperties(WebSocket.prototype, constants);
	port.publish(WebSocket);
	globalThis.WebSocket = WebSocket;
})();
`;
