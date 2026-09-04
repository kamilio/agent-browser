#!/usr/bin/env node
import { parseInvocation } from "./cli-parser.js";
import { BrowserCommandHost } from "./command-host.js";
import { loadBrowserDocument } from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import type { DocumentExtraction } from "./extraction.js";
import type { GeneratedLocator } from "./locator-generation.js";
import { saveCapture } from "./node-capture.js";
import { approvePlayground, requestCommand } from "./node-command-client.js";
import { listenCommandServer } from "./node-command-server.js";
import { loadPlaygroundAssets } from "./node-playground-assets.js";
import {
	readCommandConnection,
	writeCommandConnection,
} from "./node-runtime.js";
import { SessionProcessHost } from "./node-session-host.js";
import { runStateFileCommand } from "./node-state-client.js";
import { runTerminal } from "./node-terminal.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { pageRuntimeAdapter } from "./page-runtime-selection.js";
import { BrowserSession } from "./session.js";
import {
	type SnapshotSearch,
	renderSnapshotSearch,
} from "./snapshot-search.js";
import { type SemanticSnapshot, renderSnapshot } from "./snapshot.js";

function runtimeConfiguration() {
	const packageRoot = process.env.AGENT_BROWSER_SAFEJS_ROOT;
	const configuredAdapter = process.env.AGENT_BROWSER_PAGE_RUNTIME;
	const runtimeAdapter = pageRuntimeAdapter(configuredAdapter);
	if (configuredAdapter !== undefined && !packageRoot)
		throw new AgentBrowserError(
			"invalid-input",
			"AGENT_BROWSER_PAGE_RUNTIME requires an explicit SafeJS package root",
		);
	return { packageRoot, runtimeAdapter };
}

function host(configuration: ReturnType<typeof runtimeConfiguration>) {
	const { packageRoot, runtimeAdapter } = configuration;
	const websiteScripts = process.env.AGENT_BROWSER_PAGE_SCRIPTS;
	if (websiteScripts !== undefined && websiteScripts !== "classic")
		throw new AgentBrowserError(
			"invalid-input",
			"AGENT_BROWSER_PAGE_SCRIPTS must be classic when provided",
		);
	if (websiteScripts && !packageRoot)
		throw new AgentBrowserError(
			"unsupported",
			"Website scripts require an explicit SafeJS process runtime",
		);
	if (packageRoot !== undefined)
		return new SessionProcessHost({
			process: { packageRoot, websiteScripts, runtimeAdapter },
		});
	return new BrowserCommandHost({
		documentFormats: [
			"text/html",
			"text/plain",
			"application/json",
			"application/*+json",
		],
		createSession: () =>
			new BrowserSession({
				createTransport: (cookieJar) => new NodeNetworkTransport({ cookieJar }),
				loadDocument: loadBrowserDocument,
			}),
	});
}

function safeJson(value: unknown) {
	return JSON.stringify(value, null, 2).replace(
		/[\p{Cc}\p{Cf}]/gu,
		(character) =>
			character === "\n" || character === "\t"
				? character
				: `\\u${character.codePointAt(0)?.toString(16).padStart(4, "0")}`,
	);
}

