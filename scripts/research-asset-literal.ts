import { createHash } from "node:crypto";
import type { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { types } from "node:util";
import { CookieJar } from "../src/cookies.js";
import { AgentBrowserError } from "../src/errors.js";
import { type NetworkMetrics, parseNetworkUrl } from "../src/network.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import {
	type SourceLiteralValue,
	parseSourceLiteral,
} from "../src/source-literal.js";

export const researchAssetLiteralLimits = Object.freeze({
	maxBodyBytes: 2_000_000,
	maxRangeBytes: 65_536,
	maxRanges: 8,
	maxOutputBytes: 256_000,
	timeoutMs: 30_000,
});

export interface ResearchAssetLiteralRange {
	readonly startByte: number;
	readonly endByte: number;
}

export interface ResearchAssetLiteralOptions {
	readonly url: string;
	readonly expectedSha256: string;
	readonly ranges: readonly ResearchAssetLiteralRange[];
}

export interface ResearchAssetLiteralExtraction {
	readonly kind: "script-asset-literals-v1";
	readonly partial: true;
	readonly rendered: false;
	readonly source: Readonly<{
		url: string;
		contentType: string;
		decodedBytes: number;
		sha256: string;
	}>;
	readonly literals: readonly Readonly<
		ResearchAssetLiteralRange & {
			sha256: string;
			value: SourceLiteralValue;
		}
	>[];
}

const usage =
	"Usage: research-asset-literal --sha256 HEX --range START:END [--range START:END ...] HTTPS_JS_URL\nOne explicit native asset GET; pinned decoded bytes, no scripts, credentials, redirects or retries. Ranges are audited UTF-8 byte offsets, not inferred exports.\n";
const byteArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(
	byteArrayPrototype,
	"byteLength",
)?.get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(
	byteArrayPrototype,
	"byteOffset",
)?.get;
const bufferGetter = Object.getOwnPropertyDescriptor(
	byteArrayPrototype,
	"buffer",
)?.get;
const typedArrayAt = Uint8Array.prototype.at;

function invalid(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid source asset literal input",
	);
}

function limited(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"Source asset literal limit exceeded",
	);
}

function record(
	value: unknown,
	fields: readonly string[],
): Record<string, unknown> {
	if (!value || typeof value !== "object" || types.isProxy(value)) invalid();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== null && prototype !== Object.prototype) invalid();
	const keys = Reflect.ownKeys(value);
	if (
		keys.length !== fields.length ||
		!keys.every((key) => typeof key === "string" && fields.includes(key))
	)
		invalid();
	const result: Record<string, unknown> = Object.create(null);
	for (const field of fields) {
		const descriptor = Object.getOwnPropertyDescriptor(value, field);
		if (!descriptor || !Object.hasOwn(descriptor, "value")) invalid();
		result[field] = descriptor.value;
	}
	return result;
}

function assetUrl(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length > 8192 ||
		/[\s\p{Cc}\p{Cf}\\?#]/u.test(value)
	)
		invalid();
	let url: URL;
	try {
		url = parseNetworkUrl(value);
	} catch {
		invalid();
	}
	if (
		url.protocol !== "https:" ||
		url.href !== value ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		!/\.m?js$/i.test(url.pathname)
	)
		invalid();
	return value;
}

function expectedHash(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length !== 64 ||
		!/^[a-f0-9]{64}$/.test(value)
	)
		invalid();
	return value;
}

function ranges(value: unknown): readonly ResearchAssetLiteralRange[] {
	if (
		types.isProxy(value) ||
		!Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Array.prototype ||
		value.length < 1 ||
		value.length > researchAssetLiteralLimits.maxRanges
	)
		invalid();
	if (Reflect.ownKeys(value).length !== value.length + 1) invalid();
	const result: ResearchAssetLiteralRange[] = [];
	for (let index = 0; index < value.length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor || !Object.hasOwn(descriptor, "value")) invalid();
		const range = record(descriptor.value, ["startByte", "endByte"]);
		const startByte = range.startByte;
		const endByte = range.endByte;
		if (
			typeof startByte !== "number" ||
			typeof endByte !== "number" ||
			!Number.isSafeInteger(startByte) ||
			!Number.isSafeInteger(endByte) ||
			startByte < 0 ||
			endByte <= startByte ||
			endByte > researchAssetLiteralLimits.maxBodyBytes ||
			(result.length && startByte < result[result.length - 1].endByte)
		)
			invalid();
		if (endByte - startByte > researchAssetLiteralLimits.maxRangeBytes)
			limited();
		result.push(Object.freeze({ startByte, endByte }));
	}
	return Object.freeze(result);
}

