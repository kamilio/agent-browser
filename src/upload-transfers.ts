import type {
	DocumentFileSelections,
	FileSelectionTarget,
} from "./control-files.js";
import { AgentBrowserError } from "./errors.js";
import type { EventAction } from "./event-actions.js";
import type { FormUpload } from "./forms.js";
import { decodeStateChunk } from "./state-transfer.js";
import {
	type UploadCommitResult,
	type UploadTransferInfo,
	uploadDocumentId,
	uploadInteger,
	uploadProtocolLimits,
	uploadRequest,
	uploadSession,
	uploadTransferId,
} from "./upload-protocol.js";

export const uploadTransferLimits = Object.freeze({
	maxSessions: 8,
	maxDocuments: 16,
	maxTransfers: 8,
	maxStagedBytes: 33_554_432,
	maxResidentBytes: 134_217_728,
	ttlMs: 300_000,
});

export type UploadActionRunner = <Result>(
	action: EventAction<Result>,
	signal: AbortSignal,
) => Promise<Result>;

interface Binding {
	owner: DocumentFileSelections;
	run: UploadActionRunner;
	unsubscribe: () => void;
}

interface Transfer {
	id: string;
	session: string;
	binding: Binding;
	target: FileSelectionTarget;
	uploads: FormUpload[];
	fileCount: number;
	bytes: number;
	stagedBytes: number;
	receivedBytes: number;
	fileIndex: number;
	fileOffset: number;
	expiresAt: number;
	phase: "pending" | "committing";
	applying: boolean;
	result?: ReturnType<DocumentFileSelections["replace"]>;
	controller: AbortController;
	timer?: ReturnType<typeof setTimeout>;
}

export class UploadTransfers {
	readonly limits;
	private readonly bindings = new Map<string, Binding>();
	private readonly documents = new Map<
		string,
		{ session: string; binding: Binding }
	>();
	private readonly entries = new Map<string, Transfer>();
	private selectedReservation = 0;
	private stagedBytes = 0;
	private closed = false;

	constructor(
		limits: Partial<Record<keyof typeof uploadTransferLimits, number>> = {},
		private readonly clock: () => number = () => performance.now(),
	) {
		this.limits = Object.freeze({ ...uploadTransferLimits, ...limits });
		for (const key of Object.keys(
			uploadTransferLimits,
		) as (keyof typeof uploadTransferLimits)[])
			if (
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > uploadTransferLimits[key]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid upload transfer limits",
				);
		if (
			typeof clock !== "function" ||
			this.limits.maxResidentBytes < uploadProtocolLimits.maxChunkBytes
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid upload memory budget or clock",
			);
		this.now();
	}

	attach(
		session: string,
		owner: DocumentFileSelections,
		run: UploadActionRunner,
	) {
		this.ensureOpen();
		uploadSession(session);
		if (owner.metrics().closed || typeof run !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Upload document is not active",
			);
		const previous = this.bindings.get(session);
		if (previous?.owner === owner) return;
		const existing = this.documents.get(owner.documentId);
		if (existing && existing.session !== session)
			throw new AgentBrowserError(
				"invalid-input",
				"Upload document already belongs to a session",
			);
		if (existing) {
			previous?.owner.invalidateTargets();
			this.ensureOpen();
			if (owner.metrics().closed)
				throw new AgentBrowserError(
					"closed",
					"Upload document closed during activation",
				);
			this.bindings.set(session, existing.binding);
			return;
		}
		this.sweep();
		const selected = this.selectedReservation + owner.limits.maxTotalBytes;
		let staged = this.stagedBytes;
		for (const entry of this.entries.values())
			if (entry.binding === previous) staged -= entry.stagedBytes;
		if (
			(!this.sessions().has(session) &&
				this.sessions().size >= this.limits.maxSessions) ||
			this.documents.size >= this.limits.maxDocuments ||
			this.resident(selected, staged) > this.limits.maxResidentBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Upload document memory reservation exceeded",
			);
		const binding: Binding = { owner, run, unsubscribe: () => {} };
		binding.unsubscribe = owner.onInvalidate((reason) => {
			if (reason === "close") {
				this.detachDocument(session, owner.documentId);
				return;
			}
			for (const entry of this.entries.values())
				if (
					entry.binding === binding &&
					!(entry.applying && reason === "selection")
				)
					this.remove(entry);
		});
		try {
			previous?.owner.invalidateTargets();
			this.ensureOpen();
			if (owner.metrics().closed)
				throw new AgentBrowserError(
					"closed",
					"Upload document closed during activation",
				);
		} catch (error) {
			binding.unsubscribe();
			throw error;
		}
		this.documents.set(owner.documentId, { session, binding });
		this.bindings.set(session, binding);
		this.selectedReservation += owner.limits.maxTotalBytes;
	}

	detach(session: string) {
		for (const [documentId, entry] of this.documents)
			if (entry.session === session) this.detachDocument(session, documentId);
	}

