import type { DocumentClip, DocumentRaster } from "./document-raster.js";
import type { renderDocumentPdf } from "./document-pdf.js";
import { AgentBrowserError } from "./errors.js";

export const traceArtifactLimits = Object.freeze({
	maxFrames: 128,
	maxBytes: 2_097_152,
});
export interface TraceDetails {
	mediaType: "application/json";
	partial: true;
	profile: "semantic-action-timeline";
	frames: number;
	droppedFrames: number;
	truncated: boolean;
}

export const captureArtifactLimits = Object.freeze({
	maxArtifacts: 8,
	maxBytes: 33_554_432,
	maxChunkBytes: 65_536,
});
export interface CaptureDetails {
	mediaType: "image/png";
	partial: true;
	profile: "normal-flow-solid-colors";
	document: string;
	revision: number;
	target: string | null;
	width: number;
	height: number;
	deviceScaleFactor: 1;
	hires: boolean;
	clip: Readonly<DocumentClip>;
	paint: DocumentRaster["metrics"];
}
export interface CaptureArtifact extends CaptureDetails {
	id: string;
	bytes: number;
}
export interface PdfDetails {
	mediaType: "application/pdf";
	partial: true;
	profile: "normal-flow-paginated-raster-text";
	document: string;
	revision: number;
	width: number;
	height: number;
	pages: number;
	clips: readonly Readonly<DocumentClip>[];
	metrics: ReturnType<typeof renderDocumentPdf>["metrics"];
}
export interface PdfArtifact extends PdfDetails {
	id: string;
	bytes: number;
}
export interface TraceArtifact extends TraceDetails {
	id: string;
	bytes: number;
}
export interface ArtifactChunk {
	id: string;
	offset: number;
	bytes: number;
	totalBytes: number;
	eof: boolean;
	encoding: "base64";
	data: string;
}

export class CaptureArtifacts {
	private readonly identity = crypto.randomUUID();
	private readonly entries = new Map<
		string,
		{
			owner: string;
			info: Readonly<CaptureArtifact | PdfArtifact | TraceArtifact>;
			bytes: Uint8Array;
		}
	>();
	private retainedBytes = 0;
	private sequence = 0;
	assertCapacity(bytes = 1) {
		if (
			!Number.isSafeInteger(bytes) ||
			bytes < 1 ||
			this.entries.size >= captureArtifactLimits.maxArtifacts ||
			this.retainedBytes + bytes > captureArtifactLimits.maxBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Capture artifact storage limit exceeded; delete retained artifacts before capturing again",
			);
	}
	add(
		owner: string,
		bytes: Uint8Array,
		details: CaptureDetails,
	): Readonly<CaptureArtifact> {
		return this.store(owner, bytes, details);
	}
	addPdf(
		owner: string,
		bytes: Uint8Array,
		details: PdfDetails,
	): Readonly<PdfArtifact> {
		return this.store(owner, bytes, details);
	}
	addTrace(
		owner: string,
		bytes: Uint8Array,
		details: TraceDetails,
	): Readonly<TraceArtifact> {
		if (bytes.length > traceArtifactLimits.maxBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Trace artifact limit exceeded",
			);
		return this.store(owner, bytes, details);
	}
	private store<Details extends CaptureDetails | PdfDetails | TraceDetails>(
		owner: string,
		bytes: Uint8Array,
		details: Details,
	): Readonly<Details & { id: string; bytes: number }> {
		this.assertCapacity(bytes.length);
		const id = `capture-${this.identity}-${++this.sequence}`;
		const info = Object.freeze({
			...details,
			...(details.mediaType === "image/png"
				? {
						clip: Object.freeze({ ...details.clip }),
						paint: Object.freeze({ ...details.paint }),
					}
				: details.mediaType === "application/pdf"
					? {
							clips: Object.freeze(
								details.clips.map((clip) => Object.freeze({ ...clip })),
							),
							metrics: Object.freeze({ ...details.metrics }),
						}
					: {}),
			id,
			bytes: bytes.length,
		});
		this.entries.set(id, {
			owner,
			info: info as Readonly<CaptureArtifact | PdfArtifact | TraceArtifact>,
			bytes: bytes.slice(),
		});
		this.retainedBytes += bytes.length;
		return info as Readonly<Details & { id: string; bytes: number }>;
	}
	list(owner: string) {
		return Object.freeze(
			[...this.entries.values()]
				.filter((entry) => entry.owner === owner)
				.map((entry) => entry.info),
		);
	}
	read(
		owner: string,
		id: string,
		offset: number,
		length: number = captureArtifactLimits.maxChunkBytes,
	): Readonly<ArtifactChunk> {
		const entry = this.owned(owner, id);
		if (
			!Number.isSafeInteger(offset) ||
			offset < 0 ||
			offset > entry.bytes.length ||
			!Number.isSafeInteger(length) ||
			length < 1 ||
			length > captureArtifactLimits.maxChunkBytes
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid capture artifact byte range",
			);
		const bytes = entry.bytes.subarray(offset, offset + length);
		let binary = "";
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return Object.freeze({
			id,
			offset,
			bytes: bytes.length,
			totalBytes: entry.bytes.length,
			eof: offset + bytes.length === entry.bytes.length,
			encoding: "base64",
			data: btoa(binary),
		});
	}
	delete(owner: string, id: string) {
		const entry = this.owned(owner, id);
		this.entries.delete(id);
		this.retainedBytes -= entry.bytes.length;
	}
	clear(owner: string) {
		for (const [id, entry] of this.entries)
			if (entry.owner === owner) this.delete(owner, id);
	}
	metrics() {
		return Object.freeze({
			artifacts: this.entries.size,
			bytes: this.retainedBytes,
			...captureArtifactLimits,
		});
	}
	private owned(owner: string, id: string) {
		const entry = this.entries.get(id);
		if (!entry || entry.owner !== owner)
			throw new AgentBrowserError(
				"not-found",
				"Capture artifact not found in this session",
			);
		return entry;
	}
}

