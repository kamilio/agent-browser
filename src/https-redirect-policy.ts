import { AgentBrowserError } from "./errors.js";

export type HttpsRedirectPolicy = "same-origin-upgrade-v1";

export function validateHttpsRedirectPolicy(
	value: unknown,
): HttpsRedirectPolicy | undefined {
	if (value === undefined || value === "same-origin-upgrade-v1") return value;
	throw new AgentBrowserError("invalid-input", "Invalid HTTPS redirect policy");
}
