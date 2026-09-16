import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type HtmlDiscardRawName,
	HtmlRawDiscardSession,
	HtmlTokenizer,
} from "./html-tokenizer.js";
import { researchLongDocumentAdmission } from "./research-admission.js";
import {
	researchReaderLimits,
	researchReaderRawLimits,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

const rawPolicy = "separate-omitted-raw-v1";
const rawNames: HtmlDiscardRawName[] = [
	"script",
	"style",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
];
const boundaries = [1014, 5100, 21_474, 87_000, 152_526];
const offsets = [-2, -1, 0, 1, 2, 8, 9, 10, 11, 12];
const ordinaryTail = `tail${"t".repeat(65_536)}`;

afterEach(() => vi.restoreAllMocks());

function caught(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected raw discard resource failure");
}

function parity(
	name: HtmlDiscardRawName,
	source: string,
	body: string,
	tail: string,
	issues: string[] = [],
) {
	const ordinaryIssues: string[] = [];
	const discardedIssues: string[] = [];
	const ordinary = new HtmlTokenizer(source, (code) =>
		ordinaryIssues.push(code),
	);
	const discarded = new HtmlTokenizer(source, (code) =>
		discardedIssues.push(code),
	);
	expect(ordinary.raw(name)).toBe(body);
	const result = discarded.discardRaw(name, () => {});
	expect(result).toEqual({
		discardedCodeUnits: body.length,
		steps: expect.any(Number),
	});
	expect(result.steps).toBeGreaterThan(0);
	expect(Object.isFrozen(result)).toBe(true);
	expect(source.slice(0, discarded.position)).toBe(body);
	expect(discarded.position).toBe(ordinary.position);
	expect(discarded.workUnits).toBe(body.length);
	expect(discarded.workUnits).toBe(ordinary.workUnits);
	expect(discarded.paused).toBe(false);
	expect(discarded.issueCount).toBe(ordinary.issueCount);
	expect(discardedIssues).toEqual(ordinaryIssues);
	expect(discarded.next()).toEqual(ordinary.next());
	expect(discarded.position).toBe(ordinary.position);
	expect(discarded.remainder()).toBe(tail);
	expect(ordinary.remainder()).toBe(tail);
	expect(discarded.workUnits).toBe(source.length);
	expect(discarded.workUnits).toBe(ordinary.workUnits);
	expect(discardedIssues).toEqual(ordinaryIssues);
	expect(discardedIssues).toEqual(issues);
	expect(discarded.issueCount).toBe(issues.length);
}

describe("adaptive raw discard accounting", () => {
	it("admits 600 tiny scripts without spending the raw cap on ordinary tails", () => {
		expect(researchReaderRawLimits).toEqual({
			maxWorkUnits: 32_000_000,
			maxWindowCodeUnits: 65_536,
		});
		expect(researchReaderLimits).toEqual({
			maxSourceCodeUnits: 2_000_000,
			maxTextCodeUnits: 1_000_000,
			maxOutputCodeUnits: 2_000_000,
			maxTokens: 100_000,
			maxDepth: 128,
		});
		expect(Object.isFrozen(researchReaderRawLimits)).toBe(true);
		expect(Object.isFrozen(researchReaderLimits)).toBe(true);
		const text = "t".repeat(65_536);
		const source = `${"<script>x</script>".repeat(600)}<p>${text}</p>`;
		const legacy = sanitizeResearchHtml(source);
		const selected = sanitizeResearchHtml(
			source,
			{},
			undefined,
			undefined,
			rawPolicy,
		);
		expect(selected.html).toBe(`<p>${text}</p>`);
		expect(selected.html).toBe(legacy.html);
		expect(selected.report.sourceCodeUnits).toBe(source.length);
		expect(selected.report.textCodeUnits).toBe(text.length);
		expect(selected.report.rawTextPolicy).toBe(rawPolicy);
		expect(selected.report.omittedRaw).toEqual({
			codeUnits: 600,
			elements: 600,
			steps: 600,
			workUnits: 625_800,
			...researchReaderRawLimits,
		});
		expect(selected.report.omittedRaw?.workUnits).toBeLessThan(2_000_000);
		expect(Object.isFrozen(selected.report)).toBe(true);
		expect(Object.isFrozen(selected.report.omittedRaw)).toBe(true);
		const { rawTextPolicy, omittedRaw, ...common } = selected.report;
		expect(rawTextPolicy).toBe(rawPolicy);
		expect(omittedRaw?.codeUnits).toBe(600);
		expect({ ...common, textCodeUnits: common.textCodeUnits + 600 }).toEqual(
			legacy.report,
		);
	});

	it.each(rawNames)("prepays small windows for short %s bodies", (name) => {
		for (const tail of ["tail", ordinaryTail]) {
			const body = "x😀&amp;\0";
			const source = `${body}</${name.toUpperCase()}>${tail}`;
			const tokenizer = new HtmlTokenizer(source, vi.fn());
			const reference = new HtmlTokenizer(source, vi.fn());
			const step = vi.spyOn(HtmlRawDiscardSession.prototype, "step");
			let charged = 0;
			const debit = vi.fn((units: number) => {
				charged += units;
			});
			const length = Math.min(1024, source.length);
			expect(reference.raw(name)).toBe(body);
			const result = tokenizer.discardRaw(name, debit);
			expect(result).toEqual({ discardedCodeUnits: body.length, steps: 1 });
			expect(Object.keys(result)).toEqual(["discardedCodeUnits", "steps"]);
			expect(Object.isFrozen(result)).toBe(true);
			expect(step).toHaveBeenCalledExactlyOnceWith(
				source.slice(0, length),
				length === source.length,
				debit,
				expect.any(Function),
			);
			expect(debit.mock.calls[0]).toEqual([length]);
			expect(debit.mock.invocationCallOrder[0]).toBeLessThan(
				step.mock.invocationCallOrder[0],
			);
			expect(charged).toBe(
				length +
					(name === "script"
						? body.length * 5 + 14
						: body.length + name.length + 4),
			);
			expect(tokenizer.position).toBe(body.length);
			expect(tokenizer.workUnits).toBe(body.length);
			expect(tokenizer.next()).toEqual(reference.next());
			expect(tokenizer.remainder()).toBe(tail);
			expect(reference.remainder()).toBe(tail);
			expect(tokenizer.workUnits).toBe(source.length);
			expect(tokenizer.issueCount).toBe(0);
			step.mockRestore();
		}
	});

	it("resets the first window after a previous raw element grows to the cap", () => {
		const body = "a".repeat(90_000);
		const source = `<style>${body}</style>${rawNames.map((name) => `<${name}>x</${name}>`).join("")}${ordinaryTail}`;
		const tokenizer = new HtmlTokenizer(source, vi.fn());
		const step = vi.spyOn(HtmlRawDiscardSession.prototype, "step");
		expect(tokenizer.next()).toMatchObject({ kind: "start", name: "style" });
		expect(tokenizer.discardRaw("style", () => {})).toEqual({
			discardedCodeUnits: body.length,
			steps: 5,
		});
		expect(step.mock.calls.map(([input]) => input.length)).toEqual([
			1024, 4096, 16_384, 65_536, 65_536,
		]);
		expect(tokenizer.next()).toMatchObject({ kind: "end", name: "style" });
		for (const name of rawNames) {
			step.mockClear();
			expect(tokenizer.next()).toMatchObject({ kind: "start", name });
			expect(tokenizer.discardRaw(name, () => {})).toEqual({
				discardedCodeUnits: 1,
				steps: 1,
			});
			expect(step.mock.calls.map(([input]) => input.length)).toEqual([1024]);
			expect(tokenizer.workUnits).toBe(tokenizer.position);
			expect(tokenizer.next()).toMatchObject({ kind: "end", name });
		}
		expect(tokenizer.remainder()).toBe(ordinaryTail);
		expect(tokenizer.workUnits).toBe(source.length);
		expect(tokenizer.issueCount).toBe(0);
	});

	it.each(["source", "text"] as const)("retains the %s cap", (kind) => {
		const prefix = "<script>x</script>";
		const limit =
			kind === "source"
				? researchReaderLimits.maxSourceCodeUnits
				: researchReaderLimits.maxTextCodeUnits;
		const source =
			kind === "source"
				? prefix + "a".repeat(limit + 1 - prefix.length)
				: `${prefix}<p>${"a".repeat(limit + 1)}</p>`;
		const error = caught(() =>
			sanitizeResearchHtml(source, {}, undefined, undefined, rawPolicy),
		);
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: `reader.${kind}`,
			unit: "code-units",
			limit,
			observed: limit + 1,
		});
	});

	it("exhausts the unchanged aggregate work cap with real raw scanning", () => {
		const element = `<script>${"<".repeat(1_100_000)}</script>`;
		const source = `${element.repeat(2)}<p>After</p>`;
		expect(source.length).toBeLessThan(
			researchLongDocumentAdmission.reader.maxSourceCodeUnits,
		);
		const original = HtmlTokenizer.prototype.discardRaw;
		let tokenizer: HtmlTokenizer | undefined;
		const discard = vi
			.spyOn(HtmlTokenizer.prototype, "discardRaw")
			.mockImplementation(function (this: HtmlTokenizer, name, debit) {
				tokenizer = this;
				return original.call(this, name, debit);
			});
		const step = vi.spyOn(HtmlRawDiscardSession.prototype, "step");
		const error = caught(() =>
			sanitizeResearchHtml(source, {}, undefined, "long-v1", rawPolicy),
		);
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "reader.omitted-work",
			unit: "code-units",
			limit: 32_000_000,
			observed: 32_000_001,
		});
		expect(discard).toHaveBeenCalledTimes(2);
		expect(step).toHaveBeenCalledTimes(39);
		expect(step.mock.results.at(-1)).toEqual({ type: "throw", value: error });
		const completedProgress = step.mock.results.reduce(
			(total, result) =>
				result.type === "return" ? total + result.value.consumed : total,
			0,
		);
		expect(completedProgress).toBe(2_104_364);
		expect(tokenizer?.position).toBe(completedProgress + 25);
		expect(tokenizer?.workUnits).toBe(completedProgress + 25);
		expect(tokenizer?.issueCount).toBe(0);
		discard.mockRestore();
		step.mockRestore();
		const recovered = sanitizeResearchHtml(
			"<script>x</script><p>After</p>",
			{},
			undefined,
			"long-v1",
			rawPolicy,
		);
		expect(recovered.html).toBe("<p>After</p>");
		expect(recovered.report.omittedRaw).toEqual({
			codeUnits: 1,
			elements: 1,
			steps: 1,
			workUnits: 41,
			...researchReaderRawLimits,
		});
	});
});

