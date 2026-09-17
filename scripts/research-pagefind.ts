import { createHash } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { types } from "node:util";
import { AgentBrowserError } from "../src/errors.js";
import { NetworkPolicy } from "../src/network.js";
import { gunzipSync } from "node:zlib";
import { selectJsonSourceSpans } from "../src/json-source-selection.js";
import { searchPagefindSource } from "../src/source-pagefind.js";
import {
	exitResearchCliFailure,
	researchOutputFailureGraceMs,
	writeResearchOutput,
} from "./research-stream-output.js";

export const researchPagefindCliLimits = Object.freeze({
	maxInputBytes: 2_000_000,
	maxInputChunks: 65_536,
	maxOutputBytes: 256_000,
	maxArgumentCount: 70,
	maxArgumentCodeUnits: 8192,
	maxTerms: 32,
	maxTermCodeUnits: 256,
	maxLimit: 100,
	defaultLimit: 20,
	timeoutMs: 30_000,
	failureExitTimeoutMs: researchOutputFailureGraceMs,
});

const usage =
	"Usage: research-pagefind --sha256 HEX --term TERM [--term TERM ...] [--limit 1..100] < captured-bundle.json\nStdin contains captured Pagefind metadata, index chunks and optional result fragments. Output is unverified source-only literal-term search; no network, navigation, rendering, stemming or script execution occurs.\n";

export interface ResearchPagefindArguments {
	sha256: string;
	terms: readonly string[];
	limit: number;
}

function invalidArguments(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid research Pagefind arguments",
	);
}

export function parseResearchPagefindArguments(
	args: readonly string[],
): ResearchPagefindArguments {
	if (
		!Array.isArray(args) ||
		args.length < 4 ||
		args.length > researchPagefindCliLimits.maxArgumentCount ||
		args.length % 2 !== 0
	)
		invalidArguments();
	const fields = new Map<string, string>();
	const terms: string[] = [];
	for (let index = 0; index < args.length; index += 2) {
		const flag = args[index];
		const value = args[index + 1];
		if (
			typeof flag !== "string" ||
			typeof value !== "string" ||
			value.length > researchPagefindCliLimits.maxArgumentCodeUnits ||
			/[\p{Cc}\p{Cf}]/u.test(value)
		)
			invalidArguments();
		if (flag === "--term") {
			if (
				!value.length ||
				value.length > researchPagefindCliLimits.maxTermCodeUnits ||
				terms.length >= researchPagefindCliLimits.maxTerms ||
				terms.includes(value)
			)
				invalidArguments();
			terms.push(value);
		} else {
			if ((flag !== "--sha256" && flag !== "--limit") || fields.has(flag))
				invalidArguments();
			fields.set(flag, value);
		}
	}
	const sha256 = fields.get("--sha256");
	const limit = fields.get("--limit") ?? "20";
	if (
		sha256 === undefined ||
		!/^[a-fA-F0-9]{64}$/.test(sha256) ||
		!terms.length ||
		!/^(?:[1-9][0-9]?|100)$/.test(limit)
	)
		invalidArguments();
	return { sha256: sha256.toLowerCase(), terms, limit: Number(limit) };
}

interface CapturedAsset {
	url: string;
	sha256: string;
	decodedBytes: number;
	payloadSha256: string;
	payload: Uint8Array;
}

function record(
	value: unknown,
	keys?: readonly string[],
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw failure("invalid-input");
	const result = value as Record<string, unknown>;
	if (
		keys &&
		(Object.keys(result).length !== keys.length ||
			!keys.every((key) => Object.hasOwn(result, key)))
	)
		throw failure("invalid-input");
	return result;
}

function parseJson(source: string, checkpoint: () => void): unknown {
	selectJsonSourceSpans(source, [""], { checkpoint });
	checkpoint();
	return JSON.parse(source);
}

