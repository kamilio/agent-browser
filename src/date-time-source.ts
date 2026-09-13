import { AgentBrowserError } from "./errors.js";

export type DateTimeSourceTag = "time" | "ins" | "del";

export interface DateTimeSourceMetadata {
	kind: "native-date-time-source-v1";
	tag: DateTimeSourceTag;
	value: string;
}

export function isDateTimeSourceTag(
	tagName: string,
): tagName is DateTimeSourceTag {
	return tagName === "time" || tagName === "ins" || tagName === "del";
}

export function extractDateTimeSource(
	tagName: string,
	attributes: Readonly<Record<string, string>>,
): DateTimeSourceMetadata | undefined {
	if (!isDateTimeSourceTag(tagName) || !Object.hasOwn(attributes, "datetime"))
		return undefined;
	const value = attributes.datetime;
	if (value.length > 4_096)
		throw new AgentBrowserError(
			"resource-limit",
			"Extraction datetime attribute limit exceeded",
		);
	return { kind: "native-date-time-source-v1", tag: tagName, value };
}
