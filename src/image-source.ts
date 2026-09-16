import { AgentBrowserError } from "./errors.js";

export interface ImageSourceMetadata {
	readonly kind: "native-image-source-v1";
	readonly role: "img";
	readonly attributes: Readonly<
		Partial<Record<"aria-label" | "title", string>>
	>;
}

const selectedAttributes = ["aria-label", "title"] as const;

export function imageSourceRole(
	attributes: Readonly<Record<string, string>>,
): boolean {
	if (!Object.hasOwn(attributes, "role")) return false;
	return attributes.role.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "") === "img";
}

export function extractImageSource(
	attributes: Readonly<Record<string, string>>,
): ImageSourceMetadata | undefined {
	if (!imageSourceRole(attributes)) return;
	const selected: Partial<Record<"aria-label" | "title", string>> = {};
	let nonblank = false;
	for (const name of selectedAttributes) {
		if (!Object.hasOwn(attributes, name)) continue;
		const value = attributes[name];
		if (value.length > 8192)
			throw new AgentBrowserError(
				"resource-limit",
				`Image source ${name} exceeds 8192 UTF-16 code units`,
			);
		selected[name] = value;
		if (value.trim()) nonblank = true;
	}
	if (!nonblank) return;
	return Object.freeze({
		kind: "native-image-source-v1",
		role: "img",
		attributes: Object.freeze(selected),
	});
}

export function imageSourceText(metadata: ImageSourceMetadata): string {
	const fields: string[] = [];
	for (const name of selectedAttributes) {
		if (!Object.hasOwn(metadata.attributes, name)) continue;
		const value = metadata.attributes[name];
		if (value === undefined) continue;
		const cleaned = value
			.replace(/\r\n?/g, "\n")
			.replace(/[\p{Cc}\p{Cf}]/gu, (character) =>
				character === "\n" || character === "\t"
					? character
					: `\\u{${character.codePointAt(0)?.toString(16)}}`,
			);
		fields.push(`${name}=${JSON.stringify(cleaned)}`);
	}
	return `[Image source: ${fields.join("; ")}]`;
}