function publicUrl(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length > 4096 ||
		/[\p{Cc}\p{Cf}]/u.test(value)
	)
		throw failure("invalid-input");
	let url: URL;
	try {
		url = new NetworkPolicy().checkUrl(value);
	} catch {
		throw failure("invalid-input");
	}
	if (
		url.protocol !== "https:" ||
		url.href !== value ||
		url.search ||
		url.hash ||
		url.username ||
		url.password ||
		!url.hostname.includes(".")
	)
		throw failure("invalid-input");
	return value;
}

function assetHash(value: unknown): string {
	if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
		throw failure("invalid-input");
	return value;
}

function queryBundle(
	source: string,
	options: ResearchPagefindArguments,
	checkpoint: () => void,
) {
	const bundle = record(parseJson(source, checkpoint), [
		"version",
		"metadata",
		"chunks",
		"fragments",
	]);
	if (bundle.version !== 1) throw failure("unsupported");
	if (
		!Array.isArray(bundle.chunks) ||
		!Array.isArray(bundle.fragments) ||
		!bundle.chunks.length
	)
		throw failure("invalid-input");
	if (bundle.chunks.length > 16 || bundle.fragments.length > 100)
		throw failure("resource-limit");
	let rawBytes = 0;
	let payloadBytes = 0;
	const owned: Uint8Array[] = [];
	const admit = (value: Record<string, unknown>): CapturedAsset => {
		checkpoint();
		const url = publicUrl(value.url);
		if (typeof value.data !== "string" || !value.data.length)
			throw failure("invalid-input");
		if (
			value.data.length >
			Math.ceil(researchPagefindCliLimits.maxInputBytes / 3) * 4
		)
			throw failure("resource-limit");
		const bytes = Buffer.from(value.data, "base64");
		owned.push(bytes);
		if (bytes.toString("base64") !== value.data) throw failure("invalid-input");
		rawBytes += bytes.length;
		if (rawBytes > researchPagefindCliLimits.maxInputBytes)
			throw failure("resource-limit");
		const signature = Buffer.from("pagefind_dcd", "ascii");
		let decoded: Buffer = bytes;
		if (!bytes.subarray(0, 12).equals(signature)) {
			try {
				decoded = gunzipSync(bytes, {
					maxOutputLength:
						researchPagefindCliLimits.maxInputBytes - payloadBytes + 12,
				});
				owned.push(decoded);
			} catch (error) {
				throw failure(
					error &&
						typeof error === "object" &&
						"code" in error &&
						error.code === "ERR_BUFFER_TOO_LARGE"
						? "resource-limit"
						: "invalid-input",
				);
			}
		}
		checkpoint();
		if (!decoded.subarray(0, 12).equals(signature) || decoded.length === 12)
			throw failure("invalid-input");
		const payload = decoded.subarray(12);
		payloadBytes += payload.length;
		if (payloadBytes > researchPagefindCliLimits.maxInputBytes)
			throw failure("resource-limit");
		return {
			url,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			decodedBytes: bytes.length,
			payloadSha256: createHash("sha256").update(payload).digest("hex"),
			payload,
		};
	};
	const identity = ({
		url,
		sha256,
		decodedBytes,
		payloadSha256,
	}: CapturedAsset) => ({ url, sha256, decodedBytes, payloadSha256 });
	try {
		const metadata = admit(record(bundle.metadata, ["url", "data"]));
		if (!/\/pagefind\.[A-Za-z0-9_-]{1,128}\.pf_meta$/.test(metadata.url))
			throw failure("invalid-input");
		const base = new URL(".", metadata.url);
		const chunks = bundle.chunks.map((value) => {
			const input = record(value, ["hash", "url", "data"]);
			const hash = assetHash(input.hash);
			if (input.url !== new URL(`index/${hash}.pf_index`, base).href)
				throw failure("invalid-input");
			return { hash, asset: admit(input) };
		});
		const query = searchPagefindSource(
			metadata.payload,
			chunks.map(({ hash, asset }) => ({ hash, bytes: asset.payload })),
			options.terms,
			{ limit: options.limit, checkpoint },
		);
		const fragments = new Map<
			string,
			{
				reportedUrl: string;
				title: string;
				content: string;
				wordCount: number;
				source: ReturnType<typeof identity>;
			}
		>();
		for (const value of bundle.fragments) {
			const input = record(value, ["hash", "url", "data"]);
			const hash = assetHash(input.hash);
			if (
				fragments.has(hash) ||
				input.url !== new URL(`fragment/${hash}.pf_fragment`, base).href
			)
				throw failure("invalid-input");
			const asset = admit(input);
			const text = new TextDecoder("utf-8", {
				fatal: true,
				ignoreBOM: true,
			}).decode(asset.payload);
			const fragment = record(parseJson(text, checkpoint));
			const meta = record(fragment.meta);
			const title = meta.title ?? "";
			if (
				typeof fragment.url !== "string" ||
				fragment.url.length > 4096 ||
				/[\p{Cc}\p{Cf}]/u.test(fragment.url) ||
				typeof fragment.content !== "string" ||
				typeof title !== "string" ||
				typeof fragment.word_count !== "number" ||
				!Number.isSafeInteger(fragment.word_count) ||
				fragment.word_count < 0
			)
				throw failure("invalid-input");
			const reported = new URL(fragment.url, base);
			if (
				reported.protocol !== "https:" ||
				reported.origin !== base.origin ||
				reported.username ||
				reported.password
			)
				throw failure("invalid-input");
			if (fragment.filters !== undefined) record(fragment.filters);
			if (fragment.anchors !== undefined && !Array.isArray(fragment.anchors))
				throw failure("invalid-input");
			fragments.set(hash, {
				reportedUrl: fragment.url,
				title,
				content: fragment.content,
				wordCount: fragment.word_count,
				source: identity(asset),
			});
		}
		const results = query.results.map((result) => {
			checkpoint();
			const fragment = fragments.get(result.fragmentHash);
			if (!fragment) return result;
			if (fragment.wordCount !== result.wordCount)
				throw failure("invalid-input");
			return { ...result, fragment };
		});
		return {
			query: { ...query, results },
			assets: {
				metadata: identity(metadata),
				chunks: chunks.map(({ hash, asset }) => ({ hash, ...identity(asset) })),
				fragments: [...fragments].map(([hash, fragment]) => ({
					hash,
					...fragment.source,
				})),
			},
		};
	} finally {
		for (const bytes of owned) bytes.fill(0);
	}
}