function copyBody(value: unknown): Uint8Array {
	if (types.isProxy(value) || !types.isUint8Array(value)) invalid();
	let view: Uint8Array;
	try {
		typedArrayAt.call(value, 0);
		const backing = bufferGetter?.call(value) as ArrayBuffer;
		if (!types.isArrayBuffer(backing)) invalid();
		const offset = byteOffsetGetter?.call(value) as number;
		const length = byteLengthGetter?.call(value) as number;
		view = new Uint8Array(backing, offset, length);
	} catch {
		invalid();
	}
	if (view.byteLength > researchAssetLiteralLimits.maxBodyBytes) limited();
	return new Uint8Array(view);
}

export function extractResearchAssetLiterals(
	input: unknown,
): ResearchAssetLiteralExtraction {
	const fields = record(input, [
		"url",
		"contentType",
		"body",
		"expectedSha256",
		"ranges",
	]);
	const url = assetUrl(fields.url);
	const expected = expectedHash(fields.expectedSha256);
	const selectedRanges = ranges(fields.ranges);
	const contentType = fields.contentType;
	if (typeof contentType !== "string" || contentType.length > 1024) invalid();
	if (
		/[^\x20-\x7e\t]/.test(contentType) ||
		!/^[ \t]*(?:text|application)\/(?:javascript|ecmascript)(?:[ \t]*;[ \t]*charset[ \t]*=[ \t]*(?:utf-8|"utf-8"))?[ \t]*$/i.test(
			contentType,
		)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Source asset requires explicit UTF-8 JavaScript MIME",
		);
	const body = copyBody(fields.body);
	try {
		const sha256 = createHash("sha256").update(body).digest("hex");
		if (sha256 !== expected) invalid();
		const literals = selectedRanges.map((range) => {
			if (range.endByte > body.length) invalid();
			const bytes = body.subarray(range.startByte, range.endByte);
			let source: string;
			try {
				source = new TextDecoder("utf-8", {
					fatal: true,
					ignoreBOM: true,
				}).decode(bytes);
			} catch {
				invalid();
			}
			return Object.freeze({
				...range,
				sha256: createHash("sha256").update(bytes).digest("hex"),
				value: parseSourceLiteral(source),
			});
		});
		const result: ResearchAssetLiteralExtraction = Object.freeze({
			kind: "script-asset-literals-v1",
			partial: true,
			rendered: false,
			source: Object.freeze({
				url,
				contentType,
				decodedBytes: body.length,
				sha256,
			}),
			literals: Object.freeze(literals),
		});
		if (
			Buffer.byteLength(JSON.stringify(result)) >
			researchAssetLiteralLimits.maxOutputBytes
		)
			limited();
		return result;
	} finally {
		body.fill(0);
	}
}

export function parseResearchAssetLiteralArguments(
	args: readonly string[],
): ResearchAssetLiteralOptions {
	if (
		!Array.isArray(args) ||
		args.length > 19 ||
		args.some((value) => typeof value !== "string" || value.length > 8192)
	)
		invalid();
	let url: string | undefined;
	let digest: string | undefined;
	const selected: ResearchAssetLiteralRange[] = [];
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === "--sha256") {
			if (digest !== undefined) invalid();
			digest = expectedHash(args[++index]);
		} else if (argument === "--range") {
			const raw = args[++index] ?? "";
			const match = /^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.exec(raw);
			if (!match || match[0] !== raw) invalid();
			selected.push({ startByte: Number(match[1]), endByte: Number(match[2]) });
		} else {
			if (url !== undefined || argument.startsWith("-")) invalid();
			url = assetUrl(argument);
		}
	}
	return Object.freeze({
		url: assetUrl(url),
		expectedSha256: expectedHash(digest),
		ranges: ranges(selected),
	});
}

function cancellation(signal: AbortSignal): AgentBrowserError {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Source asset operation aborted");
}

function checkpoint(signal: AbortSignal): void {
	if (signal.aborted) throw cancellation(signal);
}

function outputFailure(): AgentBrowserError {
	return new AgentBrowserError("closed", "Source asset output failed");
}

