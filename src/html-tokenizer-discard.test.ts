import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type HtmlDiscardRawName,
	HtmlRawDiscardSession,
	HtmlTokenizer,
	htmlRawDiscardWindowCodeUnits,
} from "./html-tokenizer.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

const names: HtmlDiscardRawName[] = [
	"script",
	"style",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
];
const windowSize = htmlRawDiscardWindowCodeUnits;
const windowProgress = windowSize - 10;

afterEach(() => vi.restoreAllMocks());

function caught(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected synthetic discard failure");
}

function parity(name: HtmlDiscardRawName, source: string) {
	const ordinaryIssues: string[] = [];
	const discardedIssues: string[] = [];
	const ordinary = new HtmlTokenizer(source, (code) =>
		ordinaryIssues.push(code),
	);
	const discarded = new HtmlTokenizer(source, (code) =>
		discardedIssues.push(code),
	);
	const body = ordinary.raw(name);
	let charged = 0;
	const result = discarded.discardRaw(name, (units) => {
		charged += units;
	});
	expect(result).toEqual({
		discardedCodeUnits: body?.length,
		steps: expect.any(Number),
	});
	expect(result.steps).toBeGreaterThan(0);
	expect(Object.isFrozen(result)).toBe(true);
	expect(discarded.position).toBe(ordinary.position);
	expect(discarded.workUnits).toBe(ordinary.workUnits);
	expect(discarded.issueCount).toBe(ordinary.issueCount);
	expect(discarded.paused).toBe(false);
	expect(discardedIssues).toEqual(ordinaryIssues);
	expect(charged).toBeGreaterThanOrEqual(discarded.workUnits);
	expect(discarded.next()).toEqual(ordinary.next());
	expect(discarded.remainder()).toBe(ordinary.remainder());
	expect(discardedIssues).toEqual(ordinaryIssues);
	return result;
}

