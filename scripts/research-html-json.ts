import { createHash } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { types } from "node:util";
import { AgentBrowserError } from "../src/errors.js";
import {
	type HtmlJsonSourceSelection,
	htmlSourceJsonLimits,
	selectHtmlJsonSource,
} from "../src/html-source-json.js";
import {
	type HtmlJsonBindingSourceSelection,
	selectHtmlJsonBindingSource,
	validateHtmlJsonBindingSourceSelection,
} from "../src/html-source-json-binding.js";
import { validateJsonSourcePointer } from "../src/json-source-selection.js";
import { parseNetworkUrl } from "../src/network.js";
import { admitResearchHtmlSource } from "./research-source-input.js";
import {
	exitResearchCliFailure,
	writeResearchOutput,
} from "./research-stream-output.js";

export const researchHtmlJsonCliLimits = Object.freeze({
	maxInputBytes: 2_000_000,
	maxInputChunks: 65_536,
	maxOutputBytes: 256_000,
	timeoutMs: 30_000,
});

const usage =
	"Usage: research-html-json --url HTTPS_URL --content-type HTML_MIME --sha256 HEX --script-id ID --json-pointer POINTER [--binding IDENTIFIER] < body.html\nAn explicit empty --json-pointer '' selects the complete JSON value. Without --binding, the script must have application/json MIME. --binding explicitly selects an initial const JSON literal in a classic inline script, not its runtime value; trailing source is not evaluated. Stdin is a bounded raw HTML response body, not an HTTP-success receipt. Output is unverified lexical document-source JSON; no navigation, rendering, or script execution occurs.\n";

export interface ResearchHtmlJsonArguments {
	url: string;
	contentType: string;
	sha256: string;
	selection: HtmlJsonSourceSelection | HtmlJsonBindingSourceSelection;
}

function invalidArguments(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid research HTML JSON arguments",
	);
}

export function parseResearchHtmlJsonArguments(
	args: readonly string[],
): ResearchHtmlJsonArguments {
	if (
		!Array.isArray(args) ||
		(args.length !== 10 && args.length !== 12) ||
		args.some((value) => typeof value !== "string" || value.length > 8192)
	)
		invalidArguments();
	const flags = new Set([
		"--url",
		"--content-type",
		"--sha256",
		"--script-id",
		"--json-pointer",
		"--binding",
	]);
	const fields = new Map<string, string>();
	for (let index = 0; index < args.length; index += 2) {
		const flag = args[index];
		if (!flags.has(flag) || fields.has(flag)) invalidArguments();
		fields.set(flag, args[index + 1]);
	}
	const url = fields.get("--url");
	const contentType = fields.get("--content-type");
	const sha256 = fields.get("--sha256");
	const scriptId = fields.get("--script-id");
	const pointer = fields.get("--json-pointer");
	if (
		url === undefined ||
		contentType === undefined ||
		sha256 === undefined ||
		scriptId === undefined ||
		pointer === undefined
	)
		invalidArguments();
	try {
		const parsed = parseNetworkUrl(url);
		if (
			parsed.protocol !== "https:" ||
			parsed.href !== url ||
			url.includes("#")
		)
			invalidArguments();
		validateJsonSourcePointer(pointer);
	} catch {
		invalidArguments();
	}
	if (
		contentType.length > 1024 ||
		contentType.includes(",") ||
		/\p{Cc}/u.test(contentType) ||
		contentType.split(";", 1)[0].trim().toLowerCase() !== "text/html" ||
		!/^[a-fA-F0-9]{64}$/.test(sha256) ||
		scriptId.length === 0 ||
		scriptId.length > htmlSourceJsonLimits.maxScriptIdCodeUnits ||
		/[\s\p{Cc}\p{Cf}]/u.test(scriptId)
	)
		invalidArguments();
	const selection = fields.has("--binding")
		? validateHtmlJsonBindingSourceSelection({
				scriptId,
				binding: fields.get("--binding"),
				pointer,
			})
		: { scriptId, pointer };
	return {
		url,
		contentType,
		sha256: sha256.toLowerCase(),
		selection,
	};
}

function failure(code: AgentBrowserError["code"]): AgentBrowserError {
	return new AgentBrowserError(code, "Research HTML JSON operation failed");
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
				if (!types.isUint8Array(chunk) || !types.isArrayBuffer(chunk.buffer)) {
					finish(failure("invalid-input"));
					return;
				}
				if (
					++chunks > researchHtmlJsonCliLimits.maxInputChunks ||
					chunk.byteLength > owned.byteLength - bytes
				) {
					finish(failure("resource-limit"));
					return;
				}
				owned.set(chunk, bytes);
				bytes += chunk.byteLength;
			} catch {
				finish(failure("invalid-input"));
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

export async function runResearchHtmlJsonCli(
	args: readonly string[],
	input: Readable,
	output: Writable,
	signal?: AbortSignal,
): Promise<number> {
	const options =
		Array.isArray(args) && args.length === 1 && args[0] === "--help"
			? undefined
			: parseResearchHtmlJsonArguments(args);
	const controller = new AbortController();
	const started = performance.now();
	const abort = () => controller.abort(failure("aborted"));
	const timeout = () => controller.abort(failure("timeout"));
	const outputError = () => controller.abort(failure("closed"));
	const checkpoint = () => {
		if (performance.now() - started >= researchHtmlJsonCliLimits.timeoutMs)
			timeout();
		if (controller.signal.aborted) throw cancellation(controller.signal);
	};
	const timer = setTimeout(timeout, researchHtmlJsonCliLimits.timeoutMs);
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
		owned = Buffer.alloc(researchHtmlJsonCliLimits.maxInputBytes);
		const bytes = await readBody(input, owned, controller.signal);
		checkpoint();
		const body = owned.subarray(0, bytes);
		const digest = createHash("sha256").update(body).digest("hex");
		checkpoint();
		if (digest !== options.sha256) throw failure("invalid-input");
		const admitted = admitResearchHtmlSource(
			{ finalUrl: options.url, contentType: options.contentType, body },
			researchHtmlJsonCliLimits.maxInputBytes,
			htmlSourceJsonLimits.maxSourceCodeUnits,
			checkpoint,
		);
		owned.fill(0);
		const selected =
			"binding" in options.selection
				? selectHtmlJsonBindingSource(
						admitted.text,
						options.selection,
						checkpoint,
					)
				: selectHtmlJsonSource(admitted.text, options.selection, checkpoint);
		checkpoint();
		const jsonl = `${JSON.stringify({
			kind:
				"binding" in options.selection
					? "html-json-binding-source-selection-v1"
					: "html-json-source-selection-v1",
			partial: true,
			rendered: false,
			verified: false,
			scope: "document-source",
			source: admitted.identity,
			selection: selected.metadata,
			format: "json-source",
			content: selected.text,
			networkRequests: 0,
		})}\n`;
		if (Buffer.byteLength(jsonl) > researchHtmlJsonCliLimits.maxOutputBytes)
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
			parseResearchHtmlJsonArguments(args);
		} catch {
			exitResearchCliFailure(64, usage);
			return;
		}
	}
	try {
		process.exitCode = await runResearchHtmlJsonCli(
			args,
			process.stdin,
			process.stdout,
		);
	} catch {
		exitResearchCliFailure(
			1,
			"Research HTML JSON failed; no network fallback was attempted.\n",
		);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	void main().catch(() => {
		exitResearchCliFailure(
			1,
			"Research HTML JSON failed; no network fallback was attempted.\n",
		);
	});
