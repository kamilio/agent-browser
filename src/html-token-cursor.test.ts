import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	HtmlTokenCursor,
	type HtmlTokenCursorOptions,
	htmlTokenCursorLimits,
} from "./html-token-cursor.js";
import { type HtmlToken, HtmlTokenizer } from "./html-tokenizer.js";
import {
	type ResourceLimitDiagnostic,
	resourceLimitDiagnostic,
	resourceLimitError,
} from "./resource-limit.js";

const cursors: HtmlTokenCursor[] = [];
const cleanup: Array<() => void> = [];
const canonicalLimits = {
	maxSourceCodeUnits: 4_000_000,
	maxWindowCodeUnits: 65_536,
	maxWorkUnits: 32_000_000,
	maxOperations: 200_000,
	maxIssues: 1_024,
	timeoutMs: 120_000,
};

afterEach(() => {
	for (const cursor of cursors.splice(0)) cursor.close();
	for (const finish of cleanup.splice(0)) finish();
	vi.restoreAllMocks();
});

function cursorFor(
	source: string,
	options: HtmlTokenCursorOptions = {},
	onIssue: (code: string) => void = () => {},
	signal?: AbortSignal,
) {
	const cursor = new HtmlTokenCursor(source, onIssue, options, signal);
	cursors.push(cursor);
	return cursor;
}

function captureError(operation: () => unknown): unknown {
	try {
		operation();
	} catch (error) {
		return error;
	}
	throw new Error("Expected cursor operation to fail");
}

function expectCode(error: unknown, code: ErrorCode) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code });
}

function expectLimit(error: unknown, diagnostic: ResourceLimitDiagnostic) {
	expectCode(error, "resource-limit");
	expect(resourceLimitDiagnostic(error)).toEqual(diagnostic);
	expect(Object.isFrozen(resourceLimitDiagnostic(error))).toBe(true);
	expect(
		resourceLimitDiagnostic({ ...diagnostic, code: "resource-limit" }),
	).toBeUndefined();
}

function expectClosed(cursor: HtmlTokenCursor) {
	expect(cursor.closed).toBe(true);
	const errors = [
		captureError(() => cursor.next()),
		captureError(() => cursor.raw("script")),
		captureError(() => cursor.remainder()),
	];
	for (const error of errors) expectCode(error, "closed");
	expect(new Set(errors.map((error) => (error as Error).message)).size).toBe(1);
}

function collectTokens(
	input: Pick<HtmlTokenizer, "next">,
	maximum: number,
): HtmlToken[] {
	const tokens: HtmlToken[] = [];
	for (let attempt = 0; attempt < maximum; attempt++) {
		const token = input.next();
		if (token === undefined) return tokens;
		tokens.push(token);
	}
	throw new Error("Synthetic token collection did not reach EOF");
}

function mergeAdjacentText(tokens: HtmlToken[]): HtmlToken[] {
	const merged: HtmlToken[] = [];
	for (const token of tokens) {
		const previous = merged.at(-1);
		if (previous?.kind === "text" && token.kind === "text")
			previous.data += token.data;
		else merged.push(token.kind === "text" ? { ...token } : token);
	}
	return merged;
}

function clockOnly() {
	let now = 1_000;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const dispatched = vi.fn();
	const timer = setTimeout(dispatched, 1);
	cleanup.push(() => clearTimeout(timer));
	return {
		dispatched,
		advance(milliseconds: number) {
			now += milliseconds;
		},
	};
}

