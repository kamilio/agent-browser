import { constants } from "node:fs";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { AgentBrowserError } from "./errors.js";
import {
	type CommandConnection,
	validateCommandConnection,
} from "./node-command-client.js";

async function runtimeFile(directory?: string) {
	if (typeof process.getuid !== "function")
		throw new AgentBrowserError(
			"unsupported",
			"Private CLI runtime files currently require Unix ownership checks",
		);
	const root = directory ?? join(tmpdir(), `agent-browser-${process.getuid()}`);
	if (!isAbsolute(root))
		throw new AgentBrowserError(
			"invalid-input",
			"Runtime directory must be absolute",
		);
	await mkdir(root, { recursive: true, mode: 0o700 });
	const info = await lstat(root);
	if (
		!info.isDirectory() ||
		info.isSymbolicLink() ||
		info.uid !== process.getuid() ||
		(info.mode & 0o077) !== 0
	)
		throw new AgentBrowserError(
			"policy-denied",
			"Runtime directory must be private and owned by the current user",
		);
	return join(root, "connection.json");
}

export async function writeCommandConnection(
	connection: CommandConnection,
	directory?: string,
) {
	const value = validateCommandConnection(connection);
	const path = await runtimeFile(directory);
	let file: Awaited<ReturnType<typeof open>>;
	try {
		file = await open(
			path,
			constants.O_WRONLY |
				constants.O_CREAT |
				constants.O_EXCL |
				constants.O_NOFOLLOW,
			0o600,
		);
	} catch {
		throw new AgentBrowserError(
			"policy-denied",
			"Connection file already exists or cannot be created; refusing to replace it",
		);
	}
	const owned = await file.stat();
	try {
		await file.writeFile(JSON.stringify(value));
		await file.sync();
	} catch (error) {
		const current = await lstat(path);
		if (
			current.ino === owned.ino &&
			current.dev === owned.dev &&
			current.isFile() &&
			!current.isSymbolicLink()
		)
			await unlink(path);
		throw error;
	} finally {
		await file.close();
	}
	return {
		path,
		remove: async () => {
			try {
				const current = await lstat(path);
				if (
					current.ino === owned.ino &&
					current.dev === owned.dev &&
					current.isFile() &&
					!current.isSymbolicLink()
				)
					await unlink(path);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		},
	};
}

export async function readCommandConnection(
	directory?: string,
): Promise<CommandConnection> {
	const path = await runtimeFile(directory);
	let file: Awaited<ReturnType<typeof open>>;
	try {
		file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	} catch {
		throw new AgentBrowserError(
			"not-found",
			"No readable private connection file; run agent-browser serve first",
		);
	}
	try {
		const info = await file.stat();
		if (
			!info.isFile() ||
			info.size > 4096 ||
			info.uid !== process.getuid?.() ||
			(info.mode & 0o077) !== 0 ||
			info.nlink !== 1
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Connection file is not a private owned regular file",
			);
		let value: unknown;
		try {
			const bytes = Buffer.alloc(4097);
			const read = await file.read(bytes, 0, bytes.byteLength, 0);
			if (read.bytesRead > 4096) throw new Error("oversized");
			value = JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(
					bytes.subarray(0, read.bytesRead),
				),
			);
		} catch {
			throw new AgentBrowserError("invalid-input", "Invalid connection file");
		}
		return validateCommandConnection(value);
	} finally {
		await file.close();
	}
}