function failure(code: AgentBrowserError["code"]): AgentBrowserError {
	return new AgentBrowserError(code, "Research Pagefind operation failed");
}

function cancellation(signal: AbortSignal): AgentBrowserError {
	return failure(
		signal.reason instanceof AgentBrowserError ? signal.reason.code : "aborted",
	);
}

function readBody(
	input: Readable,
	owned: Buffer,
	signal: AbortSignal,
	checkpoint: () => void,
): Promise<number> {
	return new Promise((resolve, reject) => {
		let bytes = 0;
		let chunks = 0;
		let settled = false;
		const finish = (error?: AgentBrowserError) => {
			if (settled) return;
			settled = true;
			input.pause();
			input.off("data", onData);
			input.off("end", onEnd);
			input.off("error", onError);
			input.off("close", onClose);
			signal.removeEventListener("abort", onAbort);
			if (error) reject(error);
			else resolve(bytes);
		};
		const onData = (chunk: unknown) => {
			try {
				checkpoint();
				if (!types.isUint8Array(chunk) || !types.isArrayBuffer(chunk.buffer)) {
					finish(failure("invalid-input"));
					return;
				}
				if (
					++chunks > researchPagefindCliLimits.maxInputChunks ||
					chunk.byteLength > owned.byteLength - bytes
				) {
					finish(failure("resource-limit"));
					return;
				}
				owned.set(chunk, bytes);
				bytes += chunk.byteLength;
			} catch (error) {
				finish(
					failure(
						error instanceof AgentBrowserError ? error.code : "invalid-input",
					),
				);
			}
		};
		const onEnd = () => finish();
		const onError = () => finish(failure("closed"));
		const onClose = () => finish(failure("closed"));
		const onAbort = () => finish(cancellation(signal));
		input.once("end", onEnd);
		input.once("error", onError);
		input.once("close", onClose);
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
		else if (input.errored || input.destroyed) onClose();
		else if (input.readableEnded) onEnd();
		else {
			input.on("data", onData);
			if (!settled) input.resume();
		}
	});
}

