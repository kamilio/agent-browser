import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import type { AudioRecordingSource } from "./audio-recording.js";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { pageMediaDevicesBootstrapSource } from "./page-media-devices-bootstrap.js";
import type { PageAudioInput } from "./page-media-devices.js";
import { pageMediaStreamBootstrapSource } from "./page-media-stream-bootstrap.js";
import { pageWebAudioBootstrapSource } from "./page-web-audio-bootstrap.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	try {
		for (const close of cleanups.splice(0)) await close();
	} finally {
		vi.useRealTimers();
	}
});
function fixture(url = "https://app.zoom.us/wc/test") {
	const document = new DocumentTree(url);
	const interactions = new DocumentInteractions(document);
	const released = vi.fn();
	let setupComplete = false;
	const context: PageBindingContext = {
		nestedOperation: (operation) => operation,
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
		retainGuestArguments: (operation) => {
			if (setupComplete) throw new Error("Late native operation registration");
			return operation;
		},
		releaseGuestReference: released,
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback(callback, args, options) {
			if (typeof callback !== "function") throw new Error("Invalid callback");
			const result = Promise.resolve(
				Reflect.apply(callback, options.thisValue, args),
			);
			return { synchronous: Promise.resolve(), result };
		},
		fail: vi.fn(),
		onConsoleCall() {},
	};
	const bindings = new PageBindings(
		{ document, interactions },
		context,
		lifecycle,
		{},
		undefined,
		true,
		true,
	);
	setupComplete = true;
	let port: Record<string, (...args: unknown[]) => unknown> | undefined;
	const bootstrap = bindings.globals.__agentBrowserMediaDevicesBootstrap as
		| (() => object)
		| undefined;
	const vm = createContext({
		...bindings.globals,
		Float32Array,
		...(bootstrap
			? {
					__agentBrowserMediaDevicesBootstrap: () => {
						port = bootstrap() as typeof port;
						return port;
					},
				}
			: {}),
	});
	const evaluate = (source: string) =>
		runInContext(source, vm, { timeout: 1000 });
	evaluate(
		pageMediaStreamBootstrapSource +
			pageWebAudioBootstrapSource +
			(bindings.mediaDevices ? pageMediaDevicesBootstrapSource : ""),
	);
	let expectedFailure = false;
	const close = async () => {
		bindings.close();
		try {
			await Promise.all([
				bindings.mediaDevices?.close(),
				bindings.webAudio?.close(),
				bindings.mediaStreams?.close(),
			]);
		} finally {
			document.close();
		}
	};
	cleanups.push(async () => {
		if (expectedFailure) await close().catch(() => {});
		else await close();
	});
	const devices = bindings.mediaDevices;
	const register = (
		open: PageAudioInput["open"] = () => source(),
	): ReturnType<NonNullable<typeof devices>["registerAudioInput"]> => {
		if (!devices) throw new Error("Missing media devices");
		return devices.registerAudioInput({
			deviceId: "mic",
			groupId: "group",
			label: "Supplied input",
			sampleRate: 48000,
			channels: 1,
			open,
		});
	};
	return {
		bindings,
		devices,
		port,
		document,
		evaluate,
		register,
		close,
		released,
		lifecycle,
		expectCleanupFailure() {
			expectedFailure = true;
		},
	};
}
function source() {
	let startFrame = 0;
	return {
		read: async () => {
			const packet = { startFrame, channels: [new Float32Array([0.25, -0.5])] };
			startFrame += 2;
			return packet;
		},
		close: vi.fn<AudioRecordingSource["close"]>(),
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

it.each([
	["https://example.test", true],
	["http://example.test", false],
	["http://localhost:8000", true],
	["http://sub.localhost", true],
	["http://127.0.0.2", true],
	["http://[::1]", true],
	["http://localhost.example.test", false],
	["http://[::2]", false],
	["data:text/html,test", false],
	["file:///test", false],
])(
	"exposes media devices only for supported trustworthy origins: %s",
	(url, supported) => {
		const test = fixture(url as string);
		expect(test.evaluate('"mediaDevices" in navigator')).toBe(supported);
		expect(
			pageBindingGlobalNames(test.document, {}, true, true).includes(
				"__agentBrowserMediaDevicesBootstrap",
			),
		).toBe(supported);
	},
);

it("does not invent devices or successful capture when no input is registered", async () => {
	const test = fixture();
	expect(
		await test.evaluate("navigator.mediaDevices.enumerateDevices()"),
	).toEqual([]);
	await expect(
		test.evaluate("navigator.mediaDevices.getUserMedia({audio:true})"),
	).rejects.toMatchObject({ name: "NotFoundError" });
	await expect(
		test.evaluate("navigator.mediaDevices.getUserMedia({video:true})"),
	).rejects.toMatchObject({ name: "NotFoundError" });
	expect(
		test.evaluate("navigator.mediaDevices.getSupportedConstraints()"),
	).toEqual({
		deviceId: true,
		groupId: true,
		sampleRate: true,
		channelCount: true,
	});
	await expect(
		test.evaluate("navigator.mediaDevices.enumerateDevices.call({})"),
	).rejects.toMatchObject({ name: "TypeError" });
});

it("acquires registered samples, preserves device settings in clones and closes once", async () => {
	const test = fixture();
	const input = source();
	const open = vi.fn(() => input);
	test.register(open);
	const devices = await test.evaluate(
		"navigator.mediaDevices.enumerateDevices()",
	);
	expect(devices[0].toJSON()).toEqual({
		deviceId: "mic",
		groupId: "group",
		label: "Supplied input",
		kind: "audioinput",
	});
	devices[0].label = "modified";
	expect(
		(await test.evaluate("navigator.mediaDevices.enumerateDevices()"))[0].label,
	).toBe("Supplied input");
	await test.evaluate(
		"var stream; navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:'mic'},channelCount:{exact:1},sampleRate:{min:16000,max:48000}}}).then(value=>{stream=value})",
	);
	expect(open).toHaveBeenCalledOnce();
	expect(test.evaluate("stream instanceof MediaStream")).toBe(true);
	expect(
		test.evaluate(
			"var track=stream.getTracks()[0]; var clone=track.clone(); clone.getSettings()",
		),
	).toEqual({
		deviceId: "mic",
		groupId: "group",
		sampleRate: 48000,
		channelCount: 1,
	});
	const id = test.evaluate("track.id");
	const reader = test.bindings.mediaStreams?.openAudioReader(id);
	expect(
		(await reader?.read(new AbortController().signal))?.channels[0],
	).toEqual(new Float32Array([0.25, -0.5]));
	test.evaluate("clone.stop()");
	expect(test.evaluate("track.readyState")).toBe("live");
	await test.close();
	expect(input.close).toHaveBeenCalledOnce();
	expect(test.devices?.metrics().cleanupVerified).toBe(true);
	expect(test.bindings.mediaStreams?.metrics().cleanupVerified).toBe(true);
});

it("selects exact and ideal device constraints before invoking providers", async () => {
	const test = fixture();
	const first = vi.fn(() => source());
	const second = vi.fn(() => source());
	test.register(first);
	test.devices?.registerAudioInput({
		deviceId: "second",
		groupId: "other",
		channels: 2,
		sampleRate: 16000,
		open: second,
	});
	await test.evaluate(
		"navigator.mediaDevices.getUserMedia({audio:{deviceId:['second'],sampleRate:16000,echoCancellation:true}})",
	);
	expect(first).not.toHaveBeenCalled();
	expect(second).toHaveBeenCalledOnce();
	for (const [audio, constraint] of [
		["{deviceId:{exact:'missing'}}", "deviceId"],
		["{groupId:{exact:['missing']}}", "groupId"],
		["{sampleRate:{exact:44100}}", "sampleRate"],
		["{channelCount:{min:3}}", "channelCount"],
	])
		await expect(
			test.evaluate(`navigator.mediaDevices.getUserMedia({audio:${audio}})`),
		).rejects.toMatchObject({ name: "OverconstrainedError", constraint });
	expect(first).not.toHaveBeenCalled();
	expect(second).toHaveBeenCalledOnce();
});

it.each([
	"{}",
	"{audio:false}",
	"{audio:[]}",
	"{audio:{deviceId:{exact:new Array(17).fill('x')}}}",
	"{audio:{sampleRate:{exact:NaN}}}",
	"{audio:{channelCount:-1}}",
	"{audio:{deviceId:Symbol()}}",
])("rejects invalid or excessive constraints: %s", async (value) => {
	const test = fixture();
	const open = vi.fn(() => source());
	test.register(open);
	await expect(
		test.evaluate(`navigator.mediaDevices.getUserMedia(${value})`),
	).rejects.toMatchObject({ name: "TypeError" });
	expect(open).not.toHaveBeenCalled();
});

it("sanitizes provider errors and releases the pending slot", async () => {
	const test = fixture();
	test.register(() => {
		throw new Error("private device details");
	});
	await expect(
		test.evaluate("navigator.mediaDevices.getUserMedia({audio:true})"),
	).rejects.toMatchObject({
		name: "NotReadableError",
		message: "Media request failed: NotReadableError",
	});
	await test.close();
	expect(test.devices?.metrics().cleanupVerified).toBe(true);
});

it("aborts pending acquisition on close, releases the facade synchronously and waits for late source cleanup", async () => {
	const test = fixture();
	const opened = deferred<AudioRecordingSource>();
	const acknowledged = deferred<void>();
	const input = source();
	input.close.mockImplementation(() => acknowledged.promise);
	let signal: AbortSignal | undefined;
	test.devices?.registerAudioInput({
		deviceId: "mic",
		groupId: "g",
		channels: 1,
		sampleRate: 48000,
		open: (value) => {
			signal = value;
			return opened.promise;
		},
	});
	const request = test.evaluate(
		"navigator.mediaDevices.getUserMedia({audio:true})",
	);
	const rejected = expect(request).rejects.toMatchObject({
		name: "AbortError",
	});
	await Promise.resolve();
	let complete = false;
	const closing = test.close().then(() => {
		complete = true;
	});
	expect(signal?.aborted).toBe(true);
	expect(test.devices?.metrics().guestReferences).toBe(0);
	await rejected;
	expect(complete).toBe(false);
	opened.resolve(input);
	for (let i = 0; i < 10; i++) await Promise.resolve();
	expect(input.close).toHaveBeenCalledOnce();
	expect(complete).toBe(false);
	acknowledged.resolve();
	await closing;
	expect(test.devices?.metrics().cleanupVerified).toBe(true);
});

it("bounds timed-out providers until their cancellation is acknowledged", async () => {
	vi.useFakeTimers();
	const test = fixture();
	const opened = deferred<AudioRecordingSource>();
	test.register(() => opened.promise);
	const requests = Array.from({ length: 8 }, () =>
		test
			.evaluate("navigator.mediaDevices.getUserMedia({audio:true})")
			.catch((error: Error) => error.name),
	);
	await expect(
		test.evaluate("navigator.mediaDevices.getUserMedia({audio:true})"),
	).rejects.toMatchObject({ name: "NotReadableError" });
	await vi.advanceTimersByTimeAsync(10000);
	expect(await Promise.all(requests)).toEqual(Array(8).fill("AbortError"));
	expect(test.devices?.metrics().pendingAcquisitions).toBe(8);
	await expect(
		test.evaluate("navigator.mediaDevices.getUserMedia({audio:true})"),
	).rejects.toMatchObject({ name: "NotReadableError" });
	opened.resolve(source());
	await test.close();
	expect(test.devices?.metrics().cleanupVerified).toBe(true);
	expect(vi.getTimerCount()).toBe(0);
});

it("unregistering cancels pending opens but keeps already acquired tracks alive", async () => {
	const test = fixture();
	const input = source();
	const registration = test.register(() => input);
	await test.evaluate(
		"var stream; navigator.mediaDevices.getUserMedia({audio:true}).then(value=>{stream=value})",
	);
	registration.unregister();
	expect(
		await test.evaluate("navigator.mediaDevices.enumerateDevices()"),
	).toEqual([]);
	expect(test.evaluate("stream.getTracks()[0].readyState")).toBe("live");
	expect(input.close).not.toHaveBeenCalled();
	const opened = deferred<AudioRecordingSource>();
	const next = test.register(() => opened.promise);
	const request = test.evaluate(
		"navigator.mediaDevices.getUserMedia({audio:true})",
	);
	const rejected = expect(request).rejects.toMatchObject({
		name: "AbortError",
	});
	await Promise.resolve();
	next.unregister();
	await rejected;
	const late = source();
	opened.resolve(late);
	await test.close();
	expect(late.close).toHaveBeenCalledOnce();
	expect(input.close).toHaveBeenCalledOnce();
});

it("cleans up an acquired source when stream attachment fails", async () => {
	const test = fixture();
	const input = source();
	test.register(() => input);
	test.evaluate(
		"Object.defineProperty(MediaStream.prototype,'id',{get(){return 'foreign'}})",
	);
	await expect(
		test.evaluate("navigator.mediaDevices.getUserMedia({audio:true})"),
	).rejects.toMatchObject({ name: "NotReadableError" });
	await test.close();
	expect(input.close).toHaveBeenCalledOnce();
	expect(test.devices?.metrics().cleanupVerified).toBe(true);
});

it("reports late source cleanup failure to the owner without exposing it to the page", async () => {
	const test = fixture();
	test.expectCleanupFailure();
	const opened = deferred<AudioRecordingSource>();
	test.register(() => opened.promise);
	const request = test.evaluate(
		"navigator.mediaDevices.getUserMedia({audio:true})",
	);
	const rejected = expect(request).rejects.toMatchObject({
		name: "AbortError",
	});
	await Promise.resolve();
	const closing = test.close();
	const failed = expect(closing).rejects.toThrow("Media device cleanup failed");
	await rejected;
	const input = source();
	input.close.mockRejectedValue(new Error("close failed"));
	opened.resolve(input);
	await failed;
	expect(input.close).toHaveBeenCalledOnce();
	expect(test.devices?.metrics().cleanupVerified).toBe(false);
});

it("expires abandoned ready leases and closes their source once", async () => {
	vi.useFakeTimers();
	const test = fixture();
	const input = source();
	test.register(() => input);
	const result = (await test.port?.acquire({})) as { lease: string };
	expect(result.lease).toBeTypeOf("string");
	expect(test.devices?.metrics().pendingAcquisitions).toBe(1);
	await vi.advanceTimersByTimeAsync(10000);
	expect(input.close).toHaveBeenCalledOnce();
	expect(test.devices?.metrics().pendingAcquisitions).toBe(0);
	expect(test.port?.attach(result.lease, "unused")).toEqual({
		error: "AbortError",
	});
	await test.close();
	expect(vi.getTimerCount()).toBe(0);
});

it("validates native constraints independently of the guest normalizer", async () => {
	const test = fixture();
	const open = vi.fn(() => source());
	test.register(open);
	for (const constraints of [
		null,
		[],
		{ deviceId: { exact: Array(17).fill("mic") } },
		{ sampleRate: { exact: Number.POSITIVE_INFINITY } },
		{ channelCount: { min: -1 } },
	]) {
		expect(await test.port?.acquire(constraints)).toEqual({
			error: "TypeError",
		});
	}
	expect(open).not.toHaveBeenCalled();
});

it("closes malformed provider sources that still supply a cleanup operation", async () => {
	const test = fixture();
	const close = vi.fn();
	test.register(() => ({ close }) as unknown as AudioRecordingSource);
	await expect(
		test.evaluate("navigator.mediaDevices.getUserMedia({audio:true})"),
	).rejects.toMatchObject({ name: "NotReadableError" });
	await test.close();
	expect(close).toHaveBeenCalledOnce();
});
