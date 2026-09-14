import type { SelectorNestingContext } from "./selectors.js";

export interface CssDiagnosticContext {
	authoredProperty?: string;
	property?: string;
	value?: string;
	important?: boolean;
	selector?: string;
	nesting?: SelectorNestingContext;
	scope?: "rule" | "inline";
	sheet?: number;
	importDepth?: number;
	owner?: number;
}

export interface CssDiagnosticSource {
	readonly sheet: number;
	readonly importDepth: number;
}

export type CssDiagnosticSink = ((
	code: string,
	context?: CssDiagnosticContext,
) => number | undefined) & { readonly source?: CssDiagnosticSource };

export interface CssDiagnosticResolution {
	applicable: boolean;
	selectorState: "matched" | "unmatched" | "unresolved" | "not-evaluated";
	mediaState: "active" | "inactive" | "uncertain" | "not-evaluated";
	matches?: Readonly<{ elements: number; before: number; after: number }>;
}

export interface CssDiagnosticText {
	readonly value: string;
	readonly codeUnits: number;
	readonly truncated: boolean;
}

export interface CssDiagnosticSample {
	readonly id: number;
	readonly code: CssDiagnosticText;
	readonly scope: "rule" | "inline";
	readonly sheet?: number;
	readonly importDepth?: number;
	readonly owner?: number;
	readonly authoredProperty?: CssDiagnosticText;
	readonly property?: CssDiagnosticText;
	readonly value?: CssDiagnosticText;
	readonly important?: boolean;
	readonly selectors: readonly CssDiagnosticText[];
	readonly selectorChainTruncated: boolean;
	readonly applicable: boolean | null;
	readonly selectorState: CssDiagnosticResolution["selectorState"];
	readonly mediaState: CssDiagnosticResolution["mediaState"];
	readonly matches?: CssDiagnosticResolution["matches"];
}

export interface CssDiagnosticSnapshot {
	readonly cascadeBuild: number;
	readonly issues: Readonly<Record<string, number>>;
	readonly applicableIssues: Readonly<Record<string, number>>;
	readonly instrumentedCodes: readonly string[];
	readonly samples: readonly CssDiagnosticSample[];
	readonly sampledOccurrences: number;
	readonly omittedOccurrences: number;
	readonly truncated: boolean;
	readonly exhaustive: false;
}

const instrumentedCodes: readonly string[] = Object.freeze([
	"invalid-css-declaration",
	"unimplemented-css-property",
	"unimplemented-or-invalid-css-value",
	"unimplemented-or-invalid-css-selector",
]);

function copyText(value: string, limit: number): CssDiagnosticText {
	const length = Math.min(value.length, limit);
	const units: number[] = [];
	for (let index = 0; index < length; index++) {
		units.push(value.charCodeAt(index));
	}
	return Object.freeze({
		value: String.fromCharCode(...units),
		codeUnits: value.length,
		truncated: length < value.length,
	});
}

export class CssDiagnosticCollector {
	private readonly samples: CssDiagnosticSample[] = [];
	private omittedOccurrences = 0;
	private textTruncated = false;

	record(code: string, context?: CssDiagnosticContext): number | undefined {
		if (!instrumentedCodes.includes(code)) return undefined;
		if (this.samples.length === 128) {
			this.omittedOccurrences++;
			return undefined;
		}
		const selectors: CssDiagnosticText[] = [];
		let remaining = 512;
		let selectorChainTruncated = false;
		const selector = context?.selector;
		if (selector !== undefined) {
			const text = copyText(selector, remaining);
			selectors.push(text);
			remaining -= text.value.length;
			selectorChainTruncated = text.truncated;
		}
		let nesting = context?.nesting;
		const seen = new Set<SelectorNestingContext>();
		while (nesting !== undefined) {
			if (remaining === 0 || selectors.length === 17 || seen.has(nesting)) {
				selectorChainTruncated = true;
				break;
			}
			seen.add(nesting);
			const text = copyText(nesting.selector, remaining);
			selectors.push(text);
			remaining -= text.value.length;
			if (text.truncated) {
				selectorChainTruncated = true;
				break;
			}
			nesting = nesting.parent;
		}
		const authoredProperty = context?.authoredProperty;
		const property = context?.property;
		const value = context?.value;
		const sheet = context?.sheet;
		const importDepth = context?.importDepth;
		const owner = context?.owner;
		const important = context?.important;
		const sample: CssDiagnosticSample = Object.freeze({
			id: this.samples.length,
			code: copyText(code, 96),
			scope: context?.scope === "inline" ? "inline" : "rule",
			sheet: typeof sheet === "number" ? sheet : undefined,
			importDepth: typeof importDepth === "number" ? importDepth : undefined,
			owner: typeof owner === "number" ? owner : undefined,
			important: typeof important === "boolean" ? important : undefined,
			authoredProperty:
				authoredProperty === undefined
					? undefined
					: copyText(authoredProperty, 128),
			property: property === undefined ? undefined : copyText(property, 128),
			value: value === undefined ? undefined : copyText(value, 256),
			selectors: Object.freeze(selectors),
			selectorChainTruncated,
			applicable: null,
			selectorState: "not-evaluated",
			mediaState: "not-evaluated",
		});
		this.textTruncated ||=
			sample.code.truncated ||
			sample.authoredProperty?.truncated === true ||
			sample.property?.truncated === true ||
			sample.value?.truncated === true ||
			selectorChainTruncated;
		this.samples.push(sample);
		return sample.id;
	}

	resolve(
		ids: readonly number[] | undefined,
		resolution: CssDiagnosticResolution,
	): void {
		if (ids === undefined) return;
		for (const id of ids) {
			if (!Number.isInteger(id) || id < 0 || id >= this.samples.length)
				continue;
			const matches = resolution.matches;
			this.samples[id] = Object.freeze({
				...this.samples[id],
				applicable: resolution.applicable,
				selectorState: resolution.selectorState,
				mediaState: resolution.mediaState,
				matches:
					matches === undefined
						? undefined
						: Object.freeze({
								elements: matches.elements,
								before: matches.before,
								after: matches.after,
							}),
			});
		}
	}

	snapshot(
		cascadeBuild: number,
		issues: Readonly<Record<string, number>>,
		applicableIssues: Readonly<Record<string, number>>,
	): CssDiagnosticSnapshot {
		return Object.freeze({
			cascadeBuild,
			issues: Object.freeze({ ...issues }),
			applicableIssues: Object.freeze({ ...applicableIssues }),
			instrumentedCodes,
			samples: Object.freeze([...this.samples]),
			sampledOccurrences: this.samples.length,
			omittedOccurrences: this.omittedOccurrences,
			truncated: this.omittedOccurrences > 0 || this.textTruncated,
			exhaustive: false,
		});
	}
}
