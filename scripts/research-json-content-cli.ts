import type { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { AgentBrowserError } from "../src/errors.js";
import {
	parseResearchJsonContentArguments,
	researchJsonContent,
	researchJsonContentLimits,
} from "./research-json-content.js";

const usage =
	"Usage: research-json-content-cli --script-id ID --json-pointer POINTER HTTPS_URL (an empty POINTER selects the root JSON value)";

function outputUnavailable(output: Writable): boolean {
	return (
		output.destroyed ||
		output.closed ||
		output.writableEnded ||
		output.writableFinished ||
		!output.writable ||
		!!output.errored
	);
}

function outputFailure(): AgentBrowserError {
	return new AgentBrowserError("closed", "Research JSON content output failed");
}

function guardCallbackError(output: Writable): void {
	const cleanup = () => {
		clearImmediate(turn);
		output.off("error", cleanup);
	};
	const turn = setImmediate(cleanup);
	output.once("error", cleanup);
}

function writeRecord(
	output: Writable,
	text: string,
	controller: AbortController,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let returned = false;
		let callbackDone = false;
		let needsDrain = false;
		let drained = false;
		const finish = (error?: unknown) => {
			if (settled) return;
			settled = true;
			output.off("error", onError);
			output.off("close", onError);
			output.off("finish", onError);
			output.off("drain", onDrain);
			controller.signal.removeEventListener("abort", onAbort);
			if (error) reject(error);
			else resolve();
		};
		const complete = () => {
			if (returned && callbackDone && (!needsDrain || drained)) finish();
		};
		const onAbort = () => finish(controller.signal.reason);
		const onError = () => {
			controller.abort(outputFailure());
			onAbort();
		};
		const onDrain = () => {
			drained = true;
			complete();
		};
		output.on("error", onError);
		output.on("close", onError);
		output.on("finish", onError);
		output.on("drain", onDrain);
		controller.signal.addEventListener("abort", onAbort, { once: true });
		if (controller.signal.aborted) onAbort();
		else if (outputUnavailable(output)) onError();
		else {
			try {
				needsDrain = !output.write(text, (error) => {
					callbackDone = true;
					if (error) {
						guardCallbackError(output);
						onError();
					} else complete();
				});
				returned = true;
				complete();
			} catch {
				guardCallbackError(output);
				onError();
			}
		}
	});
}

export async function runResearchJsonContentCli(
	args: readonly string[],
	output: Writable,
	signal?: AbortSignal,
): Promise<number> {
	const help = Array.isArray(args) && args.length === 1 && args[0] === "--help";
	try {
		if (!help) parseResearchJsonContentArguments(args);
	} catch {
		return 1;
	}
	const controller = new AbortController();
	const started = performance.now();
	const abort = () =>
		controller.abort(
			new AgentBrowserError("aborted", "Research JSON content aborted"),
		);
	const timeout = () =>
		controller.abort(
			new AgentBrowserError("timeout", "Research JSON content timed out"),
		);
	const outputError = () => controller.abort(outputFailure());
	const checkpoint = () => {
		if (performance.now() - started >= researchJsonContentLimits.timeoutMs)
			timeout();
		if (outputUnavailable(output)) outputError();
		if (controller.signal.aborted) throw controller.signal.reason;
	};
	const timer = setTimeout(timeout, researchJsonContentLimits.timeoutMs);
	signal?.addEventListener("abort", abort, { once: true });
	output.on("error", outputError);
	output.on("close", outputError);
	output.on("finish", outputError);
	let writing = false;
	try {
		if (signal?.aborted) abort();
		checkpoint();
		const report = help
			? { kind: "native-research-json-content-help-v1", usage }
			: await researchJsonContent(args, controller.signal);
		checkpoint();
		const jsonl = `${JSON.stringify(report)}\n`;
		if (
			Buffer.byteLength(jsonl, "utf8") >
			researchJsonContentLimits.maxOutputBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Research JSON content output limit exceeded",
			);
		checkpoint();
		writing = true;
		await writeRecord(output, jsonl, controller);
		await new Promise<void>((resolve) => setImmediate(resolve));
		writing = false;
		checkpoint();
		return help ||
			("outcome" in report && report.outcome === "source-extracted-unverified")
			? 0
			: 1;
	} catch {
		if (!controller.signal.aborted)
			controller.abort(
				new AgentBrowserError("aborted", "Research JSON content failed"),
			);
		return 1;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
		if (writing) await new Promise<void>((resolve) => setImmediate(resolve));
		output.off("error", outputError);
		output.off("close", outputError);
		output.off("finish", outputError);
	}
}

async function diagnostic(): Promise<void> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(outputFailure()), 1000);
	try {
		await writeRecord(
			process.stderr,
			"Research JSON content failed; no retry or fallback was attempted.\n",
			controller,
		);
	} catch {
		process.exitCode = 1;
	} finally {
		clearTimeout(timer);
	}
}

async function main(): Promise<void> {
	const controller = new AbortController();
	const abort = () => controller.abort();
	process.on("SIGINT", abort);
	process.on("SIGTERM", abort);
	try {
		process.exitCode = await runResearchJsonContentCli(
			process.argv.slice(2),
			process.stdout,
			controller.signal,
		);
		if (process.exitCode !== 0) await diagnostic();
	} catch {
		process.exitCode = 1;
		await diagnostic();
	} finally {
		process.off("SIGINT", abort);
		process.off("SIGTERM", abort);
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	void main();
}
