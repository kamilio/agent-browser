import { randomUUID } from "node:crypto";
import { link, lstat, open, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
	validateCaptureArtifact,
	validatePdfArtifact,
} from "./capture-artifacts.js";
import {
	type CaptureExecutor,
	readCapture,
	readPdf,
} from "./capture-client.js";
import type { Invocation } from "./cli-parser.js";
import { AgentBrowserError } from "./errors.js";

export async function saveCapture(
	invocation: Invocation,
	execute: CaptureExecutor,
	directory = process.cwd(),
) {
	const pdf = invocation.command === "pdf";
	const extension = pdf ? "pdf" : "png";
	const format = pdf ? "PDF" : "PNG";
	if (
		(!pdf && invocation.command !== "screenshot") ||
		Object.keys(invocation.options).some(
			(key) =>
				!["filename", ...(pdf ? [] : ["hires"]), "timeout", "json"].includes(
					key,
				),
		)
	)
		throw new AgentBrowserError(
			"unsupported",
			`Unsupported ${pdf ? "pdf" : "screenshot"} client option`,
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
	const artifact = (pdf ? validatePdfArtifact : validateCaptureArtifact)(
		(await execute(argv)).data,
	);
	let file: Awaited<ReturnType<typeof open>> | undefined;
	let identity: { dev: number; ino: number } | undefined;
	let released = false;
	try {
		file = await open(temporary, "wx", 0o600);
		identity = await file.stat();
		await (pdf ? readPdf : readCapture)(execute, artifact, async (bytes) => {
			if (!file) throw new AgentBrowserError("closed", "Capture output closed");
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
		});
		await file.sync();
		await file.close();
		file = undefined;
		await link(temporary, filename);
	} catch (error) {
		if (error instanceof AgentBrowserError) throw error;
		const code = (error as NodeJS.ErrnoException).code;
		throw new AgentBrowserError(
			code === "EEXIST" ? "policy-denied" : "network-error",
			code === "EEXIST"
				? "Capture destination already exists; refusing to replace it"
				: `Cannot save ${format} capture${code ? ` (${code})` : ""}`,
		);
	} finally {
		await file?.close().catch(() => {});
		if (identity) {
			try {
				const current = await lstat(temporary);
				if (current.dev === identity.dev && current.ino === identity.ino)
					await unlink(temporary);
			} catch {}
		}
		try {
			await execute(["artifact-delete", artifact.id]);
			released = true;
		} catch {}
	}
	return { filename, artifact, remoteCleanupConfirmed: released };
}