describe("bounded no-payload raw discard", () => {
	it.each(names)("matches ordinary %s raw parsing", (name) => {
		const body = `PRIVATE_RAW_😀&amp;\0<${name}>one</${name}x>two`;
		parity(name, `${body}</${name.toUpperCase()}>tail`);
		parity(name, body);
	});

	it.each([
		"plain",
		"<!--escaped",
		"<!--<script>double</script>escaped",
		"<!--<ScRiPt>double-->data",
		"<!-- --><script>data",
		"<!--<!--<script>double</script>tail",
		"<!--<scriptx>one</scriptx></script-foo></script=bad>",
		'const text = "',
	])("matches script states for %j", (body) => {
		parity("script", `${body}</ScRiPt>tail`);
		parity("script", body);
	});

	it.each(["\t", "\n", "\f", "\r", " ", "/", ">"])(
		"matches raw and script delimiters %j",
		(delimiter) => {
			for (const name of names)
				parity(name, `body</${name.toUpperCase()}${delimiter}>tail`);
			parity(
				"script",
				`<!--<ScRiPt${delimiter}>double</sCrIpT${delimiter}>tail</SCRIPT>after`,
			);
		},
	);

	it.each(["x", "-", "=", "\0", "\v", "\u00a0"])(
		"ignores false end and transition delimiters %j",
		(delimiter) => {
			for (const name of names)
				parity(name, `one</${name}${delimiter}>two</${name}>tail`);
			parity("script", `<!--<script${delimiter}>one</script>tail`);
		},
	);

	it.each(names)("preserves %s closing markers across window edges", (name) => {
		for (let distance = -12; distance <= 2; distance++) {
			const body = "a".repeat(windowSize + distance);
			parity(name, `${body}</${name.toUpperCase()}>tail`);
		}
	});

	it.each(["<!--", "<ScRiPt>", "</sCrIpT>", "-->"])(
		"preserves script transition %j across window edges",
		(marker) => {
			const prefix =
				marker === "<!--"
					? ""
					: marker === "<ScRiPt>"
						? "<!--"
						: "<!--<script>";
			for (let distance = -12; distance <= 2; distance++) {
				const body =
					prefix + "a".repeat(windowSize + distance - prefix.length) + marker;
				parity("script", `${body}tail</script>after</script>final`);
			}
		},
	);

	it("uses many bounded, prepaid session windows and returns only counts", () => {
		expect(windowSize).toBe(65_536);
		const body = "a".repeat(windowProgress * 12 + 37);
		const source = `${body}</style>tail`;
		const tokenizer = new HtmlTokenizer(source, vi.fn());
		const step = vi.spyOn(HtmlRawDiscardSession.prototype, "step");
		let charged = 0;
		const windowCharges: number[] = [];
		const result = tokenizer.discardRaw("style", (units) => {
			charged += units;
			if (units > 10) windowCharges.push(units);
		});
		expect(result).toEqual({ discardedCodeUnits: body.length, steps: 13 });
		expect(Object.keys(result)).toEqual(["discardedCodeUnits", "steps"]);
		expect(Object.isFrozen(result)).toBe(true);
		expect(step).toHaveBeenCalledTimes(result.steps);
		const lengths = step.mock.calls.map(([input]) => input.length);
		expect(lengths.every((length) => length <= windowSize)).toBe(true);
		expect(lengths).toEqual(windowCharges);
		expect(charged).toBe(
			lengths.reduce((total, length) => total + length, 0) +
				body.length +
				12 * 2 +
				9,
		);
		expect(tokenizer.position).toBe(body.length);
		expect(tokenizer.workUnits).toBe(body.length);
		expect(tokenizer.next()).toMatchObject({ kind: "end", name: "style" });
	});

	it("debits before slicing or stepping, even on immediate cancellation", () => {
		const tokenizer = new HtmlTokenizer("private</style>", vi.fn());
		const failure = new Error("synthetic cancellation");
		const slice = vi.spyOn(String.prototype, "slice");
		const step = vi.spyOn(HtmlRawDiscardSession.prototype, "step");
		const debit = vi.fn(() => {
			throw failure;
		});
		const error = caught(() => tokenizer.discardRaw("style", debit));
		const slices = slice.mock.calls.length;
		slice.mockRestore();
		expect(error).toBe(failure);
		expect(slices).toBe(0);
		expect(step).not.toHaveBeenCalled();
		expect(debit).toHaveBeenCalledExactlyOnceWith(15);
		expect(tokenizer.position).toBe(0);
		expect(tokenizer.workUnits).toBe(0);
	});

	it.each([
		"title",
		"textarea",
		"plaintext",
		"SCRIPT",
		"",
		"constructor",
		"__proto__",
		"toString",
		null,
		undefined,
		1,
		{},
		new String("style"),
	])("rejects invalid raw name %j without mutation", (name) => {
		const tokenizer = new HtmlTokenizer("body</style>", vi.fn());
		const debit = vi.fn();
		expect(
			caught(() =>
				Reflect.apply(tokenizer.discardRaw, tokenizer, [name, debit]),
			),
		).toMatchObject({ code: "invalid-input" });
		expect(debit).not.toHaveBeenCalled();
		expect(tokenizer.position).toBe(0);
		expect(tokenizer.workUnits).toBe(0);
		expect(tokenizer.issueCount).toBe(0);
		expect(tokenizer.raw("style")).toBe("body");
	});

	it.each([undefined, null, 0, "debit", {}, { call() {} }])(
		"rejects nonfunction debit %j without mutation",
		(debit) => {
			const tokenizer = new HtmlTokenizer("body</style>", vi.fn());
			expect(
				caught(() =>
					Reflect.apply(tokenizer.discardRaw, tokenizer, ["style", debit]),
				),
			).toMatchObject({ code: "invalid-input" });
			expect(tokenizer.position).toBe(0);
			expect(tokenizer.workUnits).toBe(0);
			expect(tokenizer.issueCount).toBe(0);
		},
	);

	it.each([0, 4, 12])(
		"rejects bounded tokenizers at %i before mutation",
		(boundary) => {
			const tokenizer = new HtmlTokenizer("body</style>", vi.fn());
			tokenizer.setBoundary(boundary);
			if (boundary === 0) tokenizer.next();
			const paused = tokenizer.paused;
			const debit = vi.fn();
			expect(caught(() => tokenizer.discardRaw("style", debit))).toMatchObject({
				code: "invalid-input",
			});
			expect(debit).not.toHaveBeenCalled();
			expect(tokenizer.position).toBe(0);
			expect(tokenizer.workUnits).toBe(0);
			expect(tokenizer.issueCount).toBe(0);
			expect(tokenizer.paused).toBe(paused);
			tokenizer.setBoundary(undefined);
			expect(tokenizer.discardRaw("style", debit)).toEqual({
				discardedCodeUnits: 4,
				steps: 1,
			});
		},
	);

	it.each(names)("handles empty %s bodies and EOF", (name) => {
		expect(parity(name, `</${name}>tail`)).toEqual({
			discardedCodeUnits: 0,
			steps: 1,
		});
		const issue = vi.fn();
		const debit = vi.fn();
		const tokenizer = new HtmlTokenizer("", issue);
		expect(tokenizer.discardRaw(name, debit)).toEqual({
			discardedCodeUnits: 0,
			steps: 1,
		});
		expect(debit).toHaveBeenCalledExactlyOnceWith(0);
		expect(issue).toHaveBeenCalledExactlyOnceWith("unterminated-raw-element");
		expect(tokenizer.position).toBe(0);
		expect(tokenizer.workUnits).toBe(0);
	});

	it.each(["", "unterminated", "a".repeat(windowSize + 1)])(
		"honors zero issue limits at EOF of length %i",
		(source) => {
			const issue = vi.fn();
			const tokenizer = new HtmlTokenizer(source, issue, 0);
			const error = caught(() => tokenizer.discardRaw("style", () => {}));
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "html.issues",
				unit: "issues",
				limit: 0,
				observed: 1,
			});
			expect(issue).not.toHaveBeenCalled();
			expect(tokenizer.position).toBe(source.length);
			expect(tokenizer.workUnits).toBe(source.length);
			expect(tokenizer.issueCount).toBe(1);
			const debit = vi.fn();
			expect(caught(() => tokenizer.discardRaw("style", debit))).toMatchObject({
				code: "resource-limit",
			});
			expect(debit).not.toHaveBeenCalled();
			expect(tokenizer.workUnits).toBe(source.length);
		},
	);

	it("allows the exact issue quota and does not ignore repeated empty EOF", () => {
		const issue = vi.fn();
		const tokenizer = new HtmlTokenizer("body", issue, 1);
		expect(tokenizer.discardRaw("style", () => {})).toEqual({
			discardedCodeUnits: 4,
			steps: 1,
		});
		expect(issue).toHaveBeenCalledTimes(1);
		expect(
			caught(() => tokenizer.discardRaw("script", () => {})),
		).toMatchObject({ code: "resource-limit" });
		expect(tokenizer.issueCount).toBe(2);
		expect(issue).toHaveBeenCalledTimes(1);
		expect(tokenizer.workUnits).toBe(4);
	});

	it.each(names)(
		"preserves EOF progress and issue callback failures for %s",
		(name) => {
			const body = "a".repeat(windowSize + 1);
			const failure = new Error("synthetic issue failure");
			const tokenizer = new HtmlTokenizer(body, () => {
				throw failure;
			});
			expect(caught(() => tokenizer.discardRaw(name, () => {}))).toBe(failure);
			expect(tokenizer.position).toBe(body.length);
			expect(tokenizer.workUnits).toBe(body.length);
			expect(tokenizer.issueCount).toBe(1);
		},
	);

	it.each([
		windowSize,
		windowSize + 1,
		windowSize + windowProgress + 2,
		2 * windowSize + windowProgress + 3,
	])("propagates aggregate work cap cancellation at %i", (limit) => {
		const tokenizer = new HtmlTokenizer("a".repeat(windowSize * 3), vi.fn());
		const failure = new Error("synthetic work cap");
		let charged = 0;
		expect(
			caught(() =>
				tokenizer.discardRaw("style", (units) => {
					charged += units;
					if (charged > limit) throw failure;
				}),
			),
		).toBe(failure);
		const progress =
			limit >= windowSize + windowProgress + 2 ? windowProgress : 0;
		expect(charged).toBeGreaterThan(limit);
		expect(tokenizer.position).toBe(progress);
		expect(tokenizer.workUnits).toBe(progress);
		expect(tokenizer.issueCount).toBe(0);
	});

	it("accounts only discarded source after ordinary tokens and across calls", () => {
		const source =
			"<style>one</style><script><!--<script>double</script>tail</script>after";
		const tokenizer = new HtmlTokenizer(source, vi.fn());
		expect(tokenizer.next()).toMatchObject({ kind: "start", name: "style" });
		expect(tokenizer.discardRaw("style", () => {})).toEqual({
			discardedCodeUnits: 3,
			steps: 1,
		});
		expect(tokenizer.next()).toMatchObject({ kind: "end", name: "style" });
		expect(tokenizer.next()).toMatchObject({ kind: "start", name: "script" });
		const result = tokenizer.discardRaw("script", () => {});
		expect(result.discardedCodeUnits).toBe(
			"<!--<script>double</script>tail".length,
		);
		expect(tokenizer.workUnits).toBe(tokenizer.position);
		expect(tokenizer.next()).toMatchObject({ kind: "end", name: "script" });
		expect(tokenizer.next()).toEqual({ kind: "text", data: "after" });
		expect(tokenizer.workUnits).toBe(source.length);
	});

	it.each([
		"</style",
		"</style ",
		'</style bad="unfinished',
		"</style/>",
		"</style extra=ok>tail",
	])("leaves closing-token validation to next for %j", (closing) => {
		parity("style", `body${closing}`);
	});

	it("preserves legacy raw payloads, entity decoding and bounded retry", () => {
		const issue = vi.fn();
		const tokenizer = new HtmlTokenizer("&amp;</title>tail", issue);
		expect(tokenizer.raw("title", true)).toBe("&");
		expect(tokenizer.workUnits).toBe(5);
		expect(tokenizer.next()).toMatchObject({ kind: "end", name: "title" });
		expect(tokenizer.remainder()).toBe("tail");
		const bounded = new HtmlTokenizer("&amp;</style>", issue);
		bounded.setBoundary(5);
		expect(bounded.raw("style")).toBeUndefined();
		expect(bounded.position).toBe(0);
		expect(bounded.workUnits).toBe(5);
		expect(bounded.paused).toBe(true);
		bounded.setBoundary(undefined);
		expect(bounded.raw("style")).toBe("&amp;");
		expect(bounded.workUnits).toBe(10);
		expect(issue).not.toHaveBeenCalled();
	});
});