describe("bounded native cursor admission", () => {
	it("snapshots immutable canonical defaults without an options argument", () => {
		const cursor = new HtmlTokenCursor("", () => {});
		cursors.push(cursor);
		expect(htmlTokenCursorLimits).toEqual(canonicalLimits);
		expect(cursor.limits).toEqual(canonicalLimits);
		expect(Object.isFrozen(htmlTokenCursorLimits)).toBe(true);
		expect(Object.isFrozen(cursor.limits)).toBe(true);
		expect(Reflect.set(cursor.limits, "maxOperations", 1)).toBe(false);
		expect(cursor.position).toBe(0);
		expect(cursor.operations).toBe(0);
		expect(cursor.issueCount).toBe(0);
		expect(cursor.closed).toBe(false);
		expect("insert" in cursor).toBe(false);
		expect("setBoundary" in cursor).toBe(false);
	});

	it("retains immutable window and operation authority when public limits are replaced", () => {
		const cursor = cursorFor("abcd", {
			maxWindowCodeUnits: 1,
			maxOperations: 1,
		});
		const admitted = cursor.limits;
		const replacement = {
			...admitted,
			maxWindowCodeUnits: 4,
			maxOperations: 2,
		};
		expect(Reflect.set(cursor, "limits", replacement)).toBe(false);
		expect(
			Reflect.defineProperty(cursor, "limits", { value: replacement }),
		).toBe(false);
		expect(cursor.limits).toBe(admitted);
		expect(cursor.next()).toEqual({ kind: "text", data: "a" });
		expectLimit(
			captureError(() => cursor.next()),
			{
				kind: "html.cursor-operations",
				unit: "operations",
				limit: 1,
				observed: 2,
			},
		);
		expect(cursor.position).toBe(1);
		expectClosed(cursor);
	});

	it("rejects replacement accessors without reading them", () => {
		const cursor = cursorFor("text");
		const getter = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE_LIMITS");
		});
		expect(Reflect.defineProperty(cursor, "limits", { get: getter })).toBe(
			false,
		);
		expect(cursor.next()).toEqual({ kind: "text", data: "text" });
		expect(getter).not.toHaveBeenCalled();
	});

	it("does not retain the mutable option record", () => {
		const options = { maxOperations: 2, maxIssues: 0 };
		const cursor = cursorFor("", options);
		options.maxOperations = 1;
		options.maxIssues = 10;
		expect(cursor.limits.maxOperations).toBe(2);
		expect(cursor.limits.maxIssues).toBe(0);
		expect(cursor.next()).toBeUndefined();
		expect(cursor.next()).toBeUndefined();
	});

	for (const key of Object.keys(canonicalLimits) as Array<
		keyof typeof canonicalLimits
	>) {
		for (const value of [
			undefined,
			null,
			true,
			"1",
			-1,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
			canonicalLimits[key] + 1,
			...(key === "maxIssues" ? [] : [0]),
		]) {
			it(`rejects ${key}=${String(value)} without numeric coercion`, () => {
				expectCode(
					captureError(() =>
						cursorFor("", { [key]: value } as HtmlTokenCursorOptions),
					),
					"invalid-input",
				);
			});
		}
	}

	it("rejects unknown, symbolic, inherited and accessor option authority", () => {
		let getterCalls = 0;
		const accessor = Object.defineProperty({}, "maxOperations", {
			enumerable: true,
			get() {
				getterCalls++;
				return 1;
			},
		});
		for (const options of [
			{ unknown: 1 },
			{ [Symbol("limit")]: 1 },
			Object.create({ maxOperations: 1 }),
			accessor,
			[],
			null,
			1,
		]) {
			expectCode(
				captureError(() => cursorFor("", options as HtmlTokenCursorOptions)),
				"invalid-input",
			);
		}
		expect(getterCalls).toBe(0);
	});

	it("rejects reflection failure statically without a proxy-inertness claim", () => {
		const privateFailure = new Error("SYNTHETIC_PRIVATE_OPTIONS");
		const options = new Proxy(
			{},
			{
				ownKeys() {
					throw privateFailure;
				},
			},
		);
		const error = captureError(() => cursorFor("", options));
		expectCode(error, "invalid-input");
		expect(error).not.toBe(privateFailure);
		expect((error as Error).message).not.toContain(privateFailure.message);
	});

	it("never coerces option numbers or reads a nonprimitive source length", () => {
		let touches = 0;
		const numeric = {
			valueOf() {
				touches++;
				return 1;
			},
		};
		const source = {
			get length() {
				touches++;
				return 1;
			},
			toString() {
				touches++;
				return "x";
			},
		};
		expectCode(
			captureError(() =>
				cursorFor(source as unknown as string, {
					maxOperations: numeric as unknown as number,
				}),
			),
			"invalid-input",
		);
		for (const input of [source, new String("x"), null, 1, undefined]) {
			expectCode(
				captureError(() => cursorFor(input as unknown as string)),
				"invalid-input",
			);
		}
		expect(touches).toBe(0);
		expectCode(
			captureError(
				() =>
					new HtmlTokenCursor("", null as unknown as (code: string) => void),
			),
			"invalid-input",
		);
	});

	it("validates options before the primitive source quota", () => {
		expectCode(
			captureError(() =>
				cursorFor("too long", {
					maxSourceCodeUnits: 1,
					maxOperations: undefined,
				}),
			),
			"invalid-input",
		);
	});

	it("admits exact source UTF16 units and reports the first extra unit", () => {
		const cursor = cursorFor("😀", { maxSourceCodeUnits: 2 });
		expect(cursor.next()).toEqual({ kind: "text", data: "😀" });
		expect(cursor.position).toBe(2);
		expectLimit(
			captureError(() =>
				cursorFor("😀", {
					maxSourceCodeUnits: 1,
				}),
			),
			{
				kind: "html.cursor-source",
				unit: "code-units",
				limit: 1,
				observed: 2,
			},
		);
		expectLimit(
			captureError(() => cursorFor("x".repeat(4_000_001))),
			{
				kind: "html.cursor-source",
				unit: "code-units",
				limit: 4_000_000,
				observed: 4_000_001,
			},
		);
	});
});

