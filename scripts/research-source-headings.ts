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
		tableScopePolicy?: "optional-end-tags-v1" | "optional-end-tags-v2";
		headScopePolicy?: "explicit-body-boundary-v1";
		headingInlinePolicy?: "balanced-source-elements-v1";
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
	readonly tableScopePolicy?: "optional-end-tags-v1" | "optional-end-tags-v2";
	readonly headScopePolicy?: "explicit-body-boundary-v1";
	readonly headingInlinePolicy?: "balanced-source-elements-v1";
	readonly headingInlineLimitations?: readonly [
		"source-balance-only",
		"attributes-ignored",
		"not-dom-or-visibility",
	];
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

export interface SourceHeadingScopeContextDiagnostic {
	readonly kind: "source-heading-scope-context";
	readonly tableScopePolicy:
		| "strict"
		| "optional-end-tags-v1"
		| "optional-end-tags-v2";
	readonly order: "outer-to-inner";
	readonly scopes: readonly SourceHeadingScope[];
}

export type SourceHeadingInlineObservedTag =
	| (typeof inlineDiagnosticTagNames)[number]
	| "other";

export interface SourceHeadingInlineDiagnostic {
	readonly kind: "source-heading-inline-start";
	readonly condition: "non-inline-start" | "self-closing-inline";
	readonly headingLevel: 1 | 2 | 3 | 4 | 5 | 6;
	readonly observedTag: SourceHeadingInlineObservedTag;
	readonly inlineDepth: number;
}

const structureDiagnostics = new WeakMap<
	object,
	SourceHeadingStructureDiagnostic
>();
const scopeDiagnostics = new WeakMap<object, SourceHeadingScopeDiagnostic>();
const scopeContextDiagnostics = new WeakMap<
	object,
	SourceHeadingScopeContextDiagnostic
>();
const inlineDiagnostics = new WeakMap<object, SourceHeadingInlineDiagnostic>();

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

export function sourceHeadingScopeContextDiagnostic(
	error: unknown,
): SourceHeadingScopeContextDiagnostic | undefined {
	if (
		error === null ||
		(typeof error !== "object" && typeof error !== "function")
	)
		return undefined;
	return scopeContextDiagnostics.get(error);
}

