import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import type { ErrorCode } from "./errors.js";
import {
	PcmCapture,
	type PcmCaptureChunk,
	type PcmCaptureOptions,
} from "./pcm-capture.js";

function options(
	overrides: Partial<PcmCaptureOptions> = {},
): PcmCaptureOptions {
	return {
		sampleRate: 8_000,
		channels: 1,
		chunkFrames: 4,
		maxInputFrames: 64,
		maxDurationFrames: 128,
		maxChunks: 32,
		...overrides,
	};
}

function pcm(frames: number, channels: 1 | 2 = 1): Uint8Array {
	const bytes = new Uint8Array(frames * channels * 2);
	const view = new DataView(bytes.buffer);
	const samples = [-32_768, -1, 0, 1, 32_767, -257, 256];
	for (let sample = 0; sample < frames * channels; sample++) {
		view.setInt16(sample * 2, samples[sample % samples.length], true);
	}
	return bytes;
}

function recording(overrides: Partial<PcmCaptureOptions> = {}) {
	const chunks: PcmCaptureChunk[] = [];
	const append = vi.fn((chunk: PcmCaptureChunk) => {
		chunks.push(chunk);
	});
	const capture = new PcmCapture(options(overrides), append);
	return { capture, chunks, append };
}

function expectCode(action: () => unknown, code: ErrorCode): void {
	expect(action).toThrowError(expect.objectContaining({ code }));
}

function thrownBy(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected action to throw");
}

function expectReleased(capture: PcmCapture): void {
	const metrics = capture.metrics();
	expect(metrics.bufferedFrames).toBe(0);
	expect(metrics.retainedBytes).toBe(0);
	expect(metrics.acceptedFrames).toBe(
		metrics.savedFrames + metrics.discardedFrames,
	);
}

function expectTerminal(capture: PcmCapture): void {
	const snapshot = capture.metrics();
	expectCode(() => capture.push(pcm(1), snapshot.sourceFrames), "closed");
	expectCode(() => capture.setPaused(true), "closed");
	expectCode(() => capture.setPaused(false), "closed");
	capture.close();
	capture.close();
	expect(capture.metrics()).toEqual(snapshot);
	expectReleased(capture);
}