describe("actual native tokenizer window comparisons, not DOM equivalence", () => {
	it.each([
		[1, "abc😀def\r\n\0ghi"],
		[12, "abc&amp;def&#65;ghi&#x1f600;jkl"],
		[32, "prefix&NotEqualTilde;<p a='&amp;'>x</p>tail"],
		[16, "xxxxxxx<p a='b'>x</p><!--ok-->tail"],
		[32, "<!DOCTYPE html><table><tr><td>x</td></tr></table>"],
		[32, "<template><b><i>x</b>y</i></template><svg><g/></svg>"],
		[64, "<!DOCTYPE html PUBLIC 'x' 'y'><!--a<!--b--!><?odd>"],
		[64, "<p a=1 a=2>&#0; &missing;<!--\0--></p></wrong>"],
		[32, "tail<!--unfinished"],
		[32, "tail<p title='unfinished"],
		[32, "tail<"],
	] as const)("matches native tokens at window %i for %s", (window, source) => {
		const nativeIssues: string[] = [];
		const cursorIssues: string[] = [];
		const native = new HtmlTokenizer(source, (code) => nativeIssues.push(code));
		const cursor = cursorFor(source, { maxWindowCodeUnits: window }, (code) =>
			cursorIssues.push(code),
		);
		const nativeTokens = collectTokens(native, source.length + 2);
		const cursorTokens = collectTokens(cursor, source.length + 2);
		expect(mergeAdjacentText(cursorTokens)).toEqual(
			mergeAdjacentText(nativeTokens),
		);
		expect(cursorIssues).toEqual(nativeIssues);
		expect(cursor.position).toBe(source.length);
		expect(cursor.closed).toBe(false);
	});

	it("commits UTF16 source offsets independently of decoded text length", () => {
		const cursor = cursorFor("😀&amp;<p>x</p>", { maxWindowCodeUnits: 7 });
		expect(cursor.next()).toEqual({ kind: "text", data: "😀&" });
		expect(cursor.position).toBe(7);
		expect(cursor.next()).toMatchObject({ kind: "start", name: "p" });
		expect(cursor.position).toBe(10);
		expect(cursor.next()).toEqual({ kind: "text", data: "x" });
		expect(cursor.position).toBe(11);
		expect(cursor.next()).toMatchObject({ kind: "end", name: "p" });
		expect(cursor.position).toBe(15);
	});

	it("allows a window text boundary within a surrogate pair", () => {
		const cursor = cursorFor("😀", { maxWindowCodeUnits: 1 });
		expect(cursor.next()).toEqual({ kind: "text", data: "\ud83d" });
		expect(cursor.position).toBe(1);
		expect(cursor.next()).toEqual({ kind: "text", data: "\ude00" });
		expect(cursor.position).toBe(2);
		expect(cursor.next()).toBeUndefined();
	});

	it.each(["<p>", "</p>", "<!--x-->", "<!DOCTYPE html>", "<p a='x'>"])(
		"admits an exact non-text window and refills across its boundary: %s",
		(tokenSource) => {
			const source = `x${tokenSource}tail`;
			const cursor = cursorFor(source, {
				maxWindowCodeUnits: tokenSource.length,
			});
			const native = new HtmlTokenizer(source, () => {});
			expect(cursor.next()).toEqual(native.next());
			expect(cursor.next()).toEqual(native.next());
			expect(cursor.position).toBe(1 + tokenSource.length);
			expect(cursor.operations).toBe(2);
		},
	);

	it("rejects a full-window paused token without committing partial success", () => {
		const cursor = cursorFor("x<p title='123456789'>tail", {
			maxWindowCodeUnits: 12,
		});
		expect(cursor.next()).toEqual({ kind: "text", data: "x" });
		expectLimit(
			captureError(() => cursor.next()),
			{
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 12,
				observed: 13,
			},
		);
		expect(cursor.position).toBe(1);
		expect(cursor.operations).toBe(2);
		expectClosed(cursor);
	});

	it("does not invent EOF for an incomplete full-window character reference", () => {
		const cursor = cursorFor("&NotEqualTilde;tail", { maxWindowCodeUnits: 8 });
		expectLimit(
			captureError(() => cursor.next()),
			{
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 8,
				observed: 9,
			},
		);
		expect(cursor.position).toBe(0);
		expect(cursor.issueCount).toBe(0);
	});
});

