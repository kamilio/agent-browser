import type { FileSelectionTarget } from "./control-files.js";
import { AgentBrowserError } from "./errors.js";
import { decodeStateChunk } from "./state-transfer.js";
import {
	type UploadCommandResult,
	type UploadCommitResult,
	type UploadExecutor,
	type UploadFileMetadata,
	type UploadTransferInfo,
	type UploadTransport,
	uploadCommandSchemas,
	uploadDocumentId,
	uploadInteger,
	uploadProgress,
	uploadProtocolLimits,
	uploadRecord,
	uploadRequest,
	uploadSession,
	uploadTarget,
	uploadTransferId,
} from "./upload-protocol.js";
import type { UploadTransfers } from "./upload-transfers.js";

function integerArgument(value: string) {
	if (!/^(0|[1-9][0-9]{0,15})$/.test(value))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid upload integer argument",
		);
	const number = Number(value);
	uploadInteger(number);
	return number;
}

export async function executeUploadCommand(
	transfers: UploadTransfers,
	authenticatedSession: string,
	argv: readonly string[],
	signal?: AbortSignal,
): Promise<UploadCommandResult> {
	uploadSession(authenticatedSession);
	if (
		!Array.isArray(argv) ||
		argv.length > 6 ||
		!argv.every((value) => typeof value === "string")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid upload command arguments",
		);
	const schema = uploadCommandSchemas.find((entry) => entry.name === argv[0]);
	if (!schema)
		throw new AgentBrowserError("unsupported", "Unsupported upload command");
	if (argv.length !== schema.arguments.length + 1)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid upload command arity",
		);
	if (signal?.aborted && schema.name !== "upload-cancel")
		throw new AgentBrowserError("aborted", "Upload command aborted");
	let data: unknown;
	if (schema.name === "upload-target") {
		if (!/^e[1-9][0-9]{0,15}$/.test(argv[1]))
			throw new AgentBrowserError("invalid-input", "Invalid upload reference");
		data = { target: transfers.capture(authenticatedSession, argv[1]) };
	} else if (schema.name === "upload-begin") {
		if (argv[1].length > uploadProtocolLimits.maxMetadataCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Upload metadata exceeds its limit",
			);
		let request: unknown;
		try {
			request = JSON.parse(argv[1]);
		} catch {
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid upload metadata JSON",
			);
		}
		data = transfers.begin(authenticatedSession, request);
	} else {
		uploadDocumentId(argv[1]);
		uploadTransferId(argv[2]);
		if (schema.name === "upload-write")
			data = transfers.write(
				authenticatedSession,
				argv[1],
				argv[2],
				integerArgument(argv[3]),
				integerArgument(argv[4]),
				argv[5],
			);
		else if (schema.name === "upload-commit")
			data = await transfers.commit(
				authenticatedSession,
				argv[1],
				argv[2],
				signal,
			);
		else data = transfers.cancel(authenticatedSession, argv[1], argv[2]);
	}
	return Object.freeze({
		schemaVersion: 1,
		command: schema.name,
		session: authenticatedSession,
		data,
	});
}

async function response(
	execute: UploadExecutor,
	session: string,
	argv: readonly string[],
) {
	let received: unknown;
	try {
		received = await execute(Object.freeze([...argv]));
	} catch (error) {
		throw new AgentBrowserError(
			error instanceof AgentBrowserError ? error.code : "network-error",
			"Upload command request failed",
		);
	}
	const result = uploadRecord(received, [
		"schemaVersion",
		"command",
		"session",
		"data",
	]);
	if (
		result.schemaVersion !== 1 ||
		result.command !== argv[0] ||
		result.session !== session
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Upload response session or command mismatch",
		);
	return result.data;
}

export async function captureUploadTarget(
	execute: UploadExecutor,
	session: string,
	reference: string,
) {
	uploadSession(session);
	if (
		typeof execute !== "function" ||
		typeof reference !== "string" ||
		!/^e[1-9][0-9]{0,15}$/.test(reference)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid upload target request",
		);
	const data = uploadRecord(
		await response(execute, session, ["upload-target", reference]),
		["target"],
	);
	const target = uploadTarget(data.target);
	if (target.reference !== reference)
		throw new AgentBrowserError(
			"invalid-input",
			"Upload target reference mismatch",
		);
	return target;
}

interface ClientTransfer {
	info: Readonly<UploadTransferInfo>;
	files: readonly UploadFileMetadata[];
}

function sameTarget(first: FileSelectionTarget, second: FileSelectionTarget) {
	return (
		first.documentId === second.documentId &&
		first.reference === second.reference &&
		first.version === second.version
	);
}

