import { readFile, realpath, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { AgentBrowserError } from "./errors.js";
import { processReadRoot } from "./node-process-boundary.js";
import {
	type PageRuntimeAdapter,
	type PageRuntimeConfiguration,
	type PageRuntimeSelection,
	pageRuntimeRequest,
	selectPageRuntime,
} from "./page-runtime-selection.js";
import type { PageScriptCore } from "./page-scripts.js";

export interface PageCoreLoader {
	importModule(specifier: string): Promise<unknown>;
}

export interface PageRuntimeLoadOptions {
	adapter?: PageRuntimeAdapter;
	runtimeOptions?: Readonly<PageRuntimeConfiguration>;
}

export interface PageCoreMetadata {
	version: string;
	packageName: "poe-code" | "@poe-code/safe-js" | "@poe-platform/safe-js";
	publicExport: "./safe-js" | "./core";
}

export type LoadedPageRuntime = PageCoreMetadata & PageRuntimeSelection;

const defaultLoader: PageCoreLoader = {
	importModule: (specifier) => import(specifier),
};

async function loadPublicCore(
	packageRoot: string,
	loader: PageCoreLoader,
): Promise<PageCoreMetadata & { core: unknown }> {
	if (!loader || typeof loader.importModule !== "function")
		throw new AgentBrowserError("invalid-input", "Invalid page SDK loader");
	const root = await processReadRoot(packageRoot);
	const manifestFile = await realpath(join(root, "package.json"));
	if (!manifestFile.startsWith(root + sep))
		throw new AgentBrowserError(
			"invalid-input",
			"Page SDK manifest leaves its package root",
		);
	const metadata = await stat(manifestFile);
	if (!metadata.isFile() || metadata.size > 65_536)
		throw new AgentBrowserError("invalid-input", "Invalid page SDK manifest");
	let manifest: unknown;
	try {
		const bytes = await readFile(manifestFile);
		if (bytes.byteLength > 65_536) throw new Error("Oversized manifest");
		manifest = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(bytes),
		);
	} catch {
		throw new AgentBrowserError("invalid-input", "Invalid page SDK manifest");
	}
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
		throw new AgentBrowserError("invalid-input", "Invalid page SDK manifest");
	const { name, version, exports } = manifest as Record<string, unknown>;
	const publicExport =
		name === "@poe-code/safe-js" || name === "@poe-platform/safe-js"
			? "./core"
			: name === "poe-code"
				? "./safe-js"
				: undefined;
	const declaration =
		publicExport && exports && typeof exports === "object"
			? (exports as Record<string, unknown>)[publicExport]
			: undefined;
	const entry =
		declaration && typeof declaration === "object"
			? (declaration as Record<string, unknown>).import
			: undefined;
	if (
		!publicExport ||
		typeof entry !== "string" ||
		!entry.startsWith("./") ||
		entry.includes("\0") ||
		typeof version !== "string" ||
		!/^[0-9][0-9A-Za-z.+-]{0,63}$/.test(version)
	)
		throw new AgentBrowserError(
			"unsupported",
			"The selected package lacks a declared public page SDK",
		);
	const target = resolve(root, entry);
	if (!target.startsWith(root + sep))
		throw new AgentBrowserError(
			"invalid-input",
			"Page SDK export leaves its package root",
		);
	const resolved = await realpath(target);
	if (!resolved.startsWith(root + sep) || !(await stat(resolved)).isFile())
		throw new AgentBrowserError(
			"invalid-input",
			"Page SDK export must be a file inside its package root",
		);
	const core = await loader.importModule(pathToFileURL(resolved).href);
	return {
		core,
		version,
		packageName: name as PageCoreMetadata["packageName"],
		publicExport,
	};
}

export async function loadPageScriptCore(
	packageRoot: string,
	loader: PageCoreLoader = defaultLoader,
): Promise<{ core: PageScriptCore; version: string; packageName: string }> {
	const { core, version, packageName } = await loadPublicCore(
		packageRoot,
		loader,
	);
	selectPageRuntime(core, "legacy");
	return { core: core as PageScriptCore, version, packageName };
}

export async function loadPageRuntime(
	packageRoot: string,
	options: PageRuntimeLoadOptions = {},
	loader: PageCoreLoader = defaultLoader,
): Promise<LoadedPageRuntime> {
	const { adapter, runtimeOptions } = pageRuntimeRequest(options);
	const { core, ...metadata } = await loadPublicCore(packageRoot, loader);
	return Object.freeze({
		...metadata,
		...selectPageRuntime(core, adapter, runtimeOptions),
	});
}
