import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface ResearchSourceDataTables {
	readonly kind: "html-data-json-tables-v1";
	readonly scope: "document-source";
	readonly partial: true;
	readonly rendered: false;
	readonly truncated: boolean;
	readonly tables: readonly ResearchSourceDataTable[];
}

export interface ResearchSourceDataTable {
	readonly source: Readonly<{
		attribute: "data-json";
		tag: string;
		offset: number;
		id?: string;
	}>;
	readonly rows: readonly ResearchSourceDataRow[];
	readonly truncated: boolean;
}

export interface ResearchSourceDataRow {
	readonly title: string;
	readonly fields: readonly Readonly<{
		key: string;
		label: string;
		value: string;
		prefix?: string;
		suffix?: string;
		hidePrefix?: boolean;
	}>[];
	readonly truncated: boolean;
}

type Field = ResearchSourceDataRow["fields"][number];
type MutableRow = { title: string; fields: Field[]; truncated: boolean };
type MutableTable = {
	source: ResearchSourceDataTable["source"];
	rows: MutableRow[];
	truncated: boolean;
};

const information = new WeakMap<DocumentTree, ResearchSourceDataTables>();
const sensitiveKeys = new Set(["__proto__", "prototype", "constructor"]);
const encoder = new TextEncoder();

function plainObject(value: unknown): value is Record<string, unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function own(object: Record<string, unknown>, key: string): unknown {
	return Object.hasOwn(object, key) ? object[key] : undefined;
}

function escapeControls(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/[\p{Cc}\p{Cf}]/gu, (character) =>
			character === "\n" || character === "\t"
				? character
				: `\\u{${character.codePointAt(0)?.toString(16)}}`,
		);
}

function boundedString(
	value: unknown,
	limit: number,
	onTruncate: () => void,
): string | undefined {
	if (typeof value !== "string") return undefined;
	if (value.length > limit) {
		onTruncate();
		return undefined;
	}
	const escaped = escapeControls(value);
	if (escaped.length > limit) {
		onTruncate();
		return undefined;
	}
	return escaped;
}

function collectRow(value: unknown): {
	row?: MutableRow;
	truncated: boolean;
} {
	let truncated = false;
	const truncate = () => {
		truncated = true;
	};
	if (!plainObject(value)) return { truncated };
	const title = boundedString(own(value, "title"), 256, truncate);
	const elements = own(value, "elements");
	const order = own(value, "elementsOrder");
	if (!title?.trim() || !plainObject(elements) || !Array.isArray(order))
		return { truncated };
	const fields: Field[] = [];
	const seen = new Set<string>();
	for (const rawKey of order) {
		if (typeof rawKey !== "string" || sensitiveKeys.has(rawKey)) continue;
		const key = boundedString(rawKey, 128, truncate);
		if (key === undefined || seen.has(rawKey)) continue;
		seen.add(rawKey);
		const element = own(elements, rawKey);
		if (!plainObject(element)) continue;
		const label = boundedString(own(element, "title"), 256, truncate);
		const formatted = boundedString(
			own(element, "formatValue"),
			1024,
			truncate,
		);
		if (!label?.trim() || formatted === undefined) continue;
		const field: {
			key: string;
			label: string;
			value: string;
			prefix?: string;
			suffix?: string;
			hidePrefix?: boolean;
		} = { key, label, value: formatted };
		let supported = true;
		for (const qualifier of ["prefix", "suffix"] as const) {
			if (!Object.hasOwn(element, qualifier)) continue;
			const text = boundedString(element[qualifier], 128, truncate);
			if (text === undefined) supported = false;
			else if (text !== "") field[qualifier] = text;
		}
		if (Object.hasOwn(element, "hidePrefix")) {
			if (typeof element.hidePrefix === "boolean")
				field.hidePrefix = element.hidePrefix;
			else supported = false;
		}
		if (!supported) continue;
		if (fields.length === 32) {
			truncate();
			break;
		}
		fields.push(field);
	}
	return fields.length
		? { row: { title, fields, truncated }, truncated }
		: { truncated };
}

function freezeTable(table: ResearchSourceDataTable): ResearchSourceDataTable {
	const source: {
		attribute: "data-json";
		tag: string;
		offset: number;
		id?: string;
	} = {
		attribute: "data-json",
		tag: table.source.tag,
		offset: table.source.offset,
	};
	if (table.source.id !== undefined) source.id = table.source.id;
	return Object.freeze({
		source: Object.freeze(source),
		rows: Object.freeze(
			table.rows.map((row) =>
				Object.freeze({
					title: row.title,
					fields: Object.freeze(
						row.fields.map((field) => {
							const copy: {
								key: string;
								label: string;
								value: string;
								prefix?: string;
								suffix?: string;
								hidePrefix?: boolean;
							} = { key: field.key, label: field.label, value: field.value };
							if (field.prefix !== undefined) copy.prefix = field.prefix;
							if (field.suffix !== undefined) copy.suffix = field.suffix;
							if (field.hidePrefix !== undefined)
								copy.hidePrefix = field.hidePrefix;
							return Object.freeze(copy);
						}),
					),
					truncated: row.truncated,
				}),
			),
		),
		truncated: table.truncated,
	});
}

function envelope(
	tables: readonly ResearchSourceDataTable[],
	truncated: boolean,
): ResearchSourceDataTables {
	return {
		kind: "html-data-json-tables-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		truncated,
		tables,
	};
}

function serializedBytes(value: unknown): number {
	return encoder.encode(JSON.stringify(value)).length;
}

