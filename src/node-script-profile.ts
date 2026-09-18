import { AgentBrowserError } from "./errors.js";
import type { ScriptBudgetProfile } from "./safejs.js";

export interface ScriptProfileConfiguration {
	readonly scripts?: Readonly<{ budgetProfile: ScriptBudgetProfile }>;
	readonly commandTimeoutMs?: number;
}

export function scriptProfileFromEnvironment(
	environment: unknown,
): Readonly<ScriptProfileConfiguration> {
	if (
		!environment ||
		typeof environment !== "object" ||
		Array.isArray(environment)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid script profile environment",
		);
	const read = (key: string): string | undefined => {
		const descriptor = Object.getOwnPropertyDescriptor(environment, key);
		if (
			descriptor
				? !Object.hasOwn(descriptor, "value") || !descriptor.enumerable
				: key in environment
		)
			throw new AgentBrowserError(
				"invalid-input",
				`Invalid ${key} configuration`,
			);
		const value = descriptor?.value;
		if (value !== undefined && typeof value !== "string")
			throw new AgentBrowserError(
				"invalid-input",
				`${key} must be a primitive string when provided`,
			);
		return value;
	};
	const budgetProfile = read("AGENT_BROWSER_SCRIPT_BUDGET_PROFILE");
	const timeout = read("AGENT_BROWSER_COMMAND_TIMEOUT_MS");
	if (
		budgetProfile !== undefined &&
		budgetProfile !== "bounded-v1" &&
		budgetProfile !== "large-source-v1" &&
		budgetProfile !== "application-v1"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"AGENT_BROWSER_SCRIPT_BUDGET_PROFILE must be bounded-v1, large-source-v1 or application-v1 when provided",
		);
	let commandTimeoutMs: number | undefined;
	if (timeout !== undefined) {
		if (!/^[1-9][0-9]{0,5}(?![\s\S])/.test(timeout))
			throw new AgentBrowserError(
				"invalid-input",
				"AGENT_BROWSER_COMMAND_TIMEOUT_MS must be a decimal integer from 20 through 300000",
			);
		commandTimeoutMs = Number(timeout);
		if (
			!Number.isSafeInteger(commandTimeoutMs) ||
			commandTimeoutMs < 20 ||
			commandTimeoutMs > 300_000
		)
			throw new AgentBrowserError(
				"invalid-input",
				"AGENT_BROWSER_COMMAND_TIMEOUT_MS must be a decimal integer from 20 through 300000",
			);
	}
	if (budgetProfile === undefined && commandTimeoutMs === undefined)
		return Object.freeze({});
	if (read("AGENT_BROWSER_DOCUMENT_PROFILE") === "reader")
		throw new AgentBrowserError(
			"invalid-input",
			`Reader document profile is incompatible with ${budgetProfile !== undefined ? "AGENT_BROWSER_SCRIPT_BUDGET_PROFILE" : "AGENT_BROWSER_COMMAND_TIMEOUT_MS"}`,
		);
	if (!read("AGENT_BROWSER_SAFEJS_ROOT"))
		throw new AgentBrowserError(
			"invalid-input",
			"Script profile and command timeout selections require an explicit SafeJS package root",
		);
	if (
		budgetProfile !== undefined &&
		read("AGENT_BROWSER_PAGE_RUNTIME") !== "extension"
	)
		throw new AgentBrowserError(
			"unsupported",
			"AGENT_BROWSER_SCRIPT_BUDGET_PROFILE requires the explicit extension page runtime",
		);
	return Object.freeze({
		...(budgetProfile !== undefined
			? { scripts: Object.freeze({ budgetProfile }) }
			: {}),
		...(commandTimeoutMs !== undefined ? { commandTimeoutMs } : {}),
	});
}
