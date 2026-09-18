import { AgentBrowserError } from "./errors.js";
import { extensionPageRuntime } from "./extension-page-runtime.js";
import {
	type PageRuntimeFactory,
	type PageScriptCore,
	legacyPageRuntime,
} from "./page-runtime.js";
import type { ReleasedCore } from "./safejs-extension-types.js";

export type PageRuntimeAdapter = "legacy" | "extension";

export interface PageRuntimeConfiguration {
	classicScripts?: boolean;
	callbackScheduling?: "after-prefix";
}

export interface PageRuntimeSelection {
	adapter: PageRuntimeAdapter;
	factory: PageRuntimeFactory;
	validation: "contract-shape-only";
	runtimeOptions?: Readonly<PageRuntimeConfiguration>;
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

export function pageRuntimeConfiguration(
	value: unknown,
	adapter: PageRuntimeAdapter,
): Readonly<PageRuntimeConfiguration> | undefined {
	if (value === undefined) return undefined;
	const invalid = () =>
		new AgentBrowserError(
			"invalid-input",
			"Invalid page runtime configuration",
		);
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw invalid();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) throw invalid();
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key !== "classicScripts" && key !== "callbackScheduling")
			throw invalid();
		const descriptor = descriptors[key];
		if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable)
			throw invalid();
		if (
			key === "classicScripts"
				? typeof descriptor.value !== "boolean"
				: descriptor.value !== "after-prefix"
		)
			throw invalid();
	}
	const runtimeOptions: PageRuntimeConfiguration = {
		...(descriptors.classicScripts
			? { classicScripts: descriptors.classicScripts.value as boolean }
			: {}),
		...(descriptors.callbackScheduling
			? { callbackScheduling: "after-prefix" as const }
			: {}),
	};
	if (!Object.keys(runtimeOptions).length) return undefined;
	if (adapter !== "extension")
		throw new AgentBrowserError(
			"unsupported",
			"Page runtime configuration requires the extension adapter",
		);
	return Object.freeze(runtimeOptions);
}

export function pageRuntimeRequest(
	options: unknown,
	adapterKey: "adapter" | "runtimeAdapter" = "adapter",
) {
	if (!options || typeof options !== "object" || Array.isArray(options))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid page runtime options",
		);
	const read = (key: string): unknown => {
		const descriptor = Object.getOwnPropertyDescriptor(options, key);
		if (
			descriptor
				? !Object.hasOwn(descriptor, "value") || !descriptor.enumerable
				: key in options
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page runtime options",
			);
		return descriptor?.value;
	};
	const adapter = pageRuntimeAdapter(read(adapterKey));
	const runtimeOptions = pageRuntimeConfiguration(
		read("runtimeOptions"),
		adapter,
	);
	return Object.freeze({
		adapter,
		...(runtimeOptions ? { runtimeOptions } : {}),
	});
}

export function selectPageRuntime(
	core: unknown,
	requested: PageRuntimeAdapter = "legacy",
	configuration?: Readonly<PageRuntimeConfiguration>,
): PageRuntimeSelection {
	const adapter = pageRuntimeAdapter(requested);
	const runtimeOptions = pageRuntimeConfiguration(configuration, adapter);
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
				: extensionPageRuntime(core as ReleasedCore, runtimeOptions),
		validation: "contract-shape-only",
		...(runtimeOptions ? { runtimeOptions } : {}),
	});
}
