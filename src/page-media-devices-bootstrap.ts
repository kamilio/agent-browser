export const pageMediaDevicesBootstrapGlobal =
	"__agentBrowserMediaDevicesBootstrap";

export const pageMediaDevicesBootstrapSource = `(() => {
	const api = __agentBrowserMediaDevicesBootstrap();
	const Stream = MediaStream, ErrorClass = Error, TypeErrorClass = TypeError;
	const isArray = Array.isArray, isInteger = Number.isInteger, push = Array.prototype.push, apply = Reflect.apply;
	function failure(name, constraint) {
		const error = name === "TypeError" ? new TypeErrorClass("Invalid media constraints") : new ErrorClass("Media request failed: " + name);
		error.name = name;
		if (constraint !== undefined) error.constraint = constraint;
		return error;
	}
	function checked(result) { if (result.error) throw failure(result.error, result.constraint); return result; }
	function strings(value) {
		const values = isArray(value) ? value : [value], result = [];
		const count = values.length;
		if (count > 16) throw failure("TypeError");
		for (let i = 0; i < count; i++) {
			const item = values[i];
			if (typeof item !== "string" || item.length > 256) throw failure("TypeError");
			apply(push, result, [item]);
		}
		return result;
	}
	function constraints(value) {
		if (!value || typeof value !== "object") throw failure("TypeError");
		const audio = value.audio, video = value.video;
		if (video) throw failure("NotFoundError");
		if (!audio || (audio !== true && typeof audio !== "object")) throw failure("TypeError");
		const result = {};
		if (audio === true) return result;
		if (isArray(audio)) throw failure("TypeError");
		if (audio.advanced !== undefined) throw failure("NotSupportedError");
		for (const key of ["deviceId", "groupId", "sampleRate", "channelCount"]) {
			const raw = audio[key];
			if (raw === undefined) continue;
			const string = key === "deviceId" || key === "groupId";
			const fields = raw !== null && typeof raw === "object" && !isArray(raw) ? raw : {ideal: raw};
			const item = {};
			for (const field of string ? ["exact", "ideal"] : ["exact", "ideal", "min", "max"]) {
				const selected = fields[field];
				if (selected === undefined) continue;
				if (string) item[field] = strings(selected);
				else {
					if (!isInteger(selected) || selected < 0 || selected > 1000000) throw failure("TypeError");
					item[field] = selected;
				}
			}
			result[key] = item;
		}
		return result;
	}
	const devices = {
		async enumerateDevices() {
			if (this !== devices) throw failure("TypeError");
			const result = checked(api.enumerate()).devices;
			for (const device of result) device.toJSON = function() { return {deviceId: this.deviceId, groupId: this.groupId, kind: this.kind, label: this.label}; };
			return result;
		},
		getSupportedConstraints() {
			if (this !== devices) throw failure("TypeError");
			if (!api.check()) throw failure("InvalidStateError");
			return {deviceId: true, groupId: true, sampleRate: true, channelCount: true};
		},
		async getUserMedia(value) {
			if (this !== devices) throw failure("TypeError");
			const lease = checked(await api.acquire(constraints(value))).lease;
			try {
				const stream = new Stream();
				checked(api.attach(lease, stream.id));
				return stream;
			} finally { api.cancel(lease); }
		}
	};
	Object.defineProperty(devices, Symbol.toStringTag, {value: "MediaDevices", configurable: true});
	api.publish(devices);
})();`;
