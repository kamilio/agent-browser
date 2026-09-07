import { types } from "node:util";
import { AgentBrowserError } from "../src/errors.js";
import { HtmlTokenCursor } from "../src/html-token-cursor.js";
import type { HtmlToken } from "../src/html-tokenizer.js";
import { resourceLimitError } from "../src/resource-limit.js";
import {
	type ResearchHtmlSourceIdentity,
	admitResearchHtmlSource,
} from "./research-source-input.js";

export const researchSourceHeadingLimits = Object.freeze({
	maxInputBytes: 4_000_000,
	maxSourceCodeUnits: 4_000_000,
	maxWindowCodeUnits: 65_536,
	maxWorkUnits: 32_000_000,
	maxOperations: 200_000,
	maxIssues: 1_024,
	timeoutMs: 120_000,
	maxTrackedDepth: 128,
	maxHeadingCodeUnits: 16_384,
	maxEntries: 256,
	maxTitleCodeUnits: 256,
	maxOutputBytes: 65_536,
	yieldEveryOperations: 256,
	yieldEveryWorkUnits: 32_768,
});

export type ResearchSourceHeadingLimits = {
	-readonly [Name in keyof typeof researchSourceHeadingLimits]: number;
};

export type ResearchSourceHeadingOptions =
	Partial<ResearchSourceHeadingLimits> & {
		method: "native-source-headings-v1";
	};

export interface SourceHeadingRange {
	readonly start: number;
	readonly end: number;
}

export interface SourceHeadingCandidate {
	readonly ordinal: number;
	readonly level: number;
	readonly title: string;
	readonly titleTruncated: boolean;
	readonly anchor: {
		readonly kind: "source-utf16-range-v1";
		readonly startTag: SourceHeadingRange;
		readonly endTag: SourceHeadingRange;
	};
}

export interface ResearchSourceHeadingReport {
	readonly kind: "source-heading-candidates";
	readonly method: "native-source-headings-v1";
	readonly semantics: "lexical-not-dom";
	readonly partial: true;
	readonly contentSuccess: null;
	readonly source: ResearchHtmlSourceIdentity;
	readonly completion: "eof" | "entry-limit";
	readonly scannedTo: number;
	readonly entries: readonly SourceHeadingCandidate[];
	readonly limits: Readonly<ResearchSourceHeadingLimits>;
	readonly counters: {
		readonly tokens: number;
		readonly operations: number;
		readonly workUnits: number;
		readonly issueAttempts: number;
		readonly entityIssues: Readonly<Record<string, number>>;
		readonly omittedStarts: Readonly<Record<string, number>>;
		readonly suppressedStarts: Readonly<Record<string, number>>;
		readonly suppressedHeadingStarts: number;
		readonly rawStarts: Readonly<Record<string, number>>;
		readonly maxTrackedDepth: number;
		readonly yields: number;
	};
}

export interface ResearchSourceHeadingDiscovery {
	readonly report: ResearchSourceHeadingReport;
	readonly jsonl: string;
	readonly outputBytes: number;
}

export type SourceHeadingStructureReason =
	| "tokenizer-issue"
	| "unclosed-context"
	| "ambiguous-text-mode"
	| "heading-inline-structure"
	| "heading-close-structure"
	| "raw-self-closing"
	| "raw-close-structure"
	| "scope-self-closing"
	| "scope-close-structure"
	| "heading-start-structure";

export interface SourceHeadingStructureDiagnostic {
	readonly kind: "source-heading-structure";
	readonly reason: SourceHeadingStructureReason;
	readonly position: number;
	readonly positionSemantics: "last-committed-source-utf16";
}

export type SourceHeadingScope =
	| (typeof omittedScopeNames)[number]
	| (typeof suppressedScopeNames)[number];

export interface SourceHeadingScopeDiagnostic {
	readonly kind: "source-heading-scope-close";
	readonly condition: "scope-mismatch" | "non-plain-close";
	readonly expectedScope: SourceHeadingScope | null;
	readonly observedScope: SourceHeadingScope;
	readonly depth: number;
}

const structureDiagnostics = new WeakMap<
	object,
	SourceHeadingStructureDiagnostic
