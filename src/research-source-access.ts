import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface ResearchSourceAccessEntry {
	readonly source: { readonly offset: number };
	readonly path: string;
	readonly value: boolean | string;
}

export interface ResearchSourceAccess {
	readonly kind: "jsonld-free-access-declarations-v1";
	readonly scope: "document-source";
	readonly partial: true;
	readonly verified: false;
	readonly truncated: boolean;
	readonly entries: readonly ResearchSourceAccessEntry[];
}

const information = new WeakMap<DocumentTree, ResearchSourceAccess>();
const encoder = new TextEncoder();

function snapshot(
	entries: readonly ResearchSourceAccessEntry[],
	truncated: boolean,
): ResearchSourceAccess {
	return Object.freeze({
		kind: "jsonld-free-access-declarations-v1",
		scope: "document-source",
		partial: true,
		verified: false,
		truncated,
		entries: Object.freeze(
			entries.map((entry) =>
				Object.freeze({
					source: Object.freeze({ offset: entry.source.offset }),
					path: entry.path,
					value: entry.value,
				}),
			),
		),
	});
}

function serializedBytes(value: unknown): number {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

export class ResearchSourceAccessCollector {
	private blocks = 0;
	private units = 0;
	private visited = 0;
	private truncated = false;
	private readonly entries: ResearchSourceAccessEntry[] = [];

	add(source: string, start: number, end: number, offset: number): void {
		if (
			![start, end, offset].every(Number.isSafeInteger) ||
			offset < 0 ||
			start < offset ||
			end < start ||
			end > source.length
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid source access span",
			);
		this.blocks++;
		this.units += end - start;
		if (
			this.blocks > 8 ||
			end - start > 65_536 ||
			this.units > 262_144 ||
			this.visited >= 256
		) {
			this.truncated = true;
			return;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(source.slice(start, end));
		} catch {
			return;
		}
		this.visit(parsed, "$", false, 0, offset);
	}

	private visit(
		value: unknown,
		path: string,
		inherited: boolean,
		depth: number,
		offset: number,
	): void {
		if (this.visited >= 256 || depth > 16) {
			this.truncated = true;
			return;
		}
		this.visited++;
		if (Array.isArray(value)) {
			if (depth === 16 && value.length) {
				this.truncated = true;
				return;
			}
			for (let index = 0; index < value.length; index++) {
				if (this.visited >= 256) {
					this.truncated = true;
					break;
				}
				this.visit(
					value[index],
					`${path}[${index}]`,
					inherited,
					depth + 1,
					offset,
				);
			}
			return;
		}
		if (value === null || typeof value !== "object") return;
		const object = value as Record<string, unknown>;
		const context = object["@context"];
		const recognized = Object.hasOwn(object, "@context")
			? [
					"http://schema.org",
					"https://schema.org",
					"http://schema.org/",
					"https://schema.org/",
				].includes(context as string)
			: inherited;
		const declaration = object.isAccessibleForFree;
		if (
			recognized &&
			Object.hasOwn(object, "isAccessibleForFree") &&
			(typeof declaration === "boolean" ||
				(typeof declaration === "string" &&
					["true", "false"].includes(declaration.toLowerCase())))
		) {
			if (this.entries.length < 16)
				this.entries.push({ source: { offset }, path, value: declaration });
			else this.truncated = true;
		}
		for (const key of ["@graph", "hasPart"]) {
			if (Object.hasOwn(object, key))
				this.visit(
					object[key],
					`${path}.${key}`,
					recognized,
					depth + 1,
					offset,
				);
		}
	}

	finish(): ResearchSourceAccess | undefined {
		return this.entries.length
			? snapshot(this.entries, this.truncated)
			: undefined;
	}
}

export function researchSourceAccess(
	tree: DocumentTree,
): ResearchSourceAccess | undefined {
	return information.get(tree);
}

export function setResearchSourceAccess(
	tree: DocumentTree,
	data: ResearchSourceAccess,
): void {
	if (!information.has(tree)) tree.onClose(() => information.delete(tree));
	information.set(tree, snapshot(data.entries, data.truncated));
}

export function fitResearchSourceAccess(
	data: ResearchSourceAccess,
	maxBytes: number,
): ResearchSourceAccess | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid source access byte limit",
		);
	if (!data.entries.length) return undefined;
	if (serializedBytes(data) <= maxBytes) return data;
	for (let count = Math.min(data.entries.length - 1, 16); count > 0; count--) {
		const prefix = snapshot(data.entries.slice(0, count), true);
		if (serializedBytes(prefix) <= maxBytes) return prefix;
	}
	return undefined;
}
