import { afterEach, expect, it, vi } from "vitest";
import { NativeAudioContext } from "./audio-graph.js";

const contexts: NativeAudioContext[] = [];
afterEach(() => {
	for (const context of contexts.splice(0)) context.close();
	vi.useRealTimers();
});
function fixture() {
	vi.useFakeTimers();
	const context = new NativeAudioContext(48000, () => Date.now());
	contexts.push(context);
	const oscillator = context.createOscillator();
	const gain = context.createGain();
	const destination = context.createDestination();
	context.connect(oscillator, gain);
	context.connect(gain, destination.node);
	context.start(oscillator, 0);
	return { context, oscillator, gain, destination };
}
it("schedules stereo PCM at its source rate and preserves the final quantum before ended cleanup", async () => {
	vi.useFakeTimers();
	const context = new NativeAudioContext(48000, () => Date.now());
	contexts.push(context);
	const destination = context.createDestination();
	const ended = vi.fn();
	const source = context.createBufferSource(ended);
	context.setBuffer(
		source,
		[new Float32Array(64).fill(0.25), new Float32Array(64).fill(-0.5)],
		24000,
	);
	context.connect(source, destination.node);
	context.start(source, 0);
	await vi.advanceTimersByTimeAsync(3);
	expect(ended).toHaveBeenCalledTimes(1);
	const packet = await destination.source.read(new AbortController().signal);
	expect(packet?.channels[0][12]).toBe(0.25);
	expect(packet?.channels[1][12]).toBe(-0.5);
	expect(context.metrics().bufferBytes).toBe(0);
	expect(context.metrics().nodes).toBe(1);
});
it("snapshots PCM at start and supports scheduled offset, duration and independent suspension", async () => {
	vi.useFakeTimers();
	const context = new NativeAudioContext(48000, () => Date.now());
	contexts.push(context);
	const destination = context.createDestination();
	const ended = vi.fn();
	const source = context.createBufferSource(ended);
	const pcm = new Float32Array(256).fill(0.75);
	pcm.fill(0, 0, 48);
	context.setBuffer(source, [pcm], 48000);
	context.connect(source, destination.node);
	context.start(source, 0.001, 0.001, 0.001);
	pcm.fill(0);
	context.suspend();
	await vi.advanceTimersByTimeAsync(100);
	expect(ended).not.toHaveBeenCalled();
	context.resume();
	await vi.advanceTimersByTimeAsync(3);
	const packet = await destination.source.read(new AbortController().signal);
	expect(packet?.channels[0][0]).toBe(0);
	expect(packet?.channels[0][60]).toBe(0.75);
	expect(packet?.channels[0][110]).toBe(0);
	expect(ended).toHaveBeenCalledTimes(1);
	expect(() => context.start(source)).toThrow();
});
it("reclaims finished chunks so a PCM stream can play beyond the active node limit", async () => {
	vi.useFakeTimers();
	const context = new NativeAudioContext(48000, () => Date.now());
	contexts.push(context);
	const destination = context.createDestination();
	for (let i = 0; i < 140; i++) {
		const source = context.createBufferSource();
		context.setBuffer(source, [new Float32Array(48)], 48000);
		context.connect(source, destination.node);
		context.start(source);
		await vi.advanceTimersByTimeAsync(4);
	}
	expect(context.metrics()).toMatchObject({
		nodes: 1,
		bufferBytes: 0,
		connections: 0,
		scheduledSources: 0,
	});
	context.close();
	expect(vi.getTimerCount()).toBe(0);
});
it("bounds PCM storage and scheduling and releases a stopped source once", async () => {
	vi.useFakeTimers();
	const context = new NativeAudioContext(48000, () => Date.now());
	contexts.push(context);
	const ended = vi.fn();
	const source = context.createBufferSource(ended);
	expect(() =>
		context.setBuffer(source, [new Float32Array([Number.NaN])], 48000),
	).toThrow(/finite/);
	expect(() =>
		context.setBuffer(
			source,
			[new Float32Array(64), new Float32Array(32)],
			48000,
		),
	).toThrow(/buffer/);
	context.setBuffer(source, [new Float32Array(48000)], 48000);
	expect(() => context.start(source, 1e12)).toThrow(/duration/);
	context.start(source);
	context.stop(source, 0.001);
	await vi.advanceTimersByTimeAsync(3);
	context.stop(source, 1);
	await vi.advanceTimersByTimeAsync(10);
	expect(ended).toHaveBeenCalledTimes(1);
	expect(context.metrics()).toMatchObject({
		bufferBytes: 0,
		nodes: 0,
		scheduledSources: 0,
		timers: 0,
	});
});
it("retains source limits after an oversized buffer is rejected", () => {
	const { context } = fixture();
	const source = context.createBufferSource();
	const channel = new Float32Array(4_194_305);
	expect(() => context.setBuffer(source, [channel, channel], 48000)).toThrow(
		/memory limit/,
	);
	expect(context.metrics().bufferBytes).toBe(0);
});
it("produces clocked stereo sine audio and applies gain", async () => {
	const { context, oscillator, gain, destination } = fixture();
	oscillator.parameter.set(1000, 0);
	gain.parameter.set(0.25, 0);
	const pending = destination.source.read(new AbortController().signal);
	await vi.advanceTimersByTimeAsync(3);
	const packet = await pending;
	expect(packet?.startFrame).toBe(0);
	expect(packet?.channels).toHaveLength(2);
	expect(packet?.channels[0][12]).toBeCloseTo(0.25, 6);
	expect(packet?.channels[1]).toEqual(packet?.channels[0]);
	expect(context.currentTime).toBeCloseTo(0.003, 6);
});
it("preserves the notetaker's silent oscillator destination", async () => {
	const { gain, destination } = fixture();
	gain.parameter.set(0, 0);
	const pending = destination.source.read(new AbortController().signal);
	await vi.advanceTimersByTimeAsync(3);
	expect(
		(await pending)?.channels.every((channel) =>
			channel.every((value) => value === 0),
		),
	).toBe(true);
});
it("keeps phase continuous across frequency changes and supports scheduled gain", async () => {
	const { oscillator, gain, destination } = fixture();
	oscillator.parameter.set(1000, 0);
	oscillator.parameter.set(2000, 0.001);
	gain.parameter.set(0, 0);
	gain.parameter.set(0.5, 0.001);
	const pending = destination.source.read(new AbortController().signal);
	await vi.advanceTimersByTimeAsync(3);
	const channel = (await pending)?.channels[0];
	if (!channel) throw new Error("Missing audio");
	expect(channel[12]).toBe(0);
	expect(channel[54]).toBeCloseTo(0.5, 6);
});
it("suspends the clock and pending reads, resumes, and closes without timers", async () => {
	const { context, destination } = fixture();
	context.suspend();
	let settled = false;
	const pending = destination.source
		.read(new AbortController().signal)
		.then((value) => {
			settled = true;
			return value;
		});
	await vi.advanceTimersByTimeAsync(100);
	expect(context.currentTime).toBe(0);
	expect(settled).toBe(false);
	context.resume();
	await vi.advanceTimersByTimeAsync(3);
	expect(await pending).not.toBeNull();
	const next = destination.source.read(new AbortController().signal);
	context.close();
	expect(await next).toBeNull();
	expect(context.metrics()).toMatchObject({
		state: "closed",
		nodes: 0,
		pendingReads: 0,
		timers: 0,
		sources: 0,
	});
	expect(vi.getTimerCount()).toBe(0);
});
it("does not revive an oscillator when stop is called after it ended", async () => {
	const { context, oscillator, destination } = fixture();
	context.stop(oscillator, 0.001);
	await vi.advanceTimersByTimeAsync(10);
	context.stop(oscillator, 1);
	const packet = await destination.source.read(new AbortController().signal);
	expect(packet?.channels[0].every((value) => value === 0)).toBe(true);
});
it("drops elapsed quanta instead of retaining a backlog", async () => {
	const { context, destination } = fixture();
	await vi.advanceTimersByTimeAsync(1000);
	const packet = await destination.source.read(new AbortController().signal);
	expect(packet?.startFrame).toBe(47872);
	expect(packet?.channels[0]).toHaveLength(128);
	expect(context.metrics().timers).toBe(0);
});
it("bounds graph nodes, outputs and automation histories", () => {
	const { context, gain } = fixture();
	for (let i = 1; i < 512; i++) gain.parameter.set(1, i);
	expect(() => gain.parameter.set(1, 512)).toThrow(/event limit/);
	for (let i = 1; i < 16; i++) context.createDestination();
	expect(() => context.createDestination()).toThrow(/destination limit/);
	while (context.metrics().nodes < 128) context.createGain();
	expect(() => context.createGain()).toThrow(/node limit/);
	context.close();
	expect(context.metrics()).toMatchObject({
		nodes: 0,
		connections: 0,
		sources: 0,
	});
});
it("rejects cycles, foreign nodes, duplicate starts and invalid parameters", () => {
	const { context, oscillator, gain, destination } = fixture();
	expect(() => context.start(oscillator, 0)).toThrow();
	expect(() => context.connect(gain, oscillator)).toThrow();
	expect(() => context.connect(gain, gain)).toThrow();
	const second = new NativeAudioContext();
	contexts.push(second);
	expect(() => context.connect(oscillator, second.createGain())).toThrow();
	expect(() => gain.parameter.set(Number.NaN, 0)).toThrow();
	expect(() => context.connect(destination.node, gain)).toThrow();
});
it("ends one destination independently and cancels a pending read", async () => {
	const { context, oscillator, destination } = fixture();
	const second = context.createDestination();
	context.connect(oscillator, second.node);
	const controller = new AbortController();
	const pending = destination.source.read(controller.signal);
	const failed = expect(pending).rejects.toBe("cancelled");
	controller.abort("cancelled");
	await failed;
	destination.source.close();
	const reading = second.source.read(new AbortController().signal);
	await vi.advanceTimersByTimeAsync(3);
	expect(await reading).not.toBeNull();
	expect(context.metrics().sources).toBe(1);
});
it("renders stopped oscillators as silence while keeping the destination live", async () => {
	const { context, oscillator, destination } = fixture();
	context.stop(oscillator, 0.001);
	const pending = destination.source.read(new AbortController().signal);
	await vi.advanceTimersByTimeAsync(3);
	const packet = await pending;
	if (!packet) throw new Error("Missing audio");
	expect(packet.channels[0].slice(48).every((value) => value === 0)).toBe(true);
});