>();
const scopeDiagnostics = new WeakMap<object, SourceHeadingScopeDiagnostic>();

export function sourceHeadingStructureDiagnostic(
	error: unknown,
): SourceHeadingStructureDiagnostic | undefined {
	if (
		error === null ||
		(typeof error !== "object" && typeof error !== "function")
	)
		return undefined;
	return structureDiagnostics.get(error);
}

export function sourceHeadingScopeDiagnostic(
	error: unknown,
): SourceHeadingScopeDiagnostic | undefined {
	if (
		error === null ||
		(typeof error !== "object" && typeof error !== "function")
	)
		return undefined;
	return scopeDiagnostics.get(error);
}

const voidTags = new Set(
	"area base br col embed frame hr img input keygen link meta param source track wbr".split(
		" ",
	),
);
const omittedScopeNames = [
	"svg",
	"math",
	"script",
	"style",
	"template",
	"iframe",
	"object",
	"embed",
	"canvas",
	"noembed",
	"noframes",
	"frameset",
	"frame",
	"link",
	"meta",
	"input",
	"textarea",
	"audio",
	"video",
	"source",
	"track",
] as const;
const suppressedScopeNames = [
	"head",
	"template",
	"select",
	"table",
	"caption",
	"colgroup",
	"tbody",
	"thead",
	"tfoot",
	"tr",
	"td",
	"th",
] as const;
const omittedTags = new Set<string>(omittedScopeNames);
const suppressedTags = new Set<string>(suppressedScopeNames);
const rawTags = new Set(
	"script style xmp iframe noembed noframes title textarea".split(" "),
);
const inlineTags = new Set(
	"span a b strong i em code small sub sup".split(" "),
);
const entityIssues = new Set(
	"missing-numeric-entity-digits missing-entity-semicolon invalid-numeric-entity legacy-numeric-entity control-numeric-entity noncharacter-numeric-entity unresolved-named-reference".split(
		" ",
	),
);

function invalid(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid source-heading discovery options",
	);
}

function optionsSnapshot(
	value: unknown,
): Readonly<ResearchSourceHeadingLimits> {
	if (value === null || typeof value !== "object" || types.isProxy(value))
		invalid();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) invalid();
	const method = Object.getOwnPropertyDescriptor(value, "method");
	if (
		!method ||
		!Object.hasOwn(method, "value") ||
		method.value !== "native-source-headings-v1"
	)
		invalid();
	const limits: ResearchSourceHeadingLimits = {
		...researchSourceHeadingLimits,
	};
	for (const key of Reflect.ownKeys(value)) {
		if (key === "method") continue;
		if (typeof key !== "string" || !Object.hasOwn(limits, key)) invalid();
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !Object.hasOwn(descriptor, "value")) invalid();
		const name = key as keyof ResearchSourceHeadingLimits;
		const selected: unknown = descriptor.value;
		if (
			typeof selected !== "number" ||
			!Number.isSafeInteger(selected) ||
			selected < (name === "maxIssues" ? 0 : 1) ||
			selected > researchSourceHeadingLimits[name]
		)
			invalid();
		limits[name] = selected;
	}
	return Object.freeze(limits);
}

function freezeOwned<Value>(value: Value): Value {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freezeOwned(child);
		Object.freeze(value);
	}
	return value;
}

function stringBytes(value: string): number {
	let bytes = 2;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code === 34 || code === 92) bytes += 2;
		else if (code < 32) bytes += [8, 9, 10, 12, 13].includes(code) ? 2 : 6;
		else if (code < 128) bytes++;
		else if (code < 2048) bytes += 2;
		else if (
			code >= 0xd800 &&
			code <= 0xdbff &&
			value.charCodeAt(index + 1) >= 0xdc00 &&
			value.charCodeAt(index + 1) <= 0xdfff
		) {
			bytes += 4;
			index++;
		} else bytes += code >= 0xd800 && code <= 0xdfff ? 6 : 3;
	}
	return bytes;
}

