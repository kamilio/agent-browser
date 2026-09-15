import type { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { AgentBrowserError } from "../src/errors.js";
import { researchLongDocumentAdmission } from "../src/research-admission.js";
import { validateSelectorSyntax } from "../src/selectors.js";
import type { TrustedResearchReplayAdmission } from "./research-admission-evidence.js";
import { researchBodyCaptureLimit } from "./research-body-capture.js";
import {
	type ResearchJsonReplayExtraction,
	type ResearchJsonReplaySelection,
	type ResearchReplayFormat,
	extractResearchReplayJson,
	outlineResearchOutputLimitCapture,
	recoverResearchOutputLimitSection,
	researchJsonReplayLimits,
} from "./research-json-replay.js";

export const researchReplayCliLimits = Object.freeze({
	maxReceiptBytes: researchLongDocumentAdmission.evidence.maxReceiptBytes,
	maxInputChunks: 65_536,
	timeoutMs: 30_000,
});

const usage =
	"Usage: research-replay-cli --expected-profile default|long-v1 --receipt-sha256 HEX --body-sha256 HEX --body-bytes N (--selector CSS | --section CSS | --links TEXT | --headings | --find QUERY | --lines START:END) [--format json|markdown] [--table-metadata] [--table-rows] [--recover-output-limit] < receipt.jsonl\nRecovery requires the default profile and one explicit --section or --headings. Markdown requires selector/section extraction without table metadata or literal --lines extraction. Table rows require explicit Markdown. Headings require recovery and do not accept table metadata. Text modes require the default profile, without table flags or recovery. Find is literal, case-sensitive, preserves spaces, accepts 1..256 UTF-16 code units without CR/LF, and requires JSON. Lines use canonical positive decimal integers (no leading zeros), START <= END <= 2000001, and accept JSON or Markdown.\n";

function invalidArguments(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid research replay arguments",
	);
}

