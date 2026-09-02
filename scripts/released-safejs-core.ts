import { readFile, realpath, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { processReadRoot } from "../src/node-process-boundary.js";

import type { ReleasedCore } from "../src/safejs-extension-types.js";
export type {
	ReleasedInvocation,
	ReleasedHostDefinition,
	ReleasedContext,
	ReleasedRealm,
	ReleasedCore,
} from "../src/safejs-extension-types.js";

export async function loadReleasedCore(
	packageRoot: unknown,
	expectedVersion: unknown,
) {
	if (
		typeof expectedVersion !== "string" ||
		!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedVersion) ||
		expectedVersion.length > 64
	)
		throw new Error("An explicit SafeJS release version is required");
	const root = await processReadRoot(packageRoot);
	const contained = (file: string) => file.startsWith(root + sep);
	const manifestPath = await realpath(join(root, "package.json"));
	if (!contained(manifestPath))
		throw new Error("SafeJS manifest escapes its package root");
	const metadata = await stat(manifestPath);
	if (!metadata.isFile() || metadata.size > 65_536)
		throw new Error("Invalid SafeJS release manifest");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	if (
		manifest?.name !== "@poe-platform/safe-js" ||
		manifest.version !== expectedVersion
	)
		throw new Error(
			"Selected SafeJS package name or release version does not match",
		);
	const entry = manifest.exports?.["./core"]?.import;
	if (
		typeof entry !== "string" ||
		!entry.startsWith("./") ||
		!contained(resolve(root, entry))
	)
		throw new Error("Expected a contained declared SafeJS core import");
	const target = await realpath(resolve(root, entry));
	if (!contained(target) || !(await stat(target)).isFile())
		throw new Error(
			"SafeJS core export escapes its package root or is not a file",
		);
	const loaded = await import(pathToFileURL(target).href);
	if (
		![loaded.Budget, loaded.defineExtension, loaded.createRealm].every(
			(value) => typeof value === "function",
		)
	)
		throw new Error("Selected SafeJS release lacks the public extension API");
	return {
		core: loaded as ReleasedCore,
		packageName: manifest.name as string,
		version: expectedVersion,
	};
}
