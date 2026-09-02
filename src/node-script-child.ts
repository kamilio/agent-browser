import { AgentBrowserError } from "./errors.js";
import { createSafeJsRuntime } from "./node-safejs.js";
import { ScriptFrameDecoder, scriptFrame } from "./node-script-protocol.js";
import type { SafeJsRuntime, ScriptLimits } from "./safejs.js";

async function send(message: unknown) {
	await new Promise<void>((resolve, reject) =>
		process.stdout.write(scriptFrame(message), (error) =>
			error ? reject(error) : resolve(),
		),
	);
}

async function main() {
	let runtime: SafeJsRuntime | undefined;
	const decoder = new ScriptFrameDecoder();
	let lastId = 0;
	try {
		for await (const chunk of process.stdin) {
			for (const raw of decoder.push(Buffer.from(chunk))) {
				if (!raw || typeof raw !== "object")
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid script protocol request",
					);
				const request = raw as Record<string, unknown>;
				if (request.schemaVersion !== 1)
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid script protocol version",
					);
				if (request.type === "initialize" && !runtime) {
					if (
						typeof request.packageRoot !== "string" ||
						!request.limits ||
						typeof request.limits !== "object"
					)
						throw new AgentBrowserError(
							"invalid-input",
							"Invalid script initialization",
						);
					const loaded = await createSafeJsRuntime({
						packageRoot: request.packageRoot,
						limits: request.limits as Partial<ScriptLimits>,
					});
					runtime = loaded.runtime;
					const permission = (
						process as NodeJS.Process & {
							permission?: { has(scope: string): boolean };
						}
					).permission;
					await send({
						schemaVersion: 1,
						type: "ready",
						version: loaded.version,
						pid: process.pid,
						permissions: {
							enabled: !!permission,
							filesystemWrite: permission?.has("fs.write") ?? true,
							childProcess: permission?.has("child") ?? true,
							worker: permission?.has("worker") ?? true,
							addons: permission?.has("addons") ?? true,
							wasi: permission?.has("wasi") ?? true,
							stringCodeGenerationDisabled: process.execArgv.includes(
								"--disallow-code-generation-from-strings",
							),
						},
					});
					continue;
				}
				if (
					request.type !== "evaluate" ||
					!runtime ||
					typeof request.source !== "string" ||
					!Number.isSafeInteger(request.id) ||
					Number(request.id) <= lastId
				)
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid script evaluation request",
					);
				lastId = Number(request.id);
				try {
					const result = await runtime.evaluate(request.source);
					await send({ schemaVersion: 1, type: "result", id: lastId, result });
				} catch (error) {
					await send({
						schemaVersion: 1,
						type: "failure",
						id: lastId,
						code:
							error instanceof AgentBrowserError ? error.code : "unsupported",
					});
				}
			}
		}
		decoder.finish();
	} catch (error) {
		await send({
			schemaVersion: 1,
			type: "fatal",
			code: error instanceof AgentBrowserError ? error.code : "unsupported",
		}).catch(() => {});
		process.exitCode = 1;
	} finally {
		runtime?.close();
	}
}

await main();