export async function runResearchPagefindCli(
	args: readonly string[],
	input: Readable,
	output: Writable,
	signal?: AbortSignal,
): Promise<number> {
	const options =
		Array.isArray(args) && args.length === 1 && args[0] === "--help"
			? undefined
			: parseResearchPagefindArguments(args);
	const controller = new AbortController();
	const started = performance.now();
	const abort = () => controller.abort(failure("aborted"));
	const timeout = () => controller.abort(failure("timeout"));
	const outputError = () => controller.abort(failure("closed"));
	const checkpoint = () => {
		if (performance.now() - started >= researchPagefindCliLimits.timeoutMs)
			timeout();
		if (controller.signal.aborted) throw cancellation(controller.signal);
	};
	const timer = setTimeout(timeout, researchPagefindCliLimits.timeoutMs);
	let owned: Buffer | undefined;
	signal?.addEventListener("abort", abort, { once: true });
	output.on("error", outputError);
	output.on("close", outputError);
	output.on("finish", outputError);
	try {
		if (signal?.aborted) abort();
		checkpoint();
		if (output.destroyed || output.writableEnded || output.errored)
			throw failure("closed");
		if (!options) {
			await writeResearchOutput(output, usage, controller.signal, {
				closed: () => failure("closed"),
				aborted: cancellation,
			});
			checkpoint();
			return 0;
		}
		owned = Buffer.alloc(researchPagefindCliLimits.maxInputBytes);
		const bytes = await readBody(input, owned, controller.signal, checkpoint);
		checkpoint();
		const body = owned.subarray(0, bytes);
		const digest = createHash("sha256").update(body).digest("hex");
		checkpoint();
		if (digest !== options.sha256) throw failure("invalid-input");
		const source = new TextDecoder("utf-8", {
			fatal: true,
			ignoreBOM: true,
		}).decode(body);
		owned.fill(0);
		checkpoint();
		const result = queryBundle(source, options, checkpoint);
		checkpoint();
		const jsonl = `${JSON.stringify({
			kind: "pagefind-source-research-v1",
			partial: true,
			rendered: false,
			verified: false,
			source: { sha256: digest, decodedBytes: bytes },
			...result,
			networkRequests: 0,
		})}\n`;

		if (Buffer.byteLength(jsonl) > researchPagefindCliLimits.maxOutputBytes)
			throw failure("resource-limit");
		checkpoint();
		await writeResearchOutput(output, jsonl, controller.signal, {
			closed: () => failure("closed"),
			aborted: cancellation,
		});
		checkpoint();
		return 0;
	} catch (error) {
		throw failure(
			error instanceof AgentBrowserError ? error.code : "invalid-input",
		);
	} finally {
		owned?.fill(0);
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
		output.off("error", outputError);
		output.off("close", outputError);
		output.off("finish", outputError);
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
	if (!(args.length === 1 && args[0] === "--help")) {
		try {
			parseResearchPagefindArguments(args);
		} catch {
			exitResearchCliFailure(64, usage);
			return;
		}
	}
	try {
		process.exitCode = await runResearchPagefindCli(
			args,
			process.stdin,
			process.stdout,
		);
	} catch {
		exitResearchCliFailure(
			1,
			"Research Pagefind failed; no network fallback was attempted.\n",
		);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	void main().catch(() => {
		exitResearchCliFailure(
			1,
			"Research Pagefind failed; no network fallback was attempted.\n",
		);
	});