function encodeOwnedReport(
	report: ResearchSourceHeadingReport,
	limit: number,
	checkpoint: () => void,
) {
	const chunks: string[] = [];
	let bytes = 0;
	const admit = (additional: number) => {
		checkpoint();
		if (bytes + additional > limit)
			throw resourceLimitError(
				"source.headings-output",
				limit,
				bytes + additional,
				"Source-heading output limit exceeded",
			);
		bytes += additional;
	};
	const literal = (value: string) => {
		admit(value.length);
		chunks.push(value);
	};
	const text = (value: string) => {
		admit(stringBytes(value));
		chunks.push(JSON.stringify(value));
	};
	const append = (value: unknown): void => {
		if (typeof value === "string") text(value);
		else if (value === null) literal("null");
		else if (typeof value === "boolean") literal(value ? "true" : "false");
		else if (typeof value === "number" && Number.isSafeInteger(value))
			literal(String(value));
		else if (Array.isArray(value)) {
			literal("[");
			for (let index = 0; index < value.length; index++) {
				if (index) literal(",");
				append(value[index]);
			}
			literal("]");
		} else if (typeof value === "object") {
			literal("{");
			let count = 0;
			for (const [name, child] of Object.entries(value)) {
				if (count++) literal(",");
				text(name);
				literal(":");
				append(child);
			}
			literal("}");
		} else invalid();
	};
	append(report);
	literal("\n");
	const jsonl = chunks.join("");
	checkpoint();
	return { jsonl, outputBytes: bytes };
}

interface HeadingState {
	name: string;
	level: number;
	startTag: SourceHeadingRange;
	inline: string[];
	title: string;
	titleTruncated: boolean;
	pendingSpace: boolean;
	pendingHigh: string;
}

function headingLevel(name: string): number | undefined {
	return /^h[1-6]$/.test(name) ? Number(name[1]) : undefined;
}

function plainEnd(token: HtmlToken, name: string): boolean {
	return (
		token.kind === "end" &&
		token.name === name &&
		!token.selfClosing &&
		Object.keys(token.attributes).length === 0
	);
}

function isTrackedScope(name: string): name is SourceHeadingScope {
	return suppressedTags.has(name) || omittedTags.has(name);
}

