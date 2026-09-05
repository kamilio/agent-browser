import { generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import {
	NodePasskeyCheckpointFile,
	type NodePasskeyCheckpointFileOptions,
} from "./node-passkey-checkpoint-file.js";
import {
	NodePasskeyCheckpointCodec,
	type NodePasskeyCheckpointRecord,
} from "./node-passkey-checkpoint.js";

vi.mock("node:fs/promises", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const directories: string[] = [];
const stores: NodePasskeyCheckpointFile[] = [];
const failure = new Error("Passkey checkpoint file operation denied");
function required<Value>(value: Value | undefined): Value {
	if (value === undefined) throw new Error("Missing synthetic fixture value");
	return value;
}
const nativeLstat = fs.lstat;

async function fixture() {
	const directory = await fs.mkdtemp("/tmp/agent-browser-passkey-checkpoint-");
	directories.push(directory);
	const path = join(directory, "checkpoint.bin");
	const key = randomBytes(32);
	const record: NodePasskeyCheckpointRecord = {
		id: randomBytes(32),
		rpId: "checkpoint.example",
		user: {
			id: randomBytes(32),
			name: "synthetic-private-name",
			displayName: "Synthetic Private Display",
		},
		privateKey: generateKeyPairSync("ec", { namedCurve: "prime256v1" })
			.privateKey,
		counter: 7,
	};
	return { directory, path, key, record };
}

async function opened(path: string, key: Uint8Array) {
	const store = await NodePasskeyCheckpointFile.open({ path, key });
	stores.push(store);
	return store;
}

async function put(path: string, bytes: Uint8Array | string) {
	await fs.writeFile(path, bytes, { mode: 0o600, flag: "wx" });
}

function encrypted(
	key: Uint8Array,
	records: NodePasskeyCheckpointRecord[] = [],
) {
	const codec = new NodePasskeyCheckpointCodec(key);
	try {
		return codec.seal(records);
	} finally {
		codec.close();
	}
}

afterEach(async () => {
	vi.restoreAllMocks();
	for (const store of stores.splice(0)) await store.close().catch(() => {});
	for (const directory of directories.splice(0))
		await fs.rm(directory, { recursive: true, force: true });
});

it("encrypts genuine records, acknowledges durability in order, and reopens independent signing keys", async () => {
	const { directory, path, key, record } = await fixture();
	const store = await opened(path, key);
	const events: string[] = [];
	const originalOpen = fs.open;
	const originalRename = fs.rename;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await originalOpen(...args);
		if (String(args[0]).endsWith(".part")) {
			const originalSync = handle.sync.bind(handle);
			vi.spyOn(handle, "sync").mockImplementation(async () => {
				events.push("file-sync");
				await originalSync();
			});
		}
		return handle;
	});
	vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
		events.push("rename");
		await originalRename(...args);
	});
	await store.save([record]);
	expect(events).toEqual(["file-sync", "rename"]);
	const bytes = await fs.readFile(path);
	const der = record.privateKey.export({ format: "der", type: "pkcs8" });
	for (const secret of [
		key,
		der,
		record.id,
		record.user.id,
		Buffer.from(record.user.name),
		Buffer.from(record.rpId),
	]) {
		expect(bytes.includes(Buffer.from(secret))).toBe(false);
	}
	der.fill(0);
	expect((await fs.stat(path)).mode & 0o777).toBe(0o600);
	expect((await fs.stat(`${path}.lock`)).mode & 0o777).toBe(0o600);
	expect(await fs.readFile(`${path}.lock`)).toHaveLength(0);
	expect(Reflect.ownKeys(store)).toEqual([]);
	expect(JSON.stringify(store)).toBe("{}");
	expect(inspect(store)).not.toContain(path);
	const records = required(await store.load());
	expect(records?.[0]).toMatchObject({
		rpId: record.rpId,
		user: { ...record.user, id: new Uint8Array(record.user.id) },
		counter: 7,
	});
	expect(records?.[0].id).toEqual(new Uint8Array(record.id));
	const message = Buffer.from("synthetic signature");
	expect(
		verify(
			"sha256",
			message,
			record.privateKey,
			sign("sha256", message, records[0].privateKey),
		),
	).toBe(true);
	records[0].id.fill(0);
	records[0].user.id.fill(0);
	records[0].counter = 99;
	expect((await store.load())?.[0].counter).toBe(7);
	await store.close();
	expect(await fs.readdir(directory)).toEqual(["checkpoint.bin"]);
	const reopened = await opened(path, key);
	expect((await reopened.load())?.[0].counter).toBe(7);
	await reopened.save([{ ...record, counter: 8 }]);
	expect((await reopened.load())?.[0].counter).toBe(8);
	expect(record.counter).toBe(7);
});