export class ResearchSourceDataTableCollector {
	private readonly tables: ResearchSourceDataTable[] = [];
	private encountered = 0;
	private inspected = 0;
	private rows = 0;
	private truncated = false;
	private exhausted = false;
	private snapshot: ResearchSourceDataTables | undefined;

	add(
		tag: string,
		attributes: Readonly<Record<string, string>>,
		offset: number,
	): void {
		if (!Object.hasOwn(attributes, "data-json")) return;
		if (this.exhausted) return;
		if (
			this.encountered === 16 ||
			this.tables.length === 8 ||
			this.rows === 64
		) {
			this.truncate();
			this.exhausted = true;
			return;
		}
		this.encountered++;
		const input = attributes["data-json"];
		if (typeof input !== "string") return;
		if (input.length > 65536) {
			this.truncate();
			return;
		}
		if (input.length > 262144 - this.inspected) {
			this.truncate();
			this.exhausted = true;
			return;
		}
		this.inspected += input.length;
		let root: unknown;
		try {
			root = JSON.parse(input);
		} catch {
			return;
		}
		if (!plainObject(root)) return;
		const items = own(root, "items");
		if (!Array.isArray(items)) return;
		if (!Number.isSafeInteger(offset) || offset < 0) return;
		const source: {
			attribute: "data-json";
			tag: string;
			offset: number;
			id?: string;
		} = { attribute: "data-json", tag: escapeControls(tag), offset };
		const table: MutableTable = { source, rows: [], truncated: false };
		if (Object.hasOwn(attributes, "id")) {
			const id = boundedString(attributes.id, 256, () => {
				table.truncated = true;
			});
			if (id !== undefined && id !== "") source.id = id;
		}
		for (const item of items) {
			if (this.rows + table.rows.length === 64) {
				table.truncated = true;
				break;
			}
			const result = collectRow(item);
			if (result.truncated) table.truncated = true;
			if (result.row) table.rows.push(result.row);
		}
		if (table.truncated) this.truncate();
		if (!table.rows.length) return;
		this.fit(table);
		if (!table.rows.length) return;
		this.tables.push(freezeTable(table));
		this.rows += table.rows.length;
		this.snapshot = undefined;
	}

	finish(): ResearchSourceDataTables | undefined {
		if (!this.tables.length && !this.truncated) return undefined;
		this.snapshot ??= Object.freeze(
			envelope(Object.freeze(this.tables.slice()), this.truncated),
		);
		return this.snapshot;
	}

	private truncate(): void {
		this.truncated = true;
		this.snapshot = undefined;
	}

	private fit(table: MutableTable): void {
		let bytes = serializedBytes(
			envelope([...this.tables, table], this.truncated),
		);
		if (bytes <= 65536) return;
		if (!this.truncated) bytes--;
		this.truncate();
		this.exhausted = true;
		if (!table.truncated) {
			table.truncated = true;
			bytes--;
		}
		while (bytes > 65536 && table.rows.length) {
			const row = table.rows[table.rows.length - 1];
			if (!row.truncated) {
				row.truncated = true;
				bytes--;
			}
			if (bytes <= 65536) break;
			const field = row.fields.pop();
			bytes -= serializedBytes(field) + (row.fields.length ? 1 : 0);
			if (!row.fields.length) {
				bytes -= serializedBytes(row) + (table.rows.length > 1 ? 1 : 0);
				table.rows.pop();
			}
		}
	}
}

export function researchSourceDataTables(
	tree: DocumentTree,
): ResearchSourceDataTables | undefined {
	return information.get(tree);
}

export function fitResearchSourceDataTables(
	data: ResearchSourceDataTables,
	maxBytes: number,
): ResearchSourceDataTables | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid source data tables byte limit",
		);
	if (serializedBytes(data) <= maxBytes) return data;
	const tables: ResearchSourceDataTable[] = [];
	let used = serializedBytes(envelope(tables, true));
	if (used > maxBytes) return undefined;
	let rowCount = 0;
	for (
		let tableIndex = 0;
		tableIndex < Math.min(data.tables.length, 8);
		tableIndex++
	) {
		const table = data.tables[tableIndex];
		const rows: ResearchSourceDataRow[] = [];
		let tableBytes =
			serializedBytes({
				source: table.source,
				rows: [],
				truncated: true,
			}) + (tables.length ? 1 : 0);
		let complete = false;
		for (
			let rowIndex = 0;
			rowIndex < table.rows.length && rowCount < 64;
			rowIndex++
		) {
			const row = table.rows[rowIndex];
			const rowBytes = serializedBytes(row) + (rows.length ? 1 : 0);
			const last = rowIndex + 1 === table.rows.length;
			const completeBytes = last && !table.truncated ? 1 : 0;
			if (used + tableBytes + rowBytes + completeBytes > maxBytes) break;
			rows.push(row);
			tableBytes += rowBytes + completeBytes;
			rowCount++;
			complete = last;
		}
		if (!rows.length) break;
		tables.push(
			complete
				? table
				: Object.freeze({
						source: table.source,
						rows: Object.freeze(rows),
						truncated: true,
					}),
		);
		used += tableBytes;
		if (!complete || rowCount === 64) break;
	}
	return Object.freeze(envelope(Object.freeze(tables), true));
}

export function setResearchSourceDataTables(
	tree: DocumentTree,
	data: ResearchSourceDataTables,
): void {
	const snapshot = Object.freeze(
		envelope(Object.freeze(data.tables.map(freezeTable)), data.truncated),
	);
	if (!information.has(tree)) tree.onClose(() => information.delete(tree));
	information.set(tree, snapshot);
}