describe("raw state and bounded remainder", () => {
	it.each([
		[
			"script",
			false,
			"<!--<script>inner</script>still escaped-->tail</script>after",
		],
		["script", false, "one</scriptx>two</ScRiPt >after"],
		["style", false, "a<&amp;></style>after"],
		["textarea", true, "😀&amp;&#65;</textarea>after"],
		["title", true, "&amp;unterminated"],
		["script", false, "<!--<script>unterminated"],
	] as const)("uses native %s raw state and issues", (name, entities, body) => {
		const source = `<${name}>${body}`;
		const nativeIssues: string[] = [];
		const cursorIssues: string[] = [];
		const native = new HtmlTokenizer(source, (code) => nativeIssues.push(code));
		const cursor = cursorFor(
			source,
			{ maxWindowCodeUnits: body.length },
			(code) => cursorIssues.push(code),
		);
		expect(cursor.next()).toEqual(native.next());
		expect(cursor.raw(name, entities)).toBe(native.raw(name, entities));
		expect(cursor.position).toBe(native.position);
		expect(cursorIssues).toEqual(nativeIssues);
		expect(cursor.issueCount).toBe(native.issueCount);
		expect(collectTokens(cursor, source.length + 2)).toEqual(
			collectTokens(native, source.length + 2),
		);
	});

	it("fits raw closing-prefix lookahead inside the same bounded window", () => {
		const source = "abc</script>tail";
		const accepted = cursorFor(source, { maxWindowCodeUnits: 12 });
		expect(accepted.raw("script")).toBe("abc");
		expect(accepted.position).toBe(3);
		const rejected = cursorFor(source, { maxWindowCodeUnits: 11 });
		expectLimit(
			captureError(() => rejected.raw("script")),
			{
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 11,
				observed: 12,
			},
		);
		expect(rejected.position).toBe(0);
		expect(rejected.issueCount).toBe(0);
		expectClosed(rejected);
	});

	it.each(["", "Script", "a:b", "a_b", "a b", "1tag", "é", "a".repeat(33)])(
		"rejects raw name %s and closes",
		(name) => {
			const cursor = cursorFor("text");
			expectCode(
				captureError(() => cursor.raw(name)),
				"invalid-input",
			);
			expect(cursor.position).toBe(0);
			expectClosed(cursor);
		},
	);

	it("validates raw boolean authority and accepts the longest valid tag", () => {
		for (const entities of [null, 0, "false", {}]) {
			const cursor = cursorFor("text");
			expectCode(
				captureError(() => cursor.raw("title", entities as boolean)),
				"invalid-input",
			);
			expectClosed(cursor);
		}
		const name = `a${"-".repeat(30)}1`;
		const cursor = cursorFor(`&amp;</${name}>`);
		expect(cursor.raw(name, false)).toBe("&amp;");
	});

	it("uses native remainder without decoding or hidden whole-tail allowance", () => {
		const source = "<p>😀&amp;";
		const native = new HtmlTokenizer(source, () => {});
		const accepted = cursorFor(source, { maxWindowCodeUnits: 7 });
		expect(accepted.next()).toEqual(native.next());
		expect(accepted.remainder()).toBe(native.remainder());
		expect(accepted.position).toBe(source.length);
		expect(accepted.remainder()).toBe("");
		const rejected = cursorFor(source, { maxWindowCodeUnits: 6 });
		rejected.next();
		expectLimit(
			captureError(() => rejected.remainder()),
			{
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 6,
				observed: 7,
			},
		);
		expect(rejected.position).toBe(3);
		expectClosed(rejected);
	});
});