export function parseResearchReplayArguments(args: readonly string[]): {
	trusted: TrustedResearchReplayAdmission;
	selection: ResearchJsonReplaySelection | { headings: true };
	recoverOutputLimit?: true;
	format?: ResearchReplayFormat;
} {
	if (
		!Array.isArray(args) ||
		args.length > 14 ||
		args.some((value) => typeof value !== "string" || value.length > 4096)
	)
		invalidArguments();
	const fields = new Map<string, string>();
	let tableMetadata = false;
	let tableRows = false;
	let recoverOutputLimit = false;
	let headings = false;
	const valueFlags = new Set([
		"--expected-profile",
		"--receipt-sha256",
		"--body-sha256",
		"--body-bytes",
		"--selector",
		"--section",
		"--links",
		"--find",
		"--lines",
		"--format",
	]);
	for (let index = 0; index < args.length; index++) {
		const flag = args[index];
		if (flag === "--table-metadata" && !tableMetadata) {
			tableMetadata = true;
			continue;
		}
		if (flag === "--table-rows" && !tableRows) {
			tableRows = true;
			continue;
		}
		if (flag === "--recover-output-limit" && !recoverOutputLimit) {
			recoverOutputLimit = true;
			continue;
		}
		if (flag === "--headings" && !headings) {
			headings = true;
			continue;
		}
		if (!valueFlags.has(flag) || fields.has(flag)) invalidArguments();
		const value = args[++index];
		if (value === undefined) invalidArguments();
		fields.set(flag, value);
	}
	const profile = fields.get("--expected-profile");
	const format = fields.get("--format");
	if (tableRows && format !== "markdown") invalidArguments();
	const receiptSha256 = fields.get("--receipt-sha256");
	const bodySha256 = fields.get("--body-sha256");
	const bodyBytes = fields.get("--body-bytes");
	if (
		(format !== undefined && format !== "json" && format !== "markdown") ||
		(profile !== "default" && profile !== "long-v1") ||
		typeof receiptSha256 !== "string" ||
		!/^[a-f0-9]{64}$/.test(receiptSha256) ||
		typeof bodySha256 !== "string" ||
		!/^[a-f0-9]{64}$/.test(bodySha256) ||
		typeof bodyBytes !== "string" ||
		!/^(?:0|[1-9][0-9]{0,6})$/.test(bodyBytes)
	)
		invalidArguments();
	const cap =
		profile === "long-v1"
			? researchLongDocumentAdmission.maxCaptureBytes
			: researchBodyCaptureLimit;
	if (Number(bodyBytes) > cap) invalidArguments();
	const modes = [
		"--selector",
		"--section",
		"--links",
		"--find",
		"--lines",
	].filter((flag) => fields.has(flag));
	if (modes.length + Number(headings) !== 1) invalidArguments();
	if (
		format === "markdown" &&
		(headings || tableMetadata || modes[0] === "--links")
	)
		invalidArguments();
	const trusted: TrustedResearchReplayAdmission = {
		expectedProfile: profile,
		expectedReceiptSha256: receiptSha256,
		expectedBody: { bytes: Number(bodyBytes), sha256: bodySha256 },
	};
	if (headings) {
		if (!recoverOutputLimit || profile !== "default" || tableMetadata)
			invalidArguments();
		return {
			trusted,
			recoverOutputLimit: true,
			selection: { headings: true },
			...(format === undefined ? {} : { format }),
		};
	}
	const mode = modes[0];
	if (recoverOutputLimit && (profile !== "default" || mode !== "--section"))
		invalidArguments();
	const target = fields.get(mode);
	if (mode === "--find" || mode === "--lines") {
		if (profile !== "default" || tableMetadata || tableRows || !target)
			invalidArguments();
		let selection: ResearchJsonReplaySelection;
		if (mode === "--find") {
			if (format === "markdown" || target.length > 256 || /[\r\n]/.test(target))
				invalidArguments();
			selection = { find: target };
		} else {
			const range = /^([1-9][0-9]{0,6}):([1-9][0-9]{0,6})$/.exec(target);
			if (!range || range[0] !== target) invalidArguments();
			const start = Number(range[1]);
			const end = Number(range[2]);
			if (end < start || end > 2_000_001) invalidArguments();
			selection = { lines: { start, end } };
		}
		return {
			trusted,
			selection,
			...(format === undefined ? {} : { format }),
		};
	}
	if (!target || target.trim() !== target) invalidArguments();
	if (mode === "--links") {
		if (
			tableMetadata ||
			target.length > 256 ||
			Array.from(target).some(
				(character) =>
					/\s/.test(character) ||
					character.charCodeAt(0) < 32 ||
					character.charCodeAt(0) === 127,
			)
		)
			invalidArguments();
	} else {
		try {
			validateSelectorSyntax(target, { pseudoElements: false });
		} catch {
			invalidArguments();
		}
	}
	const metadata = {
		...(tableMetadata ? { tableMetadata: true } : {}),
		...(tableRows ? { tableRows: true } : {}),
	};
	return {
		...(format === undefined ? {} : { format }),
		...(recoverOutputLimit ? { recoverOutputLimit: true as const } : {}),
		trusted,
		selection:
			mode === "--links"
				? { links: target }
				: mode === "--section"
					? { section: target, ...metadata }
					: { selector: target, ...metadata },
	};
}

function cancellation(signal: AbortSignal): AgentBrowserError {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Research replay aborted");
}

function stopStream(stream: Readable | Writable) {
	if (stream.closed) return;
	const ignoreError = () => undefined;
	const cleanup = () => stream.off("error", ignoreError);
	stream.on("error", ignoreError);
	stream.once("close", cleanup);
	stream.destroy();
}

function readReceipt(input: Readable, signal: AbortSignal): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let bytes = 0;
		let count = 0;
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
			try {
				if (error) reject(error);
				else resolve(Buffer.concat(chunks, bytes));
			} finally {
				for (const chunk of chunks) chunk.fill(0);
				chunks.length = 0;
			}
		};
		const onData = (chunk: unknown) => {
			if (!(chunk instanceof Uint8Array)) {
				finish(
					new AgentBrowserError(
						"invalid-input",
						"Research replay requires byte input",
					),
				);
				return;
			}
			if (
				++count > researchReplayCliLimits.maxInputChunks ||
				chunk.byteLength > researchReplayCliLimits.maxReceiptBytes - bytes
			) {
				finish(
					new AgentBrowserError(
						"resource-limit",
						"Research replay input limit exceeded",
					),
				);
				return;
			}
			bytes += chunk.byteLength;
			chunks.push(Buffer.from(chunk));
		};
		const onEnd = () => finish();
		const onError = () =>
			finish(new AgentBrowserError("closed", "Research replay input failed"));
		const onClose = () =>
			finish(new AgentBrowserError("closed", "Research replay input closed"));
		const onAbort = () => finish(cancellation(signal));
		input.on("data", onData);
		input.once("end", onEnd);
		input.once("error", onError);
		input.once("close", onClose);
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
		else if (input.errored || input.destroyed) onClose();
		else if (input.readableEnded) onEnd();
	});
}

