import { randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import {
	type FileHandle,
	link,
	lstat,
	open,
	rename,
	unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
	type BrowserStateOwner,
	exportBrowserState,
	replaceBrowserState,
} from "./browser-state.js";
import { AgentBrowserError } from "./errors.js";

export const stateFileLimits = Object.freeze({
	maxBytes: 134_217_728,
	maxPathLength: 4096,
	chunkBytes: 65_536,
});

export interface StateFileOptions {
	maxBytes?: number;
	overwrite?: boolean;
}

function byteLimit(options: StateFileOptions) {
	const limit = options.maxBytes ?? stateFileLimits.maxBytes;
	if (
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > stateFileLimits.maxBytes
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid state file byte limit",
		);
	if (options.overwrite !== undefined && typeof options.overwrite !== "boolean")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid state file overwrite option",
		);
	return limit;
}

function identity(first: BigIntStats, second: BigIntStats) {
	return first.dev === second.dev && first.ino === second.ino;
}

function privateFile(info: BigIntStats, uid: bigint) {
	if (
		!info.isFile() ||
		info.uid !== uid ||
		info.nlink !== 1n ||
		(info.mode & 0o077n) !== 0n
	)
		throw new AgentBrowserError(
			"policy-denied",
			"State file must be a private owned regular file with one link",
		);
}

function safeError(error: unknown, operation: string): AgentBrowserError {
	if (error instanceof AgentBrowserError) return error;
	const code = (error as NodeJS.ErrnoException | null)?.code;
	if (code === "ENOENT")
		return new AgentBrowserError(
			"not-found",
			"State file or parent directory does not exist",
		);
	if (["EEXIST", "ELOOP", "EACCES", "EPERM", "ENOTDIR"].includes(code ?? ""))
		return new AgentBrowserError(
			"policy-denied",
			`State file ${operation} refused by path or permission policy`,
		);
	return new AgentBrowserError(
		"network-error",
		`State file ${operation} failed`,
	);
}

async function location(filename: string) {
	if (
		typeof process.getuid !== "function" ||
		typeof process.geteuid !== "function" ||
		process.getuid() !== process.geteuid() ||
		!constants.O_NOFOLLOW ||
		!constants.O_NONBLOCK
	)
		throw new AgentBrowserError(
			"unsupported",
			"Private state files require Unix ownership and no-follow checks",
		);
	if (
		typeof filename !== "string" ||
		!filename ||
		filename.length > stateFileLimits.maxPathLength ||
		!isAbsolute(filename) ||
		resolve(filename) !== filename ||
		/[\p{Cc}\p{Cf}]/u.test(filename) ||
		dirname(filename) === filename
	)
		throw new AgentBrowserError(
			"invalid-input",
			"State filename must be a bounded canonical absolute path",
		);
	const uid = BigInt(process.getuid());
	const parent = dirname(filename);
	const ancestors: { path: string; info: BigIntStats }[] = [];
	let path = parent;
	while (true) {
		const info = await lstat(path, { bigint: true });
		const writable = (info.mode & 0o022n) !== 0n;
		const trustedSticky = path !== parent && (info.mode & 0o1000n) !== 0n;
		if (
			!info.isDirectory() ||
			info.isSymbolicLink() ||
			(info.uid !== 0n && info.uid !== uid) ||
			(writable && !trustedSticky) ||
			(path === parent && info.uid !== uid)
		)
			throw new AgentBrowserError(
				"policy-denied",
				"State file directory chain is not safely owned and protected",
			);
		ancestors.push({ path, info });
		const next = dirname(path);
		if (next === path) break;
		path = next;
	}
	return {
		uid,
		parent,
		assertCurrent: async () => {
			for (const ancestor of ancestors) {
				const current = await lstat(ancestor.path, { bigint: true });
				if (
					!identity(ancestor.info, current) ||
					ancestor.info.mode !== current.mode ||
					ancestor.info.uid !== current.uid ||
					!current.isDirectory()
				)
					throw new AgentBrowserError(
						"policy-denied",
						"State file directory changed during access",
					);
			}
		},
	};
}

function parseStateJson(json: string): unknown {
	try {
		return JSON.parse(json);
	} catch {
		throw new AgentBrowserError("invalid-input", "Invalid state file JSON");
	}
}

