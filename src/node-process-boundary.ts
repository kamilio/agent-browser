import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, parse } from "node:path";
import { AgentBrowserError } from "./errors.js";

export async function processReadRoot(input: unknown): Promise<string> {
	if (
		typeof input !== "string" ||
		!isAbsolute(input) ||
		input.length > 16_384 ||
		input.includes("*")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"An explicit restricted package root is required",
		);
	let root: string;
	try {
		root = await realpath(input);
	} catch {
		throw new AgentBrowserError(
			"unsupported",
			"Selected package root is unavailable",
		);
	}
	if (
		root === parse(root).root ||
		root.includes("*") ||
		!(await stat(root)).isDirectory()
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid restricted package root",
		);
	return root;
}

export function processArguments(
	root: string,
	childFile: string,
	heap: number,
): string[] {
	if (
		typeof Bun !== "undefined" ||
		!process.allowedNodeEnvironmentFlags.has("--permission")
	)
		throw new AgentBrowserError(
			"unsupported",
			"Owned processes require a Node host with permission flags",
		);
	if (!Number.isSafeInteger(heap) || heap < 32 || heap > 256)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid process heap setting",
		);
	const sourceRoot = dirname(childFile);
	return [
		"--permission",
		`--allow-fs-read=${root}`,
		`--allow-fs-read=${sourceRoot}`,
		`--allow-fs-read=${join(sourceRoot, "..", "..", "package.json")}`,
		"--disallow-code-generation-from-strings",
		`--max-old-space-size=${heap}`,
		childFile,
	];
}

export function processPermissions() {
	const permission = (
		process as NodeJS.Process & { permission?: { has(scope: string): boolean } }
	).permission;
	return {
		enabled: !!permission,
		filesystemWrite: permission?.has("fs.write") ?? true,
		childProcess: permission?.has("child") ?? true,
		worker: permission?.has("worker") ?? true,
		addons: permission?.has("addons") ?? true,
		wasi: permission?.has("wasi") ?? true,
		stringCodeGenerationDisabled: process.execArgv.includes(
			"--disallow-code-generation-from-strings",
		),
	};
}

export function hasRestrictedPermissions(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	const permissions = value as ReturnType<typeof processPermissions>;
	return (
		permissions.enabled === true &&
		permissions.stringCodeGenerationDisabled === true &&
		permissions.filesystemWrite === false &&
		permissions.childProcess === false &&
		permissions.worker === false &&
		permissions.addons === false &&
		permissions.wasi === false
	);
}
