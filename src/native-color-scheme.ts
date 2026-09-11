import { AgentBrowserError } from "./errors.js";

export type ColorSchemePreference = "light" | "dark" | null;

export const nativeColorScheme = Object.freeze({
	profile: "native-ua-color-preference",
	preference: null,
	systemIntegration: false,
	siteOverrides: false,
});

export function validateColorSchemePreference(
	preference: unknown,
): ColorSchemePreference {
	if (preference === null || preference === "light" || preference === "dark")
		return preference;
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid color scheme preference",
	);
}

export function effectiveColorScheme(
	preference: ColorSchemePreference | undefined,
): "light" | "dark" {
	return (
		validateColorSchemePreference(
			preference === undefined ? nativeColorScheme.preference : preference,
		) ?? "light"
	);
}
