// WebIDL dictionary conversion runs in the guest before the native data boundary.
// Applications may replace Object static methods without making timeout options
// an exportable copy of the guest's entire originating prototype chain.
export const pageIdleCallbackBootstrapSource = `(() => {
	const request = nativeWindow.requestIdleCallback;
	if (typeof request !== "function") return;
	const create = Object.create;
	function requestIdleCallback(callback) {
		if (arguments.length === 0 || typeof callback !== "function")
			throw new TypeError("requestIdleCallback requires a function");
		const options = arguments[1];
		if (options === null || options === undefined) return request(callback);
		if (typeof options !== "object" && typeof options !== "function")
			throw new TypeError("Idle callback options require a dictionary");
		const timeout = options.timeout;
		if (timeout === undefined) return request(callback);
		const dictionary = create(null);
		dictionary.timeout = timeout >>> 0;
		return request(callback, dictionary);
	}
	Object.defineProperty(globalThis, "requestIdleCallback", {
		value: requestIdleCallback, writable: true, configurable: true, enumerable: true
	});
})();`;
