import { createHash } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { types } from "node:util";
import { AgentBrowserError } from "../src/errors.js";
import { NetworkPolicy } from "../src/network.js";
import { searchSourceIndex } from "../src/source-search-index.js";

export const researchSourceIndexCliLimits = Object.freeze({
	maxInputBytes: 2_000_000,
	maxLongInputBytes: 4_000_000,
	maxInputChunks: 65_536,
	maxOutputBytes: 256_000,
	maxArgumentCount: 26,
	maxArgumentCodeUnits: 8192,
	maxContentTypeCodeUnits: 1024,
	maxTerms: 8,
	maxTermCodeUnits: 128,
	maxLimit: 100,
	defaultLimit: 20,
	timeoutMs: 30_000,
	failureExitTimeoutMs: 100,
});

const usage =
	"Usage: research-source-index --url HTTPS_URL --content-type JS_MIME --sha256 HEX --term TERM [--term TERM ...] [--profile default|long-v1] [--limit 1..100] < body.js\nStdin is a bounded captured response body, not proof of successful HTTP retrieval. Output is unverified, source-only literal-term search; no network, navigation, rendering, or script execution occurs.\n";

export interface ResearchSourceIndexArguments {
	url: string;
	contentType: string;
	sha256: string;
	terms: readonly string[];
	profile: "default" | "long-v1";
	limit: number;
}

function invalidArguments(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid research source index arguments",
	);
}

export function parseResearchSourceIndexArguments(
	args: readonly string[],
): ResearchSourceIndexArguments {
	if (
		!Array.isArray(args) ||
		args.length < 8 ||
		args.length > researchSourceIndexCliLimits.maxArgumentCount ||
		args.length % 2 !== 0
	)
		invalidArguments();
	const flags = new Set([
		"--url",
		"--content-type",
		"--sha256",
		"--term",
		"--profile",
		"--limit",
	]);
	const fields = new Map<string, string>();
	const terms: string[] = [];
	for (let index = 0; index < args.length; index += 2) {
		const flag = args[index];
		const value = args[index + 1];
		if (
			typeof flag !== "string" ||
			typeof value !== "string" ||
			flag.length > researchSourceIndexCliLimits.maxArgumentCodeUnits ||
			value.length > researchSourceIndexCliLimits.maxArgumentCodeUnits ||
			/[\p{Cc}\p{Cf}]/u.test(value) ||
			!flags.has(flag)
		)
			invalidArguments();
		if (flag === "--term") {
			if (
				!value.length ||
				value.length > researchSourceIndexCliLimits.maxTermCodeUnits ||
				terms.length >= researchSourceIndexCliLimits.maxTerms
			)
				invalidArguments();
			terms.push(value);
		} else {
			if (fields.has(flag)) invalidArguments();
			fields.set(flag, value);
		}
	}
	const url = fields.get("--url");
	const contentType = fields.get("--content-type");
	const sha256 = fields.get("--sha256");
	const profile = fields.get("--profile") ?? "default";
	const limitText = fields.get("--limit") ?? "20";
	if (
		url === undefined ||
		contentType === undefined ||
		sha256 === undefined ||
		terms.length === 0 ||
		(profile !== "default" && profile !== "long-v1") ||
		!/^(?:[1-9][0-9]?|100)$/.test(limitText) ||
		!/^[a-fA-F0-9]{64}$/.test(sha256) ||
		contentType.length > researchSourceIndexCliLimits.maxContentTypeCodeUnits ||
		!/^ *(?:application|text)\/javascript *(?:; *charset *= *(?:utf-?8|"utf-?8") *)?$/i.test(
			contentType,
		)
	)
		invalidArguments();
	try {
		const parsed = new NetworkPolicy().checkUrl(url);
		if (
			parsed.protocol !== "https:" ||
			parsed.href !== url ||
			url.includes("?") ||
			url.includes("#") ||
			(!parsed.hostname.includes(".") && !parsed.hostname.startsWith("["))
		)
			invalidArguments();
	} catch {
		invalidArguments();
	}
	return {
		url,
		contentType,
		sha256: sha256.toLowerCase(),
		terms,
		profile,
		limit: Number(limitText),
	};
}

