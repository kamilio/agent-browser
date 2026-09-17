import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type HtmlDiscardRawName,
	HtmlRawDiscardSession,
	HtmlTokenizer,
	htmlRawDiscardWindowCodeUnits,
} from "./html-tokenizer.js";

const names: HtmlDiscardRawName[] = [
	"script",
	"style",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
];
const boundaries = [1014, 5100, 21_474, 87_000];
const offsets = [-2, -1, 0, 1, 2];
const scriptBodies = [
	"plain>😀&amp;\0é中\ud800\udc00\ud800",
	"<!--escaped--x->still escaped",
	"<!--<script>double</script>escaped",
	"<!--<ScRiPt>double-->data",
	"<!-- --><script>data",
	"<!--<!--<script>double</script>tail",
	"<!--<scriptx>one</scriptx></script-foo></script=bad>",
	"<!--<script>one<script>two</script>escaped",
	'const text = "',
];

afterEach(() => vi.restoreAllMocks());

function caught(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected synthetic raw batch failure");
}

function accounting() {
	const batches: { codeUnits: number; scriptData: boolean }[] = [];
	let charged = 0;
	let debitCalls = 0;
	return {
		batches,
		debit(units: number) {
			charged += units;
			debitCalls++;
		},
		batch(codeUnits: number, scriptData: boolean) {
			batches.push({ codeUnits, scriptData });
			charged += codeUnits * (scriptData ? 5 : 1);
		},
		get charged() {
			return charged;
		},
		get debitCalls() {
			return debitCalls;
		},
	};
}

function expectBatches(batches: { codeUnits: number; scriptData: boolean }[]) {
	for (const { codeUnits, scriptData } of batches) {
		expect(Number.isInteger(codeUnits)).toBe(true);
		expect(codeUnits).toBeGreaterThan(0);
		expect(codeUnits).toBeLessThanOrEqual(1024);
		expect(typeof scriptData).toBe("boolean");
	}
}

function parity(
	name: HtmlDiscardRawName,
	body: string,
	closing = `</${name}>`,
	tail = "<p>tail😀&amp;</p>",
) {
	const source = `<${name}>${body}${closing}${tail}`;
	const ordinaryIssues: string[] = [];
	const legacyIssues: string[] = [];
	const batchedIssues: string[] = [];
	const ordinary = new HtmlTokenizer(source, (code) =>
		ordinaryIssues.push(code),
	);
	const legacy = new HtmlTokenizer(source, (code) => legacyIssues.push(code));
	const batched = new HtmlTokenizer(source, (code) => batchedIssues.push(code));
	for (const tokenizer of [ordinary, legacy, batched])
		expect(tokenizer.next()).toMatchObject({ kind: "start", name });
	expect(ordinary.raw(name)).toBe(body);
	const legacyWork = accounting();
	const batchedWork = accounting();
	const expected = legacy.discardRaw(name, legacyWork.debit);
	const actual = batched.discardRaw(name, batchedWork.debit, batchedWork.batch);
	expect(actual).toEqual(expected);
	expect(actual).toEqual({
		discardedCodeUnits: body.length,
		steps: expect.any(Number),
	});
	expect(actual.steps).toBeGreaterThan(0);
	expect(Object.isFrozen(actual)).toBe(true);
	expect(batchedWork.charged).toBe(legacyWork.charged);
	expectBatches(batchedWork.batches);
	if (closing === "")
		expect(ordinaryIssues).toEqual(["unterminated-raw-element"]);
	for (let tokenIndex = 0; tokenIndex < 4; tokenIndex++) {
		for (const tokenizer of [legacy, batched]) {
			expect(tokenizer.position).toBe(ordinary.position);
			expect(tokenizer.workUnits).toBe(ordinary.workUnits);
			expect(tokenizer.issueCount).toBe(ordinary.issueCount);
			expect(tokenizer.paused).toBe(false);
		}
		expect(legacyIssues).toEqual(ordinaryIssues);
		expect(batchedIssues).toEqual(ordinaryIssues);
		const token = ordinary.next();
		expect(legacy.next()).toEqual(token);
		expect(batched.next()).toEqual(token);
	}
	const remainder = ordinary.remainder();
	expect(legacy.remainder()).toBe(remainder);
	expect(batched.remainder()).toBe(remainder);
	for (const tokenizer of [legacy, batched]) {
		expect(tokenizer.position).toBe(ordinary.position);
		expect(tokenizer.workUnits).toBe(ordinary.workUnits);
		expect(tokenizer.issueCount).toBe(ordinary.issueCount);
	}
	expect(legacyIssues).toEqual(ordinaryIssues);
	expect(batchedIssues).toEqual(ordinaryIssues);
	return { legacyWork, batchedWork, result: actual };
}

