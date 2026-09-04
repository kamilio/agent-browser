import {
	type InlineDeclaration,
	directDeclaration,
	serializeDeclarations,
} from "./css-declarations.js";
import { AgentBrowserError } from "./errors.js";

export const inlineDeclarationLimits = Object.freeze({
	maxElements: 512,
	maxDeclarations: 16_384,
	maxCodeUnits: 2_000_000,
	maxValueCodeUnits: 65_536,
});

export interface InlineDeclarationState {
	readonly entries: readonly InlineDeclaration[];
	readonly codeUnits: number;
}

export class DocumentInlineDeclarations {
	private readonly values = new Map<number, InlineDeclarationState>();
	private declarations = 0;
	private codeUnits = 0;

	get stats() {
		return Object.freeze({
			elements: this.values.size,
			declarations: this.declarations,
			codeUnits: this.codeUnits,
		});
	}

	get(id: number) {
		return this.values.get(id)?.entries;
	}

	prepare(id: number, source: string, entries: readonly InlineDeclaration[]) {
		if (!Array.isArray(entries) || typeof source !== "string")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid inline declarations",
			);
		if (
			entries.length > inlineDeclarationLimits.maxDeclarations ||
			source.length > inlineDeclarationLimits.maxCodeUnits
		)
			this.limit();
		let codeUnits = source.length;
		const names = new Set<string>();
		for (const entry of entries) {
			if (
				!entry ||
				typeof entry.name !== "string" ||
				typeof entry.value !== "string" ||
				typeof entry.important !== "boolean" ||
				(entry.pending !== undefined && typeof entry.pending !== "string") ||
				names.has(entry.name)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid inline declarations",
				);
			names.add(entry.name);
			codeUnits +=
				entry.name.length + entry.value.length + (entry.pending?.length ?? 0);
			if (
				entry.value.length > inlineDeclarationLimits.maxValueCodeUnits ||
				codeUnits > inlineDeclarationLimits.maxCodeUnits
			)
				this.limit();
		}
		const parsed = new Map<string, InlineDeclaration[]>();
		const projected = entries.map((entry) => {
			const key = JSON.stringify([
				entry.pending ?? entry.name,
				entry.value,
				entry.important,
			]);
			let declarations = parsed.get(key);
			if (!declarations) {
				declarations = directDeclaration(
					entry.pending ?? entry.name,
					entry.value,
					entry.important,
				);
				parsed.set(key, declarations);
			}
			const checked = declarations.find(
				(value) => value.name === entry.name && value.pending === entry.pending,
			);
			if (!checked)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid inline declarations",
				);
			return Object.freeze(checked);
		});
		if (serializeDeclarations(projected) !== source)
			throw new AgentBrowserError(
				"invalid-input",
				"Inline declaration source does not match",
			);
		if (!projected.some((entry) => entry.pending)) return undefined;
		codeUnits = source.length;
		for (const entry of projected)
			codeUnits +=
				entry.name.length + entry.value.length + (entry.pending?.length ?? 0);
		if (codeUnits > inlineDeclarationLimits.maxCodeUnits) this.limit();
		const previous = this.values.get(id);
		if (
			this.values.size + (previous ? 0 : 1) >
				inlineDeclarationLimits.maxElements ||
			this.declarations - (previous?.entries.length ?? 0) + projected.length >
				inlineDeclarationLimits.maxDeclarations ||
			this.codeUnits - (previous?.codeUnits ?? 0) + codeUnits >
				inlineDeclarationLimits.maxCodeUnits
		)
			this.limit();
		return Object.freeze({ entries: Object.freeze(projected), codeUnits });
	}

	replace(id: number, state?: InlineDeclarationState) {
		const previous = this.values.get(id);
		this.declarations +=
			(state?.entries.length ?? 0) - (previous?.entries.length ?? 0);
		this.codeUnits += (state?.codeUnits ?? 0) - (previous?.codeUnits ?? 0);
		if (state) this.values.set(id, state);
		else this.values.delete(id);
		return state !== previous;
	}

	close() {
		this.values.clear();
		this.declarations = 0;
		this.codeUnits = 0;
	}

	private limit(): never {
		throw new AgentBrowserError(
			"resource-limit",
			"Inline declaration retention limit exceeded",
		);
	}
}
