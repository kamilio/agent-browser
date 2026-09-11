import { AgentBrowserError } from "./errors.js";

const attributeNames = {
	table: ["id"],
	caption: ["id"],
	thead: ["id"],
	tbody: ["id"],
	tfoot: ["id"],
	tr: ["id"],
	col: ["id", "span"],
	colgroup: ["id", "span"],
	td: ["id", "headers", "colspan", "rowspan"],
	th: ["id", "headers", "colspan", "rowspan", "scope", "abbr"],
} as const;

export type TableSourceTag = keyof typeof attributeNames;
export type TableSourceAttribute =
	(typeof attributeNames)[TableSourceTag][number];

export interface TableSourceMetadata {
	kind: "native-table-source-v1";
	tag: TableSourceTag;
	attributes: Partial<Record<TableSourceAttribute, string>>;
}

function namesFor(
	tagName: string,
): readonly TableSourceAttribute[] | undefined {
	return Object.hasOwn(attributeNames, tagName)
		? attributeNames[tagName as TableSourceTag]
		: undefined;
}

export function isTableSourceAttribute(
	tagName: string,
	attribute: string,
): boolean {
	return namesFor(tagName)?.some((name) => name === attribute) ?? false;
}

export function extractTableSource(
	tagName: string,
	attributes: Readonly<Record<string, string>>,
): TableSourceMetadata | undefined {
	const names = namesFor(tagName);
	if (!names) return undefined;
	const selected: TableSourceMetadata["attributes"] = {};
	for (const name of names) {
		if (!Object.hasOwn(attributes, name)) continue;
		const value = attributes[name];
		if (value.length > 4_096)
			throw new AgentBrowserError(
				"resource-limit",
				"Extraction table attribute limit exceeded",
			);
		selected[name] = value;
	}
	return {
		kind: "native-table-source-v1",
		tag: tagName as TableSourceTag,
		attributes: selected,
	};
}
