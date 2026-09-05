import { createHash, randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { type FileHandle, lstat, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { types } from "node:util";
import {
	NodePasskeyCheckpointCodec,
	type NodePasskeyCheckpointRecord,
} from "./node-passkey-checkpoint.js";
import {
	assertPrivateFile,
	privateFileLocation,
	samePrivateFile,
} from "./node-private-files.js";
import { passkeyLimits } from "./passkeys.js";

const maximumEnvelopeBytes =
	42 +
	passkeyLimits.credentialCount *
		(16 +
			passkeyLimits.credentialIdBytes +
			253 +
			64 +
			passkeyLimits.nameChars * 6 +
			256);
const readFlags =
	constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const createFlags =
	constants.O_RDWR |
	constants.O_CREAT |
	constants.O_EXCL |
	constants.O_NOFOLLOW |
	constants.O_NONBLOCK;

interface CheckpointState {
	info: BigIntStats;
	hash: Buffer;
}

interface Snapshot extends CheckpointState {
	bytes: Buffer;
}

export interface NodePasskeyCheckpointFileOptions {
	path: string;
	key: Uint8Array;
}

function denied(): Error {
	return new Error("Passkey checkpoint file operation denied");
}

function sameState(first: BigIntStats, second: BigIntStats): boolean {
	return (
		samePrivateFile(first, second) &&
		first.mode === second.mode &&
		first.uid === second.uid &&
		first.gid === second.gid &&
		first.nlink === second.nlink &&
		first.size === second.size &&
		first.mtimeNs === second.mtimeNs &&
		first.ctimeNs === second.ctimeNs
	);
}

function wipe(snapshot: Snapshot | undefined): void {
	snapshot?.bytes.fill(0);
	snapshot?.hash.fill(0);
}

export class NodePasskeyCheckpointFile {
	#path: string;
	#codec: NodePasskeyCheckpointCodec;
	#location: Awaited<ReturnType<typeof privateFileLocation>>;
	#directory: FileHandle | undefined;
	#lock: FileHandle | undefined;
	#lockInfo: BigIntStats | undefined;
	#expected: CheckpointState | undefined;
	#active: Promise<unknown> | undefined;
	#closing = false;
	#poisoned = false;
	#closePromise: Promise<void> | undefined;

	private constructor(
		path: string,
		codec: NodePasskeyCheckpointCodec,
		location: Awaited<ReturnType<typeof privateFileLocation>>,
	) {
		this.#path = path;
		this.#codec = codec;
		this.#location = location;
	}

	static async open(
		options: NodePasskeyCheckpointFileOptions,
	): Promise<NodePasskeyCheckpointFile> {
		let codec: NodePasskeyCheckpointCodec | undefined;
		let store: NodePasskeyCheckpointFile | undefined;
		let snapshot: Snapshot | undefined;
		try {
			if (
				!options ||
				typeof options !== "object" ||
				types.isProxy(options) ||
				![Object.prototype, null].includes(Object.getPrototypeOf(options)) ||
				Reflect.ownKeys(options).length !== 2
			)
				throw denied();
			const path = Object.getOwnPropertyDescriptor(options, "path");
			const key = Object.getOwnPropertyDescriptor(options, "key");
			if (
				!path ||
				!key ||
				!Object.hasOwn(path, "value") ||
				!Object.hasOwn(key, "value")
			)
				throw denied();
			codec = new NodePasskeyCheckpointCodec(key.value);
			const location = await privateFileLocation(path.value, "Checkpoint");
			store = new NodePasskeyCheckpointFile(path.value, codec, location);
			store.#directory = await open(
				location.parent,
				readFlags | constants.O_DIRECTORY,
			);
			await store.#checkDirectory();
			store.#lock = await open(`${store.#path}.lock`, createFlags, 0o600);
			store.#lockInfo = await store.#lock.stat({ bigint: true });
			assertPrivateFile(store.#lockInfo, location.uid);
			await store.#lock.chmod(0o600);
			store.#lockInfo = await store.#lock.stat({ bigint: true });
			await store.#lock.sync();
			await store.#checkLock();
			await store.#directory.sync();
			snapshot = await store.#snapshot(store.#path);
			if (snapshot) {
				const records = codec.open(snapshot.bytes);
				for (const record of records) {
					record.id.fill(0);
					record.user.id.fill(0);
				}
			}
			await store.#checkLock();
			store.#remember(snapshot);
			return store;
		} catch {
			if (store) await store.close().catch(() => {});
			else codec?.close();
			throw denied();
		} finally {
			wipe(snapshot);
		}
	}

	async #checkDirectory(): Promise<void> {
		await this.#location.assertCurrent();
		if (
			!this.#directory ||
			!samePrivateFile(
				await this.#directory.stat({ bigint: true }),
				await lstat(this.#location.parent, { bigint: true }),
			)
		)
			throw denied();
	}

	async #checkLock(): Promise<void> {
		await this.#checkDirectory();
		if (!this.#lock || !this.#lockInfo) throw denied();
		const current = await lstat(`${this.#path}.lock`, { bigint: true });
		assertPrivateFile(current, this.#location.uid);
		if (
			!sameState(this.#lockInfo, current) ||
			!sameState(current, await this.#lock.stat({ bigint: true }))
		)
			throw denied();
	}

	async #snapshot(path: string): Promise<Snapshot | undefined> {
		let file: FileHandle | undefined;
		let bytes: Buffer | undefined;
		try {
			await this.#checkLock();
			let before: BigIntStats;
			try {
				before = await lstat(path, { bigint: true });
			} catch (error) {
				if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw denied();
				await this.#checkLock();
				return undefined;
			}
			assertPrivateFile(before, this.#location.uid);
			if (before.size < 42n || before.size > BigInt(maximumEnvelopeBytes))
				throw denied();
			file = await open(path, readFlags);
			if (!sameState(before, await file.stat({ bigint: true }))) throw denied();
			bytes = Buffer.alloc(Number(before.size));
			let offset = 0;
			while (offset < bytes.length) {
				const { bytesRead } = await file.read(
					bytes,
					offset,
					bytes.length - offset,
					offset,
				);
				if (
					!Number.isInteger(bytesRead) ||
					bytesRead <= 0 ||
					bytesRead > bytes.length - offset
				)
					throw denied();
				offset += bytesRead;
			}
			const extra = Buffer.alloc(1);
			try {
				if ((await file.read(extra, 0, 1, offset)).bytesRead !== 0)
					throw denied();
			} finally {
				extra.fill(0);
			}
			if (
				!sameState(before, await file.stat({ bigint: true })) ||
				!sameState(before, await lstat(path, { bigint: true }))
			)
				throw denied();
			await this.#checkLock();
			await file.close();
			file = undefined;
			const snapshot = {
				bytes,
				info: before,
				hash: createHash("sha256").update(bytes).digest(),
			};
			bytes = undefined;
			return snapshot;
		} finally {
			bytes?.fill(0);
			await file?.close();
		}
	}

	#remember(snapshot: Snapshot | undefined): void {
		this.#expected?.hash.fill(0);
		this.#expected = snapshot && {
			info: snapshot.info,
			hash: Buffer.from(snapshot.hash),
		};
	}

	async #checkedSnapshot(): Promise<Snapshot | undefined> {
		const snapshot = await this.#snapshot(this.#path);
		if (
			snapshot
				? !this.#expected ||
					!sameState(snapshot.info, this.#expected.info) ||
					!snapshot.hash.equals(this.#expected.hash)
				: this.#expected !== undefined
		) {
			wipe(snapshot);
			throw denied();
		}
		return snapshot;
	}

	#run<Result>(operation: () => Promise<Result>): Promise<Result> {
		if (this.#closing || this.#poisoned || this.#active)
			return Promise.reject(denied());
		const active = Promise.resolve()
			.then(operation)
			.catch(() => {
				this.#poisoned = true;
				throw denied();
			})
			.finally(() => {
				this.#active = undefined;
			});
		this.#active = active;
		return active;
	}

	load(): Promise<NodePasskeyCheckpointRecord[] | undefined> {
		return this.#run(async () => {
			const snapshot = await this.#checkedSnapshot();
			try {
				return snapshot ? this.#codec.open(snapshot.bytes) : undefined;
			} finally {
				wipe(snapshot);
			}
		});
	}

	async #removeOwned(path: string, info: BigIntStats): Promise<void> {
		await this.#checkDirectory();
		let current: BigIntStats;
		try {
			current = await lstat(path, { bigint: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
			throw denied();
		}
		assertPrivateFile(current, this.#location.uid);
		if (!samePrivateFile(info, current)) throw denied();
		await unlink(path);
	}

	save(records: readonly NodePasskeyCheckpointRecord[]): Promise<void> {
		return this.#run(async () => {
			let envelope: Buffer | undefined;
			let temporary: string | undefined;
			let file: FileHandle | undefined;
			let owned: BigIntStats | undefined;
			let published: Snapshot | undefined;
			try {
				envelope = this.#codec.seal(records);
				wipe(await this.#checkedSnapshot());
				temporary = join(
					this.#location.parent,
					`.passkey-checkpoint-${randomUUID()}.part`,
				);
				file = await open(temporary, createFlags, 0o600);
				owned = await file.stat({ bigint: true });
				assertPrivateFile(owned, this.#location.uid);
				let offset = 0;
				while (offset < envelope.length) {
					const { bytesWritten } = await file.write(
						envelope,
						offset,
						envelope.length - offset,
						offset,
					);
					if (
						!Number.isInteger(bytesWritten) ||
						bytesWritten <= 0 ||
						bytesWritten > envelope.length - offset
					)
						throw denied();
					offset += bytesWritten;
				}
				await file.chmod(
					this.#expected ? Number(this.#expected.info.mode & 0o600n) : 0o600,
				);
				await file.sync();
				const written = await this.#snapshot(temporary);
				const writtenInfo = written?.info;
				try {
					if (
						!written ||
						!samePrivateFile(owned, written.info) ||
						!written.bytes.equals(envelope)
					)
						throw denied();
				} finally {
					wipe(written);
				}
				wipe(await this.#checkedSnapshot());
				const current = await lstat(temporary, { bigint: true });
				assertPrivateFile(current, this.#location.uid);
				if (
					!writtenInfo ||
					!sameState(writtenInfo, current) ||
					!sameState(current, await file.stat({ bigint: true }))
				)
					throw denied();
				await this.#checkLock();
				await rename(temporary, this.#path);
				await this.#directory?.sync();
				published = await this.#snapshot(this.#path);
				if (
					!published ||
					!samePrivateFile(owned, published.info) ||
					!published.bytes.equals(envelope)
				)
					throw denied();
				await file.close();
				file = undefined;
				this.#remember(published);
			} finally {
				envelope?.fill(0);
				wipe(published);
				try {
					if (temporary && owned) await this.#removeOwned(temporary, owned);
				} finally {
					await file?.close();
				}
			}
		});
	}

	close(): Promise<void> {
		if (this.#closePromise) return this.#closePromise;
		this.#closing = true;
		this.#closePromise = (async () => {
			await this.#active?.catch(() => {});
			this.#codec.close();
			this.#expected?.hash.fill(0);
			this.#expected = undefined;
			try {
				if (this.#lock && this.#lockInfo) {
					await this.#checkLock();
					await this.#removeOwned(`${this.#path}.lock`, this.#lockInfo);
					await this.#directory?.sync();
				}
			} finally {
				try {
					await this.#lock?.close();
				} finally {
					await this.#directory?.close();
				}
			}
		})().catch(() => {
			throw denied();
		});
		return this.#closePromise;
	}
}
