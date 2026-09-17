import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

export type SourceHeadingPolicy = "source-aria-heading-v1";

export interface SourceHeadingMetadata {
	policy: SourceHeadingPolicy;
	level: number;
	levelBasis: "aria-level" | "missing-level-default";
	rendered: false;
	verified: false;
}

const genericTags = new Set([
	"div",
	"span",
	"p",
	"section",
	"article",
	"header",
	"footer",
	"main",
	"aside",
	"hgroup",
]);

export function validateSourceHeadingPolicy(
	value: unknown,
): SourceHeadingPolicy | undefined {
	if (value === undefined || value === "source-aria-heading-v1") return value;
	throw new AgentBrowserError("invalid-input", "Invalid source heading policy");
}

function asciiTrim(value: string): string {
	return value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
}

export function extractSourceHeading(
	tagName: string,
	attributes: Readonly<Record<string, string>>,
): SourceHeadingMetadata | undefined {
	if (
		!genericTags.has(tagName) ||
		!attributes ||
		typeof attributes !== "object"
	)
		return;
	try {
		const role = Object.getOwnPropertyDescriptor(attributes, "role")?.value;
		if (
			typeof role !== "string" ||
			role.length > 64 ||
			asciiTrim(role) !== "heading"
		)
			return;
		const explicit = Object.getOwnPropertyDescriptor(attributes, "aria-level");
		let level = 2;
		if (explicit) {
			const raw = explicit.value;
			if (typeof raw !== "string" || raw.length > 64) return;
			const decimal = asciiTrim(raw);
			if (!/^[1-9][0-9]*$/.test(decimal)) return;
			level = Number(decimal);
			if (!Number.isInteger(level) || level > 2_147_483_647) return;
		}
		return {
			policy: "source-aria-heading-v1",
			level,
			levelBasis: explicit ? "aria-level" : "missing-level-default",
			rendered: false,
			verified: false,
		};
	} catch {
		return;
	}
}

export function documentHeading(
	node: Readonly<DocumentNode>,
	policy?: SourceHeadingPolicy,
): { level: number; sourceHeading?: SourceHeadingMetadata } | undefined {
	validateSourceHeadingPolicy(policy);
	if (node.kind !== "element") return;
	if (/^h[1-6]$/.test(node.tagName))
		return { level: Number(node.tagName.slice(1)) };
	if (policy === undefined || !isHtmlElement(node)) return;
	const sourceHeading = extractSourceHeading(node.tagName, node.attributes);
	if (sourceHeading) return { level: sourceHeading.level, sourceHeading };
}
