export const pageMediaStreamBootstrapGlobal =
	"__agentBrowserMediaStreamBootstrap";

export const pageMediaStreamBootstrapSource = `(() => {
	const api = __agentBrowserMediaStreamBootstrap();
	const streams = new WeakMap(), tracks = new WeakMap(), wrappers = new Map();
	const get = WeakMap.prototype.get, set = WeakMap.prototype.set;
	const mapGet = Map.prototype.get, mapSet = Map.prototype.set;
	const apply = Reflect.apply, push = Array.prototype.push;
	const token = {}, text = String;
	function port(map, value) {
		const result = apply(get, map, [value]);
		if (!result) throw new TypeError("Invalid media receiver");
		return result;
	}
	function string(value) {
		if (typeof value === "symbol") throw new TypeError("Invalid media string");
		const result = text(value);
		if (result.length > 256) throw new RangeError("Media string limit exceeded");
		return result;
	}
	function track(value) {
		let result = apply(mapGet, wrappers, [value.id]);
		if (!result) { result = new MediaStreamTrack(token, value); apply(mapSet, wrappers, [value.id, result]); }
		return result;
	}
	function trackList(value) {
		const result = [];
		for (const item of port(streams, value).tracks()) apply(push, result, [track(item)]);
		return result;
	}
	class MediaStreamTrack {
		constructor(key, value) {
			if (key !== token) throw new TypeError("Illegal MediaStreamTrack constructor");
			api.bind(value.id, this); apply(set, tracks, [this, value]);
		}
		get id() { return port(tracks, this).id; }
		get kind() { return port(tracks, this).kind; }
		get label() { return port(tracks, this).label; }
		get readyState() { return port(tracks, this).readyState; }
		get muted() { return port(tracks, this).muted; }
		get enabled() { return port(tracks, this).enabled; }
		set enabled(value) { port(tracks, this).enabled = Boolean(value); }
		get contentHint() { return port(tracks, this).contentHint; }
		set contentHint(value) { port(tracks, this).contentHint = string(value); }
		get onended() { return port(tracks, this).onended; }
		set onended(value) { port(tracks, this).onended = value; }
		get onmute() { return port(tracks, this).onmute; }
		set onmute(value) { port(tracks, this).onmute = value; }
		get onunmute() { return port(tracks, this).onunmute; }
		set onunmute(value) { port(tracks, this).onunmute = value; }
		getSettings() { return port(tracks, this).settings(); }
		getCapabilities() { return port(tracks, this).capabilities(); }
		getConstraints() { port(tracks, this); return {}; }
		clone() { return track(port(tracks, this).clone()); }
		stop() { port(tracks, this).stop(); }
		addEventListener(type, listener, options) { port(tracks, this).addEventListener(string(type), listener, options); }
		removeEventListener(type, listener, options) { port(tracks, this).removeEventListener(string(type), listener, options); }
	}
	class MediaStream {
		constructor(input = undefined, native = undefined) {
			let value;
			if (input === token) value = native;
			else {
				const ids = [], existing = apply(get, streams, [input]);
				if (existing) value = api.createStream(existing.ids());
				else {
					if (input !== undefined) {
						if (input === null || (typeof input !== "object" && typeof input !== "function")) throw new TypeError("MediaStream requires tracks");
						for (const item of input) {
							if (ids.length >= api.maxTracksPerStream) throw new RangeError("MediaStream track limit exceeded");
							apply(push, ids, [port(tracks, item).id]);
						}
					}
					value = api.createStream(ids);
				}
			}
			api.bind(value.id, this); apply(set, streams, [this, value]);
		}
		get id() { return port(streams, this).id; }
		get active() { return port(streams, this).active; }
		getTracks() { return trackList(this); }
		getAudioTracks() { return trackList(this); }
		getVideoTracks() { port(streams, this); return []; }
		getTrackById(id) { const value = port(streams, this).find(string(id)); return value === null ? null : track(value); }
		addTrack(value) { port(streams, this).add(port(tracks, value).id); }
		removeTrack(value) { port(streams, this).remove(port(tracks, value).id); }
		clone() { return new MediaStream(token, port(streams, this).clone()); }
		get onaddtrack() { return port(streams, this).onaddtrack; }
		set onaddtrack(value) { port(streams, this).onaddtrack = value; }
		get onremovetrack() { return port(streams, this).onremovetrack; }
		set onremovetrack(value) { port(streams, this).onremovetrack = value; }
		addEventListener(type, listener, options) { port(streams, this).addEventListener(string(type), listener, options); }
		removeEventListener(type, listener, options) { port(streams, this).removeEventListener(string(type), listener, options); }
	}
	for (const constructor of [MediaStream, MediaStreamTrack]) {
		Object.defineProperty(constructor.prototype, Symbol.toStringTag, {value: constructor.name, configurable: true});
		Object.defineProperty(globalThis, constructor.name, {value: constructor, writable: true, configurable: true});
	}
	api.publish(MediaStream, MediaStreamTrack);
	api.publishFactory(value => { new MediaStream(token, value); });
})();`;
