import { parseInvocation } from "./cli-parser.js";
import { BrowserCommandHost } from "./command-host.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkPolicyOptions } from "./network.js";
import { cookiePolicyFromInitialize } from "./node-cookie-policy.js";
import { sessionIdentityOptions } from "./node-identity-config.js";
import { loadPageRuntime } from "./node-page-core.js";
import { processPermissions } from "./node-process-boundary.js";
import { ScriptFrameDecoder, scriptFrame } from "./node-script-protocol.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { PageFetchTransport } from "./page-fetch.js";
import type { PageNetworkModuleOptions } from "./page-network-modules.js";
import { pageRuntimeRequest } from "./page-runtime-selection.js";
import { type PageScriptOptions, PageScripts } from "./page-scripts.js";
import { ScriptLoader } from "./script-loader.js";
import { scriptLoadingSelection } from "./script-loading-options.js";
import { BrowserSession } from "./session.js";

const decoder = new ScriptFrameDecoder();
const owners = new Set<PageScripts>();
const pageOwners = new WeakMap<DocumentTree, PageScripts>();
let host: BrowserCommandHost | undefined;
let initialized = false;
let stopped = false;
let sequence = 0;
let lastCommand = 0;
let queued = 0;
let tail = Promise.resolve();
let heartbeat: ReturnType<typeof setInterval> | undefined;
let session = "";

function send(message: unknown): Promise<void> {
	return new Promise((resolve, reject) => {
		process.stdout.write(scriptFrame(message), (error) =>
			error ? reject(error) : resolve(),
		);
	});
}

async function dispose() {
	stopped = true;
	clearInterval(heartbeat);
	host?.close();
	await Promise.allSettled([...owners].map((owner) => owner.close()));
	owners.clear();
}

async function fatal(error: unknown) {
	if (stopped) return;
	await dispose();
	try {
		await send({
			schemaVersion: 1,
			type: "fatal",
			code: error instanceof AgentBrowserError ? error.code : "unsupported",
		});
	} finally {
		process.exit(1);
	}
}