it("distinguishes absence from authenticated emptiness and creates only on explicit save", async () => {
	const { directory, path, key } = await fixture();
	const store = await opened(path, key);
	expect(await store.load()).toBeUndefined();
	expect(await fs.readdir(directory)).toEqual(["checkpoint.bin.lock"]);
	await store.save([]);
	expect(await store.load()).toEqual([]);
	expect((await fs.stat(path)).size).toBe(42);
});

it("copies the encryption key before the first await and does not wipe caller-owned bytes", async () => {
	const { path, key } = await fixture();
	const retained = Buffer.from(key);
	const opening = opened(path, key);
	key.fill(0);
	const store = await opening;
	await store.save([]);
	await store.close();
	expect(key).toEqual(Buffer.alloc(32));
	const reopened = await opened(path, retained);
	expect(await reopened.load()).toEqual([]);
	expect(retained.some((byte) => byte !== 0)).toBe(true);
});

it.each(["empty", "corrupt", "wrong-key", "oversized"])(
	"refuses %s existing files without treating them as empty",
	async (kind) => {
		const { directory, path, key } = await fixture();
		const bytes =
			kind === "empty"
				? Buffer.alloc(0)
				: kind === "oversized"
					? Buffer.alloc(201515)
					: encrypted(key);
		if (kind === "corrupt") bytes[24] ^= 1;
		await put(path, bytes);
		await expect(
			opened(path, kind === "wrong-key" ? randomBytes(32) : key),
		).rejects.toEqual(failure);
		expect(await fs.readFile(path)).toEqual(bytes);
		expect(await fs.readdir(directory)).toEqual(["checkpoint.bin"]);
	},
);

it.each([
	"relative",
	"noncanonical",
	"nul",
	"short-key",
	"string-key",
	"accessor",
	"extra",
])("rejects %s options before touching storage", async (kind) => {
	const { directory, path, key } = await fixture();
	const options: Record<string, unknown> = { path, key };
	if (kind === "relative") options.path = "checkpoint.bin";
	if (kind === "noncanonical") options.path = `${directory}/./checkpoint.bin`;
	if (kind === "nul") options.path = `${path}\0`;
	if (kind === "short-key") options.key = randomBytes(31);
	if (kind === "string-key") options.key = "synthetic-password";
	if (kind === "extra") options.extra = true;
	const getter = vi.fn(() => path);
	if (kind === "accessor")
		Object.defineProperty(options, "path", { get: getter });
	await expect(
		NodePasskeyCheckpointFile.open(
			options as unknown as NodePasskeyCheckpointFileOptions,
		),
	).rejects.toEqual(failure);
	expect(getter).not.toHaveBeenCalled();
	expect(await fs.readdir(directory)).toEqual([]);
});

it.each([0o644, 0o640, 0o606])(
	"rejects nonprivate file mode %s",
	async (mode) => {
		const { path, key } = await fixture();
		await put(path, encrypted(key));
		await fs.chmod(path, mode);
		await expect(opened(path, key)).rejects.toEqual(failure);
	},
);

it("preserves an existing read-only mode without broadening it", async () => {
	const { path, key } = await fixture();
	await put(path, encrypted(key));
	await fs.chmod(path, 0o400);
	const store = await opened(path, key);
	await store.save([]);
	expect((await fs.stat(path)).mode & 0o777).toBe(0o400);
});

