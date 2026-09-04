import { constants } from "node:fs";
import { type FileHandle, lstat, open } from "node:fs/promises";
import { basename } from "node:path";
import {
	type FileSelectionOptions,
	type FileSelectionTarget,
	resolveFileSelectionLimits,
	validateUploadMetadata,
} from "./control-files.js";
import {
	captureUploadTarget,
	createUploadTransport,
} from "./upload-commands.js";
import type { UploadExecutor, UploadTransport } from "./upload-protocol.js";
export type {
	UploadTransferRequest,
	UploadTransport,
} from "./upload-protocol.js";
import { AgentBrowserError } from "./errors.js";
import type { FormUpload } from "./forms.js";
import {
	assertPrivateFile,
	privateFileLocation,
	samePrivateFile,
} from "./node-private-files.js";

export const uploadClientLimits = Object.freeze({
	readChunkBytes: 65_536,
	transferChunkBytes: 32_768,
	maxTransferIdCodeUnits: 256,
});

export interface PrivateUploadPath {
	readonly path: string;
	readonly type?: string;
}

export interface UploadClientOptions {
	readonly limits?: FileSelectionOptions;
	readonly signal?: AbortSignal;
}

export class UploadClientError extends AgentBrowserError {
	constructor(
		error: AgentBrowserError,
		readonly remoteCleanupConfirmed: boolean,
	) {
		super(error.code, error.message);
	}
}

function aborted(signal?: AbortSignal) {
	if (signal?.aborted)
		throw new AgentBrowserError("aborted", "File upload aborted");
}

function safeError(error: unknown) {
	if (error instanceof AgentBrowserError) return error;
	const code = (error as NodeJS.ErrnoException | null)?.code;
	if (code === "ENOENT")
		return new AgentBrowserError(
			"not-found",
			"Upload file or directory does not exist",
		);
	if (["ELOOP", "EACCES", "EPERM", "ENOTDIR", "EISDIR"].includes(code ?? ""))
		return new AgentBrowserError("policy-denied", "Upload file access denied");
	return new AgentBrowserError("network-error", "File upload operation failed");
}

