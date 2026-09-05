import { AgentBrowserError } from "./errors.js";

export type DocumentProfile = "native" | "reader";

export type DocumentProfileEnvironment = Readonly<
	Record<string, string | undefined>
>;

export function documentProfileFromEnvironment(
	environment: DocumentProfileEnvironment,
): DocumentProfile {
	const profile = environment.AGENT_BROWSER_DOCUMENT_PROFILE;
	if (profile === undefined || profile === "native") return "native";
	if (profile !== "reader")
		throw new AgentBrowserError(
			"invalid-input",
			"AGENT_BROWSER_DOCUMENT_PROFILE must be native or reader when provided",
		);
	for (const setting of [
		"AGENT_BROWSER_SAFEJS_ROOT",
		"AGENT_BROWSER_SECRET_CONFIG",
		"AGENT_BROWSER_PAGE_RUNTIME",
		"AGENT_BROWSER_PAGE_SCRIPTS",
	] as const)
		if (environment[setting] !== undefined)
			throw new AgentBrowserError(
				"invalid-input",
				`Reader document profile is incompatible with ${setting}`,
			);
	return profile;
}
