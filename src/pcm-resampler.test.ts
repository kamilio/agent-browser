import { describe, expect, it } from "vitest";
import { PcmCapture, type PcmCaptureChunk } from "./pcm-capture.js";
import { PcmResampler, type PcmResamplerOptions } from "./pcm-resampler.js";

function options(
	overrides: Partial<PcmResamplerOptions> = {},
): PcmResamplerOptions {
	return {
		inputSampleRate: 48000,
		outputSampleRate: 16000,
		inputChannels: 2,
		outputChannels: 1,
		maxInputFrames: 8192,
		maxOutputFrames: 256,
		maxDurationFrames: 96000,
		...overrides,
	};
}
function fixture(overrides: Partial<PcmResamplerOptions> = {}) {
	const chunks: { pcm: Uint8Array; start: number }[] = [];
	const stream = new PcmResampler(options(overrides), (pcm, start) => {
		chunks.push({ pcm, start });
	});
	return {
		stream,
		chunks,
		samples: () =>
			chunks.flatMap(({ pcm }) => {
				const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
				return Array.from({ length: pcm.byteLength / 2 }, (_, i) =>
					view.getInt16(i * 2, true),
				);
			}),
	};
}
function tone(rate: number, frequency: number, frames: number) {
	return Float32Array.from(
		{ length: frames },
		(_, i) => 0.5 * Math.sin((2 * Math.PI * frequency * i) / rate),
	);
}
function rms(samples: number[]) {
	return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
}