describe("PCM capture packetization and ownership", () => {
	it("returns frozen independent metric snapshots", () => {
		const { capture } = recording();
		const initial = capture.metrics();
		expect(Object.isFrozen(initial)).toBe(true);
		expect(initial).toEqual({
			state: "recording",
			paused: false,
			sourceFrames: 0,
			pausedFrames: 0,
			gapFrames: 0,
			acceptedFrames: 0,
			discardedFrames: 0,
			savedFrames: 0,
			chunks: 0,
			bufferedFrames: 0,
			retainedBytes: 0,
		});
		capture.push(pcm(1), 0);
		const current = capture.metrics();
		expect(current).not.toBe(initial);
		expect(Object.isFrozen(current)).toBe(true);
		expect(initial.sourceFrames).toBe(0);
		expect(current).toMatchObject({ acceptedFrames: 1, bufferedFrames: 1 });
		expect(current.retainedBytes).toBeGreaterThanOrEqual(2);
		expect(current.retainedBytes).toBeLessThanOrEqual(8);
		capture.close();
		expectReleased(capture);
	});

	describe.each([1, 2] as const)("%i channel PCM16", (channels) => {
		it.each([
			{ packets: [13] },
			{ packets: [1, 2, 5, 1, 4] },
			{ packets: [4, 4, 4, 1] },
			{ packets: Array.from({ length: 13 }, () => 1) },
		])("preserves bytes across packets $packets", ({ packets }) => {
			const { capture, chunks } = recording({ channels });
			const input = pcm(13, channels);
			const frameBytes = channels * 2;
			let sourceFrame = 0;
			for (const frames of packets) {
				capture.push(
					input.subarray(
						sourceFrame * frameBytes,
						(sourceFrame + frames) * frameBytes,
					),
					sourceFrame,
				);
				sourceFrame += frames;
				const metrics = capture.metrics();
				expect(metrics.bufferedFrames).toBe(sourceFrame % 4);
				expect(metrics.retainedBytes).toBeLessThanOrEqual(4 * frameBytes);
				expect(metrics.retainedBytes).toBeGreaterThanOrEqual(
					metrics.bufferedFrames * frameBytes,
				);
			}
			expect(chunks.map((chunk) => chunk.frames)).toEqual([4, 4, 4]);
			capture.finish();
			expect(chunks.map((chunk) => chunk.frames)).toEqual([4, 4, 4, 1]);
			expect(chunks.map((chunk) => chunk.startFrame)).toEqual([0, 4, 8, 12]);
			expect(chunks.flatMap((chunk) => Array.from(chunk.pcm))).toEqual(
				Array.from(input),
			);
			for (const [index, chunk] of chunks.entries()) {
				expect(Number.isSafeInteger(chunk.sequence)).toBe(true);
				expect(chunk.sequence).toBe(chunks[0].sequence + index);
				expect(chunk.startMs).toBe((chunk.startFrame * 1_000) / 8_000);
				expect(chunk.pcm.byteOffset).toBe(0);
				expect(chunk.pcm.byteLength).toBe(chunk.frames * frameBytes);
				expect(chunk.pcm.buffer.byteLength).toBe(chunk.pcm.byteLength);
				expect(chunk.pcm.buffer).not.toBe(input.buffer);
			}
			expect(new Set(chunks.map((chunk) => chunk.pcm.buffer)).size).toBe(4);
			expect(capture.metrics()).toMatchObject({
				state: "finished",
				sourceFrames: 13,
				acceptedFrames: 13,
				savedFrames: 13,
				discardedFrames: 0,
				chunks: 4,
			});
			const finished = capture.metrics();
			capture.finish();
			capture.finish();
			expect(capture.metrics()).toEqual(finished);
			expect(chunks).toHaveLength(4);
			expectTerminal(capture);
		});

		it.each(["Uint8Array", "Buffer"])(
			"copies retained %s subviews before returning",
			(kind) => {
				const { capture, chunks } = recording({ channels });
				const expected = pcm(7, channels);
				const backing =
					kind === "Buffer"
						? Buffer.alloc(expected.byteLength + 9, 0xaa)
						: new Uint8Array(expected.byteLength + 9).fill(0xaa);
				backing.set(expected, 3);
				const split = 2 * channels * 2;
				capture.push(backing.subarray(3, 3 + split), 0);
				backing.fill(0x55, 3, 3 + split);
				capture.push(backing.subarray(3 + split, 3 + expected.length), 2);
				backing.fill(0);
				capture.finish();
				expect(chunks.flatMap((chunk) => Array.from(chunk.pcm))).toEqual(
					Array.from(expected),
				);
				const saved = chunks.map((chunk) => chunk.pcm.slice());
				expectTerminal(capture);
				expect(chunks.map((chunk) => chunk.pcm)).toEqual(saved);
			},
		);
	});

	it("lets the sink mutate owned chunks without changing input or later output", () => {
		const input = pcm(9);
		const original = input.slice();
		const received: Uint8Array[] = [];
		const capture = new PcmCapture(options(), (chunk) => {
			received.push(chunk.pcm.slice());
			chunk.pcm.fill(0xee);
		});
		capture.push(input, 0);
		capture.finish();
		expect(input).toEqual(original);
		expect(received.flatMap((bytes) => Array.from(bytes))).toEqual(
			Array.from(original),
		);
		expectReleased(capture);
	});

	it("copies the whole input before a synchronous sink can mutate it", () => {
		const input = pcm(9);
		const original = input.slice();
		const received: Uint8Array[] = [];
		let acknowledgedFrames = 0;
		const capture = new PcmCapture(options(), (chunk) => {
			expect(capture.metrics().savedFrames).toBe(acknowledgedFrames);
			received.push(chunk.pcm.slice());
			input.fill(0xee);
			acknowledgedFrames += chunk.frames;
		});
		capture.push(input, 0);
		expect(acknowledgedFrames).toBe(8);
		capture.finish();
		expect(acknowledgedFrames).toBe(9);
		expect(received.flatMap((bytes) => Array.from(bytes))).toEqual(
			Array.from(original),
		);
	});

	it.each([8_000, 44_100, 96_000])(
		"keeps fractional compact timestamps at %i Hz",
		(sampleRate) => {
			const { capture, chunks } = recording({ sampleRate, chunkFrames: 1 });
			capture.push(pcm(1), 0);
			capture.push(pcm(1), 7);
			capture.finish();
			expect(chunks.map((chunk) => chunk.startFrame)).toEqual([0, 1]);
			expect(chunks[1].startMs).toBeCloseTo(1_000 / sampleRate, 12);
			expect(capture.metrics()).toMatchObject({ gapFrames: 6, savedFrames: 2 });
		},
	);

	it("snapshots all constructor options", () => {
		const supplied = options();
		const chunks: PcmCaptureChunk[] = [];
		const capture = new PcmCapture(supplied, (chunk) => {
			chunks.push(chunk);
		});
		Object.assign(supplied, {
			sampleRate: 96_000,
			channels: 2,
			chunkFrames: 1,
			maxInputFrames: 1,
			maxDurationFrames: 1,
			maxChunks: 1,
		});
		capture.push(pcm(9), 0);
		capture.finish();
		expect(chunks.map((chunk) => chunk.frames)).toEqual([4, 4, 1]);
		expect(chunks.map((chunk) => chunk.startMs)).toEqual([0, 0.5, 1]);
	});
});

