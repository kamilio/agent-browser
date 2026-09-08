import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	HtmlTokenCursor,
	type HtmlTokenCursorOptions,
	type HtmlTokenCursorWindowDiagnostic,
	htmlTokenCursorLimits,
	htmlTokenCursorWindowDiagnostic,
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

describe("trusted native cursor-window operation diagnostics", () => {
	const privateMarker = "SYNTHETIC_PRIVATE_CURSOR_DATA";
	const privateRawName = "x-private-cursor-data".padEnd(32, "x");
	const windowMessage = "HTML cursor input window limit exceeded";

	function expectWindow(
		error: unknown,
		operation: HtmlTokenCursorWindowDiagnostic["operation"],
		position: number,
		limit: number,
		observed = limit + 1,
	) {
		expectLimit(error, {
			kind: "html.cursor-window",
			unit: "code-units",
			limit,
			observed,
		});
		const diagnostic = htmlTokenCursorWindowDiagnostic(error);
		expect(diagnostic).toEqual({
			kind: "html-cursor-window",
			operation,
			position,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(Reflect.ownKeys(diagnostic ?? {})).toEqual([
			"kind",
			"operation",
			"position",
			"positionSemantics",
		]);
		expect(Object.isFrozen(diagnostic)).toBe(true);
		for (const key of [
			"kind",
			"operation",
			"position",
			"positionSemantics",
		] as const) {
			expect(Object.getOwnPropertyDescriptor(diagnostic, key)).toEqual({
				value: diagnostic?.[key],
				enumerable: true,
				writable: false,
				configurable: false,
			});
		}
		expect(htmlTokenCursorWindowDiagnostic(error)).toBe(diagnostic);
		expect(Reflect.set(diagnostic ?? {}, "position", -1)).toBe(false);
		expect(
			Reflect.defineProperty(diagnostic ?? {}, "extra", { value: true }),
		).toBe(false);
		expect(Reflect.deleteProperty(diagnostic ?? {}, "operation")).toBe(false);
		const ordinary = resourceLimitError(
			"html.cursor-window",
			limit,
			observed,
			windowMessage,
		);
		expect(htmlTokenCursorWindowDiagnostic(ordinary)).toBeUndefined();
		expect(Object.getPrototypeOf(error)).toBe(Object.getPrototypeOf(ordinary));
		expect(Reflect.ownKeys(error as object)).toEqual(Reflect.ownKeys(ordinary));
		for (const key of Reflect.ownKeys(ordinary)) {
			const actual = Object.getOwnPropertyDescriptor(error, key);
			const expected = Object.getOwnPropertyDescriptor(ordinary, key);
			if (key === "stack") {
				expect(actual?.enumerable).toBe(expected?.enumerable);
				expect(actual?.configurable).toBe(expected?.configurable);
				expect(actual?.writable).toBe(expected?.writable);
			} else expect(actual).toEqual(expected);
		}
		expect((error as Error).message).toBe(windowMessage);
		expect(Object.hasOwn(error as object, "cause")).toBe(false);
		expect((error as Error).cause).toBeUndefined();
		expect(JSON.stringify(error)).toBe(JSON.stringify(ordinary));
		for (const value of [
			JSON.stringify(diagnostic),
			JSON.stringify(error),
			(error as Error).message,
		]) {
			expect(value).not.toContain(privateMarker);
			expect(value).not.toContain(privateRawName);
		}
		return diagnostic;
	}

	function expectStopped(
		cursor: HtmlTokenCursor,
		expected: {
			position: number;
			operations: number;
			workUnits: number;
			issueCount: number;
		},
	) {
		expect(cursor).toMatchObject({ ...expected, closed: true });
		for (const operation of ["next", "raw", "remainder"] as const) {
			const error = captureError(() =>
				operation === "raw" ? cursor.raw("script") : cursor[operation](),
			);
			expectCode(error, "closed");
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
		}
		cursor.close();
		expect(cursor).toMatchObject({ ...expected, closed: true });
	}

	it.each([
		`<p title='${privateMarker}'>tail`,
		`<!--${privateMarker}-->tail`,
		"&NotEqualTilde;tail",
	])("brands an initial next pause without committing source: %s", (source) => {
		const window = 8;
		const delivered = vi.fn();
		const native = new HtmlTokenizer(source.slice(0, window), delivered);
		native.setBoundary(window);
		expect(native.next()).toBeUndefined();
		expect(native.paused).toBe(true);
		expect(native.position).toBe(0);
		const cursor = cursorFor(source, { maxWindowCodeUnits: window }, delivered);
		const error = captureError(() => cursor.next());
		expectWindow(error, "next", 0, window);
		expectStopped(cursor, {
			position: 0,
			operations: 1,
			workUnits: window + native.workUnits,
			issueCount: native.issueCount,
		});
		expect(delivered).not.toHaveBeenCalled();
	});

	it.each(["x", "😀x"])(
		"brands a restarted next pause at committed UTF16 prefix %s",
		(prefix) => {
			const source = `${prefix}<p title='${privateMarker}'>tail`;
			const window = 12;
			const delivered = vi.fn();
			const initial = new HtmlTokenizer(source.slice(0, window), delivered);
			initial.setBoundary(window);
			expect(initial.next()).toEqual({ kind: "text", data: prefix });
			expect(initial.next()).toBeUndefined();
			expect(initial.paused).toBe(true);
			expect(initial.position).toBe(prefix.length);
			const retry = new HtmlTokenizer(
				source.slice(prefix.length, prefix.length + window),
				delivered,
			);
			retry.setBoundary(window);
			expect(retry.next()).toBeUndefined();
			expect(retry.paused).toBe(true);
			expect(retry.position).toBe(0);
			const cursor = cursorFor(
				source,
				{ maxWindowCodeUnits: window },
				delivered,
			);
			expect(cursor.next()).toEqual({ kind: "text", data: prefix });
			const error = captureError(() => cursor.next());
			expectWindow(error, "next", prefix.length, window);
			expectStopped(cursor, {
				position: prefix.length,
				operations: 2,
				workUnits: 2 * window + initial.workUnits + retry.workUnits,
				issueCount: initial.issueCount + retry.issueCount,
			});
			expect(delivered).not.toHaveBeenCalled();
		},
	);

	it("brands an initial next failure after an exactly committed prior window", () => {
		const source = `<p><b title='${privateMarker}'>`;
		const initial = new HtmlTokenizer(source.slice(0, 3), () => {});
		initial.setBoundary(3);
		const start = initial.next();
		const nextWindow = new HtmlTokenizer(source.slice(3, 6), () => {});
		nextWindow.setBoundary(3);
		expect(nextWindow.next()).toBeUndefined();
		expect(nextWindow.paused).toBe(true);
		const cursor = cursorFor(source, { maxWindowCodeUnits: 3 });
		expect(cursor.next()).toEqual(start);
		expectWindow(
			captureError(() => cursor.next()),
			"next",
			3,
			3,
		);
		expectStopped(cursor, {
			position: 3,
			operations: 2,
			workUnits: 6 + initial.workUnits + nextWindow.workUnits,
			issueCount: initial.issueCount + nextWindow.issueCount,
		});
	});

	it("allows an actual paused-and-rebased next attempt to succeed without attribution", () => {
		const source = "x<p>tail";
		const initial = new HtmlTokenizer(source.slice(0, 3), () => {});
		initial.setBoundary(3);
		expect(initial.next()).toEqual({ kind: "text", data: "x" });
		expect(initial.next()).toBeUndefined();
		expect(initial.paused).toBe(true);
		const retry = new HtmlTokenizer(source.slice(1, 4), () => {});
		retry.setBoundary(3);
		const expected = retry.next();
		expect(expected).toMatchObject({ kind: "start", name: "p" });
		expect(retry.paused).toBe(false);
		const cursor = cursorFor(source, { maxWindowCodeUnits: 3 });
		expect(cursor.next()).toEqual({ kind: "text", data: "x" });
		const token = cursor.next();
		expect(token).toEqual(expected);
		expect(cursor).toMatchObject({
			position: 4,
			operations: 2,
			workUnits: 6 + initial.workUnits + retry.workUnits,
			issueCount: initial.issueCount + retry.issueCount,
			closed: false,
		});
		expect(htmlTokenCursorWindowDiagnostic(token)).toBeUndefined();
		expect(htmlTokenCursorWindowDiagnostic(cursor)).toBeUndefined();
	});

	it.each([
		["script", false],
		["title", true],
		["textarea", true],
		[privateRawName, false],
	] as const)(
		"attributes bounded raw %s without publishing the name",
		(name, entities) => {
			const prefix = `<${name}>`;
			const window = prefix.length + 8;
			const source = `${prefix}${"x".repeat(window + 1)}${privateMarker}</${name}>`;
			const delivered = vi.fn();
			const initial = new HtmlTokenizer(source.slice(0, window), delivered);
			initial.setBoundary(window);
			const start = initial.next();
			expect(start).toMatchObject({ kind: "start", name });
			const raw = new HtmlTokenizer(
				source.slice(prefix.length, prefix.length + window),
				delivered,
			);
			raw.setBoundary(window);
			expect(raw.raw(name, entities)).toBeUndefined();
			expect(raw.paused).toBe(true);
			expect(raw.position).toBe(0);
			const cursor = cursorFor(
				source,
				{ maxWindowCodeUnits: window },
				delivered,
			);
			expect(cursor.next()).toEqual(start);
			const error = captureError(() => cursor.raw(name, entities));
			expectWindow(error, "raw", prefix.length, window);
			expectStopped(cursor, {
				position: prefix.length,
				operations: 2,
				workUnits: 2 * window + initial.workUnits + raw.workUnits,
				issueCount: initial.issueCount + raw.issueCount,
			});
			expect(delivered).not.toHaveBeenCalled();
		},
	);

	it("attributes raw closing-prefix lookahead refusal at zero", () => {
		const source = "abc</script>tail";
		const native = new HtmlTokenizer(source.slice(0, 11), () => {});
		native.setBoundary(11);
		expect(native.raw("script")).toBeUndefined();
		expect(native.paused).toBe(true);
		const cursor = cursorFor(source, { maxWindowCodeUnits: 11 });
		expectWindow(
			captureError(() => cursor.raw("script")),
			"raw",
			0,
			11,
		);
		expectStopped(cursor, {
			position: 0,
			operations: 1,
			workUnits: 11 + native.workUnits,
			issueCount: native.issueCount,
		});
		const exact = cursorFor(source, { maxWindowCodeUnits: 12 });
		expect(exact.raw("script")).toBe("abc");
		expect(exact).toMatchObject({
			position: 3,
			operations: 1,
			workUnits: 15,
			issueCount: 0,
			closed: false,
		});
		expect(htmlTokenCursorWindowDiagnostic(exact)).toBeUndefined();
	});

	it.each([false, true])(
		"retains remainder's actual remaining count after prefix=%s",
		(withPrefix) => {
			const prefix = withPrefix ? "<p>😀" : "";
			const remaining = `<b>${privateMarker}`;
			const source = prefix + remaining;
			const window = 8;
			const cursor = cursorFor(source, { maxWindowCodeUnits: window });
			let workUnits = 0;
			if (withPrefix) {
				const native = new HtmlTokenizer(source.slice(0, window), () => {});
				native.setBoundary(window);
				for (let index = 0; index < 2; index++)
					expect(cursor.next()).toEqual(native.next());
				expect(cursor.position).toBe(5);
				expect(Buffer.byteLength(prefix)).toBe(7);
				workUnits = window + native.workUnits;
			}
			const before = cursor.workUnits;
			expectWindow(
				captureError(() => cursor.remainder()),
				"remainder",
				prefix.length,
				window,
				remaining.length,
			);
			expect(cursor.workUnits).toBe(before);
			expectStopped(cursor, {
				position: prefix.length,
				operations: withPrefix ? 3 : 1,
				workUnits,
				issueCount: 0,
			});
		},
	);

	it("keeps the default 65536-unit window and 65537 observation", () => {
		const window = 65_536;
		const source = `<p title='${"x".repeat(window)}'>`;
		const native = new HtmlTokenizer(source.slice(0, window), () => {});
		native.setBoundary(window);
		expect(native.next()).toBeUndefined();
		expect(native.paused).toBe(true);
		const cursor = cursorFor(source);
		expectWindow(
			captureError(() => cursor.next()),
			"next",
			0,
			window,
			65_537,
		);
		expectStopped(cursor, {
			position: 0,
			operations: 1,
			workUnits: window + native.workUnits,
			issueCount: 0,
		});
	});

	it.each(["next", "raw", "remainder"] as const)(
		"keeps exact-boundary %s success and EOF unbranded",
		(operation) => {
			const source =
				operation === "next"
					? "<p>"
					: operation === "raw"
						? "abc</script>"
						: "😀x";
			const cursor = cursorFor(source, { maxWindowCodeUnits: source.length });
			const native = new HtmlTokenizer(source, () => {});
			const first =
				operation === "raw" ? cursor.raw("script") : cursor[operation]();
			const expected =
				operation === "raw" ? native.raw("script") : native[operation]();
			expect(first).toEqual(expected);
			expect(htmlTokenCursorWindowDiagnostic(first)).toBeUndefined();
			if (operation === "raw") expect(cursor.next()).toEqual(native.next());
			expect(cursor.position).toBe(source.length);
			expect(cursor.next()).toBeUndefined();
			expect(native.next()).toBeUndefined();
			expect(cursor.workUnits).toBe(source.length + native.workUnits);
			expect(cursor.operations).toBe(operation === "raw" ? 3 : 2);
			expect(cursor.issueCount).toBe(0);
			expect(cursor.closed).toBe(false);
			const committedWork = cursor.workUnits;
			expect(cursor.remainder()).toBe("");
			expect(cursor.workUnits).toBe(committedWork);
			expect(cursor.position).toBe(source.length);
			expect(cursor.operations).toBe(operation === "raw" ? 4 : 3);
			expect(htmlTokenCursorWindowDiagnostic(cursor)).toBeUndefined();
			expect(Object.hasOwn(cursor, "windowDiagnostic")).toBe(false);
			const reducedWindow = source.length - 1;
			const rejected = cursorFor(source, { maxWindowCodeUnits: reducedWindow });
			let rejectedWork = 0;
			if (operation !== "remainder") {
				const bounded = new HtmlTokenizer(
					source.slice(0, reducedWindow),
					() => {},
				);
				bounded.setBoundary(reducedWindow);
				expect(
					operation === "raw" ? bounded.raw("script") : bounded.next(),
				).toBeUndefined();
				expect(bounded.paused).toBe(true);
				rejectedWork = reducedWindow + bounded.workUnits;
			}
			const error = captureError(() =>
				operation === "raw" ? rejected.raw("script") : rejected[operation](),
			);
			expectWindow(error, operation, 0, reducedWindow, source.length);
			expectStopped(rejected, {
				position: 0,
				operations: 1,
				workUnits: rejectedWork,
				issueCount: 0,
			});
		},
	);

	it("does not turn genuine unterminated raw EOF into a window failure", () => {
		const delivered: string[] = [];
		const cursor = cursorFor("abc", { maxWindowCodeUnits: 3 }, (code) =>
			delivered.push(code),
		);
		expect(cursor.raw("title", true)).toBe("abc");
		expect(cursor.next()).toBeUndefined();
		expect(delivered).toEqual(["unterminated-raw-element"]);
		expect(cursor).toMatchObject({
			position: 3,
			operations: 2,
			workUnits: 6,
			issueCount: 1,
			closed: false,
		});
		expect(htmlTokenCursorWindowDiagnostic(cursor)).toBeUndefined();
	});

	it.each(["source", "work", "operations", "issues"] as const)(
		"leaves genuine %s resource failures unbranded",
		(kind) => {
			let error: unknown;
			if (kind === "source") {
				error = captureError(() =>
					cursorFor("abcd", { maxSourceCodeUnits: 3 }),
				);
				expectLimit(error, {
					kind: "html.cursor-source",
					unit: "code-units",
					limit: 3,
					observed: 4,
				});
			} else {
				const cursor =
					kind === "work"
						? cursorFor("abcd", { maxWorkUnits: 3 })
						: kind === "operations"
							? cursorFor("", { maxOperations: 1 })
							: cursorFor("<p a a>", { maxIssues: 0 });
				if (kind === "operations") expect(cursor.next()).toBeUndefined();
				error = captureError(() => cursor.next());
				expectLimit(
					error,
					kind === "work"
						? {
								kind: "html.cursor-work",
								unit: "code-units",
								limit: 3,
								observed: 4,
							}
						: kind === "operations"
							? {
									kind: "html.cursor-operations",
									unit: "operations",
									limit: 1,
									observed: 2,
								}
							: { kind: "html.issues", unit: "issues", limit: 0, observed: 1 },
				);
				expect(cursor.position).toBe(0);
				expectClosed(cursor);
			}
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
		},
	);

	it.each(["invalid-input", "unsupported"] as const)(
		"does not relabel genuine %s errors",
		(code) => {
			const cursor = cursorFor(code === "unsupported" ? "<a@>" : "text");
			const error = captureError(() =>
				code === "unsupported" ? cursor.next() : cursor.raw("Script"),
			);
			expectCode(error, code);
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
			expect(cursor.position).toBe(0);
			expectClosed(cursor);
		},
	);

	for (const code of ["timeout", "aborted", "closed"] as const) {
		it.each(["next", "raw", "remainder"] as const)(
			`keeps earlier ${code} admission unbranded for %s`,
			(operation) => {
				let now = 1_000;
				vi.spyOn(performance, "now").mockImplementation(() => now);
				const controller = new AbortController();
				cleanup.push(() => controller.abort());
				const cursor = cursorFor(
					`<p title='${privateMarker}'>`,
					{ maxWindowCodeUnits: 8, timeoutMs: 10 },
					() => {},
					controller.signal,
				);
				if (code === "closed") cursor.close();
				else if (code === "aborted") controller.abort(new Error(privateMarker));
				if (code !== "closed") now += 10;
				const error = captureError(() =>
					operation === "raw" ? cursor.raw("script") : cursor[operation](),
				);
				expectCode(error, code);
				expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
				expect(resourceLimitDiagnostic(error)).toBeUndefined();
				expect((error as Error).message).not.toContain(privateMarker);
				expectStopped(cursor, {
					position: 0,
					operations: 0,
					workUnits: 0,
					issueCount: 0,
				});
			},
		);
	}

	it("does not brand externally created same-kind resource errors", () => {
		const error = resourceLimitError("html.cursor-window", 8, 9, windowMessage);
		expectLimit(error, {
			kind: "html.cursor-window",
			unit: "code-units",
			limit: 8,
			observed: 9,
		});
		expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
		const cursor = cursorFor("<p title='long-value'>", {
			maxWindowCodeUnits: 8,
		});
		const actual = captureError(() => cursor.next());
		expectWindow(actual, "next", 0, 8);
		expect(actual).not.toBe(error);
		expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
	});

	it.each(["next", "raw", "remainder"] as const)(
		"propagates injected tokenizer %s same-kind errors without branding",
		(operation) => {
			const failure = resourceLimitError(
				"html.cursor-window",
				3,
				4,
				privateMarker,
			);
			vi.spyOn(HtmlTokenizer.prototype, operation).mockImplementation(() => {
				throw failure;
			});
			const cursor = cursorFor("abc", { maxWindowCodeUnits: 3 });
			const error = captureError(() =>
				operation === "raw" ? cursor.raw("script") : cursor[operation](),
			);
			expect(error).toBe(failure);
			expectLimit(error, {
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 3,
				observed: 4,
			});
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
			expect(cursor.position).toBe(0);
			expectClosed(cursor);
		},
	);

	it("propagates an actual onIssue callback's same-kind error without branding", () => {
		const failure = resourceLimitError(
			"html.cursor-window",
			7,
			8,
			privateMarker,
		);
		const delivered = vi.fn(() => {
			throw failure;
		});
		const cursor = cursorFor("<p a a>", { maxIssues: 2 }, delivered);
		const error = captureError(() => cursor.next());
		expect(error).toBe(failure);
		expect(delivered).toHaveBeenCalledTimes(1);
		expect(delivered).toHaveBeenCalledWith("duplicate-attribute");
		expectLimit(error, {
			kind: "html.cursor-window",
			unit: "code-units",
			limit: 7,
			observed: 8,
		});
		expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
		expect(cursor).toMatchObject({
			position: 0,
			operations: 1,
			issueCount: 1,
			closed: true,
		});
		expectClosed(cursor);
	});

	it("preserves a different cursor's genuine raw-window origin through issue propagation", () => {
		const origin = cursorFor(`<title>${"x".repeat(12)}</title>`, {
			maxWindowCodeUnits: 8,
		});
		expect(origin.next()).toMatchObject({ kind: "start", name: "title" });
		const failure = captureError(() => origin.raw("title", true));
		const diagnostic = expectWindow(failure, "raw", 7, 8);
		expect(origin).toMatchObject({ position: 7, operations: 2, closed: true });
		const source = "😀<p a a>";
		const native = new HtmlTokenizer(source, () => {
			throw failure;
		});
		expect(native.next()).toEqual({ kind: "text", data: "😀" });
		expect(captureError(() => native.next())).toBe(failure);
		const delivered = vi.fn(() => {
			throw failure;
		});
		const receiving = cursorFor(
			source,
			{ maxWindowCodeUnits: source.length },
			delivered,
		);
		expect(receiving.next()).toEqual({ kind: "text", data: "😀" });
		const propagated = captureError(() => receiving.next());
		expect(propagated).toBe(failure);
		expect(htmlTokenCursorWindowDiagnostic(propagated)).toBe(diagnostic);
		expectWindow(propagated, "raw", 7, 8);
		expect(receiving.limits.maxWindowCodeUnits).toBe(9);
		expectStopped(receiving, {
			position: 2,
			operations: 2,
			workUnits: source.length + native.workUnits,
			issueCount: native.issueCount,
		});
		expect(delivered).toHaveBeenCalledTimes(1);
		expect(delivered).toHaveBeenCalledWith("duplicate-attribute");
		expect(htmlTokenCursorWindowDiagnostic(failure)).toBe(diagnostic);
	});

	it("owns separate stable immutable records for separate native window errors", () => {
		const first = cursorFor("<p title='long-value'>", {
			maxWindowCodeUnits: 8,
		});
		const firstError = captureError(() => first.next());
		const firstDiagnostic = expectWindow(firstError, "next", 0, 8);
		const second = cursorFor(`${privateMarker}<p>`, { maxWindowCodeUnits: 8 });
		const secondError = captureError(() => second.remainder());
		const secondDiagnostic = expectWindow(
			secondError,
			"remainder",
			0,
			8,
			privateMarker.length + 3,
		);
		expect(firstError).not.toBe(secondError);
		expect(firstDiagnostic).not.toBe(secondDiagnostic);
		first.close();
		second.close();
		expect(htmlTokenCursorWindowDiagnostic(firstError)).toBe(firstDiagnostic);
		expect(htmlTokenCursorWindowDiagnostic(secondError)).toBe(secondDiagnostic);
		expect(htmlTokenCursorWindowDiagnostic(firstDiagnostic)).toBeUndefined();
		expect(
			htmlTokenCursorWindowDiagnostic(resourceLimitDiagnostic(firstError)),
		).toBeUndefined();
		expect(resourceLimitDiagnostic(firstDiagnostic)).toBeUndefined();
	});

	it("rejects forged and hostile getter inputs without inspection or coercion", () => {
		const cursor = cursorFor("<p title='long-value'>", {
			maxWindowCodeUnits: 8,
		});
		const error = captureError(() => cursor.next());
		const diagnostic = expectWindow(error, "next", 0, 8);
		const before = Object.getOwnPropertyDescriptors(error);
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const callable = vi.fn(trap);
		const accessors = Object.defineProperties(
			{},
			{
				code: { get: trap },
				message: { get: trap },
				cause: { get: trap },
				toJSON: { get: trap },
				[Symbol.toPrimitive]: { get: trap },
			},
		);
		const traps = {
			get: trap,
			has: trap,
			ownKeys: trap,
			getPrototypeOf: trap,
			getOwnPropertyDescriptor: trap,
			isExtensible: trap,
		};
		const revoked = Proxy.revocable(error as object, traps);
		revoked.revoke();
		for (const value of [
			undefined,
			null,
			false,
			true,
			0,
			-0,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			1n,
			Symbol("untrusted"),
			privateMarker,
			{},
			Object.create(null),
			callable,
			accessors,
			diagnostic,
			{ ...diagnostic },
			{ ...(error as object) },
			JSON.parse(JSON.stringify(error)),
			new AgentBrowserError("resource-limit", windowMessage),
			Object.create(error as object),
			Object.assign(new Error("wrapped"), { cause: error }),
			{
				code: "resource-limit",
				windowDiagnostic: diagnostic,
				resourceLimit: resourceLimitDiagnostic(error),
			},
			new Proxy({}, traps),
			new Proxy(error as object, traps),
			new Proxy(callable, { ...traps, apply: trap }),
			revoked.proxy,
		])
			expect(htmlTokenCursorWindowDiagnostic(value)).toBeUndefined();
		expect(trap).not.toHaveBeenCalled();
		expect(callable).not.toHaveBeenCalled();
		expect(Object.getOwnPropertyDescriptors(error)).toEqual(before);
		expect(htmlTokenCursorWindowDiagnostic(error)).toBe(diagnostic);
	});
});

describe("bounded native raw discard steps", () => {
	type RawName = Parameters<HtmlTokenCursor["discardRawStep"]>[0];
	const names = [
		"script",
		"style",
		"xmp",
		"iframe",
		"noembed",
		"noframes",
	] as const;
	const windows = [16, 17, 32, 65_536] as const;

	function compareDiscard(
		source: string,
		name: RawName,
		window: number,
		end: number,
		status: "end-tag" | "eof" = "end-tag",
	) {
		const nativeIssues: string[] = [];
		const cursorIssues: string[] = [];
		const native = new HtmlTokenizer(source, (code) => nativeIssues.push(code));
		expect(native.raw(name, false)).toBe(source.slice(0, end));
		expect(native.position).toBe(end);
		const cursor = cursorFor(source, { maxWindowCodeUnits: window }, (code) =>
			cursorIssues.push(code),
		);
		let discarded = 0;
		for (let attempt = 0; attempt <= Math.ceil(source.length / 6); attempt++) {
			const before = cursor.position;
			const work = cursor.workUnits;
			const length = Math.min(window, source.length - before);
			const result = cursor.discardRawStep(name);
			expect(Reflect.ownKeys(result).sort()).toEqual([
				"discardedCodeUnits",
				"position",
				"status",
			]);
			expect(Object.isFrozen(result)).toBe(true);
			expect(result.position).toBe(cursor.position);
			expect(result.discardedCodeUnits).toBe(cursor.position - before);
			expect(result.discardedCodeUnits).toBeGreaterThanOrEqual(0);
			expect(result.discardedCodeUnits).toBeLessThanOrEqual(length);
			expect(cursor.operations).toBe(attempt + 1);
			expect(cursor.workUnits - work).toBeGreaterThanOrEqual(length);
			expect(cursor.workUnits - work).toBeLessThanOrEqual(25 * length + 2);
			expect(cursor.closed).toBe(false);
			discarded += result.discardedCodeUnits;
			if (result.status === "more") {
				expect(source.length - before).toBeGreaterThan(window);
				expect(result.discardedCodeUnits).toBeGreaterThanOrEqual(window - 10);
				expect(cursorIssues).toEqual([]);
				expect(cursor.issueCount).toBe(0);
				continue;
			}
			expect(result.status).toBe(status);
			expect(discarded).toBe(end);
			expect(cursor.position).toBe(native.position);
			expect(cursorIssues).toEqual(nativeIssues);
			expect(cursorIssues).toEqual(
				status === "eof" ? ["unterminated-raw-element"] : [],
			);
			expect(cursor.issueCount).toBe(native.issueCount);
			expect(cursor.next()).toEqual(native.next());
			expect(cursor.position).toBe(native.position);
			expect(cursorIssues).toEqual(nativeIssues);
			return;
		}
		throw new Error("Synthetic raw discard did not terminate");
	}

	for (const name of names) {
		for (const window of windows) {
			it(`matches native ${name} across window ${window} prefix shifts`, () => {
				for (const shift of [-1, 0, 1]) {
					const body = "a".repeat(window - 10 + shift);
					compareDiscard(
						`${body}</${name.toUpperCase()}>tail`,
						name,
						window,
						body.length,
					);
				}
				const body = `</${name}x></${name}\u000b>\0&amp;😀\ud800<!--quoted '"'>`;
				compareDiscard(`${body}</${name}>tail`, name, window, body.length);
			});
		}

		it(`recognizes every native closing delimiter for ${name}`, () => {
			for (const delimiter of ["\t", "\n", "\f", "\r", " ", "/", ">"])
				compareDiscard(
					`abc</${name}${delimiter}${delimiter === ">" ? "" : ">"}tail`,
					name,
					16,
					3,
				);
		});
	}

	for (const window of windows) {
		it(`preserves script phases and dash carry with window ${window}`, () => {
			const bodies = [
				"<!--escaped",
				"<!--<ScRiPt>double</sCrIpT>escaped",
				"<!--<script>double-->data",
				"<!--<script/>double</script/>escaped",
				"<!--<scriptx>not-double",
				"<!--<script>--!>still-double</script>escaped",
				"<!--<script>inner</scriptx>still-double</script>escaped",
			];
			for (let shift = 0; shift <= (window === 65_536 ? 0 : 12); shift++) {
				for (const body of bodies) {
					const prefix = "a".repeat(window - 10 + shift);
					const payload = prefix + body;
					compareDiscard(
						`${payload}</script>tail`,
						"script",
						window,
						payload.length,
					);
				}
			}
		});

		it(`distinguishes genuine EOF from window ${window} boundaries`, () => {
			for (const name of names) {
				for (const source of [
					"",
					"a".repeat(window),
					"a".repeat(window + 1),
					`</${name}`,
				])
					compareDiscard(source, name, window, source.length, "eof");
				compareDiscard(`</${name}>`, name, window, 0);
			}
		});
	}

	it("retains local-zero and local-one dash carry and the legacy double reset", () => {
		for (const body of [
			"<!----><script>",
			"<!--x--><script>",
			"<!--<script></script>",
			"<!--<script>--><script>",
		])
			compareDiscard(`${body}</script>`, "script", 16, body.length);
		for (const fixture of [
			{ source: "<!----><script></script>", secondWork: 54 },
			{ source: "<!--x--><script></script>", secondWork: 51 },
		]) {
			const cursor = cursorFor(fixture.source, { maxWindowCodeUnits: 16 });
			expect(cursor.discardRawStep("script")).toEqual({
				status: "more",
				position: 6,
				discardedCodeUnits: 6,
			});
			expect(cursor.workUnits).toBe(25);
			expect(cursor.discardRawStep("script")).toEqual({
				status: "more",
				position: 12,
				discardedCodeUnits: 6,
			});
			expect(cursor.workUnits).toBe(25 + fixture.secondWork);
		}
	});

	it("counts UTF16 units even when a surrogate pair straddles the committed boundary", () => {
		const cursor = cursorFor(`aaaaa😀${"b".repeat(20)}</style>`, {
			maxWindowCodeUnits: 16,
		});
		expect(cursor.discardRawStep("style")).toEqual({
			status: "more",
			position: 6,
			discardedCodeUnits: 6,
		});
		const body = `aaaaa😀${"b".repeat(20)}`;
		compareDiscard(`${body}</style>`, "style", 16, 27);
	});

	it("returns only immutable metadata and does not accept caller state", () => {
		const cursor = cursorFor(`${"a".repeat(30)}</style>`, {
			maxWindowCodeUnits: 16,
		});
		const first = cursor.discardRawStep("style");
		expect(first).toEqual({
			status: "more",
			position: 6,
			discardedCodeUnits: 6,
		});
		expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
		for (const key of Reflect.ownKeys(first)) {
			expect(Object.getOwnPropertyDescriptor(first, key)).toMatchObject({
				writable: false,
				configurable: false,
				enumerable: true,
			});
			expect(Reflect.set(first, key, "payload")).toBe(false);
		}
		expect(Reflect.set(first, "state", "double")).toBe(false);
		const second = cursor.discardRawStep("style");
		expect(second).not.toBe(first);
		expect(second).toEqual({
			status: "more",
			position: 12,
			discardedCodeUnits: 6,
		});
		expect(first).toEqual({
			status: "more",
			position: 6,
			discardedCodeUnits: 6,
		});
	});

	it("discards a cached ordinary window and reports absolute positions after next", () => {
		const source = `<style>${"a".repeat(20)}</style>tail`;
		const native = new HtmlTokenizer(source, () => {});
		const cursor = cursorFor(source, { maxWindowCodeUnits: 16 });
		expect(cursor.next()).toEqual(native.next());
		expect(native.raw("style")).toBe("a".repeat(20));
		expect(cursor.discardRawStep("style")).toEqual({
			status: "more",
			position: 13,
			discardedCodeUnits: 6,
		});
		expect(cursor.discardRawStep("style")).toEqual({
			status: "more",
			position: 19,
			discardedCodeUnits: 6,
		});
		expect(cursor.discardRawStep("style")).toEqual({
			status: "more",
			position: 25,
			discardedCodeUnits: 6,
		});
		expect(cursor.discardRawStep("style")).toEqual({
			status: "end-tag",
			position: 27,
			discardedCodeUnits: 2,
		});
		expect(cursor.operations).toBe(5);
		expect(cursor.next()).toEqual(native.next());
		expect(cursor.position).toBe(native.position);
	});

	it("clears terminal state and treats later discards as fresh operations", () => {
		const issues: string[] = [];
		const cursor = cursorFor("</style>tail</xmp>", {}, (code) =>
			issues.push(code),
		);
		expect(cursor.discardRawStep("style").position).toBe(0);
		expect(cursor.discardRawStep("style").position).toBe(0);
		expect(cursor.next()).toMatchObject({ kind: "end", name: "style" });
		expect(cursor.discardRawStep("xmp")).toEqual({
			status: "end-tag",
			position: 12,
			discardedCodeUnits: 4,
		});
		expect(cursor.next()).toMatchObject({ kind: "end", name: "xmp" });
		for (const name of ["script", "style"] as const)
			expect(cursor.discardRawStep(name)).toEqual({
				status: "eof",
				position: 18,
				discardedCodeUnits: 0,
			});
		expect(cursor.operations).toBe(7);
		expect(cursor.issueCount).toBe(2);
		expect(issues).toEqual([
			"unterminated-raw-element",
			"unterminated-raw-element",
		]);
		expect(cursor.remainder()).toBe("");
	});

	it("leaves malformed closing tokens for next rather than validating them", () => {
		const issues: string[] = [];
		const cursor = cursorFor("abc</style a", {}, (code) => issues.push(code));
		expect(cursor.discardRawStep("style")).toEqual({
			status: "end-tag",
			position: 3,
			discardedCodeUnits: 3,
		});
		expect(issues).toEqual([]);
		const nativeIssues: string[] = [];
		const native = new HtmlTokenizer("abc</style a", (code) =>
			nativeIssues.push(code),
		);
		native.raw("style");
		expect(cursor.next()).toEqual(native.next());
		expect(issues).toEqual(nativeIssues);
		expect(issues.length).toBeGreaterThan(0);
	});

	it("allows a later genuine next window refusal with its unchanged attribution", () => {
		const cursor = cursorFor(`abc</style ${"a".repeat(30)}>`, {
			maxWindowCodeUnits: 16,
		});
		expect(cursor.discardRawStep("style").status).toBe("end-tag");
		const error = captureError(() => cursor.next());
		expectLimit(error, {
			kind: "html.cursor-window",
			unit: "code-units",
			limit: 16,
			observed: 17,
		});
		expect(htmlTokenCursorWindowDiagnostic(error)).toEqual({
			kind: "html-cursor-window",
			operation: "next",
			position: 3,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(cursor.position).toBe(3);
		expectClosed(cursor);
	});

	it.each(["title", "textarea"] as const)(
		"preserves legacy %s entity mode and window refusal",
		(name) => {
			const issues: string[] = [];
			const source = `&amp;&#0;</${name}>`;
			const nativeIssues: string[] = [];
			const native = new HtmlTokenizer(source, (code) =>
				nativeIssues.push(code),
			);
			const short = cursorFor(source, {}, (code) => issues.push(code));
			expect(short.raw(name, true)).toBe(native.raw(name, true));
			expect(issues).toEqual(nativeIssues);
			expect(issues.length).toBeGreaterThan(0);
			const long = cursorFor(`${"a".repeat(20)}</${name}>`, {
				maxWindowCodeUnits: 16,
			});
			const error = captureError(() => long.raw(name, true));
			expectLimit(error, {
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 16,
				observed: 17,
			});
			expect(htmlTokenCursorWindowDiagnostic(error)?.operation).toBe("raw");
			expect(long.position).toBe(0);
			expectClosed(long);
		},
	);

	it("rejects wrong names, types and arity without coercion or work", () => {
		const trap = vi.fn((): never => {
			throw new Error("Unexpected coercion");
		});
		const accessor = Object.defineProperty({}, Symbol.toPrimitive, {
			get: trap,
		});
		const proxy = new Proxy(
			{},
			{ get: trap, getPrototypeOf: trap, ownKeys: trap },
		);
		const revoked = Proxy.revocable({}, {});
		revoked.revoke();
		const invalid: unknown[][] = [
			[],
			[undefined],
			[null],
			[0],
			[true],
			[Symbol("script")],
			[""],
			["SCRIPT"],
			["Style"],
			["script "],
			["title"],
			["textarea"],
			["plaintext"],
			["noscript"],
			[new String("script")],
			[accessor],
			[proxy],
			[revoked.proxy],
			["script", undefined],
			["script", false],
			["script", {}],
		];
		for (const args of invalid) {
			const cursor = cursorFor("</script>");
			const error = captureError(() =>
				Reflect.apply(cursor.discardRawStep, cursor, args),
			);
			expectCode(error, "invalid-input");
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
			expect(cursor.position).toBe(0);
			expect(cursor.operations).toBe(1);
			expect(cursor.workUnits).toBe(0);
			expectClosed(cursor);
		}
		expect(trap).not.toHaveBeenCalled();
	});

	it("rejects every window below sixteen even for empty input without window branding", () => {
		for (let window = 1; window < 16; window++) {
			const cursor = cursorFor("", { maxWindowCodeUnits: window });
			const error = captureError(() => cursor.discardRawStep("style"));
			expectCode(error, "invalid-input");
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
			expect(cursor.operations).toBe(1);
			expect(cursor.issueCount).toBe(0);
			expect(cursor.workUnits).toBe(0);
			expect(cursor.position).toBe(0);
			expectClosed(cursor);
		}
	});

	it("uses immutable option snapshots and the unchanged default limits", () => {
		const options = { maxWindowCodeUnits: 16 };
		const cursor = cursorFor(`${"a".repeat(30)}</style>`, options);
		options.maxWindowCodeUnits = 1;
		expect(cursor.discardRawStep("style").position).toBe(6);
		expect(cursor.limits.maxWindowCodeUnits).toBe(16);
		expect(Object.isFrozen(cursor.limits)).toBe(true);
		const defaults = cursorFor("</style>");
		expect(defaults.limits).toEqual(canonicalLimits);
		expect(defaults.discardRawStep("style")).toEqual({
			status: "end-tag",
			position: 0,
			discardedCodeUnits: 0,
		});
		const getter = vi.fn(() => 16);
		const hostile = Object.defineProperty({}, "maxWindowCodeUnits", {
			get: getter,
		});
		expectCode(
			captureError(() => cursorFor("", hostile)),
			"invalid-input",
		);
		expect(getter).not.toHaveBeenCalled();
	});

	it.each([
		"next",
		"raw",
		"remainder",
		"changed-name",
		"extra-argument",
	] as const)(
		"fails closed without committing when an active session receives %s",
		(method) => {
			const cursor = cursorFor(`${"a".repeat(30)}</style>`, {
				maxWindowCodeUnits: 16,
			});
			cursor.discardRawStep("style");
			const work = cursor.workUnits;
			const error = captureError(() => {
				if (method === "raw") return cursor.raw("style");
				if (method === "changed-name") return cursor.discardRawStep("script");
				if (method === "extra-argument")
					return Reflect.apply(cursor.discardRawStep, cursor, [
						"style",
						undefined,
					]);
				return cursor[method]();
			});
			expectCode(error, "invalid-input");
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
			expect(cursor.position).toBe(6);
			expect(cursor.operations).toBe(2);
			expect(cursor.workUnits).toBe(work);
			expectClosed(cursor);
		},
	);

	it("closes an active session idempotently and rejects further steps before charging", () => {
		const cursor = cursorFor("a".repeat(30), { maxWindowCodeUnits: 16 });
		cursor.discardRawStep("style");
		const work = cursor.workUnits;
		cursor.close();
		cursor.close();
		expectCode(
			captureError(() => cursor.discardRawStep("style")),
			"closed",
		);
		expect(cursor.operations).toBe(1);
		expect(cursor.position).toBe(6);
		expect(cursor.workUnits).toBe(work);
		expectClosed(cursor);
	});

	it("shares the original operation budget across successful steps and terminal calls", () => {
		const cursor = cursorFor("a".repeat(30), {
			maxWindowCodeUnits: 16,
			maxOperations: 2,
		});
		cursor.discardRawStep("style");
		cursor.discardRawStep("style");
		const work = cursor.workUnits;
		const error = captureError(() => cursor.discardRawStep("style"));
		expectLimit(error, {
			kind: "html.cursor-operations",
			unit: "operations",
			limit: 2,
			observed: 3,
		});
		expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
		expect(cursor.operations).toBe(3);
		expect(cursor.workUnits).toBe(work);
		expect(cursor.position).toBe(12);
		expectClosed(cursor);
		const empty = cursorFor("", { maxOperations: 1 });
		empty.discardRawStep("style");
		expectLimit(
			captureError(() => empty.discardRawStep("style")),
			{
				kind: "html.cursor-operations",
				unit: "operations",
				limit: 1,
				observed: 2,
			},
		);
		expect(empty.issueCount).toBe(1);
	});

	it.each([
		{
			label: "style overlap",
			name: "style",
			source: "a".repeat(30),
			work: 24,
			position: 6,
			status: "more",
		},
		{
			label: "script overlap",
			name: "script",
			source: "a".repeat(30),
			work: 48,
			position: 6,
			status: "more",
		},
		{
			label: "immediate style",
			name: "style",
			source: "</style>",
			work: 17,
			position: 0,
			status: "end-tag",
		},
		{
			label: "immediate script",
			name: "script",
			source: "</script>",
			work: 23,
			position: 0,
			status: "end-tag",
		},
		{
			label: "empty EOF",
			name: "style",
			source: "",
			work: 0,
			position: 0,
			status: "eof",
		},
		{
			label: "short style prefix",
			name: "style",
			source: "<",
			work: 10,
			position: 1,
			status: "eof",
		},
		{
			label: "short script prefix",
			name: "script",
			source: "<",
			work: 15,
			position: 1,
			status: "eof",
		},
		{
			label: "script comment jump",
			name: "script",
			source: "<!--",
			work: 9,
			position: 4,
			status: "eof",
		},
		{
			label: "script double-open and lookbehind",
			name: "script",
			source: "<!--<script>",
			work: 38,
			position: 12,
			status: "eof",
		},
	] as const)(
		"charges exact copy, dispatch, prefix and carry work for $label",
		({ name, source, work, position, status }) => {
			const cursor = cursorFor(source, {
				maxWindowCodeUnits: 16,
				maxWorkUnits: Math.max(1, work),
			});
			expect(cursor.discardRawStep(name)).toEqual({
				status,
				position,
				discardedCodeUnits: position,
			});
			expect(cursor.workUnits).toBe(work);
			expect(cursor.operations).toBe(1);
			expect(cursor.issueCount).toBe(status === "eof" ? 1 : 0);
			expect(cursor.closed).toBe(false);
		},
	);

	it.each([
		{
			label: "copy",
			name: "style",
			source: "a".repeat(30),
			limit: 15,
			observed: 16,
		},
		{
			label: "dispatch",
			name: "style",
			source: "a".repeat(30),
			limit: 16,
			observed: 17,
		},
		{
			label: "carry",
			name: "style",
			source: "a".repeat(30),
			limit: 23,
			observed: 24,
		},
		{
			label: "comment probe",
			name: "script",
			source: "a".repeat(30),
			limit: 20,
			observed: 21,
		},
		{
			label: "full failed short-prefix width",
			name: "style",
			source: "<",
			limit: 9,
			observed: 10,
		},
		{
			label: "successful close probe",
			name: "script",
			source: "</script>",
			limit: 22,
			observed: 23,
		},
	] as const)(
		"retains the failed $label debit without publishing tentative progress",
		({ name, source, limit, observed }) => {
			const onIssue = vi.fn();
			const cursor = cursorFor(
				source,
				{ maxWindowCodeUnits: 16, maxWorkUnits: limit },
				onIssue,
			);
			const error = captureError(() => cursor.discardRawStep(name));
			expectLimit(error, {
				kind: "html.cursor-work",
				unit: "code-units",
				limit,
				observed,
			});
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
			expect(cursor.workUnits).toBe(observed);
			expect(cursor.position).toBe(0);
			expect(cursor.operations).toBe(1);
			expect(cursor.issueCount).toBe(0);
			expect(onIssue).not.toHaveBeenCalled();
			expectClosed(cursor);
		},
	);

	it("charges overlap again and retains failed recopy work after a committed step", () => {
		const source = `${"a".repeat(30)}</style>`;
		const accepted = cursorFor(source, {
			maxWindowCodeUnits: 16,
			maxWorkUnits: 48,
		});
		accepted.discardRawStep("style");
		expect(accepted.workUnits).toBe(24);
		accepted.discardRawStep("style");
		expect(accepted.workUnits).toBe(48);
		expect(accepted.position).toBe(12);
		const cursor = cursorFor(source, {
			maxWindowCodeUnits: 16,
			maxWorkUnits: 24,
		});
		cursor.discardRawStep("style");
		const error = captureError(() => cursor.discardRawStep("style"));
		expectLimit(error, {
			kind: "html.cursor-work",
			unit: "code-units",
			limit: 24,
			observed: 40,
		});
		expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
		expect(cursor.position).toBe(6);
		expect(cursor.workUnits).toBe(40);
		expect(cursor.operations).toBe(2);
		expectClosed(cursor);
	});

	it("enforces issue quota before delivery and shares accepted EOF issues", () => {
		const denied = vi.fn();
		const cursor = cursorFor(
			"a".repeat(17),
			{ maxWindowCodeUnits: 16, maxIssues: 0 },
			denied,
		);
		cursor.discardRawStep("style");
		const error = captureError(() => cursor.discardRawStep("style"));
		expectLimit(error, {
			kind: "html.issues",
			unit: "issues",
			limit: 0,
			observed: 1,
		});
		expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
		expect(cursor.position).toBe(6);
		expect(cursor.issueCount).toBe(1);
		expect(cursor.workUnits).toBe(46);
		expect(denied).not.toHaveBeenCalled();
		expectClosed(cursor);
		const accepted = vi.fn();
		const empty = cursorFor("", { maxIssues: 1 }, accepted);
		empty.discardRawStep("style");
		expectLimit(
			captureError(() => empty.discardRawStep("script")),
			{ kind: "html.issues", unit: "issues", limit: 1, observed: 2 },
		);
		expect(empty.issueCount).toBe(2);
		expect(accepted).toHaveBeenCalledTimes(1);
		expect(accepted).toHaveBeenCalledWith("unterminated-raw-element");
	});

	it.each(["throw", "reenter", "close", "abort", "expire"] as const)(
		"does not commit tentative EOF when its issue callback performs %s",
		(effect) => {
			let now = 100;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = new AbortController();
			const failure = new Error("Synthetic issue callback failure");
			const onIssue = vi.fn(() => {
				if (effect === "throw") throw failure;
				if (effect === "reenter")
					expectCode(
						captureError(() => cursor.discardRawStep("style")),
						"invalid-input",
					);
				if (effect === "close") cursor.close();
				if (effect === "abort") controller.abort();
				if (effect === "expire") now = 110;
			});
			const cursor = cursorFor(
				"a".repeat(17),
				{ maxWindowCodeUnits: 16, timeoutMs: 10 },
				onIssue,
				controller.signal,
			);
			cursor.discardRawStep("style");
			const error = captureError(() => cursor.discardRawStep("style"));
			if (effect === "throw") expect(error).toBe(failure);
			else
				expectCode(
					error,
					effect === "abort"
						? "aborted"
						: effect === "expire"
							? "timeout"
							: "closed",
				);
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
			expect(cursor.position).toBe(6);
			expect(cursor.operations).toBe(2);
			expect(cursor.workUnits).toBe(46);
			expect(cursor.issueCount).toBe(1);
			expect(onIssue).toHaveBeenCalledTimes(1);
			expect(onIssue).toHaveBeenCalledWith("unterminated-raw-element");
			expectClosed(cursor);
		},
	);

	it("preserves a genuine foreign window error without relabeling its origin", () => {
		const origin = cursorFor("<p>abcdef", { maxWindowCodeUnits: 3 });
		origin.next();
		const failure = captureError(() => origin.remainder());
		const diagnostic = htmlTokenCursorWindowDiagnostic(failure);
		expect(diagnostic).toEqual({
			kind: "html-cursor-window",
			operation: "remainder",
			position: 3,
			positionSemantics: "last-committed-source-utf16",
		});
		const cursor = cursorFor("a".repeat(17), { maxWindowCodeUnits: 16 }, () => {
			throw failure;
		});
		cursor.discardRawStep("style");
		expect(captureError(() => cursor.discardRawStep("style"))).toBe(failure);
		expect(htmlTokenCursorWindowDiagnostic(failure)).toBe(diagnostic);
		expect(cursor.position).toBe(6);
		expect(cursor.issueCount).toBe(1);
		expectClosed(cursor);
	});

	it.each(["abort", "deadline"] as const)(
		"preserves the original %s across steps",
		(effect) => {
			let now = 100;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = new AbortController();
			const cursor = cursorFor(
				"a".repeat(30),
				{ maxWindowCodeUnits: 16, timeoutMs: 10 },
				() => {},
				controller.signal,
			);
			now = 109;
			cursor.discardRawStep("style");
			const work = cursor.workUnits;
			if (effect === "abort") controller.abort();
			else now = 110;
			const error = captureError(() => cursor.discardRawStep("style"));
			expectCode(error, effect === "abort" ? "aborted" : "timeout");
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
			expect(cursor.position).toBe(6);
			expect(cursor.operations).toBe(1);
			expect(cursor.workUnits).toBe(work);
			expectClosed(cursor);
		},
	);
});