it.each(["hardlink", "symlink", "directory", "owner", "fifo", "device"])(
	"refuses %s targets (owner/FIFO/device cases use injected metadata)",
	async (kind) => {
		const { directory, path, key } = await fixture();
		const bytes = encrypted(key);
		if (kind === "directory") await fs.mkdir(path, { mode: 0o700 });
		else if (kind === "symlink") {
			await put(join(directory, "other"), bytes);
			await fs.symlink(join(directory, "other"), path);
		} else await put(path, bytes);
		if (kind === "hardlink") await fs.link(path, join(directory, "other"));
		const originalLstat = nativeLstat;
		if (["owner", "fifo", "device"].includes(kind))
			vi.spyOn(fs, "lstat").mockImplementation((async (
				...args: Parameters<typeof fs.lstat>
			) => {
				const info = await originalLstat(...args);
				if (args[0] === path) {
					if (kind === "owner")
						Object.assign(info, {
							uid: BigInt(required(process.getuid)() + 1),
						});
					else
						Object.assign(info, {
							isFile: () => false,
							isFIFO: () => kind === "fifo",
							isCharacterDevice: () => kind === "device",
						});
				}
				return info;
			}) as typeof fs.lstat);
		const openSpy = vi.spyOn(fs, "open");
		await expect(opened(path, key)).rejects.toEqual(failure);
		expect(openSpy.mock.calls.some(([filename]) => filename === path)).toBe(
			false,
		);
	},
);

it.each(["writable-parent", "symlink-parent", "writable-ancestor"])(
	"refuses %s",
	async (kind) => {
		const { directory, path, key } = await fixture();
		let candidate = path;
		if (kind === "writable-parent") await fs.chmod(directory, 0o777);
		if (kind === "symlink-parent") {
			const link = join(directory, "alias");
			await fs.symlink(directory, link);
			candidate = join(link, "checkpoint.bin");
		}
		if (kind === "writable-ancestor") {
			const nested = join(directory, "nested");
			await fs.mkdir(nested, { mode: 0o700 });
			await fs.chmod(directory, 0o777);
			candidate = join(nested, "checkpoint.bin");
		}
		await expect(opened(candidate, key)).rejects.toEqual(failure);
	},
);

it("rejects concurrent same-path instances and preserves stale locks", async () => {
	const { path, key } = await fixture();
	const first = await opened(path, key);
	const lock = await fs.stat(`${path}.lock`);
	await expect(opened(path, key)).rejects.toEqual(failure);
	expect((await fs.stat(`${path}.lock`)).ino).toBe(lock.ino);
	await first.close();
	await put(`${path}.lock`, "synthetic stale lock");
	await expect(opened(path, key)).rejects.toEqual(failure);
	expect(await fs.readFile(`${path}.lock`, "utf8")).toBe(
		"synthetic stale lock",
	);
});

it.each(["replace", "mutate", "remove", "appear", "chmod"])(
	"poisons on externally %s checkpoint state",
	async (kind) => {
		const { path, key } = await fixture();
		if (kind !== "appear") await put(path, encrypted(key));
		const store = await opened(path, key);
		if (kind === "replace") {
			await fs.rename(path, `${path}.old`);
			await put(path, encrypted(key));
		}
		if (kind === "mutate") await fs.writeFile(path, encrypted(key));
		if (kind === "remove") await fs.unlink(path);
		if (kind === "appear") await put(path, encrypted(key));
		if (kind === "chmod") await fs.chmod(path, 0o640);
		await expect(store.load()).rejects.toEqual(failure);
		await expect(store.save([])).rejects.toEqual(failure);
	},
);

it("hash-checks in-place ciphertext mutation with injected unchanged timestamp metadata", async () => {
	const { path, key } = await fixture();
	await put(path, encrypted(key));
	const store = await opened(path, key);
	const before = await fs.stat(path, { bigint: true });
	await fs.writeFile(path, encrypted(key));
	const originalLstat = nativeLstat;
	vi.spyOn(fs, "lstat").mockImplementation((async (
		...args: Parameters<typeof fs.lstat>
	) =>
		args[0] === path ? before : originalLstat(...args)) as typeof fs.lstat);
	const originalOpen = fs.open;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await originalOpen(...args);
		if (args[0] === path) vi.spyOn(handle, "stat").mockResolvedValue(before);
		return handle;
	});
	await expect(store.load()).rejects.toEqual(failure);
});