function writeReplay(
	output: Writable,
	text: string,
	signal: AbortSignal,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (error?: AgentBrowserError) => {
			if (settled) return;
			settled = true;
			if (error) stopStream(output);
			output.off("error", onError);
			output.off("close", onClose);
			signal.removeEventListener("abort", onAbort);
			if (error) reject(error);
			else resolve();
		};
		const onError = () =>
			finish(new AgentBrowserError("closed", "Research replay output failed"));
		const onClose = () =>
			finish(new AgentBrowserError("closed", "Research replay output closed"));
		const onAbort = () => finish(cancellation(signal));
		output.on("error", onError);
		output.once("close", onClose);
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
		else if (output.destroyed || output.writableEnded || output.errored)
			onClose();
		else {
			try {
				output.write(text, (error) => (error ? onError() : finish()));
			} catch {
				onError();
			}
		}
	});
}

export async function runResearchReplayCli(
	args: readonly string[],
	input: Readable,
	output: Writable,
	signal?: AbortSignal,
): Promise<number> {
	const options = parseResearchReplayArguments(args);
	const controller = new AbortController();
	const started = performance.now();
	const abort = () =>
		controller.abort(
			new AgentBrowserError("aborted", "Research replay aborted"),
		);
	const timeout = () =>
		controller.abort(
			new AgentBrowserError("timeout", "Research replay timed out"),
		);
	const outputError = () =>
		controller.abort(
			new AgentBrowserError("closed", "Research replay output failed"),
		);
	const outputClose = () =>
		controller.abort(
			new AgentBrowserError("closed", "Research replay output closed"),
		);
	const checkpoint = () => {
		if (performance.now() - started >= researchReplayCliLimits.timeoutMs)
			timeout();
		if (controller.signal.aborted) throw cancellation(controller.signal);
	};
	const timer = setTimeout(timeout, researchReplayCliLimits.timeoutMs);
	signal?.addEventListener("abort", abort, { once: true });
	output.on("error", outputError);
	output.once("close", outputClose);
	let receipt: Buffer | undefined;
	let succeeded = false;
	try {
		if (signal?.aborted) abort();
		checkpoint();
		if (output.destroyed || output.writableEnded || output.errored)
			outputError();
		checkpoint();
		receipt = await readReceipt(input, controller.signal);
		checkpoint();
		let result: ResearchJsonReplayExtraction<ResearchReplayFormat>;
		if ("headings" in options.selection) {
			if (!options.recoverOutputLimit) invalidArguments();
			result = outlineResearchOutputLimitCapture(
				receipt,
				options.trusted,
				controller.signal,
			);
		} else if (options.recoverOutputLimit) {
			const section = options.selection.section;
			if (section === undefined) invalidArguments();
			result = recoverResearchOutputLimitSection(
				receipt,
				options.trusted,
				{
					section,
					...(options.selection.tableMetadata === undefined
						? {}
						: { tableMetadata: options.selection.tableMetadata }),
					...(options.selection.tableRows === undefined
						? {}
						: { tableRows: options.selection.tableRows }),
				},
				controller.signal,
				options.format ?? "json",
			);
		} else {
			result = extractResearchReplayJson(
				receipt,
				options.trusted,
				options.selection,
				controller.signal,
				options.format ?? "json",
			);
		}
		checkpoint();
		if (
			Buffer.byteLength(result.jsonl) > researchJsonReplayLimits.maxOutputBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Research replay output limit exceeded",
			);
		await writeReplay(output, result.jsonl, controller.signal);
		checkpoint();
		succeeded = true;
		return result.report.outcome === "extracted-unverified" ? 0 : 1;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
		receipt?.fill(0);
		if (!succeeded) {
			stopStream(input);
			stopStream(output);
		}
		output.off("error", outputError);
		output.off("close", outputClose);
	}
}

async function main() {
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
		parseResearchReplayArguments(args);
	} catch {
		process.stderr.write(usage);
		process.exitCode = 64;
		return;
	}
	try {
		process.exitCode = await runResearchReplayCli(
			args,
			process.stdin,
			process.stdout,
		);
	} catch {
		process.stderr.write(
			"Research replay failed; no retry or network fallback was attempted.\n",
		);
		process.exitCode = 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	void main().catch(() => {
		process.stderr.write("Research replay failed.\n");
		process.exitCode = 1;
	});
}
