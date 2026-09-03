import {
	type CaptureArtifact,
	type PdfArtifact,
	decodeArtifactChunk,
	validateCaptureArtifact,
	validatePdfArtifact,
} from "./capture-artifacts.js";
import type { CommandResult } from "./command-host.js";
import { AgentBrowserError } from "./errors.js";

export type CaptureExecutor = (
	argv: readonly string[],
) => Promise<CommandResult>;

export async function readCapture(
	execute: CaptureExecutor,
	value: unknown,
	consume: (chunk: Uint8Array) => void | Promise<void>,
	signal?: AbortSignal,
): Promise<void> {
	const artifact = validateCaptureArtifact(value);
	return readExport(execute, artifact, consume, signal);
}

export async function readPdf(
	execute: CaptureExecutor,
	value: unknown,
	consume: (chunk: Uint8Array) => void | Promise<void>,
	signal?: AbortSignal,
): Promise<void> {
	return readExport(execute, validatePdfArtifact(value), consume, signal);
}

async function readExport(
	execute: CaptureExecutor,
	artifact: Readonly<CaptureArtifact | PdfArtifact>,
	consume: (chunk: Uint8Array) => void | Promise<void>,
	signal?: AbortSignal,
) {
	let offset = 0;
	let ending = "";
	while (offset < artifact.bytes) {
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "Capture download aborted");
		const response = await execute([
			"artifact-read",
			artifact.id,
			`--offset=${offset}`,
		]);
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "Capture download aborted");
		const bytes = decodeArtifactChunk(response.data, artifact, offset);
		if (offset === 0 && artifact.mediaType === "image/png") {
			const header = new DataView(
				bytes.buffer,
				bytes.byteOffset,
				bytes.byteLength,
			);
			if (
				bytes.length < 33 ||
				bytes.subarray(0, 8).join(",") !== "137,80,78,71,13,10,26,10" ||
				header.getUint32(8) !== 13 ||
				header.getUint32(12) !== 0x49484452 ||
				header.getUint32(16) !== artifact.width ||
				header.getUint32(20) !== artifact.height ||
				bytes[24] !== 8 ||
				bytes[25] !== 6
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Capture PNG header does not match its metadata",
				);
		}
		if (artifact.mediaType === "application/pdf") {
			if (
				offset === 0 &&
				new TextDecoder().decode(bytes.subarray(0, 9)) !== "%PDF-1.4\n"
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid PDF artifact header",
				);
			ending = (
				ending +
				new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 16)))
			).slice(-16);
		}
		await consume(bytes);
		offset += bytes.length;
	}
	if (artifact.mediaType === "application/pdf" && !ending.endsWith("%%EOF\n"))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid PDF artifact trailer",
		);
}

export async function capturePdf(
	execute: CaptureExecutor,
	signal?: AbortSignal,
) {
	if (signal?.aborted)
		throw new AgentBrowserError("aborted", "PDF download aborted");
	const artifact = validatePdfArtifact((await execute(["pdf"])).data);
	const bytes = new Uint8Array(artifact.bytes);
	let offset = 0;
	let released = false;
	try {
		await readPdf(
			execute,
			artifact,
			(chunk) => {
				bytes.set(chunk, offset);
				offset += chunk.length;
			},
			signal,
		);
	} finally {
		try {
			await execute(["artifact-delete", artifact.id]);
			released = true;
		} catch {}
	}
	return { artifact, bytes, released };
}

export async function capturePng(
	execute: CaptureExecutor,
	target?: string,
	signal?: AbortSignal,
): Promise<{
	artifact: Readonly<CaptureArtifact>;
	bytes: Uint8Array;
	released: boolean;
}> {
	if (signal?.aborted)
		throw new AgentBrowserError("aborted", "Capture download aborted");
	const artifact = validateCaptureArtifact(
		(
			await execute([
				"screenshot",
				...(target === undefined ? [] : ["--", target]),
			])
		).data,
	);
	let released = false;
	const bytes = new Uint8Array(artifact.bytes);
	let offset = 0;
	try {
		await readCapture(
			execute,
			artifact,
			(chunk) => {
				bytes.set(chunk, offset);
				offset += chunk.length;
			},
			signal,
		);
	} finally {
		try {
			await execute(["artifact-delete", artifact.id]);
			released = true;
		} catch {}
	}
	return { artifact, bytes, released };
}
