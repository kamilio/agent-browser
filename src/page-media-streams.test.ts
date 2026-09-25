import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
} from "./page-bindings.js";
import { pageMediaStreamBootstrapSource } from "./page-media-stream-bootstrap.js";
import { PageMediaStreams } from "./page-media-streams.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of cleanups.splice(0)) await close();
});
function fixture() {
	const document = new DocumentTree("https://example.test/");
	const interactions = new DocumentInteractions(document);
	const released = vi.fn();
	let setupComplete = false;
	const context: PageBindingContext = {
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
			if (setupComplete)
				throw new Error("Retained operations must be registered during setup");
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
	);
	const events = bindings.dom.eventBindings;
	if (!events) throw new Error("Missing event bindings");
	const owner = new PageMediaStreams(
		document,
		context,
		lifecycle,
		interactions.events,
		events,
	);
	const vm = createContext({
		__agentBrowserMediaStreamBootstrap: owner.bootstrap,
	});
	setupComplete = true;
	const evaluate = (source: string) =>
		runInContext(source, vm, { timeout: 1000 });
	evaluate(pageMediaStreamBootstrapSource);
	const close = async () => {
		try {
			await owner.close();
		} finally {
			bindings.close();
			document.close();
		}
	};
	let cleanupFailureExpected = false;
	cleanups.push(async () => {
		if (cleanupFailureExpected) await close().catch(() => {});
		else await close();
	});
	return {
		owner,
		vm,
		evaluate,
		close,
		released,
		lifecycle,
		expectCleanupFailure: () => {
			cleanupFailureExpected = true;
		},
	};
}
async function supplied(test: ReturnType<typeof fixture>) {
	let frame = 0;
	const source = {
		read: vi.fn(async () => {
			const startFrame = frame;
			frame += 128;
			return { startFrame, channels: [new Float32Array(128).fill(0.5)] };
		}),
		close: vi.fn(),
	};
	test.vm.stream = await test.owner.createAudioStream(source, {
		sampleRate: 48000,
		channels: 1,
		label: "Supplied audio",
	});
	return source;
}

it("constructs empty streams and rejects forged track objects", async () => {
	const test = fixture();
	expect(
		test.evaluate(
			"var empty = new MediaStream(); [empty.active, empty.getTracks().length, empty.getVideoTracks().length, Object.prototype.toString.call(empty)]",
		),
	).toEqual([false, 0, 0, "[object MediaStream]"]);
	expect(() => test.evaluate("new MediaStreamTrack()")).toThrow(/Illegal/);
	expect(() => test.evaluate("new MediaStream([{kind:'audio'}])")).toThrow(
		/receiver/,
	);
	expect(() =>
		test.evaluate("MediaStream.prototype.getTracks.call({})"),
	).toThrow(/receiver/);
	expect(() =>
		test.evaluate(
			"MediaStream.prototype.getAudioTracks.call({getTracks(){return []}})",
		),
	).toThrow(/receiver/);
});

it("copies stream membership but clones tracks only for clone()", async () => {
	const test = fixture();
	await supplied(test);
	expect(
		test.evaluate(`var original = stream.getAudioTracks()[0]; var copied = new MediaStream(stream); var cloned = stream.clone(); var clone = cloned.getAudioTracks()[0];
		[stream.active, copied.getTracks()[0] === original, clone !== original, clone.id !== original.id, clone.label, clone.getSettings().sampleRate]`),
	).toEqual([true, true, true, true, "Supplied audio", 48000]);
	expect(
		test.evaluate(
			"copied.removeTrack(original); [copied.active, stream.active, original.readyState, stream.getTrackById(original.id) === original]",
		),
	).toEqual([false, true, "live", true]);
	expect(
		test.evaluate(
			"copied.addTrack(original); copied.addTrack(original); copied.getTracks().length",
		),
	).toBe(1);
});

it("keeps an idle original track alive when a clone and its reader stop", async () => {
	const test = fixture();
	const source = await supplied(test);
	const ids: string[] = test.evaluate(
		"var original = stream.getTracks()[0]; var clone = original.clone(); [original.id, clone.id]",
	);
	const reader = test.owner.openAudioReader(ids[1]);
	expect(
		(await reader.read(new AbortController().signal))?.channels[0][0],
	).toBe(0.5);
	test.evaluate("clone.stop()");
	await reader.close();
	expect(source.close).not.toHaveBeenCalled();
	expect(
		test.evaluate("[original.readyState, clone.readyState, stream.active]"),
	).toEqual(["live", "ended", true]);
	const next = test.owner.openAudioReader(ids[0]);
	expect((await next.read(new AbortController().signal))?.startFrame).toBe(128);
	test.evaluate("original.stop()");
	await test.close();
	expect(source.close).toHaveBeenCalledOnce();
});

