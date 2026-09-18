import { types } from "node:util";
import { AgentBrowserError } from "../src/errors.js";
import { NetworkPolicy, type NetworkResponse } from "../src/network.js";

export interface ResearchRedirectHandoff {
	kind: "http-redirect-handoff-v1";
	status: number;
	action: "review-before-new-request";
	followed: false;
	reason:
		| "available"
		| "missing-location"
		| "ambiguous-location"
		| "invalid-location"
		| "unsupported-protocol"
		| "credentials"
		| "disallowed-url"
		| "location-limit";
	location: {
		url: string;
		sameOrigin: boolean;
		queryRedacted: boolean;
		fragmentOmitted: boolean;
	} | null;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const locationLimit = 4096;
const policy = new NetworkPolicy();
const handoffFields = [
	"kind",
	"status",
	"action",
	"followed",
	"reason",
	"location",
];
const locationFields = [
	"url",
	"sameOrigin",
	"queryRedacted",
	"fragmentOmitted",
];
const reasons = new Set<ResearchRedirectHandoff["reason"]>([
	"available",
	"missing-location",
	"ambiguous-location",
	"invalid-location",
	"unsupported-protocol",
	"credentials",
	"disallowed-url",
	"location-limit",
]);

function record(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || types.isProxy(value))
		return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function ownValue(value: object, key: string): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	return descriptor && Object.hasOwn(descriptor, "value")
		? descriptor.value
		: undefined;
}

function sourceUrl(value: unknown): URL | undefined {
	if (typeof value !== "string") return undefined;
	try {
		return policy.checkUrl(value);
	} catch {
		return undefined;
	}
}

function locationValue(
	headers: unknown,
):
	| { value: string }
	| { reason: Exclude<ResearchRedirectHandoff["reason"], "available"> } {
	if (!record(headers)) return { reason: "invalid-location" };
	const names = Reflect.ownKeys(headers).filter(
		(name) => typeof name === "string" && name.toLowerCase() === "location",
	);
	if (names.length === 0) return { reason: "missing-location" };
	if (names.length !== 1) return { reason: "ambiguous-location" };
	const values = ownValue(headers, names[0] as string);
	if (types.isProxy(values) || !Array.isArray(values))
		return { reason: "invalid-location" };
	const length = ownValue(values, "length");
	if (length === 0) return { reason: "missing-location" };
	if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0)
		return { reason: "invalid-location" };
	if (length !== 1) return { reason: "ambiguous-location" };
	const value = ownValue(values, "0");
	if (typeof value !== "string") return { reason: "invalid-location" };
	if (value.length > locationLimit) return { reason: "location-limit" };
	if (/\p{Cc}/u.test(value)) return { reason: "invalid-location" };
	if (!value.trim()) return { reason: "missing-location" };
	return { value };
}

export function summarizeResearchRedirect(
	response: Pick<NetworkResponse, "url" | "status" | "headers">,
): ResearchRedirectHandoff | undefined {
	if (!record(response)) return undefined;
	const status = ownValue(response, "status");
	if (typeof status !== "number" || !redirectStatuses.has(status))
		return undefined;
	const handoff = (
		reason: ResearchRedirectHandoff["reason"],
		location: ResearchRedirectHandoff["location"] = null,
	): ResearchRedirectHandoff => ({
		kind: "http-redirect-handoff-v1",
		status,
		action: "review-before-new-request",
		followed: false,
		reason,
		location,
	});
	const source = sourceUrl(ownValue(response, "url"));
	if (!source) return handoff("invalid-location");
	const selected = locationValue(ownValue(response, "headers"));
	if ("reason" in selected) return handoff(selected.reason);
	let destination: URL;
	try {
		destination = new URL(selected.value, source);
	} catch {
		return handoff("invalid-location");
	}
	if (!["http:", "https:"].includes(destination.protocol))
		return handoff("unsupported-protocol");
	if (destination.username || destination.password)
		return handoff("credentials");
	const originalUrl = destination.href;
	const fragmentOmitted = destination.href.includes("#");
	destination.hash = "";
	const queryRedacted = destination.href.includes("?");
	if (queryRedacted) destination.search = "?redacted";
	if (destination.href.length > locationLimit) return handoff("location-limit");
	try {
		policy.checkUrl(originalUrl);
	} catch {
		return handoff("disallowed-url");
	}
	return handoff("available", {
		url: destination.href,
		sameOrigin: destination.origin === source.origin,
		queryRedacted,
		fragmentOmitted,
	});
}

function invalid(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid research redirect handoff",
	);
}

function exactFields(value: unknown, expected: readonly string[]) {
	if (!record(value)) invalid();
	const keys = Reflect.ownKeys(value);
	if (
		keys.length !== expected.length ||
		keys.some((key) => typeof key !== "string" || !expected.includes(key))
	)
		invalid();
	const fields: Record<string, unknown> = Object.create(null);
	for (const key of expected) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !Object.hasOwn(descriptor, "value")) invalid();
		fields[key] = descriptor.value;
	}
	return fields;
}

export function validateResearchRedirectHandoff(
	value: unknown,
	fromUrl: string,
	status: number,
): void {
	const source = sourceUrl(fromUrl);
	if (!source || !redirectStatuses.has(status)) invalid();
	const fields = exactFields(value, handoffFields);
	if (
		fields.kind !== "http-redirect-handoff-v1" ||
		fields.status !== status ||
		fields.action !== "review-before-new-request" ||
		fields.followed !== false ||
		typeof fields.reason !== "string" ||
		!reasons.has(fields.reason as ResearchRedirectHandoff["reason"])
	)
		invalid();
	if (fields.reason !== "available") {
		if (fields.location !== null) invalid();
		return;
	}
	const location = exactFields(fields.location, locationFields);
	if (
		typeof location.url !== "string" ||
		location.url.length > locationLimit ||
		typeof location.sameOrigin !== "boolean" ||
		typeof location.queryRedacted !== "boolean" ||
		typeof location.fragmentOmitted !== "boolean"
	)
		invalid();
	const destination = sourceUrl(location.url);
	if (
		!destination ||
		destination.href !== location.url ||
		destination.href.includes("#") ||
		location.sameOrigin !== (destination.origin === source.origin) ||
		(location.queryRedacted
			? destination.search !== "?redacted"
			: destination.href.includes("?"))
	)
		invalid();
}
