export const pageUrlBootstrapSource = `(() => {
	const api = __agentBrowserWindowGlobal.urls;
	const limits = api.limits;
	const token = {};
	const nativeString = String;
	const apply = Reflect.apply;
	function string(value) {
		if (typeof value === "symbol") throw new TypeError("Cannot convert a symbol to a URL string");
		const result = nativeString(value);
		if (result.length > limits.maxInputCodeUnits) throw new RangeError("URL input limit exceeded");
		return result;
	}
	function required(count, actual) {
		if (actual < count) throw new TypeError("Missing URL argument");
	}
	function sequence(value, method) {
		if (typeof method !== "function") throw new TypeError("URL parameter sequence requires an iterator");
		return { [Symbol.iterator]() {return apply(method, value, []);} };
	}
	function initialize(input) {
		if (input === null || input === undefined) return "";
		if (typeof input !== "object" && typeof input !== "function") return string(input);
		const pairs = [];
		let units = 0, serialized = 0, count = 0;
		function encode(name, value) {
			if (++count > limits.maxParams) throw new RangeError("URL parameter limit exceeded");
			units += name.length + value.length;
			if (units > limits.maxInputCodeUnits) throw new RangeError("URL input limit exceeded");
			const pair = api.encode(name, value);
			serialized += pair.length + (count > 1 ? 1 : 0);
			if (serialized > limits.maxSerializedCodeUnits) throw new RangeError("URL serialization limit exceeded");
			return pair;
		}
		const iterator = input[Symbol.iterator];
		if (iterator !== undefined && iterator !== null) {
			for (const item of sequence(input, iterator)) {
				if (count >= limits.maxParams) throw new RangeError("URL parameter limit exceeded");
				if (item === null || (typeof item !== "object" && typeof item !== "function")) throw new TypeError("URL parameter pair requires an object");
				const pair = [];
				for (const value of sequence(item, item[Symbol.iterator])) {
					if (pair.length === 2) throw new TypeError("URL parameter pair must have two values");
					pair.push(string(value));
				}
				if (pair.length !== 2) throw new TypeError("URL parameter pair must have two values");
				pairs.push(encode(pair[0], pair[1]));
			}
		} else {
			const fields = new Map();
			for (const key of Reflect.ownKeys(input)) {
				const descriptor = Object.getOwnPropertyDescriptor(input, key);
				if (descriptor === undefined || !descriptor.enumerable) continue;
				if (count >= limits.maxParams) throw new RangeError("URL parameter limit exceeded");
				const pair = encode(string(key), string(input[key]));
				fields.set(pair.slice(0, pair.indexOf("=")), pair);
			}
			for (const pair of fields.values()) pairs.push(pair);
		}
		return pairs.join("&");
	}
	class URLSearchParams {
		#port;
		constructor(input = "", port = undefined) {
			this.#port = input === token ? port : api.params(initialize(input));
		}
		get size() {return this.#port.size;}
		append(name, value) {required(2, arguments.length); this.#port.append(string(name), string(value));}
		set(name, value) {required(2, arguments.length); this.#port.set(string(name), string(value));}
		get(name) {required(1, arguments.length); return this.#port.get(string(name));}
		getAll(name) {required(1, arguments.length); return this.#port.getAll(string(name));}
		has(name, value = undefined) {required(1, arguments.length); return this.#port.has(string(name), value === undefined ? undefined : string(value));}
		delete(name, value = undefined) {required(1, arguments.length); this.#port.delete(string(name), value === undefined ? undefined : string(value));}
		sort() {this.#port.sort();}
		toString() {return this.#port.serialize();}
		#iterate(kind) {
			const port = this.#port;
			let index = 0, done = false;
			port.size;
			return {
				next() {
					port.size;
					if (done) return {value: undefined, done: true};
					const pair = port.entry(index);
					if (pair === null) {done = true; return {value: undefined, done: true};}
					index++;
					return {value: kind === "keys" ? pair[0] : kind === "values" ? pair[1] : pair, done: false};
				},
				[Symbol.iterator]() {return this;}
			};
		}
		entries() {return this.#iterate("entries");}
		keys() {return this.#iterate("keys");}
		values() {return this.#iterate("values");}
		forEach(callback, receiver = undefined) {
			this.#port.size;
			if (typeof callback !== "function") throw new TypeError("URL parameter callback must be callable");
			for (const pair of this.entries()) apply(callback, receiver, [pair[1], pair[0], this]);
		}
	}
	Object.defineProperty(URLSearchParams.prototype, Symbol.iterator, {value: URLSearchParams.prototype.entries, configurable: true, writable: true});
	Object.defineProperty(URLSearchParams.prototype, Symbol.toStringTag, {value: "URLSearchParams", configurable: true});
	class URL {
		#port;
		#params;
		constructor(input, base = undefined) {
			required(1, arguments.length);
			this.#port = api.url(string(input), base === undefined ? undefined : string(base));
			this.#params = new URLSearchParams(token, this.#port.params);
		}
		get href() {return this.#port.href;} set href(value) {this.#port.href = string(value);}
		get origin() {return this.#port.origin;}
		get protocol() {return this.#port.protocol;} set protocol(value) {this.#port.protocol = string(value);}
		get username() {return this.#port.username;} set username(value) {this.#port.username = string(value);}
		get password() {return this.#port.password;} set password(value) {this.#port.password = string(value);}
		get host() {return this.#port.host;} set host(value) {this.#port.host = string(value);}
		get hostname() {return this.#port.hostname;} set hostname(value) {this.#port.hostname = string(value);}
		get port() {return this.#port.port;} set port(value) {this.#port.port = string(value);}
		get pathname() {return this.#port.pathname;} set pathname(value) {this.#port.pathname = string(value);}
		get search() {return this.#port.search;} set search(value) {this.#port.search = string(value);}
		get hash() {return this.#port.hash;} set hash(value) {this.#port.hash = string(value);}
		get searchParams() {this.#port.params; return this.#params;}
		toString() {return this.#port.href;}
		toJSON() {return this.#port.href;}
	}
	Object.defineProperty(URL.prototype, Symbol.toStringTag, {value: "URL", configurable: true});
	Object.defineProperty(globalThis, "URL", {value: URL, configurable: true, writable: true});
	Object.defineProperty(globalThis, "URLSearchParams", {value: URLSearchParams, configurable: true, writable: true});
})();`;
