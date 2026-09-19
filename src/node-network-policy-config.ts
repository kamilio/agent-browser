import { AgentBrowserError } from "./errors.js";
import {
	NetworkPolicy,
	type NetworkPolicyOptions,
	parseNetworkUrl,
} from "./network.js";

export function blockedOriginsFromEnvironment(
	setting: string | undefined,
): Readonly<Pick<NetworkPolicyOptions, "blockedOrigins">> | undefined {
	if (setting === undefined) return undefined;
	try {
		if (typeof setting !== "string" || setting.length > 16_384)
			throw new Error();
		const values: unknown = JSON.parse(setting);
		if (!Array.isArray(values) || values.length > 128) throw new Error();
		const origins = values.map((value: unknown) => {
			if (
				typeof value !== "string" ||
				!/^https?:\/\/[^/?#\\@\s]+\/?$/i.test(value)
			)
				throw new Error();
			return value;
		});
		new NetworkPolicy({ blockedOrigins: origins });
		return Object.freeze({
			blockedOrigins: Object.freeze([
				...new Set(origins.map((origin) => parseNetworkUrl(origin).origin)),
			]),
		});
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"AGENT_BROWSER_BLOCKED_ORIGINS must be a JSON array of at most 128 HTTP(S) origins within 16384 code units",
		);
	}
}