function assertProgress(
	actual: UploadTransferInfo,
	expected: UploadTransferInfo,
) {
	if (
		Object.keys(expected).some(
			(key) =>
				actual[key as keyof UploadTransferInfo] !==
				expected[key as keyof UploadTransferInfo],
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Upload acknowledgement mismatch",
		);
}

export function createUploadTransport(
	execute: UploadExecutor,
	session: string,
	selectedTarget: FileSelectionTarget,
): UploadTransport<Readonly<UploadCommitResult>> {
	uploadSession(session);
	if (typeof execute !== "function")
		throw new AgentBrowserError("invalid-input", "Invalid upload executor");
	const target = uploadTarget(selectedTarget);
	let state: ClientTransfer | undefined;
	let knownId: string | undefined;
	let busy = false;
	const active = (id: string) => {
		if (!state || state.info.id !== id)
			throw new AgentBrowserError(
				"not-found",
				"Upload client transfer not found",
			);
		return state;
	};
	const idle = () => {
		if (busy)
			throw new AgentBrowserError(
				"invalid-input",
				"Upload client operation already pending",
			);
	};
	return {
		async begin(value) {
			idle();
			if (state)
				throw new AgentBrowserError(
					"invalid-input",
					"Upload client already has a transfer",
				);
			const request = uploadRequest(value);
			if (!sameTarget(request.target, target))
				throw new AgentBrowserError(
					"stale-reference",
					"Upload client target changed",
				);
			const metadata = JSON.stringify(request);
			if (metadata.length > uploadProtocolLimits.maxMetadataCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Upload metadata exceeds its limit",
				);
			busy = true;
			try {
				const info = uploadProgress(
					await response(execute, session, ["upload-begin", metadata]),
				);
				let fileIndex = 0;
				while (
					fileIndex < request.files.length &&
					request.files[fileIndex].bytes === 0
				)
					fileIndex++;
				assertProgress(info, {
					...info,
					...target,
					files: request.files.length,
					bytes: request.files.reduce((sum, file) => sum + file.bytes, 0),
					receivedBytes: 0,
					fileIndex,
					fileOffset: 0,
				});
				state = { info, files: request.files };
				knownId = info.id;
				return info.id;
			} finally {
				busy = false;
			}
		},
		async write(id, file, offset, base64) {
			idle();
			const current = active(id);
			uploadInteger(file);
			uploadInteger(offset);
			const content = decodeStateChunk(base64);
			if (
				file !== current.info.fileIndex ||
				offset !== current.info.fileOffset ||
				file >= current.files.length ||
				offset + content.length > current.files[file].bytes
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Upload client chunk is out of order",
				);
			let fileIndex = file;
			let fileOffset = offset + content.length;
			while (
				fileIndex < current.files.length &&
				fileOffset === current.files[fileIndex].bytes
			) {
				fileIndex++;
				fileOffset = 0;
			}
			busy = true;
			try {
				const info = uploadProgress(
					await response(execute, session, [
						"upload-write",
						target.documentId,
						id,
						String(file),
						String(offset),
						base64,
					]),
				);
				assertProgress(info, {
					...current.info,
					fileIndex,
					fileOffset,
					receivedBytes: current.info.receivedBytes + content.length,
				});
				if (state !== current)
					throw new AgentBrowserError(
						"aborted",
						"Upload client transfer was canceled",
					);
				current.info = info;
			} finally {
				busy = false;
			}
		},
		async commit(id) {
			idle();
			const current = active(id);
			if (
				current.info.receivedBytes !== current.info.bytes ||
				current.info.fileIndex !== current.files.length
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Upload client transfer is incomplete",
				);
			busy = true;
			try {
				const data = uploadRecord(
					await response(execute, session, [
						"upload-commit",
						target.documentId,
						id,
					]),
					[
						"id",
						"documentId",
						"reference",
						"version",
						"files",
						"bytes",
						"committed",
						"stagingReleased",
					],
				);
				if (
					data.id !== id ||
					data.documentId !== target.documentId ||
					data.reference !== target.reference ||
					data.version !== target.version + 1 ||
					data.files !== current.info.files ||
					data.bytes !== current.info.bytes ||
					data.committed !== true ||
					data.stagingReleased !== true ||
					state !== current
				)
					throw new AgentBrowserError(
						"invalid-input",
						"Upload commit acknowledgement mismatch",
					);
				state = undefined;
				return Object.freeze({
					id,
					documentId: target.documentId,
					reference: target.reference,
					version: target.version + 1,
					files: current.info.files,
					bytes: current.info.bytes,
					committed: true,
					stagingReleased: true,
				});
			} finally {
				busy = false;
			}
		},
		async cancel(id) {
			uploadTransferId(id);
			if (id !== knownId)
				throw new AgentBrowserError(
					"not-found",
					"Upload client transfer not found",
				);
			const data = uploadRecord(
				await response(execute, session, [
					"upload-cancel",
					target.documentId,
					id,
				]),
				["id", "documentId", "canceled", "stagingReleased"],
			);
			if (
				data.id !== id ||
				data.documentId !== target.documentId ||
				data.canceled !== true ||
				data.stagingReleased !== true
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Upload cleanup acknowledgement mismatch",
				);
			if (state?.info.id === id) state = undefined;
		},
	};
}
