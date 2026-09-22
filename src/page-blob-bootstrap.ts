export const pageBlobBootstrapSource = `(() => {
	const api = __agentBrowserWindowGlobal.blobs;
	const limits = api.limits;
	const ports = new WeakMap();
	const get = WeakMap.prototype.get, set = WeakMap.prototype.set;
	const apply = Reflect.apply, push = Array.prototype.push;
	const nativeString = String, Bytes = Uint8Array;
	const isView = ArrayBuffer.isView;
	const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
	const typedProto = Object.getPrototypeOf(Uint8Array.prototype);
	const typedBuffer = Object.getOwnPropertyDescriptor(typedProto, "buffer").get;
	const typedOffset = Object.getOwnPropertyDescriptor(typedProto, "byteOffset").get;
	const typedLength = Object.getOwnPropertyDescriptor(typedProto, "byteLength").get;
	const viewBuffer = Object.getOwnPropertyDescriptor(DataView.prototype, "buffer").get;
	const viewOffset = Object.getOwnPropertyDescriptor(DataView.prototype, "byteOffset").get;
	const viewLength = Object.getOwnPropertyDescriptor(DataView.prototype, "byteLength").get;
	const trunc = Math.trunc;
	const token = {};
	function string(value, limit) {
		if (typeof value === "symbol") throw new TypeError("Cannot convert a symbol to a Blob string");
		const result = nativeString(value);
		if (result.length > limit) throw new RangeError("Blob input limit exceeded");
		return result;
	}
	function port(value) {
		const result = apply(get, ports, [value]);
		if (result === undefined) throw new TypeError("Invalid Blob receiver");
		return result;
	}
	function binary(value) {
		let buffer, offset = 0, length;
		if (isView(value)) {
			try {
				buffer = apply(viewBuffer, value, []);
				offset = apply(viewOffset, value, []);
				length = apply(viewLength, value, []);
			} catch {
				buffer = apply(typedBuffer, value, []);
				offset = apply(typedOffset, value, []);
				length = apply(typedLength, value, []);
			}
			apply(bufferLength, buffer, []);
		} else {
			try { length = apply(bufferLength, value, []); buffer = value; }
			catch { return undefined; }
		}
		if (length > limits.maxBlobBytes) throw new RangeError("Blob byte limit exceeded");
		const bytes = new Bytes(buffer, offset, length), result = [];
		for (let i = 0; i < length; i++) apply(push, result, [bytes[i]]);
		return result;
	}
	function integer(value) {
		let number = +value;
		if (number !== number || number === Infinity || number === -Infinity) return 0;
		number = trunc(number) % 18446744073709551616;
		if (number >= 9223372036854775808) number -= 18446744073709551616;
		if (number < -9223372036854775808) number += 18446744073709551616;
		return number;
	}
	class Blob {
		constructor(parts = [], options = undefined) {
			if (parts === token) { apply(set, ports, [this, options]); return; }
			if (parts === null || (typeof parts !== "object" && typeof parts !== "function")) throw new TypeError("Blob parts require an iterable object");
			const iterator = parts[Symbol.iterator];
			if (typeof iterator !== "function") throw new TypeError("Blob parts require an iterator");
			const normalized = [];
			let units = 0;
			for (const value of { [Symbol.iterator]() { return apply(iterator, parts, []); } }) {
				if (normalized.length >= limits.maxParts) throw new RangeError("Blob part limit exceeded");
				const existing = apply(get, ports, [value]);
				let item;
				if (existing !== undefined) { units += existing.size; item = {kind: "blob", value: existing.id}; }
				else {
					const bytes = binary(value);
					if (bytes !== undefined) { units += bytes.length; item = {kind: "bytes", value: bytes}; }
					else { const text = string(value, limits.maxBlobBytes); units += text.length; item = {kind: "text", value: text}; }
				}
				if (units > limits.maxBlobBytes) throw new RangeError("Blob input limit exceeded");
				apply(push, normalized, [item]);
			}
			if (options !== undefined && options !== null && typeof options !== "object" && typeof options !== "function") throw new TypeError("Blob options require a dictionary");
			const rawEndings = options == null ? undefined : options.endings;
			const endings = rawEndings === undefined ? "transparent" : string(rawEndings, limits.maxTypeCodeUnits);
			if (endings !== "transparent" && endings !== "native") throw new TypeError("Invalid Blob endings");
			const rawType = options == null ? undefined : options.type;
			const type = rawType === undefined ? "" : string(rawType, limits.maxTypeCodeUnits);
			apply(set, ports, [this, api.create(normalized, type, endings)]);
		}
		get size() { return port(this).size; }
		get type() { return port(this).type; }
		async text() { return port(this).text(); }
		async arrayBuffer() { return port(this).arrayBuffer(); }
		async bytes() { return port(this).bytes(); }
		slice(start = 0, end = undefined, contentType = "") {
			const source = port(this);
			const from = integer(start), to = end === undefined ? source.size : integer(end);
			return new Blob(token, source.slice(from, to, string(contentType, limits.maxTypeCodeUnits)));
		}
	}
	Object.defineProperty(Blob.prototype, Symbol.toStringTag, {value: "Blob", configurable: true});
	Object.defineProperty(globalThis, "Blob", {value: Blob, configurable: true, writable: true});
	Object.defineProperty(URL, "createObjectURL", {configurable: true, writable: true, value: function createObjectURL(value) {
		if (arguments.length === 0) throw new TypeError("Missing Blob argument");
		return api.createObjectURL(port(value).id);
	}});
	Object.defineProperty(URL, "revokeObjectURL", {configurable: true, writable: true, value: function revokeObjectURL(value) {
		if (arguments.length === 0) throw new TypeError("Missing URL argument");
		api.revokeObjectURL(string(value, limits.maxUrlCodeUnits));
	}});
})();`;