it.each([
	"write",
	"zero-write",
	"file-sync",
	"rename",
	"rename-after-publication",
	"directory-sync",
])("poisons and cleans owned temporaries on %s failure", async (stage) => {
	const { directory, path, key, record } = await fixture();
	const originalOpen = fs.open;
	let directoryHandle: fs.FileHandle | undefined;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await originalOpen(...args);
		if (args[0] === directory) directoryHandle = handle;
		return handle;
	});
	const store = await opened(path, key);
	await store.save([]);
	const previous = await fs.readFile(path);
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await originalOpen(...args);
		if (String(args[0]).endsWith(".part")) {
			if (stage === "write")
				vi.spyOn(handle, "write").mockRejectedValueOnce(
					new Error(`synthetic OS secret ${path}`),
				);
			if (stage === "zero-write")
				vi.spyOn(handle, "write").mockResolvedValueOnce({
					bytesWritten: 0,
					buffer: "",
				});
			if (stage === "file-sync")
				vi.spyOn(handle, "sync").mockRejectedValueOnce(
					new Error("synthetic sync failure"),
				);
		}
		return handle;
	});
	const originalRename = fs.rename;
	if (stage.startsWith("rename"))
		vi.spyOn(fs, "rename").mockImplementationOnce(async (...args) => {
			if (stage === "rename-after-publication") await originalRename(...args);
			throw new Error("synthetic rename failure");
		});
	if (stage === "directory-sync")
		vi.spyOn(required(directoryHandle), "sync").mockRejectedValueOnce(
			new Error("synthetic directory sync failure"),
		);
	await expect(store.save([record])).rejects.toEqual(failure);
	await expect(store.load()).rejects.toEqual(failure);
	await expect(store.save([])).rejects.toEqual(failure);
	const published =
		stage === "directory-sync" || stage === "rename-after-publication";
	if (!published) expect(await fs.readFile(path)).toEqual(previous);
	expect(
		(await fs.readdir(directory)).filter((name) => name.endsWith(".part")),
	).toEqual([]);
	await store.close();
	const reopened = await opened(path, key);
	expect((await reopened.load())?.length).toBe(published ? 1 : 0);
});

it("completes partial writes and waits for parent sync before acknowledging save", async () => {
	const { directory, path, key, record } = await fixture();
	const originalOpen = fs.open;
	let directoryHandle: fs.FileHandle | undefined;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await originalOpen(...args);
		if (args[0] === directory) directoryHandle = handle;
		if (
			String(args[0]).endsWith(".part") &&
			typeof args[1] === "number" &&
			(args[1] & constants.O_CREAT) !== 0
		) {
			const write = handle.write.bind(handle);
			vi.spyOn(handle, "write").mockImplementation(((
				buffer: Buffer,
				offset: number,
				length: number,
				position: number,
			) =>
				write(
					buffer,
					offset,
					Math.min(length, 9),
					position,
				)) as typeof handle.write);
		}
		return handle;
	});
	const store = await opened(path, key);
	let release!: () => void;
	let entered!: () => void;
	const waiting = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const sync = required(directoryHandle).sync.bind(directoryHandle);
	vi.spyOn(required(directoryHandle), "sync").mockImplementationOnce(
		async () => {
			entered();
			await gate;
			await sync();
		},
	);
	let acknowledged = false;
	const saving = store.save([record]).then(() => {
		acknowledged = true;
	});
	await waiting;
	expect(acknowledged).toBe(false);
	await expect(store.load()).rejects.toEqual(failure);
	await expect(store.save([])).rejects.toEqual(failure);
	const closing = store.close();
	expect(store.close()).toBe(closing);
	await expect(store.load()).rejects.toEqual(failure);
	await expect(opened(path, key)).rejects.toEqual(failure);
	release();
	await saving;
	await closing;
	expect(acknowledged).toBe(true);
	const reopened = await opened(path, key);
	expect((await reopened.load())?.[0].counter).toBe(7);
});