describe("truthful work, operation and native issue budgets", () => {
	it("charges one cached window plus actual native deltas, not one copy per token", () => {
		const source = "<p>x</p><b>y</b>";
		const native = new HtmlTokenizer(source, () => {});
		const cursor = cursorFor(source, { maxWorkUnits: source.length * 2 });
		for (let attempt = 0; attempt < 7; attempt++) {
			expect(cursor.next()).toEqual(native.next());
			expect(cursor.workUnits).toBe(source.length + native.workUnits);
		}
		expect(cursor.position).toBe(source.length);
		expect(cursor.workUnits).toBe(source.length * 2);
		expect(cursor.operations).toBe(7);
	});

	it("retains attempted admission work without a native result", () => {
		const cursor = cursorFor("four", { maxWorkUnits: 3 });
		expectLimit(
			captureError(() => cursor.next()),
			{
				kind: "html.cursor-work",
				unit: "code-units",
				limit: 3,
				observed: 4,
			},
		);
		expect(cursor.workUnits).toBe(4);
		expect(cursor.position).toBe(0);
		expect(cursor.operations).toBe(1);
		expectClosed(cursor);
	});

	it("charges native completion before publishing an over-budget token", () => {
		const cursor = cursorFor("abc", { maxWorkUnits: 5 });
		expectLimit(
			captureError(() => cursor.next()),
			{
				kind: "html.cursor-work",
				unit: "code-units",
				limit: 5,
				observed: 6,
			},
		);
		expect(cursor.workUnits).toBe(6);
		expect(cursor.position).toBe(0);
		expectClosed(cursor);
	});

	it("charges real discarded partial work, retries and issue attempts", () => {
		const source = "xxxx<p a a>tail";
		const initial = new HtmlTokenizer(source.slice(0, 10), () => {});
		initial.setBoundary(10);
		const text = initial.next();
		expect(initial.next()).toBeUndefined();
		expect(initial.paused).toBe(true);
		const retry = new HtmlTokenizer(source.slice(4, 14), () => {});
		retry.setBoundary(10);
		const token = retry.next();
		const issues: string[] = [];
		const cursor = cursorFor(
			source,
			{ maxWindowCodeUnits: 10, maxIssues: 2 },
			(code) => issues.push(code),
		);
		expect(cursor.next()).toEqual(text);
		expect(cursor.next()).toEqual(token);
		expect(cursor.workUnits).toBe(20 + initial.workUnits + retry.workUnits);
		expect(cursor.issueCount).toBe(initial.issueCount + retry.issueCount);
		expect(cursor.issueCount).toBe(2);
		expect(issues).toEqual(["duplicate-attribute"]);
		expect(cursor.operations).toBe(2);
		expect(cursor.position).toBe(11);
	});

	it("translates exhausted remaining native quota to original global numbers", () => {
		const issues: string[] = [];
		const cursor = cursorFor(
			"xxxx<p a a>tail",
			{
				maxWindowCodeUnits: 10,
				maxIssues: 1,
			},
			(code) => issues.push(code),
		);
		cursor.next();
		expectLimit(
			captureError(() => cursor.next()),
			{
				kind: "html.issues",
				unit: "issues",
				limit: 1,
				observed: 2,
			},
		);
		expect(cursor.issueCount).toBe(2);
		expect(issues).toEqual([]);
		expect(cursor.position).toBe(4);
		expectClosed(cursor);
	});

	it("admits zero issues and prevents delivery of the first over-limit attempt", () => {
		const issues: string[] = [];
		const cursor = cursorFor("<p a a>", { maxIssues: 0 }, (code) =>
			issues.push(code),
		);
		expectLimit(
			captureError(() => cursor.next()),
			{
				kind: "html.issues",
				unit: "issues",
				limit: 0,
				observed: 1,
			},
		);
		expect(issues).toEqual([]);
		expect(cursor.issueCount).toBe(1);
		expect(cursor.position).toBe(0);
		expectClosed(cursor);
	});

	it("keeps issue quota cumulative across committed windows", () => {
		const issues: string[] = [];
		const cursor = cursorFor(
			"<p a a><p a a>",
			{
				maxWindowCodeUnits: 7,
				maxIssues: 1,
			},
			(code) => issues.push(code),
		);
		expect(cursor.next()).toMatchObject({ kind: "start", name: "p" });
		expect(cursor.issueCount).toBe(1);
		expectLimit(
			captureError(() => cursor.next()),
			{
				kind: "html.issues",
				unit: "issues",
				limit: 1,
				observed: 2,
			},
		);
		expect(issues).toEqual(["duplicate-attribute"]);
		expect(cursor.position).toBe(7);
	});

	it.each(["next", "raw", "remainder"] as const)(
		"charges every public %s call including EOF",
		(method) => {
			const cursor = cursorFor("", { maxOperations: 2 });
			const read = () =>
				method === "raw" ? cursor.raw("title") : cursor[method]();
			read();
			read();
			expect(cursor.operations).toBe(2);
			expectLimit(captureError(read), {
				kind: "html.cursor-operations",
				unit: "operations",
				limit: 2,
				observed: 3,
			});
			expect(cursor.operations).toBe(3);
			expect(cursor.position).toBe(0);
			expectClosed(cursor);
		},
	);
});

