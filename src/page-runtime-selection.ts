import { AgentBrowserError } from "./errors.js";
import { extensionPageRuntime } from "./extension-page-runtime.js";
import {
	type PageRuntimeFactory,
	type PageScriptCore,
	legacyPageRuntime,
} from "./page-runtime.js";
import type { ReleasedCore } from "./safejs-extension-types.js";

export type PageRuntimeAdapter = "legacy" | "extension";

export interface PageRuntimeSelection {
	adapter: PageRuntimeAdapter;
	factory: PageRuntimeFactory;
	validation: "contract-shape-only";
}

const operations = {
	legacy: [
		"Budget",
		"SandboxError",
		"createRealm",
		"createHostObject",
		"startCallback",
		"deepCopyFromSandbox",
		"retainGuestArguments",
		"releaseGuestReference",
	],
	extension: ["Budget", "defineExtension", "createRealm"],
} as const;

export function pageRuntimeAdapter(
	value: unknown = "legacy",
): PageRuntimeAdapter {
	if (value !== "legacy" && value !== "extension")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid page runtime adapter",
		);
	return value;
}

export function selectPageRuntime(
	core: unknown,
	requested: PageRuntimeAdapter = "legacy",
): PageRuntimeSelection {
	const adapter = pageRuntimeAdapter(requested);
	const valid =
		core !== null &&
		typeof core === "object" &&
		operations[adapter].every((name) => {
			const descriptor = Object.getOwnPropertyDescriptor(core, name);
			return (
				descriptor &&
				"value" in descriptor &&
				typeof descriptor.value === "function"
			);
		});
	if (!valid)
		throw new AgentBrowserError(
			"unsupported",
			`The selected public SDK lacks the ${adapter} page runtime contract`,
		);
	return Object.freeze({
		adapter,
		factory:
			adapter === "legacy"
				? legacyPageRuntime(core as PageScriptCore)
				: extensionPageRuntime(core as ReleasedCore),
		validation: "contract-shape-only",
	});
}
