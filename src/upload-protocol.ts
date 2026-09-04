import {
	type FileSelectionLimits,
	type FileSelectionTarget,
	fileSelectionLimits,
	validateUploadMetadata,
} from "./control-files.js";
import { AgentBrowserError } from "./errors.js";

export const uploadProtocolLimits = Object.freeze({
	maxChunkBytes: 32_768,
	maxMetadataCodeUnits: 65_536,
});

export interface UploadFileMetadata {
	readonly name: string;
	readonly type?: string;
	readonly bytes: number;
}

export interface UploadTransferRequest {
	readonly target: FileSelectionTarget;
	readonly files: readonly UploadFileMetadata[];
}

export interface UploadTransport<Result> {
	begin(request: UploadTransferRequest): Promise<string>;
	write(
		id: string,
		file: number,
		offset: number,
		base64: string,
	): Promise<void>;
	commit(id: string): Promise<Result>;
	cancel(id: string): Promise<void>;
}

export interface UploadTransferInfo {
	readonly id: string;
	readonly documentId: string;
	readonly reference: string;
	readonly version: number;
	readonly files: number;
	readonly bytes: number;
	readonly receivedBytes: number;
	readonly fileIndex: number;
	readonly fileOffset: number;
	readonly expiresAt: number;
}

export interface UploadCommitResult {
	readonly id: string;
	readonly documentId: string;
	readonly reference: string;
	readonly version: number;
	readonly files: number;
	readonly bytes: number;
	readonly committed: true;
	readonly stagingReleased: true;
}

export const uploadCommandSchemas = Object.freeze([
	{ name: "upload-target", arguments: ["reference"] },
	{ name: "upload-begin", arguments: ["metadata-json"] },
	{
		name: "upload-write",
		arguments: [
			"document-id",
			"transfer-id",
			"file-index",
			"byte-offset",
			"base64",
		],
	},
	{ name: "upload-commit", arguments: ["document-id", "transfer-id"] },
	{ name: "upload-cancel", arguments: ["document-id", "transfer-id"] },
] as const);

export type UploadCommandName = (typeof uploadCommandSchemas)[number]["name"];

export interface UploadCommandResult {
	readonly schemaVersion: 1;
	readonly command: string;
	readonly session: string;
	readonly data: unknown;
}

export type UploadExecutor = (
	argv: readonly string[],
) => Promise<UploadCommandResult>;

export function uploadRecord(
	value: unknown,
	required: readonly string[],
	optional: readonly string[] = [],
): Record<string, unknown> {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		(Object.getPrototypeOf(value) !== Object.prototype &&
			Object.getPrototypeOf(value) !== null) ||
		Reflect.ownKeys(value).some(
			(key) =>
				typeof key !== "string" ||
				(!required.includes(key) && !optional.includes(key)),
		) ||
		required.some((key) => !Object.hasOwn(value, key))
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid upload protocol record",
		);
	const record: Record<string, unknown> = {};
	for (const key of Object.getOwnPropertyNames(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !("value" in descriptor))
			throw new AgentBrowserError(
				"invalid-input",
				"Upload records require data properties",
			);
		record[key] = descriptor.value;
	}
	return Object.freeze(record);
}

export function uploadSession(value: unknown): asserts value is string {
	if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value))
		throw new AgentBrowserError("invalid-input", "Invalid upload session");
}

export function uploadDocumentId(value: unknown): asserts value is string {
	if (
		typeof value !== "string" ||
		!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
			value,
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid upload document identity",
		);
}

export function uploadTransferId(value: unknown): asserts value is string {
	if (
		typeof value !== "string" ||
		!/^upload-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
			value,
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid upload transfer identity",
		);
}

export function uploadInteger(
	value: unknown,
	max = Number.MAX_SAFE_INTEGER,
): asserts value is number {
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value < 0 ||
		value > max
	)
		throw new AgentBrowserError("invalid-input", "Invalid upload integer");
}

export function uploadTarget(value: unknown): Readonly<FileSelectionTarget> {
	const target = uploadRecord(value, ["documentId", "reference", "version"]);
	uploadDocumentId(target.documentId);
	uploadInteger(target.version, Number.MAX_SAFE_INTEGER - 1);
	if (
		typeof target.reference !== "string" ||
		!/^e[1-9][0-9]{0,15}$/.test(target.reference) ||
		!Number.isSafeInteger(Number(target.reference.slice(1)))
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid upload element reference",
		);
	return Object.freeze({
		documentId: target.documentId,
		reference: target.reference,
		version: target.version,
	});
}

export function uploadRequest(
	value: unknown,
	limits: FileSelectionLimits = fileSelectionLimits,
): Readonly<UploadTransferRequest> {
	const request = uploadRecord(value, ["target", "files"]);
	const target = uploadTarget(request.target);
	if (!Array.isArray(request.files))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid upload file metadata",
		);
	if (request.files.length > limits.maxFiles)
		throw new AgentBrowserError("resource-limit", "Upload file count exceeded");
	let bytes = 0;
	const files: UploadFileMetadata[] = [];
	const count = request.files.length;
	for (let index = 0; index < count; index++) {
		const file = uploadRecord(
			request.files[index],
			["name", "bytes"],
			["type"],
		);
		validateUploadMetadata(file.name, file.type, limits);
		uploadInteger(file.bytes);
		bytes += file.bytes;
		if (file.bytes > limits.maxFileBytes || bytes > limits.maxTotalBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Upload byte limit exceeded",
			);
		files.push(
			Object.freeze({
				name: file.name as string,
				type: file.type as string | undefined,
				bytes: file.bytes,
			}),
		);
	}
	return Object.freeze({ target, files: Object.freeze(files) });
}

export function uploadProgress(value: unknown): Readonly<UploadTransferInfo> {
	const info = uploadRecord(value, [
		"id",
		"documentId",
		"reference",
		"version",
		"files",
		"bytes",
		"receivedBytes",
		"fileIndex",
		"fileOffset",
		"expiresAt",
	]);
	uploadTransferId(info.id);
	const target = uploadTarget({
		documentId: info.documentId,
		reference: info.reference,
		version: info.version,
	});
	uploadInteger(info.files, fileSelectionLimits.maxFiles);
	uploadInteger(info.bytes, fileSelectionLimits.maxTotalBytes);
	uploadInteger(info.receivedBytes, info.bytes);
	uploadInteger(info.fileIndex, info.files);
	uploadInteger(info.fileOffset, info.bytes);
	if (
		typeof info.expiresAt !== "number" ||
		!Number.isFinite(info.expiresAt) ||
		info.expiresAt < 0
	)
		throw new AgentBrowserError("invalid-input", "Invalid upload expiration");
	return Object.freeze({
		id: info.id,
		...target,
		files: info.files,
		bytes: info.bytes,
		receivedBytes: info.receivedBytes,
		fileIndex: info.fileIndex,
		fileOffset: info.fileOffset,
		expiresAt: info.expiresAt,
	});
}

export function uploadCommandSummary(argv: readonly string[]) {
	return Object.freeze({
		command: uploadCommandSchemas.some((entry) => entry.name === argv[0])
			? argv[0]
			: "unsupported",
		arguments: Math.max(0, argv.length - 1),
		redacted: true as const,
	});
}