describe("streaming floating-point audio to PCM16", () => {
	it("clips, rounds, downmixes and encodes little-endian samples at the original rate", () => {
		const f = fixture({ inputSampleRate: 16000 });
		f.stream.push(
			[
				new Float32Array([-2, -0.5, 0, 0.5, 2]),
				new Float32Array([-2, 0.5, 0, 0.5, 2]),
			],
			0,
		);
		f.stream.finish();
		expect(f.samples()).toEqual([-32768, 0, 0, 16384, 32767]);
		expect(f.chunks[0].start).toBe(0);
		expect(f.stream.metrics().retainedBytes).toBe(0);
	});
	it.each([
		[48000, 16000],
		[44100, 16000],
		[16000, 48000],
		[96000, 8000],
		[8000, 96000],
	])(
		"keeps %i to %i conversion independent of input packet boundaries",
		(inputSampleRate, outputSampleRate) => {
			const input = tone(inputSampleRate, 1000, 4097);
			const whole = fixture({
				inputSampleRate,
				outputSampleRate,
				inputChannels: 1,
			});
			const split = fixture({
				inputSampleRate,
				outputSampleRate,
				inputChannels: 1,
			});
			whole.stream.push([input], 0);
			for (let i = 0; i < input.length; i += 127)
				split.stream.push([input.subarray(i, i + 127)], i);
			whole.stream.finish();
			split.stream.finish();
			expect(split.samples()).toEqual(whole.samples());
			expect(split.samples()).toHaveLength(
				Math.ceil((input.length * outputSampleRate) / inputSampleRate),
			);
			let frame = 0;
			for (const chunk of split.chunks) {
				expect(chunk.start).toBe(frame);
				frame += chunk.pcm.length / 2;
			}
		},
	);
	it("preserves speech-band energy and rejects frequencies above the recording Nyquist limit", () => {
		const measure = (frequency: number) => {
			const f = fixture({ inputChannels: 1 });
			f.stream.push([tone(48000, frequency, 8192)], 0);
			f.stream.finish();
			return rms(f.samples().slice(128, -128)) / 32768;
		};
		expect(measure(1000)).toBeCloseTo(Math.sqrt(0.125), 3);
		expect(measure(12000)).toBeLessThan(0.001);
	});
	it("keeps stereo channels separate and duplicates mono when producing stereo", () => {
		const stereo = fixture({ inputSampleRate: 16000, outputChannels: 2 });
		stereo.stream.push(
			[new Float32Array([0.25, -0.25]), new Float32Array([-0.5, 0.5])],
			0,
		);
		stereo.stream.finish();
		expect(stereo.samples()).toEqual([8192, -16384, -8192, 16384]);
		const mono = fixture({
			inputSampleRate: 16000,
			inputChannels: 1,
			outputChannels: 2,
		});
		mono.stream.push([new Float32Array([0.25])], 0);
		mono.stream.finish();
		expect(mono.samples()).toEqual([8192, 8192]);
	});
	it("connects 48 kHz audio packets to the existing 16 kHz recording sink with exact clocks", () => {
		const chunks: PcmCaptureChunk[] = [];
		const capture = new PcmCapture(
			{
				sampleRate: 16000,
				channels: 1,
				chunkFrames: 160,
				maxInputFrames: 256,
				maxDurationFrames: 32000,
				maxChunks: 200,
			},
			(chunk) => {
				chunks.push(chunk);
			},
		);
		const stream = new PcmResampler(options(), (pcm, start) =>
			capture.push(pcm, start),
		);
		const input = tone(48000, 1000, 4800);
		for (let i = 0; i < input.length; i += 128)
			stream.push([input.subarray(i, i + 128), input.subarray(i, i + 128)], i);
		stream.finish();
		capture.finish();
		expect(chunks).toHaveLength(10);
		expect(chunks.map((c) => c.startMs)).toEqual([
			0, 10, 20, 30, 40, 50, 60, 70, 80, 90,
		]);
		expect(chunks.at(-1)?.sourceEndFrame).toBe(1600);
		expect(stream.metrics()).toMatchObject({
			state: "finished",
			sourceFrames: 4800,
			outputFrames: 1600,
			retainedBytes: 0,
		});
		expect(capture.metrics()).toMatchObject({
			savedFrames: 1600,
			retainedBytes: 0,
		});
	});
	it("does not bridge a source gap with samples from the preceding segment", () => {
		const f = fixture({ inputChannels: 1 });
		f.stream.push([new Float32Array(300).fill(1)], 0);
		f.stream.push([new Float32Array(300)], 600);
		f.stream.finish();
		expect(f.samples()).toHaveLength(200);
		expect(f.samples().slice(100)).toEqual(new Array(100).fill(0));
		expect(f.chunks.find((c) => c.start === 200)).toBeDefined();
	});
	it("discards pending filter history when pausing a recording", () => {
		const f = fixture({ inputChannels: 1 });
		f.stream.push([new Float32Array(60).fill(1)], 0);
		f.stream.reset();
		expect(f.stream.metrics().retainedFrames).toBe(0);
		f.stream.push([new Float32Array(300)], 600);
		f.stream.finish();
		expect(f.samples()).toEqual(new Array(100).fill(0));
		expect(f.chunks[0].start).toBe(200);
	});
	it("owns input history and output chunks across later mutations", () => {
		const f = fixture({ inputChannels: 1 });
		const original = new Float32Array(200).fill(0.5);
		f.stream.push([original], 0);
		original.fill(0);
		f.stream.push([new Float32Array(200).fill(0.5)], 200);
		f.stream.finish();
		expect(f.samples().slice(40, 90)).toEqual(new Array(50).fill(16384));
		const saved = f.samples();
		f.stream.close();
		expect(f.samples()).toEqual(saved);
	});
	it("validates the complete packet before committing source frames", () => {
		const f = fixture();
		for (const packet of [
			[new Float32Array(4)],
			[new Float32Array(4), new Float32Array(3)],
			[new Float32Array([0, Number.NaN]), new Float32Array(2)],
		]) {
			expect(() => f.stream.push(packet, 0)).toThrow();
			expect(f.stream.metrics().sourceFrames).toBe(0);
		}
		f.stream.push([new Float32Array(300), new Float32Array(300)], 0);
		expect(() =>
			f.stream.push([new Float32Array(4), new Float32Array(4)], 10),
		).toThrow();
		expect(f.stream.metrics().sourceFrames).toBe(300);
		f.stream.close();
		expect(f.stream.metrics().retainedBytes).toBe(0);
	});
	it("rejects shared and forged float views and bounds source and output allocations", () => {
		const f = fixture({
			inputChannels: 1,
			maxInputFrames: 300,
			maxDurationFrames: 600,
		});
		for (const input of [
			new Float32Array(new SharedArrayBuffer(16)),
			new Proxy(new Float32Array(4), {}),
			new Float32Array(301),
		])
			expect(() => f.stream.push([input], 0)).toThrow();
		expect(() => f.stream.push([new Float32Array(100)], 550)).toThrow();
		f.stream.close();
		expect(
			() => new PcmResampler(options({ maxOutputFrames: 100000000 }), () => {}),
		).toThrow();
	});
	it("cleans up on sink failure and rejects reentry", () => {
		const failure = new Error("sink failed");
		const stream: PcmResampler = new PcmResampler(
			options({ inputChannels: 1 }),
			() => {
				expect(() => stream.reset()).toThrow();
				expect(() => stream.finish()).toThrow();
				throw failure;
			},
		);
		expect(() => stream.push([new Float32Array(600)], 0)).toThrow(failure);
		expect(stream.metrics()).toMatchObject({
			state: "failed",
			retainedBytes: 0,
		});
		expect(() => stream.push([new Float32Array(1)], 600)).toThrow();
	});
	it("validates channel views without invoking caller-supplied array methods", () => {
		const f = fixture({ inputChannels: 1, inputSampleRate: 16000 });
		const packet = [new Float32Array([0.5])];
		Object.defineProperty(packet, "map", {
			value: () => {
				throw new Error("foreign map");
			},
		});
		Object.defineProperty(packet[0], "buffer", {
			get: () => {
				throw new Error("foreign buffer");
			},
		});
		f.stream.push(packet, 0);
		f.stream.finish();
		expect(f.samples()).toEqual([16384]);
	});
	it("copies an incoming packet before flushing the preceding segment to a mutable sink", () => {
		const incoming = new Float32Array(300);
		const received: { start: number; pcm: Uint8Array }[] = [];
		let flushingGap = false;
		const stream = new PcmResampler(
			options({ inputChannels: 1 }),
			(pcm, start) => {
				received.push({ start, pcm });
				if (flushingGap) incoming.fill(1);
			},
		);
		stream.push([new Float32Array(300).fill(0.5)], 0);
		flushingGap = true;
		stream.push([incoming], 600);
		stream.finish();
		expect(
			received
				.filter((c) => c.start >= 200)
				.every((c) => c.pcm.every((byte) => byte === 0)),
		).toBe(true);
	});
	it("bounds retained history during many packets and releases it on close", () => {
		const f = fixture({ inputSampleRate: 44100, inputChannels: 1 });
		for (let i = 0; i < 8000; i += 80) {
			f.stream.push([new Float32Array(80)], i);
			expect(f.stream.metrics().retainedFrames).toBeLessThanOrEqual(180);
			expect(f.stream.metrics().retainedBytes).toBeLessThan(400000);
		}
		f.stream.close();
		expect(f.stream.metrics()).toMatchObject({
			state: "closed",
			retainedBytes: 0,
		});
		expect(() => f.stream.finish()).toThrow();
	});
	it("rejects asynchronous sinks and releases their rejected promise", async () => {
		const stream = new PcmResampler(options({ inputChannels: 1 }), async () => {
			throw new Error("async sink");
		});
		expect(() => stream.push([new Float32Array(300)], 0)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		await Promise.resolve();
		expect(stream.metrics()).toMatchObject({
			state: "failed",
			retainedBytes: 0,
		});
	});
	it("preserves rational source offsets after a long gap without accumulating rounding", () => {
		const start = 90_000_000_001;
		const f = fixture({
			inputSampleRate: 8003,
			outputSampleRate: 95999,
			inputChannels: 1,
			maxDurationFrames: start + 1000,
		});
		f.stream.push([new Float32Array(80)], start);
		f.stream.finish();
		const first = Number((BigInt(start) * 95999n + 8002n) / 8003n);
		const end = Number((BigInt(start + 80) * 95999n + 8002n) / 8003n);
		expect(f.chunks[0].start).toBe(first);
		expect(f.samples()).toHaveLength(end - first);
	});
});