async function receive(raw: unknown) {
	if (stopped) return;
	if (!raw || typeof raw !== "object") throw new Error("Invalid message");
	const message = raw as Record<string, unknown>;
	if (message.schemaVersion !== 1) throw new Error("Invalid version");
	if (message.type === "initialize" && !initialized) {
		initialized = true;
		if (
			typeof message.packageRoot !== "string" ||
			typeof message.session !== "string" ||
			!Number.isSafeInteger(message.heartbeatMs) ||
			(message.heartbeatMs as number) < 25 ||
			(message.heartbeatMs as number) > 250
		)
			throw new AgentBrowserError("invalid-input", "Invalid initialization");
		session = parseInvocation(["capabilities"], {
			AGENT_BROWSER_SESSION: message.session,
		}).session;
		const { adapter: runtimeAdapter, runtimeOptions } = pageRuntimeRequest(
			message,
			"runtimeAdapter",
		);
		if (
			message.websiteScripts !== undefined &&
			message.websiteScripts !== "classic" &&
			message.websiteScripts !== "module"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid website script mode",
			);
		if (message.websiteScripts === "module" && runtimeAdapter !== "extension")
			throw new AgentBrowserError(
				"unsupported",
				"Module website scripts require the extension page runtime",
			);
		const identity = sessionIdentityOptions(message.identity);
		const scriptLoading = scriptLoadingSelection(message);
		const cookiePolicy = await cookiePolicyFromInitialize(message);
		const sdk = await loadPageRuntime(message.packageRoot, {
			adapter: runtimeAdapter,
			...(runtimeOptions ? { runtimeOptions } : {}),
		});
		const ownerFor = (
			document: DocumentTree,
			fetch?: PageFetchTransport,
			networkSourceModules?: PageNetworkModuleOptions,
			workerFetch?: PageScriptOptions["workerFetch"],
		) => {
			let owner = pageOwners.get(document);
			if (!owner) {
				owner = new PageScripts(
					{ document, interactions: documentInteractions(document) },
					sdk.factory,
					{
						...(message.scripts as PageScriptOptions | undefined),
						fetch,
						workerFetch,
						networkSourceModules,
					},
				);
				pageOwners.set(document, owner);
				owners.add(owner);
				const attached = owner;
				document.onClose(() => {
					owners.delete(attached);
					void attached.close().catch(() => undefined);
				});
			}
			return owner;
		};
		host = new BrowserCommandHost({
			pageFetch: true,
			websiteScripts:
				message.websiteScripts === "module"
					? "module"
					: message.websiteScripts === "classic",
			maxSessions: 1,
			documentFormats: [
				"text/html",
				"text/plain",
				"application/json",
				"application/*+json",
			],
			createSession: () =>
				new BrowserSession({
					identity,
					...(scriptLoading
						? {
								limits: {
									...(scriptLoading.maxExternal === undefined
										? {}
										: { maxScriptRequests: scriptLoading.maxExternal }),
									...(scriptLoading.navigationTimeoutMs === undefined
										? {}
										: {
												navigationTimeoutMs: scriptLoading.navigationTimeoutMs,
											}),
								},
							}
						: {}),
					...(cookiePolicy ? { cookiePolicy: cookiePolicy.options } : {}),
					createTransport: (cookieJar) =>
						new NodeNetworkTransport({
							...(message.network as NetworkPolicyOptions | undefined),
							cookieJar,
						}),
					loadDocument: (response, context) => {
						let networkSourceModules: PageNetworkModuleOptions | undefined;
						if (message.websiteScripts === "module") {
							if (!context.fetchScriptWithPolicy || !context.fetchModuleWithPolicy)
								throw new AgentBrowserError(
									"unsupported",
									"Module website scripts require policy-aware fetching",
								);
							networkSourceModules = {
								documentUrl: response.url,
								entries: [],
								htmlEntries: true,
								fetchWithPolicy: context.fetchModuleWithPolicy,
							};
						}
						return loadBrowserDocument(response, {
							...context,
							...(message.websiteScripts === "classic" ||
							message.websiteScripts === "module"
								? {
										scripts: new ScriptLoader({
											response,
											topLevelDocument: context.topLevelDocument,
											signal: context.signal,
											fetch: context.fetchScript,
											fetchWithPolicy: context.fetchScriptWithPolicy,
											limits: {
												...(scriptLoading?.maxScripts === undefined
													? {}
													: { maxScripts: scriptLoading.maxScripts }),
												...(scriptLoading?.maxExternal === undefined
													? {}
													: { maxExternal: scriptLoading.maxExternal }),
												...(scriptLoading?.maxSourceBytes === undefined
													? {}
													: { maxSourceBytes: scriptLoading.maxSourceBytes }),
												...(networkSourceModules ? { modules: true } : {}),
											},
											owner: (document) =>
												ownerFor(
													document,
													context.fetch,
													networkSourceModules,
													context.fetchWorker,
												),
										}),
									}
								: {}),
						});
					},
				}),
			evaluatePage: (page, source, signal) =>
				ownerFor(page.document, page.fetch).evaluate(source, { signal }),
		});
		await send({
			schemaVersion: 1,
			type: "ready",
			...(cookiePolicy ? { cookiePolicy: cookiePolicy.cookiePolicy } : {}),
			pid: process.pid,
			session,
			version: sdk.version,
			packageName: sdk.packageName,
			runtimeAdapter: sdk.adapter,
			runtimeValidation: sdk.validation,
			...(sdk.runtimeOptions ? { runtimeOptions: sdk.runtimeOptions } : {}),
			publicExport: sdk.publicExport,
			permissions: processPermissions(),
		});
		let sending = false;
		heartbeat = setInterval(() => {
			if (sending || stopped) return;
			sending = true;
			void send({
				schemaVersion: 1,
				type: "heartbeat",
				sequence: ++sequence,
			}).then(() => {
				sending = false;
			}, fatal);
		}, message.heartbeatMs as number);
		return;
	}
	if (
		!host ||
		message.type !== "command" ||
		message.id !== lastCommand + 1 ||
		!Array.isArray(message.argv) ||
		message.argv.length > 256 ||
		message.argv.some((value) => typeof value !== "string")
	)
		throw new AgentBrowserError("invalid-input", "Invalid session command");
	lastCommand++;
	try {
		if (
			parseInvocation(message.argv, { AGENT_BROWSER_SESSION: session })
				.session !== session
		)
			throw new AgentBrowserError("invalid-input", "Session mismatch");
		const result = await host.execute(message.argv, { session });
		await send({ schemaVersion: 1, type: "result", id: message.id, result });
	} catch (error) {
		await send({
			schemaVersion: 1,
			type: "failure",
			id: message.id,
			code: error instanceof AgentBrowserError ? error.code : "unsupported",
		});
	}
}

process.stdin.on("data", (chunk: Buffer) => {
	if (stopped) return;
	try {
		for (const message of decoder.push(chunk)) {
			if (++queued > 9)
				throw new AgentBrowserError(
					"resource-limit",
					"Session input queue exceeded",
				);
			tail = tail
				.then(() => receive(message))
				.finally(() => {
					queued--;
				});
			void tail.catch(fatal);
		}
	} catch (error) {
		void fatal(error);
	}
});
process.stdin.once("end", () => {
	try {
		decoder.finish();
		void dispose().finally(() => process.exit(0));
	} catch (error) {
		void fatal(error);
	}
});
process.stdin.once("error", fatal);
process.stdout.once("error", () => {
	void dispose().finally(() => process.exit(1));
});
