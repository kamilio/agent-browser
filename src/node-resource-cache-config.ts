import { AgentBrowserError } from "./errors.js";

export function resourceCacheFromEnvironment(
	setting: string | undefined,
	context: {
		documentProfile: "native" | "reader";
		processRuntime: boolean;
	},
): boolean {
	if (setting === undefined) return false;
	if (setting !== "public-anonymous-v1")
		throw new AgentBrowserError(
			"invalid-input",
			"AGENT_BROWSER_RESOURCE_CACHE must be public-anonymous-v1 when provided",
		);
	if (context.documentProfile !== "native" || context.processRuntime)
		throw new AgentBrowserError(
			"unsupported",
			"Resource reuse requires the native document profile without a process or page-script runtime",
		);
	return true;
}
