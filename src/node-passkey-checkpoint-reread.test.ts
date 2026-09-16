import { generateKeyPairSync, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import { NodePasskeyCheckpointFile } from "./node-passkey-checkpoint-file.js";
import {
	NodePasskeyCheckpointCodec,
	type NodePasskeyCheckpointRecord,
} from "./node-passkey-checkpoint.js";

vi.mock("node:fs/promises", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const directories: string[] = [];
const stores: NodePasskeyCheckpointFile[] = [];
const fixtureBuffers: Buffer[] = [];
const nativeOpen = fs.open;
const nativeLstat = fs.lstat;
const confirmationLimit = 64 * 1024;
const failureMessage = "Passkey checkpoint file operation denied";

function required<Value>(value: Value | undefined): Value {
	if (value === undefined) throw new Error("Missing synthetic fixture value");
	return value;
}

async function fixture(count = 0) {
	const directory = await fs.mkdtemp("/tmp/agent-browser-checkpoint-reread-");
	directories.push(directory);
	const path = join(directory, "checkpoint.bin");
	const key = randomBytes(32);
	fixtureBuffers.push(key);
	const privateKey = generateKeyPairSync("ec", {
		namedCurve: "prime256v1",
	}).privateKey;
	const records: NodePasskeyCheckpointRecord[] = Array.from(
		{ length: count },
		(_, index) => {
			const id = Buffer.alloc(count > 1 ? 1023 : 32, 0x61);
			id.writeUInt16BE(index);
			const userId = Buffer.alloc(32, index + 1);
			fixtureBuffers.push(id, userId);
			return {
				id,
				rpId: "checkpoint.example",
				user: {
					id: userId,
					name: `synthetic-checkpoint-user-${index}`.padEnd(256, "界"),
					displayName: "synthetic-checkpoint-display".padEnd(256, "界"),
				},
				privateKey,
				counter: index + 7,
			};
		},
	);
	const codec = new NodePasskeyCheckpointCodec(key);
	let envelope: Buffer;
	try {
		envelope = codec.seal(records);
	} finally {
		codec.close();
	}
	fixtureBuffers.push(envelope);
	await fs.writeFile(path, envelope, { mode: 0o600, flag: "wx" });
	const store = await NodePasskeyCheckpointFile.open({ path, key });
	stores.push(store);
	return { directory, path, key, records, envelope, store };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

interface ObservedRead {
	buffer: Buffer;
	offset: number;
	length: number;
	position: number;
	confirmation: boolean;
	bytesRead?: number;
}

interface Observation {
	handle: fs.FileHandle;
	reads: ObservedRead[];
	buffers: Set<Buffer>;
	closed: boolean;
}

interface ReadHooks {
	initialChunk?: number;
	confirmationChunk?: number;
	afterInitial?: () => Promise<void>;
	beforeConfirmation?: (read: ObservedRead) => void;
	afterConfirmation?: (read: ObservedRead) => Promise<void>;
}

async function observe(input: Fixture, hooks: ReadHooks = {}) {
	const before = await nativeLstat(input.path, { bigint: true });
	const probe = {
		observations: [] as Observation[],
		handles: [] as fs.FileHandle[],
		maskPath: true,
	};
	vi.spyOn(fs, "lstat").mockImplementation((async (
		...args: Parameters<typeof fs.lstat>
	) =>
		args[0] === input.path && probe.maskPath
			? before
			: nativeLstat(...args)) as typeof fs.lstat);
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await nativeOpen(...args);
		if (
			args[0] === input.path ||
			args[0] === input.directory ||
			args[0] === `${input.path}.lock`
		)
			probe.handles.push(handle);
		if (args[0] !== input.path) return handle;
		const observation: Observation = {
			handle,
			reads: [],
			buffers: new Set(),
			closed: false,
		};
		probe.observations.push(observation);
		vi.spyOn(handle, "stat").mockResolvedValue(before);
		const close = handle.close.bind(handle);
		vi.spyOn(handle, "close").mockImplementation(async () => {
			await close();
			observation.closed = true;
		});
		const read = handle.read.bind(handle);
		let initialBytes = 0;
		let confirming = false;
		vi.spyOn(handle, "read").mockImplementation((async (
			buffer: Buffer,
			offset: number,
			length: number,
			position: number,
		) => {
			if (initialBytes === input.envelope.length && position === 0)
				confirming = true;
			const observed: ObservedRead = {
				buffer,
				offset,
				length,
				position,
				confirmation: confirming,
			};
			observation.reads.push(observed);
			observation.buffers.add(buffer);
			if (confirming) hooks.beforeConfirmation?.(observed);
			const chunk = confirming ? hooks.confirmationChunk : hooks.initialChunk;
			const result = await read(
				buffer,
				offset,
				Math.min(length, chunk ?? length),
				position,
			);
			observed.bytesRead = result.bytesRead;
			if (confirming) {
				await hooks.afterConfirmation?.(observed);
			} else if (initialBytes < input.envelope.length) {
				initialBytes += result.bytesRead;
				if (initialBytes === input.envelope.length)
					await hooks.afterInitial?.();
			}
			return { bytesRead: observed.bytesRead, buffer };
		}) as typeof handle.read);
		return handle;
	});
	return probe;
}

function assertReleased(probe: Awaited<ReturnType<typeof observe>>) {
	expect(probe.observations.length).toBe(1);
	const observation = required(probe.observations[0]);
	expect(observation.closed).toBe(true);
	expect(observation.handle.fd).toBe(-1);
	expect(observation.buffers.size).toBeGreaterThan(0);
	for (const buffer of observation.buffers)
		expect(buffer.every((byte) => byte === 0)).toBe(true);
	return observation;
}

async function failureOf(operation: Promise<unknown>): Promise<unknown> {
	return operation.then(
		() => undefined,
		(cause: unknown) => cause,
	);
}

function assertFailure(error: unknown, input: Fixture) {
	expect(error instanceof Error).toBe(true);
	if (!(error instanceof Error))
		throw new Error("Expected checkpoint rejection");
	expect(error.message === failureMessage).toBe(true);
	expect(Object.getOwnPropertyNames(error).sort()).toEqual([
		"message",
		"stack",
	]);
	const rendered = inspect(error);
	for (const marker of [
		input.path,
		input.key.toString("hex"),
		input.envelope.subarray(0, 24).toString("hex"),
		"synthetic-checkpoint-user",
	])
		expect(rendered.includes(marker)).toBe(false);
}

async function assertDenied(operation: Promise<unknown>, input: Fixture) {
	assertFailure(await failureOf(operation), input);
}

function invalidCount(kind: string, length: number): number | undefined {
	switch (kind) {
		case "zero":
			return 0;
		case "negative":
			return -1;
		case "fractional":
			return 0.5;
		case "nan":
			return Number.NaN;
		case "infinite":
			return Number.POSITIVE_INFINITY;
		case "oversized":
			return length + 1;
		default:
			return undefined;
	}
}

async function assertPoisoned(input: Fixture) {
	await assertDenied(input.store.load(), input);
	await assertDenied(input.store.save([]), input);
}

afterEach(async () => {
	vi.restoreAllMocks();
	for (const store of stores.splice(0)) await store.close().catch(() => {});
	for (const buffer of fixtureBuffers.splice(0)) buffer.fill(0);
	for (const directory of directories.splice(0))
		await fs.rm(directory, { recursive: true, force: true });
});

it.each([
	{ count: 0, initialChunk: 7, confirmationChunk: 5 },
	{ count: 1, initialChunk: 19, confirmationChunk: 13 },
	{ count: 64, initialChunk: 4093, confirmationChunk: 4091 },
])(
	"confirms stable $count-record envelopes with bounded, positioned short reads",
	async ({ count, initialChunk, confirmationChunk }) => {
		const input = await fixture(count);
		if (count === 0) expect(input.envelope.length).toBe(42);
		if (count === 64)
			expect(input.envelope.length).toBeGreaterThan(confirmationLimit * 2);
		const probe = await observe(input, { initialChunk, confirmationChunk });
		const loaded = required(await input.store.load());
		expect(loaded.length).toBe(count);
		expect(
			loaded.every(
				(record, index) =>
					record.counter === input.records[index].counter &&
					Buffer.from(record.id).equals(input.records[index].id),
			),
		).toBe(true);
		const observation = assertReleased(probe);
		const confirmation = observation.reads.filter((read) => read.confirmation);
		expect(confirmation.length).toBeGreaterThan(1);
		let position = 0;
		const scratch = new Set<Buffer>();
		for (const read of confirmation) {
			expect(read.position).toBe(position);
			expect(read.offset).toBeGreaterThanOrEqual(0);
			expect(read.offset + read.length).toBeLessThanOrEqual(read.buffer.length);
			expect(read.length).toBeGreaterThan(0);
			expect(read.length).toBeLessThanOrEqual(confirmationLimit);
			expect(read.buffer.length).toBeLessThanOrEqual(confirmationLimit);
			if (position === input.envelope.length) {
				expect(read.length).toBe(1);
				expect(read.bytesRead).toBe(0);
			} else {
				scratch.add(read.buffer);
				expect(read.length).toBeLessThanOrEqual(
					input.envelope.length - position,
				);
				expect(required(read.bytesRead)).toBeGreaterThan(0);
				expect(required(read.bytesRead)).toBeLessThanOrEqual(confirmationChunk);
				position += required(read.bytesRead);
			}
		}
		expect(position).toBe(input.envelope.length);
		expect(required(confirmation.at(-1)).position).toBe(input.envelope.length);
		expect(required(confirmation.at(-1)).bytesRead).toBe(0);
		expect(
			[...scratch].reduce((total, buffer) => total + buffer.length, 0),
		).toBeLessThanOrEqual(confirmationLimit);
		for (const record of loaded) {
			record.id.fill(0);
			record.user.id.fill(0);
		}
	},
);

it.each([
	{ count: 0, operation: "load", location: "first" },
	{ count: 0, operation: "save", location: "last" },
	{ count: 1, operation: "load", location: "last" },
	{ count: 1, operation: "save", location: "first" },
	{ count: 64, operation: "load", location: "boundary" },
	{ count: 64, operation: "load", location: "last" },
	{ count: 64, operation: "save", location: "last" },
])(
	"rejects a masked same-size $location ciphertext rewrite after reading $count records on $operation",
	async ({ count, operation, location }) => {
		const input = await fixture(count);
		const replacement = Buffer.from(input.envelope);
		fixtureBuffers.push(replacement);
		const position =
			location === "first"
				? 24
				: location === "boundary"
					? confirmationLimit + 3
					: replacement.length - 17;
		replacement[position] ^= 1;
		let mutations = 0;
		let ciphertextDiffers = false;
		let sameLength = false;
		const probe = await observe(input, {
			afterInitial: async () => {
				await fs.writeFile(input.path, replacement);
				mutations++;
				const rewritten = await fs.readFile(input.path);
				try {
					ciphertextDiffers =
						rewritten.equals(replacement) && !rewritten.equals(input.envelope);
					sameLength = rewritten.length === input.envelope.length;
				} finally {
					rewritten.fill(0);
				}
			},
		});
		const pending =
			operation === "load" ? input.store.load() : input.store.save([]);
		const error = await failureOf(pending);
		expect(mutations).toBe(1);
		expect(ciphertextDiffers).toBe(true);
		expect(sameLength).toBe(true);
		assertFailure(error, input);
		expect((await nativeLstat(input.path, { bigint: true })).size).toBe(
			BigInt(input.envelope.length),
		);
		expect((await fs.readFile(input.path)).equals(replacement)).toBe(true);
		await assertPoisoned(input);
		if (operation === "save")
			expect((await fs.readdir(input.directory)).sort()).toEqual([
				"checkpoint.bin",
				"checkpoint.bin.lock",
			]);
		assertReleased(probe);
	},
);

it.each([
	"throw",
	"zero",
	"negative",
	"fractional",
	"nan",
	"infinite",
	"oversized",
	"missing",
])(
	"rejects %s confirmation data reads, wipes buffers and poisons",
	async (kind) => {
		const input = await fixture(1);
		let injected = 0;
		const probe = await observe(input, {
			beforeConfirmation: (read) => {
				if (kind !== "throw") return;
				read.buffer.fill(0x7b);
				injected++;
				throw new Error(
					`${input.key.toString("hex")}:${input.envelope.subarray(0, 24).toString("hex")}`,
				);
			},
			afterConfirmation: async (read) => {
				injected++;
				read.bytesRead = invalidCount(kind, read.length);
			},
		});
		await assertDenied(input.store.load(), input);
		expect(injected).toBe(1);
		await assertPoisoned(input);
		assertReleased(probe);
	},
);

it.each(["throw", "negative", "fractional", "nan", "infinite", "missing"])(
	"rejects %s confirmation EOF results and releases the descriptor",
	async (kind) => {
		const input = await fixture();
		let injected = 0;
		const probe = await observe(input, {
			afterConfirmation: async (read) => {
				if (read.position !== input.envelope.length) return;
				injected++;
				read.buffer.fill(0x7b);
				if (kind === "throw") throw new Error("synthetic-checkpoint-user");
				read.bytesRead = invalidCount(kind, read.length);
			},
		});
		await assertDenied(input.store.load(), input);
		expect(injected).toBe(1);
		await assertPoisoned(input);
		assertReleased(probe);
	},
);

it.each(["growth", "replacement"])(
	"rejects %s after the last confirmation data read",
	async (kind) => {
		const input = await fixture(64);
		let mutations = 0;
		const probe = await observe(input, {
			confirmationChunk: 4091,
			afterConfirmation: async (read) => {
				if (
					read.position === input.envelope.length ||
					read.position + required(read.bytesRead) !== input.envelope.length
				)
					return;
				if (kind === "growth") {
					await fs.appendFile(input.path, Buffer.from([1]));
				} else {
					await fs.rename(input.path, `${input.path}.held`);
					await fs.writeFile(input.path, input.envelope, {
						mode: 0o600,
						flag: "wx",
					});
					probe.maskPath = false;
				}
				mutations++;
			},
		});
		await assertDenied(input.store.load(), input);
		expect(mutations).toBe(1);
		await assertPoisoned(input);
		const observation = assertReleased(probe);
		const eof = required(observation.reads.at(-1));
		expect(eof.confirmation).toBe(true);
		expect(eof.position).toBe(input.envelope.length);
		expect(eof.bytesRead).toBe(kind === "growth" ? 1 : 0);
		if (kind === "replacement")
			expect((await fs.readFile(input.path)).equals(input.envelope)).toBe(true);
	},
);

it("cleans owned resources after a masked rewrite during initial open", async () => {
	const input = await fixture();
	await input.store.close();
	const replacement = Buffer.from(input.envelope);
	fixtureBuffers.push(replacement);
	replacement[24] ^= 1;
	let mutations = 0;
	let ciphertextDiffers = false;
	let sameLength = false;
	const probe = await observe(input, {
		afterInitial: async () => {
			await fs.writeFile(input.path, replacement);
			mutations++;
			const rewritten = await fs.readFile(input.path);
			try {
				ciphertextDiffers =
					rewritten.equals(replacement) && !rewritten.equals(input.envelope);
				sameLength = rewritten.length === input.envelope.length;
			} finally {
				rewritten.fill(0);
			}
		},
	});
	let returned: NodePasskeyCheckpointFile | undefined;
	const error = await failureOf(
		NodePasskeyCheckpointFile.open({
			path: input.path,
			key: input.key,
		}).then((store) => {
			stores.push(store);
			returned = store;
		}),
	);
	expect(mutations).toBe(1);
	expect(ciphertextDiffers).toBe(true);
	expect(sameLength).toBe(true);
	assertFailure(error, input);
	expect(returned === undefined).toBe(true);
	assertReleased(probe);
	expect(probe.handles.length).toBe(3);
	for (const handle of probe.handles) expect(handle.fd).toBe(-1);
	expect(await fs.readdir(input.directory)).toEqual(["checkpoint.bin"]);
});

it("confirms a small envelope with one-byte progress through EOF", async () => {
	const input = await fixture();
	const probe = await observe(input, { confirmationChunk: 1 });
	expect(await input.store.load()).toEqual([]);
	const observation = assertReleased(probe);
	const confirmation = observation.reads.filter((read) => read.confirmation);
	expect(input.envelope.length).toBe(42);
	expect(confirmation.length).toBe(input.envelope.length + 1);
	for (const [position, read] of confirmation.entries()) {
		expect(read.position).toBe(position);
		expect(read.bytesRead).toBe(position < input.envelope.length ? 1 : 0);
		expect(read.length).toBeGreaterThan(0);
		expect(read.length).toBeLessThanOrEqual(
			Math.max(1, input.envelope.length - position),
		);
		expect(read.buffer.length).toBeLessThanOrEqual(confirmationLimit);
	}
});
