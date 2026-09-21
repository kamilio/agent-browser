import {
	type BrowserIdentityOptions,
	createBrowserIdentity,
	defaultBrowserIdentity,
} from "./browser-identity.js";
import { AgentBrowserError } from "./errors.js";

export const maxLanguagesEnvironmentCodeUnits = 4096;

export function sessionIdentityOptions(
	value?: unknown,
): Readonly<BrowserIdentityOptions> {
	try {
		const identity = createBrowserIdentity(value as BrowserIdentityOptions);
		return Object.freeze({
			languages: identity.languages,
			...(identity.userAgent === defaultBrowserIdentity.userAgent
				? {}
				: { userAgent: identity.userAgent }),
		});
	} catch {
		throw new AgentBrowserError("invalid-input", "Invalid browser identity");
	}
}

export function identityFromEnvironment(
	value: string | undefined,
): Readonly<BrowserIdentityOptions> {
	if (value === undefined) return sessionIdentityOptions();
	if (
		typeof value !== "string" ||
		value.length > maxLanguagesEnvironmentCodeUnits
	)
		throw new AgentBrowserError(
			"invalid-input",
			"AGENT_BROWSER_LANGUAGES must be a bounded JSON language array",
		);
	let languages: unknown;
	try {
		languages = JSON.parse(value);
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"AGENT_BROWSER_LANGUAGES must be a bounded JSON language array",
		);
	}
	return sessionIdentityOptions({ languages });
}
