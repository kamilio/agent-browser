import { readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { AgentBrowserError } from "./errors.js";
import { processReadRoot } from "./node-process-boundary.js";
import type { PageScriptCore } from "./page-scripts.js";

export async function loadPageScriptCore(
	packageRoot: string,
): Promise<{ core: PageScriptCore; version: string; packageName: string }> {
	const root = await processReadRoot(packageRoot);
	const manifestFile = join(root, "package.json");
	const metadata = await stat(manifestFile);
	if (!metadata.isFile() || metadata.size > 65_536)
		throw new AgentBrowserError("invalid-input", "Invalid page SDK manifest");
	const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
	const entry =
		manifest.name === "@poe-code/safe-js"
			? manifest.exports?.["./core"]?.import
			: manifest.name === "poe-code"
				? manifest.exports?.["./safe-js"]?.import
				: undefined;
	if (
		typeof entry !== "string" ||
		!entry.startsWith("./") ||
		typeof manifest.version !== "string" ||
		!/^[0-9][0-9A-Za-z.+-]{0,63}$/.test(manifest.version)
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
	const core = (await import(pathToFileURL(target).href)) as PageScriptCore;
	if (
		![
			core.Budget,
			core.SandboxError,
			core.createRealm,
			core.createHostObject,
			core.startCallback,
			core.deepCopyFromSandbox,
			core.retainGuestArguments,
			core.releaseGuestReference,
		].every((value) => typeof value === "function")
	)
		throw new AgentBrowserError(
			"unsupported",
			"The selected public SDK lacks persistent page extensions",
		);
	return { core, version: manifest.version, packageName: manifest.name };
}
