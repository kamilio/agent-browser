import type { NetworkResponse } from "./network.js";

const enforcedHeaderName = "content-security-policy";
const maxFields = 64;
const maxValues = 64;
const maxPolicies = 64;
const maxPolicyUnits = 32768;
const maxDirectives = 1024;

function trimPolicyWhitespace(value: string): string {
	let start = 0;
	let end = value.length;
	while (start < end && (value[start] === " " || value[start] === "\t"))
		start++;
	while (end > start && (value[end - 1] === " " || value[end - 1] === "\t"))
		end--;
	return value.slice(start, end);
}

export function hasUnsupportedExecutionCsp(
	headers: NetworkResponse["headers"],
	topLevelDocument = false,
): boolean {
	try {
		if (
			typeof headers !== "object" ||
			headers === null ||
			Array.isArray(headers)
		)
			return true;
		const prototype = Object.getPrototypeOf(headers);
		if (prototype !== null && prototype !== Object.prototype) return true;
		if (
			enforcedHeaderName in headers &&
			!Object.hasOwn(headers, enforcedHeaderName)
		)
			return true;
		const values: string[] = [];
		let fields = 0;
		let policyUnits = 0;
		for (const name of Object.getOwnPropertyNames(headers)) {
			if (
				name.length !== enforcedHeaderName.length ||
				name.toLowerCase() !== enforcedHeaderName
			)
				continue;
			if (topLevelDocument !== true || ++fields > maxFields) return true;
			const descriptor = Object.getOwnPropertyDescriptor(headers, name);
			if (!descriptor || !Object.hasOwn(descriptor, "value")) return true;
			const entries: unknown = descriptor.value;
			if (!Array.isArray(entries)) return true;
			const lengthDescriptor = Object.getOwnPropertyDescriptor(
				entries,
				"length",
			);
			if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value"))
				return true;
			const length: unknown = lengthDescriptor.value;
			if (
				typeof length !== "number" ||
				!Number.isInteger(length) ||
				length < 1 ||
				length > maxValues - values.length
			)
				return true;
			for (let index = 0; index < length; index++) {
				const entryDescriptor = Object.getOwnPropertyDescriptor(
					entries,
					String(index),
				);
				if (!entryDescriptor || !Object.hasOwn(entryDescriptor, "value"))
					return true;
				const entry: unknown = entryDescriptor.value;
				if (typeof entry !== "string") return true;
				policyUnits += entry.length;
				if (policyUnits > maxPolicyUnits) return true;
				values.push(entry);
			}
		}
		let policies = 0;
		let directives = 0;
		for (const value of values) {
			if (++policies > maxPolicies || ++directives > maxDirectives) return true;
			for (let offset = 0; offset < value.length; offset++) {
				const code = value.charCodeAt(offset);
				if ((code < 32 && code !== 9) || code === 127 || code > 255)
					return true;
				if (code === 44 && ++policies > maxPolicies) return true;
				if ((code === 44 || code === 59) && ++directives > maxDirectives)
					return true;
			}
		}
		for (const value of values) {
			for (const policy of value.split(",")) {
				for (const token of policy.split(";")) {
					const directive = trimPolicyWhitespace(token);
					if (!directive) continue;
					const name = directive.split(/[\t ]/, 1)[0].toLowerCase();
					if (
						name !== "frame-ancestors" &&
						name !== "report-uri" &&
						name !== "report-to"
					)
						return true;
				}
			}
		}
		return false;
	} catch {
		return true;
	}
}