export async function readStateFile(
	filename: string,
	options: StateFileOptions = {},
) {
	let file: FileHandle | undefined;
	try {
		const limit = byteLimit(options);
		const target = await location(filename);
		file = await open(
			filename,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		const before = await file.stat({ bigint: true });
		privateFile(before, target.uid);
		if (before.size > BigInt(limit))
			throw new AgentBrowserError(
				"resource-limit",
				"State file exceeds its byte limit",
			);
		const bytes = Buffer.alloc(Number(before.size));
		let offset = 0;
		while (offset < bytes.byteLength) {
			const result = await file.read(
				bytes,
				offset,
				Math.min(stateFileLimits.chunkBytes, bytes.byteLength - offset),
				offset,
			);
			if (!result.bytesRead)
				throw new AgentBrowserError(
					"invalid-input",
					"State file changed or ended during read",
				);
			offset += result.bytesRead;
		}
		const extra = await file.read(Buffer.alloc(1), 0, 1, offset);
		const after = await file.stat({ bigint: true });
		const current = await lstat(filename, { bigint: true });
		privateFile(after, target.uid);
		privateFile(current, target.uid);
		if (
			extra.bytesRead ||
			!identity(before, current) ||
			before.size !== after.size ||
			before.mtimeNs !== after.mtimeNs ||
			before.ctimeNs !== after.ctimeNs
		)
			throw new AgentBrowserError(
				"invalid-input",
				"State file changed during read",
			);
		await target.assertCurrent();
		let json: string;
		try {
			json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			throw new AgentBrowserError(
				"invalid-input",
				"State file is not valid UTF-8",
			);
		}
		parseStateJson(json);
		return { json, bytes: bytes.byteLength };
	} catch (error) {
		throw safeError(error, "read");
	} finally {
		await file?.close().catch(() => {});
	}
}

export async function writeStateFile(
	filename: string,
	json: string,
	options: StateFileOptions = {},
) {
	let file: FileHandle | undefined;
	let temporary: string | undefined;
	let owned: BigIntStats | undefined;
	let cleanupConfirmed = true;
	let bytes = 0;
	try {
		const limit = byteLimit(options);
		if (typeof json !== "string")
			throw new AgentBrowserError(
				"invalid-input",
				"State file content must be JSON text",
			);
		if (json.length > limit || Buffer.byteLength(json, "utf8") > limit)
			throw new AgentBrowserError(
				"resource-limit",
				"State file exceeds its byte limit",
			);
		parseStateJson(json);
		const content = Buffer.from(json, "utf8");
		if (content.toString("utf8") !== json)
			throw new AgentBrowserError(
				"invalid-input",
				"State JSON contains invalid Unicode",
			);
		bytes = content.byteLength;
		const target = await location(filename);
		let previous: BigIntStats | undefined;
		try {
			previous = await lstat(filename, { bigint: true });
			privateFile(previous, target.uid);
			if (!options.overwrite)
				throw new AgentBrowserError(
					"policy-denied",
					"State destination exists; explicit overwrite is required",
				);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		temporary = join(
			target.parent,
			`.agent-browser-state-${randomUUID()}.part`,
		);
		file = await open(
			temporary,
			constants.O_WRONLY |
				constants.O_CREAT |
				constants.O_EXCL |
				constants.O_NOFOLLOW,
			0o600,
		);
		owned = await file.stat({ bigint: true });
		privateFile(owned, target.uid);
		let offset = 0;
		while (offset < content.byteLength) {
			const written = await file.write(
				content,
				offset,
				Math.min(stateFileLimits.chunkBytes, content.byteLength - offset),
				offset,
			);
			if (!written.bytesWritten)
				throw new AgentBrowserError(
					"network-error",
					"State file write made no progress",
				);
			offset += written.bytesWritten;
		}
		await file.sync();
		const ready = await file.stat({ bigint: true });
		privateFile(ready, target.uid);
		if (ready.size !== BigInt(content.byteLength) || !identity(owned, ready))
			throw new AgentBrowserError(
				"policy-denied",
				"State temporary file changed during write",
			);
		await file.close();
		file = undefined;
		await target.assertCurrent();
		const currentTemporary = await lstat(temporary, { bigint: true });
		privateFile(currentTemporary, target.uid);
		if (!identity(owned, currentTemporary))
			throw new AgentBrowserError(
				"policy-denied",
				"State temporary file was replaced",
			);
		if (previous) {
			const current = await lstat(filename, { bigint: true });
			privateFile(current, target.uid);
			if (!identity(previous, current) || previous.ctimeNs !== current.ctimeNs)
				throw new AgentBrowserError(
					"policy-denied",
					"State destination changed before replacement",
				);
			await rename(temporary, filename);
			temporary = undefined;
		} else {
			await link(temporary, filename);
		}
	} catch (error) {
		throw safeError(error, "write");
	} finally {
		await file?.close().catch(() => {});
		if (temporary && owned) {
			try {
				const current = await lstat(temporary, { bigint: true });
				if (identity(owned, current) && current.isFile())
					await unlink(temporary);
				else cleanupConfirmed = false;
			} catch (error) {
				cleanupConfirmed = (error as NodeJS.ErrnoException).code === "ENOENT";
			}
		}
	}
	return { filename, bytes, cleanupConfirmed };
}

export function saveBrowserStateFile(
	owner: BrowserStateOwner,
	filename: string,
	options: StateFileOptions = {},
) {
	return writeStateFile(
		filename,
		JSON.stringify(exportBrowserState(owner)),
		options,
	);
}

export async function loadBrowserStateFile(
	owner: BrowserStateOwner,
	filename: string,
	options: StateFileOptions = {},
) {
	const state = await readStateFile(filename, options);
	replaceBrowserState(owner, parseStateJson(state.json));
	return { filename, bytes: state.bytes, loaded: true as const };
}