describe.each(boundaries)("raw discard boundary at %i", (boundary) => {
	it.each(rawNames)("preserves exact %s closing ownership and tail", (name) => {
		for (const offset of offsets) {
			const body = "a".repeat(boundary + offset);
			parity(
				name,
				`${body}</${name.toUpperCase()}>${ordinaryTail}`,
				body,
				ordinaryTail,
			);
		}
	});

	it.each([
		{ prefix: "", marker: "<!--", suffix: "escaped" },
		{ prefix: "<!--", marker: "<ScRiPt>", suffix: "double</sCrIpT>escaped" },
		{ prefix: "<!--<script>", marker: "</sCrIpT>", suffix: "escaped" },
		{ prefix: "<!--", marker: "-->", suffix: "data" },
		{ prefix: "<!--<script>", marker: "-->", suffix: "data" },
	])(
		"preserves script transition $prefix / $marker",
		({ prefix, marker, suffix }) => {
			for (const offset of offsets) {
				const body =
					prefix +
					"a".repeat(boundary + offset - prefix.length) +
					marker +
					suffix;
				parity("script", `${body}</ScRiPt>${ordinaryTail}`, body, ordinaryTail);
				parity("script", body, body, "", ["unterminated-raw-element"]);
			}
		},
	);

	it.each(rawNames)("preserves %s EOF and false delimiters", (name) => {
		for (const offset of [-1, 0, 1]) {
			const body = `${"a".repeat(boundary + offset)}</${name}=false>\0😀`;
			parity(name, `${body}</${name}>${ordinaryTail}`, body, ordinaryTail);
			parity(name, body, body, "", ["unterminated-raw-element"]);
		}
	});
});