export function validateTraceArtifact(value: unknown): Readonly<TraceArtifact> {
	const artifact = value as TraceArtifact;
	if (
		!artifact ||
		typeof artifact !== "object" ||
		typeof artifact.id !== "string" ||
		!/^capture-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[1-9][0-9]{0,15}$/.test(
			artifact.id,
		) ||
		artifact.mediaType !== "application/json" ||
		artifact.partial !== true ||
		artifact.profile !== "semantic-action-timeline" ||
		!Number.isSafeInteger(artifact.bytes) ||
		artifact.bytes < 2 ||
		artifact.bytes > traceArtifactLimits.maxBytes ||
		!Number.isSafeInteger(artifact.frames) ||
		artifact.frames < 0 ||
		artifact.frames > traceArtifactLimits.maxFrames ||
		!Number.isSafeInteger(artifact.droppedFrames) ||
		artifact.droppedFrames < 0 ||
		artifact.truncated !== artifact.droppedFrames > 0
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid trace artifact metadata",
		);
	return artifact;
}

export function validateCaptureArtifact(
	value: unknown,
): Readonly<CaptureArtifact> {
	const artifact = value as CaptureArtifact;
	if (
		!artifact ||
		typeof artifact !== "object" ||
		typeof artifact.id !== "string" ||
		!/^capture-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[1-9][0-9]{0,15}$/.test(
			artifact.id,
		) ||
		artifact.mediaType !== "image/png" ||
		artifact.partial !== true ||
		artifact.profile !== "normal-flow-solid-colors" ||
		!Number.isSafeInteger(artifact.bytes) ||
		artifact.bytes < 57 ||
		artifact.bytes > captureArtifactLimits.maxBytes ||
		!Number.isSafeInteger(artifact.width) ||
		!Number.isSafeInteger(artifact.height) ||
		artifact.width < 1 ||
		artifact.height < 1 ||
		artifact.width > 4096 ||
		artifact.height > 4096 ||
		artifact.width * artifact.height > 4_194_304
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid capture artifact metadata",
		);
	return artifact;
}

export function decodeArtifactChunk(
	value: unknown,
	artifact: Readonly<Pick<CaptureArtifact, "id" | "bytes">>,
	offset: number,
): Uint8Array {
	const chunk = value as ArtifactChunk;
	const expected = Math.min(
		captureArtifactLimits.maxChunkBytes,
		artifact.bytes - offset,
	);
	if (
		!chunk ||
		typeof chunk !== "object" ||
		chunk.id !== artifact.id ||
		chunk.offset !== offset ||
		chunk.totalBytes !== artifact.bytes ||
		chunk.bytes !== expected ||
		chunk.eof !== (offset + expected === artifact.bytes) ||
		chunk.encoding !== "base64" ||
		typeof chunk.data !== "string" ||
		chunk.data.length !== 4 * Math.ceil(expected / 3) ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
			chunk.data,
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid capture artifact chunk",
		);
	const binary = atob(chunk.data);
	if (binary.length !== expected || btoa(binary) !== chunk.data)
		throw new AgentBrowserError(
			"invalid-input",
			"Noncanonical capture artifact chunk",
		);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function validatePdfArtifact(value: unknown): Readonly<PdfArtifact> {
	const artifact = value as PdfArtifact;
	if (
		!artifact ||
		typeof artifact !== "object" ||
		typeof artifact.id !== "string" ||
		!/^capture-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[1-9][0-9]{0,15}$/.test(
			artifact.id,
		) ||
		artifact.mediaType !== "application/pdf" ||
		artifact.partial !== true ||
		artifact.profile !== "normal-flow-paginated-raster-text" ||
		!Number.isSafeInteger(artifact.bytes) ||
		artifact.bytes < 500 ||
		artifact.bytes > captureArtifactLimits.maxBytes ||
		!Number.isSafeInteger(artifact.width) ||
		!Number.isSafeInteger(artifact.height) ||
		artifact.width < 1 ||
		artifact.width > 4096 ||
		artifact.height < 1 ||
		artifact.height > 4096 ||
		artifact.width * artifact.height > 4_194_304 ||
		!Number.isSafeInteger(artifact.pages) ||
		artifact.pages < 1 ||
		artifact.pages > 32 ||
		!Array.isArray(artifact.clips) ||
		artifact.clips.length !== artifact.pages
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid PDF artifact metadata",
		);
	let offset = 0;
	let pixels = 0;
	for (const clip of artifact.clips) {
		if (
			!clip ||
			clip.x !== 0 ||
			clip.y !== offset ||
			clip.width !== artifact.width ||
			!Number.isSafeInteger(clip.height) ||
			clip.height < 1 ||
			clip.height > artifact.height
		)
			throw new AgentBrowserError("invalid-input", "Invalid PDF page clip");
		offset += clip.height;
		pixels += clip.width * clip.height;
	}
	if (pixels > 16_777_216)
		throw new AgentBrowserError("invalid-input", "Invalid PDF pixel total");
	return artifact;
}
