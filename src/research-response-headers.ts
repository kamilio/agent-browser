import type { NetworkResponse } from "./network.js";

export const researchResponseHeaderNames = Object.freeze([
	"content-type",
	"content-length",
	"content-encoding",
	"cf-mitigated",
	"retry-after",
] as const);

export const researchResponseHeaderLimits = Object.freeze({
	maxValues: 16,
	maxValueCodeUnits: 160,
});

export interface ResearchResponseHeaderCapture {
	readonly kind: "selected-response-headers-v1";
	readonly partial: true;
	readonly omitted: readonly (typeof researchResponseHeaderNames)[number][];
}

function captureValues(value: unknown): readonly string[] | undefined {
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
	for (let index = 0; index < length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor || !Object.hasOwn(descriptor, "value")) return undefined;
		const entry: unknown = descriptor.value;
		if (
			typeof entry !== "string" ||
			entry.length > researchResponseHeaderLimits.maxValueCodeUnits
		)
			return undefined;
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
): {
	readonly headers: Readonly<Record<string, readonly string[]>>;
	readonly headerCapture: ResearchResponseHeaderCapture;
} {
	const captured: Record<string, readonly string[]> = {};
	const omitted: (typeof researchResponseHeaderNames)[number][] = [];
	for (const name of researchResponseHeaderNames) {
		const descriptor = Object.getOwnPropertyDescriptor(headers, name);
		if (!descriptor) continue;
		const values = Object.hasOwn(descriptor, "value")
			? captureValues(descriptor.value)
			: undefined;
		if (values === undefined) omitted.push(name);
		else captured[name] = values;
	}
	return Object.freeze({
		headers: Object.freeze(captured),
		headerCapture: Object.freeze({
			kind: "selected-response-headers-v1",
			partial: true,
			omitted: Object.freeze(omitted),
		}),
	});
}
