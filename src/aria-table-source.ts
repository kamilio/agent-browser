import { AgentBrowserError } from "./errors.js";

const commonAttributes = [
	"id",
	"role",
	"aria-label",
	"aria-labelledby",
	"aria-describedby",
	"aria-owns",
] as const;
const cellAttributes = [
	...commonAttributes,
	"aria-colindex",
	"aria-rowindex",
	"aria-colspan",
	"aria-rowspan",
] as const;
const attributeNames = {
	table: [...commonAttributes, "aria-colcount", "aria-rowcount"],
	rowgroup: commonAttributes,
	row: [...commonAttributes, "aria-colindex", "aria-rowindex"],
	cell: cellAttributes,
	columnheader: cellAttributes,
	rowheader: cellAttributes,
} as const;

export type AriaTableSourceRole = keyof typeof attributeNames;
export type AriaTableSourceAttribute =
	(typeof attributeNames)[AriaTableSourceRole][number];

export interface AriaTableSourceMetadata {
	kind: "native-aria-table-source-v1";
	tag: string;
	role: AriaTableSourceRole;
	attributes: Partial<Record<AriaTableSourceAttribute, string>>;
}

export function ariaTableSourceRole(
	attributes: Readonly<Record<string, string>>,
): AriaTableSourceRole | undefined {
	if (!Object.hasOwn(attributes, "role")) return undefined;
	const match = /^[\t\n\f\r ]*([a-z]+)[\t\n\f\r ]*$/.exec(attributes.role);
	return match && Object.hasOwn(attributeNames, match[1])
		? (match[1] as AriaTableSourceRole)
		: undefined;
}

export function isAriaTableSourceAttribute(
	role: AriaTableSourceRole,
	attribute: string,
): boolean {
	return attributeNames[role].some((name) => name === attribute);
}

export function extractAriaTableSource(
	tagName: string,
	attributes: Readonly<Record<string, string>>,
): AriaTableSourceMetadata | undefined {
	const role = ariaTableSourceRole(attributes);
	if (role === undefined) return undefined;
	const selected: AriaTableSourceMetadata["attributes"] = {};
	for (const name of attributeNames[role]) {
		if (!Object.hasOwn(attributes, name)) continue;
		const value = attributes[name];
		if (value.length > 4_096)
			throw new AgentBrowserError(
				"resource-limit",
				"Extraction ARIA table attribute limit exceeded",
			);
		selected[name] = value;
	}
	return {
		kind: "native-aria-table-source-v1",
		tag: tagName,
		role,
		attributes: selected,
	};
}