function observeStep(
	session: HtmlRawDiscardSession,
	input: string,
	final: boolean,
	batched: boolean,
) {
	const charges: number[] = [];
	const issues: string[] = [];
	const batches: { codeUnits: number; scriptData: boolean }[] = [];
	const batch = (codeUnits: number, scriptData: boolean) => {
		batches.push({ codeUnits, scriptData });
		for (let index = 0; index < codeUnits; index++) {
			charges.push(1);
			if (scriptData) charges.push(4);
		}
	};
	const result = session.step(
		input,
		final,
		(units) => charges.push(units),
		(code) => issues.push(code),
		batched ? batch : undefined,
	);
	expectBatches(batches);
	return { result, charges, issues, batches };
}

describe("opt-in bounded raw scan batches", () => {
	it.each(names)("matches legacy and ordinary %s raw parsing", (name) => {
		const body = `😀é中\0&amp;\ud800<${name}>one</${name}x>two`;
		parity(name, body, `</${name.toUpperCase()}>`);
		parity(name, body, "", "");
		parity(name, "");
		parity(name, "", "", "");
		for (const suffix of ["<", "</", `</${name}`, `</${name}X`])
			parity(name, `body${suffix}`, "", "");
	});

	it.each(scriptBodies)("preserves script states for %j", (body) => {
		parity("script", body, "</ScRiPt>");
		parity("script", body, "", "");
	});

	it.each(["\t", "\n", "\f", "\r", " ", "/", ">"])(
		"accepts case-insensitive raw and script delimiters %j",
		(delimiter) => {
			for (const name of names)
				parity(name, "body", `</${name.toUpperCase()}${delimiter}>`);
			parity(
				"script",
				`<!--<ScRiPt${delimiter}>double</sCrIpT${delimiter}>escaped`,
			);
		},
	);

	it.each(["x", "-", "=", "\0", "\v", "\u00a0"])(
		"ignores false closing and script-state delimiters %j",
		(delimiter) => {
			for (const name of names) parity(name, `one</${name}${delimiter}>two`);
			parity("script", `<!--<script${delimiter}>escaped`);
			parity(
				"script",
				`<!--<script>double</script${delimiter}>still double</script>escaped`,
			);
		},
	);

	it.each(names)(
		"preserves %s closing tags at adaptive window edges",
		(name) => {
			for (const boundary of boundaries)
				for (const offset of offsets)
					parity(
						name,
						"a".repeat(boundary + offset),
						`</${name.toUpperCase()}>`,
					);
		},
	);

	it.each(names)(
		"counts non-ASCII %s code units across batch and window edges",
		(name) => {
			for (const boundary of [1014, 1024, 2048, 5100]) {
				const body = `${"a".repeat(boundary - 1)}😀é中\0\ud800tail`;
				parity(name, body);
				parity(name, body, "", "");
			}
			parity(
				name,
				"short",
				`</${name}>`,
				"t".repeat(htmlRawDiscardWindowCodeUnits),
			);
		},
	);

	it.each([
		{ prefix: "", marker: "<!--" },
		{ prefix: "<!--", marker: "<ScRiPt>" },
		{ prefix: "<!--<script>", marker: "</sCrIpT>" },
		{ prefix: "<!--", marker: "-->" },
		{ prefix: "<!--<script>", marker: "-->" },
	])(
		"preserves $marker and dash carry after $prefix at window edges",
		({ prefix, marker }) => {
			for (const boundary of boundaries) {
				for (const offset of offsets) {
					const body = `${prefix}${"a".repeat(boundary + offset - prefix.length)}${marker}tail`;
					const closing = marker === "<ScRiPt>" ? "</script>escaped" : "";
					parity("script", body + closing);
				}
			}
		},
	);

	it.each(["script", "style"] as const)(
		"reduces %s callbacks without timing assertions or larger windows",
		(name) => {
			const body = "a".repeat(htmlRawDiscardWindowCodeUnits * 2 + 123);
			const { legacyWork, batchedWork, result } = parity(name, body);
			expect(result.steps).toBeGreaterThan(4);
			expect(batchedWork.batches.length).toBeGreaterThan(0);
			expect(
				batchedWork.batches.reduce(
					(total, batch) => total + batch.codeUnits,
					0,
				),
			).toBe(body.length);
			expect(
				batchedWork.batches.every(
					(batch) => batch.scriptData === (name === "script"),
				),
			).toBe(true);
			expect(batchedWork.debitCalls + batchedWork.batches.length).toBeLessThan(
				legacyWork.debitCalls / 100,
			);
		},
	);

	it.each(names)(
		"preserves every legacy %s session charge in order",
		(name) => {
			const bodies =
				name === "script" ? scriptBodies : ["plain>😀\0<&amp;false"];
			for (const body of bodies) {
				for (const input of [body, `${body}</${name}>tail`]) {
					const legacy = observeStep(
						new HtmlRawDiscardSession(name),
						input,
						true,
						false,
					);
					const batched = observeStep(
						new HtmlRawDiscardSession(name),
						input,
						true,
						true,
					);
					expect(batched.result).toEqual(legacy.result);
					expect(batched.charges).toEqual(legacy.charges);
					expect(batched.issues).toEqual(legacy.issues);
				}
			}
		},
	);

	it("prepays every bounded window before invoking batched scans", () => {
		const body = "a".repeat(htmlRawDiscardWindowCodeUnits * 2 + 123);
		const source = `${body}</style>tail`;
		const tokenizer = new HtmlTokenizer(source, vi.fn());
		const work = accounting();
		const original = HtmlRawDiscardSession.prototype.step;
		let completedStepCharge = 0;
		const step = vi
			.spyOn(HtmlRawDiscardSession.prototype, "step")
			.mockImplementation(function (
				this: HtmlRawDiscardSession,
				input,
				final,
				debit,
				emitIssue,
				batch,
			) {
				const position = tokenizer.position;
				expect(work.charged - completedStepCharge).toBe(input.length);
				expect(input.length).toBeLessThanOrEqual(htmlRawDiscardWindowCodeUnits);
				expect(input).toBe(source.slice(position, position + input.length));
				expect(final).toBe(position + input.length === source.length);
				expect(batch).toBe(work.batch);
				let batchedUnits = 0;
				const result = original.call(
					this,
					input,
					final,
					debit,
					emitIssue,
					(codeUnits, scriptData) => {
						batchedUnits += codeUnits;
						expect(tokenizer.position).toBe(position);
						batch?.(codeUnits, scriptData);
					},
				);
				expect(batchedUnits).toBe(result.consumed);
				expect(tokenizer.position).toBe(position);
				completedStepCharge = work.charged;
				return result;
			});
		const result = tokenizer.discardRaw("style", work.debit, work.batch);
		expect(step).toHaveBeenCalledTimes(result.steps);
		expect(step.mock.calls.map(([input]) => input.length)).toEqual([
			1024,
			4096,
			16_384,
			65_536,
			source.length - 87_000,
		]);
		expect(result.discardedCodeUnits).toBe(body.length);
		expectBatches(work.batches);
	});

	it.each(names)("does not batch the nonfinal %s lookahead reserve", (name) => {
		const input = "a".repeat(2048);
		const legacy = observeStep(
			new HtmlRawDiscardSession(name),
			input,
			false,
			false,
		);
		const batched = observeStep(
			new HtmlRawDiscardSession(name),
			input,
			false,
			true,
		);
		expect(batched.result).toEqual({ consumed: 2038, status: "more" });
		expect(batched.result).toEqual(legacy.result);
		expect(batched.charges).toEqual(legacy.charges);
		expect(batched.issues).toEqual([]);
		expect(
			batched.batches.reduce((total, batch) => total + batch.codeUnits, 0),
		).toBe(2038);
	});

	it.each(["<!--", "<!--<script>"])(
		"preserves exact session charges for carried dashes after %s",
		(prefix) => {
			for (const dashCount of [1, 2]) {
				const legacy = new HtmlRawDiscardSession("script");
				const batched = new HtmlRawDiscardSession("script");
				const first = `${prefix}${"a".repeat(1014 - prefix.length - dashCount)}${"-".repeat(dashCount)}`;
				const second = `${dashCount === 1 ? "-" : ""}>tail</script>after`;
				for (const [input, final] of [
					[first + second.slice(0, 10), false],
					[second, true],
				] as const) {
					const expected = observeStep(legacy, input, final, false);
					const actual = observeStep(batched, input, final, true);
					expect(actual.result).toEqual(expected.result);
					expect(actual.charges).toEqual(expected.charges);
					expect(actual.issues).toEqual(expected.issues);
				}
			}
		},
	);

	it.each(["script", "style"] as const)(
		"keeps omitted and explicitly undefined %s batching on legacy debits",
		(name) => {
			for (const explicit of [false, true]) {
				const tokenizer = new HtmlTokenizer(`ab></${name}>`, vi.fn());
				const debit = vi.fn();
				if (explicit) tokenizer.discardRaw(name, debit, undefined);
				else tokenizer.discardRaw(name, debit);
				expect(debit.mock.calls).toEqual(
					(name === "script"
						? [12, 1, 4, 1, 4, 1, 4, 1, 4, 9]
						: [11, 1, 1, 1, 1, 8]
					).map((units) => [units]),
				);
			}
		},
	);

	it.each([null, false, 0, "batch", {}, [], { call() {} }])(
		"rejects invalid optional callback %j before work or state changes",
		(batch) => {
			const debit = vi.fn();
			const issue = vi.fn();
			const tokenizer = new HtmlTokenizer("<!--<script>body", issue);
			expect(
				caught(() =>
					Reflect.apply(tokenizer.discardRaw, tokenizer, [
						"script",
						debit,
						batch,
					]),
				),
			).toMatchObject({ code: "invalid-input" });
			expect(debit).not.toHaveBeenCalled();
			expect(issue).not.toHaveBeenCalled();
			expect(tokenizer.position).toBe(0);
			expect(tokenizer.workUnits).toBe(0);
			expect(tokenizer.issueCount).toBe(0);
			expect(tokenizer.paused).toBe(false);
			const session = new HtmlRawDiscardSession("script");
			expect(
				caught(() =>
					Reflect.apply(session.step, session, [
						"<!--<script>body",
						true,
						debit,
						issue,
						batch,
					]),
				),
			).toMatchObject({ code: "invalid-input" });
			expect(debit).not.toHaveBeenCalled();
			expect(issue).not.toHaveBeenCalled();
			expect(observeStep(session, "body</script>", true, true).result).toEqual({
				consumed: 4,
				status: "end-tag",
			});
		},
	);

	it.each(["script", "style"] as const)(
		"propagates %s cancellation from prepaid windows and batches",
		(name) => {
			for (const cancelAt of [
				"window",
				"first-batch",
				"next-window-batch",
			] as const) {
				const tokenizer = new HtmlTokenizer(
					`${"a".repeat(6000)}</${name}>`,
					vi.fn(),
				);
				const failure = new Error(`synthetic ${cancelAt} cancellation`);
				let batchCalls = 0;
				const debit = vi.fn(() => {
					if (cancelAt === "window") throw failure;
				});
				const batch = () => {
					batchCalls++;
					if (batchCalls === (cancelAt === "next-window-batch" ? 2 : 1))
						throw failure;
				};
				expect(caught(() => tokenizer.discardRaw(name, debit, batch))).toBe(
					failure,
				);
				const progress = cancelAt === "next-window-batch" ? 1014 : 0;
				expect(tokenizer.position).toBe(progress);
				expect(tokenizer.workUnits).toBe(progress);
				expect(tokenizer.issueCount).toBe(0);
				expect(batchCalls).toBe(
					cancelAt === "window" ? 0 : cancelAt === "first-batch" ? 1 : 2,
				);
				if (cancelAt === "window")
					expect(debit).toHaveBeenCalledExactlyOnceWith(1024);
			}
		},
	);

	it.each(["script", "style"] as const)(
		"still propagates original %s structural debit errors after a batch",
		(name) => {
			const tokenizer = new HtmlTokenizer(`plain</${name}>tail`, vi.fn());
			const failure = new Error("synthetic structural debit failure");
			const batch = vi.fn();
			expect(
				caught(() =>
					tokenizer.discardRaw(
						name,
						(units) => {
							if (units === (name === "script" ? 9 : 8)) throw failure;
						},
						batch,
					),
				),
			).toBe(failure);
			expect(batch).toHaveBeenCalledExactlyOnceWith(5, name === "script");
			expect(tokenizer.position).toBe(0);
			expect(tokenizer.workUnits).toBe(0);
			expect(tokenizer.issueCount).toBe(0);
		},
	);

	it.each(names)(
		"preserves %s EOF issue errors and completed progress",
		(name) => {
			const body = `😀${"a".repeat(6000)}`;
			const failure = new Error("synthetic EOF issue failure");
			const totals: number[] = [];
			for (const batched of [false, true]) {
				const tokenizer = new HtmlTokenizer(body, () => {
					throw failure;
				});
				const work = accounting();
				expect(
					caught(() =>
						tokenizer.discardRaw(
							name,
							work.debit,
							batched ? work.batch : undefined,
						),
					),
				).toBe(failure);
				expect(tokenizer.position).toBe(body.length);
				expect(tokenizer.workUnits).toBe(body.length);
				expect(tokenizer.issueCount).toBe(1);
				totals.push(work.charged);
			}
			expect(totals[1]).toBe(totals[0]);
		},
	);
});
