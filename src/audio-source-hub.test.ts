import { expect, it, vi } from "vitest";
import { type AudioInputPacket, AudioRecording } from "./audio-recording.js";
import { AudioSourceHub } from "./audio-source-hub.js";

const limits = {
	channels: 1 as const,
	maxPacketFrames: 160,
	maxSourceFrames: 16000,
	maxReaders: 4,
	maxCreatedReaders: 8,
	maxQueuedFrames: 320,
};
const packet = (startFrame: number): AudioInputPacket => ({
	startFrame,
	channels: [new Float32Array(160).fill(0.5)],
});
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
const signal = () => new AbortController().signal;
async function turn() {
	for (let i = 0; i < 12; i++) await Promise.resolve();
}

it("shares one source read and gives each reader independent audio storage", async () => {
	const next = deferred<AudioInputPacket | null>();
	const source = { read: vi.fn(() => next.promise), close: vi.fn() };
	const hub = new AudioSourceHub(source, limits);
	const a = hub.open();
	const b = hub.open();
	const left = a.read(signal());
	const right = b.read(signal());
	await turn();
	expect(source.read).toHaveBeenCalledOnce();
	const input = packet(0);
	next.resolve(input);
	const first = await left;
	const second = await right;
	if (!first || !second) throw new Error("Missing shared packet");
	input.channels[0][0] = 9;
	first.channels[0][0] = 3;
	expect(second.channels[0][0]).toBe(0.5);
	await a.close();
	expect(source.close).not.toHaveBeenCalled();
	await b.close();
	expect(source.close).toHaveBeenCalledOnce();
	expect(hub.metrics().cleanupVerified).toBe(true);
});

it("starts a new reader at the next packet instead of replaying a sibling's backlog", async () => {
	let frame = 0;
	const source = {
		read: vi.fn(async () => {
			const p = packet(frame);
			frame += 160;
			return p;
		}),
		close: vi.fn(),
	};
	const hub = new AudioSourceHub(source, limits);
	const a = hub.open();
	expect((await a.read(signal()))?.startFrame).toBe(0);
	const b = hub.open();
	const [nextA, nextB] = await Promise.all([
		a.read(signal()),
		b.read(signal()),
	]);
	expect([nextA?.startFrame, nextB?.startFrame]).toEqual([160, 160]);
	await hub.close();
});

it("isolates a lagging reader's overflow and keeps the other recording moving", async () => {
	let frame = 0;
	const hub = new AudioSourceHub(
		{
			read: async () => {
				const p = packet(frame);
				frame += 160;
				return p;
			},
			close() {},
		},
		limits,
	);
	const fast = hub.open();
	const slow = hub.open();
	for (let i = 0; i < 4; i++)
		expect((await fast.read(signal()))?.startFrame).toBe(i * 160);
	await expect(slow.read(signal())).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(hub.metrics().queuedFrames).toBe(0);
	await fast.close();
	expect(hub.metrics().cleanupVerified).toBe(true);
});

it("cancels one reader without cancelling a sibling's pending input", async () => {
	const next = deferred<AudioInputPacket | null>();
	let upstreamSignal: AbortSignal | undefined;
	const source = {
		read: vi.fn((s: AbortSignal) => {
			upstreamSignal = s;
			return next.promise;
		}),
		close: vi.fn(),
	};
	const hub = new AudioSourceHub(source, limits);
	const a = hub.open();
	const b = hub.open();
	const owner = new AbortController();
	const left = a.read(owner.signal);
	const right = b.read(signal());
	const failure = expect(left).rejects.toBe("reader stopped");
	await turn();
	owner.abort("reader stopped");
	await failure;
	expect(upstreamSignal?.aborted).toBe(false);
	next.resolve(packet(0));
	expect((await right)?.startFrame).toBe(0);
	await b.close();
	expect(source.close).toHaveBeenCalledOnce();
});

it("waits for the pending input and source-close acknowledgement and ignores late packets", async () => {
	const next = deferred<AudioInputPacket | null>();
	const closed = deferred<void>();
	const source = {
		read: () => next.promise,
		close: vi.fn(() => closed.promise),
	};
	const hub = new AudioSourceHub(source, limits);
	const a = hub.open();
	const reading = a.read(signal());
	await turn();
	let settled = false;
	const closing = hub.close().then(() => {
		settled = true;
	});
	expect(await reading).toBe(null);
	closed.resolve();
	await turn();
	expect(settled).toBe(false);
	expect(hub.metrics().cleanupVerified).toBe(false);
	next.resolve(packet(0));
	await closing;
	expect(hub.metrics()).toMatchObject({
		cleanupVerified: true,
		queuedFrames: 0,
		retainedBytes: 0,
	});
});

it("drains accepted queues at EOF and records each clone independently", async () => {
	const packets = [packet(0), packet(160), packet(320)];
	const source = { read: async () => packets.shift() ?? null, close: vi.fn() };
	const hub = new AudioSourceHub(source, limits);
	const a = hub.open();
	const b = hub.open();
	const options = {
		inputSampleRate: 16000,
		inputChannels: 1 as const,
		maxInputFrames: 160,
		maxSourceFrames: 16000,
		capture: {
			sampleRate: 16000,
			channels: 1 as const,
			chunkFrames: 160,
			maxInputFrames: 160,
			maxDurationFrames: 16000,
			maxChunks: 100,
		},
	};
	const left: number[] = [];
	const right: number[] = [];
	const recordings = [
		new AudioRecording(a, options, (c) => {
			left.push(c.startFrame);
		}),
		new AudioRecording(b, options, (c) => {
			right.push(c.startFrame);
		}),
	];
	await Promise.all(recordings.map((r) => r.run()));
	expect(left).toEqual([0, 160, 320]);
	expect(right).toEqual(left);
	expect(recordings.every((r) => r.metrics().cleanupVerified)).toBe(true);
	expect(source.close).toHaveBeenCalledOnce();
	expect(hub.metrics().cleanupVerified).toBe(true);
});