describe("PCM capture pause, gaps, and terminal cleanup", () => {
	it("discards the unfinished tail on pause without flushing it", () => {
		const { capture, chunks, append } = recording();
		const beforePause = pcm(6);
		capture.push(beforePause, 0);
		capture.setPaused(true);
		expect(append).toHaveBeenCalledOnce();
		expect(capture.metrics()).toMatchObject({
			paused: true,
			acceptedFrames: 6,
			discardedFrames: 2,
			savedFrames: 4,
		});
		expectReleased(capture);
		capture.push(pcm(3), 8);
		capture.setPaused(true);
		expect(capture.metrics()).toMatchObject({
			sourceFrames: 11,
			pausedFrames: 5,
			gapFrames: 0,
			acceptedFrames: 6,
			discardedFrames: 2,
		});
		expect(append).toHaveBeenCalledOnce();
		capture.setPaused(false);
		capture.setPaused(false);
		const afterPause = pcm(5);
		capture.push(afterPause, 14);
		capture.finish();
		expect(chunks.map((chunk) => chunk.frames)).toEqual([4, 4, 1]);
		expect(chunks.map((chunk) => chunk.startFrame)).toEqual([0, 4, 8]);
		expect(chunks.flatMap((chunk) => Array.from(chunk.pcm))).toEqual([
			...beforePause.subarray(0, 8),
			...afterPause,
		]);
		expect(capture.metrics()).toMatchObject({
			state: "finished",
			sourceFrames: 19,
			pausedFrames: 5,
			gapFrames: 3,
			acceptedFrames: 11,
			discardedFrames: 2,
			savedFrames: 9,
			chunks: 3,
		});
		expectReleased(capture);
	});

	it("records gap diagnostics without inserting silence or splitting tails", () => {
		const { capture, chunks } = recording();
		capture.push(pcm(2), 0);
		capture.push(pcm(3), 5);
		capture.push(pcm(2), 12);
		capture.finish();
		expect(chunks.map((chunk) => chunk.frames)).toEqual([4, 3]);
		expect(chunks.map((chunk) => chunk.startFrame)).toEqual([0, 4]);
		expect(chunks.flatMap((chunk) => Array.from(chunk.pcm))).toEqual([
			...pcm(2),
			...pcm(3),
			...pcm(2),
		]);
		expect(capture.metrics()).toMatchObject({
			sourceFrames: 14,
			gapFrames: 7,
			acceptedFrames: 7,
			savedFrames: 7,
		});
	});

	it.each([1, 3, 4, 5, 8])(
		"finishes %i frames without duplicate tails",
		(frames) => {
			const { capture, chunks, append } = recording();
			capture.push(pcm(frames), 0);
			capture.finish();
			capture.finish();
			expect(append).toHaveBeenCalledTimes(Math.ceil(frames / 4));
			expect(chunks.reduce((total, chunk) => total + chunk.frames, 0)).toBe(
				frames,
			);
			expectReleased(capture);
			expectTerminal(capture);
		},
	);

	it("can finish while paused when a complete chunk was already saved", () => {
		const { capture, append } = recording();
		capture.push(pcm(5), 0);
		capture.setPaused(true);
		capture.push(pcm(2), 5);
		capture.finish();
		capture.finish();
		expect(append).toHaveBeenCalledOnce();
		expect(capture.metrics()).toMatchObject({
			state: "finished",
			savedFrames: 4,
			discardedFrames: 1,
			pausedFrames: 2,
		});
		expectTerminal(capture);
	});

	it.each([0, 2, 6])(
		"close discards only unsaved audio from %i frames",
		(frames) => {
			const { capture, chunks, append } = recording();
			if (frames > 0) capture.push(pcm(frames), 0);
			const saved = chunks.map((chunk) => chunk.pcm.slice());
			capture.close();
			expect(capture.metrics()).toMatchObject({
				state: "closed",
				savedFrames: frames - (frames % 4),
				discardedFrames: frames % 4,
			});
			expect(append).toHaveBeenCalledTimes(Math.floor(frames / 4));
			expectCode(() => capture.finish(), "closed");
			expectTerminal(capture);
			expect(chunks.map((chunk) => chunk.pcm)).toEqual(saved);
		},
	);

	it.each(["no input", "paused input", "discarded tail"])(
		"rejects an empty recording with %s terminally",
		(kind) => {
			const { capture, append } = recording();
			if (kind === "discarded tail") capture.push(pcm(2), 0);
			if (kind !== "no input") capture.setPaused(true);
			if (kind === "paused input") capture.push(pcm(2), 0);
			expectCode(() => capture.finish(), "invalid-input");
			expect(capture.metrics().state).toBe("failed");
			expect(append).not.toHaveBeenCalled();
			expectCode(() => capture.finish(), "closed");
			expectTerminal(capture);
		},
	);
});