function failure(code: AgentBrowserError["code"]): AgentBrowserError {
	return new AgentBrowserError(code, "Research source index operation failed");
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
					++chunks > researchSourceIndexCliLimits.maxInputChunks ||
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

function writeRecord(
	output: Writable,
	text: string,
	signal: AbortSignal,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let returned = false;
		let acknowledged = false;
		let drained = false;
		let needsDrain = false;
		let callbackPending = false;
		let writeFailure: ReturnType<typeof setImmediate> | undefined;
		let lateRelease: ReturnType<typeof setImmediate> | undefined;
		let releaseGuard: (() => void) | undefined;
		const protectPendingWrite = () => {
			const release = () => {
				if (lateRelease) clearImmediate(lateRelease);
				output.off("error", onLateError);
				output.off("close", release);
				releaseGuard = undefined;
			};
			const onLateError = () => {
				if (!callbackPending) release();
			};
			releaseGuard = release;
			output.on("error", onLateError);
			output.once("close", release);
		};
		const releaseAfterErrorDelivery = () => {
			lateRelease = setImmediate(() => {
				if (!output.destroyed || output.closed) releaseGuard?.();
			});
		};
		const finish = (error?: AgentBrowserError) => {
			if (settled) return;
			if (!error && (!returned || !acknowledged || (needsDrain && !drained)))
				return;
			settled = true;
			if (error && (callbackPending || writeFailure) && !output.closed) {
				protectPendingWrite();
				if (!callbackPending) releaseAfterErrorDelivery();
			}
			if (writeFailure) clearImmediate(writeFailure);
			output.off("error", onError);
			output.off("close", onError);
			output.off("finish", onError);
			output.off("drain", onDrain);
			signal.removeEventListener("abort", onAbort);
			if (error) reject(error);
			else resolve();
		};
		const onError = () => finish(failure("closed"));
		const onAbort = () => finish(cancellation(signal));
		const onDrain = () => {
			drained = true;
			finish();
		};
		output.on("error", onError);
		output.on("close", onError);
		output.on("finish", onError);
		output.on("drain", onDrain);
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
		else if (output.destroyed || output.writableEnded || output.errored)
			onError();
		else {
			try {
				callbackPending = true;
				needsDrain = !output.write(text, (error) => {
					callbackPending = false;
					if (settled) {
						if (error && releaseGuard) {
							releaseAfterErrorDelivery();
						} else releaseGuard?.();
						return;
					}
					if (error) {
						writeFailure = setImmediate(onError);
						return;
					}
					acknowledged = true;
					finish();
				});
				returned = true;
				finish();
			} catch {
				callbackPending = false;
				onError();
			}
		}
	});
}

export async function runResearchSourceIndexCli(
	args: readonly string[],
	input: Readable,
	output: Writable,
	signal?: AbortSignal,
): Promise<number> {
	const options =
		Array.isArray(args) && args.length === 1 && args[0] === "--help"
			? undefined
			: parseResearchSourceIndexArguments(args);
	const controller = new AbortController();
	const started = performance.now();
	const abort = () => controller.abort(failure("aborted"));
	const timeout = () => controller.abort(failure("timeout"));
	const outputError = () => controller.abort(failure("closed"));
	const checkpoint = () => {
		if (performance.now() - started >= researchSourceIndexCliLimits.timeoutMs)
			timeout();
		if (controller.signal.aborted) throw cancellation(controller.signal);
	};
	const timer = setTimeout(timeout, researchSourceIndexCliLimits.timeoutMs);
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
			await writeRecord(output, usage, controller.signal);
			checkpoint();
			return 0;
		}
		owned = Buffer.alloc(
			options.profile === "long-v1"
				? researchSourceIndexCliLimits.maxLongInputBytes
				: researchSourceIndexCliLimits.maxInputBytes,
		);
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
		const query = searchSourceIndex(source, options.terms, {
			profile: options.profile,
			limit: options.limit,
			checkpoint,
		});
		checkpoint();
		const jsonl = `${JSON.stringify({
			kind: "source-index-research-v1",
			partial: true,
			rendered: false,
			verified: false,
			scope: "source-index",
			source: {
				url: options.url,
				contentType: options.contentType,
				sha256: digest,
				decodedBytes: bytes,
			},
			query,
			networkRequests: 0,
		})}\n`;
		if (Buffer.byteLength(jsonl) > researchSourceIndexCliLimits.maxOutputBytes)
			throw failure("resource-limit");
		checkpoint();
		await writeRecord(output, jsonl, controller.signal);
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

function exitCli(code: number, message: string): void {
	const fallback = setTimeout(
		() => process.exit(code),
		researchSourceIndexCliLimits.failureExitTimeoutMs,
	);
	process.stdin.destroy();
	process.stdout.destroy();
	process.stderr.write(message, () => {
		clearTimeout(fallback);
		process.exit(code);
	});
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
			parseResearchSourceIndexArguments(args);
		} catch {
			exitCli(64, usage);
			return;
		}
	}
	try {
		process.exitCode = await runResearchSourceIndexCli(
			args,
			process.stdin,
			process.stdout,
		);
	} catch {
		exitCli(
			1,
			"Research source index failed; no network fallback was attempted.\n",
		);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	void main().catch(() => {
		process.exit(1);
	});
