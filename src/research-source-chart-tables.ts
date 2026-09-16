import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseSourceLiteral } from "./source-literal.js";
import { utf8ByteLength } from "./utf8-byte-length.js";

export interface InfogramChartRoute {
	readonly id: string;
}

export type ResearchSourceChartCell =
	| Readonly<{ kind: "null-cell" }>
	| Readonly<{ kind: "value-cell"; value: string | number | boolean | null }>;

export interface ResearchSourceChartTable {
	readonly source: Readonly<{
		offset: number;
		offsetBasis: "lf-normalized-utf16";
		path: string;
		sheetIndex: number;
	}>;
	readonly sheetName: string;
	readonly chartTypeNumber?: number;
	readonly modifier?: number;
	readonly axisLabel?: string;
	readonly rows: readonly (readonly ResearchSourceChartCell[])[];
}

export interface ResearchSourceChartTables {
	readonly kind: "infogram-chart-tables-v1";
	readonly scope: "document-source";
	readonly partial: true;
	readonly rendered: false;
	readonly verified: false;
	readonly textFormat: "plain-text";
	readonly embedId: string;
	readonly tables: readonly ResearchSourceChartTable[];
	readonly truncated: boolean;
}

const information = new WeakMap<DocumentTree, ResearchSourceChartTables>();
const identifier =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const assignment = "window.infographicData";
const whitespace = /^[\t\n\v\f\r ]$/;