describe("PCM capture validation and resource bounds", () => {
	describe.each([
		"sampleRate",
		"channels",
		"chunkFrames",
		"maxInputFrames",
		"maxDurationFrames",
		"maxChunks",
	] as const)("option %s", (field) => {
		it.each([
			0,
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
			undefined,
		])("rejects nonpositive or unsafe integer %s", (value) => {
			expectCode(
				() => new PcmCapture(options({ [field]: value }), () => {}),
				"invalid-input",
			);
		});
	});

	it.each([null, undefined, [], "options"])(
		"rejects invalid options %s",
		(value) => {
			expectCode(
				() => new PcmCapture(value as unknown as PcmCaptureOptions, () => {}),
				"invalid-input",
			);
		},
	);

	it.each([null, undefined, 1, {}, Promise.resolve()])(
		"rejects a nonfunction sink %s",
		(append) => {
			expectCode(
				() =>
					new PcmCapture(
						options(),
						append as unknown as (chunk: PcmCaptureChunk) => void,
					),
				"invalid-input",
			);
		},
	);

	it.each([7_999, 96_001])(
		"rejects unsupported sample rate %i",
		(sampleRate) => {
			expectCode(
				() => new PcmCapture(options({ sampleRate }), () => {}),
				"invalid-input",
			);
		},
	);

	it.each([3, 4])("rejects unsupported channel count %i", (channels) => {
		expectCode(
			() => new PcmCapture(options({ channels: channels as 1 | 2 }), () => {}),
			"invalid-input",
		);
	});

	it.each([1, 2] as const)(
		"enforces 16 MiB byte bounds for %i channels",
		(channels) => {
			const frameLimit = (16 * 1_024 * 1_024) / (channels * 2);
			const bounded = options({
				channels,
				chunkFrames: frameLimit,
				maxInputFrames: frameLimit,
				maxDurationFrames: frameLimit + 1,
			});
			const capture = new PcmCapture(bounded, () => {});
			capture.close();
			expectReleased(capture);
			for (const field of ["chunkFrames", "maxInputFrames"] as const) {
				expectCode(
					() =>
						new PcmCapture({ ...bounded, [field]: frameLimit + 1 }, () => {}),
					"resource-limit",
				);
			}
		},
	);

	it.each([1, 2] as const)(
		"requires safe duration byte arithmetic for %i channels",
		(channels) => {
			const maxDurationFrames = Math.floor(
				Number.MAX_SAFE_INTEGER / (channels * 2),
			);
			const capture = new PcmCapture(
				options({ channels, maxDurationFrames }),
				() => {},
			);
			capture.close();
			expectCode(
				() =>
					new PcmCapture(
						options({ channels, maxDurationFrames: maxDurationFrames + 1 }),
						() => {},
					),
				"invalid-input",
			);
		},
	);

	it("rejects chunks larger than the duration limit", () => {
		expectCode(
			() =>
				new PcmCapture(
					options({ chunkFrames: 5, maxDurationFrames: 4 }),
					() => {},
				),
			"invalid-input",
		);
	});

	it.each([1, 2] as const)(
		"rejects malformed %i channel input before admission",
		(channels) => {
			const { capture } = recording({ channels });
			capture.push(pcm(1, channels), 0);
			const snapshot = capture.metrics();
			const detached = new Uint8Array(4);
			structuredClone(detached.buffer, { transfer: [detached.buffer] });
			const invalid: unknown[] = [
				null,
				undefined,
				[0, 0, 0, 0],
				new ArrayBuffer(4),
				new DataView(new ArrayBuffer(4)),
				new Int16Array(2),
				new Uint8Array(),
				new Uint8Array(1),
				new Uint8Array(3),
				new Uint8Array(new SharedArrayBuffer(4)),
				detached,
			];
			if (channels === 2) invalid.push(new Uint8Array(2), new Uint8Array(6));
			for (const input of invalid) {
				expectCode(() => capture.push(input as Uint8Array, 1), "invalid-input");
				expect(capture.metrics()).toEqual(snapshot);
			}
			capture.push(pcm(1, channels), 1);
			capture.finish();
			expect(capture.metrics().savedFrames).toBe(2);
		},
	);

	it.each(["input", "duration"])(
		"uses intrinsic byte length for the %s bound",
		(bound) => {
			const { capture, append } = recording({
				chunkFrames: 1,
				maxInputFrames: bound === "input" ? 1 : 8,
				maxDurationFrames: bound === "duration" ? 1 : 8,
			});
			const input = pcm(2);
			Object.defineProperty(input, "byteLength", { value: 2 });
			const snapshot = capture.metrics();
			expectCode(() => capture.push(input, 0), "resource-limit");
			expect(capture.metrics()).toEqual(snapshot);
			expect(append).not.toHaveBeenCalled();
			capture.push(pcm(1), 0);
			capture.finish();
			expect(capture.metrics()).toMatchObject({
				sourceFrames: 1,
				acceptedFrames: 1,
				savedFrames: 1,
				discardedFrames: 0,
			});
			expectReleased(capture);
		},
	);

	it("rejects shared backing disguised by an own buffer property", () => {
		const { capture, append } = recording();
		const input = new Uint8Array(new SharedArrayBuffer(4));
		Object.defineProperty(input, "buffer", { value: new ArrayBuffer(4) });
		const snapshot = capture.metrics();
		expectCode(() => capture.push(input, 0), "invalid-input");
		expect(capture.metrics()).toEqual(snapshot);
		expect(append).not.toHaveBeenCalled();
		capture.push(pcm(1), 0);
		capture.finish();
		expectReleased(capture);
	});

	it.each([false, true])(
		"does not invoke throwing own typed-array getters with shared=%s",
		(shared) => {
			const { capture, chunks, append } = recording();
			const expected = pcm(2);
			const input = shared
				? new Uint8Array(new SharedArrayBuffer(expected.byteLength))
				: new Uint8Array(expected.byteLength);
			input.set(expected);
			const getter = vi.fn(() => {
				throw new Error("Own typed-array getters must not be invoked");
			});
			for (const property of ["buffer", "byteLength", "byteOffset", "length"]) {
				Object.defineProperty(input, property, { get: getter });
			}
			const snapshot = capture.metrics();
			if (shared) {
				expectCode(() => capture.push(input, 0), "invalid-input");
				expect(capture.metrics()).toEqual(snapshot);
				expect(append).not.toHaveBeenCalled();
				capture.close();
			} else {
				capture.push(input, 0);
				capture.finish();
				expect(chunks).toHaveLength(1);
				expect(chunks[0].pcm).toEqual(expected);
				expect(capture.metrics()).toMatchObject({
					sourceFrames: 2,
					acceptedFrames: 2,
					savedFrames: 2,
				});
			}
			expect(getter).not.toHaveBeenCalled();
			expectReleased(capture);
		},
	);

	it.each([0, 1, 2, 3, 8])(
		"ignores spoofed byteLength %i without negative discarded counters",
		(byteLength) => {
			const { capture, chunks } = recording({ chunkFrames: 1 });
			const input = pcm(2);
			const expected = input.slice();
			Object.defineProperty(input, "byteLength", { value: byteLength });
			Object.defineProperty(input, "length", { value: 0 });
			capture.push(input, 0);
			expect(capture.metrics()).toMatchObject({
				sourceFrames: 2,
				acceptedFrames: 2,
				savedFrames: 2,
				discardedFrames: 0,
				chunks: 2,
			});
			capture.close();
			expect(capture.metrics().discardedFrames).toBe(0);
			expectReleased(capture);
			expect(chunks.flatMap((chunk) => Array.from(chunk.pcm))).toEqual(
				Array.from(expected),
			);
		},
	);

	it.each([
		-1,
		0,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
		"1",
		null,
	])(
		"rejects invalid or overlapping source frame %s without mutation",
		(sourceFrame) => {
			const { capture } = recording();
			capture.push(pcm(1), 0);
			const snapshot = capture.metrics();
			expectCode(
				() => capture.push(pcm(1), sourceFrame as number),
				"invalid-input",
			);
			expect(capture.metrics()).toEqual(snapshot);
			capture.push(pcm(1), 1);
			capture.finish();
			expect(capture.metrics().savedFrames).toBe(2);
		},
	);

	it.each([null, undefined, 0, 1, "true", {}])(
		"requires a boolean pause argument %s",
		(paused) => {
			const { capture } = recording();
			capture.push(pcm(1), 0);
			const snapshot = capture.metrics();
			expectCode(
				() => capture.setPaused(paused as unknown as boolean),
				"invalid-input",
			);
			expect(capture.metrics()).toEqual(snapshot);
			capture.finish();
			expect(capture.metrics().savedFrames).toBe(1);
		},
	);

	it.each([false, true])(
		"validates input and duration bounds while paused=%s",
		(paused) => {
			const { capture } = recording({
				maxInputFrames: 2,
				maxDurationFrames: 8,
			});
			capture.push(pcm(1), 0);
			capture.setPaused(paused);
			const snapshot = capture.metrics();
			expectCode(() => capture.push(pcm(3), 1), "resource-limit");
			expectCode(() => capture.push(pcm(1), 8), "resource-limit");
			expectCode(
				() => capture.push(pcm(2), Number.MAX_SAFE_INTEGER),
				"resource-limit",
			);
			expectCode(() => capture.push(new Uint8Array(1), 1), "invalid-input");
			expectCode(() => capture.push(pcm(1), 0), "invalid-input");
			expect(capture.metrics()).toEqual(snapshot);
			capture.setPaused(false);
			capture.push(pcm(2), 6);
			capture.finish();
			expect(capture.metrics()).toMatchObject({
				sourceFrames: 8,
				state: "finished",
			});
		},
	);

	it("allows exact input, duration, and successful chunk limits", () => {
		const { capture, append } = recording({
			maxInputFrames: 4,
			maxDurationFrames: 8,
			maxChunks: 2,
		});
		capture.push(pcm(4), 0);
		capture.push(pcm(4), 4);
		capture.finish();
		expect(append).toHaveBeenCalledTimes(2);
		expect(capture.metrics()).toMatchObject({
			state: "finished",
			savedFrames: 8,
		});
		expectReleased(capture);
	});

	it.each(["push", "finish"])(
		"fails before exceeding maxChunks during %s",
		(operation) => {
			const { capture, chunks, append } = recording({ maxChunks: 2 });
			if (operation === "push") {
				expectCode(() => capture.push(pcm(12), 0), "resource-limit");
			} else {
				capture.push(pcm(9), 0);
				expectCode(() => capture.finish(), "resource-limit");
			}
			expect(append).toHaveBeenCalledTimes(2);
			expect(capture.metrics()).toMatchObject({
				state: "failed",
				chunks: 2,
				savedFrames: 8,
			});
			const saved = chunks.map((chunk) => chunk.pcm.slice());
			expectCode(() => capture.finish(), "closed");
			expectTerminal(capture);
			expect(chunks.map((chunk) => chunk.pcm)).toEqual(saved);
			expect(append).toHaveBeenCalledTimes(2);
		},
	);
});

