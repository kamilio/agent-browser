import { createHash } from "node:crypto";
import { loadBrowserDocument } from "../src/document-loader.js";
import { documentScriptState } from "../src/document-script-state.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { documentInteractions } from "../src/interactions.js";
import { loadPageScriptCore } from "../src/node-page-core.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { ScriptLoader } from "../src/script-loader.js";
import { BrowserSession } from "../src/session.js";

const startedAt = new Date().toISOString();
const sites: Record<string, unknown>[] = [];
const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!packageRoot)
	throw new Error("Select the compiled extended SafeJS package explicitly");
const { core } = await loadPageScriptCore(packageRoot);

function ownData(value: unknown, depth = 0): unknown {
	if (typeof value === "string") return value.slice(0, 800);
	if (value === null || typeof value === "boolean" || typeof value === "number")
		return value;
	if (!value || typeof value !== "object" || depth > 2) return undefined;
	const output: Record<string, unknown> = {};
	for (const name of [
		"name",
		"code",
		"kind",
		"message",
		"budget",
		"span",
		"start",
		"end",
		"line",
		"column",
		"offset",
		"reason",
	])
		if (Object.hasOwn(value, name)) {
			const property = Object.getOwnPropertyDescriptor(value, name);
			if (property && "value" in property)
				output[name] = ownData(property.value, depth + 1);
		}
	return output;
}

for (const url of [
	"https://books.toscrape.com/",
	"https://quotes.toscrape.com/js/",
]) {
	const errors: unknown[] = [];
	const sources: {
		filename?: string;
		length: number;
		sha256: string;
		elapsedMs: number;
	}[] = [];
	const owners = new Set<PageScripts>();
	const observed: PageScriptCore = {
		...core,
		createRealm(options) {
			const realm = core.createRealm(options);
			return {
				get closed() {
					return realm.closed;
				},
				close: () => realm.close(),
				async evaluate(source, evaluationOptions) {
					const started = performance.now();
					const measured = {
						filename: evaluationOptions?.filename,
						length: source.length,
						sha256: createHash("sha256").update(source).digest("hex"),
						elapsedMs: 0,
					};
					sources.push(measured);
					try {
						return await realm.evaluate(source, evaluationOptions);
					} catch (error) {
						const serialized = ownData(error);
						const data =
							serialized && typeof serialized === "object"
								? (serialized as Record<string, unknown>)
								: { thrown: serialized };
						const offset = (
							data.span as { start?: { offset?: unknown } } | undefined
						)?.start?.offset;
						errors.push({
							...data,
							...(typeof offset === "number" && Number.isSafeInteger(offset)
								? {
										sourceContext: source.slice(
											Math.max(0, offset - 70),
											offset + 70,
										),
									}
								: {}),
						});
						throw error;
					} finally {
						measured.elapsedMs = Math.round(performance.now() - started);
					}
				},
			};
		},
	};
	const ownerFor = (document: DocumentTree) => {
		const owner = new PageScripts(
			{ document, interactions: documentInteractions(document) },
			observed,
		);
		owners.add(owner);
		return owner;
	};
	const browser = new BrowserSession({
		createTransport: (cookieJar) => new NodeNetworkTransport({ cookieJar }),
		loadDocument: (response, context) =>
			loadBrowserDocument(response, {
				...context,
				scripts: new ScriptLoader({
					response,
					signal: context.signal,
					fetch: context.fetchScript,
					owner: ownerFor,
				}),
			}),
	});
	try {
		const tab = browser.createTab();
		const navigation = await browser.navigate(tab.id, url);
		sites.push({
			url,
			navigation: true,
			scripts: documentScriptState(browser.page(tab.id).document)?.report,
			sources,
			errors,
			response: navigation.response,
		});
	} catch (error) {
		sites.push({
			url,
			navigation: false,
			error: error instanceof AgentBrowserError ? error.code : "probe-failed",
			sources,
			errors,
		});
	} finally {
		browser.close();
		await Promise.all([...owners].map((owner) => owner.close()));
	}
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Bounded diagnostic interception around the actual extended SafeJS public realm API for two unauthenticated public sites. Source hashes, bounded own-data error fields and at most 140 source characters around a public script failure; no full website bodies, credentials or native stacks. Runs in a disposable diagnostic process with an external timeout and heap ceiling, not the production permission-restricted session actor. No page behavior or script sources are replaced.",
			sites,
		},
		null,
		2,
	),
);