it.each(["lock", "temporary"])(
	"never deletes an externally replaced %s",
	async (kind) => {
		const { directory, path, key } = await fixture();
		const store = await opened(path, key);
		if (kind === "lock") {
			await fs.rename(`${path}.lock`, `${path}.held-lock`);
			await put(`${path}.lock`, "synthetic replacement");
			await expect(store.load()).rejects.toEqual(failure);
			await expect(store.close()).rejects.toEqual(failure);
			expect(await fs.readFile(`${path}.lock`, "utf8")).toBe(
				"synthetic replacement",
			);
		} else {
			const originalOpen = fs.open;
			let replacement = "";
			vi.spyOn(fs, "open").mockImplementation(async (...args) => {
				const handle = await originalOpen(...args);
				if (String(args[0]).endsWith(".part")) {
					const sync = handle.sync.bind(handle);
					vi.spyOn(handle, "sync").mockImplementationOnce(async () => {
						await sync();
						replacement = String(args[0]);
						await fs.rename(replacement, join(directory, "held-temporary"));
						await put(replacement, "synthetic replacement");
					});
				}
				return handle;
			});
			await expect(store.save([])).rejects.toEqual(failure);
			expect(await fs.readFile(replacement, "utf8")).toBe(
				"synthetic replacement",
			);
			await expect(fs.lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
		}
	},
);

it("refuses changed directory ancestry and leaves locks in renamed directories alone", async () => {
	const { directory, path, key } = await fixture();
	const store = await opened(path, key);
	const moved = `${directory}-moved`;
	directories.push(moved);
	await fs.rename(directory, moved);
	await fs.mkdir(directory, { mode: 0o700 });
	await put(`${path}.lock`, "synthetic unknown lock");
	await expect(store.save([])).rejects.toEqual(failure);
	await expect(store.close()).rejects.toEqual(failure);
	expect(await fs.readFile(`${path}.lock`, "utf8")).toBe(
		"synthetic unknown lock",
	);
	expect((await fs.stat(join(moved, "checkpoint.bin.lock"))).isFile()).toBe(
		true,
	);
});

it("reports only fixed error fields and denies all operations after close", async () => {
	const { path, key } = await fixture();
	const store = await opened(path, key);
	await store.close();
	const error = await store.load().catch((error: Error) => error);
	expect(error).toEqual(failure);
	expect(Object.getOwnPropertyNames(error).sort()).toEqual([
		"message",
		"stack",
	]);
	expect(inspect(error)).not.toContain(path);
	expect(JSON.stringify(error)).toBe("{}");
	await expect(store.save([])).rejects.toEqual(failure);
	await store.close();
});

it.each(["symlink", "hardlink", "directory", "public"])(
	"leaves unknown %s locks untouched",
	async (kind) => {
		const { directory, path, key } = await fixture();
		const lock = `${path}.lock`;
		if (kind === "directory") await fs.mkdir(lock, { mode: 0o700 });
		else if (kind === "symlink") {
			await put(join(directory, "unknown"), "synthetic unknown bytes");
			await fs.symlink(join(directory, "unknown"), lock);
		} else {
			await put(lock, "synthetic unknown bytes");
			if (kind === "hardlink") await fs.link(lock, join(directory, "unknown"));
			if (kind === "public") await fs.chmod(lock, 0o644);
		}
		const before = await nativeLstat(lock, { bigint: true });
		await expect(opened(path, key)).rejects.toEqual(failure);
		const after = await nativeLstat(lock, { bigint: true });
		expect(after.ino).toBe(before.ino);
		expect(after.mode).toBe(before.mode);
	},
);

it.each(["mutation", "replacement", "short-read", "growth"])(
	"rejects %s during a checkpoint read",
	async (kind) => {
		const { path, key } = await fixture();
		await put(path, encrypted(key));
		const store = await opened(path, key);
		const originalOpen = fs.open;
		vi.spyOn(fs, "open").mockImplementation(async (...args) => {
			const handle = await originalOpen(...args);
			if (args[0] === path) {
				const read = handle.read.bind(handle);
				vi.spyOn(handle, "read").mockImplementationOnce((async (
					...readArgs: Parameters<typeof handle.read>
				) => {
					if (kind === "short-read")
						return { bytesRead: 0, buffer: readArgs[0] };
					const result = await read(...readArgs);
					if (kind === "mutation") await fs.writeFile(path, encrypted(key));
					if (kind === "growth") await fs.appendFile(path, Buffer.from([1]));
					if (kind === "replacement") {
						await fs.rename(path, `${path}.held`);
						await put(path, encrypted(key));
					}
					return result;
				}) as typeof handle.read);
			}
			return handle;
		});
		await expect(store.load()).rejects.toEqual(failure);
		await expect(store.load()).rejects.toEqual(failure);
	},
);

it("revalidates the destination after writing, and never truncates an external replacement", async () => {
	const { path, key } = await fixture();
	const store = await opened(path, key);
	await store.save([]);
	const external = encrypted(key);
	const originalOpen = fs.open;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await originalOpen(...args);
		if (String(args[0]).endsWith(".part")) {
			const sync = handle.sync.bind(handle);
			vi.spyOn(handle, "sync").mockImplementationOnce(async () => {
				await sync();
				await fs.rename(path, `${path}.held`);
				await put(path, external);
			});
		}
		return handle;
	});
	await expect(store.save([])).rejects.toEqual(failure);
	expect(await fs.readFile(path)).toEqual(external);
});