	detachDocument(session: string, documentId: string) {
		const entry = this.documents.get(documentId);
		if (!entry) return;
		if (entry.session !== session)
			throw new AgentBrowserError("not-found", "Upload document not found");
		const binding = entry.binding;
		this.documents.delete(documentId);
		if (this.bindings.get(session) === binding) this.bindings.delete(session);
		binding.unsubscribe();
		for (const entry of this.entries.values())
			if (entry.binding === binding) this.remove(entry);
		this.selectedReservation -= binding.owner.limits.maxTotalBytes;
		binding.owner.close();
	}

	capture(session: string, reference: string) {
		return this.binding(session).owner.capture(reference);
	}

	begin(session: string, value: unknown): Readonly<UploadTransferInfo> {
		this.sweep();
		const binding = this.binding(session);
		const request = uploadRequest(value, binding.owner.limits);
		binding.owner.validateTarget(request.target, request.files.length);
		const bytes = request.files.reduce((sum, file) => sum + file.bytes, 0);
		if (
			this.entries.size >= this.limits.maxTransfers ||
			this.stagedBytes + bytes > this.limits.maxStagedBytes ||
			this.resident(this.selectedReservation, this.stagedBytes + bytes) >
				this.limits.maxResidentBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Upload staging capacity exceeded",
			);
		const id = `upload-${crypto.randomUUID()}`;
		if (this.entries.has(id))
			throw new AgentBrowserError(
				"resource-limit",
				"Upload identity collision",
			);
		const entry: Transfer = {
			id,
			session,
			binding,
			target: request.target,
			uploads: request.files.map((file) => ({
				name: file.name,
				type: file.type,
				data: new Uint8Array(file.bytes),
			})),
			fileCount: request.files.length,
			bytes,
			stagedBytes: bytes,
			receivedBytes: 0,
			fileIndex: 0,
			fileOffset: 0,
			expiresAt: this.now() + this.limits.ttlMs,
			phase: "pending",
			applying: false,
			controller: new AbortController(),
		};
		this.advance(entry);
		entry.timer = setTimeout(() => this.remove(entry), this.limits.ttlMs);
		if (typeof entry.timer === "object" && "unref" in entry.timer)
			entry.timer.unref();
		this.entries.set(entry.id, entry);
		this.stagedBytes += bytes;
		return this.info(entry);
	}

	write(
		session: string,
		documentId: string,
		id: string,
		file: number,
		offset: number,
		base64: unknown,
	): Readonly<UploadTransferInfo> {
		const entry = this.owned(session, documentId, id);
		if (entry.phase !== "pending")
			throw new AgentBrowserError(
				"invalid-input",
				"Upload commit is already running",
			);
		try {
			entry.binding.owner.validateTarget(entry.target, entry.fileCount);
			uploadInteger(file, entry.fileCount);
			uploadInteger(offset, entry.bytes);
			if (
				file !== entry.fileIndex ||
				file === entry.fileCount ||
				offset !== entry.fileOffset
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Upload chunk is not the next expected range",
				);
			const content = decodeStateChunk(base64);
			const destination = entry.uploads[file].data;
			if (offset + content.length > destination.length)
				throw new AgentBrowserError(
					"resource-limit",
					"Upload chunk exceeds advertised file size",
				);
			destination.set(content, offset);
			entry.receivedBytes += content.length;
			entry.fileOffset += content.length;
			this.advance(entry);
			return this.info(entry);
		} catch (error) {
			this.remove(entry);
			throw this.failure(error);
		}
	}

