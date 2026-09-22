import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { EOL } from "node:os";
import { types } from "node:util";
import { AgentBrowserError } from "./errors.js";
import type { ReleasedContext } from "./safejs-extension-types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const NativeURL = URL;

export const pageBlobLimits: Readonly<
	Record<
		| "maxBlobs"
		| "maxParts"
		| "maxBlobBytes"
		| "maxRetainedBytes"
		| "maxObjectUrls"
		| "maxCreatedUrls"
		| "maxTypeCodeUnits"
		| "maxUrlCodeUnits"
		| "maxWork",
		number
	>
> = Object.freeze({
	maxBlobs: 128,
	maxParts: 256,
	maxBlobBytes: 2_097_152,
	maxRetainedBytes: 4_194_304,
	maxObjectUrls: 128,
	maxCreatedUrls: 1024,
	maxTypeCodeUnits: 1024,
	maxUrlCodeUnits: 16_384,
	maxWork: 16_777_216,
});

interface BlobRecord {
	bytes: Uint8Array;
	type: string;
}

function field(input: unknown, name: string): unknown {
	if (!input || typeof input !== "object" || types.isProxy(input))
		throw new TypeError("Invalid blob input");
	const descriptor = Object.getOwnPropertyDescriptor(input, name);
	if (!descriptor || !Object.hasOwn(descriptor, "value"))
		throw new TypeError("Blob input requires data fields");
	return descriptor.value;
}

export class PageBlobs {
	readonly port: object;
	readonly limits: typeof pageBlobLimits;
	private readonly blobs = new Map<number, BlobRecord>();
	private readonly urls = new Map<string, number>();
	private bytes = 0;
	private createdUrls = 0;
	private work = 0;
	private nextId = 0;
	private closed = false;

	constructor(
		private readonly context: Pick<
			ReleasedContext,
			"signal" | "createHostObject"
		>,
		private readonly origin: () => string,
		limits: Partial<typeof pageBlobLimits> = {},
	) {
		if (!limits || typeof limits !== "object" || Array.isArray(limits))
			throw new TypeError("Invalid blob limits");
		this.limits = Object.freeze({ ...pageBlobLimits, ...limits });
		for (const key of Object.keys(
			this.limits,
		) as (keyof typeof pageBlobLimits)[])
			if (
				!Object.hasOwn(pageBlobLimits, key) ||
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > pageBlobLimits[key]
			)
				throw new TypeError("Invalid blob limits");
		this.ensureOpen();
		this.port = context.createHostObject({
			properties: {
				limits: {
					get: () => {
						this.ensureOpen();
						return this.limits;
					},
				},
			},
			methods: {
				create: (parts, type, endings) => this.create(parts, type, endings),
				createObjectURL: (id) => this.createObjectUrl(id),
				revokeObjectURL: (url) => this.revokeObjectUrl(url),
			},
		});
	}

	metrics() {
		return {
			closed: this.closed,
			blobs: this.blobs.size,
			objectUrls: this.urls.size,
			retainedBytes: this.bytes,
			createdUrls: this.createdUrls,
			work: this.work,
		};
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.blobs.clear();
		this.urls.clear();
		this.bytes = 0;
	}

	// Consumers such as worker loaders receive an immutable snapshot, never storage.
	resolveObjectUrl(
		input: string,
	): Readonly<{ bytes: Uint8Array; type: string }> | undefined {
		this.ensureOpen();
		const url = this.urlKey(input);
		const id = url === undefined ? undefined : this.urls.get(url);
		if (id === undefined) return undefined;
		const record = this.record(id);
		this.charge(record.bytes.length + 1);
		return { bytes: record.bytes.slice(), type: record.type };
	}