it("writes only codec ciphertext and wipes its owned envelope after filesystem failure", async () => {
	const { path, key, record } = await fixture();
	const store = await opened(path, key);
	const originalSeal = NodePasskeyCheckpointCodec.prototype.seal;
	let owned: Buffer | undefined;
	let copy: Buffer | undefined;
	vi.spyOn(NodePasskeyCheckpointCodec.prototype, "seal").mockImplementation(
		function (this: NodePasskeyCheckpointCodec, records) {
			owned = originalSeal.call(this, records);
			copy = Buffer.from(owned);
			return owned;
		},
	);
	const originalOpen = fs.open;
	let observed: Buffer | undefined;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await originalOpen(...args);
		if (String(args[0]).endsWith(".part")) {
			vi.spyOn(handle, "write").mockImplementationOnce((async (
				bytes: Buffer | string,
			) => {
				if (typeof bytes === "string")
					throw new Error("Unexpected plaintext write");
				observed = Buffer.from(bytes);
				throw new Error("synthetic private failure");
			}) as typeof handle.write);
		}
		return handle;
	});
	await expect(store.save([record])).rejects.toEqual(failure);
	expect(required(observed)).toEqual(copy);
	expect(required(observed).includes(key)).toBe(false);
	expect(required(observed).includes(Buffer.from(record.user.name))).toBe(
		false,
	);
	expect(owned).toEqual(Buffer.alloc(required(owned).length));
	expect(record.id.some((byte) => byte !== 0)).toBe(true);
	expect(record.user.id.some((byte) => byte !== 0)).toBe(true);
	copy?.fill(0);
	observed?.fill(0);
});

it("close waits for failed in-flight cleanup before releasing its lock", async () => {
	const { directory, path, key } = await fixture();
	const store = await opened(path, key);
	const originalUnlink = fs.unlink;
	let release!: () => void;
	let entered!: () => void;
	const waiting = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	vi.spyOn(fs, "rename").mockRejectedValueOnce(
		new Error("synthetic rename failure"),
	);
	vi.spyOn(fs, "unlink").mockImplementation(async (...args) => {
		if (String(args[0]).endsWith(".part")) {
			entered();
			await gate;
		}
		await originalUnlink(...args);
	});
	const saving = store.save([]);
	const rejected = expect(saving).rejects.toEqual(failure);
	await waiting;
	let closed = false;
	const closing = store.close().then(() => {
		closed = true;
	});
	await expect(opened(path, key)).rejects.toEqual(failure);
	expect(closed).toBe(false);
	expect(
		(await fs.readdir(directory)).some((name) => name.endsWith(".part")),
	).toBe(true);
	release();
	await rejected;
	await closing;
	expect(await fs.readdir(directory)).toEqual([]);
});

it("leaves a colliding unknown temporary untouched rather than reopening it", async () => {
	const { directory, path, key } = await fixture();
	const store = await opened(path, key);
	const originalOpen = fs.open;
	let collision = "";
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		if (String(args[0]).endsWith(".part")) {
			collision = String(args[0]);
			await put(collision, "synthetic collision");
		}
		return originalOpen(...args);
	});
	await expect(store.save([])).rejects.toEqual(failure);
	expect(await fs.readFile(collision, "utf8")).toBe("synthetic collision");
	expect((await fs.readdir(directory)).length).toBe(2);
});

it("current codec accepts same-key old checkpoints after reopening, not rollback protection", async () => {
	const { path, key, record } = await fixture();
	const store = await opened(path, key);
	await store.save([record]);
	const backup = await fs.readFile(path);
	await store.save([{ ...record, counter: 8 }]);
	await store.close();
	await fs.writeFile(path, backup);
	const reopened = await opened(path, key);
	expect((await reopened.load())?.[0].counter).toBe(7);
});