	async commit(
		session: string,
		documentId: string,
		id: string,
		signal?: AbortSignal,
	): Promise<Readonly<UploadCommitResult>> {
		const entry = this.owned(session, documentId, id);
		if (entry.phase !== "pending")
			throw new AgentBrowserError(
				"invalid-input",
				"Upload commit is already running",
			);
		const abort = () => this.remove(entry);
		if (signal !== undefined && !(signal instanceof AbortSignal)) {
			this.remove(entry);
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid upload abort signal",
			);
		}
		if (signal?.aborted) {
			this.remove(entry);
			throw new AgentBrowserError("aborted", "Upload commit aborted");
		}
		entry.phase = "committing";
		signal?.addEventListener("abort", abort, { once: true });
		try {
			if (
				entry.receivedBytes !== entry.bytes ||
				entry.fileIndex !== entry.fileCount
			)
				throw new AgentBrowserError("invalid-input", "Upload is incomplete");
			await entry.binding.run(
				this.commitAction(entry),
				entry.controller.signal,
			);
			if (entry.controller.signal.aborted || this.entries.get(id) !== entry)
				throw new AgentBrowserError(
					"aborted",
					"Upload commit outcome was interrupted",
				);
			const result = entry.result;
			if (!result)
				throw new AgentBrowserError(
					"invalid-input",
					"Upload event action did not complete",
				);
			return Object.freeze({
				id,
				documentId,
				reference: result.reference,
				version: result.version,
				files: result.files,
				bytes: result.bytes,
				committed: true,
				stagingReleased: true,
			});
		} catch (error) {
			throw this.failure(error);
		} finally {
			signal?.removeEventListener("abort", abort);
			this.remove(entry);
		}
	}

	cancel(session: string, documentId: string, id: string) {
		this.ensureOpen();
		uploadSession(session);
		uploadDocumentId(documentId);
		uploadTransferId(id);
		this.sweep();
		const entry = this.entries.get(id);
		if (
			entry &&
			(entry.session !== session || entry.target.documentId !== documentId)
		)
			throw new AgentBrowserError("not-found", "Upload transfer not found");
		if (entry) this.remove(entry);
		return Object.freeze({
			id,
			documentId,
			canceled: true as const,
			stagingReleased: true as const,
		});
	}

	metrics() {
		if (!this.closed) this.sweep();
		return Object.freeze({
			sessions: this.sessions().size,
			documents: this.documents.size,
			transfers: this.entries.size,
			stagedBytes: this.stagedBytes,
			selectedReservationBytes: this.selectedReservation,
			commitCopyReservationBytes: this.stagedBytes,
			codecReservationBytes: this.closed
				? 0
				: uploadProtocolLimits.maxChunkBytes,
			residentReservationBytes: this.closed
				? 0
				: this.resident(this.selectedReservation, this.stagedBytes),
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const session of this.sessions()) this.detach(session);
		for (const entry of this.entries.values()) this.remove(entry);
	}

	private *commitAction(
		entry: Transfer,
	): EventAction<ReturnType<DocumentFileSelections["replace"]>> {
		this.sweep();
		if (
			this.entries.get(entry.id) !== entry ||
			entry.controller.signal.aborted ||
			this.bindings.get(entry.session) !== entry.binding
		)
			throw new AgentBrowserError(
				"aborted",
				"Upload commit no longer owns its target",
			);
		entry.binding.owner.validateTarget(entry.target, entry.fileCount);
		entry.applying = true;
		try {
			const result = yield* entry.binding.owner.replaceAction(
				entry.target,
				entry.uploads,
				() => {
					entry.applying = false;
					this.releaseBytes(entry);
				},
			);
			entry.result = result;
			return result;
		} finally {
			entry.applying = false;
		}
	}

	private binding(session: string) {
		this.ensureOpen();
		uploadSession(session);
		const binding = this.bindings.get(session);
		if (!binding)
			throw new AgentBrowserError("not-found", "Upload document not found");
		return binding;
	}

	private owned(session: string, documentId: string, id: string) {
		this.ensureOpen();
		uploadSession(session);
		uploadDocumentId(documentId);
		uploadTransferId(id);
		this.sweep();
		const entry = this.entries.get(id);
		if (
			!entry ||
			entry.session !== session ||
			entry.target.documentId !== documentId ||
			this.bindings.get(session) !== entry.binding
		)
			throw new AgentBrowserError("not-found", "Upload transfer not found");
		return entry;
	}

	private info(entry: Transfer): Readonly<UploadTransferInfo> {
		return Object.freeze({
			id: entry.id,
			...entry.target,
			files: entry.fileCount,
			bytes: entry.bytes,
			receivedBytes: entry.receivedBytes,
			fileIndex: entry.fileIndex,
			fileOffset: entry.fileOffset,
			expiresAt: entry.expiresAt,
		});
	}

	private advance(entry: Transfer) {
		while (
			entry.fileIndex < entry.fileCount &&
			entry.fileOffset === entry.uploads[entry.fileIndex].data.length
		) {
			entry.fileIndex++;
			entry.fileOffset = 0;
		}
	}

	private releaseBytes(entry: Transfer) {
		this.stagedBytes -= entry.stagedBytes;
		entry.stagedBytes = 0;
		for (const file of entry.uploads) file.data.fill(0);
		entry.uploads.length = 0;
	}

	private remove(entry: Transfer) {
		if (this.entries.get(entry.id) !== entry) return;
		this.entries.delete(entry.id);
		clearTimeout(entry.timer);
		this.releaseBytes(entry);
		entry.controller.abort();
	}

	private sweep() {
		const now = this.now();
		for (const entry of this.entries.values())
			if (entry.expiresAt <= now) this.remove(entry);
	}

	private now() {
		const now = this.clock();
		if (!Number.isFinite(now) || now < 0)
			throw new AgentBrowserError("invalid-input", "Invalid upload clock");
		return now;
	}

	private resident(selected: number, staged: number) {
		return selected + 2 * staged + uploadProtocolLimits.maxChunkBytes;
	}

	private sessions() {
		return new Set([...this.documents.values()].map((entry) => entry.session));
	}

	private failure(error: unknown) {
		return new AgentBrowserError(
			error instanceof AgentBrowserError ? error.code : "network-error",
			"Upload transfer operation failed",
		);
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Upload transfers are closed");
	}
}