describe("close, cooperative abort and exceptional absolute deadlines", () => {
	it("closes idempotently while preserving committed counters and limits", () => {
		const cursor = cursorFor("<p a a>tail");
		cursor.next();
		const snapshot = {
			position: cursor.position,
			operations: cursor.operations,
			workUnits: cursor.workUnits,
			issueCount: cursor.issueCount,
		};
		cursor.close();
		cursor.close();
		expect(cursor).toMatchObject(snapshot);
		for (const field of [
			"position",
			"operations",
			"workUnits",
			"issueCount",
			"closed",
		])
			expect(Reflect.set(cursor, field, -1)).toBe(false);
		expectClosed(cursor);
		expect(cursor.limits).toEqual(canonicalLimits);
	});

	it("rejects reentrant reads even when the callback catches the inner error", () => {
		let inner: unknown;
		const cursor = cursorFor("<p a a>", {}, () => {
			try {
				cursor.remainder();
			} catch (error) {
				inner = error;
			}
		});
		captureError(() => cursor.next());
		expect(inner).toBeInstanceOf(AgentBrowserError);
		expect(cursor.position).toBe(0);
		expectClosed(cursor);
	});

	it("prevents late publication when an issue callback closes the cursor", () => {
		const cursor = cursorFor("<p a a>", {}, () => cursor.close());
		expectCode(
			captureError(() => cursor.next()),
			"closed",
		);
		expect(cursor.position).toBe(0);
		expect(cursor.issueCount).toBe(1);
		expectClosed(cursor);
	});

	it("propagates an actual native unsupported failure and closes", () => {
		const source = "<é>tail<a@>";
		const cursor = cursorFor(source);
		const native = new HtmlTokenizer(source, () => {});
		for (let attempt = 0; attempt < 2; attempt++)
			expect(cursor.next()).toEqual(native.next());
		const position = cursor.position;
		const nativeError = captureError(() => native.next());
		const error = captureError(() => cursor.next());
		expectCode(error, "unsupported");
		expect((error as Error).message).toBe((nativeError as Error).message);
		expect(cursor.position).toBe(position);
		expectClosed(cursor);
	});

	it("checks abort before deadline without exposing the trusted signal reason", () => {
		const clock = clockOnly();
		const controller = new AbortController();
		const cursor = cursorFor(
			"text",
			{ timeoutMs: 10 },
			() => {},
			controller.signal,
		);
		controller.abort(new Error("SYNTHETIC_PRIVATE_ABORT"));
		clock.advance(10);
		const error = captureError(() => cursor.next());
		expectCode(error, "aborted");
		expect((error as Error).message).not.toContain("SYNTHETIC_PRIVATE_ABORT");
		expect(cursor.position).toBe(0);
		expect(clock.dispatched).not.toHaveBeenCalled();
		expectClosed(cursor);
	});

	it("rejects already-aborted admission without issuing callbacks", () => {
		const controller = new AbortController();
		const onIssue = vi.fn();
		controller.abort();
		expectCode(
			captureError(() => {
				const cursor = cursorFor("<p a a>", {}, onIssue, controller.signal);
				cursor.next();
			}),
			"aborted",
		);
		expect(onIssue).not.toHaveBeenCalled();
	});

	it.each(["next", "raw", "remainder"] as const)(
		"rejects %s at the absolute deadline without timer dispatch",
		(method) => {
			const clock = clockOnly();
			const cursor = cursorFor("text", { timeoutMs: 10 });
			clock.advance(10);
			const error = captureError(() =>
				method === "raw" ? cursor.raw("title") : cursor[method](),
			);
			expectCode(error, "timeout");
			expect(cursor.position).toBe(0);
			expect(clock.dispatched).not.toHaveBeenCalled();
			expectClosed(cursor);
		},
	);

	it("does not reset the absolute deadline after a successful read", () => {
		const clock = clockOnly();
		const cursor = cursorFor("<p>x</p>", { timeoutMs: 10 });
		clock.advance(9);
		expect(cursor.next()).toMatchObject({ kind: "start", name: "p" });
		clock.advance(1);
		expectCode(
			captureError(() => cursor.next()),
			"timeout",
		);
		expect(cursor.position).toBe(3);
		expect(clock.dispatched).not.toHaveBeenCalled();
	});

	it.each(["next", "raw"] as const)(
		"rejects late %s success after a native issue callback crosses the clock",
		(method) => {
			const clock = clockOnly();
			const issues: string[] = [];
			const cursor = cursorFor(
				method === "next" ? "<p a a>" : "unterminated",
				{ timeoutMs: 10 },
				(code) => {
					issues.push(code);
					clock.advance(10);
				},
			);
			expectCode(
				captureError(() =>
					method === "next" ? cursor.next() : cursor.raw("script"),
				),
				"timeout",
			);
			expect(issues).toHaveLength(1);
			expect(cursor.issueCount).toBe(1);
			expect(cursor.workUnits).toBeGreaterThan(0);
			expect(cursor.position).toBe(0);
			expect(clock.dispatched).not.toHaveBeenCalled();
			expectClosed(cursor);
		},
	);

	it("rejects late remainder after real native completion, with clock-only expiry", () => {
		const clock = clockOnly();
		const original = HtmlTokenizer.prototype.remainder;
		vi.spyOn(HtmlTokenizer.prototype, "remainder").mockImplementation(function (
			this: HtmlTokenizer,
		) {
			const result = original.call(this);
			clock.advance(10);
			return result;
		});
		const cursor = cursorFor("&amp;😀", { timeoutMs: 10 });
		expectCode(
			captureError(() => cursor.remainder()),
			"timeout",
		);
		expect(cursor.workUnits).toBe(14);
		expect(cursor.position).toBe(0);
		expect(clock.dispatched).not.toHaveBeenCalled();
		expectClosed(cursor);
	});

	it("checks the clock between a real paused native attempt and refill", () => {
		const clock = clockOnly();
		const original = HtmlTokenizer.prototype.next;
		let pausedReads = 0;
		vi.spyOn(HtmlTokenizer.prototype, "next").mockImplementation(function (
			this: HtmlTokenizer,
		) {
			const result = original.call(this);
			if (this.paused) {
				pausedReads++;
				clock.advance(10);
			}
			return result;
		});
		const cursor = cursorFor("xxxx<p a a>tail", {
			maxWindowCodeUnits: 10,
			timeoutMs: 10,
		});
		cursor.next();
		expectCode(
			captureError(() => cursor.next()),
			"timeout",
		);
		expect(pausedReads).toBe(1);
		expect(cursor.position).toBe(4);
		expect(cursor.issueCount).toBe(1);
		expect(clock.dispatched).not.toHaveBeenCalled();
		expectClosed(cursor);
	});

	it("prevents late success after cooperative abort inside native issue delivery", () => {
		const controller = new AbortController();
		const cursor = cursorFor(
			"<p a a>",
			{},
			() => controller.abort(),
			controller.signal,
		);
		expectCode(
			captureError(() => cursor.next()),
			"aborted",
		);
		expect(cursor.position).toBe(0);
		expect(cursor.issueCount).toBe(1);
		expectClosed(cursor);
	});

	it("preserves callback failure rather than replacing it with late timeout", () => {
		const clock = clockOnly();
		const failure = new Error("synthetic trusted callback failure");
		const cursor = cursorFor("<p a a>", { timeoutMs: 10 }, () => {
			clock.advance(10);
			throw failure;
		});
		expect(captureError(() => cursor.next())).toBe(failure);
		expect(cursor.position).toBe(0);
		expect(cursor.issueCount).toBe(1);
		expect(clock.dispatched).not.toHaveBeenCalled();
		expectClosed(cursor);
	});

	it("preserves a trusted callback html.issues error before native quota exhaustion", () => {
		const failure = resourceLimitError(
			"html.issues",
			0,
			1,
			"Synthetic trusted callback issue failure",
		);
		const delivered: string[] = [];
		const cursor = cursorFor("<p a a>", { maxIssues: 2 }, (code) => {
			delivered.push(code);
			throw failure;
		});
		const error = captureError(() => cursor.next());
		expect(error).toBe(failure);
		expectLimit(error, {
			kind: "html.issues",
			unit: "issues",
			limit: 0,
			observed: 1,
		});
		expect(delivered).toEqual(["duplicate-attribute"]);
		expect(cursor.issueCount).toBe(1);
		expect(cursor.issueCount).toBeLessThan(cursor.limits.maxIssues);
		expect(cursor.position).toBe(0);
		expectClosed(cursor);
	});
});

