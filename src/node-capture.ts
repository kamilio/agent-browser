import { randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { link, lstat, open, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
	validateCaptureArtifact,
	validatePdfArtifact,
	validateTraceArtifact,
} from "./capture-artifacts.js";
import {
	type CaptureExecutor,
	readCapture,
	readPdf,
	readTrace,
} from "./capture-client.js";
import type { Invocation } from "./cli-parser.js";
import { AgentBrowserError } from "./errors.js";
import {
	assertPrivateFile,
	privateFileLocation,
	samePrivateFile,
} from "./node-private-files.js";

export async function saveCapture(
	invocation: Invocation,
	execute: CaptureExecutor,
	directory = process.cwd(),
) {
	const pdf = invocation.command === "pdf";
	const trace = invocation.command === "tracing-stop";
	const extension = trace ? "json" : pdf ? "pdf" : "png";
	const format = trace ? "JSON trace" : pdf ? "PDF" : "PNG";
	if (
		(!pdf && !trace && invocation.command !== "screenshot") ||
		Object.keys(invocation.options).some(
			(key) =>
				![
					"filename",
					...(pdf || trace ? [] : ["hires"]),
					"timeout",
					"json",
				].includes(key),
		)
	)
		throw new AgentBrowserError(
			"unsupported",
			`Unsupported ${invocation.command} client option`,
		);
	const requested = invocation.options.filename;
	if (
		requested !== undefined &&
		(typeof requested !== "string" ||
			requested.length > 4096 ||
			!requested.toLowerCase().endsWith(`.${extension}`) ||
			[...requested].some(
				(character) =>
					character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
			))
	)
		throw new AgentBrowserError(
			"invalid-input",
			`Capture filename must be a bounded ${format} file path`,
		);
	const filename = resolve(
		directory,
		requested === undefined
			? `agent-browser-${randomUUID()}.${extension}`
			: String(requested),
	);
	const temporary = resolve(
		dirname(filename),
		`.${basename(filename)}.${randomUUID()}.part`,
	);
	const argv = [invocation.command];
	if (invocation.options.hires !== undefined)
		argv.push(`--hires=${String(invocation.options.hires)}`);
	if (invocation.options.timeout !== undefined)
		argv.push(`--timeout=${String(invocation.options.timeout)}`);
	if (invocation.arguments.length) argv.push("--", ...invocation.arguments);
	const artifact = (
		trace
			? validateTraceArtifact
			: pdf
				? validatePdfArtifact
				: validateCaptureArtifact
	)((await execute(argv)).data);
	let file: Awaited<ReturnType<typeof open>> | undefined;
	let identity: BigIntStats | undefined;
	let released = false;
	let installed = false;
	let temporaryCleanupConfirmed = true;
	try {
		const target = await privateFileLocation(filename, "Capture");
		file = await open(
			temporary,
			constants.O_WRONLY |
				constants.O_CREAT |
				constants.O_EXCL |
				constants.O_NOFOLLOW,
			0o600,
		);
		identity = await file.stat({ bigint: true });
		assertPrivateFile(identity, target.uid, "Capture");
		await (trace ? readTrace : pdf ? readPdf : readCapture)(
			execute,
			artifact,
			async (bytes) => {
				if (!file)
					throw new AgentBrowserError("closed", "Capture output closed");
				let offset = 0;
				while (offset < bytes.length) {
					const result = await file.write(bytes, offset, bytes.length - offset);
					if (result.bytesWritten === 0)
						throw new AgentBrowserError(
							"network-error",
							"Capture file write made no progress",
						);
					offset += result.bytesWritten;
				}
			},
		);
		await file.sync();
		const ready = await file.stat({ bigint: true });
		assertPrivateFile(ready, target.uid, "Capture");
		if (
			!samePrivateFile(identity, ready) ||
			ready.size !== BigInt(artifact.bytes)
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Capture temporary file changed during write",
			);
		await file.close();
		file = undefined;
		await target.assertCurrent();
		const currentTemporary = await lstat(temporary, { bigint: true });
		assertPrivateFile(currentTemporary, target.uid, "Capture");
		if (
			!samePrivateFile(identity, currentTemporary) ||
			currentTemporary.size !== ready.size
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Capture temporary file was replaced",
			);
		await link(temporary, filename);
		installed = true;
	} catch (error) {
		if (error instanceof AgentBrowserError) {
			if (trace)
				throw new AgentBrowserError(
					error.code,
					`${error.message}; trace artifact retained as ${artifact.id}`,
				);
			throw error;
		}
		const code = (error as NodeJS.ErrnoException).code;
		throw new AgentBrowserError(
			code === "EEXIST" ? "policy-denied" : "network-error",
			code === "EEXIST"
				? `Capture destination already exists; refusing to replace it${trace ? `; trace artifact retained as ${artifact.id}` : ""}`
				: `Cannot save ${format} capture${code ? ` (${code})` : ""}${trace ? `; trace artifact retained as ${artifact.id}` : ""}`,
		);
	} finally {
		await file?.close().catch(() => {});
		if (identity) {
			try {
				const current = await lstat(temporary, { bigint: true });
				if (samePrivateFile(identity, current) && current.isFile())
					await unlink(temporary);
				else temporaryCleanupConfirmed = false;
			} catch (error) {
				temporaryCleanupConfirmed =
					(error as NodeJS.ErrnoException).code === "ENOENT";
			}
		}
		if (!trace || installed) {
			try {
				await execute(["artifact-delete", artifact.id]);
				released = true;
			} catch {}
		}
	}
	return {
		filename,
		artifact,
		remoteCleanupConfirmed: released,
		temporaryCleanupConfirmed,
	};
}
