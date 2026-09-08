import { AgentBrowserError } from "./errors.js";

const policyMessages = Object.freeze({
	"url-scheme": "Only HTTP and HTTPS network URLs are allowed",
	"url-credentials": "Credentials in URLs are not allowed",
	"blocked-port": "Network port is not allowed",
	"origin-not-allowed": "Network origin is not allowed",
	"local-name": "Local network names are not allowed",
	"literal-address-policy":
		"Private or reserved network addresses are not allowed",
	"resolved-address-policy":
		"DNS returned a private, reserved or invalid address",
	"transport-controlled-header": "Transport-controlled request header",
	"method-not-allowed": "HTTP method is not allowed",
	"cookie-header-controlled": "Cookie header is controlled by the session jar",
	"redirect-mode-error": "Redirects are not allowed",
	"https-downgrade": "HTTPS downgrade redirects are not allowed",
});

export type NetworkPolicyReason = keyof typeof policyMessages;

export interface NetworkPolicyDiagnostic {
	readonly kind: "network-policy-v1";
	readonly reason: NetworkPolicyReason;
}

const policyDiagnostics = new WeakMap<
	object,
	Readonly<NetworkPolicyDiagnostic>
>();

export function networkPolicyError(
	reason: NetworkPolicyReason,
): AgentBrowserError {
	if (typeof reason !== "string" || !Object.hasOwn(policyMessages, reason))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid network policy reason",
		);
	const error = new AgentBrowserError("policy-denied", policyMessages[reason]);
	policyDiagnostics.set(
		error,
		Object.freeze({ kind: "network-policy-v1", reason }),
	);
	return error;
}

export function networkPolicyDiagnostic(
	error: unknown,
): Readonly<NetworkPolicyDiagnostic> | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	return policyDiagnostics.get(error);
}
