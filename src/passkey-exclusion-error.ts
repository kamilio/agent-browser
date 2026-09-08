const consentedExclusions = new WeakMap<object, AbortSignal>();

export function createConsentedPasskeyExclusionError(
	signal: AbortSignal,
): Error {
	const error = new Error("Ephemeral authenticator operation denied");
	error.name = "InvalidStateError";
	consentedExclusions.set(error, signal);
	return error;
}

export function consumeConsentedPasskeyExclusionError(
	error: unknown,
	signal: AbortSignal,
): boolean {
	if (typeof error !== "object" || error === null) return false;
	if (consentedExclusions.get(error) !== signal) return false;
	return consentedExclusions.delete(error);
}