function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function own(value: unknown, key: string): unknown {
	return object(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}

function hidden(value: unknown): boolean {
	return (
		own(value, "hidden") === true || own(own(value, "props"), "hidden") === true
	);
}

function boundedId(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function boundedText(value: unknown): value is string {
	return typeof value === "string" && value.length <= 256;
}

function snapshot(
	embedId: string,
	tables: readonly ResearchSourceChartTable[],
	truncated: boolean,
): ResearchSourceChartTables {
	return Object.freeze({
		kind: "infogram-chart-tables-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		verified: false,
		textFormat: "plain-text",
		embedId,
		truncated,
		tables: Object.freeze(
			tables.map((table) =>
				Object.freeze({
					source: Object.freeze({
						offset: table.source.offset,
						offsetBasis: "lf-normalized-utf16" as const,
						path: table.source.path,
						sheetIndex: table.source.sheetIndex,
					}),
					sheetName: table.sheetName,
					...(table.chartTypeNumber === undefined
						? {}
						: { chartTypeNumber: table.chartTypeNumber }),
					...(table.modifier === undefined ? {} : { modifier: table.modifier }),
					...(table.axisLabel === undefined
						? {}
						: { axisLabel: table.axisLabel }),
					rows: Object.freeze(
						table.rows.map((row) =>
							Object.freeze(
								row.map(
									(cell): ResearchSourceChartCell =>
										cell.kind === "null-cell"
											? Object.freeze({ kind: "null-cell" })
											: Object.freeze({
													kind: "value-cell",
													value: cell.value,
												}),
								),
							),
						),
					),
				}),
			),
		),
	});
}

export function infogramChartRoute(
	value: string,
): InfogramChartRoute | undefined {
	if (typeof value !== "string" || value.length > 4096) return;
	const matched =
		/^https:\/\/e\.infogram\.com\/([0-9a-f-]+)(?:[?#][\s\S]*)?$/.exec(value);
	if (
		!matched ||
		matched[0].length !== value.length ||
		!identifier.test(matched[1])
	)
		return;
	try {
		const url = new URL(value);
		if (
			url.origin !== "https://e.infogram.com" ||
			url.username ||
			url.password ||
			url.pathname !== `/${matched[1]}`
		)
			return;
		return Object.freeze({ id: matched[1] });
	} catch {
		return;
	}
}

function matrix(value: unknown): ResearchSourceChartCell[][] | undefined {
	if (!Array.isArray(value) || value.length < 2 || value.length > 64) return;
	const width = Array.isArray(value[0]) ? value[0].length : 0;
	if (width < 2 || width > 8) return;
	const rows: ResearchSourceChartCell[][] = [];
	for (const input of value) {
		if (!Array.isArray(input) || input.length !== width) return;
		const row: ResearchSourceChartCell[] = [];
		for (const cell of input) {
			if (cell === null) {
				row.push({ kind: "null-cell" });
				continue;
			}
			const scalar = own(cell, "value");
			if (
				scalar !== null &&
				typeof scalar !== "boolean" &&
				!(typeof scalar === "number" && Number.isFinite(scalar)) &&
				!boundedText(scalar)
			)
				return;
			row.push({ kind: "value-cell", value: scalar });
		}
		rows.push(row);
	}
	return rows;
}

function collectTables(
	data: unknown,
	embedId: string,
	offset: number,
): ResearchSourceChartTables | undefined {
	if (own(data, "path") !== embedId || own(data, "public") !== true) return;
	const content = own(own(own(data, "elements"), "content"), "content");
	const order = own(content, "blockOrder");
	const blocks = own(content, "blocks");
	const entities = own(content, "entities");
	if (!Array.isArray(order) || !object(blocks) || !object(entities)) return;
	const tables: ResearchSourceChartTable[] = [];
	const seen = new Set<string>();
	let truncated = order.length > 32;
	let references = 0;
	let rowCount = 0;
	outer: for (const blockId of order.slice(0, 32)) {
		if (!boundedId(blockId)) {
			truncated = true;
			continue;
		}
		const block = own(blocks, blockId);
		if (hidden(block)) continue;
		const entityIds = own(block, "entities");
		if (!Array.isArray(entityIds)) {
			truncated = true;
			continue;
		}
		for (const entityId of entityIds) {
			if (references++ === 32) {
				truncated = true;
				break outer;
			}
			if (!boundedId(entityId)) {
				truncated = true;
				continue;
			}
			if (seen.has(entityId)) continue;
			seen.add(entityId);
			const entity = own(entities, entityId);
			if (!object(entity)) {
				truncated = true;
				continue;
			}
			if (own(entity, "type") !== "CHART" || hidden(entity)) continue;
			const chart = own(own(entity, "props"), "chartData");
			const sheets = own(chart, "data");
			const names = own(chart, "sheetnames");
			const settings = own(chart, "sheets_settings");
			if (
				!Array.isArray(sheets) ||
				!Array.isArray(names) ||
				!Array.isArray(settings)
			) {
				truncated = true;
				continue;
			}
			for (let index = 0; index < sheets.length; index++) {
				if (tables.length === 16) {
					truncated = true;
					break outer;
				}
				const sheetName = names[index];
				const sheetSettings = settings[index];
				if (!boundedText(sheetName) || !object(sheetSettings)) {
					truncated = true;
					continue;
				}
				const rows = matrix(sheets[index]);
				if (!rows) {
					truncated = true;
					continue;
				}
				if (rowCount + rows.length > 64) {
					truncated = true;
					break outer;
				}
				const optional: {
					chartTypeNumber?: number;
					modifier?: number;
					axisLabel?: string;
				} = {};
				for (const [input, output] of [
					["chart_type_nr", "chartTypeNumber"],
					["modifier", "modifier"],
				] as const) {
					const number = own(chart, input);
					if (number === undefined) continue;
					if (typeof number === "number" && Number.isFinite(number))
						optional[output] = number;
					else truncated = true;
				}
				const label = own(sheetSettings, "xlabel");
				if (label !== undefined) {
					if (boundedText(label)) optional.axisLabel = label;
					else truncated = true;
				}
				tables.push({
					source: {
						offset,
						offsetBasis: "lf-normalized-utf16",
						path: `$.elements.content.content.entities[${JSON.stringify(entityId)}].props.chartData.data[${index}]`,
						sheetIndex: index,
					},
					sheetName,
					...optional,
					rows,
				});
				rowCount += rows.length;
			}
		}
	}
	if (!tables.length) return;
	return fitResearchSourceChartTables(
		snapshot(embedId, tables, truncated),
		65_536,
	);
}

export class ResearchSourceChartTableCollector {
	private readonly embedId: string;
	private matched = false;
	private ambiguous = false;
	private data: ResearchSourceChartTables | undefined;

	constructor(route: InfogramChartRoute) {
		if (
			!route ||
			typeof route.id !== "string" ||
			route.id.length !== 36 ||
			!identifier.test(route.id)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid chart source route",
			);
		this.embedId = route.id;
	}

	add(source: string, start: number, end: number, offset: number): void {
		if (
			typeof source !== "string" ||
			![start, end, offset].every(Number.isSafeInteger) ||
			offset < 0 ||
			start < offset ||
			end < start ||
			end > source.length
		)
			throw new AgentBrowserError("invalid-input", "Invalid chart source span");
		if (this.ambiguous) return;
		const probe = source.slice(start, Math.min(end, start + 128));
		const prefix = /^[\t\n\v\f\r ]*window\.infographicData[\t\n\v\f\r ]*=/.exec(
			probe,
		);
		if (!prefix) {
			const leading = probe.replace(/^[\t\n\v\f\r ]*/, "");
			if (
				probe.length === 128 &&
				(assignment.startsWith(leading) ||
					(leading.startsWith(assignment) &&
						/^[\t\n\v\f\r ]*$/.test(leading.slice(assignment.length))))
			) {
				this.ambiguous = true;
				this.data = undefined;
			}
			return;
		}
		if (this.matched) {
			this.ambiguous = true;
			this.data = undefined;
			return;
		}
		this.matched = true;
		if (end - start > 65_792) return;
		let literalStart = start + prefix[0].length;
		let literalEnd = end;
		while (literalStart < literalEnd && whitespace.test(source[literalStart]))
			literalStart++;
		while (literalEnd > literalStart && whitespace.test(source[literalEnd - 1]))
			literalEnd--;
		if (source[literalEnd - 1] === ";") literalEnd--;
		while (literalEnd > literalStart && whitespace.test(source[literalEnd - 1]))
			literalEnd--;
		let literal: unknown;
		try {
			literal = parseSourceLiteral(source.slice(literalStart, literalEnd));
		} catch {
			return;
		}
		this.data = collectTables(literal, this.embedId, offset);
	}

	finish(): ResearchSourceChartTables | undefined {
		return this.data;
	}
}

export function fitResearchSourceChartTables(
	data: ResearchSourceChartTables,
	maxBytes: number,
): ResearchSourceChartTables | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid chart source byte limit",
		);
	const limit = Math.min(maxBytes, 65_536);
	let count = 0;
	let rows = 0;
	while (count < Math.min(data.tables.length, 16)) {
		rows += data.tables[count].rows.length;
		if (rows > 64) break;
		count++;
	}
	for (; count >= 0; count--) {
		const prefix = snapshot(
			data.embedId,
			data.tables.slice(0, count),
			data.truncated || count === 0 || count < data.tables.length,
		);
		if (utf8ByteLength(JSON.stringify(prefix)) <= limit) return prefix;
	}
	return;
}

export function researchSourceChartTables(
	tree: DocumentTree,
): ResearchSourceChartTables | undefined {
	return information.get(tree);
}

export function setResearchSourceChartTables(
	tree: DocumentTree,
	data: ResearchSourceChartTables,
): void {
	if (!information.has(tree)) tree.onClose(() => information.delete(tree));
	information.set(tree, snapshot(data.embedId, data.tables, data.truncated));
}
