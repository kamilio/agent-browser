import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { AgentBrowserError } from "./errors.js";
import { SafeJsRuntime, type SafeJsSdk, type ScriptLimits } from "./safejs.js";

export async function loadSafeJsSdk(
	packageRoot?: string,
): Promise<{ sdk: SafeJsSdk; version: string }> {
	if (
		packageRoot !== undefined &&
		(!isAbsolute(packageRoot) || packageRoot.length > 16_384)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"SafeJS package root must be an absolute installed package directory",
		);
	try {
		let version = "unknown";
		let entry = "poe-code/safe-js";
		if (packageRoot) {
			const metadata = await stat(join(packageRoot, "package.json"));
			if (!metadata.isFile() || metadata.size > 65_536)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid installed SafeJS package manifest",
				);
			const manifest = JSON.parse(
				await readFile(join(packageRoot, "package.json"), "utf8"),
			);
			if (manifest.name !== "poe-code")
				throw new AgentBrowserError(
					"invalid-input",
					"SafeJS root must identify the poe-code package",
				);
			if (
				typeof manifest.version === "string" &&
				/^[0-9][0-9A-Za-z.+-]{0,63}$/.test(manifest.version)
			)
				version = manifest.version;
			const target = manifest.exports?.["./safe-js"]?.import;
			if (typeof target !== "string" || !target.startsWith("./"))
				throw new AgentBrowserError(
					"unsupported",
					"Installed package does not declare the public SafeJS Node import",
				);
			const resolved = resolve(packageRoot, target);
			if (!resolved.startsWith(`${resolve(packageRoot)}${sep}`))
				throw new AgentBrowserError(
					"invalid-input",
					"SafeJS public export leaves its package root",
				);
			entry = pathToFileURL(resolved).href;
		}
		const sdk = (await import(entry)) as SafeJsSdk;
		const runtime = new SafeJsRuntime(sdk);
		runtime.close();
		return { sdk, version };
	} catch (error) {
		if (error instanceof AgentBrowserError) throw error;
		throw new AgentBrowserError(
			"unsupported",
			"Installed Poe SafeJS public SDK is unavailable; supply a compatible installed poe-code package root. Nothing was installed or upgraded.",
		);
	}
}

export async function createSafeJsRuntime(
	options: { packageRoot?: string; limits?: Partial<ScriptLimits> } = {},
) {
	const { sdk, version } = await loadSafeJsSdk(options.packageRoot);
	return { runtime: new SafeJsRuntime(sdk, options.limits), version };
}