it("synthetic span-heavy differential: native 50,000-node guard fails while bounded tokens reach EOF", () => {
	const spans = 25_001;
	const source = "<span>x</span>".repeat(spans);
	let admitted: DocumentTree | undefined;
	let returned: DocumentTree | undefined;
	try {
		const error = captureError(() => {
			returned = parseHtmlDocument(source, "about:blank", {
				initializeDocument(tree) {
					admitted = tree;
				},
			});
		});
		expect(admitted).toBeDefined();
		expect(admitted?.limits.maxNodes).toBe(50_000);
		expectLimit(error, {
			kind: "document.nodes",
			unit: "nodes",
			limit: 50_000,
			observed: 50_001,
		});
		const cursor = cursorFor(source, {
			maxSourceCodeUnits: source.length,
			maxWindowCodeUnits: 256,
			maxWorkUnits: 4_000_000,
			maxOperations: spans * 3 + 1,
			maxIssues: 0,
		});
		let tokens = 0;
		let starts = 0;
		let ends = 0;
		let textUnits = 0;
		let reachedEof = false;
		for (let attempt = 0; attempt < cursor.limits.maxOperations; attempt++) {
			const token = cursor.next();
			if (token === undefined) {
				reachedEof = true;
				break;
			}
			tokens++;
			if (token.kind === "start" && token.name === "span") starts++;
			if (token.kind === "end" && token.name === "span") ends++;
			if (token.kind === "text") textUnits += token.data.length;
		}
		expect(reachedEof).toBe(true);
		expect({ tokens, starts, ends, textUnits }).toEqual({
			tokens: spans * 3,
			starts: spans,
			ends: spans,
			textUnits: spans,
		});
		expect(cursor.position).toBe(source.length);
		expect(cursor.operations).toBe(spans * 3 + 1);
		expect(cursor.issueCount).toBe(0);
		expect(cursor.workUnits).toBeLessThanOrEqual(cursor.limits.maxWorkUnits);
		expect(cursor.closed).toBe(false);
	} finally {
		returned?.close();
		admitted?.close();
	}
});
