import { readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { ScriptHostObjectFactory } from "../src/script-dom.js";

export interface Realm {
	readonly closed: boolean;
	evaluate(source: string): Promise<{ returnValue?: unknown }>;
	close(): Promise<void>;
}

export interface ExtendedCore extends ScriptHostObjectFactory {
	Budget: new (options: { maxSteps: number; deadline?: number }) => {
		stepsUsed: number;
	};
	startCallback(
		callback: unknown,
		args: readonly unknown[],
		options: { thisValue: unknown },
	): { synchronous: Promise<void>; result: Promise<unknown> };
	createRealm(options: {
		budget?: unknown;
		bindings: Record<string, unknown>;
		maxEvaluations: number;
		maxSourceLength: number;
		sink: { log: () => void; error: () => void };
	}): Realm;
}

export async function loadExtendedCore(): Promise<ExtendedCore> {
	const root = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
	if (!root || !isAbsolute(root))
		throw new Error(
			"An explicit compiled SafeJS source package root is required",
		);
	const manifest = JSON.parse(
		await readFile(resolve(root, "package.json"), "utf8"),
	) as { name?: string; exports?: Record<string, { import?: string }> };
	const entry = manifest.exports?.["./core"]?.import;
	if (
		manifest.name !== "@poe-code/safe-js" ||
		typeof entry !== "string" ||
		!entry.startsWith("./")
	)
		throw new Error("Expected the declared SafeJS public core export");
	const target = resolve(root, entry);
	if (!target.startsWith(resolve(root) + sep))
		throw new Error("Public export escapes the package root");
	const loaded = (await import(
		pathToFileURL(target).href
	)) as Partial<ExtendedCore>;
	if (
		typeof loaded.createRealm !== "function" ||
		typeof loaded.createHostObject !== "function" ||
		typeof loaded.startCallback !== "function" ||
		typeof loaded.Budget !== "function"
	)
		throw new Error("The selected SDK lacks the tested extensions");
	return loaded as ExtendedCore;
}
