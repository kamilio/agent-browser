import { resolve } from "node:path";
import type { Invocation } from "./cli-parser.js";
import { AgentBrowserError } from "./errors.js";
import { UploadClientError, uploadPrivateFiles } from "./node-upload-client.js";
import { createUploadTransport } from "./upload-commands.js";
import {
	type UploadCommandResult,
	type UploadExecutor,
	uploadRecord,
	uploadTarget,
} from "./upload-protocol.js";

export { UploadClientError } from "./node-upload-client.js";

export type CliUploadExecutor = (
	argv: readonly string[],
	signal: AbortSignal,
) => Promise<UploadCommandResult>;

export async function runCliUpload(
	invocation: Invocation,
	executor: CliUploadExecutor,
	options: { signal?: AbortSignal; directory?: string } = {},
) {
	let began = false;
	const controller = new AbortController();
	const abort = () =>
		controller.abort(new AgentBrowserError("aborted", "File upload aborted"));
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		if (
			invocation.command !== "upload" ||
			invocation.arguments.length < 2 ||
			invocation.arguments.length > 64 ||
			Object.keys(invocation.options).some(
				(key) => !["json", "timeout"].includes(key),
			)
		)
			throw new AgentBrowserError("invalid-input", "Invalid upload invocation");
		const timeout = Number(invocation.options.timeout ?? 30_000);
		if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000)
			throw new AgentBrowserError("invalid-input", "Invalid upload timeout");
		const target = invocation.arguments[0];
		if (!target || target.length > 16_384 || /[\p{Cc}\p{Cf}]/u.test(target))
			throw new AgentBrowserError("invalid-input", "Invalid upload target");
		const paths = invocation.arguments.slice(1).map((requested) => {
			if (
				!requested ||
				requested.length > 4096 ||
				/[\p{Cc}\p{Cf}]/u.test(requested)
			)
				throw new AgentBrowserError("invalid-input", "Invalid upload filename");
			return { path: resolve(options.directory ?? process.cwd(), requested) };
		});
		options.signal?.addEventListener("abort", abort, { once: true });
		if (options.signal?.aborted) abort();
		timer = setTimeout(
			() =>
				controller.abort(
					new AgentBrowserError("timeout", "File upload timed out"),
				),
			timeout,
		);
		const execute: UploadExecutor = async (argv) => {
			const cleanup = argv[0] === "upload-cancel";
			if (!cleanup && controller.signal.aborted) throw controller.signal.reason;
			if (argv[0] === "upload-begin") began = true;
			const cleanupController = cleanup ? new AbortController() : undefined;
			const cleanupTimer = cleanupController
				? setTimeout(() => cleanupController.abort(), Math.min(timeout, 5000))
				: undefined;
			try {
				const response = uploadRecord(
					await executor(argv, cleanupController?.signal ?? controller.signal),
					["schemaVersion", "command", "session", "data"],
				);
				if (
					response.schemaVersion !== 1 ||
					response.command !== argv[0] ||
					response.session !== invocation.session
				)
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid upload response",
					);
				return {
					schemaVersion: 1,
					command: argv[0],
					session: invocation.session,
					data: response.data,
				};
			} finally {
				clearTimeout(cleanupTimer);
			}
		};
		const captured = await execute(["upload-target", target]);
		const data = uploadRecord(captured.data, ["target"]);
		const selected = uploadTarget(data.target);
		if (/^e[1-9][0-9]*$/.test(target) && selected.reference !== target)
			throw new AgentBrowserError(
				"stale-reference",
				"Upload reference changed",
			);
		const transport = createUploadTransport(
			execute,
			invocation.session,
			selected,
		);
		const uploaded = await uploadPrivateFiles(selected, paths, transport, {
			signal: controller.signal,
		});
		return uploaded.result;
	} catch (error) {
		const reason = controller.signal.aborted ? controller.signal.reason : error;
		throw new UploadClientError(
			new AgentBrowserError(
				reason instanceof AgentBrowserError ? reason.code : "network-error",
				"File upload failed; inspect document state before retrying",
			),
			error instanceof UploadClientError
				? error.remoteCleanupConfirmed
				: !began,
		);
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener("abort", abort);
	}
}
