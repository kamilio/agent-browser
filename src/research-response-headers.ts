import type { NetworkResponse } from "./network.js";

export const researchResponseHeaderNamesV1 = Object.freeze([
	"content-type",
	"content-length",
	"content-encoding",
	"cf-mitigated",
	"retry-after",
] as const);

export const researchResponseHeaderNames = Object.freeze([
	...researchResponseHeaderNamesV1,
	"content-security-policy",
	"content-security-policy-report-only",
] as const);

export const researchResponseHeaderLimits = Object.freeze({
	maxValues: 16,
	maxValueCodeUnits: 160,
	maxPolicyCodeUnits: 16384,
});

export interface ResearchResponseHeaderCapture {
	readonly kind:
		| "selected-response-headers-v1"
		| "selected-response-headers-v2";
	readonly partial: true;
	readonly omitted: readonly (typeof researchResponseHeaderNames)[number][];
}

function captureValues(
	value: unknown,
	isPolicy: boolean,
): readonly string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
	if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value"))
		return undefined;
	const length: unknown = lengthDescriptor.value;
	if (
		typeof length !== "number" ||
		!Number.isInteger(length) ||
		length < 1 ||
		length > researchResponseHeaderLimits.maxValues
	)
		return undefined;
	const captured: string[] = [];
	let policyCodeUnits = 0;
	for (let index = 0; index < length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor || !Object.hasOwn(descriptor, "value")) return undefined;
		const entry: unknown = descriptor.value;
		if (typeof entry !== "string") return undefined;
		if (isPolicy) {
			policyCodeUnits += entry.length;
			if (policyCodeUnits > researchResponseHeaderLimits.maxPolicyCodeUnits)
				return undefined;
		} else if (entry.length > researchResponseHeaderLimits.maxValueCodeUnits) {
			return undefined;
		}
		for (let offset = 0; offset < entry.length; offset++) {
			const code = entry.charCodeAt(offset);
			if ((code < 32 && code !== 9) || code === 127 || code > 255)
				return undefined;
		}
		captured.push(entry);
	}
	return Object.freeze(captured);
}

export function captureResearchResponseHeaders(
	headers: NetworkResponse["headers"],
	version: ResearchResponseHeaderCapture["kind"] = "selected-response-headers-v2",
): {
	readonly headers: Readonly<Record<string, readonly string[]>>;
	readonly headerCapture: ResearchResponseHeaderCapture;
} {
	if (
		version !== "selected-response-headers-v1" &&
		version !== "selected-response-headers-v2"
	)
		throw new TypeError("Invalid response header capture version");
	const names =
		version === "selected-response-headers-v1"
			? researchResponseHeaderNamesV1
			: researchResponseHeaderNames;
	const captured: Record<string, readonly string[]> = {};
	const omitted: (typeof researchResponseHeaderNames)[number][] = [];
	for (const name of names) {
		const descriptor = Object.getOwnPropertyDescriptor(headers, name);
		if (!descriptor) continue;
		const values = Object.hasOwn(descriptor, "value")
			? captureValues(
					descriptor.value,
					name === "content-security-policy" ||
						name === "content-security-policy-report-only",
				)
			: undefined;
		if (values === undefined) omitted.push(name);
		else captured[name] = values;
	}
	return Object.freeze({
		headers: Object.freeze(captured),
		headerCapture: Object.freeze({
			kind: version,
			partial: true,
			omitted: Object.freeze(omitted),
		}),
	});
}