	private ensureOpen() {
		if (this.context.signal.aborted) this.close();
		if (this.closed)
			throw new AgentBrowserError("closed", "Blob owner is closed");
	}
	private limited(): never {
		throw new AgentBrowserError(
			"resource-limit",
			"Blob resource limit exceeded",
		);
	}
	private charge(units: number) {
		this.ensureOpen();
		if (units > this.limits.maxWork - this.work) this.limited();
		this.work += units;
	}
	private record(input: unknown) {
		this.ensureOpen();
		if (typeof input !== "number" || !Number.isSafeInteger(input))
			throw new TypeError("Invalid blob reference");
		const record = this.blobs.get(input);
		if (!record) throw new TypeError("Unknown blob reference");
		return record;
	}
	private mime(input: unknown) {
		if (typeof input !== "string")
			throw new TypeError("Blob type requires a string");
		if (input.length > this.limits.maxTypeCodeUnits) this.limited();
		this.charge(input.length + 1);
		return /^[\x20-\x7e]*$/.test(input) ? input.toLowerCase() : "";
	}
	private admit(size: number) {
		this.ensureOpen();
		if (
			this.blobs.size >= this.limits.maxBlobs ||
			size > this.limits.maxBlobBytes ||
			size > this.limits.maxRetainedBytes - this.bytes
		)
			this.limited();
	}
	private publish(bytes: Uint8Array, type: string): object {
		const id = ++this.nextId;
		this.blobs.set(id, { bytes, type });
		this.bytes += bytes.length;
		try {
			return this.context.createHostObject({
				properties: {
					id: {
						get: () => {
							this.record(id);
							return id;
						},
					},
					size: { get: () => this.record(id).bytes.length },
					type: { get: () => this.record(id).type },
				},
				methods: {
					text: () => {
						const record = this.record(id);
						this.charge(record.bytes.length + 1);
						return decoder.decode(record.bytes);
					},
					arrayBuffer: () => {
						const record = this.record(id);
						this.charge(record.bytes.length + 1);
						return record.bytes.slice().buffer;
					},
					bytes: () => {
						const record = this.record(id);
						this.charge(record.bytes.length + 1);
						return record.bytes.slice();
					},
					slice: (start, end, type) => this.slice(id, start, end, type),
				},
			});
		} catch (error) {
			this.blobs.delete(id);
			this.bytes -= bytes.length;
			throw error;
		}
	}
	private create(input: unknown, inputType: unknown, endings: unknown) {
		this.ensureOpen();
		const type = this.mime(inputType);
		if (endings !== "transparent" && endings !== "native")
			throw new TypeError("Invalid blob endings");
		if (
			!Array.isArray(input) ||
			types.isProxy(input) ||
			input.length > this.limits.maxParts
		)
			throw new TypeError("Invalid blob parts");
		const parts: (string | Uint8Array | number[])[] = [];
		this.admit(0);
		this.charge(input.length + 1);
		let size = 0;
		for (let index = 0; index < input.length; index++) {
			const part = field(input, String(index));
			const kind = field(part, "kind");
			const value = field(part, "value");
			let body: string | Uint8Array | number[];
			if (kind === "blob") body = this.record(value).bytes;
			else if (kind === "text") {
				if (
					typeof value !== "string" ||
					value.length > this.limits.maxBlobBytes
				)
					this.limited();
				this.charge(value.length);
				body = endings === "native" ? value.replace(/\r\n|\r|\n/g, EOL) : value;
			} else if (kind === "bytes") {
				if (
					!Array.isArray(value) ||
					types.isProxy(value) ||
					value.length > this.limits.maxBlobBytes - size
				)
					throw new TypeError("Invalid blob bytes");
				this.charge(value.length);
				body = value as number[];
				for (let offset = 0; offset < value.length; offset++) {
					const byte = field(value, String(offset));
					if (
						typeof byte !== "number" ||
						!Number.isInteger(byte) ||
						byte < 0 ||
						byte > 255
					)
						throw new TypeError("Invalid blob byte");
				}
			} else throw new TypeError("Invalid blob part");
			size +=
				typeof body === "string"
					? Buffer.byteLength(body, "utf8")
					: body.length;
			if (size > this.limits.maxBlobBytes) this.limited();
			parts.push(body);
		}
		this.admit(size);
		this.charge(size);
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const part of parts) {
			if (typeof part === "string") {
				offset += encoder.encodeInto(part, bytes.subarray(offset)).written;
			} else {
				bytes.set(part, offset);
				offset += part.length;
			}
		}
		return this.publish(bytes, type);
	}
	private slice(
		id: number,
		start: unknown,
		end: unknown,
		inputType: unknown,
	): object {
		const record = this.record(id),
			type = this.mime(inputType);
		if (
			typeof start !== "number" ||
			!Number.isInteger(start) ||
			typeof end !== "number" ||
			!Number.isInteger(end)
		)
			throw new TypeError("Invalid blob slice");
		const length = record.bytes.length;
		const from =
			start < 0 ? Math.max(length + start, 0) : Math.min(start, length);
		const to = end < 0 ? Math.max(length + end, 0) : Math.min(end, length);
		const size = Math.max(to - from, 0);
		this.admit(size);
		this.charge(size + 1);
		return this.publish(record.bytes.slice(from, from + size), type);
	}
	private createObjectUrl(id: unknown) {
		this.record(id);
		if (
			this.urls.size >= this.limits.maxObjectUrls ||
			this.createdUrls >= this.limits.maxCreatedUrls
		)
			this.limited();
		let origin = "null";
		try {
			origin = new NativeURL(this.origin()).origin;
		} catch {
			/* Opaque origin. */
		}
		const url = `blob:${origin}/${randomUUID()}`;
		if (url.length > this.limits.maxUrlCodeUnits) this.limited();
		this.charge(url.length + 1);
		this.urls.set(url, id as number);
		this.createdUrls++;
		return url;
	}
	private urlKey(input: unknown) {
		if (typeof input !== "string")
			throw new TypeError("Object URL requires a string");
		if (input.length > this.limits.maxUrlCodeUnits) this.limited();
		this.charge(input.length + 1);
		try {
			const url = new NativeURL(input);
			if (url.protocol !== "blob:") return undefined;
			url.hash = "";
			return url.href;
		} catch {
			return undefined;
		}
	}
	private revokeObjectUrl(input: unknown) {
		this.ensureOpen();
		const url = this.urlKey(input);
		if (url !== undefined) this.urls.delete(url);
	}
}