describe("PCM capture sink failures and reentrancy", () => {
	it.each(["push", "finish"])(
		"rethrows the original sink error during %s without retry",
		(operation) => {
			const failure = new Error("Synthetic persistence failure");
			const handed: PcmCaptureChunk[] = [];
			const append = vi.fn((chunk: PcmCaptureChunk) => {
				handed.push(chunk);
				if (handed.length === 2) throw failure;
			});
			const capture = new PcmCapture(options(), append);
			if (operation === "push") {
				expect(thrownBy(() => capture.push(pcm(12), 0))).toBe(failure);
			} else {
				capture.push(pcm(5), 0);
				expect(thrownBy(() => capture.finish())).toBe(failure);
			}
			expect(capture.metrics()).toMatchObject({
				state: "failed",
				chunks: 1,
				savedFrames: 4,
			});
			expect(capture.metrics().discardedFrames).toBeGreaterThan(0);
			const owned = handed.map((chunk) => chunk.pcm.slice());
			expectCode(() => capture.finish(), "closed");
			expectTerminal(capture);
			expect(append).toHaveBeenCalledTimes(2);
			expect(handed.map((chunk) => chunk.pcm)).toEqual(owned);
		},
	);

	it.each(["resolved", "rejected", "thenable"])(
		"rejects a returned %s asynchronous sink result",
		async (kind) => {
			const failure = new Error("Synthetic async persistence failure");
			let rejectionConsumed = false;
			const thenable = new Proxy(
				{},
				{
					get(_target, property) {
						if (property !== "then") return undefined;
						return (_resolve: unknown, reject: (error: Error) => void) => {
							rejectionConsumed = true;
							reject(failure);
						};
					},
				},
			);
			const append = vi.fn(() => {
				if (kind === "thenable") return thenable;
				return kind === "rejected"
					? Promise.reject(failure)
					: Promise.resolve();
			});
			const capture = new PcmCapture(options(), append);
			expectCode(() => capture.push(pcm(8), 0), "unsupported");
			await Promise.resolve();
			await Promise.resolve();
			if (kind === "thenable") expect(rejectionConsumed).toBe(true);
			expect(capture.metrics()).toMatchObject({
				state: "failed",
				savedFrames: 0,
				chunks: 0,
			});
			expectCode(() => capture.finish(), "closed");
			expectTerminal(capture);
			expect(append).toHaveBeenCalledOnce();
		},
	);

	const reentries: { name: string; invoke: (capture: PcmCapture) => void }[] = [
		{
			name: "push",
			invoke: (capture) => capture.push(pcm(1), capture.metrics().sourceFrames),
		},
		{ name: "pause", invoke: (capture) => capture.setPaused(true) },
		{ name: "resume", invoke: (capture) => capture.setPaused(false) },
		{ name: "finish", invoke: (capture) => capture.finish() },
		{ name: "close", invoke: (capture) => capture.close() },
	];

	describe.each(reentries)("$name reentrancy", ({ invoke }) => {
		it.each(["push", "finish"])(
			"continues when a %s sink catches rejection",
			(operation) => {
				const append = vi.fn(() => {
					const snapshot = capture.metrics();
					expect(Object.isFrozen(snapshot)).toBe(true);
					expectCode(() => invoke(capture), "invalid-input");
					expect(capture.metrics()).toEqual(snapshot);
				});
				const capture: PcmCapture = new PcmCapture(options(), append);
				const frames = operation === "push" ? 8 : 3;
				capture.push(pcm(frames), 0);
				expect(append).toHaveBeenCalledTimes(operation === "push" ? 2 : 0);
				capture.finish();
				expect(capture.metrics()).toMatchObject({
					state: "finished",
					savedFrames: frames,
					discardedFrames: 0,
				});
				expect(append).toHaveBeenCalledTimes(operation === "push" ? 2 : 1);
				expectReleased(capture);
			},
		);

		it.each(["push", "finish"])(
			"fails when a %s sink lets rejection escape",
			(operation) => {
				let capture: PcmCapture;
				const append = vi.fn(() => invoke(capture));
				capture = new PcmCapture(options(), append);
				if (operation === "push") {
					expectCode(() => capture.push(pcm(8), 0), "invalid-input");
				} else {
					capture.push(pcm(3), 0);
					expectCode(() => capture.finish(), "invalid-input");
				}
				expect(capture.metrics()).toMatchObject({
					state: "failed",
					savedFrames: 0,
					chunks: 0,
				});
				expectCode(() => capture.finish(), "closed");
				expectTerminal(capture);
				expect(append).toHaveBeenCalledOnce();
			},
		);
	});
});