async function main() {
	const argv = process.argv.slice(2);
	const environment = {
		AGENT_BROWSER_SESSION: process.env.AGENT_BROWSER_SESSION,
		PLAYWRIGHT_CLI_SESSION: process.env.PLAYWRIGHT_CLI_SESSION,
	};
	const invocation = parseInvocation(argv, environment);
	const configuration = runtimeConfiguration();
	const directory = process.env.AGENT_BROWSER_RUNTIME_DIR;
	if (
		invocation.command === "help" ||
		invocation.options.help ||
		invocation.options.version ||
		invocation.command === "capabilities"
	) {
		let connection:
			| Awaited<ReturnType<typeof readCommandConnection>>
			| undefined;
		try {
			connection = await readCommandConnection(directory);
		} catch (error) {
			if (!(error instanceof AgentBrowserError) || error.code !== "not-found")
				throw error;
		}
		if (connection) {
			console.log(
				safeJson(
					await requestCommand(connection, {
						argv,
						session: invocation.session,
					}),
				),
			);
			return;
		}
		const local = host(configuration);
		try {
			console.log(
				safeJson(await local.execute(argv, { session: invocation.session })),
			);
		} finally {
			await local.close();
		}
		return;
	}
	if (invocation.command === "serve") {
		for (const key of Object.keys(invocation.options))
			if (key !== "json")
				throw new AgentBrowserError(
					"unsupported",
					`Service option is not implemented: --${key}`,
				);
		const commands = host(configuration);
		let remove: (() => Promise<void>) | undefined;
		let resolveStopped = () => {};
		const stopped = new Promise<void>((resolve) => {
			resolveStopped = resolve;
		});
		const server = await listenCommandServer(commands, {
			playground: await loadPlaygroundAssets(),
			onShutdown: async () => {
				try {
					await remove?.();
				} catch {
					process.exitCode = 1;
				} finally {
					resolveStopped();
				}
			},
		});
		try {
			const connection = await writeCommandConnection(
				{ schemaVersion: 1, origin: server.origin, token: server.token },
				directory,
			);
			remove = connection.remove;
			let stopping = false;
			const stop = () => {
				if (stopping) return;
				stopping = true;
				void server
					.close()
					.then(() => remove?.())
					.catch(() => {
						process.exitCode = 1;
					})
					.finally(resolveStopped);
			};
			process.once("SIGINT", stop);
			process.once("SIGTERM", stop);
			console.log(
				safeJson({
					service: "agent-browser",
					origin: server.origin,
					connectionFile: connection.path,
					authentication: "private-file",
					mode: "foreground",
					documentFormats: commands.capabilities().documentFormats,
				}),
			);
			await stopped;
			process.off("SIGINT", stop);
			process.off("SIGTERM", stop);
		} finally {
			await server.close();
			await remove?.();
		}
		return;
	}
	if (invocation.command === "stop-server") {
		for (const key of Object.keys(invocation.options))
			if (key !== "json")
				throw new AgentBrowserError(
					"unsupported",
					`Service option is not implemented: --${key}`,
				);
		console.log(
			safeJson(
				await requestCommand(await readCommandConnection(directory), null),
			),
		);
		return;
	}
	if (invocation.command === "terminal") {
		if (Object.keys(invocation.options).length)
			throw new AgentBrowserError(
				"unsupported",
				"Terminal mode does not accept output or execution options",
			);
		const connection = await readCommandConnection(directory);
		await runTerminal({
			session: invocation.session,
			url: invocation.arguments[0],
			execute: async (argv, signal) => {
				const result = await requestCommand(
					connection,
					{ argv, session: invocation.session },
					35_000,
					signal,
				);
				if (!("data" in result))
					throw new AgentBrowserError("closed", "Local API closed");
				return result;
			},
		});
		return;
	}
	if (invocation.command === "playground") {
		for (const key of Object.keys(invocation.options))
			if (!["json", "pair"].includes(key))
				throw new AgentBrowserError(
					"unsupported",
					`Playground option is not implemented: --${key}`,
				);
		const connection = await readCommandConnection(directory);
		console.log(
			safeJson(
				invocation.options.pair === undefined
					? {
							url: connection.origin,
							connection:
								"Open this URL and approve the displayed pairing code with playground --pair CODE",
						}
					: await approvePlayground(
							connection,
							String(invocation.options.pair),
						),
			),
		);
		return;
	}
	if (["state-save", "state-load"].includes(invocation.command)) {
		const connection = await readCommandConnection(directory);
		const state = await runStateFileCommand(invocation, async (stateArgv) => {
			const result = await requestCommand(
				connection,
				{
					argv:
						invocation.options.timeout === undefined
							? stateArgv
							: [
									...stateArgv,
									`--timeout=${String(invocation.options.timeout)}`,
								],
					session: invocation.session,
				},
				Number(invocation.options.timeout ?? 30_000) + 5000,
			);
			if (!("data" in result))
				throw new AgentBrowserError("closed", "Local API closed");
			return result;
		});
		console.log(
			safeJson({
				schemaVersion: 1,
				command: invocation.command,
				session: invocation.session,
				data: state,
			}),
		);
		return;
	}
	if (["screenshot", "pdf", "tracing-stop"].includes(invocation.command)) {
		const connection = await readCommandConnection(directory);
		const capture = await saveCapture(invocation, async (captureArgv) => {
			const result = await requestCommand(
				connection,
				{ argv: captureArgv, session: invocation.session },
				Number(invocation.options.timeout ?? 30_000) + 5000,
			);
			if (!("data" in result))
				throw new AgentBrowserError("closed", "Local API closed");
			return result;
		});
		console.log(
			invocation.options.json
				? safeJson({
						schemaVersion: 1,
						command: invocation.command,
						session: invocation.session,
						data: capture,
					})
				: `Saved partial native ${invocation.command === "tracing-stop" ? "JSON trace" : invocation.command === "pdf" ? "PDF" : "PNG"}: ${capture.filename}${capture.remoteCleanupConfirmed ? "" : ` (remote cleanup unconfirmed for ${capture.artifact.id})`}${capture.temporaryCleanupConfirmed ? "" : " (temporary file cleanup unconfirmed)"}`,
		);
		return;
	}
	const result = await requestCommand(
		await readCommandConnection(directory),
		{ argv, session: invocation.session },
		Number(invocation.options.timeout ?? 30_000) + 5000,
	);
	if (
		!invocation.options.json &&
		"data" in result &&
		invocation.command === "snapshot" &&
		!invocation.options.diff
	)
		console.log(renderSnapshot(result.data as SemanticSnapshot));
	else if (
		!invocation.options.json &&
		"data" in result &&
		invocation.command === "find"
	)
		console.log(renderSnapshotSearch(result.data as SnapshotSearch));
	else if (
		!invocation.options.json &&
		"data" in result &&
		invocation.command === "text"
	)
		console.log((result.data as { text: string }).text);
	else if (
		!invocation.options.json &&
		"data" in result &&
		invocation.command === "extract" &&
		(result.data as DocumentExtraction).format === "markdown"
	)
		console.log((result.data as DocumentExtraction).content);
	else if (
		invocation.command === "generate-locator" &&
		invocation.options.raw &&
		"data" in result
	)
		console.log((result.data as GeneratedLocator).locator);
	else console.log(safeJson(result));
}

void main().catch((error) => {
	const known =
		error instanceof AgentBrowserError
			? error
			: new AgentBrowserError("network-error", "CLI operation failed");
	console.error(
		safeJson({
			ok: false,
			error: { code: known.code, message: known.message },
		}),
	);
	process.exitCode = 1;
});