it("silences only a disabled track's reader", async () => {
	const test = fixture();
	await supplied(test);
	const ids: string[] = test.evaluate(
		"var original = stream.getTracks()[0]; var clone = original.clone(); clone.enabled=false; [original.id,clone.id]",
	);
	const readers = ids.map((id) => test.owner.openAudioReader(id));
	const packets = await Promise.all(
		readers.map((reader) => reader.read(new AbortController().signal)),
	);
	expect(packets.map((packet) => packet?.channels[0][0])).toEqual([0.5, 0]);
	test.evaluate("clone.enabled=true");
	const resumed = await Promise.all(
		readers.map((reader) => reader.read(new AbortController().signal)),
	);
	expect(resumed.map((packet) => packet?.channels[0][0])).toEqual([0.5, 0.5]);
});

it("reports source EOF as ended but does not fire ended for explicit stop", async () => {
	const test = fixture();
	const source = { read: async () => null, close: vi.fn() };
	test.vm.stream = await test.owner.createAudioStream(source, {
		sampleRate: 16000,
		channels: 1,
	});
	const id: string = test.evaluate(
		"var original=stream.getTracks()[0]; var clone=original.clone(); var calls=[]; original.addEventListener('ended',function(event){calls.push([event.type,this===original,event.target===original]);}); clone.onended=()=>calls.push('clone'); clone.stop(); original.id",
	);
	const reader = test.owner.openAudioReader(id);
	expect(await reader.read(new AbortController().signal)).toBe(null);
	await new Promise((resolve) => setTimeout(resolve, 15));
	expect(test.evaluate("[original.readyState, stream.active, calls]")).toEqual([
		"ended",
		false,
		[["ended", true, true]],
	]);
	await reader.close();
	expect(source.close).toHaveBeenCalledOnce();
});

it("waits for an outstanding source read during document cleanup", async () => {
	const test = fixture();
	let finishRead: (value: null) => void = () => {};
	const pending = new Promise<null>((resolve) => {
		finishRead = resolve;
	});
	const source = { read: vi.fn(() => pending), close: vi.fn() };
	test.vm.stream = await test.owner.createAudioStream(source, {
		sampleRate: 16000,
		channels: 1,
	});
	const id: string = test.evaluate("stream.getTracks()[0].id");
	const reader = test.owner.openAudioReader(id);
	const reading = reader.read(new AbortController().signal);
	await Promise.resolve();
	await Promise.resolve();
	let settled = false;
	const closing = test.owner.close().then(() => {
		settled = true;
	});
	expect(await reading).toBe(null);
	await Promise.resolve();
	expect(settled).toBe(false);
	expect(test.owner.metrics().cleanupVerified).toBe(false);
	finishRead(null);
	await closing;
	expect(source.close).toHaveBeenCalledOnce();
	expect(test.owner.metrics()).toMatchObject({
		guestReferences: 0,
		cleanupVerified: true,
	});
});

it("bounds track creation and preserves a stopped clone's state", async () => {
	const test = fixture();
	const source = await supplied(test);
	test.evaluate(
		"var track=stream.getTracks()[0]; var clones=[]; for(var i=0;i<127;i++)clones.push(track.clone());",
	);
	expect(() => test.evaluate("track.clone()")).toThrow(/limit/);
	expect(
		test.evaluate(
			"var oldId=clones[0].id; clones[0].stop(); [clones[0].readyState,clones[0].id===oldId,track.readyState]",
		),
	).toEqual(["ended", true, "live"]);
	await test.close();
	expect(source.close).toHaveBeenCalledOnce();
	expect(test.owner.metrics().cleanupVerified).toBe(true);
});

it("returns fresh settings and keeps internal track enumeration independent of overrides", async () => {
	const test = fixture();
	await supplied(test);
	expect(
		test.evaluate(
			"var track=stream.getTracks()[0]; var settings=track.getSettings(); settings.sampleRate=1; stream.getTracks=()=>[]; [stream.getAudioTracks().length,track.getSettings().sampleRate]",
		),
	).toEqual([1, 48000]);
});

it("preserves source cleanup failures when guest stream construction fails", async () => {
	const test = fixture();
	const factory = new Error("factory failed");
	const cleanup = new Error("source cleanup failed");
	test.lifecycle.startCallback = () => {
		throw factory;
	};
	test.expectCleanupFailure();
	await expect(
		test.owner.createAudioStream(
			{
				read: async () => null,
				close() {
					throw cleanup;
				},
			},
			{ sampleRate: 16000, channels: 1 },
		),
	).rejects.toMatchObject({ errors: [factory, cleanup] });
	expect(test.owner.metrics().cleanupVerified).toBe(false);
});

it("does not cancel an already-queued ended event when stop is called on an ended track", async () => {
	const test = fixture();
	test.vm.stream = await test.owner.createAudioStream(
		{ read: async () => null, close() {} },
		{ sampleRate: 16000, channels: 1 },
	);
	const id: string = test.evaluate(
		"var track=stream.getTracks()[0]; var calls=0; track.onended=()=>{calls++}; track.id",
	);
	const reader = test.owner.openAudioReader(id);
	await reader.read(new AbortController().signal);
	for (let i = 0; i < 12; i++) await Promise.resolve();
	expect(test.evaluate("track.readyState")).toBe("ended");
	test.evaluate("track.stop()");
	await new Promise((resolve) => setTimeout(resolve, 15));
	expect(test.evaluate("calls")).toBe(1);
	await reader.close();
});