async function fetchLiterals(
	options: ResearchAssetLiteralOptions,
	signal: AbortSignal,
) {
	const cookieJar = new CookieJar();
	const transport = new NodeNetworkTransport({
		cookieJar,
		allowedOrigins: [new URL(options.url).origin],
		limits: {
			timeoutMs: 15_000,
			maxResponseBytes: 2_000_000,
			maxTotalBytes: 2_000_000,
			maxRequestBytes: 1,
			maxHeaderBytes: 16_384,
			maxRequests: 1,
			maxConcurrent: 1,
			maxRedirects: 0,
		},
	});
	const result: {
		outcome: "failure" | "extracted-unverified";
		contentSuccess: false | null;
		status?: number;
		extraction?: ResearchAssetLiteralExtraction;
		failure?: { category: string; stage: string };
		metrics?: Readonly<NetworkMetrics>;
	} = { outcome: "failure", contentSuccess: false };
	let stage = "request";
	try {
		checkpoint(signal);
		const response = await transport.request({
			url: options.url,
			method: "GET",
			redirect: "error",
			signal,
			headers: { "User-Agent": "AgentBrowser/0.1", "Accept-Language": "en-US" },
			cookieContext: { credentials: "omit", siteUrl: null },
		});
		checkpoint(signal);
		stage = "response";
		result.status = response.status;
		if (
			response.url !== options.url ||
			response.redirects.length ||
			response.status !== 200
		)
			throw new AgentBrowserError(
				"network-error",
				"Source asset response refused",
			);
		const declared = response.headers["content-type"];
		if (!declared || declared.length !== 1) invalid();
		stage = "extract";
		result.extraction = extractResearchAssetLiterals({
			...options,
			contentType: declared[0],
			body: response.body,
		});
		result.outcome = "extracted-unverified";
		result.contentSuccess = null;
	} catch (error) {
		result.failure = {
			category:
				error instanceof AgentBrowserError ? error.code : "network-error",
			stage,
		};
	} finally {
		try {
			transport.close();
		} finally {
			cookieJar.close();
		}
		result.metrics = transport.metrics();
	}
	if (!result.metrics.closed || result.metrics.active !== 0)
		throw new AgentBrowserError(
			"closed",
			"Source asset transport did not close",
		);
	return result;
}

export async function runResearchAssetLiteralCli(
	args: readonly string[],
	output: Writable,
	signal?: AbortSignal,
): Promise<number> {
	const options = parseResearchAssetLiteralArguments(args);
	if (signal?.aborted) throw cancellation(signal);
	if (output.destroyed || output.writableEnded || output.errored)
		throw outputFailure();
	const controller = new AbortController();
	const abort = () => controller.abort(signal?.reason);
	const outputError = () => controller.abort(outputFailure());
	const timer = setTimeout(
		() =>
			controller.abort(
				new AgentBrowserError("timeout", "Source asset deadline exceeded"),
			),
		researchAssetLiteralLimits.timeoutMs,
	);
	signal?.addEventListener("abort", abort, { once: true });
	output.on("error", outputError);
	output.on("close", outputError);
	try {
		const result = await fetchLiterals(options, controller.signal);
		checkpoint(controller.signal);
		const jsonl = `${JSON.stringify(result)}\n`;
		if (Buffer.byteLength(jsonl) > researchAssetLiteralLimits.maxOutputBytes)
			limited();
		await new Promise<void>((resolve, reject) => {
			let writeAcknowledged = false;
			let writeErrorObserved = false;
			const release = () => {
				output.off("error", writeError);
				output.off("close", release);
			};
			const writeError = () => {
				writeErrorObserved = true;
				if (writeAcknowledged) release();
			};
			const aborted = () => {
				controller.signal.removeEventListener("abort", aborted);
				reject(cancellation(controller.signal));
			};
			controller.signal.addEventListener("abort", aborted, { once: true });
			output.on("error", writeError);
			output.on("close", release);
			try {
				output.write(jsonl, (error) => {
					writeAcknowledged = true;
					controller.signal.removeEventListener("abort", aborted);
					if (!error || writeErrorObserved) release();
					if (error) reject(outputFailure());
					else resolve();
				});
			} catch {
				controller.signal.removeEventListener("abort", aborted);
				release();
				reject(outputFailure());
			}
		});
		checkpoint(controller.signal);
		return result.outcome === "extracted-unverified" ? 0 : 1;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
		output.off("error", outputError);
		output.off("close", outputError);
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	process.stdout.on("error", () => {
		process.exitCode = 1;
	});
	process.stderr.on("error", () => {
		process.exitCode = 1;
	});
	if (args.length === 1 && args[0] === "--help") {
		process.stdout.write(usage);
		return;
	}
	try {
		parseResearchAssetLiteralArguments(args);
	} catch {
		process.stderr.write(usage);
		process.exitCode = 64;
		return;
	}
	try {
		process.exitCode = await runResearchAssetLiteralCli(args, process.stdout);
	} catch {
		process.stderr.write("Source asset execution or output failed.\n");
		process.exitCode = 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	void main().catch(() => {
		process.exitCode = 1;
	});
