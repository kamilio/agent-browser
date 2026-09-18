import { AgentBrowserError } from "./errors.js";

export interface ScriptLoadingOptions {
	readonly maxScripts?: number;
	readonly maxExternal?: number;
	readonly maxSourceBytes?: number;
	readonly navigationTimeoutMs?: number;
}

const maximums = Object.freeze({
	maxScripts: 256,
	maxExternal: 64,
	maxSourceBytes: 8_388_608,
	navigationTimeoutMs: 300_000,
});

export function scriptLoadingSelection(
	input: unknown,
): Readonly<ScriptLoadingOptions> | undefined {
	const invalid = () =>
		new AgentBrowserError("invalid-input", "Invalid script loading options");
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw invalid();
	const descriptor = Object.getOwnPropertyDescriptor(input, "scriptLoading");
	if (
		descriptor
			? !Object.hasOwn(descriptor, "value") || !descriptor.enumerable
			: "scriptLoading" in input
	)
		throw invalid();
	const value: unknown = descriptor?.value;
	if (value === undefined) return undefined;
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw invalid();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== null && prototype !== Object.prototype) throw invalid();
	if (Object.getOwnPropertySymbols(value).length) throw invalid();
	const names = Object.getOwnPropertyNames(value);
	if (names.length > 4) throw invalid();
	const result: Record<string, number> = {};
	for (const name of names) {
		if (!Object.hasOwn(maximums, name)) throw invalid();
		const entry = Object.getOwnPropertyDescriptor(value, name);
		if (!entry || !Object.hasOwn(entry, "value") || !entry.enumerable)
			throw invalid();
		const setting: unknown = entry.value;
		if (
			typeof setting !== "number" ||
			!Number.isSafeInteger(setting) ||
			setting < 1 ||
			setting > maximums[name as keyof typeof maximums]
		)
			throw invalid();
		result[name] = setting;
	}
	return Object.freeze(result);
}
