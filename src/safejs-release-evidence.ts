const coreLabels = [
	"Realm-owned host aliases preserve identity and indexed reads",
	"Indexed capabilities remain live across evaluations",
	"Named writes reach native storage",
	"Named deletion reaches native storage",
	"Native named updates are visible without replacing the host object",
	"Named mutation cannot overwrite fixed members",
	"Explicit nested operations finish before the next guest statement",
	"Repeated close runs extension cleanup exactly once",
	"Closed realms reject further evaluation",
	"Context callback prefix completes while the final result remains pending",
	"Realm callback progresses while an earlier async tail is pending",
	"A new source evaluation progresses after a callback prefix while its async tail remains pending",
	"Callback result preserves async ordering and returned data",
	"Retained guest arguments can return through the owning callback",
	"Released guest references reject reuse",
	"Owner closure rejects a suspended callback without releasing its host wait",
	"Builtin console remains protected without explicit authorization before setup",
	"Authorized console and Window aliases share the actual owned host object",
	"Authorized console cleanup runs once across repeated owner closure",
] as const;

const pageLabels = [
	"Released extension setup preserves document, Window and owned console identity",
	"Owned console methods beyond the builtin sink remain available",
	"The shared console journal receives calls through the owned global",
	"Native label-targeted fill runs the released interpreter input handler",
	"Native click runs the released callback and updates the same document",
	"Retained timer arguments preserve guest identity, primitives and Window receiver",
	"Session-owned storage and history globals are declared and live",
	"Callback prefix cancellation prevents default without awaiting its pending async tail",
	"Reload closes the old extension owner while preserving session storage",
	"All released page owners close with no pending callbacks or timers",
] as const;

const moduleLabels = [
	"HTML module load completes without errors",
	"Inline modules mutate the native DOM in distinct scopes",
	"External entry imports its dependency",
	"Duplicate external entry evaluates and fetches once",
	"Modules keep document.currentScript null",
	"Thrown module error is surfaced without success",
	"All fixture owners close",
] as const;

function isRecord(value: unknown): value is object {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function ownValue(value: object, key: PropertyKey): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	return descriptor && Object.hasOwn(descriptor, "value")
		? descriptor.value
		: undefined;
}

function timestamp(value: unknown): number {
	if (typeof value !== "string") return Number.NaN;
	const milliseconds = Date.parse(value);
	return Number.isFinite(milliseconds) &&
		new Date(milliseconds).toISOString() === value
		? milliseconds
		: Number.NaN;
}

export function validateSafeJsReleaseEvidence(
	kind: "core" | "page" | "modules",
	value: unknown,
	version: string,
): boolean {
	try {
		if (
			(kind !== "core" && kind !== "page" && kind !== "modules") ||
			typeof version !== "string" ||
			version.length === 0 ||
			!isRecord(value) ||
			(kind === "modules"
				? ownValue(value, "failure") !== null
				: Object.hasOwn(value, "failure")) ||
			ownValue(value, "completed") !== true ||
			ownValue(value, "publicationProvenanceVerified") !== false
		)
			return false;

		const selected = ownValue(value, "selected");
		if (
			!isRecord(selected) ||
			ownValue(selected, "packageName") !== "@poe-platform/safe-js" ||
			ownValue(selected, "version") !== version
		)
			return false;

		const scope =
			kind === "core"
				? "explicit-local-release-contract-probe"
				: kind === "page"
					? "explicit-local-release-native-browser-in-memory"
					: "explicit-local-release-html-modules-in-memory";
		if (ownValue(value, "scope") !== scope) return false;
		if (kind === "core") {
			if (
				ownValue(value, "browserIntegrationVerified") !== false ||
				!Object.hasOwn(value, "cleanupFailures")
			)
				return false;
		} else if (
			ownValue(value, "realNetwork") !== false ||
			ownValue(value, "realPty") !== false
		) {
			return false;
		}
		if (Object.hasOwn(value, "cleanupFailures")) {
			const cleanupFailures = ownValue(value, "cleanupFailures");
			if (
				!Array.isArray(cleanupFailures) ||
				ownValue(cleanupFailures, "length") !== 0
			)
				return false;
		}
		if (kind === "modules" && !Object.hasOwn(value, "cleanupFailures"))
			return false;

		const startedAt = timestamp(ownValue(value, "startedAt"));
		const finishedAt = timestamp(ownValue(value, "finishedAt"));
		if (!(startedAt <= finishedAt)) return false;

		const labels =
			kind === "core"
				? coreLabels
				: kind === "page"
					? pageLabels
					: moduleLabels;
		const checks = ownValue(value, "checks");
		if (
			ownValue(value, "passed") !== labels.length ||
			!Array.isArray(checks) ||
			ownValue(checks, "length") !== labels.length
		)
			return false;
		return labels.every((label, index) => {
			const entry = ownValue(checks, String(index));
			return (
				isRecord(entry) &&
				ownValue(entry, "label") === label &&
				ownValue(entry, "passed") === true
			);
		});
	} catch {
		return false;
	}
}