it("preserves a source failure and an independent cleanup failure", async () => {
	const next = deferred<AudioInputPacket | null>();
	const first = new Error("transport failed");
	const second = new Error("release failed");
	const hub = new AudioSourceHub(
		{
			read: () => next.promise,
			close() {
				throw second;
			},
		},
		limits,
	);
	const a = hub.open();
	const reading = a.read(signal());
	const failed = expect(reading).rejects.toBe(first);
	await turn();
	next.reject(first);
	await failed;
	await expect(hub.close()).rejects.toMatchObject({ errors: [first, second] });
	expect(hub.metrics().cleanupVerified).toBe(false);
});

it("rejects overlapping source packets before publishing them", async () => {
	const packets = [packet(0), packet(0)];
	const hub = new AudioSourceHub(
		{ read: async () => packets.shift() ?? null, close() {} },
		limits,
	);
	const reader = hub.open();
	await reader.read(signal());
	await expect(reader.read(signal())).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(hub.close()).rejects.toMatchObject({ code: "invalid-input" });
	expect(hub.metrics().cleanupVerified).toBe(true);
});

it("enforces reader limits and rejects concurrent reads from the same reader", async () => {
	const next = deferred<AudioInputPacket | null>();
	const hub = new AudioSourceHub(
		{
			read: () => next.promise,
			close() {
				next.resolve(null);
			},
		},
		{ ...limits, maxReaders: 1 },
	);
	const reader = hub.open();
	expect(() => hub.open()).toThrow(/reader/i);
	const pending = reader.read(signal());
	await expect(reader.read(signal())).rejects.toMatchObject({
		code: "invalid-input",
	});
	await hub.close();
	expect(await pending).toBe(null);
});

it("yields so an owner can cancel an always-ready source", async () => {
	let frame = 0;
	const owner = new AbortController();
	const hub = new AudioSourceHub(
		{
			read: async () => {
				const p = packet(frame);
				frame += 160;
				return p;
			},
			close() {},
		},
		limits,
		owner.signal,
	);
	const reader = hub.open();
	const timer = setTimeout(() => owner.abort(), 0);
	try {
		while (await reader.read(signal())) {}
	} finally {
		clearTimeout(timer);
		await hub.close();
	}
	expect(frame).toBeLessThan(16000);
	expect(hub.metrics().cleanupVerified).toBe(true);
});

it("copies only the declared channels without invoking an array's custom iterator", async () => {
	const input = [new Float32Array(160).fill(0.25)];
	const iterator = vi.fn(function* () {
		yield new Float32Array(160).fill(1);
		yield new Float32Array(160).fill(2);
	});
	Object.defineProperty(input, Symbol.iterator, { value: iterator });
	const hub = new AudioSourceHub(
		{ read: async () => ({ startFrame: 0, channels: input }), close() {} },
		limits,
	);
	const reader = hub.open();
	const value = await reader.read(signal());
	expect(iterator).not.toHaveBeenCalled();
	expect(value?.channels).toHaveLength(1);
	expect(value?.channels[0][0]).toBe(0.25);
	await hub.close();
});

it("keeps queued audio available after EOF until the reader drains or closes", async () => {
	const packets = [packet(0), packet(160)];
	const source = { read: async () => packets.shift() ?? null, close: vi.fn() };
	const hub = new AudioSourceHub(source, limits);
	const fast = hub.open();
	const slow = hub.open();
	await fast.read(signal());
	await fast.read(signal());
	expect(await fast.read(signal())).toBe(null);
	await turn();
	expect(hub.metrics()).toMatchObject({
		sourceClosed: true,
		queuedFrames: 320,
		cleanupVerified: false,
	});
	expect((await slow.read(signal()))?.startFrame).toBe(0);
	expect((await slow.read(signal()))?.startFrame).toBe(160);
	expect(await slow.read(signal())).toBe(null);
	await hub.close();
	expect(hub.metrics().cleanupVerified).toBe(true);
	expect(source.close).toHaveBeenCalledOnce();
});

it.each([
	["nonfinite", new Float32Array(160).fill(Number.NaN)],
	["shared", new Float32Array(new SharedArrayBuffer(640))],
	["forged", Object.create(Float32Array.prototype)],
	["wrong type", new Uint8Array(160)],
])(
	"rejects %s channel data before delivering it to any reader",
	async (_name, channel) => {
		const hub = new AudioSourceHub(
			{
				read: async () => ({
					startFrame: 0,
					channels: [channel as Float32Array],
				}),
				close() {},
			},
			limits,
		);
		const a = hub.open();
		const b = hub.open();
		await Promise.all(
			[a, b].map((reader) =>
				expect(reader.read(signal())).rejects.toMatchObject({
					code: "invalid-input",
				}),
			),
		);
		await expect(hub.close()).rejects.toMatchObject({ code: "invalid-input" });
		expect(hub.metrics().cleanupVerified).toBe(true);
	},
);

it("preserves an independent transport failure racing with owner shutdown", async () => {
	const next = deferred<AudioInputPacket | null>();
	const error = new Error("network failure");
	const hub = new AudioSourceHub(
		{ read: () => next.promise, close() {} },
		limits,
	);
	const reader = hub.open();
	const reading = reader.read(signal());
	await turn();
	const closing = hub.close();
	next.reject(error);
	expect(await reading).toBe(null);
	await expect(closing).rejects.toBe(error);
	expect(hub.metrics().cleanupVerified).toBe(true);
});
