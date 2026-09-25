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
import { pageWebAudioBootstrapSource } from "./page-web-audio-bootstrap.js";
import { PageWebAudio } from "./page-web-audio.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of cleanups.splice(0)) await close();
	vi.restoreAllMocks();
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
	const audio = new PageWebAudio(context, lifecycle, owner);
	const vm = createContext({
		__agentBrowserWebAudioBootstrap: audio.bootstrap,
		__agentBrowserMediaStreamBootstrap: owner.bootstrap,
	});
	setupComplete = true;
	const evaluate = (source: string) =>
		runInContext(source, vm, { timeout: 1000 });
	evaluate(pageMediaStreamBootstrapSource + pageWebAudioBootstrapSource);
	const close = async () => {
		try {
			await audio.close();
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
		audio,
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
it("runs the notetaker virtual microphone graph with real silent audio and cloned tracks", async () => {
	const test = fixture();
	const ids: string[] = test.evaluate(
		"var context=new AudioContext({sampleRate:48000}); var destination=context.createMediaStreamDestination(); var oscillator=context.createOscillator(); var gain=context.createGain(); gain.gain.value=0; oscillator.connect(gain).connect(destination); oscillator.start(); var stream=destination.stream; var clone=stream.clone(); [stream.getAudioTracks()[0].id,clone.getAudioTracks()[0].id]",
	);
	expect(
		test.evaluate(
			"[context.state,context.sampleRate,stream instanceof MediaStream,destination instanceof AudioNode,oscillator.context===context,stream.getTracks()[0].getSettings().channelCount]",
		),
	).toEqual(["running", 48000, true, true, true, 2]);
	const readers = ids.map((id) => test.owner.openAudioReader(id));
	const packets = await Promise.all(
		readers.map((reader) => reader.read(new AbortController().signal)),
	);
	expect(
		packets.every((packet) =>
			packet?.channels.every((channel) =>
				channel.every((sample) => sample === 0),
			),
		),
	).toBe(true);
	test.evaluate("clone.getTracks()[0].stop()");
	await readers[1].close();
	expect(await readers[0].read(new AbortController().signal)).not.toBeNull();
	await test.evaluate("context.close()");
	expect(test.evaluate("stream.getTracks()[0].readyState")).toBe("ended");
	await test.close();
	expect(test.owner.metrics().cleanupVerified).toBe(true);
});
it("produces audible samples when gain is nonzero and rejects foreign connections", async () => {
	const test = fixture();
	const id: string = test.evaluate(
		"var context=new AudioContext(); var destination=context.createMediaStreamDestination(); var oscillator=context.createOscillator(); var gain=context.createGain(); gain.gain.value=0.5; oscillator.connect(gain).connect(destination); oscillator.start(); var other=new AudioContext(); destination.stream.getTracks()[0].id",
	);
	const reader = test.owner.openAudioReader(id);
	let audible = false;
	for (let i = 0; i < 4 && !audible; i++) {
		const packet = await reader.read(new AbortController().signal);
		audible =
			packet?.channels[0].some((value) => Math.abs(value) > 0.4) ?? false;
	}
	expect(audible).toBe(true);
	expect(() => test.evaluate("gain.connect(other.createGain())")).toThrow(
		/another context/,
	);
	expect(() =>
		test.evaluate("AudioContext.prototype.createGain.call({})"),
	).toThrow(/receiver/);
	expect(() => test.evaluate("gain.connect({})")).toThrow(/receiver/);
	expect(() => test.evaluate("oscillator.type='square'")).toThrow(/sine/);
});
it("releases guest constructors synchronously before runtime teardown", async () => {
	const test = fixture();
	const closing = test.audio.close();
	expect(test.released).toHaveBeenCalledTimes(6);
	expect(test.audio.metrics().guestReferences).toBe(0);
	await closing;
});
it("clamps past automation to current time without rewriting elapsed phase", async () => {
	let now = 0;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const test = fixture();
	const id: string = test.evaluate(
		"var context=new AudioContext();var oscillator=context.createOscillator();var destination=context.createMediaStreamDestination();oscillator.frequency.value=1000;oscillator.connect(destination);oscillator.start();destination.stream.getTracks()[0].id",
	);
	now = 1;
	test.evaluate("oscillator.frequency.setValueAtTime(500,0)");
	expect(() =>
		test.evaluate("oscillator.frequency.setValueAtTime(1,-1)"),
	).toThrow(/negative/);
	now = 3;
	const reader = test.owner.openAudioReader(id);
	const packet = await reader.read(new AbortController().signal);
	expect(packet?.channels[0][12]).toBeCloseTo(1, 6);
	expect(packet?.channels[0][72]).toBeCloseTo(1, 6);
});
it("closing a context ends idle destination tracks without requiring a read", async () => {
	const test = fixture();
	test.evaluate(
		"var context=new AudioContext(); var destination=context.createMediaStreamDestination(); var track=destination.stream.getTracks()[0]; var ended=0;track.onended=()=>{ended++};",
	);
	await test.evaluate("context.close()");
	await new Promise((resolve) => setTimeout(resolve, 15));
	expect(test.evaluate("[track.readyState,ended,context.state]")).toEqual([
		"ended",
		1,
		"closed",
	]);
});
it("suspends and resumes page audio and releases constructors on page close", async () => {
	const test = fixture();
	test.evaluate(
		"var context=new AudioContext();var destination=context.createMediaStreamDestination();",
	);
	await test.evaluate("context.suspend()");
	expect(test.evaluate("context.state")).toBe("suspended");
	await test.evaluate("context.resume()");
	expect(test.evaluate("context.state")).toBe("running");
	await test.close();
	expect(test.audio.metrics()).toMatchObject({
		closed: true,
		guestReferences: 0,
		nodes: 0,
	});
	expect(() => test.evaluate("new AudioContext()")).toThrow(/closed/);
});
