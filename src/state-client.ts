import type { CommandResult } from "./command-host.js";
import { AgentBrowserError } from "./errors.js";
import { stateRecord } from "./state-replacement.js";
import {
	type StateTransferInfo,
	decodeStateChunk,
	encodeStateChunk,
	stateTransferLimits,
} from "./state-transfer.js";

export type StateExecutor = (argv: readonly string[]) => Promise<CommandResult>;

function channel(execute: StateExecutor): StateExecutor {
	let session: string | undefined;
	return async (argv) => {
		const result = await execute(argv);
		if (
			!result ||
			typeof result.session !== "string" ||
			!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(result.session) ||
			(session !== undefined && result.session !== session)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"State transfer session changed",
			);
		session = result.session;
		return result;
	};
}

function transfer(value: unknown, direction: StateTransferInfo["direction"]) {
	const info = stateRecord(value, [
		"id",
		"direction",
		"bytes",
		"receivedBytes",
	]);
	if (
		typeof info.id !== "string" ||
		!/^state-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[1-9][0-9]{0,15}$/.test(
			info.id,
		) ||
		info.direction !== direction ||
		typeof info.bytes !== "number" ||
		!Number.isSafeInteger(info.bytes) ||
		info.bytes < 1 ||
		info.bytes > stateTransferLimits.maxBytes ||
		typeof info.receivedBytes !== "number" ||
		!Number.isSafeInteger(info.receivedBytes) ||
		info.receivedBytes < 0 ||
		info.receivedBytes > info.bytes
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid state transfer metadata",
		);
	return {
		id: info.id,
		direction,
		bytes: info.bytes,
		receivedBytes: info.receivedBytes,
	};
}

async function command(execute: StateExecutor, argv: readonly string[]) {
	const result = await execute(argv);
	if (!result || result.schemaVersion !== 1 || result.command !== argv[0])
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid state transfer response",
		);
	return result.data;
}

function failure(error: unknown, committing = false) {
	return new AgentBrowserError(
		error instanceof AgentBrowserError ? error.code : "network-error",
		committing
			? "State import was not confirmed; inspect the session before retrying"
			: "State transfer failed",
	);
}

async function discard(execute: StateExecutor, id: string) {
	try {
		const result = stateRecord(
			await command(execute, ["state-transfer-delete", id]),
			["deleted"],
		);
		return result.deleted === true;
	} catch {
		return false;
	}
}

export async function downloadBrowserState(executor: StateExecutor) {
	const execute = channel(executor);
	let info: StateTransferInfo | undefined;
	let json = "";
	let remoteCleanupConfirmed = false;
	try {
		info = transfer(await command(execute, ["state-export"]), "export");
		if (info.receivedBytes !== info.bytes)
			throw new AgentBrowserError(
				"invalid-input",
				"State export is incomplete",
			);
		const bytes = new Uint8Array(info.bytes);
		let offset = 0;
		while (offset < bytes.length) {
			const chunk = stateRecord(
				await command(execute, [
					"state-transfer-read",
					info.id,
					String(offset),
				]),
				["id", "offset", "bytes", "totalBytes", "encoding", "data", "eof"],
			);
			if (
				chunk.id !== info.id ||
				chunk.offset !== offset ||
				chunk.totalBytes !== info.bytes ||
				chunk.encoding !== "base64"
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid state export chunk",
				);
			const content = decodeStateChunk(chunk.data);
			if (
				chunk.bytes !== content.length ||
				content.length !==
					Math.min(stateTransferLimits.maxChunkBytes, info.bytes - offset) ||
				offset + content.length > info.bytes ||
				chunk.eof !== (offset + content.length === info.bytes)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid state export progress",
				);
			bytes.set(content, offset);
			offset += content.length;
		}
		try {
			json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
			JSON.parse(json);
		} catch {
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid state export JSON or UTF-8",
			);
		}
	} catch (error) {
		throw failure(error);
	} finally {
		if (info) remoteCleanupConfirmed = await discard(execute, info.id);
	}
	return { json, bytes: info.bytes, remoteCleanupConfirmed };
}

export async function uploadBrowserState(
	json: string,
	executor: StateExecutor,
) {
	const execute = channel(executor);
	let info: StateTransferInfo | undefined;
	let committing = false;
	let committed = false;
	try {
		if (typeof json !== "string" || json.length > stateTransferLimits.maxBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"State import exceeds its byte limit",
			);
		try {
			JSON.parse(json);
		} catch {
			throw new AgentBrowserError("invalid-input", "Invalid state import JSON");
		}
		const bytes = new TextEncoder().encode(json);
		if (bytes.length > stateTransferLimits.maxBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"State import exceeds its byte limit",
			);
		if (new TextDecoder().decode(bytes) !== json)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid state import Unicode",
			);
		info = transfer(
			await command(execute, ["state-import-begin", String(bytes.length)]),
			"import",
		);
		if (info.bytes !== bytes.length || info.receivedBytes !== 0)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid state import acknowledgement",
			);
		let offset = 0;
		while (offset < bytes.length) {
			const content = bytes.subarray(
				offset,
				offset + stateTransferLimits.maxChunkBytes,
			);
			const acknowledgement = transfer(
				await command(execute, [
					"state-import-append",
					info.id,
					String(offset),
					encodeStateChunk(content),
				]),
				"import",
			);
			offset += content.length;
			if (
				acknowledgement.id !== info.id ||
				acknowledgement.bytes !== bytes.length ||
				acknowledgement.receivedBytes !== offset
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid state import progress",
				);
		}
		committing = true;
		const result = stateRecord(
			await command(execute, ["state-import-commit", info.id]),
			["id", "bytes", "loaded"],
		);
		if (
			result.id !== info.id ||
			result.bytes !== bytes.length ||
			result.loaded !== true
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid state import result",
			);
		committed = true;
		return { loaded: true as const, bytes: bytes.length };
	} catch (error) {
		throw failure(error, committing);
	} finally {
		if (info && !committed) await discard(execute, info.id);
	}
}