export async function discoverResearchSourceHeadings(
	input: unknown,
	options: unknown,
	signal?: AbortSignal,
): Promise<ResearchSourceHeadingDiscovery> {
	const started = performance.now();
	const limits = optionsSnapshot(options);
	const deadline = started + limits.timeoutMs;
	let cursor: HtmlTokenCursor | undefined;
	let scannerWork = 0;
	let tokens = 0;
	let yields = 0;
	let batchOperations = 0;
	let batchWork = 0;
	let maxTrackedDepth = 0;
	let suppressedHeadingStarts = 0;
	const issueCounts: Record<string, number> = Object.create(null);
	const omittedStarts: Record<string, number> = Object.create(null);
	const suppressedStarts: Record<string, number> = Object.create(null);
	const rawStarts: Record<string, number> = Object.create(null);
	const entries: SourceHeadingCandidate[] = [];
	const scopes: SourceHeadingScope[] = [];
	let heading: HeadingState | undefined;
	const unsupported = (
		reason: SourceHeadingStructureReason,
		scopeDiagnostic?: SourceHeadingScopeDiagnostic,
	): never => {
		const error = new AgentBrowserError(
			"unsupported",
			"Unsupported native source-heading structure",
		);
		structureDiagnostics.set(
			error,
			Object.freeze({
				kind: "source-heading-structure",
				reason,
				position: cursor?.position ?? 0,
				positionSemantics: "last-committed-source-utf16",
			}),
		);
		if (scopeDiagnostic)
			scopeDiagnostics.set(error, Object.freeze(scopeDiagnostic));
		throw error;
	};
	const work = () => (cursor?.workUnits ?? 0) + scannerWork;
	const checkpoint = () => {
		if (signal?.aborted)
			throw new AgentBrowserError(
				"aborted",
				"Source-heading discovery aborted",
			);
		if (performance.now() >= deadline)
			throw new AgentBrowserError(
				"timeout",
				"Source-heading discovery deadline exceeded",
			);
		if (work() > limits.maxWorkUnits)
			throw resourceLimitError(
				"source.headings-work",
				limits.maxWorkUnits,
				work(),
				"Source-heading work limit exceeded",
			);
	};
	const charge = (units: number) => {
		scannerWork += units;
		checkpoint();
	};
	const track = (depth: number) => {
		if (depth > limits.maxTrackedDepth)
			throw resourceLimitError(
				"source.headings-depth",
				limits.maxTrackedDepth,
				depth,
				"Source-heading tracked depth exceeded",
			);
		maxTrackedDepth = Math.max(maxTrackedDepth, depth);
	};
	const extent = () => {
		if (!heading || !cursor) return;
		const observed = cursor.position - heading.startTag.start;
		if (observed > limits.maxHeadingCodeUnits)
			throw resourceLimitError(
				"source.heading-extent",
				limits.maxHeadingCodeUnits,
				observed,
				"Source-heading extent exceeded",
			);
	};
	const yieldBatch = async () => {
		checkpoint();
		if (
			!cursor ||
			(cursor.operations - batchOperations < limits.yieldEveryOperations &&
				work() - batchWork < limits.yieldEveryWorkUnits)
		)
			return;
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		yields++;
		checkpoint();
		batchOperations = cursor.operations;
		batchWork = work();
	};
	const read = async () => {
		checkpoint();
		if (!cursor) invalid();
		const start = cursor.position;
		const token = cursor.next();
		checkpoint();
		extent();
		if (token) {
			tokens++;
			charge(1);
		}
		await yieldBatch();
		return { token, start, end: cursor.position };
	};
	const appendCharacter = (current: HeadingState, character: string) => {
		if (/\s/u.test(character)) {
			if (current.title.length) current.pendingSpace = true;
			return;
		}
		if (current.titleTruncated) return;
		const spacer = current.pendingSpace ? " " : "";
		current.pendingSpace = false;
		if (
			current.title.length + spacer.length + character.length >
			limits.maxTitleCodeUnits
		) {
			current.titleTruncated = true;
			return;
		}
		current.title += spacer + character;
	};
	const titleText = (current: HeadingState, value: string) => {
		charge(value.length);
		for (let index = 0; index < value.length; index++) {
			const character = value[index];
			const code = value.charCodeAt(index);
			if (current.pendingHigh) {
				const high = current.pendingHigh;
				current.pendingHigh = "";
				if (code >= 0xdc00 && code <= 0xdfff) {
					appendCharacter(current, high + character);
					continue;
				}
				appendCharacter(current, high);
			}
			if (code >= 0xd800 && code <= 0xdbff) current.pendingHigh = character;
			else appendCharacter(current, character);
		}
		checkpoint();
	};
	try {
		checkpoint();
		const admitted = admitResearchHtmlSource(
			input,
			limits.maxInputBytes,
			limits.maxSourceCodeUnits,
			checkpoint,
		);
		checkpoint();
		cursor = new HtmlTokenCursor(
			admitted.text,
			(code) => {
				checkpoint();
				if (!entityIssues.has(code)) unsupported("tokenizer-issue");
				charge(1);
				issueCounts[code] = (issueCounts[code] ?? 0) + 1;
			},
			{
				maxSourceCodeUnits: limits.maxSourceCodeUnits,
				maxWindowCodeUnits: limits.maxWindowCodeUnits,
				maxWorkUnits: limits.maxWorkUnits,
				maxOperations: limits.maxOperations,
				maxIssues: limits.maxIssues,
				timeoutMs: limits.timeoutMs,
			},
			signal,
		);
		let completion: ResearchSourceHeadingReport["completion"] = "eof";
		while (true) {
			const current = await read();
			const token = current.token;
			if (!token) {
				if (heading || scopes.length) unsupported("unclosed-context");
				break;
			}
			if (token.kind === "text") {
				if (heading) titleText(heading, token.data);
				await yieldBatch();
				continue;
			}
			if (token.kind === "comment" || token.kind === "doctype") continue;
			const name = token.name;
			if (name === "plaintext" || name === "noscript")
				unsupported("ambiguous-text-mode");
			const level = headingLevel(name);
			if (heading) {
				if (token.kind === "start") {
					if (name === "br" || name === "wbr") {
						if (name === "br") titleText(heading, " ");
					} else {
						if (!inlineTags.has(name) || token.selfClosing)
							unsupported("heading-inline-structure");
						track(heading.inline.length + 2);
						heading.inline.push(name);
					}
				} else if (
					name === heading.name &&
					heading.inline.length === 0 &&
					plainEnd(token, name)
				) {
					if (heading.pendingHigh)
						appendCharacter(heading, heading.pendingHigh);
					entries.push({
						ordinal: entries.length + 1,
						level: heading.level,
						title: heading.title,
						titleTruncated: heading.titleTruncated,
						anchor: {
							kind: "source-utf16-range-v1",
							startTag: heading.startTag,
							endTag: { start: current.start, end: current.end },
						},
					});
					heading = undefined;
				} else {
					if (heading.inline.at(-1) !== name || !plainEnd(token, name))
						unsupported("heading-close-structure");
					heading.inline.pop();
				}
				continue;
			}
			if (token.kind === "start" && rawTags.has(name)) {
				if (token.selfClosing) unsupported("raw-self-closing");
				rawStarts[name] = (rawStarts[name] ?? 0) + 1;
				checkpoint();
				cursor.raw(name, name === "title" || name === "textarea");
				checkpoint();
				await yieldBatch();
				const closing = await read();
				if (!closing.token || !plainEnd(closing.token, name))
					unsupported("raw-close-structure");
				continue;
			}
			const tracked = isTrackedScope(name);
			if (token.kind === "start" && tracked) {
				const counts = suppressedTags.has(name)
					? suppressedStarts
					: omittedStarts;
				counts[name] = (counts[name] ?? 0) + 1;
				if (voidTags.has(name)) continue;
				if (token.selfClosing) {
					if (name !== "svg" && name !== "math")
						unsupported("scope-self-closing");
					continue;
				}
				track(scopes.length + 1);
				scopes.push(name);
				continue;
			}
			if (token.kind === "end" && tracked) {
				const expectedScope = scopes.at(-1) ?? null;
				let condition: SourceHeadingScopeDiagnostic["condition"] | undefined;
				if (expectedScope !== name) condition = "scope-mismatch";
				else if (!plainEnd(token, name)) condition = "non-plain-close";
				if (condition)
					unsupported("scope-close-structure", {
						kind: "source-heading-scope-close",
						condition,
						expectedScope,
						observedScope: name,
						depth: scopes.length,
					});
				scopes.pop();
				continue;
			}
			if (scopes.length) {
				if (token.kind === "start" && level !== undefined)
					suppressedHeadingStarts++;
				continue;
			}
			if (level !== undefined) {
				if (token.kind !== "start" || token.selfClosing)
					unsupported("heading-start-structure");
				if (entries.length === limits.maxEntries) {
					completion = "entry-limit";
					break;
				}
				track(1);
				heading = {
					name,
					level,
					startTag: { start: current.start, end: current.end },
					inline: [],
					title: "",
					titleTruncated: false,
					pendingSpace: false,
					pendingHigh: "",
				};
				extent();
			}
		}
		checkpoint();
		const report = freezeOwned<ResearchSourceHeadingReport>({
			kind: "source-heading-candidates",
			method: "native-source-headings-v1",
			semantics: "lexical-not-dom",
			partial: true,
			contentSuccess: null,
			source: admitted.identity,
			completion,
			scannedTo: cursor.position,
			entries,
			limits,
			counters: {
				tokens,
				operations: cursor.operations,
				workUnits: work(),
				issueAttempts: cursor.issueCount,
				entityIssues: issueCounts,
				omittedStarts,
				suppressedStarts,
				suppressedHeadingStarts,
				rawStarts,
				maxTrackedDepth,
				yields,
			},
		});
		const encoded = encodeOwnedReport(
			report,
			limits.maxOutputBytes,
			checkpoint,
		);
		checkpoint();
		return Object.freeze({ report, ...encoded });
	} finally {
		cursor?.close();
	}
}