async function readPrivateUpload(
	filename: string,
	maxBytes: number,
	signal?: AbortSignal,
): Promise<Uint8Array> {
	let handle: FileHandle | undefined;
	try {
		aborted(signal);
		const location = await privateFileLocation(filename, "Upload");
		const original = await lstat(filename, { bigint: true });
		assertPrivateFile(original, location.uid, "Upload");
		aborted(signal);
		handle = await open(
			filename,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		const before = await handle.stat({ bigint: true });
		assertPrivateFile(before, location.uid, "Upload");
		if (!samePrivateFile(original, before))
			throw new AgentBrowserError(
				"policy-denied",
				"Upload file changed before read",
			);
		if (before.size < 0n || before.size > BigInt(maxBytes))
			throw new AgentBrowserError(
				"resource-limit",
				"Upload file byte limit exceeded",
			);
		const data = new Uint8Array(Number(before.size));
		let offset = 0;
		while (offset < data.byteLength) {
			aborted(signal);
			const { bytesRead } = await handle.read(
				data,
				offset,
				Math.min(uploadClientLimits.readChunkBytes, data.byteLength - offset),
				offset,
			);
			if (!bytesRead)
				throw new AgentBrowserError(
					"invalid-input",
					"Upload file ended during read",
				);
			offset += bytesRead;
		}
		aborted(signal);
		const extra = await handle.read(new Uint8Array(1), 0, 1, offset);
		const after = await handle.stat({ bigint: true });
		const current = await lstat(filename, { bigint: true });
		assertPrivateFile(after, location.uid, "Upload");
		assertPrivateFile(current, location.uid, "Upload");
		if (
			extra.bytesRead ||
			!samePrivateFile(before, after) ||
			!samePrivateFile(before, current) ||
			before.size !== after.size ||
			before.mtimeNs !== after.mtimeNs ||
			before.ctimeNs !== after.ctimeNs ||
			after.size !== current.size ||
			after.mtimeNs !== current.mtimeNs ||
			after.ctimeNs !== current.ctimeNs
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Upload file changed during read",
			);
		await location.assertCurrent();
		aborted(signal);
		await handle.close();
		handle = undefined;
		return data;
	} catch (error) {
		throw safeError(error);
	} finally {
		await handle?.close().catch(() => {});
	}
}

export async function readPrivateUploadFiles(
	paths: readonly PrivateUploadPath[],
	options: UploadClientOptions = {},
): Promise<readonly FormUpload[]> {
	const limits = resolveFileSelectionLimits(options.limits);
	aborted(options.signal);
	if (!Array.isArray(paths))
		throw new AgentBrowserError(
			"invalid-input",
			"Expected explicit upload paths",
		);
	if (paths.length > limits.maxFiles)
		throw new AgentBrowserError(
			"resource-limit",
			"Upload file count limit exceeded",
		);
	const requests = paths.map((entry) => {
		if (!entry || typeof entry.path !== "string")
			throw new AgentBrowserError(
				"invalid-input",
				"Expected an explicit upload path",
			);
		const name = basename(entry.path);
		validateUploadMetadata(name, entry.type, limits);
		return { path: entry.path, name, type: entry.type };
	});
	const files: FormUpload[] = [];
	let bytes = 0;
	for (const request of requests) {
		const data = await readPrivateUpload(
			request.path,
			Math.min(limits.maxFileBytes, limits.maxTotalBytes - bytes),
			options.signal,
		);
		bytes += data.byteLength;
		files.push(Object.freeze({ name: request.name, type: request.type, data }));
	}
	return Object.freeze(files);
}

export async function uploadPrivateFiles<Result>(
	target: FileSelectionTarget,
	paths: readonly PrivateUploadPath[],
	transport: UploadTransport<Result>,
	options: UploadClientOptions = {},
) {
	if (
		!target ||
		typeof target.documentId !== "string" ||
		!target.documentId ||
		target.documentId.length > 256 ||
		typeof target.reference !== "string" ||
		!/^e[1-9][0-9]*$/.test(target.reference) ||
		target.reference.length > 32 ||
		!Number.isSafeInteger(target.version) ||
		target.version < 0
	)
		throw new AgentBrowserError("invalid-input", "Invalid upload target");
	const captured = Object.freeze({
		documentId: target.documentId,
		reference: target.reference,
		version: target.version,
	});
	const files = await readPrivateUploadFiles(paths, options);
	let id: string | undefined;
	let began = false;
	try {
		aborted(options.signal);
		began = true;
		id = await transport.begin(
			Object.freeze({
				target: captured,
				files: Object.freeze(
					files.map((file) =>
						Object.freeze({
							name: file.name,
							type: file.type,
							bytes: file.data.byteLength,
						}),
					),
				),
			}),
		);
		if (
			typeof id !== "string" ||
			!id ||
			id.length > uploadClientLimits.maxTransferIdCodeUnits ||
			/[\p{Cc}\p{Cf}]/u.test(id)
		) {
			id = undefined;
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid upload transfer identity",
			);
		}
		for (const [index, file] of files.entries()) {
			for (
				let offset = 0;
				offset < file.data.byteLength;
				offset += uploadClientLimits.transferChunkBytes
			) {
				aborted(options.signal);
				const chunk = file.data.subarray(
					offset,
					offset + uploadClientLimits.transferChunkBytes,
				);
				await transport.write(
					id,
					index,
					offset,
					Buffer.from(chunk).toString("base64"),
				);
			}
		}
		aborted(options.signal);
		const result = await transport.commit(id);
		return {
			result,
			files: files.length,
			bytes: files.reduce((sum, file) => sum + file.data.byteLength, 0),
		};
	} catch (error) {
		let cleanup = !began;
		if (id !== undefined) {
			try {
				await transport.cancel(id);
				cleanup = true;
			} catch {
				cleanup = false;
			}
		}
		throw new UploadClientError(safeError(error), cleanup);
	}
}

export async function uploadPrivateFilesForReference(
	session: string,
	reference: string,
	paths: readonly PrivateUploadPath[],
	execute: UploadExecutor,
	options: UploadClientOptions = {},
) {
	aborted(options.signal);
	const target = await captureUploadTarget(execute, session, reference);
	const transport = createUploadTransport(execute, session, target);
	return uploadPrivateFiles(target, paths, transport, options);
}
