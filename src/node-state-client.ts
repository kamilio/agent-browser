import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Invocation } from "./cli-parser.js";
import { AgentBrowserError } from "./errors.js";
import { readStateFile, writeStateFile } from "./node-state-file.js";
import {
	type StateExecutor,
	downloadBrowserState,
	uploadBrowserState,
} from "./state-client.js";

export async function runStateFileCommand(
	invocation: Invocation,
	executor: StateExecutor,
	directory = process.cwd(),
) {
	const execute: StateExecutor = async (argv) => {
		const result = await executor(argv);
		if (!result || result.session !== invocation.session)
			throw new AgentBrowserError(
				"invalid-input",
				"State transfer session mismatch",
			);
		return result;
	};
	const save = invocation.command === "state-save";
	if (
		(!save && invocation.command !== "state-load") ||
		invocation.arguments.length > 1 ||
		(!save && !invocation.arguments.length) ||
		Object.keys(invocation.options).some(
			(key) =>
				!["json", "timeout", ...(save ? ["overwrite"] : [])].includes(key),
		)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported state file command or option",
		);
	const requested =
		invocation.arguments[0] ?? `agent-browser-state-${randomUUID()}.json`;
	if (
		!requested.length ||
		requested.length > 4096 ||
		/[\p{Cc}\p{Cf}]/u.test(requested)
	)
		throw new AgentBrowserError("invalid-input", "Invalid state filename");
	const filename = resolve(directory, requested);
	if (save) {
		const state = await downloadBrowserState(execute);
		const saved = await writeStateFile(filename, state.json, {
			overwrite: invocation.options.overwrite === true,
		});
		return { ...saved, remoteCleanupConfirmed: state.remoteCleanupConfirmed };
	}
	const state = await readStateFile(filename);
	return { filename, ...(await uploadBrowserState(state.json, execute)) };
}