export function sourceHeadingInlineDiagnostic(
	error: unknown,
): SourceHeadingInlineDiagnostic | undefined {
	if (
		error === null ||
		(typeof error !== "object" && typeof error !== "function")
	)
		return undefined;
	return inlineDiagnostics.get(error);
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
const inlineDiagnosticTagNames = [
	"span",
	"a",
	"b",
	"strong",
	"i",
	"em",
	"code",
	"small",
	"sub",
	"sup",
	"area",
	"base",
	"br",
	"col",
	"embed",
	"frame",
	"hr",
	"img",
	"input",
	"keygen",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
	"svg",
	"math",
	"script",
	"style",
	"template",
	"iframe",
	"object",
	"canvas",
	"noembed",
	"noframes",
	"frameset",
	"textarea",
	"audio",
	"video",
	"head",
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
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"xmp",
	"title",
	"html",
	"body",
	"abbr",
	"address",
	"article",
	"aside",
	"bdi",
	"bdo",
	"blockquote",
	"cite",
	"dd",
	"del",
	"div",
	"dl",
	"dt",
	"figcaption",
	"figure",
	"footer",
	"header",
	"hgroup",
	"ins",
	"kbd",
	"li",
	"main",
	"mark",
	"nav",
	"ol",
	"p",
	"pre",
	"q",
	"rp",
	"rt",
	"ruby",
	"s",
	"samp",
	"section",
	"time",
	"u",
	"ul",
	"var",
] as const;
const inlineDiagnosticTags = new Map<string, SourceHeadingInlineObservedTag>(
	inlineDiagnosticTagNames.map((name) => [name, name]),
);

function inlineDiagnosticTag(name: string): SourceHeadingInlineObservedTag {
	return name.length > 10
		? "other"
		: (inlineDiagnosticTags.get(name) ?? "other");
}

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

function optionsSnapshot(value: unknown): {
	readonly limits: Readonly<ResearchSourceHeadingLimits>;
	readonly tableScopePolicy?: "optional-end-tags-v1" | "optional-end-tags-v2";
	readonly headScopePolicy?: "explicit-body-boundary-v1";
	readonly headingInlinePolicy?: "balanced-source-elements-v1";
} {
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
	let tableScopePolicy:
		| "optional-end-tags-v1"
		| "optional-end-tags-v2"
		| undefined;
	let headScopePolicy: "explicit-body-boundary-v1" | undefined;
	let headingInlinePolicy: "balanced-source-elements-v1" | undefined;
	for (const key of Reflect.ownKeys(value)) {
		if (key === "method") continue;
		if (
			typeof key !== "string" ||
			(key !== "tableScopePolicy" &&
				key !== "headScopePolicy" &&
				key !== "headingInlinePolicy" &&
				!Object.hasOwn(limits, key))
		)
			invalid();
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !Object.hasOwn(descriptor, "value")) invalid();
		if (key === "tableScopePolicy") {
			if (
				descriptor.value !== "optional-end-tags-v1" &&
				descriptor.value !== "optional-end-tags-v2"
			)
				invalid();
			tableScopePolicy = descriptor.value;
			continue;
		}
		if (key === "headScopePolicy") {
			if (descriptor.value !== "explicit-body-boundary-v1") invalid();
			headScopePolicy = descriptor.value;
			continue;
		}
		if (key === "headingInlinePolicy") {
			if (descriptor.value !== "balanced-source-elements-v1") invalid();
			headingInlinePolicy = descriptor.value;
			continue;
		}
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
	return Object.freeze({
		limits: Object.freeze(limits),
		tableScopePolicy,
		headScopePolicy,
		headingInlinePolicy,
	});
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
	const { limits, tableScopePolicy, headScopePolicy, headingInlinePolicy } =
		optionsSnapshot(options);
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
	let headPhase: "prefix" | "eligible" | "disabled" | "done" = headScopePolicy
		? "prefix"
		: "disabled";
	let headDoctypeSeen = false;
	let headHtmlSeen = false;
	const unsupported = (
		reason: SourceHeadingStructureReason,
		scopeDiagnostic?: SourceHeadingScopeDiagnostic,
		inlineDiagnostic?: SourceHeadingInlineDiagnostic,
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
		if (scopeDiagnostic) {
			scopeDiagnostics.set(error, Object.freeze(scopeDiagnostic));
			scopeContextDiagnostics.set(
				error,
				Object.freeze({
					kind: "source-heading-scope-context",
					tableScopePolicy: tableScopePolicy ?? "strict",
					order: "outer-to-inner",
					scopes: Object.freeze([...scopes]),
				}),
			);
		}
		if (inlineDiagnostic)
			inlineDiagnostics.set(error, Object.freeze(inlineDiagnostic));
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
	const additionalInline = (
		name: string,
		level: number | undefined,
		token: { readonly selfClosing: boolean },
	) => {
		charge(1);
		if (name.length > 64) return false;
		charge(6 * name.length + 4);
		return (
			!rawTags.has(name) &&
			!omittedTags.has(name) &&
			!suppressedTags.has(name) &&
			!voidTags.has(name) &&
			name !== "html" &&
			name !== "body" &&
			level === undefined &&
			!token.selfClosing
		);
	};
	const inlineCloseMatches = (expected: string | undefined, name: string) => {
		charge(1);
		if (expected === undefined || name.length !== expected.length) return false;
		charge(2 * expected.length + 1);
		return name === expected;
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
	const tableSuffix = () => {
		let index = scopes.length - 1;
		const inspect = () => {
			charge(1);
			return scopes[index];
		};
		let current = inspect();
		let cell: number | undefined;
		let row: number | undefined;
		let groupIndex: number | undefined;
		if (current === "td" || current === "th") {
			cell = index--;
			current = inspect();
		}
		if (current === "tr") {
			row = index--;
			current = inspect();
		}
		if (cell !== undefined && row === undefined) return undefined;
		const group =
			current === "tbody" || current === "thead" || current === "tfoot"
				? current
				: undefined;
		if (group !== undefined) {
			groupIndex = index--;
			current = inspect();
		}
		if (current !== "table") return undefined;
		return { root: index, cell, row, group, groupIndex };
	};
	const tableStartPlan = (name: SourceHeadingScope) => {
		if (
			name !== "td" &&
			name !== "th" &&
			name !== "tr" &&
			name !== "tbody" &&
			name !== "tfoot"
		)
			return undefined;
		charge(1);
		const suffix = tableSuffix();
		if (!suffix) return undefined;
		if (name === "td" || name === "th") return suffix.cell;
		if (name === "tr") return suffix.row;
		if (
			tableScopePolicy === "optional-end-tags-v2" &&
			name === "tbody" &&
			suffix.group === "thead"
		)
			return suffix.groupIndex;
		return suffix.group === "tbody" ? suffix.groupIndex : undefined;
	};
	const tableEndPlan = (token: HtmlToken, name: SourceHeadingScope) => {
		if (
			scopes.at(-1) === name ||
			(name !== "tr" &&
				name !== "tbody" &&
				name !== "thead" &&
				name !== "tfoot" &&
				name !== "table")
		)
			return undefined;
		charge(1);
		const suffix = tableSuffix();
		if (!suffix) return undefined;
		let remaining: number | undefined;
		if (name === "tr") remaining = suffix.row;
		else if (name === "table") {
			if (suffix.group === undefined || suffix.group === "tbody")
				remaining = suffix.root;
		} else if (name === suffix.group) remaining = suffix.groupIndex;
		if (remaining === undefined) return undefined;
		charge(1);
		return plainEnd(token, name) ? remaining : undefined;
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
	const headBoundaryActive = () =>
		headPhase === "prefix" || headPhase === "eligible";
	const observeHeadBoundary = async (
		token: HtmlToken,
		completedRaw = false,
	) => {
		if (!headBoundaryActive()) return;
		charge(1);
		if (token.kind === "text") {
			for (let offset = 0; offset < token.data.length; offset += 256) {
				const end = Math.min(offset + 256, token.data.length);
				charge(end - offset);
				let whitespaceOnly = true;
				for (let index = offset; index < end; index++) {
					const code = token.data.charCodeAt(index);
					if (
						code !== 9 &&
						code !== 10 &&
						code !== 12 &&
						code !== 13 &&
						code !== 32
					)
						whitespaceOnly = false;
				}
				checkpoint();
				if (!whitespaceOnly) headPhase = "disabled";
				await yieldBatch();
				if (!whitespaceOnly) return;
			}
			if (!token.data.length) await yieldBatch();
			return;
		}
		if (token.kind === "comment") {
			await yieldBatch();
			return;
		}
		let nextPhase = headPhase;
		let nextDoctypeSeen = headDoctypeSeen;
		let nextHtmlSeen = headHtmlSeen;
		let closeHead = false;
		if (headPhase === "prefix") {
			if (token.kind === "doctype" && !headDoctypeSeen && !headHtmlSeen)
				nextDoctypeSeen = true;
			else if (
				token.kind === "start" &&
				token.name === "html" &&
				!token.selfClosing &&
				!headHtmlSeen
			)
				nextHtmlSeen = true;
			else if (
				token.kind === "start" &&
				token.name === "head" &&
				!token.selfClosing &&
				scopes.length === 1 &&
				scopes[0] === "head" &&
				!heading
			)
				nextPhase = "eligible";
			else nextPhase = "disabled";
		} else if (headPhase === "eligible") {
			if (
				token.kind === "start" &&
				(token.name === "base" ||
					token.name === "link" ||
					token.name === "meta" ||
					(completedRaw &&
						(token.name === "title" ||
							token.name === "style" ||
							token.name === "script")))
			) {
				await yieldBatch();
				return;
			}
			if (
				token.kind === "end" &&
				token.name === "head" &&
				scopes.length === 0 &&
				!heading
			)
				nextPhase = "done";
			else if (
				token.kind === "start" &&
				token.name === "body" &&
				!token.selfClosing
			) {
				charge(1);
				if (scopes.length === 1 && scopes[0] === "head" && !heading) {
					charge(1);
					closeHead = true;
					nextPhase = "done";
				} else nextPhase = "disabled";
			} else nextPhase = "disabled";
		}
		checkpoint();
		if (closeHead) scopes.pop();
		headPhase = nextPhase;
		headDoctypeSeen = nextDoctypeSeen;
		headHtmlSeen = nextHtmlSeen;
		await yieldBatch();
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
				if (headScopePolicy && headBoundaryActive())
					await observeHeadBoundary(token);
				await yieldBatch();
				continue;
			}
			if (token.kind === "comment" || token.kind === "doctype") {
				if (headScopePolicy && headBoundaryActive())
					await observeHeadBoundary(token);
				continue;
			}
			const name = token.name;
			if (name === "plaintext" || name === "noscript")
				unsupported("ambiguous-text-mode");
			const level = headingLevel(name);
			if (heading) {
				if (token.kind === "start") {
					if (name === "br" || name === "wbr") {
						if (name === "br") titleText(heading, " ");
					} else {
						if (!inlineTags.has(name)) {
							if (!headingInlinePolicy || !additionalInline(name, level, token))
								unsupported("heading-inline-structure", undefined, {
									kind: "source-heading-inline-start",
									condition: "non-inline-start",
									headingLevel: heading.level as 1 | 2 | 3 | 4 | 5 | 6,
									observedTag: inlineDiagnosticTag(name),
									inlineDepth: heading.inline.length,
								});
						} else if (token.selfClosing)
							unsupported("heading-inline-structure", undefined, {
								kind: "source-heading-inline-start",
								condition: "self-closing-inline",
								headingLevel: heading.level as 1 | 2 | 3 | 4 | 5 | 6,
								observedTag: inlineDiagnosticTag(name),
								inlineDepth: heading.inline.length,
							});
						if (headingInlinePolicy) charge(1);
						track(heading.inline.length + 2);
						heading.inline.push(name);
						if (headingInlinePolicy) await yieldBatch();
					}
				} else if (
					(headingInlinePolicy
						? inlineCloseMatches(heading.name, name)
						: name === heading.name) &&
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
					if (
						(headingInlinePolicy
							? !inlineCloseMatches(heading.inline.at(-1), name)
							: heading.inline.at(-1) !== name) ||
						!plainEnd(token, name)
					)
						unsupported("heading-close-structure");
					if (headingInlinePolicy) charge(1);
					heading.inline.pop();
					if (headingInlinePolicy) await yieldBatch();
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
				if (headScopePolicy && headBoundaryActive())
					await observeHeadBoundary(token, true);
				continue;
			}
			const tracked = isTrackedScope(name);
			if (token.kind === "start" && tracked) {
				const counts = suppressedTags.has(name)
					? suppressedStarts
					: omittedStarts;
				counts[name] = (counts[name] ?? 0) + 1;
				if (voidTags.has(name)) {
					if (headScopePolicy && headBoundaryActive())
						await observeHeadBoundary(token);
					continue;
				}
				if (token.selfClosing) {
					if (name !== "svg" && name !== "math")
						unsupported("scope-self-closing");
					if (headScopePolicy && headBoundaryActive())
						await observeHeadBoundary(token);
					continue;
				}
				const remaining = tableScopePolicy ? tableStartPlan(name) : undefined;
				if (remaining !== undefined) {
					charge(scopes.length - remaining + 1);
					track(remaining + 1);
					scopes.length = remaining;
					scopes.push(name);
					if (headScopePolicy && headBoundaryActive())
						await observeHeadBoundary(token);
					await yieldBatch();
					continue;
				}
				track(scopes.length + 1);
				scopes.push(name);
				if (headScopePolicy && headBoundaryActive())
					await observeHeadBoundary(token);
				if (tableScopePolicy) await yieldBatch();
				continue;
			}
			if (token.kind === "end" && tracked) {
				const remaining = tableScopePolicy
					? tableEndPlan(token, name)
					: undefined;
				if (remaining !== undefined) {
					charge(scopes.length - remaining);
					scopes.length = remaining;
					if (headScopePolicy && headBoundaryActive())
						await observeHeadBoundary(token);
					await yieldBatch();
					continue;
				}
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
				if (headScopePolicy && headBoundaryActive())
					await observeHeadBoundary(token);
				if (tableScopePolicy) await yieldBatch();
				continue;
			}
			if (level === undefined && headScopePolicy && headBoundaryActive())
				await observeHeadBoundary(token);
			if (scopes.length) {
				if (token.kind === "start" && level !== undefined)
					suppressedHeadingStarts++;
				if (level !== undefined && headScopePolicy && headBoundaryActive())
					await observeHeadBoundary(token);
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
				if (headScopePolicy && headBoundaryActive())
					await observeHeadBoundary(token);
			}
		}
		checkpoint();
		const report = freezeOwned<ResearchSourceHeadingReport>({
			kind: "source-heading-candidates",
			method: "native-source-headings-v1",
			semantics: "lexical-not-dom",
			partial: true,
			contentSuccess: null,
			...(tableScopePolicy ? { tableScopePolicy } : {}),
			...(headScopePolicy ? { headScopePolicy } : {}),
			...(headingInlinePolicy
				? {
						headingInlinePolicy,
						headingInlineLimitations: [
							"source-balance-only",
							"attributes-ignored",
							"not-dom-or-visibility",
						] as const,
					}
				: {}),
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
