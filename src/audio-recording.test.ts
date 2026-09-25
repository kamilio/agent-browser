import { expect, it, vi } from "vitest";
import {
	type AudioInputPacket,
	AudioRecording,
	type AudioRecordingOptions,
} from "./audio-recording.js";
import type { PcmCaptureChunk } from "./pcm-capture.js";

function options(): AudioRecordingOptions {
	return {
		inputSampleRate: 48000,
		inputChannels: 1,
		maxInputFrames: 960,
		maxSourceFrames: 96000,
		capture: {
			sampleRate: 16000,
			channels: 1,
			chunkFrames: 160,
			maxInputFrames: 320,
			maxDurationFrames: 32000,
			maxChunks: 200,
		},
	};
}
function packet(
	startFrame: number,
	frames = 480,
	value = 0.25,
): AudioInputPacket {
	return { channels: [new Float32Array(frames).fill(value)], startFrame };
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
async function turn() {
	for (let i = 0; i < 12; i++) await Promise.resolve();
}
function source(packets: AudioInputPacket[]) {
	return {
		read: vi.fn(async () => packets.shift() ?? null),
		close: vi.fn(async () => {}),
	};
}

it("records a source to EOF, flushes its final samples and closes it exactly once", async () => {
	const input = source([packet(0), packet(480)]);
	const chunks: PcmCaptureChunk[] = [];
	const recording = new AudioRecording(input, options(), (chunk) => {
		chunks.push(chunk);
	});
	const run = recording.run();
	expect(recording.run()).toBe(run);
	await run;
	await recording.stop();
	await recording.close();
	const m = recording.metrics();
	expect(m.state).toBe("finished");
	expect(m.cleanupVerified).toBe(true);
	expect(m.capture.savedFrames).toBe(320);
	expect(chunks.map((c) => c.startFrame)).toEqual([0, 160]);
	expect(chunks.at(-1)?.sourceEndFrame).toBe(320);
	expect(input.close).toHaveBeenCalledOnce();
	expect(input.read).toHaveBeenCalledTimes(3);
});

it("has only one source read pending and waits for close acknowledgement", async () => {
	const pending = deferred<AudioInputPacket | null>();
	const closed = deferred<void>();
	const input = {
		read: vi.fn(() => pending.promise),
		close: vi.fn(() => closed.promise),
	};
	const recording = new AudioRecording(input, options(), () => {});
	const run = recording.run();
	await turn();
	expect(input.read).toHaveBeenCalledOnce();
	let settled = false;
	const stopping = recording.close().then(() => {
		settled = true;
	});
	await turn();
	expect(input.close).toHaveBeenCalledOnce();
	expect(recording.metrics()).toMatchObject({
		pendingRead: true,
		cleanupVerified: false,
	});
	pending.resolve(packet(0));
	await turn();
	expect(settled).toBe(false);
	closed.resolve();
	await stopping;
	await run;
	expect(recording.metrics()).toMatchObject({
		state: "closed",
		cleanupVerified: true,
	});
	expect(recording.metrics().capture.savedFrames).toBe(0);
});

it("closes on an owner abort and ignores packets arriving after cancellation", async () => {
	const controller = new AbortController();
	const pending = deferred<AudioInputPacket | null>();
	const append = vi.fn();
	const input = {
		read: vi.fn((_signal: AbortSignal) => pending.promise),
		close: vi.fn(async () => {
			pending.resolve(packet(0));
		}),
	};
	const recording = new AudioRecording(
		input,
		options(),
		append,
		controller.signal,
	);
	const run = recording.run();
	await turn();
	controller.abort();
	await run;
	expect(append).not.toHaveBeenCalled();
	expect(input.read.mock.calls[0][0].aborted).toBe(true);
	expect(recording.metrics()).toMatchObject({
		state: "closed",
		cleanupVerified: true,
	});
});

it("allows owner cancellation to run when every source read is immediately ready", async () => {
	const controller = new AbortController();
	let nextFrame = 0;
	const input = {
		read: vi.fn(async () => {
			const value = packet(nextFrame, 128);
			nextFrame += 128;
			return value;
		}),
		close: vi.fn(async () => {}),
	};
	const recording = new AudioRecording(
		input,
		options(),
		() => {},
		controller.signal,
	);
	const timer = setTimeout(() => controller.abort(), 0);
	try {
		await recording.run();
		expect(recording.metrics()).toMatchObject({
			state: "closed",
			cleanupVerified: true,
		});
		expect(input.close).toHaveBeenCalledOnce();
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
});

it("adopts an already-aborted owner's source only to close it", async () => {
	const input = source([packet(0)]);
	const recording = new AudioRecording(
		input,
		options(),
		() => {},
		AbortSignal.abort(),
	);
	await recording.run();
	expect(input.read).not.toHaveBeenCalled();
	expect(input.close).toHaveBeenCalledOnce();
	expect(recording.metrics().state).toBe("closed");
});

it("graceful stop cancels the read and flushes only previously accepted samples", async () => {
	const pending = deferred<AudioInputPacket | null>();
	let reads = 0;
	const input = {
		read: vi.fn((signal: AbortSignal) => {
			if (++reads === 1) return Promise.resolve(packet(0, 600));
			signal.addEventListener("abort", () => pending.reject(signal.reason), {
				once: true,
			});
			return pending.promise;
		}),
		close: vi.fn(async () => {}),
	};
	const chunks: PcmCaptureChunk[] = [];
	const recording = new AudioRecording(input, options(), (chunk) => {
		chunks.push(chunk);
	});
	recording.run();
	await turn();
	await recording.stop();
	expect(chunks.reduce((sum, c) => sum + c.frames, 0)).toBe(200);
	expect(recording.metrics()).toMatchObject({
		state: "finished",
		cleanupVerified: true,
	});
});

it("pause drops pending filter and recording tails without leaking paused samples on resume", async () => {
	const reads: ReturnType<typeof deferred<AudioInputPacket | null>>[] = [];
	const input = {
		read: vi.fn(() => {
			const value = deferred<AudioInputPacket | null>();
			reads.push(value);
			return value.promise;
		}),
		close: vi.fn(async () => {}),
	};
	const chunks: PcmCaptureChunk[] = [];
	const recording = new AudioRecording(input, options(), (chunk) => {
		chunks.push(chunk);
	});
	const run = recording.run();
	await turn();
	reads[0].resolve(packet(0, 480, 1));
	await turn();
	recording.setPaused(true);
	reads[1].resolve(packet(480, 480, -1));
	await turn();
	expect(recording.metrics().conversion.retainedFrames).toBe(0);
	recording.setPaused(false);
	reads[2].resolve(packet(960, 480, 0));
	await turn();
	reads[3].resolve(null);
	await run;
	expect(chunks).toHaveLength(1);
	expect(chunks[0].frames).toBe(160);
	expect(chunks[0].pcm.every((byte) => byte === 0)).toBe(true);
	expect(chunks[0].sourceEndFrame).toBe(480);
	expect(recording.metrics().cleanupVerified).toBe(true);
});

it("stops publication if the owner closes during a sink callback", async () => {
	const input = source([packet(0, 960)]);
	const append = vi.fn(() => {
		void recording.close();
	});
	const recording = new AudioRecording(input, options(), append);
	await recording.run();
	expect(append).toHaveBeenCalledOnce();
	expect(recording.metrics()).toMatchObject({
		state: "closed",
		cleanupVerified: true,
	});
	expect(input.read).toHaveBeenCalledOnce();
});

it.each(["read", "sink", "invalid packet"])(
	"fails and releases the source after a %s failure",
	async (failureKind) => {
		const failure = new Error(failureKind);
		const input = source([packet(0)]);
		if (failureKind === "read") input.read.mockRejectedValueOnce(failure);
		if (failureKind === "invalid packet")
			input.read.mockResolvedValueOnce(packet(0, 2000));
		const recording = new AudioRecording(input, options(), () => {
			if (failureKind === "sink") throw failure;
		});
		await expect(recording.run()).rejects.toThrow();
		expect(recording.metrics()).toMatchObject({
			state: "failed",
			cleanupVerified: true,
		});
		expect(input.close).toHaveBeenCalledOnce();
		expect(recording.metrics().capture.retainedBytes).toBe(0);
		expect(recording.metrics().conversion.retainedBytes).toBe(0);
	},
);

it("reports failed source cleanup instead of claiming a fully closed recording", async () => {
	const failure = new Error("source close failed");
	const input = source([packet(0)]);
	input.close.mockRejectedValueOnce(failure);
	const recording = new AudioRecording(input, options(), () => {});
	await expect(recording.run()).rejects.toBe(failure);
	expect(recording.metrics()).toMatchObject({
		state: "failed",
		sourceClosed: false,
		cleanupVerified: false,
	});
	expect(recording.metrics().capture.retainedBytes).toBe(0);
});

it("does not call a source's close twice after repeated cancellation requests", async () => {
	const pending = deferred<AudioInputPacket | null>();
	const input = {
		read: vi.fn(() => pending.promise),
		close: vi.fn(async () => {
			pending.resolve(null);
		}),
	};
	const recording = new AudioRecording(input, options(), () => {});
	recording.run();
	await turn();
	await Promise.all([recording.close(), recording.close(), recording.stop()]);
	expect(input.close).toHaveBeenCalledOnce();
	expect(recording.metrics()).toMatchObject({
		state: "closed",
		cleanupVerified: true,
	});
});

it("does not hide an independent read failure racing with graceful stop", async () => {
	const pending = deferred<AudioInputPacket | null>();
	const failure = new Error("transport reset");
	let reads = 0;
	const input = {
		read: vi.fn(() =>
			++reads === 1 ? Promise.resolve(packet(0, 600)) : pending.promise,
		),
		close: vi.fn(async () => {
			pending.reject(failure);
		}),
	};
	const recording = new AudioRecording(input, options(), () => {});
	recording.run();
	await turn();
	await expect(recording.stop()).rejects.toBe(failure);
	expect(recording.metrics()).toMatchObject({
		state: "failed",
		cleanupVerified: true,
	});
});

it("keeps cleanup pending if source close completes before its outstanding read", async () => {
	const pending = deferred<AudioInputPacket | null>();
	const input = {
		read: vi.fn(() => pending.promise),
		close: vi.fn(async () => {}),
	};
	const recording = new AudioRecording(input, options(), () => {});
	recording.run();
	await turn();
	let settled = false;
	const close = recording.close().then(() => {
		settled = true;
	});
	await turn();
	expect(recording.metrics()).toMatchObject({
		sourceClosed: true,
		pendingRead: true,
		cleanupVerified: false,
	});
	expect(settled).toBe(false);
	pending.resolve(null);
	await close;
	expect(recording.metrics().cleanupVerified).toBe(true);
});

it("preserves both a read error and a separate source cleanup error", async () => {
	const readError = new Error("read failed");
	const closeError = new Error("cleanup failed");
	const input = {
		read: vi.fn(async () => {
			throw readError;
		}),
		close: vi.fn(async () => {
			throw closeError;
		}),
	};
	const recording = new AudioRecording(input, options(), () => {});
	await expect(recording.run()).rejects.toMatchObject({
		errors: [readError, closeError],
	});
	expect(recording.metrics()).toMatchObject({
		state: "failed",
		cleanupVerified: false,
	});
	expect(recording.metrics().conversion.retainedBytes).toBe(0);
});
